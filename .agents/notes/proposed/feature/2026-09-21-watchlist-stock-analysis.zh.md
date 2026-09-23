# Agent Note: Web 客户端的自选股个股分析面板

Status: proposed

[English](2026-09-21-watchlist-stock-analysis.md) | 中文

## 问题

harness 已经能读取 A 股行情数据，也已经发布了知道如何使用这些数据的 agent：`web-app` 组合挂载了 `ctx.stock`，带同花顺行情提供方与问财研究网关，而 `stock-analysis` agent 预设把每一个已注册能力都作为原生工具交给一个 Session。这两者都只面向模型。使用 Web 客户端的人无法维护一份标的列表、查看其中一只标的、读它的 K 线、研报、公告和新闻，并就它向 agent 提问，除非手工把全部上下文写进一条聊天消息。

有两个已发布的机制本可以承载这种体验，而它们从未被使用过。

`main` 是一个 root 作用域的 keyed slot，在已发布组合中其唯一占用者是 `conversation`；`sidebar.panellist` 是一个 root 作用域的 list，其行通过 `ctx.layout.selectPanel` 选中某个 `main` key。两者共同构成 Web 客户端的全局面板机制，由 [不增加默认界面的全局主面板](../../implemented/architecture/2026-09-08-global-main-panels.zh.md)拥有，该记录写明已发布组合不注册任何面板条目——机制存在、有类型、有测试，却没有任何产品界面使用过它。

`ctx.stock` 位于 host 平面。能力只有 agent、host 插件能触及，除此之外无人能及；浏览器没有任何 Remote 命名空间可以返回一段 K 线、一批快照或一个文档列表，而且该 seam 有意保留 vendor 的字段名，那是一种任何视图都不应直接渲染的行格式。

也没有任何持久位置来保存个人标的列表。`ctx.storageDomain` 在 host 上承载工作区记录和会话 sidecar；没有任何用户自有且浏览器可见的数据使用它。

该机制自身的记录写明了占用者会继承到什么：扩展面板没有右侧 Sidebar，面板选中态是瞬时的，而已发布组合根本不注册面板条目。本提案接受前两点，并且是第三点的第一个占用者——这是一个产品决策，因为机制本身仍然没有给默认应用增加任何导航控件或预留空间。

第一个占用者真正暴露出来的问题是：该列表没有对话行。仓库中没有任何代码调用 `selectPanel(null)`，而 `ui-sidebar-right` 与 `DocumentTitle` 都以 `activePanelId === null` 为判断依据，因此一旦存在面板，对话就只能由离开它的那段代码来寻址。面板在头部上也只能自给自足，因为框架的中央列只渲染 `main` 条目，别无其他。

## 提案

新增一个自选股面板：一个全局面板 Tab，把个人标的列表、蜡烛图、该标的的文档和一段内嵌 agent 对话合在一起。

### 位置与 Tab 语义

面板在自身生命周期内、于同一个 `ctx.effect` 中注册两个 slot：

```ts ignore-check
ctx.slots.inject('sidebar.panellist', () => ctx.slots.register(
  { name: 'sidebar.panellist', id: 'watchlist', order: 10, label: () => t('panel.nav') },
  WatchlistPanelIcon,
))
ctx.slots.inject('main', () => ctx.slots.register(
  { name: 'main', key: 'watchlist', locale: NS, store, inject: injectProps },
  WatchlistPanel,
))
```

它旁边的行仍属于产品自身：`sidebar.panellist` 是 list，因此这里是新增一行，而不是替换侧栏。

补全 Tab 条是本提案的一部分，而不是事后的清理，因为一个进去就出不来的导航行不算是 Tab。三处小改动让对话成为同级行：

| 文件 | 改动 |
|---|---|
| `packages/client/ui-conversation/src/client/` | 注册保留的 `conversation` panellist 行，使 Tab 条把 "conversation" 与 "watchlist" 并列 |
| `packages/client/ui-layout/src/client/service.ts` | 把 `selectPanel('conversation')` 归一化为布局存储已经用来表示"对话"的 `null`，使 `panelInfo`、`DocumentTitle` 和右列保持它们现有的语义 |
| `packages/client/ui-sidebar/src/client/SidebarRoot.tsx` | 把保留行的 `active` 状态判定为 `activePanelId === null` |

