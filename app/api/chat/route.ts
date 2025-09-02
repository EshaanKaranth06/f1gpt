export const runtime = "nodejs";
import { featureExtraction, textGeneration } from "@huggingface/inference";
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

// Using a much faster, smaller model to avoid timeouts
const LLM_MODEL = "openai/gpt-oss-120b";
const EMBEDDING_MODEL = "BAAI/bge-large-en-v1.5";

interface ErrorResponse {
  error: string;
  details?: string;
}

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

    // Immediate response to prevent Vercel timeout
    const initialMessage = {
      id: Date.now().toString(),
      role: "assistant" as const,
      content: "",
      createdAt: new Date(),
      timestamp: currentDateTime,
      user: user,
    };
    await writer.write(encoder.encode(`data: ${JSON.stringify(initialMessage)}\n\n`));

    // Start async processing with aggressive timeouts
    (async () => {
      let relevantDocuments: Array<{ content: string; similarity: number; index: number }> = [];
      
      try {
        // Very quick embedding search
        const rawEmbedding = await Promise.race([
          featureExtraction({
            accessToken: HUGGINGFACE_API_KEY,
            model: EMBEDDING_MODEL,
            inputs: `Represent this question for retrieval: ${latestMessage}`,
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Embedding timeout")), 2000)
          ),
        ]);

        const embedding = ensureFlatNumberArray(rawEmbedding);
        const collection = await db.collection(ASTRA_DB_COLLECTION);

        const cursor = await collection.find(
          {} as any,
          {
            sort: { $vector: embedding },
            limit: 2,
            includeSimilarity: true,
          }
        );

        const results = await cursor.toArray();
        relevantDocuments = results
          .filter((doc) => doc.$similarity && doc.$similarity > 0.5)
          .map((doc, index) => ({
            content: (doc.text || doc.content || "").slice(0, 150),
            similarity: doc.$similarity || 0,
            index: index + 1,
          }));
      } catch (err) {
        console.error(`[${currentDateTime}] Search error:`, err);
        relevantDocuments = [];
      }

      const formattedContext =
        relevantDocuments.length > 0
          ? relevantDocuments.map((doc) => doc.content).join("\n").slice(0, 500)
          : "";

      // Very simple prompt for fast generation
      const prompt = formattedContext 
        ? `Context: ${formattedContext}\n\nQ: ${latestMessage}\nA:` 
        : `F1 Question: ${latestMessage}\nAnswer:`;

      try {
        // Use non-streaming textGeneration for faster response
        const response = await Promise.race([
          textGeneration({
            accessToken: HUGGINGFACE_API_KEY,
            model: LLM_MODEL,
            inputs: prompt,
            parameters: {
              max_new_tokens: 150,
              temperature: 0.6,
              top_p: 0.9,
              repetition_penalty: 1.05,
              return_full_text: false,
            },
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Generation timeout")), 5000)
          ),
        ]);

        // Send the complete response at once
        const finalContent = response.generated_text?.trim() || "Unable to generate response.";
        
        const finalData = {
          id: Date.now().toString(),
          role: "assistant" as const,
          content: finalContent,
          createdAt: new Date(),
          timestamp: currentDateTime,
          user: user,
        };
        
        await writer.write(encoder.encode(`data: ${JSON.stringify(finalData)}\n\n`));
        
      } catch (genError) {
        console.error(`[${currentDateTime}] Generation error:`, genError);
        
        // Quick fallback with hardcoded F1 knowledge
        let fallbackContent = "I'm having trouble accessing the model. ";
        
        // Add some basic F1 2024 knowledge
        if (latestMessage.toLowerCase().includes("2024") && latestMessage.toLowerCase().includes("championship")) {
          fallbackContent += "Max Verstappen won the 2024 Formula 1 Drivers' Championship with Red Bull Racing.";
        } else {
          fallbackContent += "Please try your question again.";
        }
        
        const fallbackData = {
          id: Date.now().toString(),
          role: "assistant" as const,
          content: fallbackContent,
          createdAt: new Date(),
          timestamp: currentDateTime,
          user: user,
        };
        await writer.write(encoder.encode(`data: ${JSON.stringify(fallbackData)}\n\n`));
      }

      await writer.write(encoder.encode(`data: [DONE]\n\n`));
      await writer.close();
    })().catch(async (error) => {
      console.error(`[${currentDateTime}] Stream error:`, error);
      const errorData = {
        id: Date.now().toString(),
        role: "assistant" as const,
        content: "Sorry, there was an error processing your request.",
        createdAt: new Date(),
        timestamp: currentDateTime,
        user: user,
      };
      await writer.write(encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`));
      await writer.close();
    });

    return new Response(stream.readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error: unknown) {
    console.error(`[${currentDateTime}] API Error:`, error);
    const errorResponse: ErrorResponse = {
      error: "Internal Server Error",
      details: error instanceof Error ? error.message : "Unknown Error occurred",
    };
    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}