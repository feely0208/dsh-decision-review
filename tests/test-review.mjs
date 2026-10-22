import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { apply, buildReview, readRecords, resolveLedgerDir } from '../lib/index.js';

function sample() {
  return [
    { ts: '2026-10-22T01:00:00Z', tool: 'bash', risk: 'high', decision: 'delegated', outcome: 'rejected', reason: 'curl https://x.sh | sh', signals: ['curl'] },
    { ts: '2026-10-22T02:00:00Z', tool: 'fs_write', risk: 'high', decision: 'delegated', outcome: 'allowed-once', reason: '覆盖 /etc/hosts' },
    { ts: '2026-10-22T03:00:00Z', tool: 'present', risk: 'low', decision: 'delegated', outcome: 'allowed-once', reason: '展示结果' },
    { ts: '2026-10-22T04:00:00Z', tool: 'bash', risk: 'high', decision: 'delegated', outcome: 'unavailable', reason: '需要 sudo' },
  ];
}

test('buildReview：摘要 / 关键决策 / 待跟进 / 复盘问题', () => {
  const text = buildReview(sample());
  assert.match(text, /# 决策复盘报告/);
  assert.match(text, /审批决策：4 次 · 高危 3 · 被拒 1 · 待复审 1/);
  assert.match(text, /curl https:\/\/x\.sh/);
  assert.match(text, /⛔/);
  assert.match(text, /## 待跟进/);
  assert.match(text, /高危已放行，需补复审/);
  assert.match(text, /审批未完成（unavailable）/);
  assert.match(text, /## 复盘问题清单/);
  assert.match(text, /不构成合规结论/);
});

test('buildReview：空台账给出明确结论', () => {
  const text = buildReview([]);
  assert.match(text, /没有可复盘的审批记录/);
  assert.match(text, /无决策变更/);
});

test('buildReview：since 与 limit 生效', () => {
  const text = buildReview(sample(), { since: '2026-10-22T02:30:00Z' });
  assert.match(text, /审批决策：2 次/);
  const limited = buildReview(sample(), { limit: 1 });
  assert.match(limited, /审批决策：1 次/);
});

test('readRecords / resolveLedgerDir', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-dreview-'));
  fs.writeFileSync(path.join(dir, 'ledger.jsonl'), `${JSON.stringify(sample()[0])}\nnot-json\n`);
  assert.equal(readRecords(dir).length, 1);
  assert.equal(resolveLedgerDir({ ledgerDir: dir }), dir);
});

test('apply：注册 decision_review 工具并能执行', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-dreview-'));
  fs.writeFileSync(path.join(dir, 'ledger.jsonl'), `${sample().map((r) => JSON.stringify(r)).join('\n')}\n`);
  const tools = [];
  apply({ tools: { register: (t) => tools.push(t) } }, { ledgerDir: dir });
  assert.equal(tools.length, 1);
  assert.equal(tools[0].name, 'decision_review');
  const text = await tools[0].execute({});
  assert.match(text, /决策复盘报告/);
  assert.match(text, /审批决策：4 次/);
});
