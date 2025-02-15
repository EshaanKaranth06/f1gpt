import { DataAPIClient } from "@datastax/astra-db-ts";
import { PuppeteerWebBaseLoader } from "@langchain/community/document_loaders/web/puppeteer";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { Embeddings } from "deepinfra"; 

import "dotenv/config";

type SimilarityMetric = "dot_product" | "cosine" | "euclidean";

const {
  ASTRA_DB_NAMESPACE,
  ASTRA_DB_COLLECTION,
  ASTRA_DB_API_ENDPOINT,
  ASTRA_DB_APPLICATION_TOKEN,
} = process.env;

const DEEPINFRA_API_KEY = "KAp9uS5dAyE6IdTDvReSdpIMpNcpHTV0";
const MODEL = "intfloat/e5-large-v2";

// Instantiate DeepInfra Embeddings using the model and API key as separate arguments
const deepInfraClient = new Embeddings(MODEL, DEEPINFRA_API_KEY);

const f1Data = [
  "https://en.wikipedia.org/wiki/Formula_One",
  "https://www.formula1.com/en/latest/article/tech-analysis-how-mclarens-mcl39-has-benefitted-from-an-aggressive-evolution.5m6ljEuYuybirNZAB86Vun",
  "https://www.motors-addict.com/en/article/formula1/eni-reignites-partnership-with-alpine-and-renault-in-f1/67ae01ed4d5a05b5da016c77",
  "https://www.formula1.com/en/latest/article/from-an-infamous-contract-dispute-to-a-switch-prevented-by-injury-8-f1.4DBUJ1tm2tM65ALjP3S3mX",
  "https://www.sakshipost.com/news/formula-1-norris-ready-take-elbows-out-season-2025-377653",
  "https://www.formula1.com/en/latest/article/williams-announce-new-title-partnership-ahead-of-2025-season.4eRDXpi9xv7hyvr9hBbre1",
];

const client = new DataAPIClient(ASTRA_DB_APPLICATION_TOKEN);
const db = client.db(ASTRA_DB_API_ENDPOINT, { namespace: ASTRA_DB_NAMESPACE });

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 512,
  chunkOverlap: 100,
});

const createCollection = async (similarityMetric: SimilarityMetric = "dot_product") => {
  try {
    await db.collection(ASTRA_DB_COLLECTION);
    console.log(`Collection '${ASTRA_DB_COLLECTION}' already exists. Skipping creation.`);
  } catch (error: any) {
    if (error.message.includes("Collection not found")) {
      const res = await db.createCollection(ASTRA_DB_COLLECTION, {
        vector: {
          dimension: 1024,
          metric: similarityMetric,
        },
      });
      console.log(`Collection created: ${res}`);
    } else {
      throw error;
    }
  }
};

const loadSampleData = async () => {
  const collection = await db.collection(ASTRA_DB_COLLECTION);
  for await (const url of f1Data) {
    const content = await scrapePage(url);
    const chunks = await splitter.splitText(content);

    for await (const chunk of chunks) {
      
      const output = await deepInfraClient.generate({ inputs: [chunk] });
      const vector = output.embeddings[0];
      const res = await collection.insertOne({
        $vector: vector,
        text: chunk,
      });
      console.log(res);
    }
  }
};

const scrapePage = async (url: string) => {
  const loader = new PuppeteerWebBaseLoader(url, {
    launchOptions: { headless: true },
    gotoOptions: { waitUntil: "domcontentloaded" },
    evaluate: async (page, browser) => {
      const result = await page.evaluate(() => document.body.innerText);
      await browser.close();
      return result;
    },
  });
  return (await loader.scrape())?.replace(/<[^>]*>?/gm, "");
};

createCollection().then(() => loadSampleData());
