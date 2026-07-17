/**
 * 在真实书籍语料上评估规则层章节识别效果。
 * 用法：npx tsx <this> <corpusDir> [--json out.json]
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import jschardet from 'jschardet';
import { detectChaptersDetailed } from '../../lib/chapter/index';

interface Row {
  file: string;
  sizeKB: number;
  encoding: string;
  textLength: number;
  chapters: number;
  confidence: string;
  familyId: string | null;
  sampleTitles: string[];
}

const walk = (dir: string): string[] => {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...walk(full));
    } else if (extname(name).toLowerCase() === '.txt') {
      out.push(full);
    }
  }
  return out;
};

const decode = (buf: Buffer): { text: string; encoding: string } => {
  // 与应用一致：jschardet 检测后用 TextDecoder 解码
  const ascii = Array.from(buf.subarray(0, 100000))
    .map((b) => String.fromCharCode(b))
    .join('');
  const detected = jschardet.detect(ascii);
  let encoding = detected.encoding || 'utf-8';
  // Node 的 TextDecoder 不认 jschardet 的部分别名
  const alias: Record<string, string> = { 'windows-1252': 'utf-8', ascii: 'utf-8', 'ISO-8859-1': 'utf-8' };
  encoding = alias[encoding] || encoding;
  try {
    return { text: new TextDecoder(encoding).decode(buf), encoding };
  } catch {
    return { text: new TextDecoder('utf-8').decode(buf), encoding: `${encoding}(fallback utf-8)` };
  }
};

const corpusDir = process.argv[2];
const jsonFlag = process.argv.indexOf('--json');
const files = walk(corpusDir);

const rows: Row[] = [];
for (const file of files) {
  try {
    const buf = readFileSync(file);
    const { text: raw, encoding } = decode(buf);
    const text = raw.replace(/(?:\r\n|\r|\n)+/g, '\n');
    const detection = detectChaptersDetailed(text);
    rows.push({
      file: file.replace(corpusDir, '').replace(/^\//, ''),
      sizeKB: Math.round(buf.length / 1024),
      encoding,
      textLength: text.length,
      chapters: detection.chapters.length,
      confidence: detection.confidence,
      familyId: detection.familyId,
      sampleTitles: detection.chapters.slice(0, 3).map((c) => c.title),
    });
  } catch (error) {
    rows.push({
      file: file.replace(corpusDir, '').replace(/^\//, ''),
      sizeKB: 0,
      encoding: 'ERROR',
      textLength: 0,
      chapters: 0,
      confidence: `error: ${error instanceof Error ? error.message : String(error)}`,
      familyId: null,
      sampleTitles: [],
    });
  }
}

const byConfidence = rows.reduce<Record<string, number>>((acc, r) => {
  const key = r.confidence.startsWith('error') ? 'error' : r.confidence;
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {});
const byFamily = rows.reduce<Record<string, number>>((acc, r) => {
  const key = r.familyId ?? '(none)';
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {});

console.log(`\n总计 ${rows.length} 本\n`);
console.log('置信度分布：', byConfidence);
console.log('胜出家族分布：', byFamily);

const chapterCounts = rows.filter((r) => r.chapters > 0).map((r) => r.chapters);
chapterCounts.sort((a, b) => a - b);
console.log(
  `\n识别出章节的书：${chapterCounts.length}/${rows.length}`,
  `中位数章节数：${chapterCounts[Math.floor(chapterCounts.length / 2)]}`,
  `最少：${chapterCounts[0]} 最多：${chapterCounts[chapterCounts.length - 1]}`,
);

console.log('\n=== 未识别出章节 (none) ===');
rows
  .filter((r) => r.confidence === 'none')
  .slice(0, 40)
  .forEach((r) => console.log(`  [${r.sizeKB}KB ${r.encoding}] ${r.file}`));

console.log('\n=== 低置信度 (low) ===');
rows
  .filter((r) => r.confidence === 'low')
  .slice(0, 40)
  .forEach((r) => console.log(`  [${r.chapters}章 ${r.familyId}] ${r.file} :: ${r.sampleTitles.join(' | ')}`));

console.log('\n=== 可疑：章节数异常多 (>500) ===');
rows
  .filter((r) => r.chapters > 500)
  .forEach((r) => console.log(`  [${r.chapters}章 ${r.familyId}] ${r.file} :: ${r.sampleTitles.join(' | ')}`));

if (jsonFlag > -1) {
  writeFileSync(process.argv[jsonFlag + 1], JSON.stringify(rows, null, 2));
}
