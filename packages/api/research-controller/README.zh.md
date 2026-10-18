---
description: "宿主侧个人研究知识库：原始资料摄入、已发布 Wiki 页面、专题研究、修订历史与待审阅 Agent 提案。"
kind: "package-reference"
---

# @deepseek-ai/dsh-api-research-controller

[English](README.md) | 中文

## 概述

本包负责 Web 面板与 `stock-analysis` Agent 共用的个人研究所。它把原始文本或文件引用、已发布的 Markdown 页面、专题研究、页面修订、待审阅提案、模板和操作记录保存在同一个 `personal_research` 存储领域中。每次修改在完整快照写入持久存储后才可见。原始资料记录没有编辑或删除操作。


## 目录

- [使用本包](#use-this-package)
- [实现说明](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="use-this-package"></a>
## 使用本包

在宿主侧与 `storageDomain`、`attachments` 一起装载一次。`research` Remote 命名空间提供 `snapshot`、`addSource`、`addReport`、`sourceFile`、`savePage`、`restorePage`、`saveStudy`、`saveTemplate`、`acceptProposal` 和 `rejectProposal`。`addReport` 按 Session 轮次将完成的报告原文保存为不可修改的文本资料并返回资料 ID；重复提交同一轮次时返回已有资料，不替换原文。模型侧的 `propose` 方法只暂存页面，不会直接发布。修改已有页面的提案记录原页面版本；审阅期间页面发生变化，发布会以 `research/conflict` 拒绝。用户直接编辑页面也必须提供准确的前一版本号。`restorePage` 将旧版内容发布为新修订，并保留被替换的版本。

`addSource` 接受粘贴文本、HTTP(S) 网址或 base64 文件。文件原字节先进入持久附件存储，资料记录随后发布。含可选中文本的 PDF，以及 UTF-8 编码的 Markdown、文本和 HTML 文件会提取文本供 Agent 阅读；扫描版 PDF 只保留原件，没有可读的提取文本。只有网址时保存网址，不把网址误当成网页正文。浏览器限制上传文件为 5 MB，与随发行版交付的宿主默认值一致；文件、文本、页面和资料数量的实际限制由宿主 `Config` 控制。`sourceFile` 校验并返回已保存的原字节。

随发行版交付的存储使用 `$DSH_HOME/storages` 下的一份 JSON 文档。一次持久写入同时发布页面、操作记录和目录所需数据。浏览器从已发布页面和操作记录生成 `wiki/index.md`、`wiki/log.md` 视图；它们不是独立记录。

<a id="understand-the-implementation"></a>
## 实现说明

`src/spec.ts` 在打开领域时验证全部记录。`src/index.ts` 串行处理写入；写入失败时旧快照继续可见。`src/types.ts` 为跨 Remote 的资料、页面和专题 ID 提供品牌类型。领域全局值是唯一权威观察值，因此本包不发布运行时 invariant companion。

<a id="further-exploration"></a>
## 延伸阅读

- [存储领域](../../storage/storage-domain/README.zh.md)负责持久写入与版本检查。
- [本地附件](../../attachment/attachment-local/README.zh.md)负责保存不可变的原始文件字节。
- [个人研究所界面](../../client/ui-research/README.zh.md)呈现目录、专题与图谱。

<a id="dev-note"></a>
## 开发备注

本包说明与英文版本描述已交付行为；完整配置及工具参数由生成目录维护。

<a id="model-experience"></a>
## 模型体验

本包通过 dsh-tool-research 间接向模型提供已保存的资料和页面提案。

#### KV Cache 影响

知识库不会整份进入每轮请求；只有调用工具时才附加有上限的结果。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- 每次修改都会重写整个知识库，因此用 `maxPages` 和 `maxSources` 限制规模。文件通过 base64 Remote 调用传输，默认上限为 5 MB。PDF 仅提取可选中文本。原始文件不会自动删除，也不会跨设备同步。知识库按宿主保存，不按 Workspace 或 Session 分组。
