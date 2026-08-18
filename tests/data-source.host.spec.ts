// 服务器数据通道:多源顺序、失败聚合与可注入 fetcher。

import { describe, expect, it, vi } from 'vitest'
import { fetchCorpus } from '../src/index.ts'

const big = 'x'.repeat(200)

const ok = (body: string): unknown => ({ ok: true, status: 200, text: async () => body })
const httpErr = (status: number): unknown => ({ ok: false, status, text: async () => '' })

describe('fetchCorpus', () => {
  it('returns the first successful source', async () => {
    const fetcher = vi.fn(async () => ok(big)) as unknown as typeof fetch
    await expect(fetchCorpus(['https://a', 'https://b'], fetcher)).resolves.toEqual({
      ok: true, source: 'https://a', error: '', text: big,
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('falls through failing sources to the next one', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.startsWith('https://a')) return httpErr(503)
      return ok(big)
    }) as unknown as typeof fetch
    await expect(fetchCorpus(['https://a', 'https://b'], fetcher)).resolves.toEqual({
      ok: true, source: 'https://b', error: '', text: big,
    })
  })

  it('aggregates readable reasons when every source fails', async () => {
    const fetcher = vi.fn(async () => httpErr(404)) as unknown as typeof fetch
    const result = await fetchCorpus(['https://a', 'https://b'], fetcher)
    expect(result.ok).toBe(false)
    expect(result.error).toBe('https://a → HTTP 404; https://b → HTTP 404')
    expect(result.text).toBe('')
  })

  it('treats short bodies as failures and keeps thrown messages', async () => {
    const shortThenThrow = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.startsWith('https://a')) return ok('short')
      throw new Error('boom')
    }) as unknown as typeof fetch
    const result = await fetchCorpus(['https://a', 'https://b'], shortThenThrow)
    expect(result.ok).toBe(false)
    expect(result.error).toBe('https://a → 响应体过短; https://b → boom')
  })
})
