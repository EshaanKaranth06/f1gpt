import { DataAPIClient } from "@datastax/astra-db-ts";
import { PuppeteerWebBaseLoader } from "@langchain/community/document_loaders/web/puppeteer";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { GoogleGenerativeAI, TaskType } from "@google/generative-ai";
import * as crypto from "crypto";
import "dotenv/config";

// ─── Env ──────────────────────────────────────────────────────────────────
const ASTRA_DB_APPLICATION_TOKEN = process.env.ASTRA_DB_APPLICATION_TOKEN!;
const ASTRA_DB_API_ENDPOINT = process.env.ASTRA_DB_API_ENDPOINT!;
const ASTRA_DB_NAMESPACE = process.env.ASTRA_DB_NAMESPACE!;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;

if (!ASTRA_DB_API_ENDPOINT || !GEMINI_API_KEY || !ASTRA_DB_APPLICATION_TOKEN || !ASTRA_DB_NAMESPACE) {
  throw new Error("Missing required environment variables.");
}

const COLLECTION        = "f1_gpt";
const EMBEDDING_DIM     = 1536; 
const MODEL         = "gemini-embedding-2";

const astraClient = new DataAPIClient(ASTRA_DB_APPLICATION_TOKEN);
const db = astraClient.db(ASTRA_DB_API_ENDPOINT, {
  namespace: ASTRA_DB_NAMESPACE,
});
const collection = db.collection(COLLECTION);

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const embeddingModel = genAI.getGenerativeModel({ model: MODEL });

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 400,
  chunkOverlap: 80,
});

// ─── URL list ─────────────────────────────────────────────────────────────
type Category = "rules" | "results" | "standings" | "news" | "misc";

const SOURCE_WEIGHTS: Record<Category, number> = {
  rules:     1.0,
  results:   0.9,
  standings: 0.85,
  news:      0.6,
  misc:      0.5,
};

interface F1Source { url: string; category: Category; }

const f1Data: F1Source[] = [
  // ── Rules ──────────────────────────────────────────────────────────
  { url: "https://www.the-race.com/formula-1/six-new-f1-rules-you-need-to-know-about-2025/",  category: "rules" },

  // ── 2024 results & championship ────────────────────────────────────
  { url: "https://www.formula1.com/en/results/2024/races",                                    category: "results"   },
  { url: "https://www.formula1.com/en/results/2024/drivers",                                  category: "standings" },
  { url: "https://en.wikipedia.org/wiki/2024_Formula_One_World_Championship",                 category: "standings" },

  // ── 2025 season overview ───────────────────────────────────────────
  { url: "https://en.wikipedia.org/wiki/2025_Formula_One_World_Championship",                 category: "standings" },
  { url: "https://www.formula1.com/en/racing/2025",                                           category: "standings" },
  { url: "https://www.formula1.com/en/results/2025/drivers",                                  category: "standings" },
  { url: "https://www.formula1.com/en/results/2025/races",                                    category: "results"   },

  // ── 2025 driver lineups ────────────────────────────────────────────
  { url: "https://www.formula1.com/en/latest/article/2025-f1-grid-all-the-driver-and-team-line-ups-confirmed-so-far.7yijhWBNHjqKwHTRFEMZUa", category: "misc" },
  { url: "https://www.motorsportmagazine.com/articles/single-seaters/f1/2025-f1-driver-line-ups-latest-contract-news-and-rumours/",           category: "misc" },

  // ── 2025 race results — add a new entry after each race weekend ────
  { url: "https://www.formula1.com/en/results/2025/races/1254/australia/race-result",         category: "results" },
  { url: "https://www.formula1.com/en/results/2025/races/1255/china/race-result",             category: "results" },
  { url: "https://www.formula1.com/en/results/2025/races/1256/japan/race-result",             category: "results" },
  { url: "https://www.formula1.com/en/results/2025/races/1257/bahrain/race-result",           category: "results" },
  { url: "https://www.formula1.com/en/results/2025/races/1258/saudi-arabia/race-result",      category: "results" },
  { url: "https://www.formula1.com/en/results/2025/races/1259/miami/race-result",             category: "results" },
  { url: "https://www.formula1.com/en/results/2025/races/1260/emilia-romagna/race-result",    category: "results" },
  { url: "https://en.wikipedia.org/wiki/2025_Emilia_Romagna_Grand_Prix",                      category: "results" },
  { url: "https://cl1p.net/ekek"   , category: "results" },

  // ── News & misc ────────────────────────────────────────────────────
  { url: "https://www.sportskeeda.com/f1/news-du-du-du-du-max-verstappen-mclaren-academy-driver-bianca-bustamante-sings-hometown-favorite-s-song-team-radio", category: "news" },
  { url: "https://www.skysports.com/f1/news/12433/12623789/charles-leclerc-slams-ferrari-mistakes-at-monaco-gp-we-cannot-do-that-it-hurts-a-lot",            category: "news" },
  { url: "https://www.motorsport.com/f1/news/sainz-fias-going-too-far-controlled-in-cockpit-language/10696462/",                                              category: "news" },
  { url: "https://www.mirror.co.uk/sport/formula-1/lewis-hamilton-title-ferrari-verstappen-34695324",                                                         category: "news" },
  { url: "https://sportstar.thehindu.com/motorsport/f1/franco-colapinto-will-return-williams-team-principal-james-vowels-formula-one-alpine-f1-news/article69220777.ece", category: "news" },
  { url: "https://www.bbc.com/sport/formula1/articles/c5y43wrxgego",                          category: "news" },
];
// ─── Helpers ──────────────────────────────────────────────────────────────
function normalize(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((sum, x) => sum + x * x, 0));
  return norm === 0 ? vec : vec.map((x) => x / norm);
}

