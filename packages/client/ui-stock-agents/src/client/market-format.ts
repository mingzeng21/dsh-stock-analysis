/** A-share dashboard dates use the exchange's Shanghai civil time. */
const timeFormat = new Intl.DateTimeFormat('sv-SE', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  hour12: false, timeZone: 'Asia/Shanghai',
})

/**
 * Format a vendor timestamp as a Shanghai data-readiness time.
 * @param timestamp - Market-data update time in milliseconds.
 * @returns Shanghai date and minute.
 */
export function marketTime(timestamp: number): string { return timeFormat.format(timestamp) }
