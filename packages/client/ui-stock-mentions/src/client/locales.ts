/** Locale-owned copy for inline stock mentions and their quote tab. */
export const NS = 'stockMentions'

/** Simplified Chinese copy and key source. */
export const zh = {
  view: '查看 {name}（{code}）行情',
  title: '证券行情', quote: '行情', marketSH: '上交所', marketSZ: '深交所', close: '关闭行情', refresh: '刷新',
  latest: '最新价', change: '涨跌', open: '今开', high: '最高', low: '最低', previous: '昨收',
  volume: '成交量', turnover: '成交额', asOf: '数据时间：{time}',
  daily: '近期日 K 走势', news: '相关新闻', empty: '暂无数据', loading: '行情加载中',
  retry: '重试', failed: '行情暂时无法加载',
  'watchlist.add': '加入自选', 'watchlist.inList': '已在自选', 'watchlist.adding': '添加中',
  'watchlist.addName': '将{name}加入自选股', 'watchlist.addedName': '{name}已在自选股',
  'watchlist.addingName': '正在添加{name}',
  'watchlist.added': '{name}已加入自选股',
  'watchlist.already': '{name}已在自选股',
  'watchlist.limit': '自选股数量已达上限',
  'watchlist.failed': '添加{name}失败，请稍后重试',
} as const

/** English copy with the same keys. */
export const en: Record<keyof typeof zh, string> = {
  view: 'View quote for {name} ({code})', title: 'Stock quote', quote: 'Quote',
  marketSH: 'SSE', marketSZ: 'SZSE', close: 'Close quote', refresh: 'Refresh',
  latest: 'Last', change: 'Change', open: 'Open', high: 'High', low: 'Low', previous: 'Prev',
  volume: 'Volume', turnover: 'Turnover', asOf: 'Data time: {time}',
  daily: 'Recent daily prices', news: 'Related news', empty: 'No data', loading: 'Loading quote',
  retry: 'Retry', failed: 'Quote is temporarily unavailable',
  'watchlist.add': 'Add to watchlist', 'watchlist.inList': 'In watchlist', 'watchlist.adding': 'Adding',
  'watchlist.addName': 'Add {name} to watchlist', 'watchlist.addedName': '{name} is in watchlist',
  'watchlist.addingName': 'Adding {name}',
  'watchlist.added': '{name} added to watchlist',
  'watchlist.already': '{name} is already in watchlist',
  'watchlist.limit': 'Watchlist is full',
  'watchlist.failed': 'Could not add {name}. Try again later.',
}

/** Keys accepted by the stock-mentions locale seat. */
export type StockMentionKey = keyof typeof zh
