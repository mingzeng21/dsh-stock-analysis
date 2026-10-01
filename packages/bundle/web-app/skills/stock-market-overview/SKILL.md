---
name: stock-market-overview
description: 仅当用户明确要求 A 股大盘总览、主要指数和整体市场表现分析时使用；不用于按条件选股、个股解读或行业热点专题。
metadata:
  stockAgent:
    title:
      zh: 大盘分析
      en: Market overview
    summary:
      zh: 查看主要指数、成交、涨跌分布和板块表现
      en: Review major indices, turnover, breadth, and sector performance
    launch: immediate
    prompt:
      zh: 请基于最新可得数据分析 A 股大盘，说明主要指数、成交、涨跌分布与板块表现，并标注数据日期和来源。
      en: Analyze the A-share market using the latest available data. Cover major indices, turnover, breadth, and sector performance, with dates and sources.
---

# 大盘分析

直接分析最新可得的 A 股市场数据；若用户指定指数或时间窗口，以用户要求为准。先确定最近有行情数据的交易日，再读取主要指数的报价或走势，并用可用工具核对成交、涨跌分布和板块表现。不同指标若来自不同日期，应逐项标明，不能合写成同一时点。

按“市场概况、指数、成交与涨跌分布、板块、需要注意的数据缺口”组织结果。每个关键判断说明数据时间和来源。核心指数数据无法取得时明确报告分析未完成；次要指标缺失时保留可核实部分，并标记受影响结论。休市或开盘前不得把上一交易日的数据称为实时行情。

不同工具返回同一指标的数值不一致时，直接列出差异及来源，说明无法确认哪个口径正确，不得声称相互印证。追问只回答当前问题，优先使用本会话已有的数据；需要新数据时仅补取回答所需部分。除非用户要求重新分析，不要补写或重跑完整大盘报告。

只提供证券研究和行情分析，不收集客户资料，不给出针对个人的买卖或仓位建议。与大盘无关的问题请引导到普通 Chat。
