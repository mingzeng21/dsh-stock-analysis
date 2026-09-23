/**
 * Web watchlist plugin, node half.
 *
 * The watchlist panel is a browser surface: it reads the durable list through
 * the `watchlist` Remote namespace and market data through the `stock` one, and
 * registers nothing model-facing. This half exists because every client plugin
 * package ships an installable Node entry, not as a mounting point.
 */

/** Host plugin body — this package contributes no host-plane behavior. */
export function apply(): void {}
