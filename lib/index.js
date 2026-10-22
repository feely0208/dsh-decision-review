/**
 * `@deepwhale-cn/dsh-decision-review`
 *
 * 决策复盘：读审批台账（`@deepwhale-cn/dsh-approval-ledger` 写的 ledger.jsonl），
 * 整理成一份可复盘的报告：
 *   - 摘要：决策总数 / 高危 / 被拒 / 待复审
 *   - 关键决策：高危与被拒记录（时间、工具、理由、结果）
 *   - 待跟进：高危但被放行的、审批不可用的（需要补审批或补证据）
 *   - 复盘问题清单：这次在拍什么板、依据是什么、有没有替代方案、出问题怎么兜
 *
 * 定位：v0.1 先做"台账 → 复盘"的框架；会话事件流（模型推理、计划变更）在
 * 后续版本接入（需要 sessionQuery，属于企业版能力）。
 *
 * @module @deepwhale-cn/dsh-decision-review
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { defineTool } from '@deepseek-ai/dsh-tools';

export const name = 'decision-review';
export const inject = ['tools'];

const TEXT_OUTPUT = {
  schema: { type: 'string' },
  render: (_args, value) => [{ type: 'text', text: value }],
};

/** 台账目录解析（与 approval-ledger 保持一致） */
export function resolveLedgerDir(config = {}) {
  if (typeof config.ledgerDir === 'string' && config.ledgerDir.trim() !== '') return config.ledgerDir;
  const home = process.env.DSH_HOME;
  return home !== undefined && home !== ''
    ? path.join(home, 'approval-ledger')
    : path.join(os.homedir(), '.dsh', 'approval-ledger');
}

export function readRecords(dir) {
  const file = path.join(dir, 'ledger.jsonl');
  if (!existsSync(file)) return [];
  const records = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (line.trim() === '') continue;
    try {
      records.push(JSON.parse(line));
    } catch {
      // 坏行跳过
    }
  }
  return records;
}

function fmtTs(ts) {
  return String(ts ?? '').slice(0, 19).replace('T', ' ');
}

/**
 * 生成复盘报告（纯函数，便于测试）。
 * @param {object[]} records 台账记录
 * @param {{limit?: number, since?: string}} options
 * @returns {string}
 */
export function buildReview(records, options = {}) {
  const since = options.since ? Date.parse(options.since) : null;
  const filtered = records
    .filter((r) => since === null || Date.parse(r.ts) >= since)
    .sort((a, b) => String(a.ts ?? '').localeCompare(String(b.ts ?? '')));
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 200;
  const scoped = filtered.slice(-limit);

  const high = scoped.filter((r) => r.risk === 'high');
  const rejected = scoped.filter((r) => r.outcome === 'rejected');
  const followUp = high.filter((r) => r.outcome === 'allowed-once');
  const unavailable = scoped.filter((r) => r.outcome === 'unavailable' || r.outcome === 'cancelled');

  const lines = [];
  lines.push('# 决策复盘报告', '');
  if (scoped.length === 0) {
    lines.push(
      '台账里没有可复盘的审批记录。',
      '',
      '说明：本报告的数据来源是审批台账（agent 触发需要审批的操作时才会产生记录）。',
      '如果这一轮确实没有任何需要审批的动作，那这份复盘就是"无决策变更"的结论。',
    );
    return lines.join('\n');
  }

  const first = fmtTs(scoped[0].ts);
  const last = fmtTs(scoped[scoped.length - 1].ts);
  lines.push(
    `时间范围：${first} ~ ${last}`,
    `审批决策：${String(scoped.length)} 次 · 高危 ${String(high.length)} · 被拒 ${String(rejected.length)} · 待复审 ${String(followUp.length)}`,
    '',
  );

  lines.push('## 关键决策', '');
  if (high.length === 0 && rejected.length === 0) {
    lines.push('- 本时间段没有高危操作，也没有被拒绝的操作。');
  } else {
    for (const r of [...new Set([...high, ...rejected])]) {
      const mark = r.outcome === 'rejected' ? '⛔' : '⚠️';
      lines.push(
        `- ${mark} ${fmtTs(r.ts)} · ${String(r.tool ?? '?')} · 风险 ${String(r.risk ?? '?')} · 结果 ${String(r.outcome ?? '?')}`,
        `  - 理由：${String(r.reason ?? '（未给出）').slice(0, 200)}`,
      );
      if (Array.isArray(r.signals) && r.signals.length > 0) {
        lines.push(`  - 命中特征：${r.signals.slice(0, 4).join('；')}`);
      }
    }
  }
  lines.push('');

  lines.push('## 待跟进', '');
  const followLines = [];
  for (const r of followUp) {
    followLines.push(
      `- 🔎 高危已放行，需补复审：${fmtTs(r.ts)} · ${String(r.tool ?? '?')} · ${String(r.reason ?? '').slice(0, 120)}`,
    );
  }
  for (const r of unavailable) {
    followLines.push(
      `- ❓ 审批未完成（${String(r.outcome ?? '?')}），需补审批或补证据：${fmtTs(r.ts)} · ${String(r.tool ?? '?')}`,
    );
  }
  if (followLines.length === 0) followLines.push('- 没有需要跟进的项。');
  lines.push(...followLines, '');

  lines.push('## 复盘问题清单', '');
  lines.push(
    '- 这轮拍板的关键决策是什么？每个决策的依据是被验证过的事实，还是假设？',
    '- 高危操作有没有更安全的替代方案（先 dry-run / 缩小范围 / 分步执行）？',
    '- 被拒绝的操作，是规则过严还是操作本身就该拒？规则要不要调？',
    '- 如果今天这个高危动作真出了问题，回滚与取证路径是什么？',
    '- 哪些决策下次可以固化成规则或检查，避免重复人工判断？',
    '',
    '## 口径说明',
    '',
    '本报告只基于审批台账（谁在什么时候请求了什么、风险多高、最后批没批），',
    '不包含模型推理过程与计划变更；会话事件流的复盘属于后续版本能力。',
    '报告为复盘辅助材料，不构成合规结论。',
  );
  return lines.join('\n');
}

export function apply(ctx, config) {
  const cfg = config !== null && typeof config === 'object' ? config : {};
  const ledgerDir = resolveLedgerDir(cfg);

  ctx.tools.register(defineTool({
    name: 'decision_review',
    description:
      '生成决策复盘报告：从审批台账提取关键决策（高危/被拒）、待复审项与复盘问题清单。用于回答「这轮做了哪些关键决策、有没有风险没交代」。',
    parameters: {
      since: { type: 'string', description: 'ISO 时间下界，例如 2026-10-22T00:00:00Z。' },
      limit: { type: 'number', description: '最多复盘多少条记录，默认 200。' },
    },
    output: TEXT_OUTPUT,
    isConcurrencySafe: () => true,
    execute: async (args) => buildReview(readRecords(ledgerDir), args ?? {}),
    presentCall: () => ({ card: 'generic', kind: 'read', title: '生成决策复盘' }),
  }));
}
