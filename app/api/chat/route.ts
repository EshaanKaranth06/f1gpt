import { createDeepInfra } from "@ai-sdk/deepinfra"
import { generateText, streamText } from "ai"
import { Embeddings } from "deepinfra"
import { DataAPIClient } from "@datastax/astra-db-ts"

const deepinfra = createDeepInfra({
    apiKey: "KAp9uS5dAyE6IdTDvReSdpIMpNcpHTV0",
  });

const {
  ASTRA_DB_NAMESPACE,
  ASTRA_DB_COLLECTION,
  ASTRA_DB_API_ENDPOINT,
  ASTRA_DB_APPLICATION_TOKEN,
} = process.env;

const client = new DataAPIClient(ASTRA_DB_APPLICATION_TOKEN!)
const db = client.db(ASTRA_DB_API_ENDPOINT, { namespace: ASTRA_DB_NAMESPACE })

const LLM_MODEL = "mistralai/Mistral-7B-Instruct-v0.3"

export async function POST(req: Request) {
  try {
        const { messages } = await req.json();
        const latestMessage = messages[messages?.length - 1]?.content

        let docContext = ""

        const embeddingResponse = await fetch("https://api.deepinfra.com/v1/inference/intfloat/e5-large-v2", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${process.env.DEEPINFRA_API_KEY}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ input: [latestMessage] }) // DeepInfra requires input as an array
          });
          
          // Parse response
          const embeddingData = await embeddingResponse.json();
          
          // Extract embedding vector
          const embedding = embeddingData.data[0].embedding;
          
    
        try{
            const collection = await db.collection(ASTRA_DB_COLLECTION);
            const cursor = collection.find(null, {
                sort: { 
                    $vector: embedding.data[0].embedding 
                },
                limit: 10
            })

            const documents = await cursor.toArray()

            const docsMap = documents?.map(doc => doc.text)

            docContext = JSON.stringify(docsMap)

        } catch (err){
        console.error("DB Error:", err)
        docContext = ""
        }

        const template = {
            role: "system",
            content: `You are an AI assistant specializing in Formula One.
                Use the below context to augment what you know about Formula One racing.
                The context includes Wikipedia, the official F1 site, and other sources.
                If the context lacks the information, answer based on what you already know.
                Do NOT mention sources or missing information.
                Format responses using markdown where applicable and don't return images.

            ------------------------
            START CONTEXT
            ${docContext}
            END CONTEXT
            ------------------------
            QUESTION: ${latestMessage}
            ------------------------

            `
            }

            const result = streamText({
                model: deepinfra(LLM_MODEL),
                messages: [template, ...messages],
              })

              return new Response(result.textStream, {
                headers: { "Content-Type": "text/plain" },
              })

    } catch (err){
        throw err
    }
 
}
     
