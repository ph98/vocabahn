import { GoogleGenAI } from '@google/genai';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY is not set.");
  process.exit(1);
}

const client = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const DE_FULL_PATH = path.resolve(__dirname, '../../../data/de_full.txt');
const JSON_OUT_PATH = path.resolve(__dirname, '../../../data/german_cefr_wordlist.json');

const BATCH_SIZE = 100;
// We start from 14000 since phase1 covered 1-14000
const START_INDEX = 14000;
// We'll process 500 words to demonstrate and get a good chunk of C1/C2
const END_INDEX = 14500; 

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function processBatch(words: string[]): Promise<Record<string, string>> {
  const prompt = `You are a German linguistics expert. I have a list of German words. Categorize each word by its CEFR level (A1, A2, B1, B2, C1, C2). If it's a proper noun, extremely obscure, a typo, or not a valid word, assign "X".
  
Return the output strictly as a JSON object where the key is the word, and the value is the CEFR level.

Words:
${words.join(', ')}`;

  let retries = 3;
  while (retries > 0) {
    try {
      const res = await client.models.generateContent({
        model: 'gemini-flash-lite-latest',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        }
      });
      const text = res.text || '{}';
      return JSON.parse(text);
    } catch (err: unknown) {
      console.error('API Error, retrying...', err instanceof Error ? err.message : err);
      retries--;
      await delay(2000);
    }
  }
  return {};
}

async function main() {
  console.log('Loading de_full.txt...');
  const lines = readFileSync(DE_FULL_PATH, 'utf-8').split('\n').filter(Boolean);
  
  // Read existing json to merge
  console.log('Loading existing german_cefr_wordlist.json...');
  let existingList: Array<{ word: string, rate: number, level: string, rank: number }> = [];
  try {
    existingList = JSON.parse(readFileSync(JSON_OUT_PATH, 'utf-8'));
  } catch {
    console.error('Could not read existing JSON, starting fresh');
  }
  
  const existingWords = new Set(existingList.map(e => e.word));

  const targetLines = lines.slice(START_INDEX, END_INDEX);
  console.log(`Processing from rank ${START_INDEX + 1} to ${END_INDEX} (${targetLines.length} words)...`);

  const results: Array<{ word: string, rate: number, level: string, rank: number }> = [];

  for (let i = 0; i < targetLines.length; i += BATCH_SIZE) {
    const batchLines = targetLines.slice(i, i + BATCH_SIZE);
    
    const batchInfo = batchLines.map((line, idx) => {
      const [word, rateStr] = line.split(' ');
      return { word, rate: parseInt(rateStr, 10), rank: START_INDEX + i + idx + 1 };
    });
    
    const batchWords = batchInfo.map(b => b.word);
    console.log(`Batch ${i / BATCH_SIZE + 1} / ${Math.ceil(targetLines.length / BATCH_SIZE)} ...`);
    
    const aiResults = await processBatch(batchWords);
    console.log(`Debug aiResults keys: ${Object.keys(aiResults).length}`);
    if (i === 0) console.log(aiResults);
    
    for (const info of batchInfo) {
      const level = aiResults[info.word] || 'X';
      if (level !== 'X') {
        if (!existingWords.has(info.word)) {
          results.push({
            word: info.word,
            rate: info.rate,
            level: level,
            rank: info.rank
          });
        }
      }
    }
    
    await delay(1000); // rate limiting
  }

  const c1c2Count = results.filter(r => r.level === 'C1' || r.level === 'C2').length;
  console.log(`Found ${c1c2Count} C1/C2 words in this batch.`);
  
  const updatedList = [...existingList, ...results];
  // Sort by rank
  updatedList.sort((a, b) => a.rank - b.rank);

  writeFileSync(JSON_OUT_PATH, JSON.stringify(updatedList, null, 2));
  console.log(`Updated german_cefr_wordlist.json. New total: ${updatedList.length} words.`);
}

main().catch(console.error);
