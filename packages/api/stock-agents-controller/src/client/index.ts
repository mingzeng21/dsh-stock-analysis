/** Browser read face for the bundled stock Agents catalog. */
import { Service, type Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-api-stock-agents-controller/remote'
import type { RemoteResult, TypertRemoteNamespaceMap } from '@deepseek-ai/dsh-typert-protocol'
import type { StockAgentCard } from '../types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Client read face for the current stock Agent catalog. */
    stockAgentsClient: IStockAgentsClient
  }
}

/** Browser reads of developer-maintained specialist cards. */
export interface IStockAgentsClient {
  /**
   * Read the current cards without loading skill bodies.
   * @returns cards or a structured Remote failure.
   */
  list(): Promise<RemoteResult<readonly StockAgentCard[]>>
}

/** Expose the catalog Remote under one injected Client service. */
export class StockAgentsClient extends Service implements IStockAgentsClient {
  /** @param ctx - Client plugin context. @param namespace - catalog Remote namespace. */
  constructor(ctx: Context, private readonly namespace: TypertRemoteNamespaceMap['stockAgents']) {
    super(ctx, 'stockAgentsClient')
  }

  /** {@inheritDoc IStockAgentsClient.list} */
  list(): Promise<RemoteResult<readonly StockAgentCard[]>> {
    return this.namespace.list()
  }
}

/** Remote services required before mounting the browser read face. */
export const inject = ['remote', 'remote.stockAgents']

/** Mount the browser read face. @param ctx - Client root context. */
export function apply(ctx: Context): void {
  new StockAgentsClient(ctx, ctx.remote.stockAgents)
}
