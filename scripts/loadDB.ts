import { DataAPIClient } from "@datastax/astra-db-ts";
import { PuppeteerWebBaseLoader } from "@langchain/community/document_loaders/web/puppeteer";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { HfInference } from "@huggingface/inference";
import "dotenv/config";

type SimilarityMetric = "dot_product" | "cosine" | "euclidean";

const ASTRA_DB_NAMESPACE = process.env.ASTRA_DB_NAMESPACE;
const ASTRA_DB_COLLECTION = process.env.ASTRA_DB_COLLECTION;
const ASTRA_DB_API_ENDPOINT = process.env.ASTRA_DB_API_ENDPOINT;
const ASTRA_DB_APPLICATION_TOKEN = process.env.ASTRA_DB_APPLICATION_TOKEN;
const HUGGINGFACE_API_KEY = process.env.HUGGINGFACE_API_KEY;

if (!ASTRA_DB_NAMESPACE || !ASTRA_DB_COLLECTION || !ASTRA_DB_API_ENDPOINT || !ASTRA_DB_APPLICATION_TOKEN || !HUGGINGFACE_API_KEY) {
  throw new Error("Missing required environment variables.");
}

const MODEL = "intfloat/e5-large-v2";
const huggingfaceClient = new HfInference(HUGGINGFACE_API_KEY);

const f1Data: string[] = [
  "https://www.the-race.com/formula-1/six-new-f1-rules-you-need-to-know-about-2025/",
  "https://genius.com/Carte-blanq-and-maxx-power-33-max-verstappen-lyrics",
  "https://www.sportskeeda.com/f1/news-du-du-du-du-max-verstappen-mclaren-academy-driver-bianca-bustamante-sings-hometown-favorite-s-song-team-radio",
  "https://www.skysports.com/f1/news/12433/12623789/charles-leclerc-slams-ferrari-mistakes-at-monaco-gp-we-cannot-do-that-it-hurts-a-lot",
  "https://www.motorsport.com/f1/news/sainz-fias-going-too-far-controlled-in-cockpit-language/10696462/",
  "https://www.mirror.co.uk/sport/formula-1/lewis-hamilton-title-ferrari-verstappen-34695324",
  "https://www.gpfans.com/us/f1-news/1017507/f1-twitter-memes-japanese-gp-lance-stroll/",
  "https://sportstar.thehindu.com/motorsport/f1/franco-colapinto-will-return-williams-team-principal-james-vowels-formula-one-alpine-f1-news/article69220777.ece",
  "https://www.bbc.com/sport/formula1/articles/c5y43wrxgego",
  "https://www.formula1.com/en/results/2024/races",
  "https://en.wikipedia.org/wiki/2024_Formula_One_World_Championship",
  "https://www.formula1.com/en/latest/article/2025-f1-grid-all-the-driver-and-team-line-ups-confirmed-so-far.7yijhWBNHjqKwHTRFEMZUa",
  "https://en.wikipedia.org/wiki/2025_Formula_One_World_Championship",
  "https://www.formula1.com/en/results/2024/drivers"
];

const client = new DataAPIClient(ASTRA_DB_APPLICATION_TOKEN);
const db = client.db(ASTRA_DB_API_ENDPOINT, { namespace: ASTRA_DB_NAMESPACE });

// Updated Text Splitter with smaller chunk size
const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 512,  // Reduced chunk size to ensure it's under the limit
  chunkOverlap: 100,  // Optional: Adjust the overlap to keep context
});

const createCollection = async (similarityMetric: SimilarityMetric = "dot_product") => {
  try {
    await db.collection(ASTRA_DB_COLLECTION);
    console.log(`Collection '${ASTRA_DB_COLLECTION}' already exists. Skipping creation.`);
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes("Collection not found")) {
      const res = await db.createCollection(ASTRA_DB_COLLECTION, {
        vector: {
          dimension: 1024,
          metric: similarityMetric,
        }
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
    const existing = await collection.findOne({ url });
    if (existing) {
      console.log(`Skipping already processed URL(s): ${url}`);
      continue;
    }

    const content = await scrapePage(url);
    if (content) {
      const chunks = await splitter.splitText(content);  // Split content into smaller chunks

      for await (const chunk of chunks) {
        const output = await huggingfaceClient.featureExtraction({ model: MODEL, inputs: chunk });
        const vector = output as number[];

        const res = await collection.insertOne({
          $vector: vector,
          text: chunk,  // Store the smaller chunk of text
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
  } catch (error: unknown) {
    console.error(`Error scraping page ${url}:`, error);
    return null;
  }
};

(async () => {
  try {
    await createCollection();
    await loadSampleData();
  } catch (error: unknown) {
    console.error("Error in main execution:", error);
    process.exit(1);
  }
})();
