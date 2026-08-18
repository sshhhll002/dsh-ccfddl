/**
 * CCF DDL 数据服务的服务器半。数据由服务器进程自身的网络栈拉取
 * (不再依赖浏览器出网),通过生成的 Typert Remote 方法交给浏览器组件;
 * 客户端仅在远端不可用时降级回浏览器直连。设置持久化与渲染仍在
 * 客户端 (src/client/index.ts)。
 * @module @deepseek-ai/dsh-ccfddl
 */
import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { CcfddlFetchResult } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    'ccfddl.data': CcfddlData
  }
}

const SOURCE_URLS = [
  'https://ccfddl.com/conference/allconf.yml',
  'http://ccfddl.com/conference/allconf.yml',
] as const

/** 短 TTL 内存缓存:多标签页/手动刷新在窗口期内不重复出网。 */
const CACHE_TTL_MS = 5 * 60_000

/**
 * 依次尝试各数据源;成功返回正文与来源,全部失败返回各源的可读原因。
 * fetcher 可注入,便于测试与复用浏览器侧的同一逻辑形状。
 */
export async function fetchCorpus(urls: readonly string[], fetcher: typeof fetch): Promise<CcfddlFetchResult> {
  const failures: string[] = []
  for (const url of urls) {
    try {
      const signal = typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(30000) : undefined
      const response = await fetcher(url, signal === undefined ? undefined : { signal })
      if (!response.ok) { failures.push(`${url} → HTTP ${response.status}`); continue }
      const text = await response.text()
      if (text.length > 100) return { ok: true, source: url, error: '', text }
      failures.push(`${url} → 响应体过短`)
    } catch (error) {
      failures.push(`${url} → ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return { ok: false, source: '', error: failures.join('; '), text: '' }
}

/**
 * 服务器端数据通道:浏览器经连接 API 调用 {@link CcfddlData.fetchData},
 * 语料只在本进程与页面之间流动,页面无需自行访问外网。
 */
export class CcfddlData extends TypertRemoteService {
  private cache: { text: string; source: string; at: number } | null = null

  constructor(ctx: Context) {
    super(ctx, 'ccfddl.data')
  }

  /**
   * 用服务器自身的网络栈拉取 ccfddl 合并语料。
   * @returns 成功携带 YAML 文本;全部失败时携带各源的可读原因。
   */
  @Remote
  async fetchData(): Promise<CcfddlFetchResult> {
    const cached = this.cache
    if (cached !== null && Date.now() - cached.at < CACHE_TTL_MS) {
      return { ok: true, source: cached.source, error: '', text: cached.text }
    }
    const result = await fetchCorpus(SOURCE_URLS, fetch)
    if (result.ok) this.cache = { text: result.text, source: result.source, at: Date.now() }
    return result
  }
}

export default CcfddlData
