// 纯数据层测试:YAML 子集解析、时区换算、行派生与浏览器通道拉取。
// 全部函数来自 src/client/data.ts,无 DOM/React 依赖。

import { afterEach, describe, expect, it, vi } from 'vitest'
import { DAY_MS, derive, fetchText, parseDeadlineEpoch, parseYaml, targetOf } from '../src/client/data.ts'
import type { Row, Settings } from '../src/client/data.ts'

const SETTINGS: Settings = {
  tracked: null, windowDays: 90, sortBy: 'deadline', showAbstract: true,
  showPast: false, rankAllow: ['A', 'B', 'C'], autoRefreshH: 8, collapsed: false,
}

const YAML = [
  '- title: CVPR',
  '  sub: CV',
  '  rank:',
  '    ccf: A',
  '    core: A*',
  '  description: "Computer Vision # conference" # trailing comment',
  '  confs:',
  '    - year: 2026',
  '      link: https://cvpr.thecvf.com',
  '      timezone: AoE',
  '      date: 2026-06-15',
  '      place: San Diego',
  '      timeline:',
  "        - abstract_deadline: '2026-01-10 23:59:59'",
  "          deadline: '2026-01-17 23:59:59'",
  '- title: ICCV',
  '  sub: CV',
  '  rank:',
  '    ccf: A',
  '  confs:',
  '    - year: 2026',
  '      timezone: UTC+8',
  '      timeline:',
  "        - deadline: '2026-08-20 00:00:00'",
].join('\n')

describe('parseYaml', () => {
  it('parses the ccfddl schema shape (nesting, quotes, comments)', () => {
    const parsed = parseYaml(YAML) as Array<Record<string, any>>
    expect(parsed).toHaveLength(2)
    const cvpr = parsed[0] as Record<string, any>
    expect(cvpr.title).toBe('CVPR')
    expect(cvpr.rank.ccf).toBe('A')
    expect(cvpr.rank.core).toBe('A*')
    expect(cvpr.description).toBe('Computer Vision # conference')
    const conf0 = (cvpr.confs as any[])[0] as Record<string, any>
    expect(conf0.year).toBe(2026)
    expect(conf0.timezone).toBe('AoE')
    expect(conf0.timeline).toEqual([
      { abstract_deadline: '2026-01-10 23:59:59', deadline: '2026-01-17 23:59:59' },
    ])
    expect((parsed[1] as Record<string, any>).confs[0].timezone).toBe('UTC+8')
  })

  it('tolerates CRLF line endings and a leading BOM', () => {
    const crlf = parseYaml(YAML.replaceAll('\n', '\r\n'))
    expect(crlf).toHaveLength(2)
    const bom = parseYaml('\uFEFF' + YAML)
    expect(bom).toHaveLength(2)
  })

  it('returns [] for empty or non-YAML input', () => {
    expect(parseYaml('')).toEqual([])
    expect(parseYaml('hello world\n\t: not a map')).toEqual([])
  })
})

describe('parseDeadlineEpoch', () => {
  it('converts wall-clock time with the conference timezone offset', () => {
    const utc = Date.UTC(2026, 8, 1, 23, 59, 59)
    expect(parseDeadlineEpoch('2026-09-01 23:59:59', 'UTC')).toBe(utc)
    expect(parseDeadlineEpoch('2026-09-01 23:59:59', 'AoE')).toBe(utc + 12 * 3600000)
    expect(parseDeadlineEpoch('2026-09-01 23:59:59', 'UTC+8')).toBe(utc - 8 * 3600000)
  })

  it('defaults the time part to midnight and rejects malformed input', () => {
    expect(parseDeadlineEpoch('2026-09-01', 'UTC')).toBe(Date.UTC(2026, 8, 1, 0, 0, 0))
    expect(parseDeadlineEpoch('', 'UTC')).toBeNull()
    expect(parseDeadlineEpoch('not-a-date', 'UTC')).toBeNull()
    expect(parseDeadlineEpoch('2026-09-01 12:00', 'UTC')).toBeNull()
  })
})

describe('targetOf', () => {
  const row = (abstract: number | null, paper: number | null): Row => ({
    title: 'X', description: '', sub: '', rank: { ccf: 'A', core: null, thcpl: null },
    next: {
      year: 2026, link: '', timezone: 'UTC', date: '', place: '',
      abstractEpochMs: abstract, abstractText: null, paperEpochMs: paper, paperText: null,
    },
    past: false,
  })
  const now = Date.UTC(2026, 0, 1)

  it('prefers the future abstract deadline, then paper, else 0', () => {
    expect(targetOf(row(now + 10 * DAY_MS, now + 20 * DAY_MS), now)).toBe(now + 10 * DAY_MS)
    expect(targetOf(row(null, now + 20 * DAY_MS), now)).toBe(now + 20 * DAY_MS)
    expect(targetOf(row(null, null), now)).toBe(0)
    expect(targetOf(row(now - DAY_MS, now + DAY_MS), now)).toBe(now + DAY_MS)
  })
})

