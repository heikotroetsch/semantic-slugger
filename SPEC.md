# semantic-slugger: implementation spec v1

Status: rev 2, final for build, 2026-11-06. Owner: lead architect.
Inputs: research report, three design proposals (readability, API, correctness), fixture corpus `test/fixtures/titles.json` (407 synthetic titles), review of rev 1 (46 issues plus fixture notes; decisions in Appendix A).

This spec is the only source of truth for the build. Where it says MUST, tests check it. Where it says "guidance", the value is a target for review, not an exact expectation.

**Public repo rule.** Use only synthetic titles. Never use real customer data, qado MCP tools or real contract data in code, tests, docs, issues or the playground.

---

## 0. How the three proposals were merged

The three proposals mostly fit together. Readability gives the language pipeline and the fit search. API gives the developer surface and packaging. Correctness gives the tail, the store contract, the collision order and versioning. These conflicts were decided as follows:

| # | Conflict | Decision | Why |
|---|---|---|---|
| C1 | Default `lengthMode`: `exact` (API, correctness) vs `max` (readability) | `exact`, length 16. `max` is a documented "readable" preset. Rev 2: no rung exists only to pad (section 12.1). | The product owner (PO) asked for a fixed length. Open question Q1 stays. |
| C2 | Tail always present (correctness) vs only when needed (readability, API) | Tail only when needed: for padding in exact mode, or for a collision. | Fewer codes means better readability. The fit search spends length on words first. |
| C3 | Hash: cyrb53 (readability, API) vs SipHash-2-4 (correctness) | SipHash-2-4, keyed, pure JS on 32-bit halves (no BigInt). | Published test vectors (ports to Python/Go can be checked). It cannot be inverted the way FNV or cyrb53 can, which matters for `secret` and opaque IDs. |
| C4 | Scope in the hash (correctness) vs not (API) | Not in the hash. Use `secret` per tenant if needed (README recommends it for multi-tenant use). | A client-side preview without the scope then matches the server for the empty-store case. Scopes are separate anyway. |
| C5 | Duplicate spreading: attempt counter (readability) vs `dupIndex = countBody(body)` (correctness) | One tail index `k`. It starts at `countBody(body)` when the store can count, else at 0, and walks up. | O(1) for the n-th duplicate. For identical titles both paths reach the same ID. |
| C6 | Smart re-pick source: `titleOf` (readability) vs `findByBody` returning stems (correctness) | `findByBody` with stems. Rev 2: stored stems do not depend on the lexicon (8.2). | No need to store or re-analyze titles. Works with hashed stems. Lexicon edits do not break old rows. |
| C7 | Segment order: slot order (readability) vs rank order with anchor (correctness, API) | Slot order T, D, Q, N. Inside a slot: title position. | Same shape for all IDs, related IDs sort together, easier to remember. Sibling IDs do not swap segments when scores change. |
| C8 | Scores: floats (readability, API) vs fixed-point integers (correctness) | Integers in "centi" units (x100), integer log table. | Bit-identical results in every engine. |
| C9 | Leak levels: `full/normal/minimal/opaque` vs `full/topic/none` vs `normal/minimal/opaque` | `normal` (default), `minimal`, `opaque`. | `full` was the same as `normal`. Three levels are enough. |
| C10 | Fallback word: `doc` vs `item` vs lead letter `n` | `doc`. Numbers-only titles become `doc-2026-...`. | Reads as a word. Keeps "first char is a letter". |
| C11 | Store-required methods: `exists` only (API) vs `exists + countBody` (correctness) | Only `exists` is required. All others optional. Shipped adapters implement all. Rev 2: output is defined per capability tier (13.3). | A custom adapter can be 5 lines. Quality features turn on when methods exist. |
| C12 | API names: `slug/generate/createWithSlug` vs `slugify/generate/create` vs `suggest/generate/createUnique` | `slug()` (string), `suggest()` (sync result), `generate()` (async), `createUnique()` (insert + retry), `explain()`, `analyze()`. | Each name says what it does. `slugify` is avoided because it reads like the plain transliteration libs. |
| C13 | Subpath names: `./memory` vs `./adapters/memory` | `./adapters/memory`, `./adapters/prisma`, `./adapters/sql`, `./data`. | Clear grouping. |
| C14 | Data source format: `.txt` plus generator (API) vs TS files (others) | TS files with `as const` in `src/data/v1/`. No generator. | Fewer moving parts. The diff is still readable. |
| C15 | Playground: Vite (readability, correctness) vs no bundler (API) | No bundler. Static HTML + `app.js` that imports `dist/`. | Zero extra dev deps. |
| C16 | Long numbers (PO numbers): last 4 digits (readability) vs drop at 9+ digits (correctness) | Last 4 digits in `normal`, low score, so they only show when budget is left. Dropped in `minimal`. | Recognizable when space allows, low leak. |
| C17 | Engines: `>=20` vs `>=22` | `>=22`. | Node 20 is EOL. vitest 5 needs 22.12+. |
| C18 | Custom list options: array or function (API) vs `{add, remove}` (readability) | `{ add?, remove? }` or a function `(defaults) => list`. | Covers both needs. |
| C19 | Re-pick candidate count and plan steps P0 to P5 (correctness) vs exhaustive fit sorted by cost (readability) | The fit search is the plan generator. Re-pick re-runs the fit with a diff boost. | One mechanism, deterministic, easy to explain. |
| C20 | Separator and double-click | Default `-`. Options `_` and `''`. | The charset rule and double-click conflict. Open question Q2 for the PO. |

---

## 1. Goals and non-goals

### Goals

1. Turn a title (German, English or mixed) into a short ID that a person can read, guess the topic from and say on the phone. Example: `Rahmenvertrag Stromlieferung Standorte Nord 2026` gives `strom-rv-nord-26`.
2. Unique per scope, through the DB `UNIQUE(scope, slug)` constraint plus a retry helper.
3. Stable: the ID is created once, stored and never recomputed.
4. Fixed length by default (16), configurable 8 to 64. `max` mode as an option.
5. Charset `[a-z0-9]` plus separator, lowercase, no dots, ASCII only.
6. No look-alikes (`0 o 1 l i`) and no vowels in the hash part. No look-alike pairs (`l1`, `o0`, ...) in word parts.
7. No bad words in DE or EN, also not across segment boundaries.
8. Deterministic: same title + same config + same store answers give the same ID, in Node and in the browser.
9. Zero runtime dependencies. Core has no `node:` imports and runs in browsers, Deno, Bun and edge runtimes.
10. ESM + CJS builds with types. Memory, Prisma and SQL adapters.
11. `explain()` shows every pipeline step.

### Non-goals (v1)

- Languages other than de/en. Non-Latin scripts beyond a small Cyrillic/Greek table need the `transliterate` hook.
- Changing an ID when the title changes.
- Global uniqueness without a DB. Sync `taken` sets are best effort.
- A full German dictionary or hyphenation patterns (license and size).
- Title-order output (`order: 'title'`). Could come later as `algorithm: 2` option.
- A prefix option (`c-...`). Use `scope` instead.
- Machine learning, network calls, async work in the core pipeline.

---

## 2. ID format and invariants

### 2.1 Shape

```
<body>[<sep><tail>]
body = seg ( <sep> seg ){0..3}         1 to maxSegments semantic segments, slot order T D Q N
tail = C A{t-1}                        C = consonant letter, A = tail alphabet, t >= tMin (2)
```

Examples (length 16, exact):

```
strom-rv-nord-26        body only (16)
strom-rv-2026-k3        body 13 + sep + tail 2
doc-k7q9m3xdt2hz        empty title: fallback word + tail 12
x7kq2m9dbn4hc8wt        leak 'opaque' (needs `secret`): tail only, 16
```

Slots:

| Slot | Concept classes | Typical length |
|---|---|---|
| T topic | `topic`, `attr` | 3 to 8 |
| D type/action | `doctype`, `action`, `activity` | 2 to 5 |
| Q qualifier | `place`, `direction`, `region`, `org`, `code` | 2 to 8 |
| N number/time | `year`, `range`, `quarter`, `week`, `marker`, `longnum` | 2 to 5 |

`org` is always slot Q. Score decides only which concepts go into the body. Within a slot, segments are ordered by first title position asc, then key asc (code-unit compare). So sibling IDs keep the same segment order when df changes scores. If the first segment of the body starts with a digit, the fallback word is prepended as an extra T segment (and counts against `maxSegments`; if that overflows, the lowest-score N segment is dropped).

### 2.2 Tail alphabet

| Name | First char (20) | Other chars |
|---|---|---|
| `safe` (default) | `bcdfghjkmnpqrstvwxyz` | `bcdfghjkmnpqrstvwxyz23456789` (28) |
| `strict` | `kmqrtxy` (7) | `kmqrtxy345678` (13) |
| custom string | consonant letters of the string | the string |

Goals:
- `safe` removes vowels (no words) and the look-alikes `0 o 1 l i`. It is for reading on a screen.
- `strict` is for IDs that people read aloud, type from paper or give on the phone. It is a Crockford-like set. From each group of letters whose names rhyme in DE or EN, at most one is kept:
  - `b c d e g p t v w z` (be/de/te/we, bee/dee/tee/zee): keeps `t`
  - `a h j k` (ha/ka, jay/kay): keeps `k`
  - `f l m n s r x` (ef/em/en/es): keeps `m`, `r`, `x` (distinct consonants)
  - `q u`: keeps `q`. `y` has no rhyme partner.

  Digits: `2` is removed (`zwei`/`drei`), `9` is removed (`five`/`nine`), `0 1` are look-alikes. The look-alike pairs `5/s`, `2/z`, `8/b`, `6/g` cannot occur because the letter side is not in the set. `strict` has fewer chars, so tails grow sooner (`K(2) = 91`, `K(3) = 1183`). The README tells users to spell IDs with the NATO alphabet anyway.

Custom alphabets MUST: have unique chars, all in `[a-z0-9]`, at least 12 chars, at least 6 letters, none of `a e i o u 0 o 1 l i`. Otherwise `ConfigError`.

### 2.3 Invariants

`assertInvariants(id, body, tail, cfg)` runs before every return. A failure throws `InternalError` (a bug). Property tests target each one.

| # | Invariant | Test |
|---|---|---|
| I1 | exact: `id.length === cfg.length`. max: `id.length <= cfg.length` | property |
| I2 | `id` matches `cfg.pattern`. For `-`: `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`. For `_`: same with `_`. For `''`: `^[a-z][a-z0-9]*$` | property |
| I3 | First char is `[a-z]` | property |
| I4 | Not all digits after removing separators | property |
| I5 | Tail chars only from the tail alphabet, first tail char from its consonants | property |
| I6 | No blocked segment, no blocked cross-boundary substring, no blocked tail pattern (section 9) | property + corpus |
| I7 | `id` is not a reserved word. In max mode with no tail, `body` is not reserved | unit |
| I8 | In body segments, no letter from `{l, i, o}` is next to a digit from `{0, 1}` (either order). With separator `''` the check runs on the joined body, so joins like `...o` + `1...` also fail | property |
| I9 | Pure ASCII, so `length` equals byte length | property |
| I10 | At most `maxSegments` body segments, no empty segment | property |

With separator `''`, the tail is the last `t` chars, and the result carries `tail` separately.

`isValidSlug(id, cfg?)` checks I1, I2, I3, I4, I9 and the blocklist (it cannot know where the tail starts, so I5 is not checked).

---

## 3. Pipeline overview

```
raw title
 1 normalize        NFKC, markup, entities, zero-width, emoji, case flags, lowercase, special
                    tokens, ordered noise removal with protected number spans, translit
                    -> canonical title (ascii, [a-z0-9 -]) + token surfaces (umlauts kept)
 2 tokenize         code runs joined first; tokens with class hints: word, year, range, quarter,
                    week, marker+num, longnum, code, quantity, smallnum, orgsuffix, person-title, noise
 3 detect language  de | en | und, plus per-token language (translit tokens are always und)
 4 phrase match     multi-word lexicon entries ("master service agreement" -> msa)
 5 stop words       function, conflict, domain (removed); weak and attr marked; back-off
 6 org + persons    org name next to legal form (after line words), person names dropped
 7 compound split   DP over lexicon parts with linkers, head/modifier roles (de tokens only)
 8 concepts + stems concept per lexicon hit / head; lexicon-free stems (CISTEM / Porter2) for storage
 9 rank             integer score: class, rarity (prior blended with store df), position, tf, weight
10 ladders          display forms per concept, cost per rung, blocklist pre-filter
11 fit              bounded search over concept subsets x rungs x tail length, lowest cost
12 resolve          countBody(best) -> findByBody diff -> re-pick or keep body -> tail index k -> exists
13 createUnique     insert, retry on UNIQUE conflict with exclude set
```

Steps 1 to 11 are pure and sync (`analyze` + `plan`). Step 12 is a sans-IO generator that yields store requests. `suggest()` drives it with a sync `taken` set, `generate()` drives it with an async store. Same code path, so sync and async give the same result for the same answers.

---

## 4. Normalization (step 1)

### 4.1 Algorithm

```ts
function normalize(raw: string, cfg): Normalized {
  if (typeof raw !== 'string') throw new InputError('title must be a string')
  let s = raw.length > cfg.maxInputLength ? raw.slice(0, cfg.maxInputLength) : raw   // warning 'truncated'
  s = s.toWellFormed?.() ?? replaceLoneSurrogates(s, ' ')
  s = s.normalize('NFKC')
  s = s.replace(/<[^>]{0,200}>/g, ' ')                       // markup, bounded, linear
  s = decodeEntities(s)                                       // &amp; &lt; &gt; &quot; &apos; &nbsp; &#NN; &#xNN;
  s = s.replace(/­/g, '')                                // soft hyphen
  s = s.replace(/[​-‍⁠﻿]/g, ' ')          // zero-width = word break
  s = s.replace(/\p{Extended_Pictographic}|️|⃣/gu, ' ')
  const cased = s                                             // kept for case flags (5.1), never displayed
  s = s.replace(/ẞ/g, 'ß').toLowerCase()             // ẞ -> ß, then lowercase. Never toLocale*
  s = s.replace(/c\+\+/g, ' cpp ').replace(/c#/g, ' csharp ').replace(/(^|\s)\.net\b/g, ' dotnet ')
  const { text, spans } = removeNoise(s)                      // ordered noise removal + protected number spans (4.3)
  s = translitScripts(text, cfg)                              // Cyrillic, Greek tables; cfg.transliterate hook first
  return { surface: s, cased, spans, canonical: toCanonical(s) }
}

function asciiFold(w: string): string {
  return w.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/ł/g, 'l').replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/œ/g, 'oe')
    .replace(/[đð]/g, 'd').replace(/þ/g, 'th').replace(/ı/g, 'i')
    .normalize('NFD').replace(/\p{M}/gu, '')
}

function toCanonical(surface: string): string {
  return asciiFold(surface).replace(/[^a-z0-9]+/g, ' ').trim()   // used as hash input and titleKey
}
```

Rules:
- Scripts that remain non-Latin after translit (CJK, Arabic, ...) are dropped from tokens, warning `script-dropped`. If the canonical title is then empty but the raw title was not, `canonical` becomes `'raw:' + hex(utf8(rawNFKC))` so two different CJK titles get different tails.
- `NFKC/NFD` differences between engines only affect code points newer than the engine's Unicode version. All Latin, Greek and Cyrillic handling uses explicit tables.
- `createSlugger` checks once that `String.prototype.normalize` exists and that `'ä'.normalize('NFD').length === 2`. If not, it throws `ConfigError` with reason `runtime-no-normalize`. No silent fallback, because the output would differ.
- `utf8(s)` is our own encoder in `src/hash/encode.ts` (about 15 lines, code points to 1 to 4 bytes, lone surrogates already replaced). `TextEncoder` is not used, so the core type-checks with `lib: ["ES2022"]` and `types: []`.
- `cased` keeps the pre-lowercase text. The tokenizer applies the same split to it, so each token gets a case flag `upper | title | lower | mixed`. If the token counts differ (rare NFKC or `ẞ` effects), all flags are `unknown`. Case flags are only signals for language, attr, org, person and legal-form rules. They never change the canonical title.

### 4.2 Transliteration tables (v1 data)

Cyrillic: `а a, б b, в v, г g, д d, е e, ё e, ж zh, з z, и i, й y, к k, л l, м m, н n, о o, п p, р r, с s, т t, у u, ф f, х kh, ц ts, ч ch, ш sh, щ shch, ъ -, ы y, ь -, э e, ю yu, я ya, і i, ї yi, є ye, ґ g` (`-` = removed).
Greek (after NFD and mark removal): `α a, β v, γ g, δ d, ε e, ζ z, η i, θ th, ι i, κ k, λ l, μ m, ν n, ξ x, ο o, π p, ρ r, σ s, ς s, τ t, υ y, φ f, χ ch, ψ ps, ω o`.
Order: `cfg.transliterate(s)` (user hook) first, then the built-in tables.

### 4.3 Noise removal (all leak levels)

The steps run in this order. All patterns use the `u` flag. `B = (?<![\p{L}\p{N}])` and `E = (?![\p{L}\p{N}])` are Unicode word edges (`\b` fails next to `€`, `$`, `£`). Removed text is replaced with a space.

| # | Step | Pattern | Notes |
|---|---|---|---|
| 1 | emails | `[^\s@]{1,64}@[^\s@.]{1,63}(?:\.[^\s@.]{1,63}){1,4}` | bounded; the rev 1 pattern `\S+@\S+\.\S+` took 5 to 12 s on `"a@" x 2048` |
| 2 | URLs | `\b(?:https?://\|www\.)[^\s]{1,2048}` | |
| 3 | IBAN | `B(?:<cc>)\d{2}(?: ?[a-z0-9]{4}){3,7}(?: ?[a-z0-9]{1,3})?E` | `<cc>` = fixed list of SEPA country codes (`ad at be bg ch cy cz de dk ee es fi fr gb gr hr hu ie is it li lt lu lv mc mt nl no pl pt ro se si sk sm`). `kw` is not in the list. A match whose 4-char groups are all years `(19\|20)\d\d` is kept (not an IBAN) |
| 4 | dates | `B\d{1,2}[./]\d{1,2}[./](?:\d{4}\|\d{2})E` | not removed: masked as a protected `year` span (5.1) |
| 5 | phone | `B(?:\+\d{1,3}\|0\d{1,5})(?:[ /()-]{1,2}\d{1,8}){1,4}E` | needs a leading `+` or `0` and at least one separator. Post-filter: 7 to 15 digits; without `+`, rejected when a group is a year `(19\|20)\d\d` |
| 6 | protected spans | ranges, `fy`, weeks, years, longnum (5.1 rules) | detected and masked so steps 7 to 9 cannot touch them. Masks are private-use chars, restored before tokenizing |
| 7 | money | `\d[\d.,]{0,20}\s?(?:€\|eur\|euro\|usd\|\$\|chf\|gbp\|£\|tsd\|mio\|mrd\|k€)E` and the reverse order `(?:€\|eur\|usd\|\$\|chf\|gbp\|£)\s?\d[\d.,]{0,20}E` | |
| 8 | percent | `\d{1,6}(?:[.,]\d{1,4})?\s?%` | |
| 9 | payment terms | `B(?:net(?:to)?\s?\d{1,3}\|\d{1,3}\s?(?:tage\|days)\s?(?:netto\|net))E` | `Net 60`, `30 Tage netto` |

Tested in rev 2: `4500012345`, `2025 2026 2027`, `kw 12 2026 2027 2028`, `2026 / 2027 / 2028`, `kw12 2026 2027 2028`, `01/02/2026` and `Los 01 2026 2027` are not removed. `budget 500 € 2026`, `+49 89 1234567`, `089/12345678` and `DE89 3704 0044 0532 0130 00` are removed.

All regexes MUST be linear (no nested quantifiers, every repeat bounded). One harness (`test/unit/redos.test.ts`) runs every regex in `src/` (noise, dates, tokens, markers) against a fixed set of 4096-char adversarial strings (`"a@" x 2048`, `"@" x 4096`, `"1 " x 2048`, `"0/1" x 1365`, `"de12" + " aaaa" x 1000`, `"1." x 2048 + "x"`, `"www." + "a" x 4092`, and more) and asserts < 50 ms per regex and input. A lint test fails if a regex in `src/` is not registered in the harness.

### 4.4 Three forms per token

| Form | Use | "Rahmenverträge" | "Muenchen" | "Straße" |
|---|---|---|---|---|
| `surface` | lexicon lookup (after fold), CISTEM input, language hints | `rahmenverträge` | `muenchen` | `straße` |
| `ascii` | display and rungs | `rahmenvertraege` | `muenchen` | `strasse` |
| `fold` | key fold for stemming (de tokens only) | `rahmenvertrage` | `munchen` | `strasse` |

`keyFold(w)`: `ä|ae -> a`, `ö|oe -> o`, `ü|ue -> u`, `ß -> ss`, except `ae/oe/ue` directly after a vowel or `q` stays (`steuer`, `feuer`, `quelle`, `neue`). The fold is only used for keys, so rare wrong folds (`aktuell -> aktull`) are harmless.

Lexicon lookup uses `ascii`. All lexicon keys and forms are stored in ascii form.

Lookup order for a single token or compound part:
1. Exact `ascii` match on key or form.
2. Stem match. The lexicon map is also indexed by `stem(keyFold(form))` for every key and form, built at first use, with the entry's language stemmer (`de` CISTEM, `en` Porter2, `*` both). A token matches when `stem(keyFold(token))` equals an indexed stem of the same language. Only for tokens of 5+ chars. This finds `umzuege` (umzug), `kaesten` (kasten), `ausschreibungen`, `wartungsvertraege`, so "Ausschreibung X" and "Ausschreibungen X" give the same concept and the same rungs.
3. If two entries share a stem, the earlier entry in data order wins. A unit test lists all stem clashes in the v1 data, and the list must be empty or explicitly allowed.

---

## 5. Tokenization (step 2)

### 5.1 Split

1. Before splitting, detect on the normalized surface (in this order). Dates, ranges, `fy`, weeks, years and longnum are the protected spans of 4.3 (steps 4 and 6), so noise removal never eats them:
   - dates `\d{1,2}[./]\d{1,2}[./](\d{4}|\d{2})` with Unicode edges -> `year` token (2-digit years mean 20xx)
   - ranges `\b((?:19|20)\d{2})\s*[/\u2013\u2014-]\s*((?:19|20)?\d{2})\b` -> `range` token (`2025/2026`, `2025/26`, `2026–2028`)
   - `fy\s?(\d{2}|\d{4})` -> `year` with fy flag
   - weeks `(kw|cw|week|wk)\s?\d{1,2}`, years `(19|20)\d\d`, longnum `\d{5,}` (classes in 5.2)
   - decimals `\d+[.,]\d+` -> `noise` (`42,5`, `v1.2`, `2,0`)
1b. **Code runs.** On the `cased` text, a run of chars from `[A-Za-z0-9()/.-]` without spaces, or several such runs joined by `/`, that contains at least one uppercase letter and also a digit, a `/` or a `(`, becomes one `code` token. Its text is the run with all non-alphanumerics removed, lowercased (`NA2XS(F)2Y` -> `na2xsf2y`, `C30/37` -> `c3037`, `HEA/HEB` -> `heaheb`, `VOB/B` -> `vobb`). Dotted legal forms (`e.K.`, `Co.`), protected spans (4.3), and runs that alone match `quarter`, `week`, `fy` or a marker form (`Q1`, `KW12`, `FY26`, `Los2`) are not code runs. An all-caps token of 3 letters or fewer directly before or after a code run joins it (`CEM II/A-LL` -> one token `cemiiall`).
2. Split on any char not in `[\p{L}\p{N}-]`. Also split on `-` when it has a space or the string edge on either side, and on `\u2013` and `\u2014` always.
3. An inner hyphen between letters or digits marks an explicit compound boundary. Keep the token, record parts (`smart-meter-gateways` -> parts `smart|meter|gateways`).
4. Lexicon check for hyphenated tokens: first the joined form (`e-procurement` -> `eprocurement`, `it-service-desk`), then phrase match over the parts, then each part as a word with a bond.
5. Each token records `case` (4.1), `translit: true` if any char came from a transliteration table or the user hook, and `lang` (6.1).

