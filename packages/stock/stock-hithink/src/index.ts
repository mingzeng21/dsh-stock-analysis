/**
 * Hithink (同花顺) provider for the stock capability seam. It registers one
 * `StockProvider` on `ctx.stock` and owns everything vendor-specific: the REST
 * origin, the `X-api-key` credential, the transport policy, and the mapping
 * from the vendor's response envelope onto the seam's result and failure types.
 * @module @deepseek-ai/dsh-stock-hithink
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import type { StockProvider, StockProviderRequest, StockResult } from '@deepseek-ai/dsh-stock'
import type {} from '@deepseek-ai/dsh-stock'
import { STOCK_ENDPOINTS } from './catalog/generated.ts'
import { HithinkTransport } from './http.ts'
import { normalizeResult } from './normalize.ts'

export { STOCK_ENDPOINTS, STOCK_ENDPOINTS_BY_ID, STOCK_ENDPOINTS_BY_TOOL } from './catalog/generated.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'stock-hithink'

/** The stock seam this provider registers into. */
export const inject = ['stock']

/** Provider id this plugin registers under. */
export const HITHINK_PROVIDER_ID = 'hithink'

/** Default credential reference; the vendor's own CLI and skill read the same name. */
export const DEFAULT_API_KEY_ENV = 'HITHINK_FINANCE_API_KEY'

/** Default vendor origin. */
export const DEFAULT_BASE_URL = 'https://fuyao.aicubes.cn'

/** Default per-attempt deadline in milliseconds. */
export const DEFAULT_TIMEOUT_MS = 30_000

/** Default total attempts for one call, including the first. */
export const DEFAULT_MAX_ATTEMPTS = 3

/**
 * Default cap on in-flight requests. The vendor publishes no fixed quota, so
 * this stays conservative to avoid the burst throttling its documentation warns
 * about.
 */
export const DEFAULT_MAX_CONCURRENCY = 4

/** Plugin config. */
export interface Config {
  /** Literal API key; prefer {@link Config.apiKeyEnv} so no secret enters configuration files. */
  apiKey?: string
  /** Credential reference resolved for each call; defaults to `HITHINK_FINANCE_API_KEY`. */
  apiKeyEnv?: string
  /** Vendor origin; defaults to `https://fuyao.aicubes.cn`. */
  baseUrl?: string
  /** Per-attempt deadline in milliseconds. Defaults to 30000. */
  timeoutMs?: number
  /** Total attempts for one call, including the first. Defaults to 3. */
  maxAttempts?: number
  /** Maximum in-flight requests. Defaults to 4. */
  maxConcurrency?: number
}

/** Config schema; every field is defaulted so the configuration surface renders resolved values. */
export const Config: z<Config> = z.object({
  apiKey: z.string().role('secret'),
  apiKeyEnv: z.string().role('credential-ref').default(DEFAULT_API_KEY_ENV),
  baseUrl: z.string().default(DEFAULT_BASE_URL),
  timeoutMs: z.number().step(1).min(1).default(DEFAULT_TIMEOUT_MS),
  maxAttempts: z.number().step(1).min(1).default(DEFAULT_MAX_ATTEMPTS),
  maxConcurrency: z.number().step(1).min(1).default(DEFAULT_MAX_CONCURRENCY),
})

/**
 * The registered provider: the vendor's endpoint registry plus the transport
 * that executes it. It answers only what the seam asks — which capabilities
 * exist, whether it is locally usable, and what one call returns — and leaves
 * validation and row bounds to the seam.
 */
export class HithinkProvider implements StockProvider {
  /** Stable provider id. */
  readonly id = HITHINK_PROVIDER_ID

  /** Every capability the vendor currently exposes to API-key clients. */
  readonly endpoints = STOCK_ENDPOINTS

  /** @param transport - Credentialed transport built from resolved plugin config. */
  constructor(private readonly transport: HithinkTransport) {}

  /**
   * @returns True when this provider is locally usable; see {@link HithinkTransport.available}.
   */
  available(): boolean {
    return this.transport.available()
  }

  /**
   * Execute one capability and normalize its envelope.
   * @param request - Endpoint, validated parameters, and the caller's signal.
   * @returns Normalized rows plus the batch facts the vendor reported.
   */
  async execute(request: StockProviderRequest): Promise<StockResult> {
    const envelope = await this.transport.get(request.endpoint, request.params, request.signal)
    return normalizeResult(request.endpoint, request.params, envelope)
  }
}

/** Register the Hithink provider with `ctx.stock`. */
export function apply(ctx: Context, config: Config): void {
  // schemastery (Config) has already filled every defaulted field.
  const resolved = config as Required<Config>
  const apiKeyEnv = credentialRef(resolved.apiKeyEnv)
  // `apiKey` carries no schemastery default, so `Required<Config>` overstates
  // it; read the original field, where the type is honestly optional.
  const literalApiKey = config.apiKey !== undefined && config.apiKey.length > 0 ? config.apiKey : undefined
  const transport = new HithinkTransport({
    baseUrl: resolved.baseUrl,
    resolveApiKey: async () => {
      if (literalApiKey !== undefined) return literalApiKey
      const credentials = ctx.get('credentials')
      if (credentials !== undefined) return (await credentials.resolve(apiKeyEnv))?.value
      // Without the seam the environment is the whole credential plane.
      const ambient = launchEnvironmentOf(ctx).get(apiKeyEnv)
      return ambient !== undefined && ambient.value.length > 0 ? ambient.value : undefined
    },
    timeoutMs: resolved.timeoutMs,
    maxAttempts: resolved.maxAttempts,
    maxConcurrency: resolved.maxConcurrency,
  })
  if (!transport.available()) {
    throw new Error(`stock-hithink: baseUrl ${JSON.stringify(resolved.baseUrl)} is not an absolute HTTP(S) URL`)
  }
  ctx.stock.register(new HithinkProvider(transport))
}
