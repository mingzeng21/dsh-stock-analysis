/** Product copy namespace for the stock Agents panel. */
export const NS = 'stockAgents'
/** Chinese copy for the catalog, launch form, and history. */
export const zh = {
  'panel.nav': 'Agents',
  'panel.title': '股票分析 Agents',
  'panel.intro': '选择研究任务，查看分析并继续追问。',
  'panel.back': '返回 Agents',
  'panel.history': '历史分析',
  'panel.empty': '还没有分析记录',
  'panel.open': '打开对话',
  'panel.rerun': '重新分析',
  'panel.run': '运行分析',
  'panel.running': '正在启动分析…',
  'panel.query': '描述你的分析条件',
  'panel.examples': '条件样例',
  'panel.missing': '该 Agent 的 skill 已移除，历史记录仍可查看。',
  'panel.unavailable': 'skill 已移除，无法追问',
  'panel.failure': '启动失败：{code}',
  'panel.catalogFailure': 'Agents 目录加载失败：{code}',
} as const
/** English copy with the same keys as the Chinese dictionary. */
export const en: Record<keyof typeof zh, string> = {
  'panel.nav': 'Agents',
  'panel.title': 'Stock analysis Agents',
  'panel.intro': 'Choose a research task, inspect its analysis, and ask follow-ups.',
  'panel.back': 'Back to Agents',
  'panel.history': 'Analysis history',
  'panel.empty': 'No analyses yet',
  'panel.open': 'Open conversation',
  'panel.rerun': 'Analyze again',
  'panel.run': 'Run analysis',
  'panel.running': 'Starting analysis…',
  'panel.query': 'Describe your analysis conditions',
  'panel.examples': 'Examples',
  'panel.missing': 'This Agent skill has been removed. Its history is still available.',
  'panel.unavailable': 'Skill removed; follow-ups unavailable',
  'panel.failure': 'Could not start: {code}',
  'panel.catalogFailure': 'Could not load Agents: {code}',
}
/** Keys accepted by the stock Agents locale namespace. */
export type StockAgentsKey = keyof typeof zh