### 5.2 Classes

| Class | Detection (on ascii) | Display rungs | Base score |
|---|---|---|---|
| `year` | `(19\|20)\d\d`, date, `fy..` | `26`, `2026` (cost 30); fy: `fy26` | 160 |
| `range` | see 5.1 | `2526`, `2628` | 160 |
| `quarter` | `q[1-4]` | `q1`. With a year in the chosen set: bonded into `26q1` | 140 |
| `week` | `(kw\|cw\|week\|wk)\s?\d{1,2}` | `kw12` (de), `wk22` (en) | 140 |
| `marker` | marker word (table 5.3) + optional `nr/no/#` + `\d{1,3}`, one letter `[a-z]`, or a Roman numeral `i..x` in upper case (`Phase II` -> `ph2`) | `los1`, `losa` (no zero-pad rung) | 180 |
| `longnum` | `\d{5,}` | last 4 digits | 120 |
| `code` | a code run (5.1 step 1b), mixed letters and digits (`s355`, `c30`), or a norm prefix (`din en iso vds dguv vob hoai cea`) followed by a number | joined text (`din131`, `s355`, `c3037`) only if 6 chars or less and it has a digit, else noise | 100 |
| `quantity` | number followed by a unit (`t kg mw mwh kva kw stk pcs units monate monaten wochen jahre jahren years tage tagen days stunden std h zoll`) | `50mw` | 50 (never in pool) |
| `smallnum` | bare `\d{1,4}` not covered above | dropped | - |
| `orgsuffix` | legal form (6.3, with the extra checks for ambiguous forms) | dropped, marks org | - |
| `persontitle` | `herr frau dr prof mr mrs ms` | dropped, next 1 to 2 tokens dropped | - |
| `noise` | single letter not after a marker; ordinal `\d+(st\|nd\|rd\|th)`; decimals; tokens mixing `[01]` with `[oli]` that are not lexicon codes; Roman numerals 1 to 39 (`^x{0,3}(?:ix|iv|v?i{0,3})$`, not empty) written in upper case, not a lexicon word and not after a marker word (`II`, `IV`, `XII`); tokens of 3 chars or less made only of `[ilo]` that are not lexicon words (`ii`, `ll`, `lo`); payment terms (4.3 step 9) | dropped | - |
| `word` | everything else with 2+ letters | section 11 | by class |

Year normalization: `2026` key `y2026`. Range key `r2025-2026`. Quarter key `q1`. Week key `kw12`. Marker key `<prefix><value>` (`los1`). Longnum key `n<digits>`. Code key `c<text>`.

### 5.3 Markers (v1 data)

The prefix must not create an I8 pair with the digits that follow. All prefixes below end in a safe letter.

| Marker words | Prefix | Takes |
|---|---|---|
| `los`, `lot` | `los` (de), `lot` (en) | number or letter |
| `nachtrag` | `nt` | number |
| `amendment` | `amd` | number |
| `sow`, `statement of work` | `sow` | number |
| `phase` | `ph` | number |
| `wave` | `w` | number |
| `batch` | `b` | number |
| `tier` | `tier` | number |
| `halle`, `hall` | `h` | number or letter |
| `bauabschnitt` | `ba` | number |
| `anlage` (appendix, only when followed by a number) | `anlg` | number |
| `change order` | `chg` | number |
| `change request` | `cr` | number |
| `plant`, `werk` (followed by a number) | `plant`, `werk` | number |
| `site`, `building` | `site`, `bldg` | letter or number |
| `verhandlungsrunde`, `round` | `rd` | number |
| `level` (1st/2nd level is noise) | - | - |

A marker that reads `lot` + `1` (`lot1`) is fine: `t` next to `1`. Never generate `l1`, `co1`, `anl1`.

---

## 6. Language, phrases, stop words, orgs (steps 3 to 6)

### 6.1 Language detection

```ts
function detect(tokens: Tok[], raw: string, cfg): 'de' | 'en' | 'und' {
  if (cfg.lang) return cfg.lang                                     // per-call override
  const hook = cfg.detectLanguage?.(normalizedSurface)
  if (hook === 'de' || hook === 'en') return hook
  let de = 0, en = 0
  const umlaut = /[äöüß]/i.test(raw)
  if (umlaut) de += 2
  for (const t of tokens.filter(t => t.cls === 'word' && !t.translit)) {
    if (STOP_DE_ONLY.has(t.ascii)) de += 2
    if (STOP_EN_ONLY.has(t.ascii)) en += 2
    if (/(ung|keit|heit|schaft|lich|isch|vertrag|vereinbarung)$/.test(t.ascii)) de += 1
    if (/(tion|ment|ing|ship|ness|ity)$/.test(t.ascii)) en += 1
    if (!umlaut && /(ed|ers|ies|ly|ware)$/.test(t.ascii) && t.ascii.length >= 5) en += 1
    const lx = lexiconLookup(t)                                    // exact, then stem (4.4)
    if (lx?.lang === 'de') de += 1
    if (lx?.lang === 'en') en += 1
    if (t.ascii.length >= 12 && splitCompound(t) !== null) de += 1
  }
  if (de === 0 && en === 0) return 'und'
  if (de === en) return cfg.defaultLang
  return de > en ? 'de' : 'en'
}
```

`STOP_DE_ONLY` = DE function words not in the EN list. `STOP_EN_ONLY` likewise.

Every single-word lexicon entry carries its `lang`: all entries in 15.2 and 15.3 are `de`, all in 15.4 are `en`, places and words that are the same in both languages (`it`, `erp`, `cloud`, `catering`, `hardware`, `software`) are `*`. A unit test fails if a single-word entry has no explicit `lang`.

Per-token language:
1. `und` if the token is `translit` (Cyrillic, Greek, user hook) or the title has no Latin letters.
2. The lexicon entry `lang` if set and not `'*'`.
3. `de` if the surface has `ä ö ü ß` or a DE suffix above. `en` if it has an EN suffix above.
4. The title language if it was detected (`de` or `en`, not via `defaultLang`).
5. Otherwise `und`.

`und` tokens are never compound-split, use stem = ascii, the EN coda and onset tables (the wider set), and no week prefix. So `postavki` (t372) stays whole. The title language picks the conflict stop words and the week prefix; when the title is `und`, `cfg.defaultLang` picks them.

The language picks: the stemmer, the conflict stop words, the coda table for cuts, the week prefix.

### 6.2 Phrase matching (before stop words)

Walk tokens left to right. At each position try lexicon phrases of length 5 down to 2 (ascii tokens, exact match, stop words inside the phrase count). The longest match wins and becomes one token with the entry. `agreement`, `contract`, `vertrag` are only dropped as domain words when they are not part of a phrase.

### 6.3 Stop word tiers (v1 data, full lists)

**Function words DE** (removed):

```
ab aber alle allem allen aller alles als also am an andere anderem anderen anderer anderes auch
auf aus bei beim bin binnen bis bzgl bzw bezueglich ca da damit dann das dass dem den denen der
des dessen deshalb die dies diese diesem diesen dieser dieses doch dort durch ein eine einem einen
einer eines einige einigen einschl einschliesslich er es etc etwas fast fuer gegen gem gemaess ggf
hat hier hin hinter ihr ihre im in indem inkl inklusive ins ist je jede jedem jeden jeder jedes
jetzt kein keine laut man mit nach neben nicht noch nur ob oder ohne per pro samt seit sehr sein
seine sich sie sind so sowie ueber um und uns unter usw vom von vor waehrend war weil welche wenn
wie wieder will wir wird wo zu zum zur zwar zwischen zzgl
```

Rev 2 added `ab also bin binnen ca die fast hat man oder seit war will`. A unit test asserts that every conflict word is in the list of each language it is listed for.

**Function words EN** (removed):

```
a about above across after against all along also am among an and any are as at be because been
before being below between both but by can could did do does during each either for from further
had has have he her here his how i if in incl including into is it its just me more most my nor
not of off on once only or other our out over own per regarding same she should so some such than
that the their them then there these they this those through to too under until up upon very via
was we were what when where which while who whom why will with within without would you your
```

**Conflict words** (removed only when the title language matches): `die war hat bin man fast will also so an` are removed only in `de` titles when they are DE function words, and only in `en` titles when they are EN function words. Implementation: they are in the per-language list, and the union check skips them unless `lang` matches. `an also so will` are in both lists. `die war hat bin man fast` are DE-only and must survive in EN titles (`Die Casting`, `War Room`). In `und` titles, `cfg.defaultLang` decides.

**Domain words** (removed, configurable via `domainStopWords`):

```
de: vertrag vertraege vertrags vereinbarung vereinbarungen dokument dokumente nr nummer betreff
    entwurf final finale kopie version rev revision datei docx pdf xlsx doc dringend aw wg fwd
en: contract contracts agreement agreements document no number re fw fwd draft final copy version
    rev urgent asap notice
both: v\d+ (regex, e.g. v2), \d+ in parentheses after final
```

`neu` is not a domain word. It is a generic modifier (7.3).

**Legal forms** (org suffix, removed, mark org): `gmbh ag kg kgaa se ug mbh mbb ek ohg gbr eg co ltd limited inc llc plc bv nv corp sa sarl spa` plus multi-token `e k` (`e.K.` after splitting), `gmbh co kg`.

Ambiguous forms: `eg` (Erdgeschoss), `kg` (Kellergeschoss, kg), `ag` (Auftraggeber), `ug` (Untergeschoss), `se`, `sa`, `spa`, `limited`. They count as a legal form only when all of these hold:
- the raw text is upper case (`AG`, `KG`, `SE`) or dotted (`e.G.`, `S.A.`); `Spa`, `Limited` also in title case;
- the token is the last token, or is followed by `&`, `co`, another legal form, punctuation, a year, or a lower-case word;
- it is not followed by a number (`EG 1`, `KG 2` are floors);
- the previous token is capitalized and is not a persontitle, doctype, action, activity or place-marker word (`Umbau EG` is a floor).

Otherwise the token is a normal word. `eg og ug kg` then match the floor entries in 15.5.

**Weak words** (marked weak; see the rules below the list):

```
de: lieferung lieferungen leistung leistungen dienstleistung dienstleistungen dienst dienste service
    services beschaffung einkauf system systeme projekt standort standorte liegenschaft
    liegenschaften team mitarbeitende allgemein jaehrlich material bedarf betrieb technik
    management modul plattform loesung zentrum
en: service services supply supplies purchase procurement management system systems project site
    sites team general solution solutions platform program annual mutual
```

Rules for weak concepts (a concept is weak when its word is in this list, its lexicon entry has `weak: true`, or it is a place-marker word of 15.5):
- Weak concepts are **not in the pool** (10.4). So they are never a body segment and never add to `lost` in the fit cost. "Never filler" means exactly this.
- They still give stems for storage (8.2), so df and re-pick diff can see them.
- They come back only through the back-off in 6.5. Then they are normal concepts (no weak flag).
- `explain()` lists them in the rank step as `excluded: weak`.

### 6.4 Attribute words (adjectives, verbs, participles)

Free words in titles are often not topics: `falsch berechnet`, `abwehren`, `ausüben`, `fristgerecht`, `gefährlicher`, `ergonomisch`, `rot`. A non-lexicon `word` token becomes class `attr` when one of these holds:
- **DE suffix** (token 6+ chars, per-token lang `de`): `-lich -ig -isch -bar -iert -los -haft` (any case), or `-et -end -er -es -en -em` when the raw case is `lower`. Compounds whose head is a known part are not checked (`netzgebiet`, `lieferanten`).
- **DE lower case**: in a `de` title whose case flags are known, a token in `lower` case that is not at title start and not a stop word. German nouns are capitalized, so these are adjectives, verbs or adverbs (`rot`, `abwehren`).
- **EN suffix** (per-token lang `en`, token 6+ chars): `-ly -ive -ous -able -ible -ful -less`, or `-ed` when the token is not a lexicon form.

`attr` concepts are slot T, have class weight 120 and prior 40, and get no position bonus (10). They can still enter the pool after the topics (`helm-rot-2345`). If only attr and weak words are left, the back-off restores them in title order.

### 6.5 Back-off when nothing is left

Evaluated after stop words, org and person handling:

| Left over | Action | Warning |
|---|---|---|
| nothing, raw empty or only noise | empty path (section 13.6) | `empty` |
| only function words were present | empty path | `empty` |
| only domain words (and legal forms) | restore the first domain word (not legal forms) as a `topic` concept | `stopwords-relaxed` |
| no non-weak word concept, but weak words | restore the weak words as normal concepts (numbers stay as they are) | `stopwords-relaxed` |
| only numbers/markers | add fallback word `doc` as T concept | - |

### 6.6 Orgs and persons

**Org rule.** Proper names in titles mostly stand before a legal form, often with business words between (`Nordlicht Energie AG`, `Ostwind Stadtwerke AG`, `Mosel Bürobedarf GmbH`). Walk left from a legal-form token:

1. **Line words.** Skip up to 3 tokens that are one of: a lexicon word of any class except doctype and action; a weak word; a token that ends in a `LINE_SUFFIXES` entry (15.7: `stadtwerke`, `netzbau`, `personaldienste`, `objekteinrichtung`); or one of the joiners `& und and` between two such tokens. Compound splitting is not used here, because names like `Nordlicht` (`nord` + `licht`) also split. Line words that are content words (a lexicon `topic` entry or an unknown word: `Beton`, `Metallbau`, `Analytics`) stay as normal concepts with weight -50. Weak words and joiners are dropped.
2. **Name.** The next token to the left is the org name if it is a `word` with 2+ letters, capitalized in raw (or the title is all caps), not a stop word, not a doctype or action lexicon entry, not a marker, number or code, and no dash split lies between. It is taken even if it could split into known parts (`Nordlicht`, `Ostwind`).
3. The org concept is that one token (class `org`). Tokens further left are not part of the org. If step 2 finds no name, or the org concept loses all rungs (blocked, t388 `Fickenscher`), there is no org and the line words keep their normal weight (no -50).
4. Org tokens and proper-noun candidates (10.2) are never compound-split.

Checked against the corpus: t055 and t177 `Nordlicht`, t056 `Ostwind` (`Stadtwerke` is a line word), t107 `Grauwacke` (`Beton` is a line word), t109 `Müller`, t134 `Lindenhof` (`-einrichtung`), t135 `Mosel`, t140 `Silberfluss` (`IT-Services`), t146 `Hansekontor`, t152 `Kranich`, t154 `Edelweiss`, t095 `Ostwind`, t083 `Silverline`, t252 `Redwater`, t198 `Hagedorn` (`& Partner`), t186 `Vogt` (`& Söhne Gerüstbau`), t195 `Wendelin` (`Kälte- und Klimatechnik`), t012 `Fichtel` (needs lexicon `kran`).

**Org rungs.** The full name is a rung when it has 10 chars or less (cost 0 up to 8 chars, 40 for 9 or 10). Cuts (11.3) are added, without the morpheme kind (org tokens are not split) and without skeletons. Org rungs are removed when they equal a stop word or a lexicon key or abbreviation of another class (`nord`, `ost`, `sand`, `nor`), so an org never reads as a direction, a material or a function word. An org with no rung left is dropped.

**Persons.**
- Tokens after a `persontitle` are dropped (up to 2).
- **First names.** A capitalized token in `FIRST_NAMES` (15.8, about 400 common DE and EN first names, public name statistics, no real persons) is dropped together with the next token when that token is capitalized and not a lexicon word (`Gespräch Thomas Becker` -> both dropped). A first name before a legal form stays an org name candidate (`Becker GmbH` keeps `Becker`, the first name is dropped).
- `cfg.denyTokens` (list) are always dropped. The README explains this option for surnames and internal code names.
- `cfg.dropPersonNames: false` turns off the first-name rule.
- `leak: 'minimal'` drops all org concepts.

---

## 7. Compound splitting (step 7)

### 7.1 Data

- `PARTS`: all single-word lexicon keys and forms with `part !== false`, plus the extra part list in section 15.6. Each part has an optional combining form without final `-e` (`schul` for `schule`), generated at build time of the lexicon map.
- `LINKERS = ['', 's', 'es', 'n', 'en', 'er', 'e', 'ens']`.
- `WEAK_HEADS` (head dropped, modifier becomes the concept): `lieferung liefer vertrag vereinbarung anlage anlagen leistung leistungen dienst dienste dienstleistung versorgung system management technik wesen betrieb plattform`.
- `GENERIC_MODIFIERS` (modifier dropped, head becomes the concept): `unterhalt haupt gesamt sonder neu alt zusatz einzel jahres`. (`ersatz` was removed in rev 2: `Ersatzteile` is its own lexicon entry.)
- `WEAK_HEADS` is built at first use as the union of the list above, all weak words (6.3) and all domain words (6.3). So `strombeschaffung` -> `strom` (weak head `beschaffung`), same for `einkauf bedarf service material projekt`.
- `isHeadPart(p)`: `p` is a known part and not a `GENERIC_MODIFIERS` entry. Weak heads are allowed: then 7.3 drops the head and the unknown modifier becomes the concept (`analyseplattform` -> `analyse`, `schraubenlieferung` -> `schrauben`).

### 7.2 DP split

Only for tokens with per-token lang `de` (6.1). Never for `und` or `translit` tokens, org tokens or proper-noun candidates (6.6, 10.2). Input is `ascii`.

```ts
function split(w: string, lex: Lexicon): Part[] | null {
  if (w.length < 7 || lex.hasExact(w)) return null      // known compounds stay whole
  const all = splitKnown(w, lex)                         // pass 1: only known parts
  if (all !== null && all.length > 1) return all
  // pass 2: exactly one unknown modifier (5+ chars) + one known head
  for (let j = 5; j <= w.length - 3; j++) {              // shortest modifier first = longest head
    const head = w.slice(j)
    if (!lex.hasPart(head) || !isHeadPart(head)) continue
    for (const l of LINKERS) {
      const m = j - l.length
      if (m < 5 || w.slice(m, j) !== l) continue
      const mod = w.slice(0, m)
      if (!/[aeiouy]/.test(mod)) continue
      return [{ text: mod, known: false, linker: '', start: 0 }, { text: head, known: true, linker: l, start: j }]
    }
  }
  return null                                            // keep the word whole
}

function splitKnown(w: string, lex: Lexicon): Part[] | null {
  type Seg = { parts: Part[]; score: number }
  const best: (Seg | null)[] = Array(w.length + 1).fill(null)
  best[0] = { parts: [], score: 0 }
  for (let i = 3; i <= w.length; i++) {
    for (let j = 0; j <= i - 3; j++) {
      const text = w.slice(j, i)
      if (!lex.hasPart(text)) continue                   // known parts only
      for (const l of LINKERS) {
        const k = j - l.length
        if (k < 0 || best[k] === null || w.slice(k, j) !== l) continue
        if (l !== '' && k === 0) continue                 // no linker before the first part
        const s = best[k].score - 100 - (l ? 50 : 0)     // fewer parts and fewer linkers win
        const cur = best[i]
        if (cur === null || s > cur.score || (s === cur.score && text.length > lastLen(cur))) {
          best[i] = { parts: [...best[k].parts, { text, known: true, linker: l, start: j }], score: s }
        }
      }
    }
  }
  return best[w.length]?.parts ?? null
}
```

Rev 1 allowed an unknown part anywhere at -100, which beat keeping the word whole and gave `lebens+mittel+lager`, `post+avki`, `sand+haus`. Now: `lebensmittellager` -> `lebensmittel` + `lager`, `sandhaus` stays whole (`haus` is not a known part), `postavki` is never split (`und`).

Integer scores, fixed loop order, so the result is deterministic. Cost is O(n^2 * 8), fine for 60 chars. Words longer than 64 chars are split on the first 64 only.

Inflected heads: `hasPart` also accepts a known part plus a plural/case ending `e n en er s es` at the end of the word (`anlagen`, `fahrzeuge`, `gebaeude`).

### 7.3 Parts to concepts

| Case | Rule | Example |
|---|---|---|
| Lexicon has the whole word | one concept with its rungs | `brandmeldeanlage` -> `bma` |
| Every part is in `WEAK_HEADS` or a domain word | the whole token is a domain stop word (6.3, so the 6.5 back-off can restore it) | `liefervertrag`, `leistungsvereinbarung`, `servicevertrag` |
| Head in `WEAK_HEADS` | drop head, modifier(s) form the concept | `stromlieferung` -> `strom`, `strombeschaffung` -> `strom`, `winterdienst` -> `winter`, `aufzugsanlagen` -> `aufzug`, `mietvertrag` -> `miet`, `leasingvertrag` -> `leasing` |
| Modifier in `GENERIC_MODIFIERS` | drop modifier, head is the concept | `unterhaltsreinigung` -> `reinigung` |
| Both strong, 2 parts | two concepts with a bond (modifier, head) | `mittelspannungskabel` -> `ms` + `kabel`, `kantinenreinigung` -> `kantine` + `reinigung` |
| 3+ parts | after weak/generic removal: first strong part and last strong part become concepts (bonded); middle strong parts become concepts with weight -50 | `stromlieferungsrahmenvertragsverlaengerungsvereinbarung` -> `strom`, `rahmenvertrag` (`rahmen`+`vertrag` re-joined because the pair is a lexicon word), `verlaengerung` |
| Adjacent parts that form a lexicon word | re-join first | `rahmen` + `vertrag` -> `rahmenvertrag` |
| Hyphenated token | split given; same rules | `smart-meter-gateways` -> lexicon `smgw` |

Bond display: if both bonded concepts are chosen by the fit, their rung texts are joined without a separator when the joined text is 7 chars or less (`mskabel`), else they are two adjacent segments. A joined bond counts as one segment.

Unknown modifier parts (5+ chars, pass 2 only) are kept as concepts (often the real topic: `lebensmittel`).

Parts-only entries (15.6, `part: true`, no other data) that become concepts have `cls: 'topic'` and `prior: 'common'` (`miet`, `leasing`, `post`).

---

## 8. Concepts and stems (step 8)

### 8.1 Concept

```ts
interface Concept {
  key: string            // identity: lexicon key (or group), or stem of the head part, or number key
  cls: ConceptClass      // topic | attr | org | action | activity | doctype | place | direction | region | marker | year | range | quarter | week | longnum | code | quantity
  weak: boolean
  verbatim: string[]     // ascii forms the user typed for this concept: full token and/or compound part
  pos: number            // index of the first source token
  tf: number             // number of merged occurrences
  lex?: LexiconEntry
  stemKeys: string[]     // lexicon-free stems of the source tokens/parts (8.2), for df and diff
  bond?: { with: string; role: 'mod' | 'head' }
  score: number          // set in rank
  ladder: Rung[]         // set in ladders
}
```

Merge rule: concepts with the same `key` merge (tf adds up, pos = min). Lexicon `group` merges too (`fuhrpark` and `fahrzeug` share group `fzg`, counted once).

### 8.2 Stemming

