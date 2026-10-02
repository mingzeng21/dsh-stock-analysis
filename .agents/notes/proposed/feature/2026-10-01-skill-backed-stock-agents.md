# Agent Note: Skill-backed stock analysis Agents

Status: proposed

English | [中文](2026-10-01-skill-backed-stock-agents.zh.md)

## Problem

The fork has stock-market tools and a Watchlist, but users have no guided entry for repeatable research tasks. The existing `stock-analysis` preset exposes stock tools and skill loading, while its inherited coding persona and tools do not match a focused research product. A directory of named Agents must have durable runs, visible source names and data times, and a cheap path to add another specialist.

## Proposal

The sidebar will have one **Agents** entry. Its main panel will show developer-curated cards for three initial specialists: A-share screening, hot-topic analysis, and market overview. A specialist's task instructions and card metadata will live in one DSH `SKILL.md`. The first release will build the generic catalog, launch, transcript, and history UI once; adding another specialist afterward should require only a valid skill definition. Other discovered skills will not appear in this catalog.

An input-driven card will show a query field and examples before starting. A-share screening will accept natural-language combinations of price, technical, financial, industry, and concept conditions; it must obtain its candidate set from `iwencai_astock_selector`. A no-query card will create a new run and stream immediately. Each run will create a separate Session; follow-up questions remain in it, and rerunning after an editable query review creates a new Session. Agents keeps the selected Session and its Conversation content in the Agents panel; ordinary Chat can open the same record with its specialist identity. The catalog will expose recent runs and a combined history list.

The card will explicitly invoke its skill, while ordinary Chat may discover it only when the user's intent clearly matches. Every follow-up in a specialist record, including one sent from Chat, will apply the latest available skill definition. Earlier answers remain historical facts. A removed or renamed skill leaves its records readable but prevents specialist follow-up until that identity is restored or migrated. Off-topic requests in a specialist record will direct the user to ordinary Chat.

Results will use the existing streaming conversation and Markdown presentation. Key conclusions will state their data time and source; missing core data will stop a report, and missing secondary data will mark affected conclusions. On closed-market days, market data will use the latest available trading day with its date stated, while newer news keeps its own timestamp. Screening will not impose a product candidate limit or subjective recommendation rank: it will expose the vendor's total when present, page position, truncation, and continuation, and retrieve later pages on request. Hot topics will cite news and market evidence without claiming a universal heat score. Market overview will cover major A-share indices, turnover, breadth, and sector performance, with an optional requested index.

The stock-facing Chat and specialist runs will be framed as securities research and market analysis, without client profiling, personalized buy/sell advice, or position sizing. The initial platform work will adapt the `stock-analysis` preset's inherited coding persona and tool exposure. Specialist skills will guide tool choice rather than enforce separate per-skill tool allowlists.

## Alternatives considered

- **One runtime Agent or preset per specialist:** rejected because specialist behavior is task instruction over the existing stock capabilities; separate compositions would duplicate configuration and slow additions.
- **Natural-language card prompts without explicit skill invocation:** rejected because description matching is model-selected and does not guarantee that a card runs its named specialist.
- **One long-lived Session per specialist:** rejected because unrelated screening conditions and reruns would mix their evidence and follow-ups.
- **A fixed top-ten screening list or model-ranked recommendation:** rejected because the selector is paginated and the product is research assistance, not personalized stock picking.

## Acceptance criteria

- The sidebar opens one Agents catalog containing only the three marked stock specialists; a fourth valid specialist can be added through its `SKILL.md` without specialist-specific application code.
- Input-driven and no-query cards start correctly; each new run has a separate durable Session, streams its answer inside Agents, and can be reopened from Agents or Chat with its specialist label.
- A card's first turn and every specialist follow-up load the intended skill; changing a skill affects later turns in old records without rewriting earlier answers. Missing skills leave records readable and visibly block specialist follow-up.
- Screening calls `iwencai_astock_selector` for its candidate set, discloses pagination and incomplete results, and never invents candidates on selector failure. Hot-topic and market-overview outputs show the selected time window and evidence dates.
- Core-data failure, partial-data failure, market closure, and off-topic follow-up produce the stated user-visible outcomes. Keyless session snapshots cover the three specialist outputs and the user-visible failure path.

## Risks

- Earlier skill instructions remain in Session history. Applying a newer definition on a later turn must make the current instruction authoritative without falsifying prior answers; tests need to exercise an actual skill edit followed by a resumed Session.
- The present stock preset copies standard, including coding affordances, and the stock tool catalog is large. Research-focused composition changes must keep its drift guard meaningful and measure request cost.
- Vendor totals, timestamps, links, and columns are not uniform. Reports must distinguish missing metadata from complete evidence and must not describe one page as the whole result set.
