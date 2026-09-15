/**
 * The gateway's failure classification: an HTTP status is judged before the
 * business `status_code`, and a refusal that is not JSON must still reach the
 * caller verbatim, because "当前 Skill 版本过低" is the only actionable detail a
 * version-gated 401 carries.
 */

import { describe, expect, it } from 'vitest'
import {
  STOCK_FORBIDDEN,
  STOCK_MALFORMED_RESPONSE,
  STOCK_RATE_LIMITED,
  STOCK_UNAUTHENTICATED,
  STOCK_UPSTREAM,
} from '@deepseek-ai/dsh-stock'
import { isRetryable, readEnvelope } from '../src/envelope.ts'

/** The seam code and message of an expected synchronous rejection. */
function failureFrom(run: () => unknown): { code: string; message: string } {
  try {
    run()
  } catch (error: unknown) {
    return error as { code: string; message: string }
  }
  throw new Error('expected readEnvelope to throw')
}

describe('readEnvelope HTTP status', () => {
  it('carries a non-JSON 401 body verbatim, because that message is the gate', () => {
    const raw = '当前 Skill 版本过低，本次请求无法执行。请前往问财 SkillHub 下载最新版本后重试。'
    const failure = failureFrom(() => readEnvelope(401, raw))

    expect(failure.code).toBe(STOCK_UNAUTHENTICATED)
    expect(failure.message).toContain(raw)
  })

  it('classifies the remaining refusal statuses', () => {
    expect(failureFrom(() => readEnvelope(403, 'no')).code).toBe(STOCK_FORBIDDEN)
    expect(failureFrom(() => readEnvelope(429, 'slow down')).code).toBe(STOCK_RATE_LIMITED)
  })

  it('treats every server fault as upstream', () => {
    for (const status of [500, 502, 503]) {
      const failure = failureFrom(() => readEnvelope(status, 'boom'))
      expect(failure.code).toBe(STOCK_UPSTREAM)
      expect(failure.message).toContain(String(status))
    }
  })

  it('trims a short error body', () => {
    expect(failureFrom(() => readEnvelope(401, '   spaced  ')).message.endsWith(': spaced')).toBe(true)
  })

  it('truncates a long error body so a vendor page cannot flood the message', () => {
    const failure = failureFrom(() => readEnvelope(401, 'x'.repeat(400)))
    const bodyChars = failure.message.match(/x/g) ?? []

    expect(bodyChars).toHaveLength(300)
    expect(failure.message.endsWith('…')).toBe(true)
  })
})

describe('readEnvelope body parsing', () => {
  it('rejects a non-JSON body on an otherwise successful status', () => {
    const failure = failureFrom(() => readEnvelope(200, '<html>not json</html>'))

    expect(failure.code).toBe(STOCK_MALFORMED_RESPONSE)
    expect(failure.message).toContain('<html>not json</html>')
  })

  it('rejects a body that parses to a non-object', () => {
    for (const body of ['[1,2]', '42', '"text"', 'null', 'true']) {
      expect(failureFrom(() => readEnvelope(200, body)).code).toBe(STOCK_MALFORMED_RESPONSE)
    }
  })

  it('rejects an object whose status_code is not a number', () => {
    for (const body of ['{}', '{"status_code":"0"}', '{"status_code":null}']) {
      const failure = failureFrom(() => readEnvelope(200, body))
      expect(failure.code).toBe(STOCK_MALFORMED_RESPONSE)
      expect(failure.message).toContain('status_code')
    }
  })

  it('reports a non-zero business code together with the vendor message', () => {
    const failure = failureFrom(() => readEnvelope(200, JSON.stringify({ status_code: 3001, status_msg: '问句解析失败' })))

    expect(failure.code).toBe(STOCK_UPSTREAM)
    expect(failure.message).toContain('3001')
    expect(failure.message).toContain('问句解析失败')
  })

  it('says so when a failed business code carries no message', () => {
    const failure = failureFrom(() => readEnvelope(200, JSON.stringify({ status_code: -2 })))

    expect(failure.code).toBe(STOCK_UPSTREAM)
    expect(failure.message).toContain('no status_msg')
  })

  it('returns the parsed payload on success', () => {
    const payload = readEnvelope(200, JSON.stringify({ status_code: 0, data: [{ a: 1 }] }))

    expect(payload.statusCode).toBe(0)
    expect(payload.body).toEqual({ status_code: 0, data: [{ a: 1 }] })
    expect('statusMessage' in payload).toBe(false)
  })

  it('keeps the vendor status message when it sent one', () => {
    const payload = readEnvelope(200, JSON.stringify({ status_code: 0, status_msg: 'OK' }))

    expect(payload.statusMessage).toBe('OK')
  })

  it('ignores a non-string status message', () => {
    const payload = readEnvelope(200, JSON.stringify({ status_code: 0, status_msg: 7 }))

    expect('statusMessage' in payload).toBe(false)
  })
})

describe('isRetryable', () => {
  it('retries only throttling and server faults', () => {
    expect(isRetryable(429)).toBe(true)
    expect(isRetryable(500)).toBe(true)
    expect(isRetryable(503)).toBe(true)
    expect(isRetryable(400)).toBe(false)
    expect(isRetryable(401)).toBe(false)
    expect(isRetryable(200)).toBe(false)
  })
})
