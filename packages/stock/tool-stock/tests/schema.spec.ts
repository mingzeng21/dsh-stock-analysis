/**
 * Parameter-schema translation: wire type mapping, requiredness, enums,
 * defaults, and agreement with the registry records.
 */

import { describe, expect, it } from 'vitest'
import { FIXTURE_ENDPOINTS, endpoint, param } from './fixtures.ts'
import { modelParamType, paramProperty, parameterSchema } from '../src/schema.ts'

const symbolSearch = FIXTURE_ENDPOINTS[0]!

describe('wire type translation', () => {
  it.each([
    ['string', 'string'],
    ['integer', 'integer'],
    ['number', 'number'],
    ['boolean', 'boolean'],
    ['object', 'string'],
    ['array', 'string'],
  ] as const)('declares a %s parameter as %s', (wire, declared) => {
    expect(modelParamType(wire)).toBe(declared)
  })
})

describe('parameter properties', () => {
  it('publishes requiredness, the enum, and the vendor default', () => {
    expect(paramProperty(symbolSearch.params[0]!)).toEqual({
      type: 'string',
      required: true,
      description: '检索词',
    })
    expect(paramProperty(symbolSearch.params[1]!)).toEqual({
      type: 'string',
      description: '资产类型',
      enum: ['stock', 'fund'],
      default: 'stock',
    })
  })

  it.each([
    ['integer', 10],
    ['number', undefined],
    ['boolean', undefined],
  ] as const)('publishes a %s parameter without an enum', (type, fallback) => {
    const property = paramProperty(param({ name: 'p', type, ...fallback === undefined ? {} : { default: fallback } }))
    expect((property as { type?: unknown }).type).toBe(type)
    expect('enum' in property).toBe(false)
  })
})

describe('endpoint parameter maps', () => {
  it('maps every declared parameter in registry order', () => {
    const schema = parameterSchema(symbolSearch)
    expect(Object.keys(schema)).toEqual([
      'q', 'asset_type', 'limit', 'weight', 'strict', 'filters', 'fields',
    ])
    expect(schema.filters).toMatchObject({ type: 'string', description: 'JSON 过滤条件' })
    expect(schema.fields).toMatchObject({ type: 'string', description: 'JSON 字段列表' })
  })

  it('leaves an endpoint with no parameters empty', () => {
    expect(parameterSchema(endpoint({ id: 'x.y', tool: 'x_y' }))).toEqual({})
  })
})
