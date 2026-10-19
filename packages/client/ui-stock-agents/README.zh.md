---
description: "股票 Agents 的 Web 目录、专属对话与可追问的股票看板。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-stock-agents

[English](README.md) | 中文

## 概述

Web 客户端注册一个股票分析侧边栏入口，从 Host 的 skill 元数据构建专属卡片，并加入原生龙虎榜、热股榜、概念板块联动、涨停情绪市场脉冲和行业强度矩阵看板。打开看板直接读取数据，不创建 Session；首次向看板提问时创建 stock-analysis Session，后续提问复用该 Session。无论应用语言如何设置，Agents 自有界面文案均使用简体中文。

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

涨停情绪市场脉冲图支持用鼠标选择交易日，也可聚焦日期柱后按 Enter 或空格键选择。行业气泡也支持键盘选择，热力带每行按时间顺序向辅助技术提供 20 个数值。两张看板跟随应用的明暗主题；内容区变窄时，问答面板移至看板下方。

与 Session 服务、股票 Agents Remote、股票数据客户端、locale 和 slots 一起挂载。点击立即启动的专属卡片会创建新 Session 并开始分析；输入类卡片会等待提交。每次运行都会在首轮前选中 `stock-analysis`、发送显式 `/skill-name` 提示词，并在 Agents 内显示流式对话。“龙虎榜观察”显示同一最新交易日的三种榜单；“热股榜监控”显示四类当前热度榜单，选中股票后读取近 30 个自然日排名。“概念板块联动”按概念或行业名称匹配目录，展示指数日 K 线与当前成分。“涨停情绪市场脉冲”联动近期涨停家数、有限样本连板矩阵、封单金额和涨停原因；点击日期可切换天梯与详情。“行业强度矩阵”对比有上限的行业指数日线与沪深300，展示相对收益、五日加速度和横截面热力带；点击行业再读取当前成分及有限行情样本。点击“问看板”可针对当前看板提问，输入区显示榜单、选中对象、日期或图表区间。示例问题在 Session 开始后仍可作为可编辑的追问入口。面板显示 Session 回答；提问后榜单或选中对象变化时会提示数据已变化。最新回答提及的股票会显示为按钮，点击后选中并展开对应看板记录。历史栏保存专属 Session，可在各视图收起。

<a id="understand-the-implementation"></a>
## 理解实现

专属卡片元数据来自随包 skill 中的 `metadata.stockAgent`。面板持有启动、仪表盘和临时历史栏状态；回答和追问由 Session 日志持有，并复用 `conversation.content` factory。看板使用 `ctx.stockClient` 读取数据；提问时把有长度上限的当前数据快照写入已记录的提示词。板块提问只包含所选自然日区间内的指数日线。涨停情绪提问包含所选日期、涨停池完整性、天梯样本和近期日汇总。行业矩阵提问包含所选窗口的行业横截面、选中行业和已返回的当前成分行情样本。龙虎榜看板显示返回样本的涨跌家数、成交额、股票涨跌幅与已提供的带符号金额；缺失字段显示“未提供”。打开 Agent 记录不会切换普通 Conversation 的当前选择。skill 移除后历史仍可打开，但不提供重新运行的卡片。

<a id="further-exploration"></a>
## 进一步探索

参见[股票 Agents 提案](../../../.agents/notes/proposed/feature/2026-10-01-skill-backed-stock-agents.zh.md)与 [Host 目录](../../api/stock-agents-controller/README.zh.md)。

<a id="dev-note"></a>
## 开发备注

新增对话型专属 Agent 的内容放在 `packages/bundle/web-app/skills/<name>/SKILL.md`。龙虎榜观察、热股榜监控、概念板块联动、涨停情绪市场脉冲和行业强度矩阵等原生数据视图位于本包，使用面向浏览器的数据客户端。

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
- 涨停天梯每个板位只提供有限样本。某日涨停池超过配置的分页上限时，页面显示的是已返回家数和金额的下限。图表分位模式只对已返回的近 30 个交易日排序，不是 60 日全市场分位。
- 不发布运行时不变量配套模块；页面直接呈现 Host 维护的 Session 与目录状态，不另存一份持久副本。
