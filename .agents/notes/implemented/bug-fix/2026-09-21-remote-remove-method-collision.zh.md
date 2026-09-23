# Agent Note: Remote 命名空间清理成员不占用方法名

Status: implemented

[English](2026-09-21-remote-remove-method-collision.md) | 中文

## Problem

Client Gateway 用 Cordis Service 表示每个生成的 Remote 命名空间，并在方法名出现在该 Service 的字符串键原型上时拒绝该方法。命名空间 Service 曾用公开的 `remove` 方法撤回已安装的 descriptor，因此合法的 `watchlist/remove` endpoint 会在 Remote 组合阶段失败，无法被调用。

## Decision

[`RemoteNamespaceService`](../../../../packages/api/gateway/src/client/index.ts) 通过 Symbol 键的实现成员撤回 descriptor。字符串键方法仍属于命名空间 Service API 的保留名称，而业务 Remote 方法可以使用 `remove`，不会再与 descriptor 清理冲突。所有清理调用方都使用该 Symbol 键成员，Gateway Client 回归测试覆盖了 `remove` 方法的挂载、调用和释放。

## Alternatives considered

**把清理方法改成另一个字符串名称。** 已拒绝：每个新增的字符串键内部成员都会意外变成保留的 Remote 方法名，未来可能由另一个 endpoint 重现同类失败。

**删除命名空间 Service 的冲突检查。** 已拒绝：真正属于命名空间 Service 或继承自 Cordis API 的方法仍需要保护，否则生成的 getter 会改变 Service 的生命周期和注册表行为。

**在冲突检查中为 `remove` 增加特例。** 已拒绝：这样会让冲突规则依赖某个实现名称，而不是依赖所有权区别；使用非字符串实现成员能直接表达这一区别。

## Consequences

生成的 Remote 命名空间可以暴露 `remove`，同时保留对字符串键命名空间 Service 成员的现有保护。清理 hook 通过 Symbol 身份限制在 Gateway 模块内部，不属于 Client Remote API。[`gateway.client.spec.ts`](../../../../packages/api/gateway/tests/gateway.client.spec.ts) 验证 endpoint 的挂载、调用、传输参数和释放行为。