describe('derive', () => {
  const NOW = Date.UTC(2026, 7, 1) // 2026-08-01
  const corpus = [
    { title: 'AAA', sub: 'AI', rank: { ccf: 'A' }, confs: [{ year: 2026, timezone: 'UTC', timeline: [{ deadline: '2026-08-10 00:00:00' }] }] },
    { title: 'BBB', sub: 'SE', rank: { ccf: 'B' }, confs: [{ year: 2026, timezone: 'UTC', timeline: [{ deadline: '2026-08-05 00:00:00' }] }] },
    { title: 'CCC', sub: 'AI', rank: { ccf: 'A' }, confs: [{ year: 2026, timezone: 'UTC', timeline: [{ deadline: '2026-09-30 00:00:00' }] }] },
    { title: 'DDD', sub: 'AI', rank: { ccf: 'A' }, confs: [{ year: 2026, timezone: 'UTC', timeline: [{ deadline: '2026-01-01 00:00:00' }] }] },
  ]

  it('tracks A-ranked conferences by default and sorts by deadline', () => {
    const { rows, catalog } = derive(corpus, SETTINGS, NOW)
    expect(catalog.map(c => c.title)).toEqual(['AAA', 'BBB', 'CCC', 'DDD'])
    expect(rows.map(r => r.title)).toEqual(['AAA', 'CCC'])
    expect(rows.every(r => !r.past)).toBe(true)
  })

  it('honors windowDays, rankAllow, tracked and showPast', () => {
    const narrow = derive(corpus, { ...SETTINGS, windowDays: 30 }, NOW)
    expect(narrow.rows.map(r => r.title)).toEqual(['AAA'])
    const bOnly = derive(corpus, { ...SETTINGS, tracked: ['BBB'] }, NOW)
    expect(bOnly.rows.map(r => r.title)).toEqual(['BBB'])
    const withPast = derive(corpus, { ...SETTINGS, showPast: true }, NOW)
    expect(withPast.rows.map(r => [r.title, r.past])).toEqual([
      ['AAA', false], ['CCC', false], ['DDD', true],
    ])
  })

  it('picks the earliest future timeline entry', () => {
    const conf = [{
      title: 'AAA', sub: 'AI', rank: { ccf: 'A' },
      confs: [{
        year: 2026, timezone: 'UTC',
        timeline: [
          { deadline: '2026-08-20 00:00:00' },
          { abstract_deadline: '2026-08-12 00:00:00', deadline: '2026-08-19 00:00:00' },
        ],
      }],
    }]
    const { rows } = derive(conf, { ...SETTINGS, tracked: ['AAA'] }, NOW)
    const first = rows[0] as Row
    expect(first.next.abstractEpochMs).toBe(Date.UTC(2026, 7, 12))
    expect(first.next.paperEpochMs).toBe(Date.UTC(2026, 7, 19))
  })
})

describe('fetchText', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  const textOf = (body: string): Response => ({ ok: true, status: 200, text: async () => body }) as Response
  const big = 'x'.repeat(200)

  it('returns the body on success and a readable reason on HTTP failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => textOf(big)))
    await expect(fetchText('https://a')).resolves.toEqual({ text: big })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, text: async () => '' }) as Response))
    await expect(fetchText('https://a')).resolves.toEqual({ error: 'HTTP 500' })
  })

  it('surfaces thrown errors and rejects short bodies', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('boom') }))
    await expect(fetchText('https://a')).resolves.toEqual({ error: 'boom' })
    vi.stubGlobal('fetch', vi.fn(async () => textOf('short')))
    await expect(fetchText('https://a')).resolves.toEqual({ error: '响应体过短' })
  })

  it('works without AbortSignal.timeout (legacy browsers)', async () => {
    const original = AbortSignal.timeout
    ;(AbortSignal as { timeout?: unknown }).timeout = undefined
    try {
      vi.stubGlobal('fetch', vi.fn(async () => textOf(big)))
      await expect(fetchText('https://a')).resolves.toEqual({ text: big })
    } finally {
      ;(AbortSignal as { timeout?: unknown }).timeout = original
    }
  })
})
