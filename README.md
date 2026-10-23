# @deepwhale-cn/dsh-decision-review

审批台账是「流水」，复盘才是「结账」。这个插件把台账整理成一份能拿去开会的复盘报告。

**关键词**：决策复盘 · 审批台账 · 事后复盘 · 审计 · 关键决策 · DeepSeek Harness 插件

## 不装它会怎样

审批时每条都点了「通过」，一个月后有人问「上个月哪些高危操作被放行了、为什么放」——
台账在，但没人把它整理成结论。**记录 ≠ 复盘。**

## 它产出什么

| 板块 | 内容 |
|---|---|
| 摘要 | 决策总数 / 高危 / 被拒 / 待复审 |
| 关键决策 | 高危与被拒记录：时间、工具、理由、结果 |
| 待跟进 | 高危但被放行的、审批不可用的（需要补审批或补证据） |
| 复盘问题清单 | 这次在拍什么板、依据是什么、有没有替代方案、出问题怎么兜 |

## 前置

读的是 `@deepwhale-cn/dsh-approval-ledger` 写的 `ledger.jsonl`
（默认 `$DSH_HOME/approval-ledger/` 或 `~/.dsh/approval-ledger/`）。
台账插件没装 / 没有记录时，报告会如实说没有数据，不会编。

## 安装

```bash
dsh plugin --profile web add @deepwhale-cn/dsh-decision-review
```

## 用法

装好后直接对 agent 说：

> 用 decision_review 复盘一下最近这批审批，重点看高危和被拒的。

| 参数 | 说明 |
|---|---|
| `since` | ISO 时间下界，例如 `2026-10-01T00:00:00Z` |
| `limit` | 最多复盘多少条记录，默认 200 |

## 边界（重要）

- **v0.1 只做「台账 → 复盘」的框架**：会话事件流（模型推理、计划变更）要等后续版本接入；那层需要 sessionQuery，属于企业版能力。
- **它是辅助工具，不是审计结论**：报告只把事实摆出来，判断与责任在组织。
- 与 [dsh-enterprise-suite](https://github.com/feely0208/dsh-enterprise-suite) 的关系：那个用「一个授权」包住台账 + 复盘 + 导出 + 定时；这个可以单独装、单独用。

本插件是一个工具。使用者必须遵守所在地区法律法规，**对使用本项目造成的任何后果自行承担责任。**

---

[![](https://img.shields.io/badge/powered_by-dwh-005A8C?style=flat&logoColor=white)](https://deepwhale.org.cn)
