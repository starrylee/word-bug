#!/usr/bin/env node
/**
 * 中考词表导入工具（FT-002-US-03 AC-1「全量导入形成题库」）
 *
 * 用法：
 *   node scripts/import-vocab.mjs        # 或 pnpm import:vocab
 *
 * 流程：加载源内容 → 前置全量校验（复用 scripts/validate-vocab.mjs --full，
 *       QR-01～QR-09 单一真源）→ 字段映射 + 稳定 id → 原子写出应用题库 → 导入报告
 *
 * 源（FT-002-US-02 生产产物）: data/zhongkao-vocab-content.json
 *   词条字段 word / definition_en / example_en / definition_zh
 * 目标（应用题库，src/App.tsx fetch 消费）: public/data/wordbank-zhongkao.json
 *   { bank_id, bank_name: "中考题库", content_version, list_version,
 *     imported_at, word_count, note, words: [{ id, word, definition, example, chinese }] }
 *
 * 幂等性（AC-1 示例 2：导入中断后重跑，不产生重复或脏数据）：
 *   - 确定性转换：id 派生自归一化单词（normalizeWord）、imported_at 取源文件
 *     generated_at，同一源文件重复导入的产物字节级一致；
 *   - 全量替换式导入：目标文件整体重写而非追加，天然无重复；
 *   - 原子写：先写 <目标>.tmp 再 rename，导入中途被杀不会留下半截目标文件，
 *     重跑即恢复，无脏数据残留。
 *
 * id 设计：id = normalizeWord(word)（小写、单空格）。进度数据（learnedWords.wordId）
 *   按词定位，id 跨内容版本稳定；词表大小写定稿修订（如 North→north）不影响 id。
 *
 * 环境要求：node ≥22.18（默认 TypeScript type stripping，本脚本 import
 *   src/utils/vocab.ts 复用归一化逻辑，保证导入 id 与检索键口径一致）。
 *
 * 退出码：0 导入成功；1 数据缺陷（校验未通过 / 结构不一致）；2 用法或文件错误
 */
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, relative, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeWord } from '../src/utils/vocab.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_PATH = join(ROOT, 'data', 'zhongkao-vocab-content.json');
const LIST_PATH = join(ROOT, 'data', 'zhongkao-vocab-list.json');
const VALIDATOR = join(ROOT, 'scripts', 'validate-vocab.mjs');
const OUT_PATH = join(ROOT, 'public', 'data', 'wordbank-zhongkao.json');
const TMP_PATH = OUT_PATH + '.tmp';

const BANK_ID = 'zhongkao';
const BANK_NAME = '中考题库';
const SRC_FIELDS = ['word', 'definition_en', 'example_en', 'definition_zh'];

const NOTE =
  'FT-002-US-03 导入产物：由 data/zhongkao-vocab-content.json（FT-002-US-02 全量生产）' +
  '经 scripts/import-vocab.mjs 转换生成，请勿手改本文件；内容修订请修改源文件后重新执行 ' +
  'pnpm import:vocab（幂等，可重跑）。id 为归一化单词（小写、单空格），跨内容版本稳定。';

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

if (process.argv.length > 2) fail('用法: node scripts/import-vocab.mjs（无参数，路径固定）');

// ---------- 1. 前置全量校验（复用 US-01 校验器，不合格则中止，目标文件不动） ----------
console.log('前置校验: 执行 validate-vocab.mjs --full …\n');
const check = spawnSync(process.execPath, [VALIDATOR, SRC_PATH, '--full', '--list', LIST_PATH], {
  stdio: 'inherit',
});
if (check.status !== 0) {
  console.error(`\n错误: 前置校验未通过（exit ${check.status ?? '被信号中断'}），已中止导入，目标文件未改动`);
  process.exit(1);
}

// ---------- 2. 加载源与清单，结构检查 ----------
const src = loadJson(SRC_PATH, '源内容文件');
const list = loadJson(LIST_PATH, '词表清单');

