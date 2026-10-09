#!/usr/bin/env node
/**
 * 中考词表内容合并器（FT-002-US-02 内容生产流水线工具）
 *
 * 用法：
 *   node scripts/merge-vocab-content.mjs           # 全量合并 → data/zhongkao-vocab-content.json
 *   node scripts/merge-vocab-content.mjs --trial   # 试产批次 → data/zhongkao-vocab-content.trial.json
 *
 * 输入：.tmp/content-chunks/chunk-*.json —— 每个文件是四要素词条的 JSON 数组
 *   （生产分片，字段 word/definition_en/example_en/definition_zh，标准见 docs/中考词表范围与四要素标准.md §2）
 *
 * 合并门禁（与校验器 QR 规则镜像，问题在合并期即拦截）：
 *   1. 四要素非空（镜像 QR-01）；
 *   2. 单词唯一，归一化大小写（镜像 QR-02）；
 *   3. 精确在册（镜像 QR-04）；
 *   4. 覆盖完整（镜像 QR-05）：全量模式要求词表清单全覆盖；试产模式要求试产批次全覆盖；
 *   输出按词表清单顺序排列，每词条仅保留四要素字段。
 *
 * 退出码：0 成功写出；1 数据缺陷（门禁未通过）；2 用法或文件错误
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHUNK_DIR = join(ROOT, '.tmp', 'content-chunks');
const LIST_PATH = join(ROOT, 'data', 'zhongkao-vocab-list.json');
const FULL_OUT = join(ROOT, 'data', 'zhongkao-vocab-content.json');
const TRIAL_OUT = join(ROOT, 'data', 'zhongkao-vocab-content.trial.json');

// 试产批次（US-02 AC-1）：词表前 69 词（a → answer）+ 三个标准边界样例词
// （book 多词性 / Friday 专有名词 / ice cream 多词条目），共 72 词，落在 50～100 区间
const TRIAL_HEAD = 69;
const TRIAL_EXTRA = ['book', 'Friday', 'ice cream'];

const FIELDS = ['word', 'definition_en', 'example_en', 'definition_zh'];

function fail(msg) {
  console.error(`错误: ${msg}`);
  process.exit(2);
}

function loadJson(path, label) {
  if (!existsSync(path)) fail(`无法读取${label}: ${path}`);
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch (e) {
    fail(`${label}不是合法 JSON（${e.message}）: ${path}`);
  }
}

if (process.argv.length > 3 || (process.argv[2] !== undefined && process.argv[2] !== '--trial')) {
  fail('用法: node scripts/merge-vocab-content.mjs [--trial]');
}
const mode = process.argv[2] === '--trial' ? 'trial' : 'full';

const list = loadJson(LIST_PATH, '词表清单');
const listWords = list.words.map((e) => e.word);
const listSet = new Set(listWords);

if (!existsSync(CHUNK_DIR)) fail(`分片目录不存在: ${CHUNK_DIR}`);
const chunkFiles = readdirSync(CHUNK_DIR).filter((f) => /^chunk-\d+\.json$/.test(f)).sort();
if (chunkFiles.length === 0) fail(`分片目录中没有 chunk-*.json 文件: ${CHUNK_DIR}`);

const byExact = new Map(); // word（精确形式）→ entry
const byNorm = new Map(); // 归一化 word → 首次出现的精确形式（镜像 QR-02）
const problems = [];

for (const file of chunkFiles) {
  const arr = loadJson(join(CHUNK_DIR, file), `分片 ${file}`);
  if (!Array.isArray(arr)) fail(`分片 ${file} 顶层不是 JSON 数组`);
  for (const e of arr) {
    const word = typeof e?.word === 'string' ? e.word : '';
    const tag = `${file} ${JSON.stringify(word || '(word 非字符串)')}`;
    // 门禁 1：四要素非空（镜像 QR-01）
    for (const f of FIELDS) {
      if (typeof e?.[f] !== 'string' || e[f].trim() === '') problems.push(`[QR-01] ${tag} 字段 ${f} 为空`);
    }
    if (word === '') continue;
    // 门禁 2：精确在册（镜像 QR-04）
    if (!listSet.has(word)) {
      problems.push(`[QR-04] ${tag} 不在词表清单中`);
      continue;
    }
    // 门禁 3：唯一（镜像 QR-02，归一化大小写）
    const norm = word.trim().toLowerCase();
    if (byNorm.has(norm)) {
      problems.push(`[QR-02] ${tag} 与 ${JSON.stringify(byNorm.get(norm))} 重复（忽略大小写）`);
      continue;
    }
    byNorm.set(norm, word);
    byExact.set(word, e);
  }
}

if (problems.length > 0) {
  console.error(`合并器门禁未通过（${problems.length} 处）:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

// 门禁 4：覆盖检查（镜像 QR-05）
const target = mode === 'trial' ? listWords.slice(0, TRIAL_HEAD).concat(TRIAL_EXTRA) : listWords;
const missing = target.filter((w) => !byExact.has(w));
if (missing.length > 0) {
  const sample = missing.slice(0, 50).map((w) => JSON.stringify(w)).join(', ');
  console.error(
    `覆盖检查未通过: ${mode === 'trial' ? '试产批次' : '词表清单'} ${target.length} 词中有 ${missing.length} 词尚无内容` +
      `（前 50 个: ${sample}${missing.length > 50 ? ' …' : ''}）`,
  );
  process.exit(1);
}

const words = target.map((w) => {
  const e = byExact.get(w);
  return Object.fromEntries(FIELDS.map((f) => [f, e[f]]));
});

const note =
  mode === 'trial'
    ? 'FT-002-US-02 AC-1 试产批次：词表前 69 词（a → answer）+ 标准边界样例 book/Friday/ice cream，共 72 词，供内容负责人审核。试产条目与全量文件 zhongkao-vocab-content.json 中同名词条内容一致，修订时两处同步。'
    : 'FT-002-US-02 全量生产内容：词表清单（1806 词）逐词四要素齐全。生产与校验依据见 docs/中考词表范围与四要素标准.md；由 .tmp/content-chunks/ 分片经 scripts/merge-vocab-content.mjs 合并产出。';

const out = mode === 'trial' ? TRIAL_OUT : FULL_OUT;
const body = words.map((w) => '    ' + JSON.stringify(w)).join(',\n');
writeFileSync(
  out,
  `{\n  "bank_id": "zhongkao",\n  "content_version": "1.0.0",\n  "generated_at": "2026-10-08",\n  "list_version": ${JSON.stringify(list.meta.list_version)},\n  "note": ${JSON.stringify(note)},\n  "words": [\n${body}\n  ]\n}\n`,
  'utf-8',
);

console.log(
  `已写出: ${out}（${mode === 'trial' ? '试产批次' : '全量'} ${words.length} 词；分片 ${chunkFiles.length} 个，已合并条目 ${byExact.size} 条）`,
);
