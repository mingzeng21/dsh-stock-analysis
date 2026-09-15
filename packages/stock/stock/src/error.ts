/**
 * Failure taxonomy for the stock capability seam. Codes are stable and
 * machine-routable; consumers branch on the code and never parse the message.
 * Vendor business codes are mapped onto these classes by the provider, so a
 * caller does not need the vendor's numeric error table to react correctly.
 * @module @deepseek-ai/dsh-stock/error
 */

import { HarnessError } from '@deepseek-ai/dsh-llm'

/** No usable provider is registered, or the configured one cannot serve. */
export const STOCK_PROVIDER_UNAVAILABLE = 'STOCK_PROVIDER_UNAVAILABLE'

/** The configured provider id is not registered. */
export const STOCK_PROVIDER_CONFIGURED_MISSING = 'STOCK_PROVIDER_CONFIGURED_MISSING'

/** More than one provider claims the same capability id. */
export const STOCK_DUPLICATE_ENDPOINT = 'STOCK_DUPLICATE_ENDPOINT'

/** A provider with that id is already registered. */
export const STOCK_DUPLICATE_PROVIDER = 'STOCK_DUPLICATE_PROVIDER'

/** The requested capability id is not in the registry. */
export const STOCK_UNKNOWN_ENDPOINT = 'STOCK_UNKNOWN_ENDPOINT'

/** Arguments failed seam validation before any request was issued. */
export const STOCK_INVALID_PARAMS = 'STOCK_INVALID_PARAMS'

/** The vendor refused the credential, or the key is missing. */
export const STOCK_UNAUTHENTICATED = 'STOCK_UNAUTHENTICATED'

/** The credential is valid but lacks permission for this capability. */
export const STOCK_FORBIDDEN = 'STOCK_FORBIDDEN'

/** The requested instrument does not exist. */
export const STOCK_NOT_FOUND = 'STOCK_NOT_FOUND'

/** The instrument exists but has no data for the requested window. */
export const STOCK_NO_DATA = 'STOCK_NO_DATA'

/** The instrument's asset type does not support the requested capability. */
export const STOCK_UNSUPPORTED_ASSET = 'STOCK_UNSUPPORTED_ASSET'

/** The vendor throttled the request; retry after backing off. */
export const STOCK_RATE_LIMITED = 'STOCK_RATE_LIMITED'

/** The vendor or an upstream data source failed. */
export const STOCK_UPSTREAM = 'STOCK_UPSTREAM'

/** The capability is published by the vendor but not open to external access. */
export const STOCK_CAPABILITY_CLOSED = 'STOCK_CAPABILITY_CLOSED'

/** The call was cancelled through its signal. */
export const STOCK_CANCELLED = 'STOCK_CANCELLED'

/** The vendor response did not match its published envelope. */
export const STOCK_MALFORMED_RESPONSE = 'STOCK_MALFORMED_RESPONSE'

/**
 * Typed stock error. `code` is one of the constants in this module; a provider
 * may surface a vendor-specific code only when it maps to none of them.
 */
export class StockError extends HarnessError {}