if (!Array.isArray(src.words) || src.words.length === 0) fail('源内容文件缺少非空 words 数组');
if (src.bank_id !== BANK_ID) fail(`源内容文件 bank_id 不是 "${BANK_ID}": ${JSON.stringify(src.bank_id)}`);
for (const f of ['content_version', 'generated_at', 'list_version']) {
  if (typeof src[f] !== 'string' || src[f].trim() === '') fail(`源内容文件缺少字符串字段 ${f}`);
}
if (typeof list.meta?.word_count !== 'number') fail('词表清单缺少 meta.word_count');

// 三方条数一致（AC-1「导入成功条数与源数据条数一致」的数据前提）
if (list.meta.word_count !== src.words.length) {
  fail(`条数不一致: 清单 meta.word_count=${list.meta.word_count}，源内容 ${src.words.length} 条`);
}

// ---------- 3. 字段映射 + 稳定 id（防御性门禁，理论上前置校验已拦截） ----------
const seenIds = new Map();
const words = src.words.map((e, i) => {
  const no = i + 1;
  for (const f of SRC_FIELDS) {
    if (typeof e?.[f] !== 'string' || e[f].trim() === '') {
      console.error(`错误: 源文件第 ${no} 条字段 ${f} 为空（QR-01 应已拦截，疑似校验器与数据不一致）`);
      process.exit(1);
    }
  }
  const id = normalizeWord(e.word);
  if (seenIds.has(id)) {
    console.error(`错误: 归一化 id 重复: ${JSON.stringify(id)}（第 ${seenIds.get(id)} 与 ${no} 条，QR-02 应已拦截）`);
    process.exit(1);
  }
  seenIds.set(id, no);
  return {
    id,
    word: e.word,
    definition: e.definition_en,
    example: e.example_en,
    chinese: e.definition_zh,
  };
});

// ---------- 4. 构造产物（确定性输出：imported_at 取源 generated_at） ----------
const body = words.map((w) => '    ' + JSON.stringify(w)).join(',\n');
const out = [
  '{',
  `  "bank_id": ${JSON.stringify(BANK_ID)},`,
  `  "bank_name": ${JSON.stringify(BANK_NAME)},`,
  `  "content_version": ${JSON.stringify(src.content_version)},`,
  `  "list_version": ${JSON.stringify(src.list_version)},`,
  `  "imported_at": ${JSON.stringify(src.generated_at)},`,
  `  "word_count": ${words.length},`,
  `  "note": ${JSON.stringify(NOTE)},`,
  `  "words": [`,
  body,
  '  ]',
  '}',
  '',
].join('\n');

// ---------- 5. 幂等比对 + 原子写出 ----------
const existed = existsSync(OUT_PATH) ? readFileSync(OUT_PATH, 'utf-8') : null;
const identical = existed === out;
let writeNote;
if (identical) {
  writeNote = '目标文件已是最新（与本次导入产物字节级一致，无需写入）—— 幂等重跑确认';
} else {
  writeFileSync(TMP_PATH, out, 'utf-8');
  renameSync(TMP_PATH, OUT_PATH); // 原子替换：中断不留半截文件，重跑即恢复
  writeNote = `写入完成（全量替换，.tmp → rename 原子写 ${words.length} 条）`;
}

// ---------- 6. 导入结果记录（AC-1） ----------
const line = '-'.repeat(64);
const rel = (p) => relative(ROOT, p);
console.log('\n' + '='.repeat(64));
console.log(' 中考词表导入报告（FT-002-US-03 AC-1）');
console.log('='.repeat(64));
console.log(` 源内容文件 : ${rel(SRC_PATH)}（${src.words.length} 条，content_version ${src.content_version}）`);
console.log(` 词表清单   : ${rel(LIST_PATH)}（${list.meta.word_count} 词，list_version ${src.list_version}）`);
console.log(` 前置校验   : 合格（QR-01～QR-09，含 QR-05 词表全覆盖，报告见上）`);
console.log(` 目标文件   : ${rel(OUT_PATH)}`);
console.log(` 题库       : ${BANK_NAME}（bank_id=${BANK_ID}，v1 唯一题库）`);
console.log(` 导入结果   : 成功 ${words.length} 条，与源数据条数一致`);
console.log(line);
console.log(` 写入方式   : ${writeNote}`);
console.log('='.repeat(64));
