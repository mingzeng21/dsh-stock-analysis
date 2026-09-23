# Agent Note: Keep Remote namespace cleanup members out of method names

Status: implemented

English | [中文](2026-09-21-remote-remove-method-collision.zh.md)

## Problem

The Client Gateway represents each generated Remote namespace with a Cordis Service and rejects a method when its name is present on that Service's string-keyed prototype. The namespace Service used a public `remove` method for withdrawing installed descriptors, so a valid generated endpoint such as `watchlist/remove` failed during Remote assembly instead of becoming callable.

## Decision

[`RemoteNamespaceService`](../../../../packages/api/gateway/src/client/index.ts) exposes descriptor withdrawal through a Symbol-keyed implementation member. String-keyed methods remain reserved for the namespace Service API, while business Remote methods may use `remove` without colliding with descriptor cleanup. All cleanup callers use the Symbol-keyed member, and the Gateway Client regression covers mounting, invoking, and disposing a `remove` method.

## Alternatives considered

**Rename the cleanup method to another string.** Rejected: every new internal string-keyed member would become an accidental reserved Remote method name and could reproduce the same failure under a different endpoint.

**Remove the namespace Service collision check.** Rejected: methods that really belong to the namespace Service or its inherited Cordis API still need protection, because installing a generated getter over them would change the Service's lifecycle and registry behavior.

**Give `remove` a special case in the collision check.** Rejected: the collision rule would depend on one implementation name instead of the ownership distinction; a non-string implementation member keeps that distinction explicit.

## Consequences

Generated Remote namespaces can expose `remove` while retaining the existing protection for string-keyed namespace Service members. The cleanup hook is private to the Gateway module by its Symbol identity and is not part of the Client Remote API. [`gateway.client.spec.ts`](../../../../packages/api/gateway/tests/gateway.client.spec.ts) verifies the endpoint's mount, invocation, transport arguments, and disposal behavior.