- **Vendored, not a dependency.**
  - `src/vendor/cistem.ts`: port of official `Cistem.js` (MIT, header kept). Fix the implicit global `upper` (make it `let`). Always call with `case_insensitive = true`. Input: `keyFold(surface)` of the part. Output lowercase.
  - `src/vendor/porter2.ts`: Snowball 3.2.0 generated JS for `english` (BSD-3, header kept), converted to TS with `// @ts-nocheck` only if needed. Input: ascii.
- Stems are keys only, never displayed.
- For `und` tokens: stem = ascii.
- Concept `key` for non-lexicon words: stem of the head part (or the whole token). For lexicon words: the lexicon `key` (or `group`). For numbers: the number key (5.2). `key` is only used inside one call (merge, sort, explain). It is never stored.
- **Stored stems do not depend on the lexicon.** `stem(t)` = CISTEM (`de`) or Porter2 (`en`) of `keyFold(ascii)`, or `ascii` for `und`. The stored set is the sorted unique union of:
  - `stem(t)` of every `word` token that survived stop words (weak and attr words included, function and domain words not),
  - `stem(p)` of every compound part from 7.2 (splitting uses the lexicon parts, so a parts edit can change this; parts change rarely and only with a data digest change),
  - number keys (`y2026`, `los1`, `n2345`, `c3037`), which come from tokenizer rules, not from the lexicon.
- Phrase entries (`master service agreement`) store the stems of each word. Lexicon keys and groups (`rv`, `fzg`) are never stored.
- `concept.stemKeys` = the stems of its source tokens and parts. At read time a concept maps to stored rows like this:
  - df(concept) = **min** df over its `stemKeys` (a phrase or compound is at most as frequent as its rarest word);
  - a concept is "in" another row when, for at least one of its source occurrences (merged concepts have several, e.g. `fuhrpark` and `fahrzeuge` in group `fzg`), **all** stems of that occurrence are in that row's stems. df of a merged concept is the max of its occurrences' df.
- `storedStem(s)`: identity for `storeStems: 'plain'`; `hex(siphash(K, 'stem\x1f' + s))` (16 hex chars) for `'hashed'`. `analyze()` applies it once and puts the result into `Analysis.storedStems` and each `concept.storedKeys`. Every store request and every compare in resolve uses only these stored forms. No other code calls `storedStem`, so plain and hashed modes cannot mix.
- `SlugResult.stems` = `Analysis.storedStems`.

---

## 9. Bad words, reserved words, look-alikes

### 9.1 Data (v1, frozen, `src/data/v1/blocklist.ts`)

- `BLOCK_HARD`: words never allowed anywhere, not even inside the user's own word (e.g. `fick`, `fotze`, `cunt`, `nazi`, `hitler`, slurs). Curated from LDNOOBW de/en (CC-BY-4.0) and sqids-blocklist (MIT).
- `BLOCK_SOFT`: words allowed only strictly inside a verbatim user word (e.g. `anal`, `cock`, `shit`, `tit`, `ass`, `sex`, `cum`, `piss`, `fag`).
- `BLOCK_SHORT_DE`: `ss sa sd kz hj ns nsdap hh 88 18 1488 444 ah` (blocked as whole segments and in the tail).
- `TAIL_BLOCK`: `BLOCK_SHORT_DE` plus `kkk fck fkk wtf stfu nzs` (so `sa` is now included).
- Leet fold `f(s)`: `4->a 3->e 0->o 1->i 5->s 7->t 8->b`. All list entries are stored already folded and deduplicated.
- Tail fold `fT(s)` = `f(s)` plus `v->u` (`fvck`, `cvnt`). Used only on tail chars.
- The file starts with a comment that explains why it exists. Users extend with `blocklist: { add, remove }`. Adding changes the config fingerprint.

### 9.2 Checks

`verbatim(seg)` is true when the segment text equals the ascii form of a full user token or a full compound part of that token.

| # | Applies to | Rule | On failure |
|---|---|---|---|
| B1 | each body segment | `f(seg)` is not in `BLOCK_HARD ∪ BLOCK_SOFT ∪ BLOCK_SHORT_DE` | rung removed |
| B2 | each non-verbatim rung | `f(rung)` does not start with a 3-char list word and contains no list word of 4+ chars | rung removed |
| B3 | whole body, separators removed, `f` applied | no list word of 4+ chars as substring, unless the word is soft AND the hit lies inside one verbatim segment AND is strictly shorter than that segment | candidate rejected |
| B4 | source tokens | a token whose ascii equals a list word (any list) is dropped before concepts | token dropped |
| B5 | tail | `Y = f(lastBodyChar) + fT(tail)` contains no entry of length 3+ from any list (`BLOCK_HARD ∪ BLOCK_SOFT ∪ BLOCK_SHORT_DE ∪ TAIL_BLOCK`) and no 2-char entry of `TAIL_BLOCK` as substring. Soft words count here, because a tail is never verbatim (`s3x`, `f4g`, `4ss`, `k4ck3` are caught) | redraw (draw + 1, max 4, then k + 1) |
| B6 | years | if the 2-digit form is blocked (`18`, `88`), only the 4-digit rung exists | rung removed |
| B7 | whole ID | `X = f(body.replaceAll(sep, '')) + fT(tail)` contains no `BLOCK_HARD` entry as substring, verbatim or not (body `...fo` + tail `tz3` is caught) | body: candidate rejected; tail: redraw as in B5 |
| I8 | each body segment; with separator `''` the joined body | no `[lio][01]` or `[01][lio]` pair | rung removed (with `''`: candidate rejected) |

B5 and B7 are the only tail checks. `lastBodyChar` is `''` when there is no body (opaque). A unit test enumerates all 2- and 3-char tails of the `safe` alphabet against B5 and B7 and checks the rejected set against a committed list.

A concept with no rung left is removed. The final `assertInvariants` repeats B1, B3, B5, B7 and I8.

Expected behavior (tests):
- `Analyseplattform` -> `analyse` allowed (verbatim compound part, soft `anal` strictly inside). Cuts `anal`, `analys` removed.
- `Cockpit` -> `cockpit` allowed, `cock` removed.
- `Fickenscher` -> all rungs removed (hard), concept dropped.
- `Scunthorpe` -> `scun` (syllable cut) allowed; `scunth` and `scunthorpe` removed (hard `cunt`).
- `Assessment Center` -> lexicon `ac`. `Assessment` alone -> lexicon `asmt`.
- `Sexton` -> `sexton` allowed verbatim (soft), `sext` removed.
- `Shiitake`, `Titanium`, `Kotflügel`, `Scheibenwischer`, `Hurtig`, `Kasse`, `Massnahme`, `Dokument` -> no false hits.
- Süd is never `sd`. Hamburg is never `hh`.

### 9.3 Reserved words

Default `reserved`: `new edit admin api settings login logout auth create delete update search null undefined index help static assets`. Entries are normalized like titles.
- `id` must not be in `reserved`.
- In max mode without tail, `body` must not be in `reserved`. If it is, a tail is forced (`new` -> `new-k3`).

---

## 10. Ranking (step 9)

All values are integers ("centi" units).

### 10.1 Class weights

| Class | Weight |
|---|---|
| topic (lexicon entry or parts-only entry) | 300 |
| org | 240 |
| action | 220 |
| topic (unknown word, no lexicon entry) | 220 |
| activity | 200 |
| place | 200 |
| marker | 180 |
| year, range | 160 |
| direction, region, quarter, week | 140 |
| attr (6.4) | 120 |
| longnum | 120 |
| doctype, code | 100 |
| quantity | 50 |

Unknown words get class `topic` with the lower weight 220, unless 6.4 makes them `attr`. Rev 1 gave them 300 plus prior 70, so adjectives and verbs beat lexicon words. Direction cancel: if the title has 3 or more different directions (`nord sued ost west mitte`), all direction concepts get score 0.

Place markers (15.5) re-class only the next `word` token that has no lexicon class and is a proper-noun candidate (10.2): it becomes `place` (`Standort Kassel` if Kassel were not in the lexicon). A lexicon direction (`Standort Nord`), a number (`Standort 2026`) or a common word (`Warehouse Lease`) keeps its class.

### 10.2 Rarity

```ts
const LOG2_FRAC_Q8 = [0, 22, 44, 63, 82, 100, 118, 134, 150, 165, 179, 193, 207, 220, 232, 244]
function ilog2q8(x: number): number {             // x >= 1, integer; returns round-ish 256*log2(x)
  x = Math.min(Math.max(1, Math.floor(x)), 0x7fffffff)
  const e = 31 - Math.clz32(x)
  const m = ((x << (31 - e)) >>> 27) & 15
  return e * 256 + LOG2_FRAC_Q8[m]
}
const NUMBER_CLASSES = new Set(['year', 'range', 'quarter', 'week', 'marker', 'longnum', 'code', 'quantity'])
const RARITY_NUMBER = 50
const BLEND_K = 200
function prior(c: Concept): number {
  if (c.lex?.prior) return PRIOR[c.lex.prior]
  if (c.lex) return c.lex.partOnly ? PRIOR.common : PRIOR.medium            // parts-only entries (15.6): common
  if (c.cls === 'attr') return PRIOR.unknown
  return PRIOR[isProperNoun(c) ? 'proper' : 'unknown']
}
function rarity(c: Concept, df: number | undefined, N: number | undefined): number {   // 0..100
  if (NUMBER_CLASSES.has(c.cls)) return RARITY_NUMBER                      // fixed, no store
  const p = prior(c)
  if (df === undefined || N === undefined || N < 1 || cfg.rarity !== 'store') return p
  const top = ilog2q8(N + 1)
  const rs = Math.max(0, Math.min(100, Math.floor((100 * (top - ilog2q8(Math.min(df, N) + 1))) / top)))
  return Math.floor((p * BLEND_K + rs * N) / (BLEND_K + N))               // prior fades out as N grows
}
const PRIOR = { common: 20, medium: 50, rare: 70, unknown: 40, proper: 80 }
```

`df` = df of the concept from its `storedKeys` (8.2). `N` = `store.total()`, or `cfg.corpusSize` (default 1000) when the store has `countStem(s)` but no `total`. Without any df source, the prior is used.

The blend fixes the small-N swing of rev 1: at N = 1 a shared stem got 0 and a new stem got 100. Now at N = 1 the result is within 1 point of the prior, at N = 200 it is half prior and half store, at N = 2000 it is about 90% store.

`isProperNoun(c)`:
- Always true for `org` concepts.
- Needs a case signal: case flags known, and the title is not all caps. In `en` titles also not Title Case (every non-stop word capitalized), because then case says nothing.
- `en` (and `und`) titles: a capitalized token, not at title start, not a lexicon word.
- `de` titles: all nouns are capitalized, so capitalization alone is not enough. True only when the token is next to an org or legal form, or when it is capitalized, not compound-splittable (7.2), and has no lexicon match by exact or stem lookup (4.4). Otherwise `unknown`.

### 10.3 Score

```
score = classWeight[cls]
      + floor(rarity * 3 / 2)                      // 0..150
      + positionBonus                              // first topic-class concept +60, second +30 (topic only, not attr)
      + 40 * (tf - 1)
      + (lex.weight ?? 0)                          // -100..+100
      + (diffBoost ? 300 : 0)                      // re-pick, section 13.4
```

There is no weak term: weak concepts are not scored for the pool (6.3). Restored weak concepts (6.5 back-off) are scored as normal concepts.

Sort: score desc, pos asc, key asc (code-unit compare). Never use `localeCompare`. This rank order picks which concepts enter the pool and which are dropped first. The order of segments in the ID is slot order, then title position (2.1).

### 10.4 Pool

`pool = concepts.filter(c => !c.weak && c.score >= 100 && c.ladder.length > 0).sort(rankOrder).slice(0, 6)`.

Leak filters apply before the pool:
- `minimal`: keep only lexicon concepts of class `topic doctype action activity region direction` and `year range quarter`. Drop org, unknown words, city-level places, markers, codes, longnum. `maxSegments` becomes `min(maxSegments, 3)`.
- `opaque`: pool is empty, empty path with no body.

---

## 11. Ladders: readable display forms (step 10)

### 11.1 Rung kinds

| Kind | Cost | Example |
|---|---|---|
| lexicon abbr | `15 * index` in the entry's `abbr` list (0, 15, 30, ...) | `rv` (0), `rvtr` (15); `muc` (0), `muen` (15) |
| full ascii word, 6 chars or less | 0 | `strom`, `kassel`, `office` |
| full ascii word, 7+ chars | 40 | `wartung`, `leasing`, `bargeld` |
| org name, 10 chars or less (6.6) | 0 up to 8 chars, 40 for 9 or 10 | `isarwerk`, `hagedorn`, `northgate` |
| number long form (`2026`) | 30 | |
| morpheme cut (prefix ending at a compound part boundary; not for org tokens) | 60 | `rueders` |
| coda cut | 90 | `lief`, `rein`, `reinig`, `wart`, `stand`, `goett` |
| syllable cut | 110 | `ener`, `scun`, `isar` |
| consonant skeleton (not for org tokens) | 200 | `wtg`, `vtg`, `lfrt` |

**Plain and cryptic rungs.** A rung is *plain* when it is a full word, an org full name, a number form, a code, a lexicon abbr listed in the entry's `known` (15.1, for example `rv nda msa bma it erp hv muc kw`), or a lexicon abbr that equals a whole compound part of the source word (`winter` for `winterdienst`, `helm` for `schutzhelme`, `bargeld` for `bargeldversorgung`). All other rungs (unknown abbreviations, cuts, skeletons) are *cryptic*. The fit adds 40 per cryptic segment (12). So `bma-wtg-hv` beats a body made of four rare codes when both fit, and the choice between two spellings of one concept is made by readability, not only by length.

Build: collect all rungs, run B1, B2, B6, I8 on each, dedupe by text (keep lowest cost), sort by cost asc, then length asc, then text asc. Keep the first 4. Concepts with score < 150 keep only rungs with cost <= 110. Skeletons only for words of 7+ chars. A cut must be at least 2 chars shorter than the full word (so `mitte` has no cut `mitt`; lexicon abbreviations are explicit and exempt).

**No pad-only rungs.** A rung must be a form a person would write. Rev 1 had zero-pad marker rungs (`los01`) that only existed to fill length; they are removed. The full year `2026` stays, because people write it.

**`consistentRungs: true`** (option, default `false`): each concept keeps only its first rung (rung 0). The fit then fills missing length with the tail, so sibling IDs always spell a concept the same way (`kuend` in every Kündigung ID). Costs more tails; see Q9.

### 11.2 Graphemes

Split the ascii word into units, greedy left to right, longest first:
- consonant units: `tsch sch ch ck ph th sh qu ng tz pf` and doubled consonants (`ss ll mm nn tt ff pp rr`)
- vowel units: `aeu ae oe ue ie ei ai au eu ee aa oo ou` (but `ue` after `q` is part of `qu`), single `a e i o u y`

### 11.3 Cuts

```ts
function cuts(word: WordInfo): Rung[] {
  const g = graphemes(word.ascii)                 // [{ text, vowel }]
  const out: Rung[] = []
  let len = 0
  for (let i = 1; i < g.length; i++) {
    len += g[i - 1].text.length
    if (len < 3 || len > 7 || len > word.ascii.length - 2) continue
    const head = g.slice(0, i)
    if (!head.some(u => u.vowel)) continue
    const p = head.map(u => u.text).join('')
    if (head[i - 1].vowel && !word.lexForms.has(p)) continue          // never end on a vowel
    if (!ALLOWED_CODA[word.lang].has(finalCluster(head))) continue
    const kind = word.partBoundaries.has(len) ? 'morph'
               : g[i].vowel                     ? 'coda'
               : isSyllableBoundary(g, i)       ? 'syll'
               : null
    if (kind) out.push({ text: p, kind, cost: COST[kind] })
  }
  return out
}
```

- `finalCluster(head)`: the consonant units after the last vowel unit, joined.
- `isSyllableBoundary(g, i)`: `g[i-1]` and `g[i]` are consonants, and the consonant run starting at `g[i]` (up to the next vowel) is in `ONSETS[lang]`.
- `ALLOWED_CODA.de`: every single consonant, `ch ck ng nk nd nt nz ns nf mp ms mt lt ld lf lk lm ln lp ls lz rt rd rg rk rl rm rn rp rs rz rb rf rch lch nch st ft cht pf tz ss ff ll mm nn rr tt pp sch rst nst ngs`.
- `ALLOWED_CODA.en`: the DE set plus `sh th ght ct pt sk sp x`.
- `ONSETS.de`: every single consonant, `bl br ch dr fl fr gl gr kl kn kr pf pfl pfr ph pl pr qu sch schl schm schn schr schw sp spr st str th tr ts tz zw`.
- `ONSETS.en`: `bl br ch cl cr dr fl fr gl gr pl pr sc sh sk sl sm sn sp spr st str sw th thr tr tw wh wr` plus single consonants.

Forms like `aufz`, `migr`, `elektr` only appear when the lexicon lists them.

### 11.4 Skeleton

```ts
function skeleton(ascii: string): string | null {
  if (ascii.length < 7) return null
  const first = ascii[0]
  let c = ascii.slice(1).replace(/[aeiouy]/g, '').replace(/(.)\1+/g, '$1')
  c = c.replace(/([csth])h/g, '$1')                                  // ch, sh, th -> c, s, t
  c = c.replace(/[rlmn](?=[^rlmn])/g, '')                           // sonorant before a consonant
  if (c.length > 3) c = c.slice(0, 2) + c[c.length - 1]
  const s = first + c
  return s.length >= 3 ? s : null
}
// wartung -> wtg, vertrag -> vtg, lieferant -> lfrt (checked by running the code)
```

### 11.5 Number rungs

| Concept | Rungs |
|---|---|
| year 2026 | `26` (0), `2026` (30). Blocked 2-digit forms (`18`, `88`) are removed |
| fy year | `fy26` (0) |
| range 2025/2026 | `2526` (0). Range over different decades `2029/2031` -> `2931` |
| quarter + year bond | `26q1` when both chosen (joined, one segment) |
| week | `kw12` / `wk12` (0) |
| marker | `los1` (0) only |
| longnum | last 4 digits (0) |

---

## 12. Fit: filling the length budget (step 11)

Exact (the result equals a full search) and bounded. Deterministic.

```ts
interface Candidate {
  body: string; segs: string[]; tailLen: number
  content: Concept[]; contentKey: string           // sorted concept keys joined by '|'
  rungs: Rung[]; cost: number
}

function fit(pool: Concept[], cfg, constraint?: { minTail?: number; mustInclude?: Set<string>; onlyContent?: string }): Candidate[] {
  const maxSeg = cfg.maxSegments                                      // 1..5
  // One subset = one content. Lower bound per subset: lost + chunks (rung, cryptic, tail costs are >= 0).
  const subsets = subsetsByBitmask(pool, 1, maxSeg)
    .filter(s => !constraint?.mustInclude || s.some(c => constraint.mustInclude!.has(c.key)))
    .filter(s => !constraint?.onlyContent || contentKeyOf(s) === constraint.onlyContent)
    .map(s => ({ s, lb: lostOf(s, pool) + 60 * Math.max(0, minSegs(s) - 2) }))
    .sort((a, b) => a.lb - b.lb || a.mask - b.mask)
  const best: Candidate[] = []                                        // best candidate per subset, kept sorted
  for (const { s, lb } of subsets) {
    if (best.length >= cfg.maxPlans && lb > best[cfg.maxPlans - 1].cost) break   // strict '>' keeps ties exact
    let top: Candidate | undefined
    for (const rungs of product(s.map(c => c.ladder))) {             // <= 4 rungs each
      const segs = slotOrder(s, rungs, cfg)                           // T D Q N, title position inside a slot, bonds joined, fallback if first starts with digit
      if (segs.length > maxSeg) continue
      const body = segs.join(cfg.separator)
      for (const t of tailOptions(body.length, cfg, constraint?.minTail ?? 0)) {
        const c = makeCandidate(s, rungs, segs, body, t, pool)
        if (!safeBody(c)) continue                                    // B3, B7, I8 joined, reserved (max mode)
        if (!top || byCostThenLen(c, top) < 0) top = c
      }
    }
    if (top) insertSorted(best, top, byCostThenLen)
  }
  return best.slice(0, cfg.maxPlans)
}

function tailOptions(bodyLen: number, cfg, minTail: number): number[] {
  const L = cfg.length, sep = cfg.separator.length
  if (cfg.lengthMode === 'exact') {
    if (bodyLen === L && minTail === 0) return [0]
    const t = L - bodyLen - sep
    return t >= Math.max(cfg.tailMin, minTail) ? [t] : []
  }
  if (bodyLen > L) return []
  if (minTail === 0) return [0]
  return bodyLen + sep + minTail <= L ? [minTail] : []
}

function cost(c): number {
  const rungCost = sum(c.rungs.map(r => r.cost))
  const cryptic = 40 * c.segs.filter(s => s.cryptic).length       // 11.1; a joined bond is cryptic if either rung is
  const lost = sum(c.pool.filter(p => !c.content.includes(p)).map(p => p.score))   // pool has no weak concepts
  const chunks = 60 * Math.max(0, c.segs.length - 2)
  const tail = c.tailLen === 0 ? 0 : 250 + 50 * (c.tailLen - cfg.tailMin)
  return rungCost + cryptic + lost + chunks + tail
}
```

- Per subset only the cheapest candidate is kept, so spelling variants (`muc` vs `muen`) never count as different candidates. Two different documents must not end up as `strom-rv-muc-26` and `strom-rv-muen-26`. (Rev 1 called this `dedupeByContent`.)
- `byCostThenLen`: cost asc, then `id` length asc (matters in max mode), then body asc (code units).
- With separator `''`, segments are joined without separator. The cross-boundary check B3 and the joined I8 check matter more there.
- Size: `maxSegments` is limited to 1..5. Worst case pool 6 and `maxSegments` 5: 62 subsets x 1024 rung combos, about 63k string builds; with the default 4: 56 x 256, about 14k. The lower-bound cut skips most subsets in practice (typical titles have 3 to 5 concepts). Budget: p99 under 2 ms at the default, under 10 ms at 5 (bench in 19.6 Q12, with a gating test on the worst case).
- If the result is empty (nothing fits), the fallback chain is: drop the `maxSegments` cap to 1 and retry, then the empty path with `fallbackWord`.

### 12.1 Length policy in exact mode (decision for Q1)

With `tailMin` 2 and separator `-`, a body of length L-1 or L-2 (15 or 14) has no valid tail. Rev 1 then used pad tricks (`los02`, cuts like `mitt`, `stan`). Rev 2 rules:
- A body is either exactly L (no tail) or at most L-1-tailMin (with tail). No 1-char pads.
- No rung exists only to pad (11.1): no zero-pad markers, cuts must be 2+ chars shorter than the word, every cut and unknown abbr pays the cryptic cost.
- So the fit prefers a short tail over an ugly fill. The padding-tail rate is measured (Q4) and reported to the PO with the Q1 question. `lengthMode: 'max'` stays the "readable" preset.

### 12.2 Worked cost checks (rev 2 rules, hand-computed)

Ranking for t001 `Rahmenvertrag Stromlieferung Standorte Nord 2026` (no store, priors only): `strom` 300 + 75 + 60 = 435, `y2026` 160 + 75 = 235, `nord` 140 + 75 = 215, `rahmenvertrag` 100 + 75 = 175. `standorte` is weak and not in the pool.

