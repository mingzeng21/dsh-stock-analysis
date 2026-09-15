/**
 * Parameter schemas for the model-facing stock tools, translated from the
 * generated vendor registry.
 *
 * Two translations are deliberate. The tool DSL expresses only `enum`, `const`,
 * `required`, and type, so the vendor's numeric and format bounds stay with the
 * seam's parameter validator instead of being approximated here. Structured
 * arguments (`object` / `array` in the vendor contract) travel as JSON inside a
 * query parameter, so the model sees them as strings.
 * @module @deepseek-ai/dsh-tool-stock/schema
 */

import type { StockEndpoint, StockParam } from '@deepseek-ai/dsh-stock'
import type { ParameterPropertySpec, ParameterSchemaSpec } from '@deepseek-ai/dsh-tools'

/** Type one parameter is declared with to the model. */
export type ModelParamType = 'string' | 'integer' | 'number' | 'boolean'

/**
 * Translate one registry wire type into the type the model sees.
 * @param type - wire type declared by the vendor contract.
 * @returns the model-visible type; structured arguments are JSON strings.
 */
export function modelParamType(type: StockParam['type']): ModelParamType {
  switch (type) {
    case 'string':
      return 'string'
    case 'integer':
      return 'integer'
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    // The vendor encodes object and array arguments as JSON in one query value.
    case 'object':
    case 'array':
      return 'string'
  }
}

/**
 * Build the model-visible property for one registry parameter. `enum` is
 * published only for string parameters because the DSL constrains a value set
 * per type, and the vendor enumerates only strings.
 * @param param - one registry parameter.
 * @returns the property declaration for the tool's parameter map.
 */
export function paramProperty(param: StockParam): ParameterPropertySpec {
  const annotations = {
    ...param.required ? { required: true as const } : {},
    ...param.default === undefined ? {} : { default: param.default },
    description: param.description,
  }
  switch (modelParamType(param.type)) {
    case 'string':
      return { type: 'string', ...annotations, ...param.enum === undefined ? {} : { enum: [...param.enum] } }
    case 'integer':
      return { type: 'integer', ...annotations }
    case 'number':
      return { type: 'number', ...annotations }
    case 'boolean':
      return { type: 'boolean', ...annotations }
  }
}

/**
 * Build the parameter map for one capability. Parameter order follows the
 * registry, which follows the vendor documentation.
 * @param endpoint - registry record whose `params` defines the accepted contract.
 * @returns the parameter schema registered with the tool.
 */
export function parameterSchema(endpoint: StockEndpoint): ParameterSchemaSpec {
  const schema: Record<string, ParameterPropertySpec> = {}
  for (const param of endpoint.params) schema[param.name] = paramProperty(param)
  return schema
}
