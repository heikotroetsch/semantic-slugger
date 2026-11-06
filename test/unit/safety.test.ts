import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../../src/config.ts'
import {
  bodyBlocked,
  fold,
  foldTail,
  hardHitIn,
  hasLookalikePair,
  segmentBlocked,
  tailBlocked,
} from '../../src/core/safety.ts'
import { BLOCK_HARD, BLOCK_SHORT_DE, BLOCK_SOFT, TAIL_BLOCK, TAIL_BLOCK_EXTRA } from '../../src/data/v1/blocklist.ts'
import { TAIL_ALPHABETS } from '../../src/data/v1/constants.ts'

const cfg = resolveConfig()

describe('v1 blocklist data', () => {
  it('every entry is lowercase ascii, already folded, no duplicates', () => {
    for (const list of [BLOCK_HARD, BLOCK_SOFT, BLOCK_SHORT_DE, TAIL_BLOCK_EXTRA, TAIL_BLOCK]) {
      expect(new Set(list).size).toBe(list.length)
      for (const w of list) {
        expect(w).toMatch(/^[a-z]+$/)
        expect(fold(w)).toBe(w)
      }
    }
  })

  it('hard and soft do not overlap', () => {
    const soft = new Set(BLOCK_SOFT)
    for (const w of BLOCK_HARD) expect(soft.has(w)).toBe(false)
  })

  it('TAIL_BLOCK = BLOCK_SHORT_DE + extras, includes sa', () => {
    expect(TAIL_BLOCK).toEqual([...BLOCK_SHORT_DE, ...TAIL_BLOCK_EXTRA])
    expect(TAIL_BLOCK).toContain('sa')
    for (const w of ['kkk', 'fck', 'fkk', 'wtf', 'stfu', 'nzs']) expect(TAIL_BLOCK).toContain(w)
  })

  it('short codes are stored folded (88 -> bb, 18 -> ib, 1488 -> iabb, 444 -> aaa)', () => {
    for (const raw of ['88', '18', '1488', '444']) expect(BLOCK_SHORT_DE).toContain(fold(raw))
  })
})

describe('folds', () => {
  it('f maps leet digits', () => {
    expect(fold('4310578')).toBe('aeiostb')
    expect(fold('s3x')).toBe('sex')
    expect(fold('v2')).toBe('v2')
  })

  it('fT adds v -> u', () => {
    expect(foldTail('fvck')).toBe('fuck')
    expect(foldTail('cvnt')).toBe('cunt')
    expect(foldTail('k4ck3')).toBe('kacke')
  })
})

describe('B1 segments', () => {
  it('blocks list words and short codes as whole segments', () => {
    for (const s of ['ss', 'sa', 'sd', 'hh', '88', '18', 'kz', 'fick', 'anal', 'ass', '4ss', 'nazi']) {
      expect(segmentBlocked(s, cfg), s).toBe(true)
    }
  })

  it('allows normal segments', () => {
    for (const s of ['sued', 'hbg', 'strom', 'rv', 'nord', '26', '2026', 'doc', 'analyse', 'kasse']) {
      expect(segmentBlocked(s, cfg), s).toBe(false)
    }
  })
})

