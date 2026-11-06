import { describe, expect, it } from 'vitest'
import { front, kept } from '../helpers/front.ts'

const keyOf = (title: string, config?: Parameters<typeof front>[1]) => front(title, config).phrases.map((p) => p.key)

describe('phrase matching (SPEC 6.2)', () => {
  it('built-in phrases become one token with the entry', () => {
    expect(keyOf('Intro to Machine Learning')).toEqual(['machine learning'])
    expect(keyOf('User Experience Review')).toEqual(['user experience'])
    expect(keyOf('Frequently Asked Questions about Billing')).toEqual(['frequently asked questions'])
    expect(keyOf('Künstliche Intelligenz im Unterricht')).toEqual(['kuenstliche intelligenz'])
    expect(keyOf('Project Kick Off')).toEqual(['kickoff'])
  })

  it('the longest phrase wins and stop words inside count', () => {
    expect(keyOf('Proof of Concept Plan')).toEqual(['proof of concept'])
    expect(keyOf('Return on Investment 2026')).toEqual(['return on investment'])
    expect(keyOf('Customer Relationship Management Tool')).toEqual(['customer relationship management'])
  })

  it('phrase words are not stop words or weak words on their own', () => {
    expect(kept('Work in Progress Board')).toEqual(['workinprogress:topic~weak', 'board:topic'])
    expect(kept('Erste Hilfe Kurs')).toEqual(['erstehilfe:topic', 'kurs:topic'])
  })

  it('hyphenated parts as a phrase; the joined form first', () => {
    expect(keyOf('Machine-Learning Basics')).toEqual(['machine learning'])
    expect(keyOf('Kick-off Termin')).toEqual([])
    expect(front('Kick-off Termin').tokens[0]?.lex?.key).toBe('kickoff')
  })

  it('a user phrase entry', () => {
    const cfg = {
      lexicon: [
        { key: 'service level agreement', lang: 'en' as const, cls: 'topic' as const, abbr: ['sla'], known: ['sla'] },
      ],
    }
    expect(keyOf('Service Level Agreement Review', cfg)).toEqual(['service level agreement'])
    expect(keyOf('Service Level Agreement Review')).toEqual([])
  })
})
