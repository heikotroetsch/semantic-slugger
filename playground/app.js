// @ts-check
/**
 * semantic-slugger playground (SPEC 18.7). No framework, no bundler: it imports the built package from
 * `./dist/`. Locally, `pnpm playground` serves `playground/` and `dist/` with the same paths as Pages.
 * The state lives in `location.hash`, so a link shows the same titles and config.
 */

import { DEFAULT_TITLES, DEMO_SECRET, PRESETS } from './data.js'
import { memoryStore } from './dist/adapters/memory.js'
import { createSlugger, isSluggerError } from './dist/index.js'

/** @typedef {import('./dist/index.js').SlugResult} SlugResult */
/** @typedef {import('./dist/index.js').Explanation} Explanation */
/** @typedef {import('./dist/index.js').SluggerConfig} SluggerConfig */

/**
 * @template {HTMLElement} T
 * @param {string} id
 * @returns {T}
 */
function $(id) {
  const el = document.getElementById(id)
  if (!el) throw new Error(`missing #${id}`)
  return /** @type {T} */ (el)
}

const ui = {
  titles: /** @type {HTMLTextAreaElement} */ ($('titles')),
  length: /** @type {HTMLInputElement} */ ($('length')),
  lengthOut: /** @type {HTMLOutputElement} */ ($('length-out')),
  lengthMode: /** @type {HTMLSelectElement} */ ($('lengthMode')),
  separator: /** @type {HTMLSelectElement} */ ($('separator')),
  leak: /** @type {HTMLSelectElement} */ ($('leak')),
  tailAlphabet: /** @type {HTMLSelectElement} */ ($('tailAlphabet')),
  consistentRungs: /** @type {HTMLInputElement} */ ($('consistentRungs')),
  langDe: /** @type {HTMLInputElement} */ ($('lang-de')),
  langEn: /** @type {HTMLInputElement} */ ($('lang-en')),
  simulate: /** @type {HTMLInputElement} */ ($('simulate')),
  secretNote: $('secret-note'),
  stopWords: /** @type {HTMLInputElement} */ ($('stopWords')),
  denyTokens: /** @type {HTMLInputElement} */ ($('denyTokens')),
  reserved: /** @type {HTMLInputElement} */ ($('reserved')),
  lexicon: /** @type {HTMLTextAreaElement} */ ($('lexicon')),
  error: $('error'),
  body: /** @type {HTMLTableSectionElement} */ ($('results').querySelector('tbody')),
  detail: $('detail'),
  detailId: $('detail-id'),
  rank: /** @type {HTMLTableElement} */ ($('rank')),
  explain: $('explain'),
  share: /** @type {HTMLButtonElement} */ ($('share')),
}

/** @param {string} s */
const words = (s) =>
  s
    .split(/[,\n]/)
    .map((w) => w.trim())
    .filter((w) => w !== '')

// ---------------------------------------------------------------------------------------------
// State in location.hash
// ---------------------------------------------------------------------------------------------

const FIELDS = /** @type {const} */ ([
  'length',
  'lengthMode',
  'separator',
  'leak',
  'tailAlphabet',
  'stopWords',
  'denyTokens',
  'reserved',
  'lexicon',
])

function writeHash() {
  const p = new URLSearchParams()
  p.set('t', ui.titles.value)
  for (const f of FIELDS) {
    const el = ui[f]
    p.set(f, el.value)
  }
  p.set('rungs', ui.consistentRungs.checked ? '1' : '0')
  p.set('langs', [ui.langDe.checked ? 'de' : '', ui.langEn.checked ? 'en' : ''].filter(Boolean).join(','))
  p.set('db', ui.simulate.checked ? '1' : '0')
  history.replaceState(null, '', `#${p.toString()}`)
}

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1))
  ui.titles.value = p.get('t') ?? DEFAULT_TITLES.join('\n')
  for (const f of FIELDS) {
    const v = p.get(f)
    if (v !== null) ui[f].value = v
  }
  const langs = (p.get('langs') ?? 'de,en').split(',')
  ui.langDe.checked = langs.includes('de')
  ui.langEn.checked = langs.includes('en')
  ui.consistentRungs.checked = p.get('rungs') === '1'
  ui.simulate.checked = p.get('db') === '1'
}

