import { HfInference } from '@huggingface/inference';
import { DataAPIClient } from "@datastax/astra-db-ts";

const HUGGINGFACE_API_KEY = process.env.HUGGINGFACE_API_KEY || '';
const ASTRA_DB_NAMESPACE = process.env.ASTRA_DB_NAMESPACE || '';
const ASTRA_DB_COLLECTION = 'f1gpt2';
const ASTRA_DB_API_ENDPOINT = process.env.ASTRA_DB_API_ENDPOINT || '';
const ASTRA_DB_APPLICATION_TOKEN = process.env.ASTRA_DB_APPLICATION_TOKEN || '';

if (!HUGGINGFACE_API_KEY) {
    throw new Error("Missing Hugging Face API key");
}

if (!ASTRA_DB_NAMESPACE || !ASTRA_DB_API_ENDPOINT || !ASTRA_DB_APPLICATION_TOKEN) {
    throw new Error("Missing required AstraDB env variables");
}

const hf = new HfInference(HUGGINGFACE_API_KEY);
const client = new DataAPIClient(ASTRA_DB_APPLICATION_TOKEN);
const db = client.db(ASTRA_DB_API_ENDPOINT, {
    namespace: ASTRA_DB_NAMESPACE
});

const LLM_MODEL = "mistralai/Mixtral-8x7B-Instruct-v0.1";
const EMBEDDING_MODEL = "BAAI/bge-large-en-v1.5";

interface ErrorResponse {
    error: string;
    details?: string;
}

function formatUTCDateTime(): string {
    const now = new Date();
    return now.toISOString()
        .replace('T', ' ')
        .slice(0, 19);
}

function ensureFlatNumberArray(input: any): number[] {
    if (!input) {
        throw new Error('No embedding received');
    }

    if (Array.isArray(input) && !Array.isArray(input[0])) {
        return input as number[];
    }

    if (Array.isArray(input) && Array.isArray(input[0])) {
        return input[0] as number[];
    }

    if (input.data && Array.isArray(input.data)) {
        return input.data as number[];
    }

    throw new Error('Invalid embedding format received');
}

