---
kind: upgrade-guide
description: "The stock-analysis Web preset no longer supplies coding tools or a coding persona."
---

# stock-analysis becomes a research preset

English | [中文](guide.zh.md)

## Change

The shipped Web `stock-analysis` preset previously copied `standard` and added stock tools. It now uses a securities research persona and omits shell, filesystem, jobs, planning, delegation, and repository instruction tools. Its skill provider loads only the stock research skills shipped with the Web bundle; skills from default user or workspace roots are no longer discovered in this preset. Sessions composed from `stock-analysis` can still use stock market, news, Web, and the shipped skill tools. Users who chose this preset for code editing or custom skills will no longer see those capabilities after upgrading.

## Migration

1. Select the shipped `standard` preset for coding Sessions in the Web Agent preset selector. Keep `stock-analysis` for stock research Sessions and the Agents sidebar.
2. If `$DSH_HOME/profiles/web/cordis.patch.yml` overrides the stock preset with copied child plugins, review that override and remove coding child rows to adopt the shipped research composition.
3. Open a new `stock-analysis` Session and confirm that stock data and `skill` are available while shell and filesystem tools are absent.
4. Use `standard` for existing user or workspace skills. Developers adding a stock specialist can put its `SKILL.md` under `packages/bundle/web-app/skills/` and rebuild the Web bundle.
