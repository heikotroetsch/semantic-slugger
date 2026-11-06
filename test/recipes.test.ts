/**
 * The domain recipes of the README (SPEC 15.8, 19.1 "recipes"): each gives its documented output.
 * The recipes are plain user config; the core ships no domain knowledge.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { medicine, medicineConfig, medicineExamples } from '../examples/recipes/medicine.ts'
import { procurement, procurementConfig, procurementExamples } from '../examples/recipes/procurement.ts'
import { software, softwareConfig, softwareExamples } from '../examples/recipes/software.ts'
import { createSlugger, slug } from '../src/index.ts'

const recipes = [
  { name: 'procurement', s: procurement, cfg: procurementConfig, examples: procurementExamples },
  { name: 'software', s: software, cfg: softwareConfig, examples: softwareExamples },
  { name: 'medicine', s: medicine, cfg: medicineConfig, examples: medicineExamples },
]

describe('README recipes', () => {
  for (const r of recipes) {
    it(`${r.name}: documented outputs`, () => {
      expect(Object.keys(r.examples).length).toBeGreaterThan(1)
      for (const [title, id] of Object.entries(r.examples)) expect(r.s.slug(title), title).toBe(id)
    })
  }

  it('procurement separates Los 1 and Los 2 (the Q6 case skipped in default config)', () => {
    const a = procurement.slug('Leistungsverzeichnis Gebäudereinigung Los 1')
    const b = procurement.slug('Leistungsverzeichnis Gebäudereinigung Los 2')
    expect(a).not.toBe(b)
    expect(a.endsWith('los1')).toBe(true)
    expect(b.endsWith('los2')).toBe(true)
  })

  it('the recipe changes the output, so the knowledge comes from config, not the core', () => {
    expect(slug('Rahmenvertrag Stromlieferung Standorte Nord 2026')).not.toBe('rv-strom-nord-26')
    expect(slug('Kubernetes Cluster Upgrade Q3 2026')).not.toContain('k8s')
  })

  it('medicine: deny tokens never show and are not stored', () => {
    const r = medicine.suggest('Patient Intake Form')
    expect(r.id).not.toContain('pat')
    expect(r.stems.some((s) => s.startsWith('patient'))).toBe(false)
  })

  it('software: reserved words are never an ID', () => {
    expect(software.slug('Tickets')).not.toBe('tickets')
    expect(software.config.reserved).toContain('tickets')
  })

  it('every recipe is a valid config and the README shows its code', () => {
    const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
    for (const r of recipes) {
      expect(() => createSlugger(r.cfg)).not.toThrow()
      for (const [title, id] of Object.entries(r.examples)) {
        expect(readme, `${r.name}: ${title}`).toContain(title)
        expect(readme, `${r.name}: ${id}`).toContain(id)
      }
    }
  })
})