`ui-layout` 拥有该保留项并以 `CONVERSATION_MAIN_KEY` 命名它，但特性包既不能导入另一个特性包的值，也不能为了让导入成立而扩大 `dsh.client.external`。因此 `ui-conversation`（行的 id 与它自己的 `main` key）和 `ui-sidebar`（行的选中比较）各自在一个局部声明的常量里拼写同一个保留字符串，并在注释里点明归属。这是该规则的成本，而不是疏漏；它取代了框架与对话此前各自携带的两处裸字面量。

替代做法——由面板自己拥有一个"返回对话"按钮——记录在考虑过的替代方案中。

这是在唯一一份已有选中列表里新增一个同级行，而不是该机制记录所否决的第二套导航栈。仍然只有一个 `panelInfo.activePanelId`，没有历史，也没有保存的返回目的地；那条记录认为不必要的是返回按钮加记住目的地，而一行以其他行寻址其面板的完全相同方式去寻址对话，两者都不需要。

### 面板布局

面板就是中央列，因此它自己绘制头部和自己的内部几何。

- **左栏** —— 自选股列表：行上带标的名称、代码、最新价与涨跌幅，并有添加、删除入口和拖拽排序手柄。添加会打开一个由标的消歧支撑的搜索框；当查询命中多只标的时，列出全部候选，而不是猜测市场后缀。
- **右侧** —— 当前选中的标的，纵向分栏。上半部分是带周期切换的图表，下半部分是带 `report`、`announcement`、`news` 三个标签页的文档列表。
- **Agent 对话** —— 文档下方一块可调整大小、可折叠的区域；分栏比例与折叠状态是面板视图状态，不是持久数据。

切换列表行不会丢弃分析区的滚动位置或当前文档标签页；逐标的的图表与文档结果缓存在面板存储中，仅在过期时重新拉取。

### 包拓扑

| 包 | 职责 |
|---|---|
| `packages/api/stock-controller` | Host `stock` Remote 命名空间及其 Client 模型：基于 `ctx.stock` 的标的搜索、快照批量、K 线序列与文档检索 |
| `packages/api/watchlist-controller` | Host `watchlist` Remote 命名空间及其 Client 模型：基于 `ctx.storageDomain` 的持久个人标的列表 |
| `packages/client/ui-watchlist` | 该 Tab：panellist 行、`main` 注册、标的列表、图表模块、文档列表、agent 对话、面板存储与 zh/en 字典 |

图表作为模块（`src/client/chart/`）位于 `ui-watchlist` 内部，而不是独立成包，因为它只有一个消费者；它面向一组窄输入（蜡烛数组加主题令牌）编写，因此日后提升为包只是搬迁，而不是重写。

### 行情数据界面

`ctx.stock` 暴露 82 个 vendor 能力，并有意保留 vendor 字段名。[股票 seam 记录](../../implemented/architecture/2026-09-14-stock-market-data-capability-seam.zh.md)否决了为每个能力定义规范结果类型，"for now: no current consumer reads those fields, and fixing 82 shapes before one exists would encode the wrong model"；自选股就是那个消费者。因此归一化发生在新的 consumer 里，只发生一次，位于控制器中，浏览器永远看不到 vendor 行。seam 本身不变。

```ts ignore-check
interface InstrumentMatch {
  thscode: string
  ticker: string
  name: string
  assetType?: string
  exchange?: string
}

interface QuoteBatch {
  asOf?: number
  quotes: Quote[]
}

interface Quote {
  thscode: string
  last: number
  change: number
  changePct: number
  open: number
  high: number
  low: number
  prevClose: number
  volume: number
  turnover: number
}

interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface DocumentRow {
  kind: 'report' | 'announcement' | 'news'
  title: string
  source?: string
  publishedAt: number
  summary: string
  summaryTruncated: boolean
  url?: string
}
```

四项读取支撑这个界面，每一项都是对一两个 seam 能力的薄组合：

| Remote 方法 | seam 能力 | 说明 |
|---|---|---|
| `stock.searchSymbols({ query, limit })` | `meta.tickers.search` | 跨市场消歧；返回候选，从不猜测后缀 |
| `stock.quotes({ thscodes })` | `a-share.prices.snapshot` | 一次批量调用覆盖全部可见行 |
| `stock.candles({ thscode, interval, adjust, start, end })` | `a-share.prices.historical` | `interval` 就是 vendor 自己的 `1d`/`1w`/`1mo`，因此周期切换不需要客户端聚合 |
| `stock.documents({ name, kind, size })` | `iwencai.search.report`、`iwencai.search.announcement`、`iwencai.search.news` | 网关接收自然语言 `query` 并按文本而非标的标识匹配，因此控制器用展示名与该渠道自己的词拼出查询 |

