// @/app/api/chat/route.ts

import { InferenceClient } from "@huggingface/inference"; // ⚠️ CHANGED from HfInference
import { DataAPIClient } from "@datastax/astra-db-ts";
import { NextRequest } from 'next/server';

export const runtime = "nodejs";

// --- CONFIGURATION ---
const ASTRA_DB_COLLECTION = 'f1gpt';
const LLM_MODEL = "HuggingFaceTB/SmolLM3-3B";
const EMBEDDING_MODEL = "BAAI/bge-large-en-v1.5";
const EMBEDDING_DIMENSION = 1024;
const SIMILARITY_THRESHOLD = 0.5;
const MAX_CONTEXT_LENGTH = 1000;
const MAX_NEW_TOKENS = 500;
const MAX_HISTORY_MESSAGES = 10;
const KEEPALIVE_INTERVAL_MS = 15000;

// --- ASTRA DB & HUGGING FACE CLIENT INITIALIZATION ---
const {
    HUGGINGFACE_API_KEY,
    ASTRA_DB_NAMESPACE,
    ASTRA_DB_API_ENDPOINT,
    ASTRA_DB_APPLICATION_TOKEN
} = process.env;

if (!HUGGINGFACE_API_KEY || !ASTRA_DB_NAMESPACE || !ASTRA_DB_API_ENDPOINT || !ASTRA_DB_APPLICATION_TOKEN) {
    throw new Error("Missing required environment variables for Hugging Face or AstraDB.");
}

// ⚠️ CHANGED to the newer InferenceClient
const hf = new InferenceClient(HUGGINGFACE_API_KEY);
const db = new DataAPIClient(ASTRA_DB_APPLICATION_TOKEN).db(ASTRA_DB_API_ENDPOINT, {
    namespace: ASTRA_DB_NAMESPACE
});

// --- TYPE DEFINITIONS ---
interface ChatMessage {
    role: 'system' | 'user' | 'assistant'; // ⚠️ Added 'system' role
    content: string;
}

interface AstraDocument {
    text?: string;
    content?: string;
    $similarity?: number;
}

// --- HELPER FUNCTIONS ---
// (ensureFlatNumberArray, generateEmbedding, and searchRelevantDocuments remain the same)

function ensureFlatNumberArray(input: any): number[] {
    if (!input) throw new Error('No embedding received');
    if (Array.isArray(input) && !Array.isArray(input[0])) return input as number[];
    if (Array.isArray(input) && Array.isArray(input[0])) return input[0] as number[];
    if (input.data && Array.isArray(input.data)) return input.data as number[];
    throw new Error('Invalid embedding format received');
}

async function generateEmbedding(query: string): Promise<number[]> {
    // Note: The new InferenceClient doesn't have a separate `featureExtraction` method.
    // We can use the base `hf.request` or keep using the old client just for this.
    // For simplicity, let's use the old client for this one task.
    const hfLegacy = new (await import('@huggingface/inference')).HfInference(HUGGINGFACE_API_KEY);
    const rawEmbedding = await hfLegacy.featureExtraction({
        model: EMBEDDING_MODEL,
        inputs: `Represent this question for retrieval: ${query}`,
    });
    
    const embedding = ensureFlatNumberArray(rawEmbedding);
    if (embedding.length !== EMBEDDING_DIMENSION) {
        throw new Error(`Invalid embedding dimension: Expected ${EMBEDDING_DIMENSION}, got ${embedding.length}`);
    }
    return embedding;
}

async function searchRelevantDocuments(embedding: number[]): Promise<string> {
    const collection = await db.collection(ASTRA_DB_COLLECTION);
    const cursor = await collection.find(
        {}, 
        { sort: { $vector: embedding }, limit: 3, includeSimilarity: true }
    );
    const results = await cursor.toArray() as AstraDocument[];

    const relevantDocs = results
        .filter(doc => doc.$similarity && doc.$similarity > SIMILARITY_THRESHOLD)
        .map(doc => (doc.text || doc.content || "").slice(0, 250))
        .join('\n\n');

    console.log(`Found ${relevantDocs.length > 0 ? 'relevant' : 'no relevant'} documents.`);
    return relevantDocs.length > 0 ? relevantDocs.slice(0, MAX_CONTEXT_LENGTH) : "No relevant documents found.";
}