describe('B3 whole body', () => {
  const v = (text: string) => ({ text, verbatim: true })
  const n = (text: string) => ({ text, verbatim: false })

  it('soft word strictly inside a verbatim segment is allowed', () => {
    expect(bodyBlocked([v('analyse'), n('plt')], cfg)).toBe(false)
    expect(bodyBlocked([v('cockpit')], cfg)).toBe(false)
    expect(bodyBlocked([v('sexton')], cfg)).toBe(false)
    expect(bodyBlocked([v('shiitake'), v('titanium'), v('butter')], cfg)).toBe(false)
  })

  it('soft word in a non-verbatim segment or across a boundary is blocked', () => {
    expect(bodyBlocked([n('analys')], cfg)).toBe(true)
    expect(bodyBlocked([n('sext')], cfg)).toBe(false) // 'sex' has 3 chars: B3 checks 4+ only
    expect(bodyBlocked([v('an'), v('alyse')], cfg)).toBe(true)
    expect(bodyBlocked([v('cock')], cfg)).toBe(true) // not strictly shorter than the segment
  })

  it('hard words are blocked even inside verbatim segments, also after leet fold', () => {
    expect(bodyBlocked([v('fickenscher')], cfg)).toBe(true)
    expect(bodyBlocked([v('scunthorpe')], cfg)).toBe(true)
    expect(bodyBlocked([v('scun')], cfg)).toBe(false)
    expect(bodyBlocked([n('f1ck')], cfg)).toBe(true)
    expect(bodyBlocked([n('cu'), n('nt')], cfg)).toBe(true)
  })

  it('no false hits on common words', () => {
    for (const w of ['kotfluegel', 'scheibenwischer', 'hurtig', 'kasse', 'massnahme', 'dokument', 'schwankung']) {
      expect(bodyBlocked([v(w)], cfg), w).toBe(false)
    }
  })
})

describe('B5 and B7 tails', () => {
  it('catches leet and v->u tails, soft words count', () => {
    for (const t of ['s3x', 'f4g', '4ss', 'k4ck3', 'fvck', 'cvm', 'kkk', 'wtf', 'nzs', 'xss', 'b88']) {
      expect(tailBlocked('', t, cfg), t).toBe(true)
    }
  })

  it('2-char TAIL_BLOCK entries count as substrings, other 2-char text does not', () => {
    expect(tailBlocked('', 'kss', cfg)).toBe(true)
    expect(tailBlocked('', 'k5d', cfg)).toBe(true) // 5d -> sd
    expect(tailBlocked('', 'k3', cfg)).toBe(false)
  })

  it('uses the last body char (B5) across the separator', () => {
    expect(tailBlocked('strom-s', 's2', cfg)).toBe(true) // 'ss'
    expect(tailBlocked('strom-rv', 'k3', cfg)).toBe(false)
  })

  it('B7: hard word across body and tail is caught', () => {
    expect(tailBlocked('doc-fo', 'tz3', cfg)).toBe(true) // fotze
    expect(tailBlocked('cu', 'nt', cfg)).toBe(true)
    expect(tailBlocked('cu', 'nt', resolveConfig({ separator: '' }))).toBe(true)
  })

  it('B7 ignores hard hits fully inside the body (those are B3)', () => {
    expect(tailBlocked('fick-ab', 'k3', cfg)).toBe(false)
  })

  it('user hard words are used in tails', () => {
    const c = resolveConfig({ blocklist: { hard: { add: ['zq'] } } })
    expect(tailBlocked('', 'bzq', c)).toBe(true)
    expect(tailBlocked('', 'bzq', cfg)).toBe(false)
  })

  it('all 2- and 3-char safe tails: rejected set matches the committed list', async () => {
    const { first, rest } = TAIL_ALPHABETS.safe
    const rejected: string[] = []
    let total = 0
    for (const a of first)
      for (const b of rest) {
        total++
        if (tailBlocked('', a + b, cfg)) rejected.push(a + b)
        for (const c of rest) {
          total++
          if (tailBlocked('', a + b + c, cfg)) rejected.push(a + b + c)
        }
      }
    expect(total).toBe(560 + 15_680)
    const text = `# B5/B7 rejected safe tails, body '' (${rejected.length} of ${total})\n${rejected.join('\n')}\n`
    await expect(text).toMatchFileSnapshot('./__snapshots__/tail-rejected.v1.txt')
  })
})

describe('hardHitIn and I8', () => {
  it('hardHitIn finds hard words in folded text', () => {
    expect(hardHitIn('xxnazixx', cfg)).toBe(true)
    expect(hardHitIn('analyse', cfg)).toBe(false)
  })

  it('I8 look-alike pairs', () => {
    for (const s of ['l1', '1l', 'o0', '0o', 'i1', 'x1o', 'lo0']) expect(hasLookalikePair(s), s).toBe(true)
    for (const s of ['l2', '2l', 'k1', '10', 'lio', 'abc']) expect(hasLookalikePair(s), s).toBe(false)
  })
})