| Candidate | Len | Cost |
|---|---|---|
| `strom-rv-nord-26` | 16 | rungs 0 + cryptic 0 + lost 0 + chunks 120 + tail 0 = **120** |
| `strom-nord-2026` | 15 | no tail option in exact mode |
| `strom-nord-26-<t2>` | 16 | lost rv 175 + chunks 60 + tail 250 = 485 |
| `strom-rv-nord-<t2>` | 16 | lost y2026 235 + chunks 60 + tail 250 = 545 |
| `strom-rv-26-<t4>` | 16 | lost nord 215 + chunks 60 + tail 350 = 625 |

For t085 `Rahmenvertrag für Stromlieferung der Standorte 2026` (no direction): pool `strom`, `y2026`, `rahmenvertrag`.

| Candidate | Len | Cost |
|---|---|---|
| `strom-rv-2026-<t2>` | 16 | rung `2026` 30 + chunks 60 + tail 250 = **340** |
| `strom-rvtr-26-<t2>` | 16 | rung `rvtr` 15 + cryptic 40 + chunks 60 + tail 250 = 365 |
| `strom-rv-26-<t4>` | 16 | chunks 60 + tail 350 = 410 |
| `strom-2026-<t5>` | 16 | lost rv 175 + rung 30 + tail 400 = 605 |

Result `strom-rv-2026-<t2>`: body plus a 2-char tail, the shape the PO asked for (`strom-rvtr-26-k3`), with a plain spelling.

---

## 13. Resolve: collisions, tail, store (step 12)

### 13.1 Tail hash

```ts
// SipHash-2-4, 64-bit output, 128-bit key. src/hash/siphash.ts works on 32-bit halves:
// type U64 = { hi: number; lo: number } (both uint32), add/xor/rotate on pairs with `>>> 0`.
// No BigInt (fast in every engine, no BigInt.asUintN on each step).
// MUST pass the 64 reference vectors from the SipHash paper.
const K_V1 = utf8('semantic-slug-v1')            // exactly 16 bytes; utf8() is our own encoder (4.1)
function keyFor(cfg): Uint8Array {
  if (!cfg.secret) return K_V1
  const a = siphash(K_V1, utf8('k0\x1f' + cfg.secret)), b = siphash(K_V1, utf8('k1\x1f' + cfg.secret))
  return concat(u64le(a), u64le(b))
}
function word(K, canonical: string, k: number, draw: number, i: number): U64 {
  return siphash(K, utf8(['ss1', canonical, k, draw, i].join('\x1f')))
}
function divSmall(w: U64, d: number): [U64, number] {   // d <= 64; four 16-bit limbs, most significant first
  const l = [w.hi >>> 16, w.hi & 0xffff, w.lo >>> 16, w.lo & 0xffff]
  let r = 0
  for (let j = 0; j < 4; j++) { const cur = r * 65536 + l[j]; l[j] = Math.floor(cur / d); r = cur % d }
  return [{ hi: ((l[0] << 16) | l[1]) >>> 0, lo: ((l[2] << 16) | l[3]) >>> 0 }, r]
}
function makeTail(K, canonical, k, t, body, cfg): string {
  for (let draw = 0; draw < 4; draw++) {
    let s = '', i = 0, w = word(K, canonical, k, draw, i), left = 13, r = 0
    const first = cfg.tailFirst, rest = cfg.tailAlphabet
    ;[w, r] = divSmall(w, first.length); s += first[r]; left--
    while (s.length < t) {
      if (left === 0) { i++; w = word(K, canonical, k, draw, i); left = 13 }
      ;[w, r] = divSmall(w, rest.length); s += rest[r]; left--
    }
    if (!tailBlocked(body, s, cfg)) return s           // B5 and B7 (9.2)
  }
  return ''   // caller moves to k + 1
}
```

`canonical` is the canonical title (4.1). Scope is not hashed (decision C4). `k` is the **tail index**: rev 1 had two numbers (`dupIndex`, `attempt`); rev 2 has one. The n-th row with a body starts at `k = n` when the store can count (13.4).

### 13.2 Tail length

`K(t) = |first| * |rest|^(t-1)`. For `safe`: 560, 15,680, 439,040, 12.3 M, 344 M for t = 2..6.

```ts
function tailNeed(n: number, cfg): number {           // n = rows sharing the body
  let t = cfg.tailMin
  while ((n + 1) * 16 > K(t)) t++                     // keep load per attempt <= 1/16
  return t
}

function refitWithTail(pool: Concept[], cfg, chosen: Candidate, t: number): Candidate {
  let content = [...chosen.content]
  while (content.length > 0) {
    const c = fit(pool, cfg, { minTail: t, onlyContent: contentKeyOf(content) })[0]
    if (c) return c
    content = content.filter(c => c !== lastInRankOrder(content))   // drop the lowest-ranked concept (10.3)
  }
  return fallbackCandidate(cfg, t)                    // fallback word body + tail (13.6)
}
```

`refitWithTail` replaces rev 1's undefined `fitDropLowest`. It keeps the same content when it fits with tail `t` (rungs shrink), else drops concepts from the bottom of the rank order. Warning `tail-grown` when the body changed. Rev 1's `idNoTail` is gone: `exclude` is checked against the full rendered ID only.

### 13.3 Store contract

```ts
export type MaybePromise<T> = T | Promise<T>
export interface AbortSignalLike { readonly aborted: boolean; readonly reason?: unknown }
export interface StoreContext { readonly scope: string; readonly signal?: AbortSignalLike }

export interface SlugStore {
  /** Required. true if the id is taken in this scope (including retired rows). */
  exists(id: string, ctx: StoreContext): MaybePromise<boolean>
  existsMany?(ids: readonly string[], ctx: StoreContext): MaybePromise<Iterable<string>>  // returns taken ids

  /** Rows in this scope with this exact body. Enables tier B. */
  countBody?(body: string, ctx: StoreContext): MaybePromise<number>
  countBodies?(bodies: readonly string[], ctx: StoreContext): MaybePromise<ReadonlyMap<string, number> | Readonly<Record<string, number>>>

  /** Document frequency of a stored stem in this scope. Enables rarity ranking. */
  countStem?(stem: string, ctx: StoreContext): MaybePromise<number>
  countStems?(stems: readonly string[], ctx: StoreContext): MaybePromise<ReadonlyMap<string, number> | Readonly<Record<string, number>>>
  total?(ctx: StoreContext): MaybePromise<number>

  /** Rows sharing a body, with their stored stems. Enables tier C (smart re-pick). Sorted by id asc. */
  findByBody?(body: string, ctx: StoreContext, limit: number): MaybePromise<readonly { id: string; stems: readonly string[] }[]>

  /** Write path for createUnique without an insert callback. */
  insert?(rec: SlugRecord, ctx: StoreContext): MaybePromise<'inserted' | 'conflict'>
  isConflict?(error: unknown): boolean
}

export interface SlugRecord {
  id: string
  body: string              // '' for opaque, fallback word for empty titles
  stems: readonly string[]  // stored stems (8.2): lexicon-free, plain or hashed
  titleKey: string          // hex siphash(keyFor(cfg), canonical title), 16 hex chars
  algorithm: 1
}
```

**Capability tiers.** The output is defined per tier. The tier is reported in `SlugResult.storeTier`.

| Tier | Store has | Behavior on a body collision |
|---|---|---|
| `none` | no store, `suggest()` without `taken` | none; IDs are not checked (`checked: false`) |
| `A` | `exists` / `existsMany` only (also `suggest({ taken })`) | keep the best body; tail index `k` walks from 0, up to `maxScan` (64) |
| `B` | + `countBody` / `countBodies` | keep the best body; `k` starts at `n = countBody(body)`; tail length from `tailNeed(n)` |
| `C` | + `findByBody` | smart re-pick when the stored rows with this body differ in content (13.4), else as B |

`countStem(s)` and `total` change rarity (10.2) in every tier. `rarity: 'static'` turns this off.

Consequences, written in the README:
- For identical titles, tiers A, B and C give the same IDs while the tail length is the same (up to 34 rows with the `safe` alphabet; then tier B and C grow the tail and tier A does not): the tier A walk from 0 stops at the first unused index, which is where tier B and C start.
- For different titles that share a body, tiers can differ (tier C may re-pick, tier A and B add a tail). Moving an adapter to another tier can change IDs of **new** rows. Existing rows never change, because IDs are stored and never recomputed.
- All shipped adapters (memory, SQL, Prisma) are tier C.

Rules:
- `scope` is passed on every call. Default scope is `''`. df, N, exists never cross scopes (a cross-tenant df would leak topics).
- Store errors are wrapped in `StoreError { cause }`. The library never returns an unchecked ID from `generate`.
- Results from `findByBody`, `countStems`, `existsMany` are sorted or looked up by key before use. Iteration order never matters.
- Stems in requests and results are always stored forms (8.2). With `storeStems: 'hashed'`, both sides of every compare are hashed by the same `storedStem` call in `analyze()`.
- Reads should go to the primary. Stale reads are handled by `createUnique` retries.

### 13.4 The resolve generator

```ts
type Req =
  | { op: 'stats'; stems: string[] }                  // stored stems -> { df: Map<string, number>, N?: number } | null
  | { op: 'countBodies'; bodies: string[] }           // -> Map<string, number> | null (tier A)
  | { op: 'findByBody'; body: string; limit: number } // -> {id, stems}[] | null (tier A, B)
  | { op: 'exists'; ids: string[] }                   // -> Set<string> (taken)

function* resolve(doc: Analysis, cfg: ResolvedConfig, exclude: ReadonlySet<string>): Generator<Req, ResolveOut, any> {
  if (cfg.leak === 'opaque' || doc.empty) return yield* emptyPath(doc, cfg, exclude)

  const stats = yield { op: 'stats', stems: doc.storedStems }
  const pool = rankPool(doc, stats, cfg)
  const cands = fit(pool, cfg)                                         // best maxPlans (16), sorted
  if (cands.length === 0) return yield* emptyPath(doc, cfg, exclude)

  // Phase 1: body choice. Always look at the best candidate first.
  let chosen = cands[0], reason: Reason = 'base'
  const k0 = yield { op: 'countBodies', bodies: [chosen.body] }        // null: tier A
  let n = k0 ? (k0.get(chosen.body) ?? 0) : 0
  if (n > 0) {
    reason = 'shared-body'
    const others = yield { op: 'findByBody', body: chosen.body, limit: 20 }   // null: tier B
    if (others) {
      const theirs = new Set(others.flatMap(o => o.stems))
      const diff = new Set(pool.filter(c => !isIn(c, theirs)).map(c => c.key))  // 8.2 "in" rule, stored forms
      if (diff.size > 0) {
        const boosted = rankPool(doc, stats, cfg, diff)                // +300 for diff concepts
        const c2 = fit(boosted, cfg, { mustInclude: diff })
        const k2 = c2.length ? yield { op: 'countBodies', bodies: uniq(c2.map(c => c.body)) } : null
        const free = c2.find(c => (k2?.get(c.body) ?? 1) === 0 && !(c.tailLen === 0 && exclude.has(c.body)))
        if (free) { chosen = free; reason = 'repick'; n = 0 }
      }
      // diff empty: same stems (identical or near-identical title). Keep the body, the tail tells them apart.
    }
  }

  // Phase 2: body-only id
  if (chosen.tailLen === 0) {
    if (n === 0 && !exclude.has(chosen.body)) {
      const taken = yield { op: 'exists', ids: [chosen.body] }
      if (!taken.has(chosen.body)) return result(chosen, chosen.body, reason, 0)
    }
    if (reason === 'base') reason = 'shared-body'
    n = Math.max(n, 1)
  }

  // Phase 3: tail. First fix the final body and its tail length, then the start index.
  let t = Math.max(chosen.tailLen, cfg.tailMin, tailNeed(n, cfg)), m = 0
  for (let round = 0; round < 4; round++) {                                   // converges in 1 or 2 rounds
    if (t !== chosen.tailLen) chosen = refitWithTail(pool, cfg, chosen, t)
    if (!k0) break                                                            // tier A: no counts
    const kb = yield { op: 'countBodies', bodies: [chosen.body] }
    m = kb?.get(chosen.body) ?? 0                                             // rows on the final body
    if (tailNeed(m, cfg) <= chosen.tailLen) break
    t = tailNeed(m, cfg)                                                      // load rule on the final body
  }
  let start = 0                                                               // tier A walks from 0
  if (k0) {                                                                   // tier B, C: skip the tails already used
    const bodyOnly = cfg.lengthMode === 'max'                                 // in exact mode a tailed body is never a full ID
      ? (yield { op: 'exists', ids: [chosen.body] }).has(chosen.body) : false
    start = Math.max(0, m - (bodyOnly ? 1 : 0))
  }
  const span = k0 ? cfg.maxAttempts : cfg.maxScan
  for (let a = 0; a < span; a += 8) {                                         // batches of 8 ids
    const batch = range(start + a, start + Math.min(a + 8, span))
      .map(k => ({ k, id: render(chosen, doc, k, cfg) })).filter(x => x.id && !exclude.has(x.id))
    const taken = yield { op: 'exists', ids: batch.map(x => x.id) }
    const free = batch.find(x => !taken.has(x.id))
    if (free) return result(chosen, free.id, reason, free.k)
  }
  throw new ExhaustedError({ body: chosen.body, tailIndex: start, tries: span })
}
```

What changed against rev 1, and why:
- Rev 1 took the first free candidate before it looked at what differs (t010 got `reinig-verw-los1`, which does not show "Süd"). Now the best body is checked first. If it is taken, `findByBody` gives the diff, the diff concepts get +300, and only candidates that contain a diff concept are tried. For t010 after t007 the diff is `{sued}`, so the ID shows `sued`.
- Rev 1 re-picked identical or same-stem titles to a body with less content (t086, t327, t337). Now an empty diff keeps the body and only the tail differs.
- Rev 1 had a different order for exists-only stores (re-pick first). Now every tier keeps the best body and adds a tail; only tier C re-picks, and only with a non-empty diff.
- `n` (rows sharing the best body) sets the first tail length. The tail length and the start index are then counted again on the **final** body (after `refitWithTail`), minus a body-only row with the same text. So in tier B and C the n-th identical title starts at the first unused index, which is the index the tier A walk also reaches.
- After a re-pick to a free body, `n = 0`.

Defaults: `maxPlans 16`, `maxAttempts 8` (tiers B, C), `maxScan 64` (tier A). With `safe` tails and the 1/16 load rule, the chance to exhaust in tier B or C is about 2e-10 per call. Tier A exhausts after about 64 rows with the same title and body; the README says to use a counting store for heavy duplicates.

Drivers:
- `suggest(title)`: tier `none`. `stats`, `countBodies`, `findByBody` -> `null`, `exists` -> empty.
- `suggest(title, { taken })`: tier A. `exists` -> ids in `taken`.
- `generate(title, { store, scope })`: maps each request to `existsMany ?? exists x n`, `countBodies ?? countBody x n ?? null`, `countStems ?? countStem x n ?? null` plus `total`, `findByBody ?? null`. Calls for one request run in parallel (`Promise.all`), results are mapped by key. `signal` is checked before every request. The tier is fixed per store object at the first call (methods present).

Round trips with batching: 3 per call without a collision (stats, countBodies, exists), 5 to 8 with a collision or re-pick.

### 13.5 `createUnique` (race safety)

```ts
async function createUnique<T>(title: string, o: CreateUniqueOptions<T>): Promise<{ result: SlugResult; record: T | undefined }> {
  const tried = new Set<string>(o.exclude ?? [])
  const isConflict = o.isConflict ?? o.store.isConflict ?? isUniqueViolation
  for (let r = 0; r < (o.maxInsertRetries ?? 5); r++) {
    const res = await generate(title, { ...o, exclude: tried })
    if (o.insert) {
      try { return { result: res, record: await o.insert(res) } }
      catch (e) { if (!isConflict(e)) throw e }
    } else {
      if (!o.store.insert) throw new ConfigError('store.insert or insert callback required')
      if ((await o.store.insert(toRecord(res), ctx(o))) === 'inserted') return { result: res, record: undefined }
    }
    tried.add(res.id)                                               // stale read or lost race
  }
  throw new ConflictError({ tried: [...tried] })
}

export function isUniqueViolation(e: unknown, field?: string): boolean {
  // Prisma P2002 (optionally meta.target includes field), Postgres 23505, memory 'E_MEMORY_CONFLICT'
}
```

- The DB `UNIQUE(scope, slug)` is the only guarantee. `exists` is an optimization.
- Two concurrent identical titles compute the same ID. One insert wins. The loser runs again, `countBody` is now n+1 (tier B, C) or the walk skips the taken ID (tier A), so it gets a new tail.
- Two concurrent different titles that re-pick to the same free body both succeed with different tails or the loser moves on. Body uniqueness is best effort.
- Inside a Prisma interactive `$transaction`, a thrown `P2002` aborts the Postgres transaction (`25P02`). The Prisma adapter therefore inserts with `createMany({ skipDuplicates: true })` (`ON CONFLICT DO NOTHING`). When the slug is a column on the entity table, retry the whole transaction (README recipe):

```ts
for (let r = 0; r < 5; r++) {
  let last = ''
  try {
    return await prisma.$transaction(async tx => {
      const res = await slugger.generate(title, { store: prismaStore({ delegate: tx.contract, ... }), scope, exclude: tried })
      last = res.id
      return tx.contract.create({ data: { tenantId: scope, title, slug: res.id, slugBody: res.body, slugStems: [...res.stems] } })
    })
  } catch (e) { if (isUniqueViolation(e, 'slug')) { tried.add(last); continue } throw e }
}
```

### 13.6 Empty path and opaque

| Case | Body | Tail |
|---|---|---|
| `leak: 'opaque'` (requires `secret`) | none | `t = L` (exact) or `L` (max), first char consonant |
| empty title (`onEmpty: 'fallback'`, default) | `cfg.fallbackWord` (`doc`) | exact: `L - len(body) - sep`; max: `tailMin` |
| empty title, `onEmpty: 'throw'` | - | `InputError` |

`body` stored as `''` for opaque, `doc` for empty. The tail index starts at `countBody(body)` (tier B, C) or 0 (tier A), as in 13.4. Hash input uses the canonical title (or `raw:` hex for scripts that were dropped), so `t373` and `t374` differ.

**Why opaque needs `secret`.** `K_V1` is public. Without a secret, anyone with a list of likely titles can compute the opaque ID of each and confirm a guess. With a secret this is not possible. So `leak: 'opaque'` without `secret` is a `ConfigError` (reason `opaque-needs-secret`). The same holds for `storeStems: 'hashed'` (stems are dictionary words, so unkeyed hashes are easy to reverse): `ConfigError` reason `hashed-needs-secret`. `titleKey` is keyed with `secret` when one is set; without it, `titleKey` is a plain title check and the README says to keep it server-side. Normal-mode tails without a secret are 2 to 6 chars, so they confirm a guessed title only weakly (at t = 2 a wrong guess also matches with chance 1/560); the README states this.

---

## 14. Determinism and versioning

### 14.1 Determinism rules (lint + review)

- Banned in `src/**` (except `src/cli.ts`): `Math.random`, `Date`, `crypto`, `Intl`, `localeCompare`, `toLocaleLowerCase`, `toLocaleUpperCase`, `toUpperCase` (`ß` -> `SS`), `Intl.Segmenter`, `BigInt`, `TextEncoder`, `process`, `Buffer`, `require`, `node:*` imports. Enforced in two ways:
  - Biome `noRestrictedGlobals` / `noRestrictedImports` on the source (identifiers, not strings).
  - `test/dist-sandbox.test.ts`: loads `dist/index.cjs` and `dist/adapters/memory.cjs` with `node:vm` in a fresh context that has only `module`, `exports` and the ES globals. In that context `process`, `Buffer`, `require`, `crypto`, `TextEncoder`, `Intl`, `Date`, `BigInt` and `Math.random` are getters that throw. Then it runs the golden subset through `slug()` and a memory store. A text grep is not used, because strings like "data processing agreement" would match.
- No floats in decisions. All scores and costs are integers.
- Every sort has full tie-breakers ending in a code-unit string compare.
- Store results are looked up by key, never used by iteration order.
- "Deterministic" means: same title, same config fingerprint, same store answers, same store tier (13.3), same `exclude` give the same result. Insertion order is part of the store state.

### 14.2 Versioning

1. IDs are generated once and stored. A title edit keeps the ID. Rows are retired, never deleted, so an ID is never handed out twice.
2. `ALGORITHM_VERSION = 1`. Stored with every row and returned in `SlugResult.algorithm`.
3. Everything that affects output lives in `src/data/v1/` (normalization tables, stop words, domain/weak lists, lexicon, places, markers, linkers, coda/onset tables, blocklists, tail alphabets, ranking constants, `LOG2_FRAC_Q8`, `K_V1`) or is vendored (stemmers).
4. `V1_DATA_DIGEST` (hex SipHash of the canonical JSON of the v1 profile) is a constant in `src/data/v1/digest.ts`. A test recomputes it. Any edit to v1 data fails CI until the digest is updated on purpose.
5. Golden files `test/golden/v1.{exact,max,minimal,opaque,len24,underscore}.{independent,sequential}.json`: all fixtures, once each alone (empty memory store) and once through one memory store in fixture order, scope `'golden'`. The `opaque` goldens use the fixed test secret `golden-secret-0123456789`. Format `{ "t001": "strom-rv-nord-26", ... }`.
6. Before 1.0: a minor version may change output. The changeset must say "ID output changed".
7. From 1.0: a change to the default output for the same input/config/store state is a **major** release, or ships as opt-in `algorithm: 2` in a minor release. v1 stays in the bundle for at least one more major. A CI script (`scripts/check-golden-changeset.ts`) fails a PR that changes `test/golden/v1.*` without a major changeset.
8. Exception: adding words to the v1 blocklist is allowed in a minor release. In the independent goldens (each fixture alone) the diff may only change IDs that contain the new word. In the sequential goldens (one store, fixture order) later IDs may change as a cascade, because one changed ID changes body counts for later titles; the check script only requires that the first changed ID in fixture order contains the new word.
9. `SlugResult.configFingerprint` = 16 hex chars of SipHash over the canonical JSON of the resolved config (functions are recorded as `"fn"`).

---

## 15. v1 data: lexicon and lists

### 15.1 Entry type

```ts
export type ConceptClass = 'topic' | 'attr' | 'org' | 'action' | 'activity' | 'doctype' | 'place' | 'direction' | 'region'
  | 'marker' | 'year' | 'range' | 'quarter' | 'week' | 'longnum' | 'code' | 'quantity'

export interface LexiconEntry {
  key: string                       // ascii lemma: 'rahmenvertrag', 'master service agreement'
  lang: 'de' | 'en' | '*'           // required for built-in entries (6.1); user entries default '*'
  phrase?: readonly string[]        // multi-word match on ascii tokens
  forms?: readonly string[]         // extra ascii forms: plurals, combining forms
  abbr?: readonly string[]          // display rungs; cost 15 * index (11.1)
  known?: readonly string[]         // the subset of abbr that is well known (plain rung, no cryptic cost)
  cls: ConceptClass                 // 'attr' is not allowed in the lexicon
  weak?: boolean
  weight?: number                   // -100..100
  prior?: 'common' | 'medium' | 'rare'   // default 'medium'
  part?: boolean                    // usable as compound part, default true for single words
  partOnly?: boolean                // 15.6 entries: cls 'topic', prior 'common'
  group?: string                    // merge key for synonyms
}
```

The built-in lexicon targets about 600 entries at 1.0 (350 DE, 150 EN, 100 places). The tables below are the required starting set for M2. Rungs list short to long, and the order sets the cost. A full word of 6 chars or less is always an extra rung and need not be listed.

