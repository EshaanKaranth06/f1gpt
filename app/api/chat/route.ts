export const runtime = "nodejs";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { TaskType } from "@google/generative-ai";
import { DataAPIClient } from "@datastax/astra-db-ts";
import { Message } from "ai";

// ─── Env ─────────────────────────────────────────────────────────────────────
const GEMINI_API_KEY   = process.env.GEMINI_API_KEY!;
const GEMINI_MODEL     = "gemini-2.5-flash";
const RERANKER_MODEL   = "gemini-2.5-flash-lite";

const ASTRA_DB_APPLICATION_TOKEN = process.env.ASTRA_DB_APPLICATION_TOKEN!;
const ASTRA_DB_API_ENDPOINT = process.env.ASTRA_DB_API_ENDPOINT!;
const ASTRA_DB_NAMESPACE = process.env.ASTRA_DB_NAMESPACE!;
const ASTRA_COLLECTION = "f1_gpt"; 

const EMBEDDING_DIM    = 1536; 

if (!GEMINI_API_KEY) throw new Error("Missing GEMINI_API_KEY");
if (!ASTRA_DB_API_ENDPOINT || !ASTRA_DB_APPLICATION_TOKEN || !ASTRA_DB_NAMESPACE) {
    throw new Error("Missing Astra DB environment variables.");
}

// ─── Clients ──────────────────────────────────────────────────────────────────
const astraClient = new DataAPIClient(ASTRA_DB_APPLICATION_TOKEN);
const db = astraClient.db(ASTRA_DB_API_ENDPOINT, {
    namespace: ASTRA_DB_NAMESPACE,
});
const collection = db.collection(ASTRA_COLLECTION);

const queryEmbedder = new GoogleGenerativeAIEmbeddings({
    apiKey: GEMINI_API_KEY,
    model: "gemini-embedding-2",
    taskType: TaskType.RETRIEVAL_QUERY,
});

// ─── Embedding cache ──────────────────────────────────────────────────────────
const embeddingCache = new Map<string, number[]>();
const CACHE_MAX_SIZE  = 200;

