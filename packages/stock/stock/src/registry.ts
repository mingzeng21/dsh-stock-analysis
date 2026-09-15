/**
 * Endpoint vocabulary for the stock capability seam (`ctx.stock`): the vendor
 * contract as data, independent of any transport. One {@link StockEndpoint}
 * describes one public data capability — its HTTP path, its parameters, how it
 * paginates, and how it encodes dates — so that the provider, the model-facing
 * tools, and the generated catalog all read one record instead of three copies.
 * @module @deepseek-ai/dsh-stock/registry
 */

/** Vendor data universe; each universe is one MCP service and one path prefix. */
export type StockUniverse =
  | 'a-share'
  | 'a-share-index'
  | 'fund'
  | 'futures'
  | 'options'
  | 'meta'
  | 'iwencai'

/**
 * Whether a capability is reachable. `open` is callable with an API key;
 * `unavailable` is published by the vendor but refuses external access, so the
 * seam reports it as a structured failure instead of issuing a request.
 */
export type StockAvailability = 'open' | 'unavailable'

/** Wire type of one endpoint parameter, after the vendor's JSON Schema is narrowed. */
export type StockParamType = 'string' | 'integer' | 'number' | 'boolean' | 'object' | 'array'

/** How an endpoint pages its rows. */
export type StockPaging = 'none' | 'offset' | 'page' | 'cursor'

/** The longest history window one endpoint accepts, when it is bounded. */
export type StockWindow = 'none' | 'today-only' | 'one-year' | 'five-years' | 'ten-years'

/** How an endpoint encodes a date or timestamp argument. */
export type StockDateEncoding = 'ms-epoch' | 'iso-date' | 'compact-date' | 'report-period'

/** One endpoint parameter as the model and the seam both see it. */
export interface StockParam {
  /** Wire name, used verbatim in the query string. */
  readonly name: string
  /** Wire type; `integer` and `number` stay distinct because the vendor validates them. */
  readonly type: StockParamType
  /** Whether omitting the parameter is a vendor error (`code=1001`). */
  readonly required: boolean
  /** Model-facing explanation, copied from the vendor contract. */
  readonly description: string
  /** Vendor default, absent when the contract declares none. */
  readonly default?: string | number | boolean
  /** Closed value set, when the vendor enumerates one. */
  readonly enum?: readonly string[]
}

/** One public data capability. */
export interface StockEndpoint {
  /** Stable capability id, `<family>.<resource>.<operation>`, e.g. `a-share.prices.snapshot`. */
  readonly id: string
  /** Vendor universe this capability belongs to. */
  readonly universe: StockUniverse
  /** Model-facing tool name that exposes this capability. */
  readonly tool: string
  /** HTTP method. A vendor that accepts parameters in a body uses `POST`. */
  readonly method: 'GET' | 'POST'
  /** Request path, including any query-independent path segments. */
  readonly path: string
  /** Short Chinese title, used in tool descriptions and the catalog. */
  readonly title: string
  /** One-sentence purpose, used in tool descriptions and the catalog. */
  readonly summary: string
  /** Accepted parameters in vendor documentation order. */
  readonly params: readonly StockParam[]
  /** Whether the vendor currently allows external access. */
  readonly availability: StockAvailability
  /** Pagination model. */
  readonly paging: StockPaging
  /** Bounded history window, when the endpoint declares one. */
  readonly window: StockWindow
  /** Date encoding of this endpoint's date arguments; `none` when it takes none. */
  readonly dateEncoding: StockDateEncoding | 'none'
  /** Vendor MCP tool name, present when the capability is mirrored there. */
  readonly mcpTool?: string
  /** Where this record came from; `manual` records have no MCP schema. */
  readonly source: 'mcp' | 'manual'
}