// ---------------------------------------------------------------------------------------------
// Config and run
// ---------------------------------------------------------------------------------------------

/** @returns {SluggerConfig} */
function configFromUi() {
  /** @type {SluggerConfig} */
  const cfg = {
    length: Number(ui.length.value),
    lengthMode: /** @type {'exact' | 'max'} */ (ui.lengthMode.value),
    separator: /** @type {'-' | '_' | ''} */ (ui.separator.value),
    leak: /** @type {'normal' | 'minimal' | 'opaque'} */ (ui.leak.value),
    tailAlphabet: ui.tailAlphabet.value,
    consistentRungs: ui.consistentRungs.checked,
  }
  const langs = [ui.langDe.checked ? 'de' : '', ui.langEn.checked ? 'en' : ''].filter(Boolean)
  if (langs.length > 0) {
    cfg.languages = langs
    cfg.defaultLang = /** @type {string} */ (langs[0])
  }
  if (cfg.leak === 'opaque') cfg.secret = DEMO_SECRET
  const stop = words(ui.stopWords.value)
  if (stop.length > 0) cfg.stopWords = { add: stop }
  const deny = words(ui.denyTokens.value)
  if (deny.length > 0) cfg.denyTokens = deny
  const reserved = words(ui.reserved.value)
  if (reserved.length > 0) cfg.reserved = { add: reserved }
  const lex = ui.lexicon.value.trim()
  if (lex !== '') {
    let parsed
    try {
      parsed = JSON.parse(lex)
    } catch {
      throw new Error('Lexicon: not valid JSON')
    }
    if (!Array.isArray(parsed)) throw new Error('Lexicon: must be a JSON array of entries')
    cfg.lexicon = parsed
  }
  return cfg
}

/** @type {{ title: string, result: SlugResult, trace: Explanation }[]} */
let rows = []
/** Index of the row whose explain panel is open, or -1. */
let selected = -1
let runId = 0

async function run() {
  const mine = ++runId
  ui.lengthOut.value = ui.length.value
  ui.secretNote.hidden = ui.leak.value !== 'opaque'
  ui.secretNote.textContent = `Opaque uses a visible demo secret here: "${DEMO_SECRET}". Use your own secret in real code.`
  writeHash()
  const titles = ui.titles.value.split('\n').filter((t) => t.trim() !== '')
  /** @type {typeof rows} */
  const next = []
  try {
    const slugger = createSlugger(configFromUi())
    if (ui.simulate.checked) {
      const store = memoryStore()
      for (const title of titles) {
        const { result } = await slugger.createUnique(title, { store, trace: true })
        if (mine !== runId) return
        const { trace, ...plain } = result
        if (trace) next.push({ title, result: /** @type {SlugResult} */ (plain), trace })
      }
    } else {
      for (const title of titles) {
        const trace = slugger.explain(title)
        next.push({ title, result: trace.result, trace })
      }
    }
    ui.error.hidden = true
  } catch (e) {
    ui.error.hidden = false
    ui.error.textContent = isSluggerError(e) ? `${e.code}: ${e.message}` : e instanceof Error ? e.message : String(e)
  }
  if (mine !== runId) return
  rows = next
  render()
}

function render() {
  ui.body.replaceChildren()
  rows.forEach((r, i) => {
    const tr = document.createElement('tr')
    tr.tabIndex = 0
    tr.dataset.index = String(i)
    for (const text of [r.title, r.result.id, r.result.lang, r.result.reason, r.result.tail === '' ? 'no' : 'yes']) {
      const td = document.createElement('td')
      td.textContent = text
      tr.append(td)
    }
    tr.addEventListener('click', () => show(i))
    tr.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault()
        show(i)
      }
    })
    ui.body.append(tr)
  })
  // keep the open row after a re-run (a blur or an edit must not close the explain panel)
  if (rows[selected]) show(selected)
  else {
    selected = -1
    ui.detail.hidden = true
  }
}

