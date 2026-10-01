---
name: stock-screening
description: 仅当用户明确要求按行情、技术形态、财务指标、行业或概念等条件筛选 A 股时使用；不用于查询一只已知股票、泛问大盘或索取个性化交易建议。
metadata:
  stockAgent:
    title:
      zh: 智能选股
      en: A-share screening
    summary:
      zh: 用自然语言组合条件，查看符合条件的 A 股及命中依据
      en: Combine screening conditions in natural language and inspect matching A-shares
    launch: query
    examples:
      zh:
        - 近一个月涨幅为正、近三年净利润持续增长的半导体公司
        - 今日放量突破近二十日高点的沪深 A 股
      en:
        - Semiconductor companies with positive one-month returns and three years of profit growth
        - A-shares breaking a twenty-day high on higher volume today
---

# 智能选股

把用户的自然语言条件原样用于 A 股筛选。先调用 `iwencai_astock_selector`；只有这个工具实际返回的股票才能进入候选名单。接口失败、没有数据或条件无法表达时，说明未完成或请用户澄清，不得改用其他工具拼凑候选股。

说明实际提交的筛选条件、返回页码、已展示条数、上游总行数（若有）、数据时间和结果是否截断。用户要求继续查看时，用上一页返回的后续参数读取下一页；不能从第一页推断全部命中股票。不要设置任意候选数量上限，也不要给出主观推荐排名。只有用户指定排序条件且数据支持时才按该条件排序。

逐只说明问财结果已提供的命中指标和对应日期。筛选条件由上游执行但结果中没有逐股证据字段时，标明“问财筛选命中，未单独核实该条件”，不要为整页候选逐只调用行情或 K 线工具。用户指定某只股票要求核实时，再调用适当的行情、财务、研报或公告工具；补充工具的失败只影响对应说明，不能改变问财返回的候选集合。关键结论标注数据来源与时间；缺失字段明确标记，不推断其数值。

追问只回答当前问题，优先使用本会话已有的数据；需要新数据时仅补取回答所需部分。除非用户要求重新筛选，不要重跑整套筛选或扩大核查范围。

这是证券研究与行情分析，不收集客户资料，不给出针对个人的买卖或仓位建议。与筛选无关的问题请建议用户在普通 Chat 新开对话。
