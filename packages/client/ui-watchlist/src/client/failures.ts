/**
 * The failure vocabulary the panel's panes share: one read, one code.
 * @module @deepseek-ai/dsh-client-ui-watchlist/failures
 */

/**
 * A thrown failure's stable code, or `unknown` when it carries none.
 *
 * A coded failure is the Gateway's own `RemoteError`. Anything else is a
 * programming or carrier error at this layer, and the panel names it as
 * unknown rather than inventing a code the Host never sent.
 * @param error - the value a read or command threw.
 * @returns the failure code the surface renders.
 */
export function failureCode(error: unknown): string {
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : 'unknown'
}