每一次 seam 失败都保留其 `StockError` 代码，并作为 `stock/*` Remote 失败到达浏览器，因此面板按代码分支，而不是按消息分支。vendor 已关闭的能力（`availability !== 'open'`）以 seam 自己的 `STOCK_CAPABILITY_CLOSED` 呈现，而不是一个空列表，因为空列表会被读成"这只标的没有公告"。

### 自选股持久化

该列表是用户数据而非配置，因此它属于 `ctx.storageDomain`，与工作区记录并列，而不是放进 settings 命名空间；它由 host 拥有，以便日后面向 agent 的工具能读到浏览器所展示的同一份列表。

```ts ignore-check
interface WatchlistEntry {
  thscode: string
  name: string
  order: number
  addedAt: number
}
```

顺序与记录是同一个事实的两半，因此 domain 把它们作为一个持久值保存——一个按展示顺序列出条目的 `global` 单例——并且不声明记录表。这使每次变更都是一次持久写入，从而消除了二者可能不一致的交错。

`watchlist.list()`、`watchlist.add({ thscode })`、`watchlist.remove({ thscode })` 和 `watchlist.reorder({ thscodes })` 就是全部变更界面，且每次变更都返回完整的新列表而不是增量，因此浏览器替换的是一个权威值，而不是合并增量。添加会先通过 stock seam 解析标的，因此无法解析的标的会以 `watchlist/unknown-symbol` 失败，而不会作为无法渲染的行进入列表。重复添加以 `watchlist/duplicate` 失败；删除不存在的标的以 `watchlist/not-found` 失败。两者都是过期浏览器标签页造成的用户可见结果，而非装配错误，因此二者都是声明式错误码而不是抛异常。

### 图表渲染

图表使用 `klinecharts`（Apache-2.0，零依赖，持续维护）。它是 K 线库而不是通用图表库：自带十字光标、缩放与平移、成交量副图，以及本功能所需的全部内置指标（MA、EMA、VOL、MACD、BOLL、KDJ、RSI、SAR、BIAS、DMI、OBV），并带 `zh-CN` 语言包。其产物中没有任何动态 `import()`，也没有 worker 或 WebAssembly 负载，因此可以内联进 client bundle 的 CommonJS factory，不会带来运行时意外；内联后本插件的包约为 105 KB gzip。

第 10 版是拉取式的：图表向数据加载器索取 K 线，而不是接收被推入的数组，因此包装层持有当前序列并据此回答每次请求，替换序列就是一次 `resetData`。由于 canvas 无法解析 CSS 变量，包装层把 `--dsw-*` 令牌读取为计算值，并在主题版本变化时通过 `setStyles` 重绘，而不是重建图表。

与 `lightweight-charts` 的决定性差异是许可而非代码：该库的 Apache-2.0 产物带有 NOTICE，要求集成方把 TradingView 标注为产品创作者，并在用户可见的页面上链接到 `tradingview.com`。一个要求在我们自己的分析界面里出现第三方品牌的图表库，是一份我们不应为已有宽松许可替代品覆盖的功能所做出的产品承诺。

在这里，图表依赖是真正的净删除，而不是能力采购。这个界面的手写版本——蜡烛、坐标轴、成交量、十字光标命中测试、缩放，再加一条均线——正是面板中最容易积累边角情况、进而由我们拥有并测试的部分。该库作为 `ui-watchlist` 的 `devDependencies` 条目声明，与 `packages/client/ui-sidebar-documentpreview` 声明 `pdfjs-dist` 和 `shiki` 的方式完全一致，并由 `pnpm run gen-third-party-notices` 记录。

图表模块只在一个方向上拥有这条边界：它接收蜡烛、周期和已解析的主题颜色，返回一块 canvas。它不调用 Remote、不读面板存储，也不知道 thscode。

### Agent 对话

对话区复用已发布的会话机制，而不是另造一个聊天客户端。

面板拥有一个专用分析 Session，在第一次提问时惰性创建，通过既有的 `agentPresets/select` 路径由已发布的 `stock-analysis` 预设组合而成，并保存在面板存储中。多个标的共享一个 Session，而不是每个标的各一个：选中的标的以显式上下文（`当前标的：贵州茅台 600519.SH`）随 prompt 传递，也留在对话历史中，因此浏览列表永远不会创建 Session，追问也能保持同一条线索。

