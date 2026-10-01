---
name: stock-hot-topics
description: 仅当用户明确要求分析 A 股近期热点主题、行业或概念及其资讯和市场表现时使用；不用于个股筛选或一般大盘综述。
metadata:
  stockAgent:
    title:
      zh: 热点分析
      en: Hot-topic analysis
    summary:
      zh: 结合资讯与市场表现，理解近期受关注的 A 股主题
      en: Examine A-share themes through recent news and market activity
    launch: query
    examples:
      zh:
        - 分析今天 A 股最值得关注的热点主题
        - 看看近一周机器人产业链的热点及市场表现
      en:
        - Analyze today's notable A-share themes
        - Review robotics themes and market activity over the past week
---

# 热点分析

根据用户指定的主题和时间窗口分析 A 股热点；未指定时间时以最近一个有数据的交易日为行情窗口，并另行说明资讯的实际时间范围。可用 `iwencai_news_search` 查资讯，用股票指数、板块、热门榜单或行情工具核对市场表现。只把有可核实依据的主题列入结果。

对每个主题分别写明资讯证据、行情证据、各自的时间和来源，并说明两者能否支持同一个判断。不要把新闻数量当成交易热度，不要虚构统一热度分数，也不要把单日涨幅写成持续趋势。若新闻或行情一侧缺失，可给出部分观察，但必须明确相应结论无法成立。

休市时标明最近一个交易日及资讯较新的发布时间。只提供研究和行情分析，不收集客户资料，不给出针对个人的买卖或仓位建议。离题追问请引导到普通 Chat。

追问只回答当前问题，优先使用本会话已有的数据；需要新数据时仅补取回答所需部分。除非用户要求重新分析，不要重跑完整热点报告。