**Known abbreviations (v1).** These are marked `known` in their entries. Everything else in an `abbr` list is cryptic (11.1). Rule for adding: the abbreviation is used in German or English procurement text without explanation.

```
rv lv nda msa sla po rfq rfp rfi loi mou dpa avv qbr ppa sow banf it hw sw erp rz cloud bma bhkw
usv pv ms h2 hlk psa fm hv kfz fzg wtg ih gs gaa pgk lksg dsgvo kw muc ffm hbg nbg emea apac dach eu uk us
```

Lookup by stem (4.4) uses the same entries; no extra data.

### 15.2 DE document types and actions

All entries in 15.2 and 15.3 have `lang: 'de'`, except `it`, `erp`, `cloud`, `catering`, `hardware`, `software`, `firewall`, `toner`, `monitor`, `notebook` (`lang: '*'`).

| key (forms) | cls | abbr | notes |
|---|---|---|---|
| rahmenvertrag (rahmenvertraege, rahmenvertrags) | doctype | rv, rvtr | group `rv` |
| rahmenvereinbarung (rahmenvereinbarungen) | doctype | rv, rvtr | group `rv` (open question Q5) |
| leistungsverzeichnis | doctype | lv | `liefervertrag` must never become `lv` |
| dienstleistungsvertrag | doctype, weak | dl | |
| werkvertrag | doctype | wv | |
| bauvertrag | doctype | bauv | |
| ingenieurvertrag | doctype | ingv | |
| generalunternehmervertrag | doctype | guv | |
| betreibervertrag | doctype | betr | |
| auslagerungsvertrag | doctype | ausl | |
| datenschutzvereinbarung | doctype | dsv | |
| auftragsverarbeitungsvertrag, avv | doctype | avv | |
| vertraulichkeitsvereinbarung, geheimhaltungsvereinbarung | doctype | nda | group `nda` |
| aenderungsvereinbarung | doctype | aend | |
| zusatzvereinbarung | doctype | zusatz | |
| angebot (angebote) | doctype | ang | |
| gegenangebot | doctype | gegang | |
| bestellung (bestellungen) | doctype, weak | best | |
| einzelbestellung | doctype, weak | best | |
| bestellanforderung, banf | doctype | banf | |
| abruf | doctype | abruf | |
| leistungsbeschreibung | doctype | lb | |
| lastenheft | doctype | lh | |
| pflichtenheft | doctype | pfh | |
| ausschreibung | action | ausschr | |
| vergabeverfahren | action | vergabe | |
| markterkundung | action | mke | |
| kuendigung (kuendigungs) | action | kuend, kdg | readable form first (rev 2) |
| verlaengerung, verlaengerungsoption | action | verl | |
| anpassung | action | anp | |
| aenderung | action | aend | |
| verhandlung (verhandlungs) | action | verh | |
| nachverhandlung | action | nverh | |
| preisverhandlung | action | preisverh | never `pv` |
| jahresverhandlung, jahresgespraech | action | jg | |
| konditionsgespraech | action | kond | |
| lieferantengespraech | action | lfgespr | |
| verhandlungsstrategie | action | vstrat | |
| eskalation | action | eskal | |
| rueckforderung | action | rueckf | |
| gutschrift | action | gs | |
| pruefung | action | pruef | |
| einfuehrung | action | einf | |
| umstellung | action | umst | |
| umzug | action | umzug | |
| sanierung | action | san | |
| erweiterung | action | erw | |
| neubau | action | neubau | |
| umbau | action | umbau | |
| kick off, kickoff | action | kickoff | |
| vorbereitung | action, weak | vorb | |
| preiserhoehung | action | preiserh | |
| bewertung | activity | bew | |
| qualifizierung, praequalifikation | activity | quali | |
| risikoanalyse | activity | risiko | |
| make or buy | activity | mob | |

### 15.3 DE topics and activities (excerpt for M2, extend to ~300)

| key | cls | abbr |
|---|---|---|
| strom (strompreis, strompreise as forms via split) | topic | strom |
| oekostrom | topic | oeko |
| erdgas | topic | erdgas, gas |
| gas | topic | gas |
| waerme | topic | waerme |
| fernwaerme | topic | fernw |
| energie | topic | ener, energie |
| wasserstoff | topic | h2 |
| blockheizkraftwerk | topic | bhkw |
| netzersatzanlage | topic | nea |
| notstromaggregat | topic | nsa |
| usv, usv-anlage | topic | usv |
| umspannwerk | topic | uw |
| ortsnetzstation | topic | ons |
| transformator (transformatoren) | topic | trafo |
| mittelspannung | topic | ms |
| mittelspannungsschaltanlage | topic | msanl |
| kabel | topic | kabel |
| kabelschutzrohr | topic | ksr |
| kabelverlegung | activity | kabel |
| smart meter gateway (smart-meter-gateways) | topic | smgw |
| zaehler, zaehlertechnik | topic | zaehler |
| zaehlerablesung | activity | ablesung |
| ladeinfrastruktur | topic | lis |
| windpark | topic | windpark |
| photovoltaik, pv-anlage, freiflaechen-pv | topic | pv |
| direktvermarktung | topic | dvm |
| brandmeldeanlage | topic | bma |
| sprinkleranlage | topic | sprinkler |
| aufzug (aufzugs, aufzuege) | topic | aufz, aufzug |
| rolltor, schnelllauftor | topic | tore |
| klimaanlage, klima | topic | klima |
| heizung lueftung klima (phrase) | topic | hlk |
| heizung | topic | heizung |
| kaelteanlage, kaeltetechnik | topic | kaelte |
| wartung (wartungs) | activity | wtg, wart, wartung |
| instandhaltung | activity | ih |
| reinigung | activity | rein, reinig |
| gebaeudereinigung | activity | gebrein |
| glasreinigung | activity | glasrein |
| winterdienst | topic | winter |
| hausmeisterdienst (hausmeisterdienste) | topic | hausm |
| pfoertnerdienst | topic | pfoertner |
| sicherheitsdienst | topic | sid, sicherh |
| werttransport (werttransporte) | topic | wt |
| bargeld, bargeldversorgung | topic | bargeld |
| geldautomat (geldautomaten) | topic | gaa |
| kontoauszugsdrucker, kontoauszugsdruck | topic | kad |
| tresor, tresoranlage | topic | tresor |
| kernbankensystem | topic | kbs |
| wertpapierabwicklung | topic | wpa |
| kartenproduktion | topic | karten |
| kantine, betriebsrestaurant | topic | kantine |
| catering | topic | catering |
| fuhrpark | topic | fzg, fuhrpark (group `fzg`) |
| fahrzeug (fahrzeuge), servicefahrzeug | topic | fzg (group `fzg`) |
| e-fahrzeug | topic | efzg |
| tankkarte | topic | tank |
| gabelstapler | topic | stapler |
| kran (krane, kraene), krantechnik | topic | kran |
| ersatzteil (ersatzteile) | topic | ersatz, etl |
| hubarbeitsbuehne | topic | hubb |
| logistik | topic | log, logistik |
| kontraktlogistik, lagerlogistik | topic | kontrlog |
| spedition, speditionsleistung | topic | sped |
| fracht, frachtkosten | topic | fracht |
| kurier, kurierdienst, expressdienst | topic | kurier |
| stueckgut | topic | stkg |
| komplettladung | topic | ftl |
| wechselbruecke | topic | wbr |
| palette (paletten), europalette | topic | pal |
| it | topic | it |
| hardware | topic | hw |
| software, softwarewartung | topic | sw |
| erp, erp-system | topic | erp |
| it-service-desk, service desk | topic | sdesk |
| mobilfunk | topic | mofu |
| firewall | topic | fwall |
| netzwerk, netzwerkkomponenten | topic | netz |
| druckerflotte, drucker | topic | druck |
| managed print services (phrase) | topic | mps |
| penetrationstest | topic | pentest |
| rechenzentrum (rechenzentrums) | topic | rz |
| cloud | topic | cloud |
| lizenz (lizenzen), volumenlizenz | topic | liz |
| buero | topic | buero |
| bueromaterial | topic | bmat |
| bueromoebel | topic | moebel |
| buerostuhl (buerostuehle) | topic | stuhl |
| notebook (notebooks) | topic | nb, notebook |
| monitor (monitore) | topic | monitor |
| toner, druckerpatronen | topic | toner |
| visitenkarte | topic | visik |
| beton | topic | beton |
| transportbeton | topic | tbeton |
| betonfertigteil (betonfertigteile) | topic | bft |
| betonstahl | topic | bst, bstahl |
| stahl | topic | stahl |
| stahlbau | topic | stahlbau |
| stahltraeger | topic | traeger |
| zement | topic | zement |
| kalksandstein | topic | ks |
| kies, sand | topic | kies, sand |
| gipskartonplatte (gipskartonplatten) | topic | gk |
| daemmstoff (daemmstoffe), mineralwolle | topic | daemm |
| bitumenbahn (bitumenbahnen) | topic | bitumen |
| pflasterstein (pflastersteine) | topic | pflaster |
| kupfer | topic | kupfer |
| streusalz | topic | salz |
| geruest, geruestbau | topic | geruest |
| tiefbau, tiefbauleistung | topic | tiefbau |
| tiefgarage | topic | tg |
| baustoff (baustoffe) | topic | baustoff |
| arbeitsschutzkleidung, psa | topic | psa |
| schutzhelm (schutzhelme) | topic | helm |
| arbeitsschuh (arbeitsschuhe) | topic | schuhe |
| erste hilfe kasten | topic | ehk |
| absperrgitter | topic | gitter |
| entsorgung | activity | entsorg |
| abfall (abfaelle) | topic | abfall |
| altpapier | topic | altpap |
| aktenvernichtung | topic | akten |
| schaedlingsbekaempfung | topic | schaedl |
| gruenflaechenpflege | topic | gruen |
| zeitarbeit | topic | zeitarb |
| beratung, unternehmensberatung, beratungsleistung | topic | berat |
| uebersetzung, uebersetzungsdienstleistung | topic | uebers |
| weiterbildung, schulung | topic | schulung |
| geschaeftsreise, reisebuero | topic | reise |
| hotelkontingent | topic | hotel |
| marketingagentur, marketing | topic | mkt |
| messe, messeauftritt | topic | messe |
| versicherung | topic | vers |
| preisgleitklausel | topic | pgk, preisgl |
| skonto, skontoabzug | topic | skonto |
| bonus, bonusstaffel, mengenbonus | topic | bonus |
| rabatt, rabattstaffel | topic | rabatt |
| zahlungsziel | topic | zz |
| laufzeit | topic | lfz |
| kuendigungsfrist | topic | kfrist |
| indexierung | topic | index |
| lohnkosten | topic | lohn |
| mengenanpassung | topic | menge |
| spend-analyse | topic | spend |
| lieferkettengesetz, lksg | topic | lksg |
| dora, marisk, dsgvo | topic | dora, marisk, dsgvo |
| facility management | topic | fm |
| lieferant (lieferanten) | topic, weak | lief, lfr |
| lieferantenbewertung | activity | lfbew |
| leitstellensoftware | topic | lstsw |
| katalogbeschaffung | topic | katalog |
| claim management | topic | claim |
| value recovery | topic | vr |
| ueberzahlung | topic | uezahl |

### 15.4 EN entries

All entries in 15.4 have `lang: 'en'` (except `erp`, `hvac`, `it`-like shared words, which are `'*'`). Rev 1 left them untagged, so many EN titles scored de = en = 0 and got German splitting and CISTEM.

| key / phrase | cls | abbr |
|---|---|---|
| oil, lubricants | topic | oil |
| master service agreement, master services agreement, msa | doctype | msa |
| non disclosure agreement, nda, one way nda, mutual nda | doctype | nda |
| statement of work, sow | marker | sow + number |
| framework agreement | doctype | fwa |
| service level agreement, sla | doctype | sla |
| power purchase agreement, ppa | doctype | ppa |
| purchase order, po | doctype | po |
| release order | doctype | relo |
| purchase agreement | doctype | pa |
| supply agreement | doctype | supa |
| software license agreement | doctype | swla |
| saas subscription agreement | doctype | saas |
| data processing agreement, dpa | doctype | dpa |
| letter of intent, loi | doctype | loi |
| memorandum of understanding, mou | doctype | mou |
| request for quotation, rfq | doctype | rfq |
| request for proposal, rfp | doctype | rfp |
| request for information, rfi | doctype | rfi |
| quarterly business review, qbr | doctype | qbr |
| addendum | doctype | add |
| amendment | marker | amd + number |
| change order | marker | chg + number |
| change request | marker | cr + number |
| renewal, auto renewal | action | renew, ren |
| termination, termination notice | action | term |
| termination for convenience | action | tfc |
| negotiation | action | neg |
| price negotiation | action | priceneg |
| price review, annual price review | action | prev |
| rate card review | action | rcard |
| counter offer | action | counter |
| claim | action | claim |
| onboarding, supplier onboarding | activity | onb |
| migration | activity | mig, migr |
| implementation | activity | impl |
| rollout | activity | rollout |
| assessment | activity | asmt |
| remediation | activity | remed |
| calibration | activity | calib |
| maintenance | activity | mnt, maint |
| cleaning, industrial cleaning | activity | clean |
| assessment center | topic | ac |
| facility management, facility services | topic | fm |
| security, security services | topic | sec, security |
| cybersecurity | topic | cyber |
| hvac | topic | hvac |
| temporary staffing, staffing | topic | staff |
| engineering, engineering services | topic | eng |
| consulting | topic | consult |
| freight forwarding | topic | frtfwd |
| air freight | topic | air |
| ocean freight, ocean containers | topic | ocean |
| freight rates | topic | freight |
| logistics, logistics hub | topic | log |
| warehouse | place | wh |
| warehouse automation | topic | whauto |
| pallet racking | topic | racking |
| telecom, telecom services | topic | telco |
| cloud hosting | topic | hosting |
| cloud storage | topic | storage |
| data center | topic | dc |
| colocation | topic | colo |
| server rack | topic | rack |
| data platform | topic | dataplat |
| laptop, laptops | topic | laptop |
| office supplies | topic | office |
| office chairs | topic | chairs |
| laboratory equipment | topic | lab |
| av equipment | topic | av |
| spare parts | topic | parts |
| steel coils | topic | coils |
| diesel surcharge, fuel surcharges | topic | fuel |
| solar farm | topic | solar |
| battery storage, battery storage systems | topic | bess |
| waste management | topic | waste |
| corporate travel, travel management | topic | travel |
| fleet, fleet management | topic | fleet |
| forklifts | topic | forklift |
| packaging material | topic | pack |
| safety gloves | topic | gloves |
| managed it services | topic | mits |
| managed print services | topic | mps |
| erp | topic | erp |
| rebate, volume tiers | topic | rebate |
| volume discount | topic | voldisc |
| payment terms | topic | payterms |
| indemnity | topic | indem |
| liability cap | topic | lcap |
| escrow, source code escrow | topic | escrow |
| category plan, category strategy | topic | catplan |
| spend cube | topic | spend |
| sourcing event | topic | sourcing |
| tender | action | tender |
| indirect spend, indirect procurement | topic, weak | indir |
| procurement | topic, weak | proc |
| supplier, suppliers | topic, weak | supp |
| head office | place | hq |
| production environment | topic | prod |

### 15.5 Places, directions, regions

Order of choice: full name if 6 chars or less, else common written short form, else Kfz code with 2+ letters that is not blocked.

| key | cls | abbr |
|---|---|---|
| muenchen | place | muc, muen, muenchen |
| frankfurt | place | ffm, frankf |
| hamburg | place | hbg (never `hh`) |
| nuernberg | place | nbg |
| stuttgart | place | stgt |
| leipzig | place | lpz, leipzig |
| duesseldorf | place | ddorf |
| koeln | place | koeln |
| duisburg | place | du, duisb |
| goettingen | place | goe, goett |
| bielefeld | place | bielef, bielefeld |
| ingolstadt | place | ingol |
| offenbach | place | offb |
| eschborn | place | eschb |
| ruedersdorf | place | rued, rueders |
| berlin, bremen, bochum, erfurt, kassel, fulda, bonn, hamm, london, dublin | place | full name |
| hauptverwaltung | place | hv |
| verwaltungsgebaeude | place, prior common | verw |
| zentrale | place, prior common | zentr |
| logistikzentrum | place, prior common | logz |
| campus | place, prior common | campus |
| niederlassung | place, weak | nl |
| filiale (filialen), filialnetz | place, weak | fil |
| betriebshof (betriebshoefe) | place, prior common | bhof |
| lager | place, prior common | lager |
| baustelle | place, prior common | baust |
| nord, sued, ost, west, mitte | direction | nord/nrd, sued, ost, west, mitte |
| nordhessen | region | nhessen |
| bayern, hessen | region | by, hessen |
| emea, apac, dach, eu, uk, us, europe | region | emea, apac, dach, eu, uk, us, eu (`dach`, `us`, `eu` only when raw upper case: `Dach` is a roof, `us` a pronoun) |
| eu west, eu central | region | euw, euc |
| deutschland | region | de |
| erdgeschoss, eg | place | eg |
| obergeschoss, og (1. og -> og1) | place | og |
| untergeschoss, ug | place | ug |
| kellergeschoss, keller, kg | place | kg, keller |

The short floor forms `eg og ug kg` match only when the legal-form checks in 6.3 say the token is not a legal form.

Building-type places have `prior: 'common'`, so a city or a direction beats them when both cannot fit (`reinig-muen-los1`, not `reinig-verw-los1`).

Place-marker words (weak, re-class the next unknown word as a place, 10.1): `standort werk filiale region campus lager niederlassung netzgebiet site plant office warehouse betriebshof liegenschaft`.

### 15.6 Extra compound parts (no abbr, `part: true`, `partOnly: true`)

When one of these becomes a concept (for example the modifier of a weak head: `mietvertrag` -> `miet`), it has `cls: 'topic'`, `prior: 'common'` and `lang: 'de'` (rev 1 left class and prior open).

```
rahmen vertrag liefer lieferung leistung dienst wartung instandhaltung reinigung gebaeude
standort bau stoff beton zement stahl logistik fracht transport versicherung beratung lizenz
software hardware miete miet leasing fuhrpark kfz buero bedarf material preis gleit klausel
kuendigung frist verhandlung ausschreibung angebot bestellung rechnung skonto bonus rabatt
quartal jahr jahres anlage anlagen system technik netz kabel strom gas waerme energie wasser
licht schutz helm kleidung arbeit sicherheit dienstleistung personal zeit karte karten druck
drucker papier daten bank geld konto auszug schalter halle lager platz park dach fassade glas
garten gruen flaeche pflege post kurier kantine restaurant betrieb betriebs verwaltung haupt
unterhalt zusatz ersatz teil teile notstrom aggregat spannung mittel nieder hoch schalt
station orts umspann werk zaehler ablesung lade infrastruktur wind solar sonne kraft heiz
heizung klima kaelte lueftung aufzug brand melde sprinkler tor roll fenster tuer moebel
stuhl tisch tiefgarage tief garage sanierung umbau neubau erweiterung plan planung trag
ingenieur general unternehmer mengen anpassung index lohn kosten zahlung ziel lauf
```

### 15.7 Line suffixes (org rule, 6.6)

Business words that stand between an org name and its legal form. A token ending in one of these (or equal to it) is a line word.

```
de: technik bau werke dienst dienste bedarf handel einrichtung steine systeme service services
    partner soehne logistik transporte transport beratung vertrieb versand verwaltung holding gruppe
    industrie
(not `werk` or `haus`: names like `Isarwerk` and `Sandhaus` end in them)
en: analytics solutions systems services technologies technology tech group holding holdings
    partners consulting logistics industries international global software labs trading supply
    networks media
```

### 15.8 First names (person rule, 6.6)

`src/data/v1/first-names.ts`: about 400 common first names from public name statistics (DE and EN, for example `thomas michael andreas stefan anna julia maria sabine john david sarah emma`). No surnames, no real persons. Names that are also common title words are left out (`mark frank will grant rose max art bill`). A unit test asserts that no first name is also a lexicon key, place, stop word or line suffix.

---

## 16. Public API

### 16.1 Exports

`semantic-slugger` (browser-safe):

| Export | Kind | Purpose |
|---|---|---|
| `createSlugger(config?)` | fn | Validate config, compile lists, freeze. Throws `ConfigError`. |
| `slug(title, opts?)` | fn, sync | Default slugger. Returns `string`. |
| `suggest(title, opts?)` | fn, sync | Returns `SlugResult`. Optional `taken` for sync uniqueness. |
| `explain(title, opts?)` | fn, sync | Full trace + result. |
| `analyze(title, opts?)` | fn, sync | Normalized tokens, lang, concepts, stems. Use to backfill `stems`. |
| `slugMany(titles, opts?)` | fn, sync | Batch, unique within the batch (internal body counter, same rules as a memory store). |
| `generate(title, opts)` | fn, async | Store-backed resolve. |
| `createUnique(title, opts)` | fn, async | generate + insert + retry. |
| `isValidSlug(id, config?)` | fn | Route/form check. |
| `isUniqueViolation(e, field?)` | fn | P2002 / 23505 / memory conflict. |
| `DEFAULTS` | const | Frozen default config. |
| `ALGORITHM_VERSION` | const | `1` |
| errors + `isSluggerError` | | section 16.5 |
| types | | `SluggerConfig`, `ResolvedConfig`, `SuggestOptions`, `GenerateOptions`, `CreateUniqueOptions`, `SlugResult`, `Segment`, `Explanation`, `Step`, `Analysis`, `SlugStore`, `StoreContext`, `SlugRecord`, `LexiconEntry`, `ConceptClass`, `Lang`, `DetectedLang`, `MaybePromise`, `AbortSignalLike` |

`Slugger` instance: `slug`, `suggest`, `explain`, `analyze`, `slugMany`, `generate`, `createUnique`, `candidates`, `isValid`, `config: ResolvedConfig`, `pattern: RegExp`, `fingerprint: string`.

Nothing runs at module top level. The default slugger and compiled data are built on first use (lazy), so `sideEffects: false` holds.

### 16.2 Config

```ts
export type Lang = 'de' | 'en'
export type DetectedLang = Lang | 'und'
export type ListOption = { add?: readonly string[]; remove?: readonly string[] } | ((defaults: readonly string[]) => readonly string[])

export interface SluggerConfig {
  length?: number                    // 16; 8..64
  lengthMode?: 'exact' | 'max'       // 'exact'
  separator?: '-' | '_' | ''         // '-'
  maxSegments?: number               // 4; 1..5 (fit size, 12)
  tailMin?: number                   // 2; 1..(length-3)
  tailAlphabet?: 'safe' | 'strict' | string   // 'safe' (screen); 'strict' (phone, print), 2.2
  consistentRungs?: boolean          // false; true = one spelling per concept, length filled by the tail (11.1)
  languages?: readonly Lang[]        // ['de','en']
  defaultLang?: Lang                 // 'de'
  detectLanguage?: (normalized: string) => DetectedLang | undefined
  transliterate?: (input: string) => string
  stopWords?: ListOption
  domainStopWords?: ListOption
  weakWords?: ListOption
  reserved?: ListOption
  blocklist?: { hard?: ListOption; soft?: ListOption }
  lexicon?: readonly LexiconEntry[]  // merged over built-ins by key; same key replaces
  denyTokens?: readonly string[]     // always dropped (e.g. surnames, code names)
  dropPersonNames?: boolean          // true; first-name rule (6.6)
  leak?: 'normal' | 'minimal' | 'opaque'   // 'normal'; 'opaque' requires secret
  secret?: string                    // >= 16 chars; keys the hash, titleKey and hashed stems. Use one per tenant
  storeStems?: 'plain' | 'hashed'    // 'plain'; 'hashed' requires secret
  rarity?: 'store' | 'static'        // 'store'; 'static' ignores df for fully reproducible ids
  corpusSize?: number                // 1000; N when the store has df but no total()
  fallbackWord?: string              // 'doc'; [a-z]{2,8}, not blocked
  onEmpty?: 'fallback' | 'throw'     // 'fallback'
  maxPlans?: number                  // 16
  maxAttempts?: number               // 8; tail indexes tried in tiers B and C
  maxScan?: number                   // 64; tail indexes tried in tier A (exists-only)
  maxInputLength?: number            // 4096
  algorithm?: 1                      // 1
}

export interface SuggestOptions { taken?: ReadonlySet<string> | ((id: string) => boolean); lang?: Lang; exclude?: Iterable<string> }
export interface GenerateOptions { store: SlugStore; scope?: string; lang?: Lang; exclude?: Iterable<string>; signal?: AbortSignalLike; trace?: boolean }
export interface CreateUniqueOptions<T> extends GenerateOptions {
  insert?: (result: SlugResult) => Promise<T>
  isConflict?: (error: unknown) => boolean
  maxInsertRetries?: number          // 5
}
```

