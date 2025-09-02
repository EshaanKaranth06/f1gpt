export const runtime = "nodejs";
import { featureExtraction, chatCompletionStream } from "@huggingface/inference";
import { DataAPIClient } from "@datastax/astra-db-ts";

const HUGGINGFACE_API_KEY = process.env.HUGGINGFACE_API_KEY || "";
const ASTRA_DB_NAMESPACE = process.env.ASTRA_DB_NAMESPACE || "";
const ASTRA_DB_COLLECTION = "f1gpt";
const ASTRA_DB_API_ENDPOINT = process.env.ASTRA_DB_API_ENDPOINT || "";
const ASTRA_DB_APPLICATION_TOKEN = process.env.ASTRA_DB_APPLICATION_TOKEN || "";

if (!HUGGINGFACE_API_KEY) {
  throw new Error("Missing Hugging Face API key");
}

if (!ASTRA_DB_NAMESPACE || !ASTRA_DB_API_ENDPOINT || !ASTRA_DB_APPLICATION_TOKEN) {
  throw new Error("Missing required AstraDB env variables");
}

const client = new DataAPIClient(ASTRA_DB_APPLICATION_TOKEN);
const db = client.db(ASTRA_DB_API_ENDPOINT, {
  namespace: ASTRA_DB_NAMESPACE,
});

const LLM_MODEL = "openai/gpt-oss-120b";
const EMBEDDING_MODEL = "BAAI/bge-large-en-v1.5";

function formatUTCDateTime(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function ensureFlatNumberArray(input: any): number[] {
  if (!input) throw new Error("No embedding received");
  if (Array.isArray(input) && !Array.isArray(input[0])) return input as number[];
  if (Array.isArray(input) && Array.isArray(input[0])) return input[0] as number[];
  if (input.data && Array.isArray(input.data)) return input.data as number[];
  throw new Error("Invalid embedding format received");
}

export async function POST(req: Request) {
  const currentDateTime = formatUTCDateTime();

  try {
    const body = await req.json();
    const { messages, user = "iceheadcoder" } = body;

    if (!messages || !Array.isArray(messages)) {
      throw new Error("Invalid request: 'messages' must be an array");
    }

    const latestMessage = messages[messages.length - 1]?.content;
    if (!latestMessage) throw new Error("No user message found");

    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    // Send initial event early to prevent Vercel timeout
    await writer.write(
      encoder.encode(`data: ${JSON.stringify({ status: "processing", timestamp: currentDateTime })}\n\n`)
    );

    let relevantDocuments: Array<{ content: string; similarity: number; index: number }> = [];

    try {
      // Fetch embedding with timeout to avoid stalling
      const rawEmbedding = await Promise.race([
        featureExtraction({
          accessToken: HUGGINGFACE_API_KEY,
          model: EMBEDDING_MODEL,
          inputs: `Represent this question for retrieval: ${latestMessage}`,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Embedding timeout")), 5000)),
      ]);

      const embedding = ensureFlatNumberArray(rawEmbedding);
      const collection = await db.collection(ASTRA_DB_COLLECTION);

      const cursor = await collection.find(
        {} as any,
        {
          sort: { $vector: embedding },
          limit: 3,
          includeSimilarity: true,
        }
      );

      const results = await cursor.toArray();
      relevantDocuments = results
        .filter((doc) => doc.$similarity && doc.$similarity > 0.5)
        .map((doc, index) => ({
          content: (doc.text || doc.content || "").slice(0, 250),
          similarity: doc.$similarity || 0,
          index: index + 1,
        }));
    } catch (err) {
      console.error(`[${currentDateTime}] Search error:`, err);
      relevantDocuments = [];
    }

    const formattedContext =
      relevantDocuments.length > 0
        ? relevantDocuments.map((doc) => doc.content).join("\n\n").slice(0, 1000)
        : "No relevant documents found.";

    const prunedMessages = messages.slice(-10);
    const conversationHistory = prunedMessages.slice(0, -1);

    const chatMessages = [
      {
        role: "system" as const,
        content: `You are F1GPT, a Formula 1 expert assistant. Current date: ${currentDateTime} UTC.
CRITICAL RULES:
- Keep responses short and factual.
- Use the context below as your main source.
- Do not hallucinate events beyond the current date.
Context:
${formattedContext}`,
      },
      ...conversationHistory,
      { role: "user" as const, content: latestMessage },
    ];

    const hfStream = chatCompletionStream({
      accessToken: HUGGINGFACE_API_KEY,
      provider: "together",
      model: LLM_MODEL,
      messages: chatMessages,
      max_tokens: 500,
      temperature: 0.7,
      top_p: 0.9,
    });

    let accumulatedContent = "";

    for await (const chunk of hfStream) {
      const newContent = chunk?.choices?.[0]?.delta?.content;
      if (newContent) {
        accumulatedContent += newContent;
        await writer.write(
          encoder.encode(
            `data: ${JSON.stringify({
              id: Date.now().toString(),
              role: "assistant",
              content: accumulatedContent.trim(),
              timestamp: currentDateTime,
              user,
            })}\n\n`
          )
        );
      }
    }

    await writer.write(encoder.encode(`data: [DONE]\n\n`));
    await writer.close();

    return new Response(stream.readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error: any) {
    console.error(`[${currentDateTime}] API Error:`, error);
    return new Response(JSON.stringify({ error: "Internal Server Error", details: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
