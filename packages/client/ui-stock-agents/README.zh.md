---
description: "股票 Agents 的 Web 目录、专属对话与可追问的股票看板。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-stock-agents

[English](README.md) | 中文

## 概述

Web 客户端注册一个股票分析侧边栏入口，从 Host 的 skill 元数据构建专属卡片，并加入原生龙虎榜、热股榜与概念板块联动卡片。打开看板直接读取数据，不创建 Session；首次向看板提问时创建 stock-analysis Session，后续提问复用该 Session。无论应用语言如何设置，Agents 自有界面文案均使用简体中文。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [开发备注](#dev-note)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## 使用本包

与 Session 服务、股票 Agents Remote、股票数据客户端、locale 和 slots 一起挂载。点击立即启动的专属卡片会创建新 Session 并开始分析；输入类卡片会等待提交。每次运行都会在首轮前选中 `stock-analysis`、发送显式 `/skill-name` 提示词，并在 Agents 内显示流式对话。点击“龙虎榜观察”会立即打开仪表盘，读取同一最新交易日的三种榜单。点击“热股榜监控”会打开四类当前热度榜单；选中股票后读取近 30 个自然日的日线排名。“概念板块联动”按输入的概念或行业名称匹配目录，把近 120 个自然日的指数日线与当前成分股并列显示。图表按日绘制开高低收蜡烛线和成交量柱，可切换近 30、60、120 个自然日。点击“问看板”可针对当前看板提问，面板显示当前范围、示例问题和 Session 回答；提问后榜单或选中对象变化时会提示数据已变化。最新回答提及的股票会显示为按钮，点击后选中并展开对应看板记录。历史栏保存专属 Session，可在各视图收起。

<a id="understand-the-implementation"></a>
## 理解实现

专属卡片元数据来自随包 skill 中的 `metadata.stockAgent`。面板持有启动、仪表盘和临时历史栏状态；回答和追问由 Session 日志持有，并复用 `conversation.content` factory。看板调用 `ctx.stockClient.dragonTiger()`、`ctx.stockClient.hotRank()` 和板块目录及详情读取；提问时把有长度上限的当前数据快照写入已记录的提示词。龙虎榜看板显示返回样本的涨跌家数、成交额、股票涨跌幅与已提供的带符号金额；缺失字段显示“未提供”。打开 Agent 记录不会切换普通 Conversation 的当前选择。skill 移除后历史仍可打开，但不提供重新运行的卡片。

<a id="further-exploration"></a>
## 进一步探索

参见[股票 Agents 提案](../../../.agents/notes/proposed/feature/2026-10-01-skill-backed-stock-agents.zh.md)与 [Host 目录](../../api/stock-agents-controller/README.zh.md)。

<a id="dev-note"></a>
## 开发备注

新增对话型专属 Agent 的内容放在 `packages/bundle/web-app/skills/<name>/SKILL.md`。龙虎榜观察、热股榜监控、概念板块联动等原生数据视图位于本包，使用面向浏览器的数据客户端。

<a id="model-experience"></a>
## 模型体验

### 卡片显式调用

#### What the model sees

首轮包含以 `/stock-…` 为前缀的用户请求；立即分析任务使用卡片提供的中文提示词。Host skill 加载器随后将所选 skill 正文记为独立的指令消息。stock-analysis preset 及其 skill 要求始终使用简体中文回答。UI 不注册工具 schema。

#### Token effect

skill 卡片发现与历史列表不增加请求 token；提交的提示词和加载的 skill 正文会增加 token。看板提问每次都会把有长度上限的当前榜单快照加入提交的提示词，供模型读取并由 Session 日志重建。打开或刷新看板不增加模型 token。

#### KV Cache effect

首轮提示词和 skill 指令都是持久消息，因此后续轮次保留既有前缀，再追加新内容。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- 对话型专属 Agent 的结果复用完整对话视图。Host Remote 可用后才会显示专属卡片；各看板需要股票 provider 提供数据。当前成分股不代表历史成分，也不能单凭指数涨跌判断个股的概念相关度。
- 看板追问的 Session 会出现在 Agents 历史栏，重新打开时恢复看板和对话记录。看板会重新取数，下一条提问包含更新后的快照。
- 不发布运行时不变量配套模块；页面直接呈现 Host 维护的 Session 与目录状态，不另存一份持久副本。