聊天主体通过面板声明的一个 `session` 作用域子 slot 渲染，这对 root 作用域条目是允许的——`main.conversation` 也以同样方式声明 `conversation.session`。随后框架的 `SessionProvider` 把该主体绑定到当前会话，而 `ui-chat` 已经提供给每个 session 作用域 slot 的 session 级标准 hook `useChat` 提供已装配的 transcript 快照。该主体渲染紧凑的 transcript，输入框则是一个简单输入，通过 `ISession.beginSubmission` 登记提交回显并经 `ISession.prompt` 发送，因此一个问题走的是与任何其他 prompt 相同的持久路径，agent 的回答也是一次普通的已记录轮次。

由于 `SessionProvider` 跟随当前选中会话，提问会让分析 Session 成为当前会话；面板存储记录该标识，下次进入时由 `ctx.sessions.open(id)` 恢复。一个"在会话中打开"动作执行同样的选中，然后调用 `ctx.layout.selectPanel(null)`，因此一段较长的分析可以在带全部已发布能力的完整对话界面中继续。分析 Session 有意使用与工作目录相同的选择方式：当前 Session 的工作区，其次最近的工作区，与侧栏"新会话"的解析方式一致。

### 数据与刷新策略

面板加载一次列表基线，随后为全部可见行做一次批量 `quotes` 调用。快照在进入面板时、手动刷新时以及添加之后刷新；第一版不设定时器、不做服务端推送，因为该 seam 不发布订阅，而轮询一个未声明速率约定的 vendor，比一个用户能通过其 `asOf` 看出已过期的价格更糟。

K 线与文档在选中时加载，并按 `(thscode, interval)` 与 `(thscode, kind)` 缓存。seam 失败在受影响的分栏内渲染其代码与重试入口，绝不连带清空相邻分栏。

### 交付阶段

1. 落地两个 host 控制器及其错误码、Client 模型与 Remote 生成。这一层不依赖任何产品决策，是其他一切所消费的基础。
2. 落地该 Tab：panellist 行、`main` 注册、对话行及其归一化、标的列表、添加与删除、批量快照列，以及 locale 字典。
3. 落地图表模块与基于 `stock.candles` 的标的头部。
4. 落地基于 `stock.documents` 的文档列表。
5. 落地 agent 对话：专用 Session、`SessionProvider` 子主体、紧凑 transcript、输入框，以及"在会话中打开"的交接。

五个阶段均已落地：两个 host 控制器及其 Client 模型；该 Tab 及其列表、快照、添加与删除；基于 `stock.candles` 的图表模块；基于 `stock.documents` 的文档频道标签页；以及分析面板——它用 `stock-analysis` preset 创建一个会话、以所选标的作为提示词上下文向其提问、渲染 Chat target 的回合预览，并可交接到完整对话界面。有一条验收标准无法在本地验证：回答本身需要模型密钥，因此只有提问、会话、preset 选定与交接在真实 Host 上跑过。此外，分析面板仅在其会话为当前会话时渲染对话记录，因为会话作用域区域绑定的是当前选中项；输入框是普通表单而非既有 composer，面板的分割比例与折叠状态也是固定的，尚未存入 store。

## 考虑过的替代方案

**复用右侧 Sidebar 的 tab 类型注册表，而不是全局面板。** 一个 `ctx.sidebarRightTabs` kind 会把分析界面放在对话旁边并复用停靠区。否决理由：该区域是逐会话的，且位于对话自己的列内，因此自选股会每个会话出现一次，并在任何面板被选中时消失；本功能所需的三栏布局放不进 300px 宽的列；而右列被有意设计为仅在对话被选中时挂载，那恰恰是一个专用 Tab 所离开的状态。

**通过扩展 slot 运行时让面板渲染完整 Chat 视图。** 可以让 `SessionProvider` 接受一个显式的会话标识，此后 root 面板就能内嵌一个由自己拥有的对话。单靠这一点不足以成立，因此否决：Chat 渲染器由 `ui-chat` 注册进 `conversation.view`，而该 slot 由 `ui-conversation` 声明，所以要内嵌真实视图，还必须让那套 shell 可被内嵌——为了省掉写一份紧凑 transcript 和一个输入框而改动三个核心包。

**保留面板自带的"返回对话"按钮，不动 Tab 条。** 否决理由：这会让机制对下一个占用者仍是半成品——对话从导航列表中无法寻址，而未来任何面板也不会去修它。[机制记录](../../implemented/architecture/2026-09-08-global-main-panels.zh.md)否决的是返回按钮*加记住目的地*；同级行两者都不需要，而整处改动只有三个文件和一个保留 id。

