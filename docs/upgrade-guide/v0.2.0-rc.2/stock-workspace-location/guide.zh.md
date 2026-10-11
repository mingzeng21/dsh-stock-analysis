---
kind: upgrade-guide
description: "新建 Web 股票研究工作区改用应用数据目录，不再使用 Documents 目录。"
---

# Web 股票研究文件使用应用数据目录

[English](guide.md) | 中文

## 变更

Web 股票研究 bundle 将首次使用的工作区建在 `$DSH_HOME/workspaces/stock-analysis`，不再建在 `<Documents>/deepseek-harness/default-workspace`。已登记的工作区保留其存储路径。Web bundle 隐藏工作区选择，正常启动时新用户无需挑选目录。设置了 `firstUseDirectory` 后，profile 中的 `documentsDirectory` 覆盖值不再控制这一路径。

## 迁移

1. 保留已登记的工作区；它仍从记录的路径打开。按该路径备份文件。
2. 如果 `$DSH_HOME/profiles/web/cordis.patch.yml` 用 `documentsDirectory` 指定首次使用的 Web 数据目录，而仍需自定义位置，请改为设置绝对路径的 `firstUseDirectory`。
3. 在全新 profile 中打开 Conversation，确认创建的目录是 `$DSH_HOME/workspaces/stock-analysis`。
