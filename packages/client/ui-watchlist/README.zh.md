---
description: "Web 自选股全局面板：持久标的列表、每行的批量快照、所选标的的 K 线与已发布文档，以及分析对话会话。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-watchlist

[English](README.md) | 中文

## 概述

当 Web 客户端需要自选股时使用本包：一个全局面板，把个人标的列表放在对话旁边。左栏列出每只标的及其最新快照，可通过标的消歧添加、并可移除；分析侧展示所选标的的快照、K 线图、关于它的研报/公告/新闻，以及一个可供提问的分析会话。它通过 `dsh-api-watchlist-controller` 读取持久列表、通过 `dsh-api-stock-controller` 读取行情、并通过既有的会话服务驱动分析会话；自身不持有传输，也不缓存任何内容。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

挂载两个 controller 包及其行情提供方，然后挂载本面板。它在自身生命周期内、于同一个 `ctx.effect` 中注册三个 slot：

| 注册 | slot | 内容 |
|---|---|---|
| `{ id: 'watchlist', order: 10, label }` | `sidebar.panellist` | 导航行，标签来自本包的字典 |
| `{ key: 'watchlist' }` | `main` | 该行选中的面板 |
| `{ }` | `watchlist.analysis` | 分析对话记录；由 `main` 注册声明，作用域为 `session`，因此渲染器把它绑定到当前会话 |

行的 id 与 main 的 key 在构造上就是同一个字符串，因为选中该行正是派发 `main` 条目的方式。

### 读取与刷新

面板在挂载时读取列表及其快照批量，这正是"回到面板"所做的事：只要选中另一个面板或对话，该条目就会卸载。左栏的刷新控件会重新读取批量，失败批量上的重试控件同理。这里没有定时器、也没有服务端推送，因为自选股与行情 Remote 都不发布订阅。

每次读取都以一个阶段发布，失败的读取带有 Remote 失败码。较新的读取会取代较旧的：不再是当前的读取不发布任何内容，因此一次缓慢的首次读取永远不会覆盖一次快速的第二次读取。

### 添加标的

添加控件打开一个搜索框与一个候选列表。搜索会把文本交给 Host 的标的消歧，选中候选即把它追加到持久列表。标的展示名由 Host 解析，绝不由面板解析，因此面板渲染出的行就是列表存储的名字。

添加会被拒绝而不是被静默忽略：重复、无法解析的标的、解析失败与列表已满各自返回自己的 `watchlist/*` 错误码，面板把它们渲染在搜索框旁。行也从同一处移除，Host 拒绝的移除同样渲染其错误码。

### K 线图

图是一块由 `klinecharts` 绘制、并被包装起来的 canvas，面板其余部分从不接触该库。包装层只接收 K 线与返回 canvas：它不读取 Remote、看不到面板 store，也不知道自己画的是哪只标的——标的由它正上方的面板头部指明。

提供三个周期——`1d`、`1w`、`1mo`——各自向 Host 请求自己的历史长度（约一年、三年、十年）。每只标的每个周期发起一次读取，controller 会丢弃已被更新的读取取代的响应，因此快速切换标的绝不会把先前的序列留在屏幕上。读取失败会保留最后画出的序列，并渲染错误码与重试入口。seam 截断序列时，`truncated` 会作为提示渲染，而不是悄悄缩短图表。

颜色来自图表周围标记所用的同一批 `--dsw-*` 令牌。canvas 无法解析 CSS 变量，因此包装层把它们读取为计算值，并在主题版本变化时重绘；它从不为主题变化重建图表。

### 文档

三个标签页——研报、公告、新闻——列出网关发布的、关于所选标的的内容。每只标的每个频道发起一次读取，controller 会丢弃已被更新的读取取代的响应，因此快速切换标签页绝不会把一个频道的行渲染在另一个频道的标签下。每个频道各自失败：失败会在该标签页内渲染错误码与重试入口，而不会清空旁边的图表；较新的读取进行中时，上一次成功的频道仍保留其行。

一行包含标题、便于读者自行判断的来源与发布日期，以及 vendor 提供的摘要。当 vendor 给出原文链接时，标题即为链接；不携带链接的频道把同样的行渲染为纯文本，而不是渲染成坏链接。Host 按配置上限截断摘要时，该行会说明这一点。

### 分析会话

一个会话服务所有标的。它在读者第一次需要时创建，由已发布的 `stock-analysis` preset 组装，并记录在面板 store 中，因此浏览列表从不创建会话，追问也能延续同一条线索。preset 会在会话仍然为空时选定，因为一旦历史在另一套组合下产生，Host 就会拒绝更换组合。

所选标的随提示词本身传递——面板用自己的字典把标的名称与 thscode 作为问题前缀——因此 agent 回答的正是读者在看的东西，而不需要按标的各建一个会话。输入框通过会话自身的提交回显发送，因此问题立刻出现，并在持久化用户消息到达时退役。

对话记录渲染会话 Chat target 已经发布的、有界的提问与回答预览，而不是另一个特性插件的节点渲染器：客户端分层不允许一个特性插件导入另一个的组件，而这些预览是可得的最宽纯文本投影。"在会话中打开"会把分析会话设为当前并离开面板，因此长分析可以在具备全部既有能力的完整对话界面中继续。

### 选中态

所选标的保存在声明的 store 中而不是组件状态里，因此切换到其他面板再回来，仍会回到你刚才在看的标的。移除所选标的会清空选中态；移除另一只则保持不变。分析会话的身份也保存在同一个 store 中：回到面板会让它重新成为当前会话，而 Host 已不再列出的会话会被遗忘。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内幕——点击展开</summary>

