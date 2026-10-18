---
description: "面向模型的个人研究所搜索、读取和待审阅 Wiki 页面提案工具。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-research

[English](README.md) | 中文

## 概述

把本包装载到 `stock-analysis` 后，Agent 可以查阅个人研究所，并提交待人工审阅的页面修改。它需要 `tools` 和宿主的 `researchController`。


## 目录

- [使用本包](#use-this-package)
- [实现说明](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="use-this-package"></a>
## 使用本包

`research_search` 搜索已发布页面的标题、摘要、正文以及已保存的来源文本。`research_read` 按准确 ID 分段读取页面或来源；调用方传入 `nextOffset` 继续读取。`research_propose` 连同来源与页面引用暂存完整 Markdown 页面，不会发布。个人研究所面板负责接受或舍弃提案。搜索和读取结果受 `maxSearchResults`、`maxResultChars` 配置限制。只有网址的来源只返回元数据，不会凭网址虚构正文。

<a id="understand-the-implementation"></a>
## 实现说明

控制器在提交提案时验证引用 ID，修改既有页面的提案在发布时再次核对页面版本。本工具包不另存搜索索引或修订状态，因此不发布运行时 invariant companion。

<a id="further-exploration"></a>
## 延伸阅读

- [研究所控制器](../../api/research-controller/README.zh.md)负责持久知识库和审阅发布。

<a id="dev-note"></a>
## 开发备注

本包说明与英文版本描述已交付行为；完整配置及工具参数由生成目录维护。

<a id="model-experience"></a>
## 模型体验

### 研究工具

#### 模型看到什么

模型获得 `research_search`、`research_read` 和 `research_propose` 三个工具。搜索与读取返回有长度上限的 JSON 文本；页面提案需要用户发布。

#### Token 影响

预设装载本包后，每轮请求包含三个工具定义；调用时才附加有长度上限的结果。

#### KV Cache 影响

预设及包版本不变时，工具定义的前缀稳定；工具结果只影响后续请求的尾部。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- 搜索在有界知识库内使用不区分大小写的子串匹配，尚无语义或全文索引。PDF 图片没有 OCR；只有文件而没有可读文本的来源在补充或提取文本前仅提供元数据。
