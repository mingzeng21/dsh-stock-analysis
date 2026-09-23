---
description: "作为 storage-domain 支撑的 Remote 命名空间的持久个人标的列表：针对完整 thscode 自选股的 list、add、remove 与 reorder。"
kind: "package-reference"
---

# @deepseek-ai/dsh-api-watchlist-controller

[English](README.md) | 中文

## 概述

当浏览器界面需要保存一份个人标的列表时使用本包。它通过 [storage-domain 设施](../../storage/storage-domain/README.zh.md)存储一份有序的完整 thscode 列表，因此该列表能跨 host 重启、更换浏览器与迁移 profile 存活；并在 `watchlist` Remote 命名空间上暴露列表所需的四种变更。添加会先通过[股票能力 seam](../../stock/stock/README.zh.md)解析标的，因此每个条目始终带有界面要渲染的展示名。该服务不注册任何工具，也不贡献任何 prompt。

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

把本包与 `dsh-storage`、一个 backend、`dsh-storage-domain` 以及 `dsh-stock` 一起挂载。Client 调用 `remote.watchlist.list()`、`add({ thscode })`、`remove({ thscode })` 或 `reorder({ thscodes })`；没有任何方法接收 Session，因为列表属于人，而不属于某段对话。

| 方法 | 返回 | 用途 |
|---|---|---|
| `list()` | `readonly WatchlistEntry[]` | 按展示顺序返回整份列表 |
| `add({ thscode })` | `readonly WatchlistEntry[]` | 解析该标的并追加 |
| `remove({ thscode })` | `readonly WatchlistEntry[]` | 删除一个条目 |
| `reorder({ thscodes })` | `readonly WatchlistEntry[]` | 替换顺序 |

### 每次变更都返回整份列表

列表很小，且总是被整体读取，因此变更返回完整的新列表而不是增量。这使浏览器的投影成为对一个权威值的整体替换，并免除了逐条增量所需的合并规则。读取来自已加载的 domain 值，因此该答案不消耗持久化访问。

### 添加先解析再存储

`add` 通过 seam 的标的消歧解析 thscode 并存储解析出的展示名。seam 不认识的标的永远不会作为无法渲染的行进入列表：它会以 `watchlist/unknown-symbol` 失败。仅大小写不同的匹配会被接受，而列表保留的是 vendor 自己的拼写。

### 配置

| 字段 | 默认值 | 含义 |
|---|---|---|
| `maxEntries` | `200` | 列表条目数上限（含）；超过该值再添加会失败，而不是让列表继续增长 |

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-api-watchlist-controller)是每个可接受字段及其 JSDoc 的完整来源。

### 失败

每个失败都是一个带类型化 details 的 `RemoteError` 错误码；调用方按错误码分支，绝不按消息文本分支。

| 错误码 | details | 含义 |
|---|---|---|
| `watchlist/duplicate` | `{ thscode }` | 该标的已在列表中 |
| `watchlist/not-found` | `{ thscode }` | 没有条目携带该 thscode |
| `watchlist/unknown-symbol` | `{ thscode }` | seam 未解析出对应标的 |
| `watchlist/lookup-failed` | `{ thscode, reason }` | seam 在解析前就失败；`reason` 是它自己的错误码 |
| `watchlist/limit-reached` | `{ maxEntries }` | 列表已达到该部署允许的条目数 |

重复与不存在的条目是浏览器标签页持有过期列表的结果，而不是装配错误，因此二者都是声明式错误码而不是抛出的编程错误。`reorder` 会以 `gateway/bad-request` 拒绝没有恰好命名每个条目一次、或命名了未知条目的列表。

### Client 模型

浏览器导出提供 `ctx.watchlist`，并要求 `remote` 与 `remote.watchlist`。该模型持有列表的一份可观察快照，并在每个成功命令后发布 Host 的答案；失败的命令抛出 Gateway 的失败并保持已发布的列表不变。它不在构造时读取，因此需要列表的界面调用 `refresh()` 并渲染自己的加载与失败状态，而不是由模型产生一个无人观察的 rejection。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内幕——点击展开</summary>

### 一个持久值，而不是两个

顺序与记录是同一个事实的两半，因此该 domain 把它们保存在同一个文档里：一个持有按展示顺序排列的条目的全局单例。于是每次变更都是一次持久写入，不存在顺序与记录可能不一致的交错——这正是该 domain 既不需要 pending-mutation 标记、也不需要加载期修复路径的原因，也是它不声明任何记录表的原因。[工作区注册表](../../workspace/workspace/README.zh.md)反而保留一个带键的表，因为它按 id 查找记录并与会话持久化对账；而这份列表只会被整体读取与整体写入。

### 串行化的变更

变更在同一条链上运行，因此一次添加对当前列表的读取与它的写入是一个步骤，两次并发添加不可能观察到同一个前驱。标的解析在该步骤内运行，因此一次缓慢的解析会推迟后续变更，而不是让它们越过它。

### 取消

seam 的标的解析与 domain 写入都是不可取消的，因此 signal 已中止的调用会在入口处以 `gateway/cancelled` 被拒绝，而不是假装工作可以在中途被打断。

### 源码地图

| 文件 | 角色 |
|---|---|
| [`src/index.ts`](src/index.ts) | `WatchlistController`：`watchlist` 服务与 Remote 命名空间、`Config`、四个操作、标的解析，以及串行化变更链 |
| [`src/spec.ts`](src/spec.ts) | domain 声明：记录 schema 与 `defineDomain` spec |
| [`src/types.ts`](src/types.ts) | 线上词汇，作为 `./types` 发布给 Client 包 |
| [`src/client/index.ts`](src/client/index.ts) | 浏览器插件与 `ctx.watchlist` 模型 |
| — | 不发布运行时 invariant 伴随包；已加载的顺序与已存储的条目是同一个值，因此没有独立观察会产生分歧，而 domain 自身的 schema 校验在持久边界上运行。 |

Typert 生成由 `./typert` 与 `./remote` 暴露的 Host 与 Client Remote 产物。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [行情数据](../../stock/stock/README.zh.md) —— 解析新增标的的那个 seam。
- [storage domain 数据形态](../../storage/storage-domain/README.zh.md) —— `defineDomain`、打开 domain 与持久写入语义。
- [工作区注册表](../../workspace/workspace/README.zh.md) —— 需要记录表与恢复标记的同类持久 consumer。
- [新增 Remote API](../../../docs/cookbook/adding-a-remote-api.zh.md) —— 本包 Host 与 Client 面遵循的五个步骤。

-----

<a id="model-experience"></a>
## 模型体验

无，因为本包不注册工具、不贡献 prompt 段，也不追加会话事件。

#### KV Cache effect

无；本包既不组装也不发送 provider 请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **每个 host 只有一份列表** —— 没有分组、没有第二份列表，也没有按工作区或按 Session 的作用域；该 domain 名就是一个单例。
- **没有面向模型的读取方** —— agent 目前读不到这份列表；要暴露它需要一个基于本服务的工具，而该服务由 host 拥有，正是为了那个工具可以复用它。
- **整值写入** —— 每次变更都会重写整个存储文档，因此非常大的列表会产生成比例的写入；`maxEntries` 限制它，且没有任何压缩或差分。
- **添加是一次解析加一次写入** —— 上游解析失败会让调用方损失这次尝试并返回 `watchlist/lookup-failed`，而不是把该标的排队稍后重试。
- **没有并发令牌** —— 两个浏览器同时编辑列表都会成功，后写入者获胜；模型用 Host 的答案替换自己的快照，因此落败方看到的是更新的列表，而不是冲突。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