/** @param {number} i */
function show(i) {
  const r = rows[i]
  if (!r) return
  selected = i
  for (const tr of ui.body.querySelectorAll('tr'))
    tr.setAttribute('aria-selected', String(tr.dataset.index === String(i)))
  ui.detail.hidden = false
  ui.detailId.textContent = r.result.id
  ui.explain.textContent = r.trace.toString()
  ui.rank.replaceChildren()
  const step = r.trace.steps.find((s) => s.stage === 'rank')
  if (step?.stage !== 'rank') {
    const cap = document.createElement('caption')
    cap.textContent = 'No rank table: the title has no usable words, or leak is opaque.'
    ui.rank.append(cap)
    return
  }
  const head = ['key', 'cls', 'base', 'rarity', 'pos', 'tf', 'lex', 'diff', 'score']
  const thead = document.createElement('thead')
  const htr = document.createElement('tr')
  head.forEach((h, j) => {
    const th = document.createElement('th')
    th.textContent = h
    if (j > 1) th.className = 'num'
    htr.append(th)
  })
  thead.append(htr)
  const tbody = document.createElement('tbody')
  for (const row of step.rows) {
    const tr = document.createElement('tr')
    const cells = [row.key, row.cls, row.base, row.rarity, row.pos, row.tf, row.lex, row.diff, row.score]
    cells.forEach((c, j) => {
      const td = document.createElement('td')
      td.textContent = String(c)
      if (j > 1) td.className = 'num'
      tr.append(td)
    })
    tbody.append(tr)
  }
  ui.rank.append(thead, tbody)
}

// ---------------------------------------------------------------------------------------------
// Presets and events
// ---------------------------------------------------------------------------------------------

function setupPresets() {
  const box = /** @type {HTMLElement} */ (document.querySelector('.presets'))
  const none = /** @type {HTMLButtonElement} */ (box.querySelector('button'))
  /** @type {HTMLButtonElement[]} */
  const buttons = [none]
  for (const [name, p] of Object.entries(PRESETS)) {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = p.label
    b.dataset.preset = name
    box.append(b)
    buttons.push(b)
  }
  for (const b of buttons) {
    b.addEventListener('click', () => {
      const p = PRESETS[b.dataset.preset ?? '']
      for (const x of buttons) x.setAttribute('aria-pressed', String(x === b))
      ui.lexicon.value = p ? JSON.stringify(p.lexicon, null, 1) : ''
      ui.denyTokens.value = p?.denyTokens?.join(', ') ?? ''
      ui.reserved.value = p?.reserved?.join(', ') ?? ''
      if (p) {
        const have = new Set(ui.titles.value.split('\n'))
        const add = p.titles.filter((t) => !have.has(t))
        if (add.length > 0) ui.titles.value = `${add.join('\n')}\n${ui.titles.value}`
      }
      void run()
    })
  }
}

function setup() {
  readHash()
  setupPresets()
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer
  const later = () => {
    clearTimeout(timer)
    timer = setTimeout(() => void run(), 150)
  }
  for (const el of document.querySelectorAll('textarea, input, select')) {
    el.addEventListener('input', later)
    // text fields: 'input' is enough; a 'change' on blur would re-run for nothing
    const toggle =
      el instanceof HTMLSelectElement || (el instanceof HTMLInputElement && /^(checkbox|radio)$/.test(el.type))
    if (toggle) el.addEventListener('change', later)
  }
  ui.share.addEventListener('click', async () => {
    writeHash()
    try {
      await navigator.clipboard.writeText(location.href)
      ui.share.textContent = 'Link copied'
    } catch {
      ui.share.textContent = 'Copy the address bar'
    }
    setTimeout(() => {
      ui.share.textContent = 'Copy link'
    }, 1500)
  })
  void run()
}

setup()
