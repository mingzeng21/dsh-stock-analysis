---
kind: upgrade-guide
description: "The Web bundle now loads only the stock-analysis research preset and fixes it as the new-session default."
---

# Web uses only the stock-analysis research preset

English | [中文](guide.zh.md)

## Change

The Web bundle now loads only `stock-analysis` and fixes it as the default for new Sessions, even when `selectedDefault` was saved previously. The preset selection setting is hidden. The preset uses a securities research persona and omits shell, filesystem, jobs, planning, delegation, and repository instruction tools. Its skill provider loads only the stock research skills shipped with the Web bundle. Existing Sessions whose logs name an unloaded preset cannot resume under this Web composition.

## Migration

1. Export or finish Web Sessions using `standard`, `ptc`, `minimal`, or `cordis` before upgrading; restore their preset declarations through a profile patch if they must remain resumable.
2. Review `$DSH_HOME/profiles/web/cordis.patch.yml` for saved `selectedDefault` and stock preset overrides. Remove obsolete default selections and copied coding child rows to use the shipped research composition.
3. Open a new Web Session and confirm it uses `stock-analysis`, with stock data and `skill` available and shell and filesystem tools absent.
