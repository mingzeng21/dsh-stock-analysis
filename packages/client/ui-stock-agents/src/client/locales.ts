/** Product copy namespace for the stock Agents panel. */
export const NS = 'stockAgents'
/** Chinese copy for the catalog, launch form, and history. */
export const zh = {
  'panel.nav': 'Agents',
  'panel.title': '股票分析智能体',
  'panel.intro': '选择研究任务，查看分析并继续追问。',
  'panel.back': '返回股票分析',
  'panel.history': '分析记录',
  'panel.empty': '还没有分析记录',
  'panel.open': '查看结果',
  'panel.rerun': '重新分析',
  'panel.run': '运行分析',
  'panel.runImmediate': '立即分析',
  'panel.running': '正在启动分析…',
  'panel.query': '描述你的筛选条件',
  'panel.examples': '条件示例',
  'panel.missing': '该智能体的技能已移除，仍可查看历史记录。',
  'panel.unavailable': '该技能已移除，无法继续追问',
  'panel.removedAgent': '已移除的分析智能体',
  'panel.failure': '分析启动失败，请稍后重试',
  'panel.catalogFailure': '暂时无法加载分析任务，请稍后重试',
} as const
/** Keep the stock Agents feature in Simplified Chinese for every app locale. */
export const en: Record<keyof typeof zh, string> = {
  'panel.nav': 'Agents',
  'panel.title': '股票分析智能体',
  'panel.intro': '选择研究任务，查看分析并继续追问。',
  'panel.back': '返回股票分析',
  'panel.history': '分析记录',
  'panel.empty': '还没有分析记录',
  'panel.open': '查看结果',
  'panel.rerun': '重新分析',
  'panel.run': '运行分析',
  'panel.runImmediate': '立即分析',
  'panel.running': '正在启动分析…',
  'panel.query': '描述你的筛选条件',
  'panel.examples': '条件示例',
  'panel.missing': '该智能体的技能已移除，仍可查看历史记录。',
  'panel.unavailable': '该技能已移除，无法继续追问',
  'panel.removedAgent': '已移除的分析智能体',
  'panel.failure': '分析启动失败，请稍后重试',
  'panel.catalogFailure': '暂时无法加载分析任务，请稍后重试',
}
/** Keys accepted by the stock Agents locale namespace. */
export type StockAgentsKey = keyof typeof zh
