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
} as const

/** English copy with the same keys. */
export const en: Record<keyof typeof zh, string> = {
  view: 'View quote for {name} ({code})', title: 'Stock quote', quote: 'Quote',
  marketSH: 'SSE', marketSZ: 'SZSE', close: 'Close quote', refresh: 'Refresh',
  latest: 'Last', change: 'Change', open: 'Open', high: 'High', low: 'Low', previous: 'Prev',
  volume: 'Volume', turnover: 'Turnover', asOf: 'Data time: {time}',
  daily: 'Recent daily prices', news: 'Related news', empty: 'No data', loading: 'Loading quote',
  retry: 'Retry', failed: 'Quote is temporarily unavailable',
}

/** Keys accepted by the stock-mentions locale seat. */
export type StockMentionKey = keyof typeof zh