function hashText(text: string): string {
  return crypto.createHash("sha256").update(text.trim()).digest("hex");
}

function cleanText(raw: string): string {
  return raw
    .replace(/\n{3,}/g, "\n\n")
    .replace(/(Subscribe|Advertisement|Sign up|Cookie Policy|Privacy Policy|Terms of Use).{0,120}/gi, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^\x20-\x7E\n]/g, " ")
    .trim();
}

function isJunkChunk(text: string): boolean {
  if (text.trim().length < 50) return true;
  const alphaRatio = (text.match(/[a-zA-Z]/g)?.length ?? 0) / text.length;
  return alphaRatio < 0.4;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ─── Embedder ─────────────────────────────────────────────────────────────
const embedBatch = async (chunks: string[]): Promise<number[][]> => {
  const vectors: number[][] = [];
  const REQUESTS_PER_BATCH = 50; // Google allows up to 100 per batch request, but 50 is safe
  const DELAY_MS = 2000;         // We only need a 2-second breather now!

  for (let i = 0; i < chunks.length; i += REQUESTS_PER_BATCH) {
    const batch = chunks.slice(i, i + REQUESTS_PER_BATCH);
    console.log(`    [Rate Limit] Embedding batch ${Math.floor(i / REQUESTS_PER_BATCH) + 1} of ${Math.ceil(chunks.length / REQUESTS_PER_BATCH)}...`);

    // 1. Package all 50 chunks into a single payload
    const batchRequests = batch.map((chunk) => ({
      content: { role: "user", parts: [{ text: chunk }] },
      taskType: TaskType.RETRIEVAL_DOCUMENT,
      outputDimensionality: 1536,
    }));

    // 2. Send ALL 50 chunks in exactly ONE network request
    const result = await embeddingModel.batchEmbedContents({
      requests: batchRequests,
    });

    // 3. Process the returned array of embeddings
    for (const emb of result.embeddings) {
      let vec = emb.values;

      // 🛡️ Bulletproof fallback for Matryoshka slicing
      if (vec && vec.length > EMBEDDING_DIM) {
        vec = vec.slice(0, EMBEDDING_DIM);
      }

      if (!vec || vec.length !== EMBEDDING_DIM) {
        throw new Error(`Invalid embedding dimension: got ${vec?.length ?? 0}`);
      }

      vectors.push(normalize(vec));
    }

    // Brief pause to play nice with the API
    if (i + REQUESTS_PER_BATCH < chunks.length) {
      await delay(DELAY_MS);
    }
  }

  return vectors;
};
// ─── AstraDB Setup ────────────────────────────────────────────────────────
const createCollection = async () => {
  const collections = await db.listCollections();
  if (!collections.some((c) => c.name === COLLECTION)) {
    await db.createCollection(COLLECTION, {
      vector: { dimension: EMBEDDING_DIM, metric: "cosine" },
    });
    console.log(`Collection '${COLLECTION}' created.`);
  } else {
    console.log(`Collection '${COLLECTION}' already exists.`);
  }
};

// ─── Scraper ──────────────────────────────────────────────────────────────
const scrapePage = async (url: string) => {
  try {
    let pageTitle = "";
    const loader = new PuppeteerWebBaseLoader(url, {
      launchOptions: { headless: true },
      gotoOptions: { waitUntil: "domcontentloaded" },
      evaluate: async (page, browser) => {
        pageTitle = await page.title();
        const result = await page.evaluate(() => document.body.innerText);
        await browser.close();
        return result;
      },
    });
    const raw = await loader.scrape();
    return raw ? { content: cleanText(raw), title: pageTitle } : null;
  } catch (error) {
    console.error(`[Scraper] Failed: ${url}`, error);
    return null;
  }
};

// Ask Astra DB if this URL already exists in the collection
const isAlreadyLoaded = async (url: string): Promise<boolean> => {
  const result = await collection.findOne({ url });
  return !!result; // Returns true if found, false if not
};

// ─── Main loader ──────────────────────────────────────────────────────────
const loadData = async () => {
  
  for (const source of f1Data) {
    const loaded = await isAlreadyLoaded(source.url);
    if (loaded) {
      console.log(`Skipping already processed URL: ${source.url}`);
      continue; // Jumps to the next URL in the array
    }
    console.log(`Scraping (${source.category}): ${source.url}`);
    const scraped = await scrapePage(source.url);
    if (!scraped) continue;

    const rawChunks = await splitter.splitText(scraped.content);
    const chunks    = rawChunks.filter((c) => !isJunkChunk(c));
    console.log(`  ${rawChunks.length} chunks → ${chunks.length} after junk filter`);
    if (chunks.length === 0) continue;

    const vectors   = await embedBatch(chunks);
    const scrapedAt = new Date().toISOString();

    // Mapping over into flat Astra documents
    const documents = chunks.map((chunk, i) => {
      // Deterministic ID prevents duplicating data if script is run twice
      const deterministicId = hashText(`${source.url}-${i}`); 
      
      return {
        _id: deterministicId, 
        text: chunk,
        title: scraped.title,
        url: source.url,
        category: source.category,
        sourceWeight: SOURCE_WEIGHTS[source.category],
        chunkIndex: i,
        contentHash: hashText(chunk),
        scrapedAt,
        $vector: vectors[i],
      };
    });

    // Use Astra's bulk insert/update method
    // In production, insertMany with ordered: false skips existing duplicates gracefully
    await collection.insertMany(documents, { ordered: false }).catch(e => {
        // Ignore duplicate key errors if we are just re-running the script
        if(!e.message.includes("Document already exists")) throw e;
    });
    console.log(`  Processed ${documents.length} chunks for: ${source.url}`);
  }
};

// ─── Entry point ──────────────────────────────────────────────────────────
(async () => {
  try {
    await createCollection();
    await loadData();
    console.log("Done.");
  } catch (error) {
    console.error("Error in main execution:", error);
    process.exit(1);
  }
})();