#!/usr/bin/env node
/**
 * 中考词表质量校验器（FT-002-US-01 AC-3「合格判定规则」的可执行实现）
 *
 * 用法：
 *   node scripts/validate-vocab.mjs <content.json> [--list <vocab-list.json>] [--full] [--json <report.json>]
 *
 * 参数：
 *   content.json        待校验的四要素内容文件（格式见 docs/中考词表范围与四要素标准.md §2.1）
 *   --list <path>       词表清单文件，默认 data/zhongkao-vocab-list.json
 *   --full              启用 QR-05 词表全覆盖检查（全量生产/US-04 阶段使用；试产阶段省略）
 *   --json <path>       另存机器可读的 JSON 校验报告
 *
 * 退出码：
 *   0  合格（BLOCKER 规则全部通过，允许存在 WARNING）
 *   1  不合格（存在任一 BLOCKER 违规）
 *   2  用法或文件错误
 *
 * 规则定义与文档同步维护：docs/中考词表范围与四要素标准.md §3
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_LIST = resolve(ROOT, 'data', 'zhongkao-vocab-list.json');

// 中文判定：CJK 统一表意文字 + 扩展A + 兼容表意 + CJK 标点 + 全角符号
const CJK_RE = /[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/;

const RULES = [
  { id: 'QR-01', name: '四要素非空', level: 'blocker' },
  { id: 'QR-02', name: '单词唯一', level: 'blocker' },
  { id: 'QR-03', name: '纯英文性', level: 'blocker' },
  { id: 'QR-04', name: '词条在册', level: 'blocker' },
  { id: 'QR-05', name: '词表全覆盖', level: 'blocker', optional: true },
  { id: 'QR-06', name: '例句含目标词', level: 'warning' },
  { id: 'QR-07', name: '例句句式规范', level: 'warning' },
  { id: 'QR-08', name: '英文释义简明（≤15词）', level: 'warning' },
  { id: 'QR-09', name: '例句长度适配（≤18词）', level: 'warning' },
];

// 常见不规则变形（QR-06 best-effort 匹配用）
const IRREGULAR = {
  be: ['be', 'am', 'is', 'are', 'was', 'were', 'been', 'being'],
  do: ['do', 'does', 'did', 'done', 'doing'],
  go: ['go', 'goes', 'went', 'gone', 'going'],
  have: ['have', 'has', 'had', 'having'],
  i: ['i', 'me', 'my', 'mine'],
  he: ['he', 'him', 'his'],
  she: ['she', 'her', 'hers'],
  we: ['we', 'us', 'our', 'ours'],
  they: ['they', 'them', 'their', 'theirs'],
  child: ['child', 'children'],
  man: ['man', 'men'],
  woman: ['woman', 'women'],
  foot: ['foot', 'feet'],
  tooth: ['tooth', 'teeth'],
  mouse: ['mouse', 'mice'],
  good: ['good', 'better', 'best'],
  bad: ['bad', 'worse', 'worst'],
  many: ['many', 'more', 'most'],
  little: ['little', 'less', 'least'],
};

function inflectionCandidates(word) {
  const key = word.toLowerCase();
  if (Object.hasOwn(IRREGULAR, key)) return IRREGULAR[key];
  const set = new Set([word]);
  if (key.length <= 2) return [...set]; // a / I / as 等超短词仅做原形精确匹配
  set.add(word + 's');
  set.add(word + 'es');
  if (/[^aeiou]y$/.test(key)) set.add(word.slice(0, -1) + 'ies');
  set.add(word + 'ed');
  set.add(word + 'd');
  if (key.endsWith('e')) set.add(word.slice(0, -1) + 'ing');
  else set.add(word + 'ing');
  set.add(word + 'er');
  set.add(word + 'est');
  return [...set];
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function exampleContainsWord(example, word) {
  return inflectionCandidates(word).some((c) => {
    // 候选形以非单词字符（如缩略语句点 a.m./Mr.）结尾/开头时，\b 两侧均为非单词字符、必然匹配失败，
    // 此类候选省略对应边界（规则语义不变，仍为 best-effort）。FT-002-US-02 试产修正。
    const lead = /^\w/.test(c) ? '\\b' : '';
    const trail = /\w$/.test(c) ? '\\b' : '';
    return new RegExp(`${lead}${escapeRe(c)}${trail}`, 'i').test(example);
  });
}

function wordCount(s) {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function fail(msg) {
  console.error(`错误: ${msg}`);
  process.exit(2);
}

function loadJson(path, label) {
  let raw;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch {
    fail(`无法读取${label}: ${path}`);
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    fail(`${label}不是合法 JSON（${e.message}）: ${path}`);
  }
}

// ---------- 参数解析 ----------
const argv = process.argv.slice(2);
let contentPath = null;
let listPath = DEFAULT_LIST;
let full = false;
let jsonReportPath = null;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--list') listPath = resolve(argv[++i] ?? fail('--list 缺少路径参数'));
  else if (a === '--full') full = true;
  else if (a === '--json') jsonReportPath = resolve(argv[++i] ?? fail('--json 缺少路径参数'));
  else if (a === '--help' || a === '-h') {
    console.log('用法: node scripts/validate-vocab.mjs <content.json> [--list <vocab-list.json>] [--full] [--json <report.json>]');
    process.exit(0);
  } else if (a.startsWith('--')) fail(`未知参数: ${a}`);
  else if (contentPath === null) contentPath = resolve(a);
  else fail(`多余的位置参数: ${a}`);
}
if (contentPath === null) {
  console.log('用法: node scripts/validate-vocab.mjs <content.json> [--list <vocab-list.json>] [--full] [--json <report.json>]');
  fail('缺少待校验的内容文件路径');
}

// ---------- 数据加载 ----------
const content = loadJson(contentPath, '内容文件');
if (!Array.isArray(content.words)) fail('内容文件缺少 words 数组（格式见标准文档 §2.1）');

const list = loadJson(listPath, '词表清单');
if (!Array.isArray(list.words) || typeof list.meta?.word_count !== 'number') {
  fail('词表清单格式不正确（缺少 meta.word_count 或 words 数组）');
}
if (list.meta.word_count !== list.words.length) {
  fail(`词表清单完整性校验失败: meta.word_count=${list.meta.word_count} 与实际词条数 ${list.words.length} 不一致`);
}
const listWords = new Set(list.words.map((e) => e.word));

const entries = content.words;
const details = [];
const counts = Object.fromEntries(RULES.map((r) => [r.id, 0]));

function record(ruleId, message) {
  counts[ruleId] += 1;
  const rule = RULES.find((r) => r.id === ruleId);
  details.push({ rule: ruleId, level: rule.level, message });
}

const FIELDS = ['word', 'definition_en', 'example_en', 'definition_zh'];

// ---------- 逐条校验 ----------
const seen = new Map(); // 归一单词 -> 首次出现的行号（1 起，供 QR-02 定位）
entries.forEach((entry, idx) => {
  const no = idx + 1;
  const tag = `#${no} ${typeof entry?.word === 'string' ? JSON.stringify(entry.word) : '(word 非字符串)'}`;

  // QR-01 四要素非空
  for (const f of FIELDS) {
    const v = entry?.[f];
    if (typeof v !== 'string' || v.trim() === '') {
      record('QR-01', `${tag} 字段 ${f} 为空或非字符串`);
    }
  }
  if (typeof entry?.word !== 'string' || entry.word.trim() === '') return; // 后续规则无从判定

  const word = entry.word;

  // QR-02 单词唯一（大小写不敏感）
  const key = word.trim().toLowerCase();
  if (seen.has(key)) record('QR-02', `${tag} 与第 ${seen.get(key)} 条重复（忽略大小写）`);
  else seen.set(key, no);

  // QR-03 纯英文性（英文释义、例句不得含中文/全角字符）
  for (const f of ['definition_en', 'example_en']) {
    const v = entry[f];
    if (typeof v === 'string' && CJK_RE.test(v)) {
      record('QR-03', `${tag} 字段 ${f} 含中文或全角字符（例句不得附中文翻译，英文释义不得混入中文）`);
    }
  }

  // QR-04 词条在册（与清单登记形式完全一致，含大小写与标点）
  if (!listWords.has(word)) {
    const hint = listWords.has(word.trim()) ? '（与清单词条仅差首尾空白）' : '';
    record('QR-04', `${tag} 不在词表清单中${hint}`);
  }

  // 以下为 WARNING 级，字段缺失时跳过
  const en = typeof entry.definition_en === 'string' ? entry.definition_en : '';
  const ex = typeof entry.example_en === 'string' ? entry.example_en : '';

  // QR-06 例句含目标词（原形或屈折变形，best-effort）
  if (ex.trim() !== '' && !exampleContainsWord(ex, word)) {
    record('QR-06', `${tag} 例句未包含该单词（原形或常见变形），请人工确认`);
  }

  // QR-07 例句句式规范
  if (ex.trim() !== '') {
    if (!/^[A-Z]/.test(ex.trim()) || !/[.!?]$/.test(ex.trim())) {
      record('QR-07', `${tag} 例句不以大写字母开头或未以 . ! ? 结尾`);
    }
  }

  // QR-08 英文释义简明
  if (en.trim() !== '' && wordCount(en) > 15) {
    record('QR-08', `${tag} 英文释义 ${wordCount(en)} 词，超过 15 词告警线`);
  }

  // QR-09 例句长度适配
  if (ex.trim() !== '' && wordCount(ex) > 18) {
    record('QR-09', `${tag} 例句 ${wordCount(ex)} 词，超过 18 词告警线（中考难度适配）`);
  }
});

// QR-05 词表全覆盖（--full 时）
if (full) {
  const inContent = new Set(entries.map((e) => (typeof e?.word === 'string' ? e.word : '')).filter(Boolean));
  const missing = [...listWords].filter((w) => !inContent.has(w));
  if (missing.length > 0) {
    const sample = missing.slice(0, 50).map((w) => JSON.stringify(w)).join(', ');
    record('QR-05', `词表清单 ${listWords.size} 词中有 ${missing.length} 词缺少四要素内容（前 50 个: ${sample}${missing.length > 50 ? ' …' : ''}）`);
  }
}

// ---------- 汇总与报告 ----------
const blockers = RULES.filter((r) => r.level === 'blocker');
const failedBlockers = blockers.filter((r) => counts[r.id] > 0 && (!r.optional || full));
const warnRules = RULES.filter((r) => r.level === 'warning');
const warnTotal = warnRules.reduce((s, r) => s + counts[r.id], 0);
const passed = failedBlockers.length === 0;

const mode = full ? '全量校验（--full，含 QR-05 词表全覆盖）' : '试产校验（未启用 --full）';
const line = '-'.repeat(64);

console.log('='.repeat(64));
console.log(' 中考词表质量校验报告（FT-002-US-01 AC-3）');
console.log('='.repeat(64));
console.log(`内容文件 : ${contentPath}`);
console.log(`词表清单 : ${listPath}（${listWords.size} 词）`);
console.log(`校验模式 : ${mode}`);
console.log(`词条数量 : ${entries.length}`);
console.log(line);
for (const r of RULES) {
  if (r.optional && !full) {
    console.log(`规则 ${r.id}  ${r.name.padEnd(18)} [未启用]`);
  } else {
    const label = r.level === 'blocker' ? '不合格项' : '告警';
    console.log(`规则 ${r.id}  ${r.name.padEnd(18)} [${label}] ${counts[r.id]} 处`);
  }
}
console.log(line);
if (details.length > 0) {
  for (const d of details) console.log(`  [${d.rule}/${d.level === 'blocker' ? '不合格' : '告警'}] ${d.message}`);
  console.log(line);
}
console.log(`结论 : ${passed ? '合格' : '不合格'}（${failedBlockers.reduce((s, r) => s + counts[r.id], 0)} 项不合格，${warnTotal} 处告警）`);
console.log('='.repeat(64));

if (jsonReportPath) {
  const report = {
    generated_at: new Date().toISOString(),
    content_file: contentPath,
    list_file: listPath,
    mode,
    entry_count: entries.length,
    list_size: listWords.size,
    summary: Object.fromEntries(RULES.map((r) => [r.id, { name: r.name, level: r.level, enabled: !(r.optional && !full), count: counts[r.id] }])),
    details,
    passed,
  };
  writeFileSync(jsonReportPath, JSON.stringify(report, null, 2) + '\n', 'utf-8');
  console.log(`JSON 报告已写出: ${jsonReportPath}`);
}

process.exit(passed ? 0 : 1);
