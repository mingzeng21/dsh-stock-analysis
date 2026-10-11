---
kind: upgrade-guide
description: "New Web stock research Workspaces now use the application data directory instead of Documents."
---

# Web stock research files use application data

English | [中文](guide.zh.md)

## Change

The Web stock research bundle creates its first Workspace at `$DSH_HOME/workspaces/stock-analysis` instead of `<Documents>/deepseek-harness/default-workspace`. Existing registered Workspaces keep their stored paths. The Web bundle hides Workspace selection, so new users do not choose a directory during normal startup. A profile override of `documentsDirectory` no longer controls this first-use path while `firstUseDirectory` is set.

## Migration

1. Leave an existing registered Workspace in place; it continues to open at its recorded path. Back up its files using that path.
2. If `$DSH_HOME/profiles/web/cordis.patch.yml` sets `documentsDirectory` for first-use Web data, replace that setting with an absolute `firstUseDirectory` if a custom location is still required.
3. On a fresh profile, open Conversation and confirm the created directory is `$DSH_HOME/workspaces/stock-analysis`.
