---
description: "Web 个人研究所：目录式 Wiki、单输入框 L1–L5 专题研究、报告录入、提案审阅和关系图谱。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-research

[English](README.md) | 中文

## 概述

这个浏览器插件注册第四个全局侧边栏入口“个人研究所”及其 `main` 面板。面板基于宿主知识库提供目录、专题研究和页面关系图谱三个视图。


## 目录

- [使用本包](#use-this-package)
- [实现说明](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="use-this-package"></a>
## 使用本包

目录以便于阅读的名称分组展示只读资料、附件、已发布的实体、概念、专题、资料笔记、索引、操作记录和可编辑页面模板。索引按类型归类已发布页面，并可直接打开页面；底层 `raw/` 与 `wiki/` 路径仍是持久记录视图。用户可以添加文本、网址和文件，查看原文、下载原始文件、创建或修订页面、指定来源与关联、查看并恢复旧版本，并发布或舍弃 Agent 提案。提案在发布前可以预览完整 Markdown。

资料库为空时，首页直接提供添加资料、开始专题研究和新建页面三个入口。有内容后显示目录；窄屏可在正文上方展开目录，让文章占满可用宽度。

专题研究只需输入一个主题词。面板打开 `stock-analysis` Session，要求 Agent 按 L1–L5 输出完整报告：终端需求、供应链栈、难替代的瓶颈、交叉验证的证据，以及附风险、证伪条件和监控点的方向性结论。后续追问和修正都留在同一会话，Agent 按意见重新输出完整报告。该会话中完成的 L1–L5 报告下方显示“录入知识库”；点击后，系统按 Session 轮次将报告原文保存为一份不可修改的资料，再要求 Agent 提交来源、主题及有证据支持的实体和概念页提案，并建立页面关联。页面修改在用户发布前始终待审阅。整理单份原始资料时也会要求 Agent 读取来源并提交提案。

图谱最多显示 30 个已发布页面及显式链接。选择节点会打开页面；页面没有显式链接时改为页面列表，不绘制孤立节点。图谱不会从正文臆造未经支持的关系。图谱没有页面时提供新建页面入口。

<a id="understand-the-implementation"></a>
## 实现说明

`src/client/index.ts` 负责 Remote 调用和一份可观察的知识库快照。`ResearchPanel.tsx` 负责三个视图及局部表单状态。`ResearchReportAction.tsx` 读取已完成的轮次，并通过 `conversation.chat.turnTail` 显示录入按钮。侧边栏入口注册在 `sidebar.panellist`，面板使用相同的 `main` key。本包不在浏览器另存一份持久数据。宿主拥有全部持久研究状态，因此本包不发布运行时 invariant companion。

<a id="further-exploration"></a>
## 延伸阅读

- [研究所控制器](../../api/research-controller/README.zh.md)负责持久数据与提案发布。
- [侧边栏外壳](../ui-sidebar/README.zh.md)负责全局导航。

<a id="dev-note"></a>
## 开发备注

本包说明与英文版本描述已交付行为；完整配置及工具参数由生成目录维护。

<a id="model-experience"></a>
## 模型体验

用户启动专题时，本包提交完整 L1–L5 研究请求；只有用户点击报告录入按钮后，才另行提交 Wiki 分层整理请求。

#### KV Cache 影响

启动专题增加一条用户消息；录入报告再增加一条。浏览面板不会增加模型上下文。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- 图谱基于显式页面链接，显示上限为 30 个节点。目录路径是持久记录的界面视图，不是可直接写入的文件夹。面板展示 PDF 提取文本，但没有内嵌 PDF 阅读器。它不会定时更新专题，也不会在外部来源变化时自动刷新研究假设。