async function getEmbedding(text: string): Promise<number[]> {
    const key = text.trim().toLowerCase();
    if (embeddingCache.has(key)) return embeddingCache.get(key)!;

    let embedding = await queryEmbedder.embedQuery(text);

    if (embedding && embedding.length > EMBEDDING_DIM) {
        embedding = embedding.slice(0, EMBEDDING_DIM);
    }

    if (!embedding || embedding.length !== EMBEDDING_DIM) {
        throw new Error(`Invalid embedding dimension: got ${embedding?.length ?? 0}`);
    }

    if (embeddingCache.size >= CACHE_MAX_SIZE) {
        embeddingCache.delete(embeddingCache.keys().next().value!);
    }
    embeddingCache.set(key, embedding);
    return embedding;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
interface ErrorResponse { error: string; details?: string; }

function formatUTCDateTime(): string {
    return new Date().toISOString().replace("T", " ").slice(0, 19);
}

// ─── Route ────────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
    const currentDateTime = formatUTCDateTime();
    try {
        const body = await req.json();
        const { messages, user = "eshaan" } = body;
        
        if (!messages || !Array.isArray(messages)) {
            throw new Error("Invalid request: 'messages' must be an array");
        }

        const latestMessage = messages[messages.length - 1]?.content;
        if (!latestMessage) throw new Error("No user message found");

        // 🛡️ ENTERPRISE UPGRADE: Intent Bypassing
        // Checks if the message is 3 words or less AND starts with a common greeting
        const isConversational = latestMessage.trim().split(/\s+/).length <= 3 && 
            /^(hi|hello|hey|thanks|thank you|who are you|help)\b/i.test(latestMessage.trim());

        interface RawDoc { content: string; title: string; similarity: number; rerankScore?: number; }
        
        // Declare these outside the 'if' block so Step 3 can still see them!
        let candidateDocs: RawDoc[] = [];
        let relevantDocuments: RawDoc[] = [];

        // Only run the heavy RAG machinery if it's NOT a simple greeting
        if (!isConversational) {
            
            // ── Step 1: Astra DB Retrieval ───────────────────────────────────────
            try {
                const embedding = await getEmbedding(latestMessage);

                const astraResults = await collection.find(
                    {}, 
                    {
                        sort: { $vector: embedding },
                        limit: 30,
                        includeSimilarity: true,
                    }
                ).toArray();

                candidateDocs = astraResults.map((hit: any) => ({
                    content: (hit.text || hit.content || "").trim(),
                    title: hit.title || "Unknown Source",
                    similarity: (hit.$similarity ?? 1) * (hit.sourceWeight ?? 1.0),
                }));
                
            } catch (error) {
                console.error(`[${currentDateTime}] Search error:`, error);
                candidateDocs = [];
            }

            // ── Step 2: Enterprise Rerank with Structured Outputs ─────────────────
            if (candidateDocs.length > 0) {
                try {
                    const rerankPrompt = `You are a strict relevance judge for a Formula 1 database.
Given the user query, score each chunk from 0-10 on how directly it answers the query. 
If the chunk is unrelated to the query, score it 0.

Query: "${latestMessage}"

Chunks:
${candidateDocs.map((doc, i) => `[${i}] (${doc.title}) ${doc.content.slice(0, 300)}`).join("\n\n")}`;

                    const rerankRes = await fetch(
                        `https://generativelanguage.googleapis.com/v1beta/models/${RERANKER_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
                        {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                contents: [{ role: "user", parts: [{ text: rerankPrompt }] }],
                                generationConfig: { 
                                    temperature: 0, 
                                    responseMimeType: "application/json",
                                    responseSchema: {
                                        type: "ARRAY",
                                        items: { type: "INTEGER" }
                                    }
                                },
                            }),
                        }
                    );

                    if (rerankRes.ok) {
                        const rerankData = await rerankRes.json();
                        const rawText = rerankData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";
                        const scores: number[] = JSON.parse(rawText); 

                        if (Array.isArray(scores) && scores.length === candidateDocs.length) {
                            relevantDocuments = candidateDocs
                                .map((doc, i) => ({ ...doc, rerankScore: scores[i] ?? 0 }))
                                .filter(doc => doc.rerankScore! >= 3) 
                                .sort((a, b) => b.rerankScore! - a.rerankScore!)
                                .slice(0, 3);
                                
                            console.log(`[${currentDateTime}] Reranker processed ${candidateDocs.length}. Passed threshold: ${relevantDocuments.length}`);
                        } else {
                            throw new Error("Score array length mismatch.");
                        }
                    } else {
                        throw new Error(`Reranker API returned ${rerankRes.status}`);
                    }
                } catch (rerankErr) {
                    console.warn(`[${currentDateTime}] Reranker failed, falling back to Astra similarity:`, rerankErr);
                    relevantDocuments = candidateDocs
                        .filter(doc => doc.similarity >= 0.75) 
                        .sort((a, b) => b.similarity - a.similarity)
                        .slice(0, 3);
                }
            }
        } else {
            // If it IS conversational, we skip Steps 1 and 2 and log it.
            console.log(`[${currentDateTime}] Conversational query detected ("${latestMessage}"). Bypassing RAG pipeline.`);
        }

        // ── Step 3: Build Context + Generate Stream ──────────────────────────
        const formattedContext = relevantDocuments.length > 0 
            ? relevantDocuments.map((doc, i) => `Source ${i + 1} [${doc.title}]:\n${doc.content}`).join("\n\n---\n\n")
            : "No specific documents found. You may answer using your general knowledge if confident, otherwise politely state you don't have this data.";

        const isLongQuery = latestMessage.length > 50;
        const maxTokens = isLongQuery ? 2000 : 500;
        const systemPrompt = `You are F1GPT, a Formula 1 expert assistant. Current date: ${currentDateTime} UTC.
CRITICAL RULES:
- Give responses in SMALL PARAGRAPHS.
- Use the context provided below as the primary source of information.
- If the context does not include the answer, you may use knowledge about events up to the current date.
- Provide concise, factual answers under ${maxTokens} tokens.
- Do not speculate or provide information about events after the current date.
- Provide only factual answers. DO NOT include disclaimers.

Context Data:
${formattedContext}`;

        const prunedMessages: Message[] = messages.slice(-10);
        const messagesForApi = prunedMessages.map((msg) => ({
            role: msg.role === "assistant" ? "model" : "user",
            parts: [{ text: msg.content }],
        }));

        // 🛡️ Prepend our dynamic system prompt to the conversation flow safely
        const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    systemInstruction: { parts: [{ text: systemPrompt }] },
                    contents: messagesForApi,
                    generationConfig: { temperature: 0.3, topP: 0.9, maxOutputTokens: maxTokens },
                }),
            }
        );

        if (!geminiRes.ok || !geminiRes.body) {
            const errText = await geminiRes.text();
            throw new Error(`Gemini API error ${geminiRes.status}: ${errText}`);
        }

        // ── Step 4: SSE Stream Forwarding ────────────────────────────────────
        const encoder  = new TextEncoder();
        const outStream = new TransformStream();
        const writer   = outStream.writable.getWriter();

        req.signal.addEventListener("abort", () => {
            console.log(`[${currentDateTime}] Client aborted connection.`);
            writer.close().catch(() => {});
        });

        (async () => {
            const keepAlive = setInterval(() => {
                writer.write(encoder.encode(`event: ping\ndata: heartbeat\n\n`)).catch(() => {});
            }, 15000);

            try {
                await writer.write(encoder.encode(`data: ${JSON.stringify({
                    id: Date.now().toString(), role: "assistant", content: "",
                    createdAt: new Date(), timestamp: currentDateTime, user,
                })}\n\n`));

                let accumulatedContent = "";
                const reader  = geminiRes.body!.getReader();
                const decoder = new TextDecoder();
                let buffer    = "";

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split("\n");
                    buffer = lines.pop() ?? "";

                    for (const line of lines) {
                        if (!line.startsWith("data:")) continue;
                        const raw = line.slice(5).trim();
                        if (!raw || raw === "[DONE]") continue;

                        let parsed: any;
                        try { parsed = JSON.parse(raw); } catch { continue; }

                        const delta: string = parsed?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
                        if (!delta) continue;

                        accumulatedContent += delta;
                        await writer.write(encoder.encode(`data: ${JSON.stringify({
                            id: Date.now().toString(), role: "assistant",
                            content: accumulatedContent, createdAt: new Date(),
                            timestamp: currentDateTime, user,
                        })}\n\n`));
                    }
                }

                await writer.write(encoder.encode(`data: [DONE]\n\n`));
            } catch (error) {
                if (!req.signal.aborted) {
                    console.error(`[${currentDateTime}] Streaming error:`, error);
                    await writer.write(encoder.encode(`data: ${JSON.stringify({
                        id: Date.now().toString(), role: "assistant",
                        content: "Sorry, there was an error processing your request.",
                        createdAt: new Date(), timestamp: currentDateTime, user,
                    })}\n\n`)).catch(() => {});
                }
            } finally {
                clearInterval(keepAlive);
                if (!req.signal.aborted) await writer.close().catch(() => {});
            }
        })().catch(() => {});

        return new Response(outStream.readable, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache, no-transform",
                Connection: "keep-alive",
                "X-Accel-Buffering": "no",
            },
        });
    } catch (error: unknown) {
        console.error(`[${currentDateTime}] Fatal Route Error:`, error);
        const errorResponse: ErrorResponse = {
            error: "Internal Server Error",
            details: error instanceof Error ? error.message : "Unknown error occurred",
        };
        return new Response(JSON.stringify(errorResponse), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
}