### 两层

`controller.ts` 不含 React：它拥有已发布的快照批量与每次读取的阶段，执行读取与变更，并把每个失败归类为错误码。`WatchlistPanel.tsx` 渲染这些快照持有的内容并调用注入回调；它只拥有添加流程，因为没有其他界面观察它。

持久列表本身不会被复制进任何一层。它留在 `watchlist` Client 模型中，并通过 inject face 的 `hooks` 隔间到达渲染层，因此面板只持有它的一份投影，没有第二个权威。

### 源码地图

| 文件 | 角色 |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | 插件主体：字典、导航行与 `main` 注册 |
| [`src/client/controller.ts`](src/client/controller.ts) | `WatchlistSurface`：快照批量、读取阶段、取代规则，以及添加、移除、搜索的结果 |
| [`src/client/store.ts`](src/client/store.ts) | 面板的视图 store：所选标的、图表周期、文档频道与分析会话 |
| [`src/client/analysis.ts`](src/client/analysis.ts) | `AnalysisSession`：创建、组装、选中、恢复并提问那唯一的分析会话 |
| [`src/client/AnalysisTranscript.tsx`](src/client/AnalysisTranscript.tsx) | 会话作用域的对话记录：渲染 Chat target 发布的回合预览 |
| [`src/client/failures.ts`](src/client/failures.ts) | 所有面板共用的、失败到错误码的唯一规则 |
| [`src/client/WatchlistPanel.tsx`](src/client/WatchlistPanel.tsx) | 面板、它的行、添加流程与失败呈现 |
| [`src/client/chart/index.ts`](src/client/chart/index.ts) | 图表包装层：创建、替换序列、重绘、释放 |
| [`src/client/chart/colors.ts`](src/client/chart/colors.ts) | 设计令牌到具体 canvas 颜色 |
| [`src/client/chart/styles.ts`](src/client/chart/styles.ts) | 调色板到该库样式树，作为纯函数 |
| [`src/client/CandleChart.tsx`](src/client/CandleChart.tsx) | canvas 元素：只构建一次、主题变化时重绘、K 线变化时替换 |
| [`src/client/PanelIcon.tsx`](src/client/PanelIcon.tsx) | 导航行的图形 |
| [`src/index.ts`](src/index.ts) | Node 半边，不贡献任何 host 行为 |
| — | 不发布运行时 invariant 伴随包；面板只持有另一个服务状态的一份投影，不独立对账任何东西。 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [自选股 controller](../../api/watchlist-controller/README.zh.md) —— 本面板读取与变更的持久列表。
- [行情 controller](../../api/stock-controller/README.zh.md) —— 每次快照背后的归一化行情读取。
- [Web Client 的 slot](../../../docs/subsystems/slots.zh.md) —— 本面板所组合的注册表与 props 份额。
- [侧栏外壳](../ui-sidebar/README.zh.md) —— 该行加入的面板列表所在的导航列。
- [布局](../ui-layout/README.zh.md) —— 该行寻址的 `main` slot 与面板选中态。
- [Chat](../ui-chat/README.zh.md) —— 对话记录所渲染的、会话作用域的 `chat` hook 回合预览。
- [Agent preset](../../preset/agent-presets/README.zh.md) —— 分析会话所组装自的 `stock-analysis` preset。

-----

<a id="model-experience"></a>
## 模型体验

无，因为本浏览器侧面板不注册工具、不贡献 prompt 段，也不追加会话事件。分析面板提出的问题是一条经会话服务发送的普通用户回合，因此本包对请求的贡献与其他任何消息并无不同。

#### KV Cache effect

本包自身没有。一次提问和任何其他用户消息一样延长会话的缓存前缀，因为标的上下文属于该消息本身，而不是独立的 prompt 段。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **分析对话记录是预览** —— 它渲染 Chat target 有界的提问与回答预览，而不是带工具行、图片与过程步骤的完整对话记录；那个界面只差一次交接。
- **分析面板尚不可调整大小** —— 它是文档下方一个固定高度的区块；设计所要求的分割比例与折叠状态属于面板视图状态，尚未构建。
- **文档频道没有缓存** —— 每个频道在选中标的与切换标签页时读取；设计所要求的按标的、按频道的缓存尚未构建。
- **K 线序列同样没有缓存** —— 切换周期会重新读取序列，而不是复用已为该标的加载过的那一份。
- **图表周期固定** —— `1d`、`1w`、`1mo` 是 vendor 自己的周期，且客户端没有聚合，因此 vendor 未发布的周期无法请求。
- **图表承担了图表库的字节** —— `klinecharts` 被内联进本插件的浏览器包（约 105 KB gzip），无论用户是否打开面板都会到达，因为客户端模块系统没有懒加载路径。
- **不渲染成交量与成交额** —— 线上类型携带它们，但尚不存在紧凑的数字格式，因此展示它们的界面需要先有这样一个格式。
- **无轮询与推送** —— 快照只在进入面板、左栏刷新控件、重试以及变更之后刷新；在发生其中任何一件之前，屏幕上会一直留着过期的价格。
- **每次刷新一次批量** —— 整份列表在一次调用中取快照，因此限制面板一次能取多少只的是 Host 的批量上限，而不是列表长度。
- **行尚不可排序** —— controller 暴露了 `reorder`，而面板还没有对应的拖拽入口。
- **图表无画线与额外指标** —— 该库自带的画线工具与指标集未被呈现；图只展示均线与成交量。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