Config validation (`ConfigError` with `details: { field, value, reason }`): range checks above, unknown keys rejected, only own enumerable keys read (no prototype pollution), list entries normalized and checked against `[a-z0-9]+`, `secret` length, `secret` required for `leak: 'opaque'` and `storeStems: 'hashed'` (13.6), `fallbackWord` not blocked or reserved, custom alphabet rules (2.2), `String.prototype.normalize` present (4.1).

Multi-tenant use: the scope is not hashed (C4), so the same title gives the same ID in every tenant when no tail is needed, and the same tail when one is. The README recommends one `secret` per tenant (for example derived from a server key and the tenant id) so tails, opaque IDs and `titleKey` differ between tenants. The body still shows the topic, which is the purpose of the library.

### 16.3 Result

```ts
export interface Segment {
  text: string
  kind: 'word' | 'number' | 'code' | 'fallback' | 'tail'
  cls?: ConceptClass
  source?: string                    // ascii source word, e.g. 'standorte'
  rung?: 'lexicon' | 'full' | 'morph' | 'coda' | 'syll' | 'skeleton' | 'number'
  verbatim: boolean
}

export interface SlugResult {
  id: string
  body: string
  tail: string
  segments: readonly Segment[]
  stems: readonly string[]           // store these for df and re-pick
  titleKey: string
  lang: DetectedLang
  reason: 'base' | 'repick' | 'shared-body' | 'opaque' | 'empty'
  tailIndex: number                  // k of 13.1; 0 when there is no tail
  storeTier: 'none' | 'A' | 'B' | 'C'   // 13.3
  checked: boolean                   // false for suggest() without taken
  algorithm: 1
  configFingerprint: string
  warnings: readonly ('truncated' | 'script-dropped' | 'empty' | 'stopwords-relaxed' | 'tail-grown')[]
  trace?: Explanation
}
```

### 16.4 `explain()`

```ts
export type Step =
  | { stage: 'normalize'; input: string; surface: string; canonical: string; removed: string[] }
  | { stage: 'language'; lang: DetectedLang; source: 'option' | 'hook' | 'heuristic' | 'default'; scores: { de: number; en: number }; reasons: string[] }
  | { stage: 'tokens'; tokens: { text: string; cls: string; lang: DetectedLang }[] }
  | { stage: 'phrases'; matches: { tokens: string[]; key: string }[] }
  | { stage: 'stopwords'; removed: { word: string; list: 'function' | 'conflict' | 'domain' | 'legal' | 'custom' }[]; weak: string[]; backoff?: string }
  | { stage: 'compounds'; splits: { word: string; parts: string[]; linkers: string[]; kept: string[] }[] }
  | { stage: 'concepts'; rows: { key: string; cls: ConceptClass; stems: string[]; tf: number; pos: number }[] }
  | { stage: 'rank'; df: 'store' | 'static'; N?: number; rows: { key: string; cls: string; base: number; rarity: number; pos: number; tf: number; lex: number; diff: number; score: number }[]; excluded: { key: string; why: 'weak' | 'below-100' | 'no-rung' | 'leak' | 'pool-full' }[] }
  | { stage: 'ladders'; rows: { key: string; rungs: { text: string; kind: string; cost: number; plain: boolean }[]; rejected: { text: string; rule: string }[] }[] }
  | { stage: 'fit'; best: { id: string; cost: number; parts: { rungs: number; cryptic: number; lost: number; chunks: number; tail: number } }[] }   // top 5
  | { stage: 'resolve'; tried: { id: string; status: 'ok' | 'taken' | 'body-taken' | 'reserved' | 'blocked' | 'excluded'; detail?: string }[] }

export interface Explanation { input: string; config: ResolvedConfig; steps: readonly Step[]; result: SlugResult; toString(): string; toJSON(): object }
```

`toString()` example:

```
semantic-slugger v1 | length 16 exact | sep "-" | leak normal | fp 3f9a1c0e8b2d4a71
normalize   rahmenvertrag stromlieferung standorte nord 2026
language    de (heuristic)  de 4 / en 0   suffix:-vertrag suffix:-ung lex:rahmenvertrag compound:stromlieferung
stopwords   weak:standorte
compounds   stromlieferung = strom + lieferung (head weak, kept strom)
rank        key             cls        base  rar  pos  tf  lex  diff  score
            strom           topic       300   75   60   0    0     0    435
            y2026           year        160   75    0   0    0     0    235
            nord            direction   140   75    0   0    0     0    215
            rahmenvertrag   doctype     100   75    0   0    0     0    175
            excluded: standorte (weak)
ladders     strom: strom(0)  nord: nord(0) nrd(15*)  y2026: 26(0) 2026(30)  rahmenvertrag: rv(0) rvtr(15*)   (* = cryptic)
fit         strom-rv-nord-26 120 | strom-nord-26-<t2> 485 | strom-rv-nord-<t2> 545 | strom-rv-2026-<t2> 555 | ...
resolve     strom-rv-nord-26 ok (tier C, countBody 0)
result      strom-rv-nord-26  reason base  tail none
```

### 16.5 Errors

All extend `SluggerError` with `code: string`. `isSluggerError(e, code?)` checks a `Symbol.for('semantic-slugger.error')` brand, so it works across the ESM and CJS copies. The library never logs.

| Class | code | When |
|---|---|---|
| `ConfigError` | `E_CONFIG` | invalid config at `createSlugger`, or `createUnique` without an insert path |
| `InputError` | `E_INPUT` | title not a string; empty title with `onEmpty: 'throw'` |
| `ExhaustedError` | `E_EXHAUSTED` | all tail indexes tried are taken; `details: { body, tailIndex, tries }` |
| `ConflictError` | `E_CONFLICT` | `createUnique` lost more than `maxInsertRetries` races; `details: { tried }` |
| `StoreError` | `E_STORE` | adapter threw; original in `cause` |
| `InternalError` | `E_INTERNAL` | invariant failed (bug) |
| abort | signal reason | rethrown as is |

---

## 17. Adapters

### 17.1 Memory (`semantic-slugger/adapters/memory`)

```ts
export interface MemoryStore extends Required<Omit<SlugStore, 'isConflict'>> {
  isConflict(e: unknown): boolean
  add(rec: string | (Partial<SlugRecord> & { id: string }), scope?: string): void   // body defaults to id
  retire(id: string, scope?: string): boolean     // keeps the id taken
  readonly size: number
  snapshot(scope?: string): readonly SlugRecord[] // sorted by id
}
export function memoryStore(init?: Iterable<string | (Partial<SlugRecord> & { id: string; scope?: string })>): MemoryStore
```

Internals: `Map<scope, { byId: Map<id, rec>, byBody: Map<body, Set<id>>, df: Map<stem, number>, n: number }>`. All methods are sync (allowed by `MaybePromise`). `insert` returns `'conflict'` if the id exists. Insert updates df per unique stem.

### 17.2 Prisma (`semantic-slugger/adapters/prisma`)

No import of `@prisma/client`. Structural types only. Requires Postgres (`String[]` with `has`).

```ts
export interface PrismaSlugDelegate {
  count(args: { where: Record<string, unknown> }): Promise<number>
  findMany(args: { where: Record<string, unknown>; select: Record<string, true>; take?: number; orderBy?: Record<string, 'asc' | 'desc'> }): Promise<Record<string, unknown>[]>
  createMany?(args: { data: Record<string, unknown>[]; skipDuplicates?: boolean }): Promise<{ count: number }>
  groupBy?(args: { by: string[]; where: Record<string, unknown>; _count: Record<string, true> }): Promise<Record<string, unknown>[]>
}
export interface PrismaStoreOptions {
  delegate: PrismaSlugDelegate
  /** Optional raw query for df, e.g. (sql, v) => tx.$queryRawUnsafe(sql, ...v). Needs the default table layout or `fields`. */
  queryRaw?: (sql: string, values: unknown[]) => Promise<unknown[]>
  table?: string                                            // for queryRaw; default "slug_entry", validated as in 17.3
  fields?: Partial<{ scope: string; slug: string; body: string; stems: string; titleKey: string; algorithm: string; retiredAt: string }>
  scopeWhere?: (scope: string) => Record<string, unknown>   // overrides fields.scope, e.g. ({ tenantId: s })
  extraData?: (rec: SlugRecord, scope: string) => Record<string, unknown>
}
export function prismaStore(o: PrismaStoreOptions): SlugStore
export function isPrismaUniqueViolation(e: unknown, field?: string): boolean
```

Mapping (few queries, because Prisma runs the queries of an interactive `$transaction` one after another on one connection):

| Method | Query | Queries per call |
|---|---|---|
| `exists` | `count({ where: { ...scope, slug: id } }) > 0` | 1 |
| `existsMany` | `findMany({ where: { ...scope, slug: { in: ids } }, select: { slug: true } })` | 1 |
| `countBodies` | `groupBy({ by: [body], where: { ...scope, body: { in: bodies } }, _count: { _all: true } })`; without `groupBy`: `count` per body | 1 (fallback: n) |
| `countStems` | with `queryRaw`: the `unnest` query of 17.3 (one statement); without it: `count({ where: { ...scope, stems: { has: s } } })` per stem | 1 (fallback: n) |
| `total` | `count({ where: scope })` | 1 |
| `findByBody` | `findMany({ where: { ...scope, body }, select: { slug: true, stems: true }, take, orderBy: { slug: 'asc' } })` | 1 |
| `insert` | `createMany({ data: [row], skipDuplicates: true })` (`ON CONFLICT DO NOTHING`) | 1 or 2 |

With `groupBy` and `queryRaw`, a `generate` call without a collision makes about 5 queries. `insert`: when `createMany` returns `count === 0`, the adapter calls `exists(id)`. If the ID is taken, it returns `'conflict'`. If not, another unique constraint blocked the row, and the adapter throws `StoreError` (reason `insert-blocked`), so a wrong unique index never looks like a slug race.

Schema (README and `examples/prisma/schema.prisma`):

```prisma
model SlugEntry {
  id        String    @id @default(uuid())
  scope     String
  slug      String    @db.VarChar(64)
  body      String    @db.VarChar(64)
  stems     String[]  @default([])
  titleKey  String    @map("title_key")
  algorithm Int       @db.SmallInt
  createdAt DateTime  @default(now()) @map("created_at")
  retiredAt DateTime? @map("retired_at")

  @@unique([scope, slug])
  @@index([scope, body])
  @@index([stems], type: Gin)
  @@map("slug_entry")
}
```

Or as columns on the entity (`slug`, `slugBody`, `slugStems`, `@@unique([tenantId, slug])`) with `fields` mapping.

### 17.3 SQL (`semantic-slugger/adapters/sql`)

For `pg`, PGlite, postgres.js `unsafe`, Prisma `$queryRawUnsafe`.

```ts
export function sqlStore(o: {
  query: (text: string, values: unknown[]) => Promise<{ rows: unknown[] } | unknown[]>
  table: string                           // checked /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/, quoted
  columns?: Partial<{ scope: string; slug: string; body: string; stems: string; titleKey: string; algorithm: string }>
}): SlugStore
```

```sql
create table slug_entry (
  id          uuid primary key default gen_random_uuid(),
  scope       text not null,
  slug        text not null check (slug ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$' and char_length(slug) <= 64),
  body        text not null,
  stems       text[] not null default '{}',
  title_key   text not null,
  algorithm   smallint not null,
  created_at  timestamptz not null default now(),
  retired_at  timestamptz,
  constraint slug_entry_scope_slug_uq unique (scope, slug)
);
create index slug_entry_scope_body_ix on slug_entry (scope, body);
create index slug_entry_stems_gin on slug_entry using gin (stems);

-- existsMany:  select slug from slug_entry where scope = $1 and slug = any($2::text[])
-- countBodies: select body, count(*)::int n from slug_entry where scope = $1 and body = any($2::text[]) group by body
-- countStems:  select s, count(*)::int n from slug_entry e, unnest(e.stems) s
--              where e.scope = $1 and e.stems && $2::text[] and s = any($2::text[]) group by s
-- total:       select count(*)::int n from slug_entry where scope = $1
-- findByBody:  select slug, stems from slug_entry where scope = $1 and body = $2 order by slug limit $3
-- insert:      insert into slug_entry (scope, slug, body, stems, title_key, algorithm)
--              values ($1,$2,$3,$4,$5,$6) on conflict (scope, slug) do nothing returning slug
```

The `check` is generated from the configured separator and matches I2 exactly: `-` gives `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`, `_` gives `^[a-z][a-z0-9]*(_[a-z0-9]+)*$`, `''` gives `^[a-z][a-z0-9]*$`. `sqlSchema(cfg, { table })` (exported from `semantic-slugger/adapters/sql`) returns the DDL; `examples/sql/schema.sql` is written by `scripts/update-golden.ts` from it, and a test checks that they match. Rev 1 allowed mixing `-` and `_`.

Values always as `$n` parameters. Identifiers validated and double-quoted. Large scopes (over ~1 M rows): optional counter table `slug_stem_df(scope, stem, df)` updated in the same transaction; out of scope for v1, documented.

---

## 18. Repo layout and tooling

### 18.1 Layout

```
src/
  index.ts                   barrel (browser-safe)
  slugger.ts                 createSlugger, default instance (lazy), Slugger
  config.ts                  types, DEFAULTS, resolveConfig, validate, fingerprint
  errors.ts
  result.ts                  SlugResult builder, Explanation + toString
  core/
    normalize.ts translit.ts tokenize.ts lang.ts phrase.ts stopwords.ts org.ts
    compound.ts concepts.ts stem.ts rank.ts graphemes.ts cuts.ts skeleton.ts ladder.ts
    fit.ts resolve.ts tail.ts safety.ts invariants.ts empty.ts drivers.ts
  hash/ siphash.ts encode.ts
  data/
    index.ts                 re-exports for "semantic-slugger/data"
    v1/ stop-de.ts stop-en.ts conflict.ts domain.ts legal.ts weak.ts lexicon-de.ts lexicon-en.ts
        places.ts markers.ts parts.ts blocklist.ts reserved.ts translit.ts phonology.ts
        constants.ts digest.ts
  vendor/ cistem.ts (MIT header) porter2.ts (BSD-3 header)
  adapters/ memory.ts prisma.ts sql.ts
  cli.ts                     Node only, node:util parseArgs
examples/ prisma/schema.prisma  sql/schema.sql  express-route.ts
playground/ index.html app.js style.css
scripts/ corpus-report.ts smoke.ts check-golden-changeset.ts update-digest.ts update-golden.ts serve-playground.ts
         clean.ts ref-acceptance.ts
test/
  fixtures/titles.json
  unit/*.test.ts  unit/redos.test.ts  corpus.test.ts  golden.test.ts  props.test.ts  parity.test.ts
  safety.test.ts  quality.test.ts  expect.test.ts  dist-sandbox.test.ts  bench/slug.bench.ts
  browser/golden.browser.test.ts
  integration/ pglite-sql.test.ts pglite-prisma-shape.test.ts race.test.ts
  types/api.test-d.ts
  golden/v1.*.json
  __snapshots__/corpus.independent.md corpus.sequential.md
  smoke/{esm-node,cjs-node,ts-node16,ts-bundler}/
NOTICE LICENSE README.md CONTRIBUTING.md SECURITY.md CHANGELOG.md SPEC.md .nvmrc
biome.json tsconfig.json tsconfig.node.json tsdown.config.ts vitest.config.ts vitest.browser.config.ts .size-limit.json
.changeset/config.json
.github/ workflows/{ci,release,pages}.yml ISSUE_TEMPLATE/{bad-id.yml,bug.yml} pull_request_template.md dependabot.yml
```

### 18.2 Tooling (exact pins)

| Tool | Version | Role |
|---|---|---|
| Node | 22.18 (dev, `.nvmrc`, `devEngines`), engines `>=22` for users | `node scripts/*.ts` needs 22.18+ (type stripping on by default) |
| pnpm | 12.8.1 (`packageManager`) | |
| tsdown | 0.23.7 (exact) | ESM + CJS + d.ts (oxc, `isolatedDeclarations`), publint, attw |
| typescript | 7.0.2 | typecheck only. Fallback: 5.9.x if tsdown/attw break |
| vitest, @vitest/coverage-v8 | 5.1.0 | tests, snapshots, bench, type tests |
| @vitest/browser-playwright, playwright | 5.1.0 / pin latest at scaffold | real browser runs (chromium, firefox, webkit) |
| fast-check | 4.10.2 | property tests |
| @electric-sql/pglite | 0.5.15 | Postgres in-process |
| publint | 0.3.25 | via tsdown and CLI |
| @arethetypeswrong/cli | 0.18.5 | via tsdown and CLI |
| size-limit, @size-limit/preset-small-lib | 14.3.0 | size budgets |
| @biomejs/biome | 2.6.5 | lint + format |
| @changesets/cli | 3.0.3 | versioning, changelog |

`dependencies: {}`. No peer dependencies.

tsconfig (core): `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `isolatedDeclarations`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `module: "preserve"`, `moduleResolution: "bundler"`, `target: "ES2022"`, `lib: ["ES2022"]`, `types: []`. The core uses no `TextEncoder` (own `utf8()`, 4.1) and no `BigInt` (13.1), so this `lib` is enough. `tsconfig.node.json` covers `src/cli.ts`, `scripts`, `test` with `types: ["node"]`, `allowImportingTsExtensions`, `erasableSyntaxOnly` and `noEmit`. So scripts run with plain `node scripts/x.ts`: imports use `.ts` extensions, and enums, namespaces and parameter properties are type errors. Biome `useImportExtensions` enforces the extensions in `scripts/` and `test/`.

`String.prototype.toWellFormed` is ES2024; use it only via the optional call shown in 4.1.

### 18.3 package.json

Hand-written part. `main`, `module`, `types` and `exports` are **not** written by hand: tsdown (`exports: true`) writes them in its own format (flat `import` / `require` conditions with sibling `.d.ts` / `.d.cts` files, which TypeScript finds next to the JS file). The committed `package.json` contains what tsdown wrote, and CI fails if a build changes it (`git diff --exit-code package.json`). publint and attw (profile `node16`) check the result. Expected subpaths: `.`, `./adapters/memory`, `./adapters/prisma`, `./adapters/sql`, `./data`, `./package.json`.

```json
{
  "name": "semantic-slugger",
  "version": "0.0.0",
  "description": "Short, readable, unique IDs from titles. German + English. Zero dependencies.",
  "license": "MIT",
  "type": "module",
  "sideEffects": false,
  "repository": { "type": "git", "url": "git+https://github.com/heikotroetsch/semantic-slugger.git" },
  "homepage": "https://heikotroetsch.github.io/semantic-slugger/",
  "bugs": "https://github.com/heikotroetsch/semantic-slugger/issues",
  "keywords": ["slug", "id", "short-id", "german", "abbreviation", "procurement", "unique"],
  "engines": { "node": ">=22" },
  "devEngines": {
    "runtime": { "name": "node", "version": ">=22.18", "onFail": "error" },
    "packageManager": { "name": "pnpm", "version": "12.8.1", "onFail": "error" }
  },
  "packageManager": "pnpm@12.8.1",
  "files": ["dist", "NOTICE"],
  "bin": { "semantic-slugger": "./dist/cli.js" },
  "scripts": {
    "clean": "node scripts/clean.ts",
    "prebuild": "node scripts/clean.ts",
    "build": "tsdown",
    "dev": "tsdown --watch",
    "typecheck": "tsc --noEmit && tsc --noEmit -p tsconfig.node.json",
    "lint": "biome check .",
    "format": "biome format --write .",
    "test": "vitest run",
    "test:browser": "vitest run -c vitest.browser.config.ts",
    "test:watch": "vitest",
    "test:update": "vitest run -u && node scripts/update-golden.ts",
    "bench": "vitest bench --run",
    "size": "size-limit",
    "smoke": "node scripts/smoke.ts",
    "corpus:report": "node scripts/corpus-report.ts",
    "acceptance": "node scripts/ref-acceptance.ts",
    "digest": "node scripts/update-digest.ts",
    "playground": "pnpm build && node scripts/serve-playground.ts",
    "changeset": "changeset",
    "release": "pnpm build && changeset publish"
  },
  "dependencies": {}
}
```

`src` does not ship. Sourcemaps carry `sourcesContent`, so they are useful without it.

```ts
// tsdown.config.ts
import { defineConfig } from 'tsdown'
export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      'adapters/memory': 'src/adapters/memory.ts',
      'adapters/prisma': 'src/adapters/prisma.ts',
      'adapters/sql': 'src/adapters/sql.ts',
      data: 'src/data/index.ts',
    },
    format: ['esm', 'cjs'], platform: 'neutral', target: 'es2022',
    dts: true, exports: true, sourcemap: true, clean: false,      // cleaning is the prebuild step
    publint: true, attw: { profile: 'node16', level: 'error' },
  },
  { entry: { cli: 'src/cli.ts' }, format: ['esm'], platform: 'node', target: 'node22', dts: false,
    clean: false, fixedExtension: false,                          // emits dist/cli.js, the bin path
    banner: { js: '#!/usr/bin/env node' } },
])
```

- No config cleans `dist`, so the two builds cannot delete each other's output. `scripts/clean.ts` removes `dist` before the build (`fs.rmSync(..., { recursive: true, force: true })`, works on every OS).
- After the build, `scripts/smoke.ts` asserts that `dist/cli.js` exists, starts with the shebang, and that `bin` points to it.
- Multi-entry builds emit shared chunk files. Nothing may copy single files out of `dist`; the Pages job copies the whole tree (18.6).
- Sourcemaps: `sourcemap: true`. Sources content must be included (set the bundler option explicitly if the tsdown default changes). The smoke test checks that `dist/index.js.map` has a non-empty `sourcesContent`.

Legal comments (`/*! ... */`) of vendored files are kept in `dist`.

`.size-limit.json`: `dist/index.js` (import `{ slug }`) <= 30 KB min+gz including data; `dist/adapters/memory.js` <= 1 KB; `prisma.js` <= 1.5 KB; `sql.js` <= 1.5 KB.

### 18.4 CI (`.github/workflows/ci.yml`)

All actions pinned by commit SHA (Dependabot keeps them fresh). `permissions: contents: read`.

```yaml
name: ci
on: { push: { branches: [main] }, pull_request: {} }
permissions: { contents: read }
concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<sha>
      - uses: pnpm/action-setup@<sha>
      - uses: actions/setup-node@<sha>
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: node scripts/check-golden-changeset.ts
        if: github.event_name == 'pull_request'
  test:
    runs-on: ubuntu-latest
    strategy: { matrix: { node: ['22.18', '24'] } }
    steps:
      - (same setup with node-version ${{ matrix.node }})
      - run: pnpm test --coverage
  browser:
    needs: check
    runs-on: ubuntu-latest
    steps:
      - (setup, node 24)
      - run: pnpm exec playwright install --with-deps chromium firefox webkit
      - run: pnpm build
      - run: pnpm test:browser            # golden subset in chromium, firefox, webkit
  package:
    needs: check
    runs-on: ubuntu-latest
    steps:
      - (setup, node 24)
      - run: pnpm build
      - run: git diff --exit-code package.json
      - run: pnpm size
      - run: pnpm smoke                   # includes running the packed bin (19.5)
      - run: pnpm corpus:report >> "$GITHUB_STEP_SUMMARY"
