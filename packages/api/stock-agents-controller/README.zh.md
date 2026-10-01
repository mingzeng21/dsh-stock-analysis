---
description: "基于 skill 的股票研究 Agents 的 Host 目录与 Session 投影。"
kind: "package-reference"
---

# @deepseek-ai/dsh-api-stock-agents-controller

[English](README.md) | 中文

## 概述

本 Host 包只列出随 Web 股票应用交付且标记为 Agent 的 skill，并在每个 Session 的投影中记录专属 Agent 身份。`stockAgents.list()` Remote 从 DSH skill discovery 返回卡片元数据，无需加载指令正文。

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

与 `stock-analysis` preset、skill 注册表、Session 投影注册表和 Web 启动服务 `stockAgentSkillDir` 一起挂载。Client 读取接口调用 `stockAgents.list()` 获取卡片。增加包含有效 `metadata.stockAgent` 的随包 `SKILL.md`，不需要再修改 controller。

<a id="understand-the-implementation"></a>
## 理解实现

目录租用当前股票 preset 的 scope，并列出其中生效的 skill。它只接受来源路径位于随包 skill 目录中的定义，校验双语标题、摘要、启动方式、样例和免输入提示词。`stockAgent` 投影将首次显式 `skill-invocation` 消息之前的最近一条人工输入折叠成 `{ name, query }`，普通 Session 列表可在 Session 未激活时读取。后续轮次从当前目录重新加载该 skill，将新指令作为模型输入写入日志。skill 缺失时拒绝该轮次。

<a id="further-exploration"></a>
## 进一步探索

参见[股票 Agents 提案](../../../.agents/notes/proposed/feature/2026-10-01-skill-backed-stock-agents.zh.md)与 [skill 包](../../skill/skill/README.zh.md)。

<a id="dev-note"></a>
## 开发备注

controller 放在 `packages/api/`；行情工具和提供方仍放在 `packages/stock/`。

<a id="model-experience"></a>
## 模型体验

### 追问时的 skill 指令

#### What the model sees

在专属 Agent 的追问中，模型通过已记录的 `skill-invocation` 用户消息收到当前 SKILL.md 正文，位置在人工问题之后。controller 不注册工具 schema。

#### Token effect

每次追问都会增加 skill 正文对应的 token；列出目录不增加 token。

#### KV Cache effect

新指令消息延续已有的 Session 前缀。修改 skill 只改变后续轮次新增的后缀，不改写旧消息。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- 投影记录首次显式调用及其输入。若更名 skill，旧 Session 要继续使用新名称，需要明确的记录迁移。
- 不发布运行时不变量配套模块；Session 投影独自维护专题身份，目录则从当前 skill 注册表计算。
