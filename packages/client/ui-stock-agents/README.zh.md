---
description: "基于 skill 的股票 Agents 的 Web 侧边栏目录、启动表单与历史记录。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-stock-agents

[English](README.md) | 中文

## 概述

Web 客户端注册一个股票分析侧边栏入口，从 Host 的 skill 元数据构建卡片，并列出持久化的专属 Agent Session。无论应用语言如何设置，Agents 自有界面文案均使用简体中文；股票 preset 要求回答使用简体中文。卡片依据 `SKILL.md` 元数据打开输入表单，或直接开始分析。

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

与 Session 服务、股票 Agents Remote、locale、slots 和 Workspace UI 一起挂载。点击立即启动的卡片会创建新 Session 并开始分析；输入类卡片会等到用户提交条件后再启动。每次运行都会在首轮前选中 `stock-analysis`、发送显式 `/skill-name` 提示词，并在面板内显示流式对话。面板根据 Session 列表投影显示所有专属记录；重新分析会使用可编辑的旧条件创建另一个 Session。

<a id="understand-the-implementation"></a>
## 理解实现

卡片元数据来自随包 skill 中的 `metadata.stockAgent`，面板只显示其中的中文字段。面板只持有启动状态；回答和追问由 Session 日志持有。结果与追问复用 `conversation.content` factory，不离开面板。同一 Session 在普通 Chat 打开时，对话标题旁显示专属 Agent 身份。skill 移除后历史仍可打开，但不提供重新运行的卡片。

<a id="further-exploration"></a>
## 进一步探索

参见[股票 Agents 提案](../../../.agents/notes/proposed/feature/2026-10-01-skill-backed-stock-agents.zh.md)与 [Host 目录](../../api/stock-agents-controller/README.zh.md)。

<a id="dev-note"></a>
## 开发备注

新增专属 Agent 的内容放在 `packages/bundle/web-app/skills/<name>/SKILL.md`；UI 没有逐个 Agent 的分支。

<a id="model-experience"></a>
## 模型体验

### 卡片显式调用

#### What the model sees

首轮包含以 `/stock-…` 为前缀的用户请求；立即分析任务使用卡片提供的中文提示词。Host skill 加载器随后将所选 skill 正文记为独立的指令消息。stock-analysis preset 及其 skill 要求始终使用简体中文回答。UI 不注册工具 schema。

#### Token effect

只有提交的提示词和加载的 skill 正文增加请求 token；卡片发现与历史列表不增加。

#### KV Cache effect

首轮提示词和 skill 指令都是持久消息，因此后续轮次保留既有前缀，再追加新内容。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- 专属 Agent 结果在 Agents 内复用完整对话视图，不提供独立仪表盘。Host Remote 可用后目录才会显示卡片。
- 不发布运行时不变量配套模块；页面直接呈现 Host 维护的 Session 与目录状态，不另存一份持久副本。
