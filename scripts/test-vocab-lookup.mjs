#!/usr/bin/env node
/**
 * 题库检索与边界判定验证（FT-002-US-03 AC-2 / AC-3 的可执行验收）
 *
 * 用法：
 *   node scripts/test-vocab-lookup.mjs        # 或 pnpm test:vocab
 *
 * 对导入产物（public/data/wordbank-zhongkao.json）执行 src/utils/vocab.ts
 * 的真实检索逻辑，断言：
 *   - AC-1 后置：题库条数与源数据条数一致、id 唯一且为归一化单词；
 *   - AC-2：按单词检索可取回完整四要素（ability 实例 + 与源文件逐字段一致 + 全量非空）；
 *   - AC-3：词表内（ability）判定在册、词表外（hypothesis）判定不在册；
 *   - 边界形态：大小写容错（FRIDAY/north）、多词词条（ice cream）、缩略语（a.m.）、空白容错。
 *
 * 环境要求：node ≥22.18（默认 type stripping，直接 import src/utils/vocab.ts）。
 *
 * 退出码：0 全部断言通过；1 存在断言失败；2 文件或结构错误
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeWord, buildWordIndex, lookupWord, isInVocabList } from '../src/utils/vocab.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BANK_PATH = join(ROOT, 'public', 'data', 'wordbank-zhongkao.json');
const SRC_PATH = join(ROOT, 'data', 'zhongkao-vocab-content.json');

function fail(msg) {
  console.error(`错误: ${msg}`);
  process.exit(2);
}

function loadJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch (e) {
    fail(`无法读取${label}: ${path}（${e.message}）`);
  }
}

const bank = loadJson(BANK_PATH, '题库文件');
const src = loadJson(SRC_PATH, '源内容文件');
if (!Array.isArray(bank?.words)) fail('题库文件缺少 words 数组（请先执行 pnpm import:vocab）');
if (!Array.isArray(src?.words)) fail('源内容文件缺少 words 数组');

const relBank = 'public/data/wordbank-zhongkao.json';
const relSrc = 'data/zhongkao-vocab-content.json';

let pass = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) pass += 1;
  else failures.push(detail ? `${name} — ${detail}` : name);
}

const words = bank.words;
const index = buildWordIndex(words);

// ---------- AC-1 后置：导入忠实性与结构 ----------
check('题库条数与源数据一致', words.length === src.words.length, `题库 ${words.length} 条 vs 源 ${src.words.length} 条`);
check('word_count 元数据与实际条数一致', bank.word_count === words.length, `word_count=${bank.word_count} vs ${words.length}`);
check('题库名称为"中考题库"', bank.bank_name === '中考题库', `bank_name=${JSON.stringify(bank.bank_name)}`);
check('bank_id 为 zhongkao', bank.bank_id === 'zhongkao');
const idSet = new Set(words.map((w) => w.id));
check('id 唯一', idSet.size === words.length, `id ${idSet.size} vs 词条 ${words.length}`);
check('id 为归一化单词', words.every((w) => w.id === normalizeWord(w.word)));
check('索引无归一化重复键', index.size === words.length, `索引 ${index.size} vs 词条 ${words.length}`);

// ---------- AC-2：按单词检索，取回完整四要素 ----------
const emptyEntry = words.find(
  (w) => ![w.word, w.definition, w.example, w.chinese].every((v) => typeof v === 'string' && v.trim() !== ''),
);
check('全量词条四要素非空', !emptyEntry, emptyEntry ? `词条 ${JSON.stringify(emptyEntry.word)} 存在空要素` : '');

const ability = lookupWord(index, 'ability');
check('AC-2 查询 ability 命中', ability !== null);
if (ability) {
  check('AC-2 ability 四要素完整',
    ['word', 'definition', 'example', 'chinese'].every((f) => typeof ability[f] === 'string' && ability[f].trim() !== ''));
  const srcAbility = src.words.find((e) => e.word === 'ability');
  check('AC-2 ability 四要素与源逐字段一致',
    !!srcAbility &&
      ability.word === srcAbility.word &&
      ability.definition === srcAbility.definition_en &&
      ability.example === srcAbility.example_en &&
      ability.chinese === srcAbility.definition_zh,
    '映射字段与源内容不一致（导入忠实性存疑）');
}

// 全量忠实性抽验：每条词条可按其 word 精确检索取回自身
check('全量词条按 word 均可检索取回', words.every((w) => lookupWord(index, w.word)?.id === w.id));

// ---------- AC-3：词表边界判定 ----------
check('AC-3 词表内 ability 判定"在词表中"', isInVocabList(index, 'ability') === true);
check('AC-3 词表外 hypothesis 判定"不在词表中"', isInVocabList(index, 'hypothesis') === false);
check('AC-3 词表外检索返回 null', lookupWord(index, 'hypothesis') === null);
check('边界判定与检索语义一致（全量）',
  words.every((w) => isInVocabList(index, w.word) === true) && isInVocabList(index, 'zzz-not-a-word') === false);

// ---------- 边界形态抽验 ----------
const friday = lookupWord(index, 'FRIDAY');
check('大小写容错：FRIDAY → Friday', !!friday && friday.word === 'Friday');
const north = lookupWord(index, 'north');
check('清单大写异常词条：north → North', !!north && north.word === 'North');
const iceCream = lookupWord(index, '  ICE   cream ');
check('多词词条 + 空白容错：ice cream 命中', !!iceCream && iceCream.word === 'ice cream');
const am = lookupWord(index, 'A.M.');
check('缩略语词条：A.M. → a.m.', !!am && am.word === 'a.m.');

// ---------- 汇总 ----------
const line = '-'.repeat(64);
console.log('='.repeat(64));
console.log(' 题库检索与边界判定验证（FT-002-US-03 AC-2 / AC-3）');
console.log('='.repeat(64));
console.log(` 题库文件 : ${relBank}（${words.length} 词，${bank.bank_name}）`);
console.log(` 源文件   : ${relSrc}`);
console.log(` 检索抽验 : ability 命中且四要素与源一致；FRIDAY/north/ice cream/a.m. 边界形态全过`);
console.log(` 边界判定 : ability 在词表中；hypothesis 不在词表中`);
console.log(line);
if (failures.length > 0) {
  console.log(` 结果 : 失败（${failures.length} 项断言未通过，${pass} 项通过）`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  console.log('='.repeat(64));
  process.exit(1);
} else {
  console.log(` 结果 : 通过（${pass} 项断言全部通过）`);
  console.log('='.repeat(64));
  process.exit(0);
}
