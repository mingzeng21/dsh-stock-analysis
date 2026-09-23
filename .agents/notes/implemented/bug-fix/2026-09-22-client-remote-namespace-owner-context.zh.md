# Agent Note: Bind a Client Remote namespace where its owning plugin runs

Status: implemented

[English](2026-09-22-client-remote-namespace-owner-context.md) | 中文

## Problem

`watchlist` 与 `stock` 的 Client 面各自发布一个 Cordis 服务（`ctx.watchlist`、`ctx.stockClient`），并在每个命令中从 `this.ctx` 解析自己的 Remote 命名空间。Cordis 交给消费方的是服务的 traceable 代理，其 `ctx` 属性是*消费方*的上下文（见 [`vendor/cordis/src/utils.ts`](../../../../vendor/cordis/src/utils.ts) 中 tracker 的 `{ associate, property: 'ctx' }`），而 Context 代理按 fiber 校验注入（见 [`vendor/cordis/src/reflect.ts`](../../../../vendor/cordis/src/reflect.ts)）。自选股面板只注入这两个模型，因此它的第一次调用就抛出 `cannot get property "remote.watchlist" without inject`，请求根本没有到达传输层。面板把不带 Remote 失败码的失败渲染为 `Failed: unknown`，于是浏览器在一个从未与 Host 通信的功能上显示了一条笼统的失败。单元测试没有发现它，是因为它们从根上下文驱动模型——在那里命名空间可以解析。

## Decision

两个 Client 面都在 `apply` 中、在所属插件自己的上下文上解析一次命名空间，并把它传给模型构造函数：`new WatchlistClient(ctx, ctx.remote.watchlist)` 与 `new StockClient(ctx, ctx.remote.stock)`。模型方法只使用已绑定的命名空间，不再读取 `this.ctx`。[`workspace-controller`](../../../../packages/api/workspace-controller/src/client/index.ts) 的 Client 面已经采用这种形式：把 `ctx.remote.workspace` 作为普通依赖交给一个非服务模型。

## Alternatives considered

**在每个命令里读 `this.ctx.get('remote.<namespace>')`。** `ctx.get` 读的是全局服务表，因此与调用方 fiber 无关，也能跟随重新挂载。放弃原因：它会丢掉生成的命名空间类型（调用点需要强制转换），而且仍然把传输解析留在方法内部——该方法无法访问自己插件声明的注入。

**让消费方面板在自己的注入列表里声明 `remote.watchlist` 与 `remote.stock`。** 放弃原因：这会让一个展示层插件声明两个 API 包的传输命名空间，正是数据访问阶梯所禁止的分层；面板还会被拿去校验它从未使用的命名空间。

**保留 `this.ctx`，另用一个字段捕获所属上下文。** 放弃原因：这是在只需要一个值的地方传递整个上下文，并且让后续方法仍可从 `this.ctx` 取用。绑定命名空间让唯一的依赖保持显式。

**让包内模型不继承任何基类，按模块位置闭包捕获命名空间。** 放弃原因：`ctx.watchlist` 必须是 Cordis 服务，面板才能注入它，因此模型必须由插件体注册。

## Consequences

模型命令不再取决于调用它的是哪个插件，因此即使消费方自身无法解析该命名空间，也仍能到达 Host。绑定发生在构造时、只有一次；自选股命令失败的用例已无法在测试中途替换命名空间实现，改为改变脚本命名空间的应答。进程内的 `Context` 能解析出 Loader 组合的消费方解析不了的命名空间，因此这个缺陷在包级别没有可用接缝：回归守卫是真实 Host 的组装浏览器用例 [`apps/web/tests/watchlist-panel.e2e.ts`](../../../../apps/web/tests/watchlist-panel.e2e.ts)，它断言打开面板会发出 `watchlist/list`、股票搜索会发出 `stock/searchSymbols`，且面板不显示任何失败文案。只要任一模型再次从 `this.ctx` 读取命名空间，这两条断言都会在“线上没有任何请求”的情况下失败。同样的读取仍留在 [`CommandUiRuntime`](../../../../packages/client/ui-commands/src/client/service.ts) 与 [`ModelDirectoryResolver`](../../../../packages/client/ui-model-selection/src/client/service.ts) 中；若给它们加上由消费方驱动的调用，同样需要以这种方式绑定命名空间。
