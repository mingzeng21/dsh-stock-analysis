---
kind: upgrade-guide
description: "Web bundle 现在只装载 stock-analysis 研究 preset，并将其固定为新会话默认项。"
---

# Web 仅使用 stock-analysis 研究 preset

[English](guide.md) | 中文

## 变更

Web bundle 现在只装载 `stock-analysis`，并将其固定为新会话默认项，即使之前保存了 `selectedDefault` 也一样。预设选择设置项被隐藏。该预设使用证券研究身份，并移除 shell、文件系统、任务、规划、委派及仓库指令工具。skill 提供器仅加载 Web bundle 随包交付的股票研究 skill。日志中记录了未装载 preset 的现有会话无法在该 Web 组合下恢复。

## 迁移

1. 升级前导出或完成使用 `standard`、`ptc`、`minimal` 或 `cordis` 的 Web 会话；如需继续恢复这些会话，可通过 profile patch 恢复相应 preset 声明。
2. 检查 `$DSH_HOME/profiles/web/cordis.patch.yml` 中保存的 `selectedDefault` 和股票预设覆盖。移除过时的默认项及复制的编程子插件行，以采用随包交付的研究组合。
3. 新建 Web 会话，确认它使用 `stock-analysis`，股票数据与 `skill` 可用，而 shell 与文件系统工具不存在。