// ⚠️ DELETED the complex `constructPrompt` function. It's no longer needed!


/**
 * ⚠️ REWRITTEN to use chatCompletionStream
 * Streams the LLM response back to the client.
 * @param writer The WritableStreamDefaultWriter to write chunks to.
 * @param messages The full chat history, including the new system prompt.
 * @param user The user identifier.
 */
async function streamLLMResponse(writer: WritableStreamDefaultWriter<Uint8Array>, messages: ChatMessage[], user: string) {
    const encoder = new TextEncoder();
    const sendData = (data: object) => writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
    const sendEvent = (event: string, data: object) => writer.write(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));

    const keepAlive = setInterval(() => {
        sendEvent('ping', { type: 'heartbeat', timestamp: Date.now() });
    }, KEEPALIVE_INTERVAL_MS);

    try {
        sendData({ role: 'assistant', content: '', id: Date.now().toString(), user });
        sendEvent('ping', { type: 'init-flush', message: 'Connection established.' });

        let accumulatedContent = '';
        
        // ⚠️ CHANGED to `chatCompletionStream`
        const responseStream = hf.chatCompletionStream({
            model: LLM_MODEL,
            messages: messages, // Pass the structured messages array directly
            max_tokens: MAX_NEW_TOKENS,
            temperature: 0.5,
            top_p: 0.9,
        });

        // ⚠️ CHANGED how we process chunks to match the new format
        for await (const chunk of responseStream) {
            const newContent = chunk.choices[0]?.delta?.content || "";
            if (newContent) {
                accumulatedContent += newContent;
                sendData({ role: 'assistant', content: accumulatedContent, id: Date.now().toString(), user });
            }
        }
    } catch (error) {
        console.error(`[Streaming Error] User: ${user}`, error);
        sendData({ role: 'assistant', content: "Sorry, there was an error processing your request.", id: Date.now().toString(), user, error: true });
    } finally {
        clearInterval(keepAlive);
        writer.write(encoder.encode('data: [DONE]\n\n'));
        writer.close();
    }
}


// --- API ENDPOINT ---
export async function POST(req: NextRequest) {
    try {
        const { messages, user = 'anonymous' } = await req.json();

        if (!Array.isArray(messages) || messages.length === 0) {
            return new Response(JSON.stringify({ error: "Invalid request: 'messages' must be a non-empty array" }), { status: 400 });
        }

        const latestUserMessage = messages[messages.length - 1]?.content;
        if (!latestUserMessage) {
            return new Response(JSON.stringify({ error: "No user message found" }), { status: 400 });
        }

        console.log(`[Request Start] User: ${user}, Query: "${latestUserMessage}"`);

        const embedding = await generateEmbedding(latestUserMessage);
        const context = await searchRelevantDocuments(embedding);

        const prunedMessages = messages.slice(-MAX_HISTORY_MESSAGES);
        
        // ⚠️ NEW: Create the system prompt and add it to the messages array
        const systemPrompt: ChatMessage = {
            role: 'system',
            content: `You are F1GPT, a Formula 1 expert assistant. Current date: ${new Date().toISOString()} UTC.
CRITICAL RULES:
- Give Responses in SMALL PARAGRAPHS.
- Use the context provided below as the primary source of information.
- Provide concise, factual answers under ${MAX_NEW_TOKENS} tokens.
- Do not speculate. Provide only factual answers and DO NOT include disclaimers.

Context:
${context}`
        };

        const messagesForLLM = [systemPrompt, ...prunedMessages];

        console.log(`[Messages Prepared] Sending ${messagesForLLM.length} messages to the LLM.`);

        // 4. Stream the response
        const stream = new TransformStream();
        const writer = stream.writable.getWriter();
        
        // ⚠️ CHANGED: Pass the messages array instead of the raw prompt string
        streamLLMResponse(writer, messagesForLLM, user).catch(err => {
            console.error("[Stream Pipeline Error]", err);
            writer.close();
        });

        return new Response(stream.readable, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache, no-transform',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no',
            },
        });

    } catch (error: any) {
        console.error("[API Error]", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
        return new Response(JSON.stringify({ error: "Internal Server Error", details: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}
