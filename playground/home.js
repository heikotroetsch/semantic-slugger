// @ts-check
/**
 * Start page of the playground: one title in, one ID out. It imports the built package from `./dist/`,
 * like the batch page (`batch.html`, `app.js`). The title and options live in `location.hash`, so a link
 * shows the same result.
 */

import { createSlugger, isSluggerError } from './dist/index.js'

/** @typedef {import('./dist/index.js').SluggerConfig} SluggerConfig */
/** @typedef {import('./dist/index.js').SlugResult} SlugResult */

/** Synthetic example titles from different fields, German and English. */
export const EXAMPLES = [
  'How to Bake Sourdough Bread at Home',
  'Login fails on Safari after update to v2.4',
  'Quarterly Sales Review Q3 2026',
  'Wochenplanung Team Marketing KW 45',
  'Einführung neues CRM System im Vertrieb',
  'Introduction to Machine Learning with Python',
  'Sommerfest 2026 Firmengelände',
  'The Future of Electric Cars in Europe',
]

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
  title: /** @type {HTMLTextAreaElement} */ ($('title')),
  id: $('id'),
  copy: /** @type {HTMLButtonElement} */ ($('copy')),
  parts: $('parts'),
  meta: $('meta'),
  error: $('error'),
  examples: $('examples'),
  length: /** @type {HTMLInputElement} */ ($('length')),
  lengthOut: /** @type {HTMLOutputElement} */ ($('length-out')),
  lengthMode: /** @type {HTMLSelectElement} */ ($('lengthMode')),
  separator: /** @type {HTMLSelectElement} */ ($('separator')),
}

const LANG_NAMES = /** @type {Record<string, string>} */ ({ de: 'German', en: 'English', und: 'not detected' })

/** @param {SlugResult['segments'][number]} s */
function partLabel(s) {
  if (s.kind === 'tail') return 'code'
  if (s.kind === 'fallback') return 'no words left'
  return s.source ?? ''
}

/** @returns {SluggerConfig} */
function config() {
  return {
    length: Number(ui.length.value),
    lengthMode: /** @type {'exact' | 'max'} */ (ui.lengthMode.value),
    separator: /** @type {'-' | '_' | ''} */ (ui.separator.value),
  }
}

function writeHash() {
  const p = new URLSearchParams()
  if (ui.title.value !== '') p.set('t', ui.title.value)
  if (ui.length.value !== '16') p.set('len', ui.length.value)
  if (ui.lengthMode.value !== 'exact') p.set('mode', ui.lengthMode.value)
  if (ui.separator.value !== '-') p.set('sep', ui.separator.value === '' ? 'none' : ui.separator.value)
  const h = p.toString()
  history.replaceState(null, '', h === '' ? location.pathname : `#${h}`)
}

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1))
  ui.title.value = p.get('t') ?? EXAMPLES[0] ?? ''
  const len = Number(p.get('len'))
  if (len >= 8 && len <= 32) ui.length.value = String(len)
  const mode = p.get('mode')
  if (mode === 'max' || mode === 'exact') ui.lengthMode.value = mode
  const sep = p.get('sep')
  if (sep === '_' || sep === '-') ui.separator.value = sep
  if (sep === 'none') ui.separator.value = ''
}

function grow() {
  ui.title.style.height = 'auto'
  ui.title.style.height = `${ui.title.scrollHeight + 2}px`
}

function run() {
  ui.lengthOut.value = ui.length.value
  writeHash()
  grow()
  ui.parts.replaceChildren()
  ui.error.hidden = true
  const title = ui.title.value
  if (title.trim() === '') {
    ui.id.textContent = ' '
    ui.meta.textContent = 'Type a title above.'
    ui.copy.disabled = true
    return
  }
  try {
    const r = createSlugger(config()).suggest(title)
    ui.id.textContent = r.id
    ui.copy.disabled = false
    ui.copy.textContent = 'Copy'
    for (const s of r.segments) {
      const li = document.createElement('li')
      li.className = s.kind === 'tail' ? 'part tail' : 'part'
      const code = document.createElement('code')
      code.textContent = s.text
      const from = document.createElement('span')
      from.textContent = partLabel(s)
      li.append(code, from)
      ui.parts.append(li)
    }
    const notes = [`Language: ${LANG_NAMES[r.lang] ?? r.lang}`, `${r.id.length} characters`]
    if (r.tail !== '') notes.push('the code at the end fills the length or keeps the ID unique')
    ui.meta.textContent = notes.join(' · ')
  } catch (e) {
    ui.id.textContent = ' '
    ui.copy.disabled = true
    ui.error.hidden = false
    ui.error.textContent = isSluggerError(e) ? `${e.code}: ${e.message}` : e instanceof Error ? e.message : String(e)
  }
}

for (const t of EXAMPLES) {
  const b = document.createElement('button')
  b.type = 'button'
  b.textContent = t
  b.addEventListener('click', () => {
    ui.title.value = t
    run()
    ui.title.focus()
  })
  ui.examples.append(b)
}

ui.copy.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(ui.id.textContent ?? '')
    ui.copy.textContent = 'Copied'
  } catch {
    ui.copy.textContent = 'Copy failed'
  }
})

for (const el of [ui.title, ui.length]) el.addEventListener('input', run)
for (const el of [ui.lengthMode, ui.separator]) el.addEventListener('change', run)

readHash()
run()