export async function POST(req: Request) {
    const currentDateTime = formatUTCDateTime();
    try {
        const body = await req.json();
        console.log(`[${currentDateTime}] Request body:`, body);
        const { messages, user = 'iceheadcoder' } = body;
        if (!messages || !Array.isArray(messages)) {
            throw new Error("Invalid request: 'messages' must be an array");
        }

        const latestMessage = messages[messages.length - 1]?.content;
        if (!latestMessage) throw new Error("No user message found");

        let relevantDocuments: Array<{
            content: string;
            similarity: number;
            index: number;
        }> = [];

        try {
            console.log(`[${currentDateTime}] Processing query for user ${user}: ${latestMessage}`);
            const rawEmbedding = await hf.featureExtraction({
                model: EMBEDDING_MODEL,
                inputs: `Represent this question for retrieval: ${latestMessage}`,
            });
            console.log(`[${currentDateTime}] Raw embedding:`, rawEmbedding);

            const embedding = ensureFlatNumberArray(rawEmbedding);
            if (embedding.length !== 1024) {
                throw new Error(`Invalid embedding dimension: ${embedding.length}`);
            }
            console.log(`[${currentDateTime}] Generated embedding vector of length: ${embedding.length}`);

            const collection = await db.collection(ASTRA_DB_COLLECTION);
            const cursor = await collection.find(
                {} as any,
                {
                    sort: { $vector: embedding },
                    limit: 3,
                    includeSimilarity: true
                }
            );
            const results = await cursor.toArray();
            console.log(`[${currentDateTime}] AstraDB results:`, results);

            relevantDocuments = results
                .filter(doc => doc.$similarity && doc.$similarity > 0.5)
                .map((doc, index) => ({
                    content: (doc.text || doc.content || "").slice(0,250),
                    similarity: doc.$similarity || 0,
                    index: index + 1
                }));

            console.log(`[${currentDateTime}] Found ${relevantDocuments.length} relevant documents`);
        } catch (error) {
            console.error(`[${currentDateTime}] Search error for user ${user}:`, JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
            relevantDocuments = [];
        }

        const formattedContext = relevantDocuments.length > 0
            ? relevantDocuments.map(doc => doc.content).join('\n\n').slice(0,1000)
            : "No relevant documents found.";

        const encoder = new TextEncoder();
        const stream = new TransformStream();
        const writer = stream.writable.getWriter();

        (async () => {
            try {
                const initialMessage = {
                    id: Date.now().toString(),
                    role: 'assistant' as const,
                    content: '',
                    createdAt: new Date(),
                    timestamp: currentDateTime,
                    user: user
                };
                await writer.write(encoder.encode(`data: ${JSON.stringify(initialMessage)}\n\n`));

                let accumulatedContent = '';

                const prunedMessages = messages.slice(-10);
                const latestMessage = prunedMessages[prunedMessages.length - 1]?.content || '';
                const history = prunedMessages.slice(0, -1).map(msg => {
                    if (msg.role === 'user') return `User: ${msg.content}`;
                    if (msg.role === 'assistant') return `Assistant: ${msg.content}`;
                    return '';
                }).filter(Boolean).join('\n');

                const maxTokens = 500;
                const systemPrompt = `<s>[INST]
You are F1GPT, a Formula 1 expert assistant. Current date: ${currentDateTime} UTC.
CRITICAL RULES:
- Give Responses in SMALL PARAGRAPHS.
- Use the context provided below as the primary source of information.
- If the context does not include the answer, you may provide information about events that occurred in 2025 up to the current date (${currentDateTime}) if known.
- Provide concise, factual answers under ${maxTokens} tokens.
- Do not speculate or provide information about events not covered in the context or after the current date.
- Provide only factual answers and DO NOT include any disclaimers in your output.
- Add emojis only when required, do not add it always.

Context:
${formattedContext}

Conversation so far:
${history}

Now answer this:
User: ${latestMessage}
[/INST]`;

                console.log(`[${currentDateTime}] System prompt:`, systemPrompt);

                const response = await hf.textGenerationStream({
                    model: LLM_MODEL,
                    inputs: systemPrompt,
                    parameters: {
                        max_new_tokens: 500,
                        temperature: 0.5,
                        top_p: 0.9,
                        repetition_penalty: 1.0
                    }
                });

                for await (const chunk of response) {
                    if (chunk.token.text) {
                        accumulatedContent += chunk.token.text;
                        accumulatedContent = accumulatedContent.replace(/<\/s>/g, '');
                        const data = {
                            id: Date.now().toString(),
                            role: 'assistant' as const,
                            content: accumulatedContent.trim(),
                            createdAt: new Date(),
                            timestamp: currentDateTime,
                            user: user
                        };
                        await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
                    }
                }

                await writer.write(encoder.encode(`data: [DONE]\n\n`));
            } catch (error) {
                console.error(`[${currentDateTime}] Streaming error for user ${user}:`, JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
                const errorMessage = {
                    id: Date.now().toString(),
                    role: 'assistant' as const,
                    content: "Sorry, there was an error processing your request",
                    createdAt: new Date(),
                    timestamp: currentDateTime,
                    user: user
                };
                await writer.write(encoder.encode(`data: ${JSON.stringify(errorMessage)}\n\n`));
            } finally {
                await writer.close();
            }
        })().catch(async (error: unknown) => {
            console.error(`[${currentDateTime}] Stream error for user ${user}:`, JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
            const errorMessage = {
                id: Date.now().toString(),
                role: 'assistant' as const,
                content: "Sorry, there was an error processing your request.",
                createdAt: new Date(),
                timestamp: currentDateTime,
                user: user
            };
            await writer.write(encoder.encode(`data: ${JSON.stringify(errorMessage)}\n\n`));
            await writer.close();
        });

        return new Response(stream.readable, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache, no-transform',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no'
            },
        });
    } catch (error: unknown) {
        console.error(`[${currentDateTime}] API Error:`, JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
        const errorResponse: ErrorResponse = {
            error: "Internal Server Error",
            details: error instanceof Error ? error.message : "Unknown Error occurred"
        };
        return new Response(JSON.stringify(errorResponse), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}