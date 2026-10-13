---
description: "在已完成的助手回答中标注 A 股名称和代码，并在页面右侧展示行情。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-stock-mentions

[English](README.md) | 中文

## 概述

在已完成的助手回答中，点击原文里的 A 股名称或代码，即可在右侧查看行情；点击旁边的操作可一键加入自选股。只有现有证券搜索服务唯一且精确确认的标的才会变成可点击文字。面板显示最新报价、近期日 K 线、相关新闻和相同的自选操作。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与待办事项](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

Web 组合将本插件与 Chat、股票客户端、自选股客户端和根页面浮层一起挂载。本插件没有配置项。回答流式输出、搜索失败或无法唯一精确匹配时，名称和代码保持普通文本。会话页和 Agents 等全局页面都通过页面右侧的固定行情面板展示数据。添加操作始终显示在已识别的名称或代码旁；已有标的显示自选状态。Host 列表决定添加结果，临时结果用提示条展示。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

文本块完成后，Chat 读取本插件提供的可选标注服务。该服务限制候选数量，并通过 `stockClient` 解析候选；Markdown 渲染器只在正文文本节点中加入按钮。点击名称会在任一主页面打开同一个右侧固定面板。名称旁和面板标题中的按钮共用自选操作，从 `watchlist.entries` 读取状态，并通过 `watchlist.add` 发布 Host 的添加结果。面板通过 `stockClient` 读取报价、日 K 线和新闻，不把行情写入会话日志。

</details>

**运行时不变量：** 不发布配套检查模块。标注缓存和行情面板状态由本浏览器插件实例持有；行为测试覆盖候选解析、面板更新和销毁。

-----

<a id="further-exploration"></a>
## 延伸阅读

- [股票控制器](../../api/stock-controller/README.zh.md) — 归一化行情读取。
- [Chat](../ui-chat/README.zh.md) — 已完成助手回答的渲染。
- [右侧栏](../ui-sidebar-right/README.zh.md) — 资源标签和 Session 状态。

-----

<a id="model-experience"></a>
## 模型体验

无，因为本浏览器插件不增加工具、提示词或 Session 事件，也不改变模型请求。

#### KV Cache effect

无。行情导航和数据读取属于客户端操作，不进入模型历史。

## 已知限制与待办事项

<a id="known-limitations-and-deferred-work"></a>

- 股票数据客户端没有 A 股分时序列，因此行情标签显示日线收盘走势，而非分钟级分时图。
- 名称提取受到候选数量限制，可能漏掉被 Markdown 格式拆开的名称，或埋在特别长的连续中文文本中的名称。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
