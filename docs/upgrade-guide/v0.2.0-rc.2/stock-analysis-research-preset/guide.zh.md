---
kind: upgrade-guide
description: "Web 的 stock-analysis preset 不再提供编程工具或编程身份。"
---

# stock-analysis 改为研究 preset

[English](guide.md) | 中文

## 变更

此前随 Web 交付的 `stock-analysis` preset 复制 `standard` 并增加股票工具。现在它使用证券研究身份，并移除 shell、文件系统、任务、规划、委派及仓库指令工具。skill 提供器仅加载 Web bundle 随包交付的股票研究 skill；默认用户目录或工作区目录中的 skill 不再由该 preset 发现。由 `stock-analysis` 组成的 Session 仍可使用股票行情、资讯、Web 与随包 skill 工具。升级后，原先用该 preset 编辑代码或调用自定义 skill 的用户将看不到这些能力。

## 迁移

1. 在 Web Agent preset 选择器中，为编程 Session 选择随发行版交付的 `standard`；股票研究 Session 与 Agents 侧边栏使用 `stock-analysis`。
2. 如果 `$DSH_HOME/profiles/web/cordis.patch.yml` 覆盖了股票 preset 并复制其子插件，请检查该覆盖，移除编程子插件行，以采用随发行版交付的研究组合。
3. 新建一个 `stock-analysis` Session，确认股票数据与 `skill` 可用，而 shell 与文件系统工具不存在。
4. 现有用户或工作区 skill 请改用 `standard`。开发者增加股票专题时，可将其 `SKILL.md` 放入 `packages/bundle/web-app/skills/`，然后重新构建 Web bundle。
