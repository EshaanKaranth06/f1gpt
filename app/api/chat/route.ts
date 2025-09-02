// @/app/api/chat/route.ts

import { HfInference } from '@huggingface/inference';
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

const hf = new HfInference(HUGGINGFACE_API_KEY);
const db = new DataAPIClient(ASTRA_DB_APPLICATION_TOKEN).db(ASTRA_DB_API_ENDPOINT, {
    namespace: ASTRA_DB_NAMESPACE
});

// --- TYPE DEFINITIONS ---
interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

interface AstraDocument {
    text?: string;
    content?: string;
    $similarity?: number;
}

// --- HELPER FUNCTIONS ---

/**
 * Ensures the embedding is a flat array of numbers.
 * @param input The raw embedding output from the model.
 * @returns A flat array of numbers.
 */
function ensureFlatNumberArray(input: any): number[] {
    if (!input) throw new Error('No embedding received');
    if (Array.isArray(input) && !Array.isArray(input[0])) return input as number[];
    if (Array.isArray(input) && Array.isArray(input[0])) return input[0] as number[];
    if (input.data && Array.isArray(input.data)) return input.data as number[];
    throw new Error('Invalid embedding format received');
}

/**
 * Generates a vector embedding for a given text query.
 * @param query The user's message content.
 * @returns A promise that resolves to the embedding vector.
 */
async function generateEmbedding(query: string): Promise<number[]> {
    const rawEmbedding = await hf.featureExtraction({
        model: EMBEDDING_MODEL,
        inputs: `Represent this question for retrieval: ${query}`,
    });
    
    const embedding = ensureFlatNumberArray(rawEmbedding);
    if (embedding.length !== EMBEDDING_DIMENSION) {
        throw new Error(`Invalid embedding dimension: Expected ${EMBEDDING_DIMENSION}, got ${embedding.length}`);
    }
    return embedding;
}

/**
 * Searches for relevant documents in AstraDB based on the query embedding.
 * @param embedding The vector embedding of the user's query.
 * @returns A formatted string of context from relevant documents.
 */
async function searchRelevantDocuments(embedding: number[]): Promise<string> {
    const collection = await db.collection(ASTRA_DB_COLLECTION);
    const cursor = await collection.find(
        {}, 
        {
            sort: { $vector: embedding },
            limit: 3,
            includeSimilarity: true
        }
    );
    const results = await cursor.toArray() as AstraDocument[];

    const relevantDocs = results
        .filter(doc => doc.$similarity && doc.$similarity > SIMILARITY_THRESHOLD)
        .map(doc => (doc.text || doc.content || "").slice(0, 250))
        .join('\n\n');

    console.log(`Found ${relevantDocs.length > 0 ? 'relevant' : 'no relevant'} documents.`);
    return relevantDocs.length > 0 ? relevantDocs.slice(0, MAX_CONTEXT_LENGTH) : "No relevant documents found.";
}

/**
 * Constructs the prompt for the language model, including context, history, and rules.
 * @param messages The chat history.
 * @param context The context retrieved from the vector database.
 * @returns The fully formatted prompt string.
 */
function constructPrompt(messages: ChatMessage[], context: string): string {
    const latestUserMessage = messages[messages.length - 1]?.content || '';
    const history = messages.slice(0, -1)
        .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
        .join('\n');
    const currentDateTime = new Date().toISOString();

    return `<|begin_of_text|><|start_header_id|>system<|end_header_id|>

You are F1GPT, a Formula 1 expert assistant. Current date: ${currentDateTime} UTC.
CRITICAL RULES:
- Give Responses in SMALL PARAGRAPHS.
- Use the context provided below as the primary source of information.
- If the context does not include the answer, you may provide information about events that occurred in 2025 up to the current date.
- Provide concise, factual answers under ${MAX_NEW_TOKENS} tokens.
- Do not speculate or provide information about events not covered in the context or after the current date.
- Provide only factual answers and DO NOT include any disclaimers in your output.

Context:
${context}<|eot_id|><|start_header_id|>user<|end_header_id|>

Conversation so far:
${history}

Now answer this:
${latestUserMessage}<|eot_id|><|start_header_id|>assistant<|end_header_id|>`;
}


/**
 * Streams the LLM response back to the client.
 * @param writer The WritableStreamDefaultWriter to write chunks to.
 * @param prompt The prompt to send to the LLM.
 * @param user The user identifier.
 */
async function streamLLMResponse(writer: WritableStreamDefaultWriter<Uint8Array>, prompt: string, user: string) {
    const encoder = new TextEncoder();
    const sendData = (data: object) => writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
    const sendEvent = (event: string, data: object) => writer.write(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));

    const keepAlive = setInterval(() => {
        sendEvent('ping', { type: 'heartbeat', timestamp: Date.now() });
    }, KEEPALIVE_INTERVAL_MS);

    try {
        // Send an initial empty message to establish the connection
        sendData({ role: 'assistant', content: '', id: Date.now().toString(), user });
        
        // **FIX**: Send a JSON object for the flush event
        sendEvent('ping', { type: 'init-flush', message: 'Connection established.' });

        let accumulatedContent = '';
        const responseStream = await hf.textGenerationStream({
            model: LLM_MODEL,
            inputs: prompt,
            parameters: { max_new_tokens: MAX_NEW_TOKENS, temperature: 0.5, top_p: 0.9, repetition_penalty: 1.0 }
        });

        for await (const chunk of responseStream) {
            if (chunk.token.text) {
                accumulatedContent += chunk.token.text;
                accumulatedContent = accumulatedContent.replace(/<\|eot_id\|>|<\|end_of_text\|>/g, '');
                sendData({ role: 'assistant', content: accumulatedContent.trimStart(), id: Date.now().toString(), user });
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

        // 1. Generate embedding for the latest message
        const embedding = await generateEmbedding(latestUserMessage);

        // 2. Retrieve context from AstraDB
        const context = await searchRelevantDocuments(embedding);

        // 3. Construct the full prompt
        const prunedMessages = messages.slice(-MAX_HISTORY_MESSAGES);
        const prompt = constructPrompt(prunedMessages, context);
        console.log(`[Prompt Generated] Prompt length: ${prompt.length}`);

        // 4. Stream the response
        const stream = new TransformStream();
        const writer = stream.writable.getWriter();
        streamLLMResponse(writer, prompt, user).catch(err => {
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
