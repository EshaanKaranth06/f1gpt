import { DataAPIClient } from "@datastax/astra-db-ts";
import { PuppeteerWebBaseLoader } from "@langchain/community/document_loaders/web/puppeteer";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { Embeddings } from "deepinfra";

import "dotenv/config";

type SimilarityMetric = "dot_product" | "cosine" | "euclidean";

// Add type checking for environment variables
const ASTRA_DB_NAMESPACE = process.env.ASTRA_DB_NAMESPACE;
const ASTRA_DB_COLLECTION = process.env.ASTRA_DB_COLLECTION;
const ASTRA_DB_API_ENDPOINT = process.env.ASTRA_DB_API_ENDPOINT;
const ASTRA_DB_APPLICATION_TOKEN = process.env.ASTRA_DB_APPLICATION_TOKEN;


if (!ASTRA_DB_NAMESPACE || !ASTRA_DB_COLLECTION || !ASTRA_DB_API_ENDPOINT || !ASTRA_DB_APPLICATION_TOKEN) {
  throw new Error(
    "Missing required environment variables."
  );
}


const DEEPINFRA_API_KEY = "KAp9uS5dAyE6IdTDvReSdpIMpNcpHTV0";
const MODEL = "intfloat/e5-large-v2";

const deepInfraClient = new Embeddings(MODEL, DEEPINFRA_API_KEY);

const f1Data = [
  "https://www.the-race.com/formula-1/six-new-f1-rules-you-need-to-know-about-2025/",
  "https://genius.com/Carte-blanq-and-maxx-power-33-max-verstappen-lyrics",
  "https://www.sportskeeda.com/f1/news-du-du-du-du-max-verstappen-mclaren-academy-driver-bianca-bustamante-sings-hometown-favorite-s-song-team-radio",
  "https://www.skysports.com/f1/news/12433/12623789/charles-leclerc-slams-ferrari-mistakes-at-monaco-gp-we-cannot-do-that-it-hurts-a-lot",
  "https://www.motorsport.com/f1/news/sainz-fias-going-too-far-controlled-in-cockpit-language/10696462/",
  "https://www.mirror.co.uk/sport/formula-1/lewis-hamilton-title-ferrari-verstappen-34695324",
  "https://www.gpfans.com/us/f1-news/1017507/f1-twitter-memes-japanese-gp-lance-stroll/"
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
  const collection = await db.collection(ASTRA_DB_COLLECTION)

  for await (const url of f1Data) {

    
    const existing = await collection.findOne({url})
    if(existing){
      console.log(`Skipping already processed URL(s): ${url}`)
      continue
    }
    
    const content = await scrapePage(url);
    if (content) {
      const chunks = await splitter.splitText(content);

      for await (const chunk of chunks) {
        const output = await deepInfraClient.generate({ inputs: [chunk] });
        const vector = output.embeddings[0];
        const res = await collection.insertOne({
          $vector: vector,
          text: chunk,
          url
        });
        console.log(res);
      }
    }
  }
};

const scrapePage = async (url: string): Promise<string | null> => {
  try {
    const loader = new PuppeteerWebBaseLoader(url, {
      launchOptions: { headless: true },
      gotoOptions: { waitUntil: "domcontentloaded" },
      evaluate: async (page, browser) => {
        const result = await page.evaluate(() => document.body.innerText);
        await browser.close();
        return result;
      },
    });
    const content = await loader.scrape();
    return content ? content.replace(/<[^>]*>?/gm, "") : null;
  } catch (error) {
    console.error(`Error scraping page ${url}:`, error);
    return null;
  }
};

// Main execution
(async () => {
  try {
    await createCollection();
    await loadSampleData();
  } catch (error) {
    console.error("Error in main execution:", error);
    process.exit(1);
  }
})();