/**
 * Pipeline script for processing de_full.txt frequency list and generating C1/C2 CEFR levels via Gemini LLM.
 *
 * Usage:
 *   pnpm --filter @vocabahn/api generate:c1-c2              # Runs default range or from START_INDEX to END_INDEX
 *   pnpm --filter @vocabahn/api generate:c1-c2 --stats      # Outputs statistics on current german_cefr_wordlist.json
 *   START_INDEX=14000 END_INDEX=20000 pnpm --filter @vocabahn/api generate:c1-c2
 */
import { GoogleGenAI } from '@google/genai';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const DE_FULL_PATH = path.resolve(__dirname, '../../../data/de_full.txt');
const JSON_OUT_PATH = path.resolve(__dirname, '../../../data/german_cefr_wordlist.json');

const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '100', 10);
const START_INDEX = parseInt(process.env.START_INDEX || '14000', 10);
const END_INDEX = parseInt(process.env.END_INDEX || '20000', 10);

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type WordEntry = { word: string; rate: number; level: string; rank: number };

function loadWordlist(): WordEntry[] {
  try {
    return JSON.parse(readFileSync(JSON_OUT_PATH, 'utf-8'));
  } catch {
    console.error('Could not read existing JSON, starting fresh');
    return [];
  }
}

function printStats(list: WordEntry[]) {
  const counts: Record<string, number> = {};
  for (const entry of list) {
    counts[entry.level] = (counts[entry.level] || 0) + 1;
  }

  console.log('\n=== CEFR Wordlist Statistics ===');
  console.log(`Total categorized entries: ${list.length}`);
  console.log('Breakdown by level:');
  const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'X'];
  for (const lvl of levels) {
    console.log(`  ${lvl.padEnd(4)}: ${counts[lvl] || 0}`);
  }

  const c1c2Total = (counts['C1'] || 0) + (counts['C2'] || 0);
  console.log(`Total C1/C2 words: ${c1c2Total}`);
  console.log('================================\n');
}

async function processBatch(client: GoogleGenAI, words: string[]): Promise<Record<string, string>> {
  const prompt = `You are a German linguistics expert. I have a list of German words. Categorize each word by its CEFR level (A1, A2, B1, B2, C1, C2). If it's a proper noun, extremely obscure, a typo, or not a valid word, assign "X".

Return the output strictly as a JSON object where the key is the word, and the value is the CEFR level.

Words:
${words.join(', ')}`;

  let retries = 3;
  while (retries > 0) {
    try {
      const res = await client.models.generateContent({
        model: process.env.GEMINI_MODEL || 'gemini-3.7-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        },
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
  const isStatsOnly = process.argv.includes('--stats');
  const existingList = loadWordlist();

  if (isStatsOnly) {
    printStats(existingList);
    return;
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is not set. Please set GEMINI_API_KEY in your environment or .env file.');
    printStats(existingList);
    process.exit(1);
  }

  const client = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  console.log('Loading de_full.txt...');
  const lines = readFileSync(DE_FULL_PATH, 'utf-8').split('\n').filter(Boolean);

  const existingWords = new Set(existingList.map((e) => e.word));
  const targetLines = lines.slice(START_INDEX, END_INDEX);

  console.log(`Scanning frequency ranks ${START_INDEX + 1} to ${END_INDEX} (${targetLines.length} candidate lines)...`);

  // Parse lines and filter out words already categorized
  const candidateInfo = targetLines
    .map((line, idx) => {
      const [word, rateStr] = line.split(' ');
      return { word, rate: parseInt(rateStr, 10), rank: START_INDEX + idx + 1 };
    })
    .filter((info) => info.word && !existingWords.has(info.word));

  console.log(`Found ${candidateInfo.length} uncategorized words to process in range.`);

  if (candidateInfo.length === 0) {
    console.log('All words in the specified range are already categorized.');
    printStats(existingList);
    return;
  }

  const results: WordEntry[] = [];

  for (let i = 0; i < candidateInfo.length; i += BATCH_SIZE) {
    const batchInfo = candidateInfo.slice(i, i + BATCH_SIZE);
    const batchWords = batchInfo.map((b) => b.word);
    const currentBatchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(candidateInfo.length / BATCH_SIZE);

    console.log(`Processing batch ${currentBatchNum} / ${totalBatches} (${batchWords.length} words)...`);

    const aiResults = await processBatch(client, batchWords);

    for (const info of batchInfo) {
      const level = aiResults[info.word] || 'X';
      if (level !== 'X') {
        results.push({
          word: info.word,
          rate: info.rate,
          level: level,
          rank: info.rank,
        });
      }
    }

    await delay(1000);
  }

  const c1c2Count = results.filter((r) => r.level === 'C1' || r.level === 'C2').length;
  console.log(`Classified ${results.length} valid words (${c1c2Count} C1/C2) in this run.`);

  const updatedList = [...existingList, ...results];
  updatedList.sort((a, b) => a.rank - b.rank);

  writeFileSync(JSON_OUT_PATH, JSON.stringify(updatedList, null, 2));
  console.log(`Updated german_cefr_wordlist.json.`);
  printStats(updatedList);
}

main().catch(console.error);