```

Coverage thresholds: 90% lines for `src/core`, `src/hash`, `src/adapters`.

### 18.5 Release (`.github/workflows/release.yml`)

```yaml
name: release
on:
  workflow_run: { workflows: [ci], types: [completed], branches: [main] }
concurrency: release
permissions: { contents: write, pull-requests: write, id-token: write }
jobs:
  release:
    if: github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.event == 'push'
    runs-on: ubuntu-latest           # OIDC only on GitHub-hosted runners
    environment: npm
    steps:
      - uses: actions/checkout@<sha>
        with: { ref: ${{ github.event.workflow_run.head_sha }} }   # exactly the commit CI tested
      - uses: pnpm/action-setup@<sha>
      - uses: actions/setup-node@<sha>
        with: { node-version: 24 }  # no registry-url, no NODE_AUTH_TOKEN
      - run: npm i -g npm@11.21.0
      - run: pnpm install --frozen-lockfile
      - run: pnpm test && pnpm build && pnpm smoke                  # again, in the release job
      - uses: changesets/action@<sha>
        with:
          version: pnpm changeset version
          publish: pnpm release
          title: 'chore: version packages'
        env: { GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }} }
```

One-time setup, in order:
1. Publish `0.0.1` by hand with 2FA (`npm publish --access public`) to create the name.
2. On npmjs.com add a trusted publisher: repo `heikotroetsch/semantic-slugger`, workflow `release.yml`, environment `npm`. Enable direct `npm publish` (new configs default to staged publish).
3. Merge the first changeset within 2 days.
4. Set "Require 2FA and disallow tokens".
5. Check the provenance badge after the first CI publish (automatic for public repo + public package).

The release runs only after `ci` succeeded on a push to `main`, on the same commit (`head_sha`). Check that the trusted publisher accepts a `workflow_run` trigger in the `0.0.2` dry run; if not, merge release into `ci.yml` as a last job with `needs: [check, test, browser, package]` and `if: github.ref == 'refs/heads/main' && github.event_name == 'push'`.

Check in the `0.0.2` dry run that `changeset publish` (pnpm 12) uses OIDC. If not, set `release` to `pnpm build && npm publish && changeset tag`, guarded by `npm view semantic-slugger@<version>`. Last fallback: granular `NPM_TOKEN` for this package only, short expiry, `--provenance`.

### 18.6 Pages (`.github/workflows/pages.yml`)

On push to `main` (paths `src/**`, `playground/**`): `pnpm build`, copy `playground/*` to `_site/` and the whole `dist/` tree to `_site/dist/` (shared chunks keep their relative imports), then `actions/upload-pages-artifact` and `actions/deploy-pages` with `permissions: pages: write, id-token: write`.

### 18.7 Playground

- No framework, no bundler. `index.html` + `app.js` (`// @ts-check`, JSDoc) + `style.css`. Imports `./dist/index.js` and `./dist/adapters/memory.js`. `serve-playground.ts` serves the repo root the same way, so local and Pages paths match.
- Left: textarea, one title per line, prefilled with 20 corpus titles. Controls: length (8 to 32), lengthMode, separator, leak (opaque uses a visible demo secret), tailAlphabet, consistentRungs, languages, custom stop words, reserved words, "simulate DB".
- Right: table with title, ID, lang, reason, tail yes/no. "Simulate DB" runs `createUnique` in order against `memoryStore()`.
- Click a row: `explain().toString()` and the rank table.
- State in `location.hash` so links can be shared (also the bug report format).
- Banner: "Runs fully in your browser. Do not paste real contract data."

### 18.8 CLI

```
npx semantic-slugger "Rahmenvertrag Stromlieferung Standorte Nord 2026"
npx semantic-slugger --explain --length 20 --leak minimal "..."
cat titles.txt | npx semantic-slugger --unique --json     # one title per line, unique within the batch
```

Flags: `--length --mode --sep --leak --lang --explain --json --unique --secret-env <VAR>`.

### 18.9 README outline

1. Name, one-liner, badges (npm, CI, size, provenance).
2. Before/after table: 8 synthetic titles (DE, EN, mixed, duplicate, non-Latin).
3. Install.
4. Quick start: `slug()` in 3 lines.
5. Uniqueness: `suggest({ taken })`, `generate` with a store, `createUnique` with Prisma (schema snippet), transaction recipe.
6. Config table (field, type, default, effect), generated from `DEFAULTS` by a script.
7. How it works: pipeline diagram, slot order, fit, collision order (same content: same body + tail; different content: re-pick in tier C).
8. `explain()` example. CLI.
9. Collisions and races: UNIQUE constraint, retry, deterministic order, tail index, store tiers A/B/C and what changes between them.
10. Privacy: leak levels, `secret` (required for `opaque` and `hashed`; one per tenant for multi-tenant use), `storeStems: 'hashed'`, what the `stems` column and `titleKey` hold, person names (first-name rule, `denyTokens`). IDs show up in URLs, logs and analytics, which matters under GDPR.
11. Browser and CDN use (`https://cdn.jsdelivr.net/npm/semantic-slugger@<ver>/+esm`). Playground link.
12. Writing your own adapter (only `exists` is required; the tier table of 13.3 says which features each optional method enables).
13. Edge cases table.
14. Stability and versioning policy.
15. FAQ: why not slugify/nanoid/sqids; why no `-2`; hyphen and double-click (use `_` or a copy button); `safe` vs `strict` alphabet (screen vs phone, spell with NATO alphabet).
16. Limits: de/en only, non-Latin needs the hook, lexicon is procurement-heavy.
17. Credits and licenses: CISTEM (MIT), Snowball (BSD-3), sqids-blocklist (MIT), LDNOOBW (CC-BY-4.0).
18. Contributing: lexicon entry -> `pnpm test:update` -> review `corpus.*.md` and golden diff. Only synthetic titles.

### 18.10 Repo hygiene

- PR template checkbox: "All new titles and lexicon entries are synthetic. No customer or real contract data."
- Issue template "Bad or ugly ID": synthetic title, config, ID, expected ID, playground link, same warning.
- `SECURITY.md`: input cap, linear regexes, known-key config merge.
- `NOTICE`: all vendored sources and licenses.

---

## 19. Test plan

### 19.1 Unit (one file per stage)

| Area | Cases |
|---|---|
| normalize | t399 to t403 (umlauts, ẞ, Łódź, ZWSP), t395 to t397 (markup, entities), t360 to t362 (emoji), t369 (C++/C#), noise removal with the rev 2 cases of 4.3 (PO numbers, year lists, `kw12 2026 2027 2028`, `500 €`, phone, IBAN), case flags, `normalize` feature check, own `utf8()` against `TextEncoder` output (test only) |
| redos | every regex in `src/` against the adversarial set of 4.3, < 50 ms each; unregistered regex fails |
| translit | t372, t375, t377 |
| tokenize | years, dates (t355), ranges (t018, t092, t168), quarters, KW (t038), markers incl. `Los #2`, `SOW Nr. 7`, `Amendment No. 2`, `Halle B`, `Phase II`, quantities (t093, t236, t259, `10 Tagen`, `60 Tage`), longnum (t215, t300, t354), codes (t042, t258), code runs (`NA2XS(F)2Y`, `CEM II/A-LL`, `HEA/HEB`, `VOB/B`, `C30/37`), Roman numerals and `[ilo]` tokens as noise, payment terms (t264, t294) |
| lang | all mixed titles t314 to t325, EN titles t280 to t291, t385, t390 detected `en`, conflict words (`Die Casting` stays), t372 tokens are `und` and not split, every single-word lexicon entry has `lang` |
| phrases | msa, fwa, sla, po, hq, statement of work, heizung lüftung klima |
| stopwords | back-off t345 to t350, t368; each conflict word is in the list of each language it belongs to; weak words never in the pool; attr detection (t051, t163, t166, t202, t213, t321) |
| org/person | the org table of 6.6 (t055, t056, t083, t095, t107, t109, t134, t135, t140, t146, t152, t154, t186, t195, t198, t252), t011, t012, t035 to t037, t176 to t199; ambiguous legal forms (`Umbau EG`, `KG 2`, `Nordlicht Energie AG abwehren`); org rungs never equal another class (`nord`, `ost`); `Herr Dr. Muster` dropped; first-name rule (new fixtures 19.7) |
| compound | table 7.3 rows, t404, t405, linkers, no linker before first part, pass 2 rules (`lebensmittellager`, `sandhaus`, `postavki`), `WEAK_HEADS` union, all-weak compounds become domain words, stem lookup (`umzuege`, `kaesten`, `ausschreibungen`) |
| stem | CISTEM reference pairs from the paper/NLTK tests, Porter2 Snowball voc/output sample (500 words) |
| rank | integer formula, `ilog2q8` against `256 * Math.log2` within 23 units for 1..1e6, monotonic, tie-breakers, blend at N = 1, 200, 2000, fixed number rarity, `isProperNoun` DE/EN rules, place-marker re-class only for unknown words |
| cuts/skeleton | ladder table 11 and section 12 examples, coda/onset rules, never end on vowel, `skeleton('lieferant') === 'lfrt'`, abbr cost by index, plain vs cryptic, no zero-pad rung, `consistentRungs` |
| safety | section 9.2 expected behaviors, every B rule, I8 (also joined with `''`), B5 with soft words and `v->u` (`s3x`, `f4g`, `4ss`, `k4ck3`, `fvck`), B7 across body and tail (`...fo` + `tz3`), full enumeration of 2- and 3-char `safe` tails against a committed list |
| fit | t001 and t085 cost tables (12.2), one candidate per subset, max mode tie-break, lower-bound cut gives the same result as a full search (property over random pools), worst case under 10 ms with `maxSegments` 5 |
| siphash | 64 reference vectors on the 32-bit implementation; `divSmall` against a test-only BigInt reference; `makeTail` pinned outputs for 20 keys |
| resolve | each branch: base, repick (findByBody diff), shared-body with empty diff (t086 after t085, t327 after t326, t337 after t336), shared-body in tier B, tier A walk, tail-grown via `refitWithTail`, exhausted (tier A after `maxScan`), exclude, reserved in max mode; t010 after t007 shows `sued`; hashed stems compare (`storeStems: 'hashed'`) |
| config | every `ConfigError` reason (incl. `opaque-needs-secret`, `hashed-needs-secret`, `runtime-no-normalize`, alphabet rules), unknown keys, prototype keys ignored |

### 19.2 Corpus snapshots

- `corpus.independent.md` (`toMatchFileSnapshot`): every fixture alone, empty store, exact 16. Markdown table `id | lang | title | slug | reason | rungs`.
- `corpus.sequential.md`: all fixtures through `createUnique` with one `memoryStore`, in fixture order.
- `expect.test.ts`: every fixture with an `expect` field (19.7) is checked: body equal, tail length equal, in the stated mode (alone or after the listed fixtures).
- Golden JSON files (14.2) for exact, max, minimal, opaque, length 24, separator `_`.

### 19.3 Property tests (fast-check, 1000 runs in CI, seed printed)

```ts
const word = fc.constantFrom(...lexiconWords, ...stopWords, 'München', 'Süd', '2026', 'Los', '🚚', 'Москва', 'ß', 'Analyse', 'Fickenscher')
const title = fc.oneof(fc.string({ unit: 'grapheme', maxLength: 300 }), fc.array(word, { maxLength: 12 }).map(w => w.join(' ')))
const cfg = fc.record({ length: fc.integer({ min: 8, max: 32 }), lengthMode: fc.constantFrom('exact', 'max'),
  separator: fc.constantFrom('-', '_', ''), leak: fc.constantFrom('normal', 'minimal', 'opaque'),
  tailAlphabet: fc.constantFrom('safe', 'strict'), consistentRungs: fc.boolean(),
  maxSegments: fc.integer({ min: 1, max: 5 }) }, { requiredKeys: [] })
  .map(c => c.leak === 'opaque' ? { ...c, secret: 'prop-test-secret-0123' } : c)   // opaque requires secret
```

1. I1 to I10 hold.
2. `suggest(x)` is the same twice and across two new slugger instances.
3. `generate` with the same store snapshot gives the same result.
4. Normalization: `slug(t) === slug(t.toUpperCase() /* only for ASCII titles */) === slug('  ' + t.replace(/ /g, '   '))`.
5. `isValidSlug(id, cfg)` is true.
6. `taken` is respected; `slugMany(xs)` gives distinct IDs.
7. Never throws for string input with a valid config.
8. Parity, same tier: `suggest(t, { taken })` === `generate(t, { store: existsOnly(memoryStore(taken)) })` (tier A).
9. Parity across tiers for identical titles: inserting the same title n times (n <= 34, before tiers B and C grow the tail) gives the same ID sequence with the full memory store (C), a store without `findByBody` (B) and a store with only `exists` (A).
10. Parity across tiers without collisions: for titles whose best body is free, tiers A, B and C give the same ID.
11. Hashed stems: with `storeStems: 'hashed'` and a secret, the sequential corpus gives the same IDs as with `'plain'` (only the stored stems differ).

### 19.4 Collision and race tests

- Memory (tier C): insert `Bestellung Büromaterial` 2,000 times. All IDs unique, at most 3 tail indexes tried per insert, tail grows at n = 35 (t=3) and n = 980 (t=4).
- Exists-only store (tier A): the same title 64 times works, the 65th throws `ExhaustedError` with a hint to use a counting store.
- pglite + SQL adapter: 50 parallel `createUnique` with the same title. All succeed, all unique, <= 5 retries each.
- pglite + Prisma-shaped delegate (a small fake that implements the delegate on SQL): conflict inside a transaction is retried, no `25P02`. A real `@prisma/client` test runs only in an optional CI job.

### 19.5 Package and runtime tests

- publint + attw (inside tsdown), `git diff --exit-code package.json`.
- `scripts/smoke.ts`: `pnpm pack`, install the tarball into 4 fixtures (ESM Node, CJS `require`, TS `node16`, TS `bundler`). Each runs `slug('Rahmenvertrag Stromlieferung Standorte Nord 2026')` and compares to the golden value. It also runs the installed bin (`npx semantic-slugger "Rahmenvertrag Stromlieferung Standorte Nord 2026"` and `--json`), checks the output, checks the shebang of `dist/cli.js`, and checks `sourcesContent` in the maps.
- Browser parity (`test/browser/golden.browser.test.ts`, vitest browser mode with the Playwright provider, chromium, firefox and webkit): the golden subset (independent goldens of all `edge` fixtures plus 60 content titles) gives the same IDs as in Node. happy-dom is not used, because it runs in Node's V8 and does not test ICU, `\p{Extended_Pictographic}` data or Safari.
- `dist-sandbox.test.ts` (14.1): the CJS builds run in a `node:vm` context where `process`, `Buffer`, `require`, `crypto`, `TextEncoder`, `Intl`, `Date`, `BigInt` and `Math.random` throw.
- Data digest test.
- Type tests (`expectTypeOf`): `createUnique<T>` returns `record: T | undefined`, config keys are strict, `ListOption` forms.

### 19.6 Quality metrics (`scripts/corpus-report.ts`, gated in `quality.test.ts`)

"Content titles" = fixtures with `kind !== 'edge'` (340). Default config unless noted.

| # | Metric | Definition | Target (gate) |
|---|---|---|---|
| Q1 | Recognizable token | ID has at least one segment that is a lexicon abbr of a title concept, or a prefix (3+ chars) of a title word or compound part (ascii) | >= 95% (gate), aim 98% |
| Q2 | Top concept kept | top-ranked pool concept appears in the ID | >= 90% (gate) |
| Q3 | Skeleton share | segments with rung `skeleton` / all body segments | <= 5% (gate) |
| Q4 | Padding tail rate | exact, independent: IDs with a tail that is not caused by a collision | report; <= 45% (gate) |
| Q5 | Collision fallback rate | sequential: titles with `reason: 'shared-body'` whose stems differ from the rows on that body (a content collision that re-pick did not solve). Same-stem titles (`dup-*`, `norm-variants`, `near` pairs) are not counted, because sharing the body is the wanted result for them | <= 3% (gate) |
| Q6 | Sibling distinguishability | sequential, per `group` and per `org` link: for each sibling pair whose titles differ in content, the IDs differ in at least one body segment whose concept is in one title and not in the other (`muen` vs `verw` does not count for Nord vs Süd) | >= 90% (gate) |
| Q7 | Avg semantic segments | mean body segments over content titles | 2.5 to 3.5 (gate); max = `maxSegments` |
| Q8 | Normalization | `norm-variants` alone: identical IDs | 100% (gate) |
| Q9 | Uniqueness | sequential: all IDs distinct | 100% (gate) |
| Q10 | Bad words | full blocklist scan, hard words with no exceptions | 0 hits (gate) |
| Q11 | Re-pick share | sequential: `reason: 'repick'` / collisions | report |
| Q12 | Speed | `suggest()` median and p99 on Node 22 | median < 200 µs, p99 < 2 ms (bench, not gating); worst-case fit with pool 6 and `maxSegments` 5 < 10 ms (gate) |
| Q13 | Human review | a native German procurement user rates every ID of the full report: 1 = know it, 2 = can guess, 3 = no idea | >= 85% rated 1 before 1.0 (manual) |
| Q14 | Same title, same content | sequential: rows with identical canonical titles, and `near` pairs with the same stems, have the same content key; if the first row's body has a tail, the bodies are equal | 100% (gate) |
| Q15 | Expected outputs | fixtures with `expect` (19.7) match | 100% (gate) |
| Q16 | Org consistency | sequential, per `org` link: the org segment (if present) is spelled the same in every ID | >= 95% (gate) |
| Q17 | Spelling consistency | per concept over the corpus: share of IDs that use the concept's most common rung | report (input for Q9) |

The report also lists: rung kind mix, % plain rungs, IDs per reason, IDs per store tier, and the 20 worst IDs by fit cost.

### 19.7 Fixture changes (M2, all synthetic)

Rev 1 fixtures had no expected outputs and no links between near-duplicates or same-supplier titles. New optional fields in `test/fixtures/titles.json`:

```ts
interface Fixture {
  id: string; lang: 'de' | 'en' | 'mixed'; kind: string; title: string; group?: string
  org?: string                        // same-supplier link, e.g. 'grauwacke'
  near?: string                       // id of a near-duplicate (same stems), e.g. t086.near = 't085'
  expect?: {                          // checked by expect.test.ts (Q15)
    body: string; tail: number        // tail = tail length (0 = none)
    after?: string[]                  // ids inserted before, in this order (default: alone)
    config?: Partial<SluggerConfig>   // default config if absent
  }
}
```

Links to add:
- `near`: t086 -> t085, t327 -> t326, t337 to t340 -> t336.
- `org: 'grauwacke'`: t037, t107, t182, t213. `org: 'nordlicht'`: t055, t177, t202, t315. `org: 'mueller'`: t035, t109, t176. `org: 'hansekontor'`: t146, t180, t204, t325. More by a scan for repeated org names.
- `expect`: the rows of section 20 that are marked `ref` after M4.

New fixtures (t408 onward, all invented):

| Purpose | Titles |
|---|---|
| person names | `Gespräch Thomas Becker Rahmenvertrag Reinigung`, `Herr Dr. Muster Kick-off Logistik`, `Meeting Sarah Miller Freight Rates 2026`, `Jahresgespräch Anna Krüger Bürobedarf`, `Lieferantengespräch Frau Petra Lang` |
| floors, not legal forms | `Umbau EG Verwaltung Kassel`, `Sanierung KG 2 Tiefgarage`, `Reinigung 1. OG und EG Hauptverwaltung` |
| Roman numerals | `Phase II Rollout ERP`, `CEM II/A-LL Zement Lieferung 2026`, `Teil III Rahmenvertrag Kabel` |
| umlaut plurals and stems | `Ausschreibungen Gebäudereinigung 2026`, `Wartungsverträge Aufzüge Nord`, `Erste-Hilfe-Kästen Nachbestellung`, `Umzüge Standorte Süd` |
| money and terms | `Budget 500 € Büromaterial 2026`, `Rahmenvertrag Kabel 1,2 Mio € netto 30 Tage`, `Net 45 Payment Terms Review` |
| only adjectives plus a noun | `Neue günstige Lösung`, `dringend schnelle Lieferung`, `Gelbe Schutzhelme`, `Urgent cheap supply` |
| org names with direction words | `Rahmenvertrag Strom Nordwind Energie AG`, `Westfeld Logistik GmbH Fracht 2026`, `Südstern Bau GmbH Tiefbau`, `Ostmark Kabel KG Mittelspannung` |
| code runs | `Kabel NA2XY 4x150 Lieferung`, `Beton C30/37 Transportbeton Los 2`, `VOB/B Bauvertrag Tiefbau` |
| phone, IBAN, PO lists | `Rückruf +49 89 1234567 Stromvertrag`, `PO 4500012345 4500012346 Schrauben`, `Zahlung DE89 3704 0044 0532 0130 00 Skonto` |

Every new title must be checked against the public repo rule: invented company and person names, no real contract data.

---

## 20. Acceptance examples (guidance until regenerated)

Default config: length 16, exact, `-`, leak `normal`, no store df (priors only). `[tN]` = a tail of N chars from the safe alphabet (first char a consonant). "Alone" = empty memory store. "After X" = inserted in order into one memory store. The body and the tail length are the target. Tail chars depend on the hash.

**Status column.** Rev 1 rows were not computed with the spec's own formulas (review issue 1). In rev 2:
- `ref` = hand-computed with the rev 2 rules of sections 6 to 13 (costs in the note where useful). These rows move into the fixtures as `expect` (19.7) at M4.
- `unv` = unverified target. The rules may give something else; the note says what is known.

At M4, `scripts/ref-acceptance.ts` (a small, separate re-implementation of ranking, ladders and fit cost from this spec, not importing `src/core`) recomputes every row and prints both values. Section 20 is then regenerated from it, and any row where the reference and `src` disagree is a bug in one of them. Reviewers may accept a different body if it is at least as readable and the metrics hold.

### 20.1 German

| # | Fixture | Title | Expected | Status | Note |
|---|---|---|---|---|---|
| 1 | t001 | Rahmenvertrag Stromlieferung Standorte Nord 2026 | `strom-rv-nord-26` | ref | cost 120 (12.2); `standorte` weak, not in pool |
| 2 | t002 | ... Standorte Süd 2026 | `strom-rv-sued-26` | ref | never `sd` |
| 3 | t003 | ... Standorte Nord 2027 | `strom-rv-nord-27` | ref | |
| 4 | t085 | Rahmenvertrag für Stromlieferung der Standorte 2026 | `strom-rv-2026-[t2]` | ref | 340 vs `strom-rvtr-26-[t2]` 365 (12.2); PO shape: body + 2-char tail |
| 5 | t086 after t085 | Rahmenverträge für Stromlieferung der Standorte 2026 | `strom-rv-2026-[t2]`, other tail | ref | same stems, diff empty, body kept, reason `shared-body` |
| 6 | t004 | Erdgaslieferung Liegenschaften Kassel 2025 | `erdgas-kassel-25` | ref | cost 60 |
| 7 | t006 | Erdgaslieferung Liegenschaften Göttingen 2026 | `erdgas-goe-26-[t2]` | ref | 350; max mode: `erdgas-goett-26` |
| 8 | t007 | Unterhaltsreinigung Verwaltungsgebäude München Nord – Los 1 | `reinig-muen-los1` | ref | 615 vs `reinig-nord-los1` 620; needs `verwaltungsgebaeude` prior common (15.5) |
| 9 | t008 after t007 | ... Nord – Los 2 | `reinig-muen-los2` | ref | free body, reason `base` |
| 10 | t010 after t007 to t009 | ... München Süd – Los 1 | `reinig-sued-los1` | ref | best body taken, findByBody diff `{sued}`, reason `repick` |
| 11 | t011 | Wartungsvertrag Aufzugsanlagen Hauptverwaltung – Isarwerk Elektrotechnik GmbH | `aufz-wtg-hv-isar` | ref | Q slot by title position (`hv` before `isar`); org `Isarwerk` (not split), syllable cut; line word `elektro` lost |
| 12 | t012 after t011 | ... – Fichtel Kran & Hebetechnik GmbH | `aufz-wtg-hv-fich` | unv | rules give `aufz-kran-wtg-hv` (520, line word `kran` kept at -50); decide at M8 |
| 13 | t013 | Nachtrag 1 zum Rahmenvertrag Betonstahl – Preisgleitklausel | `bst-pgk-rvtr-nt1` | ref | 215; four concepts, two cryptic; checked again in Q13 |
| 14 | t016 | Kündigung Wartungsvertrag Brandmeldeanlage Standort Kassel | `bma-kuend-kassel` | ref | 375 |
| 15 | t017 | ... Standort Fulda | `bma-kuend-wtg-[t2]` or `bma-kdg-fulda-[t2]` | unv | rules give `bma-wtg-fulda-[t2]` (605), which drops Kündigung; M8: action weight or `kuendigung` weight +40 |
| 16 | t018 | Verlängerung Dienstleistungsvertrag Winterdienst 2025/2026 | `winter-verl-2526` | ref | 100 |
| 17 | t022 | Rahmenvereinbarung Zementlieferung Werk Rüdersdorf Q1 2026 | `zement-rued-26q1` | ref | 275; `rv` lost |
| 18 | t025 | Lieferung Mittelspannungskabel NA2XS(F)2Y Los 1 Netzgebiet Ost | `mskabel-ost-los1` | ref | 60; bond joined, code run of 8 chars is noise |
| 19 | t030 | Dienstleistungsvertrag Bargeldversorgung Geldautomaten Region Nord | `bargeld-gaa-nord` | ref | 60 |
| 20 | t049 | Leasingvertrag Fuhrpark Servicefahrzeuge 2026 Los A | `leas-fzg-26-losa` | ref | 250 vs `leasing-fzg-losa` 335; group `fzg` counted once (tf 2) |
| 21 | t053 | Wartung PV-Anlage Dach Logistikzentrum Bielefeld | `pv-wtg-bielefeld` | unv | rules give `pv-dach-wtg-logz` (`dach` as a part-only topic scores 360); M8 |
| 22 | t176 | Müller Stahlbau GmbH | `stahlbau-mueller` | ref | 0; slot T before Q (rev 1 said `mueller-stahlbau`, which the slot order never gives) |
| 23 | t215 | Bestellung 4500012345 Schutzhelme EN 397 rot | `helm-rot-2345-[t2]` | ref | 485; `rot` is attr; PO number now kept (phone rule fixed) |
| 24 | t326 | Wartungsvertrag Brandmeldeanlage Hauptverwaltung | `bma-wtg-hv-[t5]` | ref | 460; `bma-wartung-hv` (14) cannot take a tail |
| 25 | t327 after t326 | same | `bma-wtg-hv-[t5]`, other tail | ref | diff empty, body kept |
| 26 | t336 to t340 (each alone) | Rahmenvertrag Stromlieferung München 2026 and variants | `strom-rv-muen-26` (all five) | ref | 175; same canonical title |
| 27 | t337 after t336 | RAHMENVERTRAG STROMLIEFERUNG MÜNCHEN 2026 | `strom-muc-26-[t3]` | ref | diff empty; body-only ID taken, `refitWithTail` drops `rv`; 360 vs `strom-muen-26-[t2]` 365; reason `shared-body`, warning `tail-grown` |
| 28 | t404 | Stromlieferungsrahmenvertragsverlängerungsvereinbarung | `strom-rv-verl-[t2]` | ref | 350; `rahmenvertrag` middle part scores 125 (>= 100) |
| 29 | t384 | Analyseplattform Lieferantenbewertung | `analyse-lfbew-[t2]` | ref | 330; pass 2 split `analyse` + weak head; `anal`/`analys` cuts blocked |
| 30 | t388 | Fickenscher Metallbau GmbH Rahmenvertrag | `metallbau-rv-[t3]` | ref | 340; org blocked (hard), so line word `metallbau` keeps full weight |
| 31 | t365 | !!! Wartung ??? (Halle 3) /// Los #2 ;;; v1.2 ... | `wtg-h3-los2-[t4]` | ref | 410; no zero-pad rung any more (rev 1: `wartung-h3-los02`) |
| 32 | t369 | C++ / C# Schulung & Zertifizierung @ München | `cpp-schulung-muc` | unv | T slot by title position puts `cpp` first |

### 20.2 English and mixed

| # | Fixture | Title | Expected | Status | Note |
|---|---|---|---|---|---|
| 33 | t059 | Master Service Agreement – Bluefin Analytics Ltd. | `msa-bluefin-[t4]` | ref | 640 vs `analytics-msa-[t2]` 650; `analytics` line word |
| 34 | t063 | Mutual NDA – Northgate Cloud Services Inc. 2025 | `nda-northgate-25` | ref | 485; org full name 9 chars (cost 40); `nor` removed (stop word) |
| 35 | t064 after t063 | ... 2026 | `nda-northgate-26` | ref | |
| 36 | t334 | NDA Northgate Cloud Services Inc. | `nda-northgate-[t2]` | ref | 675 |
| 37 | t065 | Framework Agreement Office Supplies EMEA 2026 | `office-emea-2026` | ref | 265; full year fills budget |
| 38 | t066 | ... APAC 2026 | `office-apac-2026` | ref | |
| 39 | t070 | RFQ Pallet Racking Warehouse Leipzig Lot 1 | `racking-lpz-lot1` | ref | 275 |
| 40 | t074 | Security Services Agreement Head Office London | `sec-hq-london-[t2]` | ref | 390; max mode: `sec-hq-london` |
| 41 | t078 | Purchase Order Laptops Engineering Team Batch 1 | `laptop-eng-po-b1` | ref | 160; `eng` is a topic, so slot T holds `laptop` and `eng` (rev 1: `laptop-po-eng-b1`) |
| 42 | t247 | Statement of Work 7 – ERP Rollout Wave 2 | `erp-rollout-sow7` | ref | 355 |
| 43 | t306 | RFQ Industrial Cleaning Services Plant 2 | `clean-rfq-plant2` | ref | 60 |
| 44 | t314 | Rahmenvertrag Cloud Services – SLA Addendum 2026 | `cloud-sla-add-26` | ref | 335 |
| 45 | t320 | Facility Management Agreement Standort München Nord | `fm-muenchen-nord` | ref | 90 |
| 46 | t319 | Kick-off Negotiation Strompreise FY2026 | `strom-preis-fy26` | ref | 650; two actions lost |
| 47 | t390 | Scunthorpe Warehouse Lease Renewal | `scun-lease-renew` | ref | 250; detected `en`; `scunth` blocked (hard); `Lease` is not re-classed as a place |
| 48 | t385 | Shiitake Mushroom Supply Canteen | `shiitake-canteen` | ref | 390; no false hit |

### 20.3 Edge cases

| # | Fixture | Title | Expected | Status |
|---|---|---|---|---|
| 49 | t341 to t344 | empty, spaces, tabs, ZWSP | `doc-[t12]` | ref |
| 50 | t345, t346, t347 | `der die das`, `und oder für mit von der`, `the and of` | `doc-[t12]` | ref (needs the rev 2 DE stop list) |
| 51 | t349, t350, t368 | `Vertrag GmbH AG`, `Vertrag`, `Vertrag_v2_FINAL_final(3).docx` | `vertrag-[t8]` | ref |
| 52 | t351 | `2026` | `doc-2026-[t7]` | ref |
| 53 | t353 | `2025 2026 2027` | `doc-25-26-27-[t3]` | unv (years not removed any more) |
| 54 | t354 | `4500012345` | `doc-2345-[t7]` | ref (rev 1 phone regex ate it) |
| 55 | t359 | `Öl` | `oel-[t12]` | ref |
| 56 | t360 | `⚡️ Strom 2026 🔌` | `strom-2026-[t5]` | ref (430) |
| 57 | t361, t367, t406 | emoji only, punctuation only, look-alike junk | `doc-[t12]` | ref |
| 58 | t372 | Договор поставки электроэнергии 2026 | `dogovor-postavki` | unv (tokens `und`, not split) |
| 59 | t373 | 电力供应框架协议 2026 | `doc-2026-[t7]`, warning `script-dropped` | ref |
| 60 | t374 vs t373 | Arabic vs CJK | different tails | ref |
| 61 | t378 | `new` | `new-[t12]`; max mode `new-[t2]` | ref |
| 62 | t401 | STRASSE Strasse Straße STRAẞE | `strasse-[t8]` (one concept, tf 4) | ref |
| 63 | t407 | Los 1 Los 2 Los 3 | `los1-los2-[t6]` | ref (705; first char letter, `doc` not needed) |
| 64 | t001, leak opaque, secret set | | `[t16]` | ref |
| 65 | t001, max mode | | `strom-rv-nord-26` | ref |
| 66 | t085, max mode | | `strom-rv-26` | ref |

---

## 21. Milestones (build order)

Each milestone ends with green CI and a short changeset (pre-1.0, private until M7).

| M | Scope | Done when |
|---|---|---|
| M0 Scaffold | git init, package.json, pnpm, tsdown, tsconfigs, biome, vitest, size-limit, changesets, CI workflow, LICENSE, NOTICE, empty barrel, fixture file, PR/issue templates | `pnpm build && pnpm test && pnpm lint` green; publint/attw pass on an empty export |
| M1 Hash + format | SipHash-2-4 + vectors, tail encoder, alphabets, `TAIL_BLOCK`, invariants, `isValidSlug`, config validation, errors, empty/opaque path | opaque and empty IDs pass properties I1 to I10 |
| M2 Data v1 + language | normalize (ordered noise removal, protected spans, case flags), translit, tokenize (code runs), all v1 lists (sections 6 and 15, incl. line suffixes and first names), vendored CISTEM + Porter2, language detection with `lang` on every entry, phrases, stop words, attr words, back-off, org/person; fixture changes of 19.7 | unit tests for sections 4 to 6 green; ReDoS harness green; digest test in place |
| M3 Compounds + concepts + rank | two-pass splitter, concept rules, lexicon-free stored stems, stem lookup, integer ranking with priors and blend | compound and rank unit tests green; `analyze()` public |
| M4 Ladders + safety + fit | graphemes, cuts, skeleton, number rungs, plain/cryptic costs, blocklist checks, bounded fit search, `suggest()` / `slug()` without store; `scripts/ref-acceptance.ts` | independent corpus snapshot written; section 20 regenerated from the reference script and `src` agree; `ref` rows moved to fixture `expect`; Q1 to Q4, Q7, Q8, Q10, Q15 measured |
| M5 Resolve + memory | sans-IO resolve, store tiers, sync `taken` driver, memory adapter, `generate`, `createUnique`, `slugMany`, tail index, re-pick, tail growth | sequential snapshot; Q5, Q6, Q9, Q14, Q16 gates; tier parity properties; stress test |
| M6 DB adapters | SQL adapter, Prisma adapter, pglite integration, race tests, Prisma schema + SQL examples | integration tests green on Node 22.18 and 24 |
| M7 DX + release | `explain()` + `toString`, CLI, playground + Pages, README, smoke fixtures (incl. bin), Playwright browser job, dist sandbox test, size budgets, release workflow gated on CI, publish `0.0.1` by hand, trusted publisher, `0.1.0` via changesets | npm package with provenance, playground live |
| M8 Quality loop + freeze | corpus report review, lexicon tuning to ~600 entries, the `unv` rows of section 20, human rating (Q13), golden files for all configs, golden-changeset guard | Q1 to Q17 targets met; no `unv` rows left; `1.0.0` |

---

## 22. Open questions for the product owner

| # | Question | Default in this spec |
|---|---|---|
| Q1 | `exact` or `max` as the default? Exact pads up to ~45% of IDs with a code that only fills space. | `exact` (PO request), with the rev 2 length policy of 12.1: bodies are exactly L or take a tail, no pad-only rungs, no 1-char pads. `max` documented as "readable" preset. Q4 data goes to the PO at M4. |
| Q2 | Separator and double-click: `-` selects one segment on double-click; `_` or `''` select the whole ID but leave `[a-z0-9-]`. | `-`, with `_` and `''` as options and a README tip for a copy button. |
| Q3 | Supplier names in `normal` leak level? | Allowed (best discriminator). Dropped in `minimal`. |
| Q4 | City short forms (`muc`, `ffm`, `hbg`) or full names when they fit? | Short forms first, full name as a longer rung. |
| Q5 | `rv` for both Rahmenvertrag and Rahmenvereinbarung? | Yes (same group). Re-pick handles collisions. |
| Q6 | Rarity from the DB makes new IDs depend on scope history. OK? | Yes. `rarity: 'static'` gives fully reproducible IDs. |
| Q7 | Identical titles: always a new ID, or offer `onDuplicateTitle: 'return-existing'` via `titleKey`? | Always a new ID in v1. |
| Q8 | Require `secret` when `leak: 'opaque'`? | Answered in rev 2: required (`ConfigError`), also for `storeStems: 'hashed'` (13.6). |
| Q9 | `consistentRungs` on by default? One spelling per concept in all IDs (`kuend` everywhere) costs more tails. | Off. Decide with the Q17 report at M8. |
| Q10 | Drop person names by default (first-name rule)? IDs go into URLs and logs. | On (`dropPersonNames: true`). |
| Q11 | Building-type places (`Verwaltungsgebäude`, `Logistikzentrum`) rank below cities and directions. OK? | Yes (prior `common`, 15.5). |

---

## Appendix A. Review decisions (rev 2)

Issue numbers follow the rev 1 review. A = accepted, P = accepted in part or with a different fix, R = rejected.

| # | Issue | Decision | Why / where |
|---|---|---|---|
| 1 | Acceptance table not computed with own formulas | A | Section 20 rows hand-recomputed with rev 2 rules and marked `ref` or `unv`; `scripts/ref-acceptance.ts` regenerates them at M4 (21). |
| 2 | Weak words under-specified, enter pool and `lost` | A | Weak concepts are out of the pool and out of `lost`; only the back-off restores them (6.3, 6.5, 10.4). |
| 3 | Class/prior missing for parts, numbers, place markers | A | Parts-only: topic + prior common (7.3, 15.6). Number classes: fixed rarity 50. Place markers re-class only unknown proper-noun candidates (10.1). |
| 4 | Small text errors, undefined functions | A | Explain example fixed (16.4), `lfrt` (11.4), `refitWithTail` defined, `idNoTail` removed (13.2). |
| 5 | Within-slot order by score | A | Order inside a slot is title position; score only picks concepts (2.1, C7). |
| 6 | Unknown words outrank lexicon words | A | Unknown words weight 220, prior 40; new `attr` class with DE/EN suffix and lower-case rules (6.4, 10.1). |
| 7 | `isProperNoun` useless in German | A | DE: only org-adjacent, or capitalized, not splittable, no lexicon match; EN Title Case gives no signal (10.2). |
| 8 | EN entries untagged, `und` split as German | A | Every built-in entry has `lang`; extra EN endings; `und` and transliterated tokens never split (6.1, 15.4). |
| 9 | DE stop list missing words | A | Added `ab also bin binnen ca die fast hat man oder seit war will`; unit test per conflict word (6.3). |
| 10 | Lexicon lookup exact only | A | Stem index fallback for tokens of 5+ chars (4.4). |
| 11 | Rarity swings at small N | A | Integer blend with k = 200 (10.2). |
| 12 | ReDoS in email regex | A | Bounded pattern; one harness for every regex in `src/` (4.3). |
| 13 | Phone regex eats PO numbers and years | A | Phone needs leading `+`/`0` and a separator, year groups rejected; number spans protected before money/percent (4.3). |
| 14 | Money regex `\b` after `€` | A | Unicode edge lookahead (4.3). |
| 15 | IBAN regex matches `kw12 2026 ...` | P | Fixed by a SEPA country list (no `kw`) and 4-char groups; IBAN runs before masking so real IBAN groups like `2013` are not masked first (4.3). |
| 16 | Code fragments become junk words | A | Code runs joined first; Roman numerals and short `[ilo]` tokens are noise (5.1, 5.2). |
| 17 | Missing units and payment terms | A | Units added; payment-term pattern is noise (4.3, 5.2). |
| 18 | Ambiguous legal forms | P | Accepted with a changed condition: the previous token must be capitalized (not "non-lexicon", which would break `Grauwacke Beton AG`); floors added to the lexicon (6.3, 15.5). |
| 19 | Org walk picks wrong token | P | Accepted, but the proposed stop rule fails on `Beton AG` and `Nordlicht` (lexicon and splittable). New rule: skip line words, then take one name token (6.6, 15.7); checked on all 14 listed fixtures. |
| 20 | Org morph cuts read as other words | A | Org tokens not split; org rungs equal to another class or a stop word removed; full name up to 10 chars (6.6). |
| 21 | DP prefers known + unknown | P | Two passes: known parts only, then one unknown modifier (5+ chars) + known head. Weak heads are allowed as head (else `Analyseplattform` gives no concept), which the review did not allow (7.2). |
| 22 | `WEAK_HEADS` and weak list differ | A | `WEAK_HEADS` = union of list, weak words, domain words (7.1). |
| 23 | All-weak compounds, `ersatz` modifier | A | All-weak/domain compound becomes a domain word; `ersatzteil` entry, `ersatz` removed from modifiers (7.3, 15.3). |
| 24 | All abbreviations cost 0 | A | Cost 15 per list index, +40 per cryptic segment, `known` list, `consistentRungs` option (11.1, 15.1). |
| 25 | Bodies of L-1, L-2 impossible in exact mode | P | Option (b) in modified form: body is exactly L or takes a tail, and no pad-only rungs. Always reserving a tail was rejected (it kills `strom-rv-nord-26`); 1-char pads (c) rejected (look like typos). Q1 stays open for the PO (12.1). |
| 26 | Zero-pad rungs | P | Zero-pad rungs removed. Rejected "keep `2026` only if all siblings use it": siblings are unknown at generation time; `consistentRungs` covers the need (11.1, 11.5). |
| 27 | Fit size at `maxSegments` 6 | A | `maxSegments` 1..5 and an exact lower-bound cut; worst-case gate (12, Q12). |
| 28 | Phase 1 takes any free candidate | A | Best body first, then `findByBody` diff and boost; Q6 tightened (13.4, 19.6). |
| 29 | Re-pick drops info for identical titles | A | Empty diff keeps the body; new gate Q14 (13.4, 19.6). |
| 30 | Output depends on store methods | P | Same order for all tiers (keep body, add tail; re-pick only in tier C). Full independence is not possible (counts change the tail length and start index), so output is defined per tier and reported in `storeTier`; parity properties for identical titles and collision-free titles (13.3, 19.3). |
| 31 | Hashed stems compared with plain keys | A | `storedStem` applied once in `analyze()`; all requests and compares use stored forms (8.2, 13.3). |
| 32 | Stored stems depend on the lexicon | A | Stored stems are lexicon-free stems of tokens and parts; concepts map at read time (8.2). |
| 33 | Blocklist golden rule impossible for sequential goldens | A | Rule applies to independent goldens; sequential goldens may cascade (14.2). |
| 34 | Prisma adapter makes too many queries; conflict misreport | A | `groupBy`, optional `queryRaw` for df, `exists` re-check after `count === 0` (17.2). |
| 35 | Leet tails pass | A | Tail check against all list words of 3+ chars, with `v->u` fold (9.1, 9.2 B5). |
| 36 | Tail checks undefined | A | One definition each for B5 and B7; `sa` now in `TAIL_BLOCK` (9.1, 9.2). |
| 37 | I8 only per segment | A | With separator `''`, I8 on the joined body (2.3, 9.2). |
| 38 | `strict` alphabet goal not stated | A | Goal stated (phone and print); new Crockford-like set without rhyming letters (2.2). |
| 39 | Opaque/hashed without secret confirm guesses | A | `secret` required for `opaque` and `hashed`; answers Q8 (13.6, 16.2). |
| 40 | Person names leak | A | First-name list rule, `denyTokens` documented, fixtures added (6.6, 15.8, 19.7). |
| 41 | Same title same ID in every tenant | P | README recommends a per-tenant `secret` (16.2). `hashScope` option rejected: a per-tenant secret does the same with no new option. |
| 42 | tsdown exports format vs hand map | A | tsdown owns `exports`, `main`, `module`, `types`; hand map removed; publint/attw validate (18.3). |
| 43 | Build output risks | A | Separate clean step, `fixedExtension: false` for the CLI, smoke runs the bin, Pages copies all of `dist/` (18.3, 18.6, 19.5). |
| 44 | Browser and runtime gaps | A | Own UTF-8 encoder, SipHash on 32-bit halves, Playwright browser job (3 engines), `normalize` feature check (4.1, 13.1, 18.4, 19.5). |
| 45 | `dist` grep false positives | A | `node:vm` sandbox test plus Biome identifier rules (14.1). |
| 46 | Packaging items | A | `devEngines`, `.nvmrc`, `erasableSyntaxOnly`, release gated on CI with tests, `sourcesContent`, CHECK generated from separator (17.3, 18.2 to 18.5). |
| J1 | No expected outputs in fixtures | A | Optional `expect` field and `expect.test.ts`, gate Q15 (19.7). |
| J2 | No near-duplicate or same-supplier links | A | `near` and `org` fields; Q6, Q14, Q16 use them (19.6, 19.7). |
| J3 | Missing fixture kinds | A | New synthetic fixtures t408 onward for persons, floors, Roman numerals, umlaut plurals, money, adjectives, direction-word orgs, code runs, phone/IBAN (19.7). |

Changes found while recomputing section 20 (not in the review): pass 2 allows weak heads (t384); content line words stay as concepts at -50 (t388, t059); org full name up to 10 chars and stop-word org rungs removed (t063); place markers re-class only proper-noun candidates (t390); an abbr equal to a compound part is plain (t018, t030); building-type places get prior common (t007, Q11); `dach`, `us`, `eu` regions only in upper case; `gaa`, `pgk` added to the known list; the tail start index and tail length are counted again on the final body, so tiers agree for identical titles and the load rule holds after a refit (13.4).
