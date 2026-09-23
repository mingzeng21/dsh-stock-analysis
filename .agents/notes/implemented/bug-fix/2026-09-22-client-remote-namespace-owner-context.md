# Agent Note: Bind a Client Remote namespace where its owning plugin runs

Status: implemented

English | [中文](2026-09-22-client-remote-namespace-owner-context.zh.md)

## Problem

The `watchlist` and `stock` Client faces publish Cordis services (`ctx.watchlist`, `ctx.stockClient`) and resolved their Remote namespace from `this.ctx` inside every command. Cordis hands a consumer a traceable proxy of a service whose `ctx` property is the *consumer's* context ([`vendor/cordis/src/utils.ts`](../../../../vendor/cordis/src/utils.ts), tracker `{ associate, property: 'ctx' }`), and the Context proxy enforces injections per fiber ([`vendor/cordis/src/reflect.ts`](../../../../vendor/cordis/src/reflect.ts)). The watchlist panel injects the two models and nothing else, so its first call threw `cannot get property "remote.watchlist" without inject` before any request reached the transport. The panel renders a failure without a Remote code as `Failed: unknown`, so the browser showed a generic failure over a feature that never contacted the Host. The unit suites missed it because they drive the models from the root context, where the namespace resolves.

## Decision

Each Client face resolves its namespace once, on the owning plugin's context in `apply`, and passes it to the model constructor: `new WatchlistClient(ctx, ctx.remote.watchlist)` and `new StockClient(ctx, ctx.remote.stock)`. Model methods use the bound namespace and never read `this.ctx`. The Client face of [`workspace-controller`](../../../../packages/api/workspace-controller/src/client/index.ts) already takes this form, handing a non-service model `ctx.remote.workspace` as a plain dependency.

## Alternatives considered

**Read `this.ctx.get('remote.<namespace>')` inside each command.** `ctx.get` reads the global service store, so it is independent of the caller's fiber and would follow a remount. Rejected: it drops the generated namespace typing, and it keeps transport resolution inside a method with no access to the injections its own plugin declared.

**Have the consuming panel declare `remote.watchlist` and `remote.stock` in its own inject list.** Rejected: a presentation plugin would declare the transport namespaces of two API packages, which is the layering the data-access ladder forbids, and it would then be checked against namespaces it never names.

**Keep `this.ctx` and capture the owning context in a separate field.** Rejected: it passes a whole context where one value is needed and leaves later methods free to reach `this.ctx` again. Binding the namespace keeps the single dependency explicit.

**Have the package models extend nothing and close over the namespace by module position.** Rejected: `ctx.watchlist` must be a Cordis service for the panel to inject, so the model has to be registered from a plugin body.

## Consequences

Model commands no longer depend on which plugin calls them, so a consumer that cannot resolve the namespace itself still reaches the Host. The binding is made once, at construction; the watchlist command-failure case could no longer swap the namespace implementation mid-test and now changes the scripted namespace's answer instead. An in-process `Context` resolves a namespace that a Loader-composed consumer could not, so this defect has no package-level seam: the regression guard is the real-host assembled browser case [`apps/web/tests/watchlist-panel.e2e.ts`](../../../../apps/web/tests/watchlist-panel.e2e.ts), which asserts that opening the panel issues `watchlist/list`, that a symbol search issues `stock/searchSymbols`, and that the panel shows no failure copy. Both assertions fail with no request on the wire when either model reads its namespace from `this.ctx` again. The same read remains inside [`CommandUiRuntime`](../../../../packages/client/ui-commands/src/client/service.ts) and [`ModelDirectoryResolver`](../../../../packages/client/ui-model-selection/src/client/service.ts); a consumer-driven call added to either needs its namespace bound the same way.
