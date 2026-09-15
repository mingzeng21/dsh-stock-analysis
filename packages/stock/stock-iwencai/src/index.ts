/**
 * 问财 (iwencai) provider for the stock capability seam. It registers one
 * `StockProvider` on `ctx.stock` and owns everything vendor-specific: the
 * gateway origin, the `Bearer` credential, the per-skill identity headers, the
 * transport policy, and the mapping from the gateway's two response shapes onto
 * the seam's result and failure types.
 *
 * Adding a 问财 capability is a registry row plus its identity, not a new
 * plugin: every capability is one of the gateway's two endpoints with a
 * different skill identity.
 * @module @deepseek-ai/dsh-stock-iwencai
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import type { StockProvider, StockProviderRequest, StockResult } from '@deepseek-ai/dsh-stock'
import type {} from '@deepseek-ai/dsh-stock'
import { IWENCAI_CAPABILITIES, IWENCAI_ENDPOINTS } from './catalog/generated.ts'
import { IwencaiTransport } from './http.ts'
import { normalizeResult } from './normalize.ts'

export {
  IWENCAI_CAPABILITIES,
  IWENCAI_ENDPOINTS,
  IWENCAI_ENDPOINTS_BY_ID,
} from './catalog/generated.ts'
export type { IwencaiCapability, IwencaiFamily } from './catalog/generated.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'stock-iwencai'

/** The stock seam this provider registers into. */
export const inject = ['stock']

/** Provider id this plugin registers under. */
export const IWENCAI_PROVIDER_ID = 'iwencai'

/** Default credential reference; the vendor's own skills read the same name. */
export const DEFAULT_API_KEY_ENV = 'IWENCAI_API_KEY'

/** Default gateway origin. */
export const DEFAULT_BASE_URL = 'https://openapi.iwencai.com'

/** Default per-attempt deadline in milliseconds. */
export const DEFAULT_TIMEOUT_MS = 30_000

/** Default total attempts for one call, including the first. */
export const DEFAULT_MAX_ATTEMPTS = 3

/**
 * Default cap on in-flight requests. The vendor documents no quota and counts a
 * request against a daily allowance, so this stays conservative.
 */
export const DEFAULT_MAX_CONCURRENCY = 4

/** Plugin config. */
export interface Config {
  /** Literal API key; prefer {@link Config.apiKeyEnv} so no secret enters configuration files. */
  apiKey?: string
  /** Credential reference resolved for each call; defaults to `IWENCAI_API_KEY`. */
  apiKeyEnv?: string
  /** Gateway origin; defaults to `https://openapi.iwencai.com`. */
  baseUrl?: string
  /** Per-attempt deadline in milliseconds. Defaults to 30000. */
  timeoutMs?: number
  /** Total attempts for one call, including the first. Defaults to 3. */
  maxAttempts?: number
  /** Cap on in-flight requests. Defaults to 4. */
  maxConcurrency?: number
}

/** Schemastery configuration for the 问财 provider. */
export const Config: z<Config> = z.object({
  apiKey: z.string().role('secret'),
  apiKeyEnv: z.string().role('credential-ref').default(DEFAULT_API_KEY_ENV),
  baseUrl: z.string().default(DEFAULT_BASE_URL),
  timeoutMs: z.number().step(1).min(1).default(DEFAULT_TIMEOUT_MS),
  maxAttempts: z.number().step(1).min(1).default(DEFAULT_MAX_ATTEMPTS),
  maxConcurrency: z.number().step(1).min(1).default(DEFAULT_MAX_CONCURRENCY),
})

/** Register the 问财 provider with `ctx.stock`. */
export function apply(ctx: Context, config: Config): void {
  // schemastery (Config) has already filled every defaulted field.
  const resolved = config as Required<Config>
  const baseUrl = resolved.baseUrl.replace(/\/+$/, '')
  if (!/^https?:\/\//.test(baseUrl)) {
    // A bad origin must fail at load, not as a confusing transport error later.
    throw new Error(`stock-iwencai: baseUrl must be an absolute HTTP(S) URL, got "${resolved.baseUrl}"`)
  }
  const apiKeyEnv = credentialRef(resolved.apiKeyEnv)
  // `apiKey` carries no schemastery default, so `Required<Config>` overstates
  // it; read the original field, where the type is honestly optional.
  const literalApiKey = config.apiKey !== undefined && config.apiKey.length > 0 ? config.apiKey : undefined
  const transport = new IwencaiTransport({
    baseUrl,
    timeoutMs: resolved.timeoutMs,
    maxAttempts: resolved.maxAttempts,
    maxConcurrency: resolved.maxConcurrency,
    resolveApiKey: async () => {
      if (literalApiKey !== undefined) return literalApiKey
      const credentials = ctx.get('credentials')
      if (credentials !== undefined) return (await credentials.resolve(apiKeyEnv))?.value
      // Without the seam the environment is the whole credential plane.
      const ambient = launchEnvironmentOf(ctx).get(apiKeyEnv)
      return ambient !== undefined && ambient.value.length > 0 ? ambient.value : undefined
    },
  })

  const provider: StockProvider = {
    id: IWENCAI_PROVIDER_ID,
    endpoints: IWENCAI_ENDPOINTS,
    // Credentials resolve per call, so a missing key is reported then rather
    // than hiding a registered provider from catalog listings.
    available: () => true,
    execute: async (request: StockProviderRequest): Promise<StockResult> => {
      const capability = IWENCAI_CAPABILITIES.get(request.endpoint.id)
      if (capability === undefined) {
        throw new Error(`stock-iwencai: no gateway identity is registered for "${request.endpoint.id}"`)
      }
      const payload = await transport.post(request.endpoint, request.params, capability, request.signal)
      return normalizeResult(request.endpoint, request.params, payload)
    },
  }
  ctx.stock.register(provider)
}