**通过把 seam 直接暴露给浏览器来提供行情数据。** 一个转发 `ctx.stock.call(id, params)` 的 Remote 命名空间无需逐能力开发，还能让客户端跟随 vendor 目录。否决理由：它把 82 种 vendor 行格式、vendor 参数词汇和 vendor 能力 id 放进浏览器，并让 vendor 的每一次变化都变成客户端变化。浏览器得到的是四项带归一化类型的窄读取。

**把自选股存在浏览器里。** `localStorage` 不需要 host 包，今天就能用。否决理由：这样一来列表因浏览器和机器而异，不随 profile 迁移，并且对那个本应在同一产品中推理它的 agent 不可见。

**用 SVG 自己绘制图表。** 无依赖、精确贴合主题令牌、完全掌控交互模型。依据仓库的依赖政策否决：被删除的界面是真实存在的（蜡烛、坐标轴、成交量、十字光标、缩放、指标），而所选的维护中库健康、零依赖、许可宽松，因此这次替换确实缩小了我们自己拥有的代码。

## 验收标准

- 侧栏列出对话行与自选股行；任意一行都能选中中央列；被选中的行即活动行；当对话行被选中时，浏览器标题与右列的行为与今天完全一致。
- 添加标的会经标的消歧解析，并以声明的错误码拒绝无法解析或重复的条目；删除与排序会持久化；刷新、换一个浏览器、host 重启后看到的都是同一份列表。
- 列表每行展示一个批量快照，并带 seam 的 `asOf`；vendor 失败渲染错误码与重试入口，且不清空列表。
- 选中一只标的会按所选周期渲染 K 线且无客户端聚合，并渲染该标的来自网关的研报、公告与新闻，各标签页独立失败。
- agent 区能就当前选中的标的提问，回答是分析 Session 中一次普通的已记录轮次，且"在会话中打开"会落到该 Session 及其完整历史。切换标的不创建 Session，也不丢失线索。
- 面板所消费的任何客户端类型里都不出现 vendor 字段名、vendor 能力 id 或 vendor 参数名。
- 卸载插件会通过其所属 fiber 释放 panellist 行、`main` 注册与存储，且由于 `retainMainPanels` 不再列出该 key，布局回落到对话。
- 客户端组件测试覆盖列表、添加与删除、快照列、图表模块的纯输入、文档标签页与输入框；client catalog、i18n 门禁、Cordis 配置门禁与第三方声明均已重新生成；并且该 GUI 变更附有录制的 GIF。

## 风险

面板是一个没有已发布先例的机制的第一个占用者，因此它的毛边会成为设计先例。对话行与 `selectPanel` 归一化是让该机制可用的最小集合；超出这部分的内容应等待第二个面板，而不是从一个面板推广出来。

打开面板会移除右列，因为右侧 Sidebar 只在对话被选中时挂载。[机制记录](../../implemented/architecture/2026-09-08-global-main-panels.zh.md)把这一点记录为已接受的后果而非疏漏，本提案予以保持：文档在面板内渲染，无法浮动到对话旁边。放宽这条规则会触及 `ui-sidebar-right` 对自身可见性的所有权，不在本提案范围内。

让分析 Session 成为当前会话是一次有可见影响的全局选中：会话列表会高亮它，侧栏的会话浏览器也随之变化。打开自选股再切回对话的用户，会落到分析 Session 而不是他们离开时的那个 Session。只有在用户是从对话离开的情况下，面板存储才会在离开时恢复先前的 Session；两种行为都站得住脚，只有实际使用才能确定哪种正确。

`klinecharts` 相比体量最大的替代品是更小的项目（约 4k stars 对 17k），这是维护风险。它被零依赖、活跃的发布节奏和很小的集成面所抵消：图表模块只依赖它的 create、数据加载器与指标 API，别无其他，因此替换它意味着在接口不变的前提下重写一个模块。

网关的文档检索接收自然语言查询而非标的标识，因此相关性与排序由 vendor 决定。用名称与代码拼出的查询，可能返回一篇正文同时提到两者的、关于另一只标的的文档；因此面板展示来源与时间，让用户自行判断某一行，而不是信任整个列表。

图表依赖会被内联进启动时预加载的 client bundle，因此无论用户是否打开该 Tab，其字节都会到达每一个用户。约 100KB gzip 是可观的，但相比已发布的 `ui-sidebar-documentpreview` bundle 仍然很小，而客户端模块系统并没有可供替代的懒加载路径。
