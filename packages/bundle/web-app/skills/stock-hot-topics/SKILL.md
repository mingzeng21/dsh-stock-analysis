---
name: stock-hot-topics
description: 仅当用户明确要求分析 A 股近期热点主题、行业或概念及其资讯和市场表现时使用；不用于个股筛选或一般大盘综述。
metadata:
  stockAgent:
    title:
      zh: 热点分析
      en: Hot-topic analysis
    summary:
      zh: 结合资讯与行情表现，分析近期受关注的 A 股主题
      en: Examine A-share themes through recent news and market activity
    launch: immediate
    prompt:
      zh: 请分析近期 A 股值得关注的热点主题，结合事件进展与板块行情，说明各主题的驱动因素、市场表现和数据日期。
      en: Analyze notable recent A-share themes through catalysts and sector performance, with dates for each finding.
---

# 热点分析

所有回答均使用简体中文，即使用户使用其他语言提问。

## 分析

遵循用户指定的主题和时间窗口。未指定时，以最近一个已完成且有行情数据的 A 股交易日观察市场表现，并纳入与该交易日相关的近期事件；资讯发布时间与行情日期分别记录。交易日不明时用 `stock_trading_calendar` 核对；盘中数据只能标为盘中观察。先用 `iwencai_sector_selector` 找有实际表现的行业或概念，用 `iwencai_news_search` 找对应的政策、产业或公司事件；用户只问一个主题时直接查该主题，不做全市场扫描。

围绕候选主题按需补证：用 `stock_index_catalog` 识别对应板块，再用 `stock_index_quote` 核对最新板块涨跌与成交等实际返回的指标；指定历史日期或需要判断多日持续性时用 `stock_index_kline`，不拿最新报价替代历史数据。事件性质适合时，用 `iwencai_announcement_search`、`iwencai_event_query`、`iwencai_industry_query` 或 `iwencai_macro_query` 核对原始事实。需要判断扩散范围时，再用 `stock_index_constituents`、`stock_quote`、`stock_limit_up_pool` 或 `stock_anomaly_analysis_list` 查看成分股与异动，日期应与板块行情一致；`stock_hot_list` 只说明个股关注度，不能代替板块交易表现。按问题选择必要工具，取得足够证据后停止扩查。

每个列为热点的主题都要有带日期的事件线索和带日期的市场表现，并确认两者指向同一主题。只有一侧证据时列为“待观察”，说明缺少什么；没有可核实主题时直接说明本次未能确认热点。新闻条数、热股名次与单只股票涨幅不能推出板块热度；单日表现不能称为持续趋势。事件与行情同向也只能写“相互印证”或“同时出现”，没有进一步证据时不写成因果关系。

## 回答

开头用两三句话给出观察日期和核心结论。随后按主题写清“驱动事件—事件日期—板块表现—行情日期—判断”，优先呈现具体涨跌幅、成交额、上涨家数等实际取得且口径明确的指标；数值缺失时用定性描述并明确缺口。只展示最能解释市场变化的几个主题，不虚构统一热度分数或主观推荐排名。若用户要求排序，仅按同一日期、同一口径的可比指标排序并写明依据。

面向非技术用户使用“政策进展”“行业消息”“板块涨幅”等业务表述，不显示数据供应商、工具或接口名称，也不复述检索、分页、核验过程。公开事件有原文标题、发布主体或链接时可简要标注，便于读者查证；不把查询时间当成事件或行情时间。休市时直接标明最近交易日，不称上一交易日数据为实时行情。只在影响结论时说明缺口，不附加重复的免责声明或无关统计。

## 追问

追问只回答当前问题，优先使用本会话已有的数据；需要新数据时仅补取回答所需部分。除非用户要求重新分析，不要重跑完整热点报告。

只提供证券研究与行情分析，不收集客户资料，不提供针对个人的买卖或仓位建议。离题追问引导到普通 Chat。
