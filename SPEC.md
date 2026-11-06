# semantic-slugger: implementation spec v1

Status: rev 3.1, final for build, 2026-11-06. Owner: lead architect.
Inputs: rev 2 of this spec, the product owner (PO) change request "super generic slugger" (2026-11-06), the new multi-domain fixture corpus `test/fixtures/titles.json`, the M0+M1 code in `src/` (commit `aa18096`), and the review of rev 3 (decisions in Appendix B).

This spec is the only source of truth for the build. Where it says MUST, tests check it. Where it says "guidance", the value is a target for review, not an exact expectation.

**Public repo rule.** Use only synthetic titles and invented names. Never use real customer, patient, employee or contract data, or data from internal tools, in code, tests, docs, issues or the playground.

---

## Rev 3 changes

The PO asked for a generic library. It takes any title or short text from any field (blog posts, news, products, tickets, issues, meetings, recipes, research, events, legal, HR, medical, education, software, procurement, ...) and makes a short, readable, unique ID. qado (a procurement company) uses it, and so can anyone else. Procurement is one field among many. Domain knowledge comes from the user through generic config, not from the core.

### Removed

| What (rev 2) | Sections (rev 3) | Why |
|---|---|---|
| Org rule: walk left from a legal form, line words, `LINE_SUFFIXES`, class `org`, org rungs, org slot Q, weight -50 for line words | 2.1, 6.6, 10.1, 11.1, 15.9 | Supplier names next to a legal form are a procurement pattern. Rev 3 has one neutral class `name` (6.6) for company, product, project, place and person names, found by generic signals. Names stay allowed in the ID (PO: "supplier names are okay"). |
| Person rule: `persontitle` drops the next tokens, the `FIRST_NAMES` list, the option `dropPersonNames` | 5.2, 6.6, 15.9, 16.2 | A first-name list is culture-bound and also drops product and place names. Users drop names with `denyTokens` or use `leak: 'minimal'`. Person titles (`Dr`, `Herr`, `Mr`) are now plain stop words. |
| Classes `doctype`, `action`, `activity` and slot D | 2.1, 5.2, 10.1, 15 | They encode procurement document types and process steps. Rev 3 has three slots T, Q, N. A user says "this word matters less" with lexicon `weight` or `weak`. |
| Procurement lexicon (rev 2 15.2 to 15.4: Rahmenvertrag, Leistungsverzeichnis, BANF, LkSG, MSA, RFQ, ...) and the procurement list of known abbreviations | 15 | Domain knowledge. Replaced by a generic starting lexicon (15.3 to 15.6). |
| City and Kfz-code table, building-type places, floor codes (`eg og ug kg`), place-marker words (`Standort`, `Werk`, `Niederlassung`, `site`, `plant`, ...) and their re-class rule | 6.3, 10.1, 15.9 | German procurement data. The class `place` stays for user lexicon entries; there are no built-in places. |
| Procurement compound parts and weak heads (`lieferung`, `vertrag`, `leistung`, `beschaffung`, ...) | 7.1, 15.7 | Replaced by a generic DE compound-part list (15.7) and generic weak heads (7.1). |
| Procurement domain stop words (`vertrag`, `contract`, `agreement`, ...) and the procurement weak list (`beschaffung`, `supplier`, `standort`, ...) | 6.3 | Replaced by generic noise words (file and mail words, 6.3) and generic weak words (`report`, `update`, `bericht`, `entwurf`, ..., 15.6). |
| Procurement markers (`los`, `nachtrag`, `amendment`, `sow`, `change order`, `change request`, `bauabschnitt`, `anlage`, `werk`, `plant`, `verhandlungsrunde`) | 5.3 | Replaced by generic markers (`teil/part`, `kapitel/chapter`, `folge/episode`, `sprint`, ...). Users add their own markers as lexicon entries of class `marker` (5.3). |
| Payment-term noise pattern (`Net 60`, `30 Tage netto`) | 4.3 step 9 | Procurement only. |
| Options `domainStopWords`, `weakWords`, `dropPersonNames` | 16.2 | Replaced by `stopWords`, lexicon `weak: true` and `denyTokens`. Fewer options, one place for domain knowledge. |
| `leak: 'minimal'` rule "drop all org concepts" | 6.6, 10.4 | `minimal` now drops the generic classes `name`, `attr`, `code`, `marker`, `version`, `longnum`, `quantity` (rev 3.1: also `model`; acronyms are kept) (10.4). |
| Gate Q16 (org consistency) and the fixture field `org` | 19.6, 19.7 | No org class. |
| Normative references to fixture ids of the rev 2 corpus | 19, 20 | The corpus is new and multi-domain. Tests find fixtures by `group`, `near` and `expect`. Section 20 uses illustrative titles. |

### Added

| What | Sections | Why |
|---|---|---|
| Class `name`: proper nouns and product names | 6.6, 10 | A strong discriminator in every field. Found only by positive signals (inner capitals, directly before a legal form, capitalized inside a sentence-case EN title, user lexicon). Rev 3.1 moved all-caps words to the new class `acronym` (6.6). |
| Classes `month` and `version` | 5.2, 5.4 | Months and versions are common in titles of many fields (newsletters, minutes, release notes, documents). |
| Generic starting lexicon (about 250 entries in rev 3.1, about 400 at 1.0), generic known abbreviations, generic weak words | 15 | Domain-neutral defaults. |
| Generic DE compound-part list (240 parts in rev 3.1) | 15.7 | Everyday, business and tech words. |
| `LanguagePack` interface and option `languagePacks` (experimental) | 6.7, 16.2 | Others can add languages. `de` and `en` are built-in packs with the same interface. |
| Lexicon class `marker`, lexicon flag `upperOnly` | 5.3, 15.1 | Users add markers (`Los`, `Lot`, `Ticket`) and case-bound abbreviations (`IT`, `EU`) without code. |
| One concept per compound with 2+ strong parts, with morph and head rungs | 7.3, 11.1 | With generic everyday parts most German compounds split. Rev 2 made one concept per part, which filled the pool with parts and pushed out directions and years. |
| Fit tie-break by rung cost in rank order | 12 | With equal cost, the higher-ranked concept keeps its better form (`firefox-rel-v132`, not `fir-release-v132`). |
| Domain-balance gate Q18 | 19.6 | No field may be left behind. |
| Domain recipes in the README (not shipped) | 15.8 | Shows how a field adds its own words, with procurement as one example. |
| Section 23 "Rev 3 impact on M0-M1 code" | 23 | M0 and M1 are already built and committed. |

### Kept as in rev 2

ID format and invariants (2), normalization except the payment-term step (4), the compound DP (7.2), stemming and stored stems (8), bad words (9), graphemes, cuts and skeletons (11.2 to 11.4), the fit search (12), tail hash, store tiers, resolve and `createUnique` (13), determinism and versioning (14), result, errors and adapters (16.3 to 17), packaging and tooling (18.2 to 18.6). Rev 2 decisions in Appendix A stay valid unless marked obsolete.

### Rev 3.1 changes (review of rev 3)

The review of rev 3 found gaps in the corpus, in ranking for non-procurement titles, in section 20 and in some gates. Appendix B lists each issue with the decision. The main changes:

| What | Sections |
|---|---|
| Fixture fields: `near` holds only fixture ids; the old labels move to `vary`; new fields `keep` and `skip`; corpus fixes in M1.5 | 19.7, 23 |
| New gate Q19 (expected words kept, per domain); Q2 and Q4 report only (Q4 until M4); Q6 defined on canonical titles | 19.6 |
| New classes `acronym` (slot T), `qualifier` (slot Q), `weekday` and `model` (slot N) | 5.2, 5.4, 6.6, 10, 15 |
| Lexicon lookup step 0 for upper-case known abbreviations (`SEO`, `HR`, `KPI`) | 4.4 |
| More generic markers (`variante`, `größe`, `klasse`, `typ`, `artikel`, `§`, ...), number words, model numbers (`Phone 8` -> `phone8`), decimal versions, quantities in the pool, historic years, wide ranges | 5 |
| More function words; number words; doc-kind words with `weight: -60`; DE/EN pairs for weak words | 6.3, 15.6 |
| Compounds: morph and head rungs are cryptic; direction and region modifiers become own concepts; hyphen rule in every language | 7.3, 11.1 |
| Decreasing position bonus for all T concepts; topic-to-marker merge | 8.1, 10.3 |
| Language detection: ASCII umlaut digraphs, parts hits, compound hint at 8+ chars, plural fold for `und` | 6.1, 8.2 |
| Attr suffixes only in lower case, no `-schaft`; code runs need a digit or all upper case | 5.1, 6.4 |
| Data: duplicate keys removed, jargon abbreviations made cryptic, procurement-leaning parts removed, counts corrected | 15 |
| Section 20 rows checked against I1 and recomputed | 20 |

### Rules for domain knowledge from rev 3 on

1. The core ships only knowledge that helps in most fields: language (stop words, number words, stemming, compounds, transliteration), numbers and time (years, months, weekdays, versions, generic markers), directions and regions, generic qualifiers (15.5), generic document words (15.6), widely known cross-domain abbreviations, and bad words.
2. A built-in lexicon entry must pass the cross-domain test of 15.2.
3. Domain knowledge (procurement, medicine, law, ...) is user config: `lexicon`, `stopWords`, `denyTokens`, `reserved`, and `languagePacks` for new languages. The library ships no domain packs. The README shows short recipes for three fields (15.8).

---

## 0. How the three proposals were merged

Rev 2 history, kept for reference. The three proposals mostly fit together. Readability gives the language pipeline and the fit search. API gives the developer surface and packaging. Correctness gives the tail, the store contract, the collision order and versioning. These conflicts were decided as follows:

| # | Conflict | Decision | Why |
|---|---|---|---|
| C1 | Default `lengthMode`: `exact` (API, correctness) vs `max` (readability) | `exact`, length 16. `max` is a documented "readable" preset. Rev 2: no rung exists only to pad (section 12.1). | The product owner (PO) asked for a fixed length. Open question Q1 stays. |
| C2 | Tail always present (correctness) vs only when needed (readability, API) | Tail only when needed: for padding in exact mode, or for a collision. | Fewer codes means better readability. The fit search spends length on words first. |
| C3 | Hash: cyrb53 (readability, API) vs SipHash-2-4 (correctness) | SipHash-2-4, keyed, pure JS on 32-bit halves (no BigInt). | Published test vectors (ports to Python/Go can be checked). It cannot be inverted the way FNV or cyrb53 can, which matters for `secret` and opaque IDs. |
| C4 | Scope in the hash (correctness) vs not (API) | Not in the hash. Use `secret` per tenant if needed (README recommends it for multi-tenant use). | A client-side preview without the scope then matches the server for the empty-store case. Scopes are separate anyway. |
| C5 | Duplicate spreading: attempt counter (readability) vs `dupIndex = countBody(body)` (correctness) | One tail index `k`. It starts at `countBody(body)` when the store can count, else at 0, and walks up. | O(1) for the n-th duplicate. For identical titles both paths reach the same ID. |
| C6 | Smart re-pick source: `titleOf` (readability) vs `findByBody` returning stems (correctness) | `findByBody` with stems. Rev 2: stored stems do not depend on the lexicon (8.2). | No need to store or re-analyze titles. Works with hashed stems. Lexicon edits do not break old rows. |
| C7 | Segment order: slot order (readability) vs rank order with anchor (correctness, API) | Slot order T, D, Q, N (rev 3: T, Q, N; slot D removed). Inside a slot: title position. | Same shape for all IDs, related IDs sort together, easier to remember. Sibling IDs do not swap segments when scores change. |
| C8 | Scores: floats (readability, API) vs fixed-point integers (correctness) | Integers in "centi" units (x100), integer log table. | Bit-identical results in every engine. |
| C9 | Leak levels: `full/normal/minimal/opaque` vs `full/topic/none` vs `normal/minimal/opaque` | `normal` (default), `minimal`, `opaque`. | `full` was the same as `normal`. Three levels are enough. |
| C10 | Fallback word: `doc` vs `item` vs lead letter `n` | `doc`. Numbers-only titles become `doc-2026-...`. | Reads as a word. Keeps "first char is a letter". |
| C11 | Store-required methods: `exists` only (API) vs `exists + countBody` (correctness) | Only `exists` is required. All others optional. Shipped adapters implement all. Rev 2: output is defined per capability tier (13.3). | A custom adapter can be 5 lines. Quality features turn on when methods exist. |
| C12 | API names: `slug/generate/createWithSlug` vs `slugify/generate/create` vs `suggest/generate/createUnique` | `slug()` (string), `suggest()` (sync result), `generate()` (async), `createUnique()` (insert + retry), `explain()`, `analyze()`. | Each name says what it does. `slugify` is avoided because it reads like the plain transliteration libs. |
| C13 | Subpath names: `./memory` vs `./adapters/memory` | `./adapters/memory`, `./adapters/prisma`, `./adapters/sql`, `./data`. | Clear grouping. |
| C14 | Data source format: `.txt` plus generator (API) vs TS files (others) | TS files with `as const` in `src/data/v1/`. No generator. | Fewer moving parts. The diff is still readable. |
| C15 | Playground: Vite (readability, correctness) vs no bundler (API) | No bundler. Static HTML + `app.js` that imports `dist/`. | Zero extra dev deps. |
| C16 | Long numbers (order, invoice, case numbers): last 4 digits (readability) vs drop at 9+ digits (correctness) | Last 4 digits in `normal`, low score, so they only show when budget is left. Dropped in `minimal`. | Recognizable when space allows, low leak. |
| C17 | Engines: `>=20` vs `>=22` | `>=22`. | Node 20 is EOL. vitest 5 needs 22.12+. |
| C18 | Custom list options: array or function (API) vs `{add, remove}` (readability) | `{ add?, remove? }` or a function `(defaults) => list`. | Covers both needs. |
| C19 | Re-pick candidate count and plan steps P0 to P5 (correctness) vs exhaustive fit sorted by cost (readability) | The fit search is the plan generator. Re-pick re-runs the fit with a diff boost. | One mechanism, deterministic, easy to explain. |
| C20 | Separator and double-click | Default `-`. Options `_` and `''`. | The charset rule and double-click conflict. Open question Q2 for the PO. |

---

## 1. Goals and non-goals

### Goals

1. Turn a title or short text from any field (German, English or mixed) into a short ID that a person can read, guess the topic from and say on the phone. Examples: `Jahresbericht Vertrieb Nord 2026` gives `vertrieb-nord-26`, `Q3 2026 Marketing Budget Review` gives `mktg-budget-26q3`, `Chocolate Cake Recipe` gives `choc-cake-recipe`.
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
12. Domain-neutral core. No field gets special rules. Domain knowledge comes through generic config (`lexicon`, `stopWords`, `denyTokens`, `reserved`, `languagePacks`).

### Non-goals (v1)

- Built-in languages other than de and en. Other languages come through `languagePacks` (6.7, experimental). Non-Latin scripts beyond a small Cyrillic/Greek table need the `transliterate` hook or a pack.
- Built-in domain packs (procurement, medical, legal, ...). The README has short recipes instead (15.8).
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
body = seg ( <sep> seg ){0..3}         1 to maxSegments semantic segments, slot order T Q N
tail = C A{t-1}                        C = consonant letter, A = tail alphabet, t >= tMin (2)
```

Examples (length 16, exact):

```
vertrieb-nord-26        body only (16)
ver-nord-2026-k3        body 13 + sep + tail 2
doc-k7q9m3xdt2hz        empty title: fallback word + tail 12
x7kq2m9dbt3hc8wp        leak 'opaque' (needs `secret`): tail only, 16
```

Rev 3 replaced the rev 2 opaque example `x7kq2m9dbn4hc8wt`, which cannot occur (B5 folds `n4h` to `nah`, which holds the blocked code `ah`; see `docs/DEVIATIONS.md` entry 10).

Slots:

| Slot | Concept classes | Typical length |
|---|---|---|
| T topic | `topic`, `name`, `acronym`, `attr` | 3 to 10 |
| Q qualifier | `qualifier`, `place`, `direction`, `region`, `code` | 2 to 8 |
| N number/time | `year`, `range`, `quarter`, `month`, `week`, `weekday`, `version`, `marker`, `model`, `longnum`, `quantity` | 2 to 9 |

A `model` number is always joined to its word (5.2), so its segment sits in slot T at the word's position. A wide `range` rung fills two segments (11.5).

Rev 2 had a fourth slot D (`doctype`, `action`, `activity`). Rev 3 removes it: those words are now plain `topic` concepts in slot T, ordered by title position like every other topic. Score decides only which concepts go into the body. Within a slot, segments are ordered by first title position asc, then key asc (code-unit compare). So sibling IDs keep the same segment order when df changes scores. If the first segment of the body starts with a digit, the fallback word is prepended as an extra T segment (and counts against `maxSegments`; if that overflows, the lowest-score N segment is dropped).

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
                    month, week, weekday, version, marker+num, model, longnum, code, quantity,
                    smallnum, noise; deny tokens dropped right after tokenizing (6.6)
 3 detect language  pack code (de | en | user pack) or und, plus per-token language
                    (translit tokens are always und)
 4 phrase match     multi-word lexicon entries ("machine learning" -> ml)
 5 stop words       function, conflict, number words, noise, legal forms (removed);
                    weak and attr marked; back-off
 6 names            name signals (inner caps, before a legal form, sentence case, lexicon) and
                    acronyms (all caps)
 7 compound split   DP over lexicon parts with linkers, head/modifier roles (packs with compound
                    data only; built in: de)
 8 concepts + stems concept per lexicon hit / head; lexicon-free stems (pack stemmer) for storage
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
- `cased` keeps the pre-lowercase text. The tokenizer applies the same split to it, so each token gets a case flag `upper | title | lower | mixed`. If the token counts differ (rare NFKC or `ẞ` effects), all flags are `unknown`. Case flags are only signals for language, attr, name, month and legal-form rules. They never change the canonical title.

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
| 6 | protected spans | ranges, `fy`, weeks, years, versions, longnum (5.1 rules) | detected and masked so steps 7 to 9 cannot touch them. Masks are private-use chars, restored before tokenizing |
| 7 | money | `\d[\d.,]{0,20}\s?(?:€\|eur\|euro\|usd\|\$\|chf\|gbp\|£\|tsd\|mio\|mrd\|k€)E` and the reverse order `(?:€\|eur\|usd\|\$\|chf\|gbp\|£)\s?\d[\d.,]{0,20}E` | |
| 8 | percent | `\d{1,6}(?:[.,]\d{1,4})?\s?%` | |
| 9 | (removed in rev 3) | - | the payment-term pattern (`Net 60`, `30 Tage netto`) was procurement only; such words now go through the normal rules |

Tested (rev 3.1 neutral strings): `1000012345`, `2025 2026 2027`, `kw 12 2026 2027 2028`, `2026 / 2027 / 2028`, `kw12 2026 2027 2028`, `01/02/2026` and `Teil 01 2026 2027` are not removed. `budget 500 € 2026`, `+49 89 1234567`, `089/12345678` and `DE89 3704 0044 0532 0130 00` are removed.

All regexes MUST be linear (no nested quantifiers, every repeat bounded). One harness (`test/unit/redos.test.ts`) runs every regex in `src/` (noise, dates, tokens, markers, months, versions) against a fixed set of 4096-char adversarial strings (`"a@" x 2048`, `"@" x 4096`, `"1 " x 2048`, `"0/1" x 1365`, `"de12" + " aaaa" x 1000`, `"1." x 2048 + "x"`, `"www." + "a" x 4092`, and more) and asserts < 50 ms per regex and input. A lint test fails if a regex in `src/` is not registered in the harness.

### 4.4 Three forms per token

| Form | Use | "Kindergärten" | "Muenchen" | "Straße" |
|---|---|---|---|---|
| `surface` | lexicon lookup (after fold), stemmer input, language hints | `kindergärten` | `muenchen` | `straße` |
| `ascii` | display and rungs | `kindergaerten` | `muenchen` | `strasse` |
| `fold` | key fold for stemming (pack `keyFold`; de tokens) | `kindergarten` | `munchen` | `strasse` |

`keyFold(w)`: `ä|ae -> a`, `ö|oe -> o`, `ü|ue -> u`, `ß -> ss`, except `ae/oe/ue` directly after a vowel or `q` stays (`steuer`, `feuer`, `quelle`, `neue`). The fold is only used for keys, so rare wrong folds (`aktuell -> aktull`) are harmless.

Lexicon lookup uses `ascii`. All lexicon keys and forms are stored in ascii form.

Lookup order for a single token or compound part:
0. **Upper-case known abbreviation** (rev 3.1). A token whose raw case is `upper` (2 to 6 letters, optionally followed by a lower-case `s`: `KPIs`, `APIs`), whose ascii (without that `s`) equals a `known` abbr of an entry, maps to that entry (`SEO` -> search engine optimization, `HR` -> the `hr` group, `KPI`, `AI`, `ML`, `UX`, `QA`, `ROI`, `PR`, `POC`). When several entries list the abbr, the first entry in data order whose `lang` equals the per-token or title language wins, else the first entry in data order (`PR` is `oeffentlichkeitsarbeit` in a `de` title, `pull request` in an `en` title; the display is `pr` either way).
1. Exact `ascii` match on key or form. Entries whose case condition fails (`upperOnly`, `lowerOnly`, 15.1) are skipped; of the rest, the first in data order wins.
2. Stem match. Not for entries of class `direction` (rev 3.1: `Rights` must not match `right`). The lexicon map is also indexed by `stem(keyFold(form))` for every key and form, built at first use, with the entry's language stemmer (`de` CISTEM, `en` Porter2, a user pack its `stem`, `*` all enabled). A token matches when `stem(keyFold(token))` equals an indexed stem of the same language. Only for tokens of 5+ chars. This finds `umzuege` (umzug), `kaesten` (kasten), `besprechungen`, `haeuser` (haus), so "Besprechung X" and "Besprechungen X" give the same concept and the same rungs. User packs (6.7) use their own `stem` and `keyFold`.
3. If two entries share a stem, the earlier entry in data order wins. A unit test lists all stem clashes in the v1 data, and the list must be empty or explicitly allowed.

---

## 5. Tokenization (step 2)

### 5.1 Split

1. Before splitting, detect on the normalized surface (in this order). Dates, ranges, `fy`, weeks, years, versions and longnum are the protected spans of 4.3 (steps 4 and 6), so noise removal never eats them:
   - dates `\d{1,2}[./]\d{1,2}[./](\d{4}|\d{2})` with Unicode edges -> `year` token (2-digit years mean 20xx). The month of a date is not used (a date is not a month mention).
   - ranges `\b((?:19|20)\d{2})\s*[/\u2013\u2014-]\s*((?:19|20)?\d{2})\b` -> `range` token (`2025/2026`, `2025/26`, `2026–2028`)
   - `fy\s?(\d{2}|\d{4})` -> `year` with fy flag
   - weeks `(kw|cw|week|wk)\s?\d{1,2}`, years `(19|20)\d\d` and historic years `1[5-8]\d\d` (5.4), longnum `\d{5,}` (classes in 5.2)
   - quantities (5.2): a number, also a decimal (`1,7 Liter`, `2.5 kg`), followed by a unit. Rev 3.1: this runs before the decimal rule, so a decimal quantity is not noise and its unit word does not become a topic
   - versions (5.4), including decimal versions in a version position, before decimals
   - decimals `\d+[.,]\d+` that are not part of a quantity or a version -> `noise` (`42,5`, `2,0`)
1b. **Code runs.** On the `cased` text, a run of chars from `[A-Za-z0-9()/.-]` without spaces, or several such runs joined by `/`, that contains at least one uppercase letter, also a `-`, a `/` or a `(`, or a digit, and (rev 3.1) either a digit or only upper-case letters, becomes one `code` token. Its text is the run with all non-alphanumerics removed, lowercased (`PROJ-1234` -> `proj1234`, `COVID-19` -> `covid19`, `TCP/IP` -> `tcpip`, `USB-C` -> `usbc`, `SKU-4471` -> `sku4471`). `A/B-Test`, `Input/Output` and `Report(Final)` are not code runs (lower-case letters and no digit); they split into words by step 2. A run also ends at a hyphen that is followed by a word of 4+ letters with lower-case letters (`B2B-Marketing` -> code `b2b` + word `marketing`, `COVID-19-Impfung` -> `covid19` + `impfung`). Dotted legal forms (`e.K.`, `Co.`), protected spans (4.3), and runs that alone match `quarter`, `week`, `fy`, `version` or a marker form (`Q1`, `KW12`, `FY26`, `v2`, `Ep3`) are not code runs. An all-caps token of 3 letters or fewer directly before or after a code run joins it (`SKU A-4471` -> one token `skua4471`).
2. Split on any char not in `[\p{L}\p{N}-]`. Also split on `-` when it has a space or the string edge on either side, and on `\u2013` and `\u2014` always. Exception: `§` and `§§` directly before a number are kept as a marker word (5.3).
3. An inner hyphen between letters or digits marks an explicit compound boundary. Keep the token, record parts (`e-mail-vorlage` -> parts `e|mail|vorlage`). Rev 3.1: this holds in every language, also for `und` tokens (`Gluten-Free` -> parts `gluten|free`), because the hyphen is typed by the user. Parts of one letter are dropped (`B-Test` -> `test`).
4. Lexicon check for hyphenated tokens: first the joined form (`e-mail` -> `email`, `e-learning` -> `elearning`), then phrase match over the parts, then the parts as a compound (7.3: one concept when two or more strong parts are left; in a language without compound data the parts are not split further).
4b. **Number words** (rev 3.1). Each pack lists number words (`numberWords`, 6.7). Built in: `de` `eins zwei drei vier fuenf sechs sieben acht neun zehn elf zwoelf` and the ordinals `erst zweit dritt viert fuenft sechst siebt acht neunt zehnt elft zwoelft` with the endings `e er es en em`; `en` `one two three four five six seven eight nine ten eleven twelve first second third fourth fifth sixth seventh eighth ninth tenth eleventh twelfth`. The words `ein eine` are function words, not number words. A number word directly after a marker word is the marker's number (`Teil Zwei` -> `pt2`, `Part One` -> `pt1`). Everywhere else it is handled like `smallnum` (dropped), but only in titles of its language, like a conflict word (6.3), so `Elf on the Shelf` keeps `elf`. Phrases match before this step (`Erste Hilfe` -> `eh`).
4c. **Model numbers** (rev 3.1). A bare number `\d{1,3}` (not a year, marker, quantity or other class) that directly follows a "model position" token becomes class `model`. A model position is a `name` or `acronym` token (6.6), or, in a title whose pack does not set `nounsCapitalized`, a capitalized word token without a lexicon entry (`Tavora Phone 8` -> `phone` + `8`, `Brightwave Pro 14`, `History 101`, `Top 10`). In `de` titles only names and acronyms are model positions, because all nouns are capitalized. The same position makes a decimal a version (5.4). Stop words between the two break the link.
5. Each token records `case` (4.1), `translit: true` if any char came from a transliteration table or the user hook, and `lang` (6.1).

### 5.2 Classes

| Class | Detection (on ascii) | Display rungs | Base score |
|---|---|---|---|
| `year` | `(19\|20)\d\d`, date, `fy..`; historic `1[5-8]\d\d` (5.4) | `26`, `2026` (cost 30); fy: `fy26`; historic: `1789` only (cost 0) | 160 |
| `range` | see 5.1 | span up to 9 years in one century: `2526`, `2628`; wider: two segments `1950-2020` (11.5) | 160 |
| `quarter` | `q[1-4]` | `q1`. With a year in the chosen set: bonded into `26q1` | 140 |
| `month` | month word of the token language (5.4) | `mar` / `mrz`. With a year in the chosen set: bonded into `26mar` / `26mrz` | 140 |
| `week` | `(kw\|cw\|week\|wk)\s?\d{1,2}` | `kw12` (de), `wk22` (en and other packs, unless the pack sets `weekPrefix`) | 140 |
| `weekday` | weekday word of the token language (5.4) | `fri` (en), `freitag` (de) | 100 |
| `version` | 5.4 | `v2`, `v24` | 120 |
| `marker` | marker word (5.3, built-in or lexicon class `marker`) + optional `nr/no/#` + `\d{1,3}`, a number word (5.1 step 4b), one letter `[a-z]`, or a Roman numeral `i..x` in upper case (`Phase II` -> `ph2`); markers that take a size also take `xs xl xxl xxxl`; `klasse/class/grade` also take `\d{1,2}[a-z]` (`Klasse 4b`); also `#` + `\d{1,6}` (`#4521` -> `nr4521`) | `pt1`, `pta`, `nr4521` (no zero-pad rung) | 180 |
| `model` | 5.1 step 4c: `\d{1,3}` after a model position | only joined with its word: `phone8`, `pro14`, `hist101` (11.5) | 120 |
| `longnum` | `\d{5,}` | last 4 digits | 120 |
| `code` | a code run (5.1 step 1b), mixed letters and digits (`s3`, `a4`, `covid19`), or a standard prefix (`din en iso iec ieee rfc`) followed by a number | joined text (`iso9001` is 7, `rfc9110`, `proj1234`) only if 8 chars or less and it has a digit or comes from an all-caps code run (`usbc`), else noise | 100 |
| `quantity` | number (integer or decimal) followed by a unit (table below) | integer: number + unit short form (`50mw`, `128gb`, `85m2`); decimal: no rung (key and stored stem only) | 50 (pool score 125, 10.4) |
| `smallnum` | bare `\d{1,4}` not covered above; number words outside markers (5.1 step 4b) | dropped | - |
| `noise` | single letter not after a marker; ordinal `\d+(st\|nd\|rd\|th)`; decimals; `am`/`pm` directly after a number 1 to 12 (`2 PM`, `9am` split as `9 am`); tokens mixing `[01]` with `[oli]` that are not lexicon codes; Roman numerals 1 to 39 (`^x{0,3}(?:ix\|iv\|v?i{0,3})$`, not empty) written in upper case, not a lexicon word and not after a marker word (`II`, `IV`, `XII`); tokens of 3 chars or less made only of `[ilo]` that are not lexicon words (`ii`, `ll`, `lo`) | dropped | - |
| `word` | everything else with 2+ letters | section 11 | by class (10.1) |

Units (first form of a row is the display short form; all ascii, after NFKC so `m²` is `m2`):

```
t tonne tonnen | kg kilo | g gramm gram grams | mg | km | m meter metre meters metres | cm | mm
m2 qm sqm | m3 | l liter litre liters litres ltr | ml | w watt | kw | kwh | mw | mwh | v volt
mah | gb | mb | tb | kb | ghz | mhz | px | h std stunde stunden hour hours hrs
min minute minuten minutes mins | d tag tage tagen day days | wk woche wochen week weeks
mo monat monate monaten month months | yr jahr jahre jahren year years
pcs stk stueck pieces pc units | inch zoll
```

A unit word counts only directly after the number (`50 kg`, `85 m²`, `30 Minuten`). Rungs that break I8 are removed as usual (`10l` has the pair `0l`).

Rev 3 changes in this table: `orgsuffix` is gone (legal forms are stop words, 6.3), `persontitle` is gone (person titles are function stop words and do not drop the next tokens), payment terms are gone (4.3), the norm prefixes are generic standards, the code display limit is 8 chars (rev 2: 6) so ticket keys like `proj1234` show, and `month` and `version` are new. Rev 3.1: `weekday` and `model` are new, quantities enter the pool, historic years and wide ranges have rungs, `am`/`pm` after a time are noise, number words are handled.

Keys: year `y2026`, range `r2025-2026`, quarter `q1`, month `m03` (language-independent, so `März` and `March` merge), week `kw12`, weekday `wd5` (1 = Monday, language-independent), version `v2.4`, marker `<prefix><value>` (`pt1`), model `d<digits>` (`d8`), longnum `n<digits>`, code `c<text>`, quantity `q<number><unit short form>` (`q128gb`, `q1.7l`; decimal comma becomes `.`).

### 5.3 Markers (v1 data)

The prefix must not create an I8 pair with the digits that follow. All prefixes below end in a safe letter (not `l`, `i` or `o`).

| Marker words | Prefix | Takes |
|---|---|---|
| `teil`, `part` | `pt` | number or letter |
| `kapitel`, `chapter` | `kap` (de), `ch` (en) | number |
| `abschnitt`, `section` | `abs` (de), `sect` (en) | number |
| `folge`, `episode`, `ep` | `ep` | number |
| `staffel`, `season` | `s` | number |
| `ausgabe`, `heft`, `issue`, `edition` | `nr` | number |
| `sprint` | `sprint` | number |
| `phase` | `ph` | number |
| `runde`, `round` | `rd` | number |
| `welle`, `wave` | `w` | number |
| `batch` | `b` | number |
| `stufe`, `level`, `tier` | `stf` (de), `lv` (en), `tier` | number |
| `lektion`, `lesson` | `ls` | number |
| `modul`, `module` | `mod` | number |
| `schritt`, `step` | `step` | number |
| `meilenstein`, `milestone` | `ms` | number |
| `gruppe`, `group` | `grp` | number or letter |
| `raum`, `room` | `rm` | number or letter |
| `halle`, `hall` | `h` | number or letter |
| `tag` (de), `day` (en) | `tag`, `day` | number |
| `variante`, `variant` (rev 3.1) | `var` | number or letter |
| `groesse`, `size` (rev 3.1) | `sz` | number, letter or size (`xs xl xxl xxxl`) |
| `klasse` (de), `class`, `grade` (en) (rev 3.1) | `kla` (de), `cls`, `gr` (en) | number, or `\d{1,2}[a-z]` |
| `einheit`, `unit` (rev 3.1) | `einh`, `unit` | number |
| `typ`, `type` (rev 3.1) | `typ` | number or letter |
| `modell`, `model` (rev 3.1) | `md` | number or letter |
| `option` (rev 3.1) | `opt` | number or letter |
| `artikel`, `art`, `article` (rev 3.1) | `art` | number |
| `absatz`, `abs` (rev 3.1) | `abs` | number |
| `§`, `§§` (rev 3.1) | `par` | number |
| `#` (no word) | `nr` | `\d{1,6}` |

Marker words count only when the number or letter follows (`Teil 2`, `Part B`, `Sprint 14`, `Größe M`, `Art. 28`). Without it they are normal words (`Teil` alone is a topic; `level` in `1st level` is noise, as in rev 2). A dot after the marker word is allowed (`Art. 28`, `Abs. 2`). A marker that reads `pt` + `1` (`pt1`) is fine: `t` next to `1`. Never generate `l1`, `o0`, `i1`. Rev 3.1 removed `Variante A` / `B`, `Größe M` / `L`, `Typ 2`, `Klasse 6`, `Unit 5` and `Art. 28` from the cases where the generic core lost the only difference between siblings.

**Topic-to-marker merge** (rev 3.1). When a topic concept has the same key as the marker word of a marker in the same title (as text or as a compound part), the topic merges into the marker concept (tf adds up): `Sprintplanung Sprint 22` gives one concept `sprint22`, not a topic `sprint` that pushes the number out.

**User markers.** A lexicon entry with `cls: 'marker'` (15.1) adds a marker word: its `key`, `forms` and `phrase` are the marker words, `abbr[0]` is the prefix, and it takes a number (`\d{1,3}`) or one letter. The prefix must match `^[a-z]{0,5}[a-hj-km-np-z]$` (ends in a letter other than `l i o`), else `ConfigError` reason `invalid-marker-prefix`. Example: `{ key: 'ticket', lang: '*', cls: 'marker', abbr: ['tkt'] }` gives `tkt42` for `Ticket 42`; the procurement recipe (15.8) adds `los`. Packs can add markers too (6.7).

### 5.4 Months and versions

**Months.** Built-in month words (ascii):

| m | de | en | display de / en |
|---|---|---|---|
| 01 | januar, jan | january, jan | `jan` / `jan` |
| 02 | februar, feb | february, feb | `feb` / `feb` |
| 03 | maerz, mrz | march, mar | `mrz` / `mar` |
| 04 | april, apr | april, apr | `apr` / `apr` |
| 05 | mai | may | `mai` / `may` |
| 06 | juni, jun | june, jun | `jun` / `jun` |
| 07 | juli, jul | july, jul | `jul` / `jul` |
| 08 | august, aug | august, aug | `aug` / `aug` |
| 09 | september, sep, sept | september, sep, sept | `sep` / `sep` |
| 10 | oktober, okt | october, oct | `okt` / `oct` |
| 11 | november, nov | november, nov | `nov` / `nov` |
| 12 | dezember, dez | december, dec | `dez` / `dec` |

- A month word counts as a month only when the raw token is capitalized (case flags known) or it stands directly next to a year or a day number (`3. März`, `March 2026`). Otherwise it is a normal word (`may` the verb, `march` the verb, `August` the first name at title start with no year).
- Display uses the per-token language. With a year concept in the same candidate, the two are bonded into one segment `<yy><mon>` (`26mrz`, `26mar`), like the quarter bond. Two different months in one title are two concepts; a month range (`März bis Mai`) is not special.
- Month words and weekday words are never `name` by sentence case (6.6 signal 4).

**Weekdays** (rev 3.1). Built-in weekday words (ascii), one row per day, row[0] is the display form:

| d | de | en |
|---|---|---|
| 1 | montag, montags | monday, mon |
| 2 | dienstag, dienstags | tuesday, tue, tues |
| 3 | mittwoch, mittwochs | wednesday, wed |
| 4 | donnerstag, donnerstags | thursday, thu, thur, thurs |
| 5 | freitag, freitags | friday, fri |
| 6 | samstag, samstags, sonnabend | saturday, sat |
| 7 | sonntag, sonntags | sunday, sun |

Rungs: `en` the 3-letter form (`fri`, plain, cost 0) and the full word; `de` the full word only (2-letter German forms are not used: `sa` is blocked, `so` and `do` read as other words). Short forms like `mon`, `sat`, `sun` count as weekdays only when the raw token is capitalized and stands next to a time, a date or another weekday; otherwise they are normal words. A weekday is a low-ranked time class (10.1): it shows when there is room and it separates siblings (`Team Lunch Friday` vs `Team Lunch Monday`).

**Historic years** (rev 3.1). A bare `1[5-8]\d\d` is a `year` with only the 4-digit rung (`Paris 1889` -> `1889`). There is no 2-digit form, because `89` reads as 1989.

**Versions.** A `version` token is one of:
- `v` + `\d{1,3}` + optional `[._]\d{1,3}` up to two times, with word edges (`v2`, `v2.4`, `v1.10.3`, `V3`);
- a version word (`version ver rev revision release rel` in en and de, the pack field `versionWords` in 6.7) followed by `\d{1,3}(?:\.\d{1,3}){0,2}` (`Version 2.4`, `Release 3`, `Rev. 2`). The version word is dropped; the number becomes the version;
- (rev 3.1) a decimal `\d{1,2}\.\d{1,2}(?:\.\d{1,3})?` with a dot (not a comma), not followed by a unit and not part of a date, directly after a token whose ascii contains a version word of 5+ chars (`Versionshinweise 5.1`, `Releaseplan 2.0`) or after a model position (5.1 step 4c: `Python 3.12` in an `en` title). Other decimals stay noise.

Display: `v` + major, plus minor if present, without the dot (`v2`, `v24`, `v1.10.3` -> `v110`). Patch levels are dropped. `v1.10` and `v11.0` both show `v110`; the full key differs, so the concept stays distinct and the tail separates a collision. The version word alone (no number) is a noise word (6.3), except `revision` and `release`, which are then normal words (`Interne Revision`, `Release Notes`).

---

## 6. Language, phrases, stop words, names (steps 3 to 6)

### 6.1 Language detection

Each enabled language pack (6.7) gives detection hints. The built-in packs:

| Pack | `chars` (+2 once per title) | `suffixes` (+1 per token) | `weakSuffixes` (+1 per token of 5+ chars, only when no other pack's `chars` occur) |
|---|---|---|---|
| `de` | `äöüß` | `ung keit heit schaft lich isch` | - |
| `en` | - | `tion ment ing ship ness ity` | `ed ers ies ly ware` |

Rev 2 also had `vertrag` and `vereinbarung` as DE suffixes; rev 3 removes them (procurement words).

Rev 3.1 adds three hints, because ASCII-folded German (`Sommerfest Gaertnerei Muenchen 2026`) and short titles were detected as `und`, which turned off compound splitting and stemming and broke Q8:
- **Digraphs** (pack hint `digraphs`; `de`: `ae oe ue`): +1 per token of 5+ chars that contains one of them after a consonant other than `q` and before a consonant, when no other pack's `chars` occur. Skipped for tokens that are an EN lexicon form, an EN stop word or an EN weekday, and for tokens that end in `ues` or `ued` (`issues`, `values`, `continued`). `muenchen`, `gaertnerei` count; `blue`, `queue`, `steuer` do not.
- **Parts hits**: a parts-only entry (15.7) of 6+ chars scores +1 for its language. Parts of 6+ chars that are also common English words have `lang: '*'` (15.7), so they give no score.
- **Compound hint**: the `splitCompound` hit counts from 8 chars (rev 3: 12).

```ts
function detect(tokens: Tok[], raw: string, cfg): DetectedLang {
  if (cfg.lang) return cfg.lang                                       // per-call override
  const hook = cfg.detectLanguage?.(normalizedSurface)
  if (hook !== undefined && cfg.languages.includes(hook)) return hook
  const score = new Map(cfg.packs.map(p => [p.code, 0]))             // packs in cfg.languages order
  const add = (code: string, n: number) => score.set(code, score.get(code)! + n)
  const charHit = cfg.packs.filter(p => p.hints.chars && [...p.hints.chars].some(ch => raw.toLowerCase().includes(ch)))
  for (const p of charHit) add(p.code, 2)
  for (const t of tokens.filter(t => t.cls === 'word' && !t.translit)) {
    for (const p of cfg.packs) {
      if (p.onlyStop.has(t.ascii)) add(p.code, 2)                      // stop words of p that no other enabled pack has
      if (p.hints.suffixes.some(s => t.ascii.endsWith(s))) add(p.code, 1)
      if (charHit.length === 0 && t.ascii.length >= 5 && p.hints.weakSuffixes.some(s => t.ascii.endsWith(s))) add(p.code, 1)
      if (charHit.length === 0 && p.hints.digraphs && digraphHit(t, p)) add(p.code, 1)      // rev 3.1, rules above
      if (p.compound && t.ascii.length >= 8 && splitCompound(t, p) !== null) add(p.code, 1) // rev 3.1: 8 (was 12)
    }
    const lx = lexiconLookup(t)                                        // step 0, exact, then stem (4.4)
    if (lx && lx.lang !== '*' && score.has(lx.lang) && (!lx.partOnly || t.ascii.length >= 6)) add(lx.lang, 1)   // rev 3.1: parts-only entries score from 6 chars
  }
  const ranked = [...score].sort((a, b) => b[1] - a[1] || order(a[0]) - order(b[0]))
  if (ranked[0][1] === 0) return 'und'
  if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) return cfg.defaultLang
  return ranked[0][0]
}
```

`order(code)` is the index in `cfg.languages`. With only the built-in packs this gives the same result as rev 2 (minus the two removed suffixes).

Every single-word lexicon entry carries its `lang`: a pack code, or `*` for words with the same spelling and meaning in several languages (`marketing`, `software`, `team`, `international`). A unit test fails if a built-in single-word entry has no explicit `lang`.

Per-token language:
1. `und` if the token is `translit` (Cyrillic, Greek, user hook) or the title has no Latin letters.
2. The lexicon entry `lang` if set, not `'*'` and the entry is not parts-only.
3. A pack whose `chars` occur in the token, or whose `suffixes` end the token (first pack in `cfg.languages` order wins).
4. The title language if it was detected (not via `defaultLang`).
5. Otherwise `und`.

`und` tokens are never compound-split (except at typed hyphens, 5.1 step 3), use the plain plural fold as stem (8.2), the EN coda and onset tables (the wider set), and the week prefix `wk`. So `postavki` stays whole. The title language picks the conflict stop words and the week prefix; when the title is `und`, `cfg.defaultLang` picks them.

The language picks: the stemmer, the conflict stop words, the coda table for cuts, the week prefix, the month display form.

### 6.2 Phrase matching (before stop words)

Walk tokens left to right. At each position try lexicon phrases of length 5 down to 2 (ascii tokens, exact match, stop words inside the phrase count). The longest match wins and becomes one token with the entry (`machine learning` -> `ml`, `frequently asked questions` -> `faq`, `künstliche Intelligenz` -> `ki`). Noise and weak words are only dropped or marked when they are not part of a phrase.

### 6.3 Stop word tiers (v1 data, full lists)

**Function words DE** (removed):

```
ab aber alle allem allen aller alles als also am an andere anderem anderen anderer anderes auch
auf aus bei beim bin binnen bis bzgl bzw bezueglich ca da damit dann darf das dass dein deine dem den
denen der des dessen deshalb die dies diese diesem diesen dieser dieses doch dort dr du durch duerfen
ein eine einem einen einer eines einige einigen einschl einschliesslich er es etc etwas euer eure
fast frau fuer gegen gem gemaess ggf habe haben hast hat hatte hatten herr hier hin hinter ich ihr
ihre im immer in indem inkl inklusive ins ist je jede jedem jeden jeder jedes jetzt kann kein keine
koennen laut man mehr mein meine meinem meinen meiner mit moechte muss muessen nach neben nicht nie
noch nur ob oder ohne per pro prof samt schon seit sehr sein seine sich sie sind so soll sollen sowie
ueber um und uns unser unsere unserem unseren unserer unter usw vom von vor waehrend wann war warum
was weil welche wenn wer werden weshalb wie wieder wieso will wir wird worden wurde wurden wo zu zum
zur zwar zwischen zzgl
```

Rev 3 added the person titles `dr frau herr prof`. Rev 3.1 added pronouns, possessives, auxiliary and modal verbs, question words and the adverbs `immer mehr nie schon`. A unit test asserts that every conflict word is in the list of each language it is listed for.

**Function words EN** (removed):

```
a about above across after against all along also am among an and any anything are aren as at be
because been before being below between both but by can cannot could couldn did didn do does doesn
don dr during each either ever every everything for from further had hadn has hasn have haven he her
here his how i if in incl including into is isn it its just me more most mr mrs ms my never
nobody nor not nothing of off on once only or other our out over own per prof regarding same she
should shouldn so some something such than that the their them then there these they this those
through to too under until up upon us ve very via was wasn we were weren what when where which while
who whom why will with within without won would wouldn you your
```

Rev 3 added the person titles `dr mr mrs ms prof`. Rev 3.1 added `ever every never cannot nobody nothing anything something everything us` and the contraction stems that remain after splitting on the apostrophe (`isn doesn don won aren wasn weren hasn haven hadn didn couldn shouldn wouldn ve`; the single `t`, `s`, `m`, `d` are noise anyway).

Person titles are language-bound: `herr frau` are in the DE list, `mr mrs ms` in the EN list, `dr prof` in both. All of them are removed only when the raw token is not all upper case, so `MS Teams` keeps `ms`. The same upper-case exception applies to every stop word that equals a key or form of an `upperOnly` lexicon entry (`US`, `IT`): the upper-case token goes to the lexicon, the lower-case token is a stop word.

**Conflict words** (removed only when the title language matches): `die war hat bin man fast will also so an pro` are removed only in `de` titles when they are DE function words, and only in `en` titles when they are EN function words. Implementation: they are in the per-language list, and the union check skips them unless `lang` matches. `an also so will` are in both lists. `die war hat bin man fast pro` are DE-only and must survive in EN titles (`Die Casting`, `War Room`, `Brightwave Pro 14`). In `und` titles, `cfg.defaultLang` decides. Packs declare their own `conflictWords` (6.7).

**Number words** (5.1 step 4b) are removed like conflict words: only in titles of their language, and never after a marker word.

**Noise words** (removed in every language; replaces the rev 2 domain words):

```
de: dokument dokumente datei dateien kopie anhang nr nummer betreff aw wg
en: document documents file files copy attachment no number re fw fwd
both: version (alone, 5.4) doc docx pdf xls xlsx csv ppt pptx odt ods rtf txt md jpg jpeg png
      zip msg eml
```

Rev 2 removed `vertrag vertraege vereinbarung contract agreement ...` as domain words. Rev 3 does not: in most fields these are normal topic words. `entwurf final draft dringend urgent asap` moved to the weak words (15.6).

**Legal forms** (removed in every language, generic noise):
- Always: `gmbh mbh ggmbh kgaa ohg gbr ltd llc llp plc inc corp bv nv sarl sas srl pty oy` plus multi-token `gmbh co kg`, `e v` (`e.V.` after splitting).
- Ambiguous: `ag kg se ug eg ek sa spa co limited`. They count as a legal form only when the raw text is upper case or dotted (`AG`, `KG`, `S.A.`, `e.K.`, `Co.`; `Limited`, `Spa` also in title case after a capitalized word) and the token is the last token or is followed by `&`, `co`, another legal form, punctuation or a year. Otherwise the token is a normal word (`Limited Edition`, `Spa Weekend`, `50 kg` is a quantity anyway).

Rev 2 had extra floor checks (`Umbau EG`, `KG 2`) because it had floor entries. Rev 3 has no floor entries, so the simpler rule above is enough. A legal form is still a name signal for the token directly before it (6.6).

**Weak words** are built-in lexicon entries with `weak: true` (15.6), so users change them with the `lexicon` option (same key replaces). Rules for weak concepts (a concept is weak when its lexicon entry has `weak: true`, or it is a compound whose parts are all weak heads, generic modifiers or noise words, 7.3):
- Weak concepts are **not in the pool** (10.4). So they are never a body segment and never add to `lost` in the fit cost.
- They still give stems for storage (8.2), so df and re-pick diff can see them.
- They come back only through the back-off in 6.5. Then they are normal concepts (no weak flag).
- `explain()` lists them in the rank step as `excluded: weak`.

**User stop words.** `stopWords` (16.2) changes the function and noise tiers. `add` entries are removed in every language. `remove` takes a built-in entry out of every tier and language. The function form gets the flat default list (function words of all enabled packs, then noise words, sorted, unique) and returns the new list; returned words that were in a language-specific list keep their language (conflict rules still apply), new words count for every language. Legal forms are not part of `stopWords`.

### 6.4 Attribute words (adjectives, verbs, participles)

Free words in titles are often not topics: `falsch berechnet`, `verschoben`, `rechtzeitig`, `gefährlicher`, `ergonomisch`, `rot`, `quickly`. A non-lexicon `word` token that is not a `name` or `acronym` (6.6) becomes class `attr` when one of these holds:
- **DE suffix** (token 6+ chars, per-token lang `de`): `-iert` (any case); `-lich -ig -isch -bar -los -haft` and `-et -end -er -es -en -em` only when the raw case is `lower` (rev 3.1). `-haft` never matches a token that ends in `-schaft`. So capitalized nouns and names (`Wirtschaft`, `Partnerschaft`, `Leipzig`, `Ludwig`, `Venedig`) are not attr. Compounds whose head is a known part are not checked (`netzwerk`, `kindergarten`).
- **DE lower case**: in a `de` title whose case flags are known, a token in `lower` case that is not at title start and not a stop word. German nouns are capitalized, so these are adjectives, verbs or adverbs (`rot`, `verschoben`).
- **EN suffix** (per-token lang `en`, token 6+ chars): `-ly -ive -ous -able -ible -ful -less`, or `-ed` when the token is not a lexicon form.

Packs other than `de` and `en` bring their own rules through the pack field `attr` (6.7); without it they have none.

`attr` concepts are slot T, have class weight 120 and prior 40, and get no position bonus (10). They can still enter the pool after the topics (`tasse-rot-2345`). If only attr and weak words are left, the back-off restores them in title order.

### 6.5 Back-off when nothing is left

Evaluated after stop words, deny tokens and name handling:

| Left over | Action | Warning |
|---|---|---|
| nothing, raw empty, only noise tokens or only legal forms | empty path (section 13.6) | `empty` |
| only function words were present | empty path | `empty` |
| only noise words (and legal forms) | restore the first noise word (not legal forms) as a `topic` concept | `stopwords-relaxed` |
| no non-weak word concept, but weak words | restore the weak words as normal concepts (numbers stay as they are) | `stopwords-relaxed` |
| only numbers, months, weekdays or markers | nothing here; 2.1 prepends the fallback word when the body would start with a digit | - |

Rev 2 said "only numbers/markers: add `doc`", which contradicted its own example `los1-los2-[t6]`. Rev 3 states the 2.1 rule as the only rule.

Deny tokens (6.6) are never restored by the back-off. A title made only of deny tokens takes the empty path.

### 6.6 Names, acronyms and deny tokens

Rev 3 has no org rule and no person rule. One neutral class `name` covers proper nouns of every kind: company, product, project, team, place, person and code names. A name is usually the best discriminator between sibling titles, in every field.

**Name signals.** A `word` token without a lexicon entry becomes class `name` when one of these holds (case flags must be known, 4.1):
1. **Inner capitals**: the raw token has an upper-case letter after a lower-case letter (`iPhone`, `GitHub`, `McKinsey`, `PostgreSQL`, `eBay`).
2. (rev 3.1: moved to the class `acronym`, below.)
3. **Before a legal form**: the token is capitalized and stands directly before a legal-form stop word (6.3): `Acme Inc`, `Bluefin Ltd`, `Isarwerk GmbH`. Only that one token. There is no walk to the left and there are no line words.
4. **Sentence case**: the title language is `en` or `und` (or a pack without `nounsCapitalized`), the title is not Title Case, and the token is capitalized and is not the first word token (`Onboarding checklist for Acme`, `Trip report from Lisbon`). Title Case means every word token that is not a stop word is capitalized; then case gives no signal. The first word token is the first `word` token after leading codes, numbers and punctuation. Month and weekday words (5.4) never get this signal.
5. **Lexicon**: an entry with `cls: 'name'` (user config, for example `{ key: 'kubernetes', cls: 'name', abbr: ['k8s'], known: ['k8s'] }`).

**Acronyms** (rev 3.1). A `word` token without a lexicon entry (after lookup step 0, 4.4) whose raw token is 2 to 6 letters, all upper case, in a title that is not all caps, becomes class `acronym` (`PM`, `RAM`, `SSD`, `CI`, `OG`, `NDA`, `AGB`, `MRT`, `VPN`, `GPS`, `NASA`, `DSGVO`). Excluded: stop words, legal forms, quarter, week, month, weekday, version and marker forms, Roman numerals, and `am`/`pm` after a time (noise, 5.2). Rev 3 made these tokens `name` (score 380, the top rank), so short technical acronyms beat the content words, and `leak: 'minimal'` dropped them (`AGB Version 3.1` gave an empty body). An acronym is a strong word, not a proper noun: slot T, class weight 240, prior `unknown`, kept in `minimal` (10.4). Rungs: the full word only (cost 0, plain). A known abbreviation typed in capitals (`SEO`, `HR`, `KPI`) is not an acronym concept: lookup step 0 maps it to its lexicon entry. `IT`, `EU`, `US` and `KI` are `upperOnly` lexicon entries.

German titles (and packs with `nounsCapitalized: true`) use only name signals 1, 3 and 5, because all nouns are capitalized. Acronyms work in every language. So in a `de` title an unknown capitalized noun (`Kassel`, `Befund`, `Zimt`) is a plain `topic` (unknown word, 10.1). Its rarity comes from the store (10.2), which is the generic way to find specific words. Rev 2 marked such tokens as proper nouns when they could not be split and had no lexicon match; in a generic setting that turned most German nouns into names.

Name and acronym tokens are never compound-split (7.2) and never become `attr` (6.4).

**Name rungs.** The full word (cost 0 up to 8 chars, 40 for 9 to 12 chars), the lexicon abbreviations of a `cls: 'name'` entry, and the cuts of 11.3 without the morpheme kind. No skeletons. A name rung that equals a stop word or a key or abbreviation of another lexicon entry is removed (`nor`, `ost`, `it`), so a name never reads as a function word or another concept. A name with no rung left is dropped.

**Deny tokens.** `cfg.denyTokens` (list, normalized like titles) are dropped right after tokenizing (pipeline step 2, before language detection and phrase match; rule B4 time, 9.2), in every leak level. They are never restored by the back-off and never stored as stems. Use them for person names, internal code names and words that must never show in an ID. Deny tokens match single tokens; a multi-word entry (`anna weber`) matches the token sequence.

**Leak.** Names are allowed in `leak: 'normal'` (PO decision, Q3). `leak: 'minimal'` drops all `name` concepts (10.4). It keeps topics and acronyms.

**Privacy note** (README, 18.9): an ID made from a title shows words of the title. The library does not know which words are person names. In `en` and `und` titles a person name in sentence case is usually a `name` concept, so `minimal` drops it. In `de` titles (and other packs with `nounsCapitalized`) a person or city name is a plain topic (only positive signals, Q12), so `minimal` keeps it: `Mitarbeitergespräch Anna Weber 2026` shows `anna` or `weber` in `minimal` too. **To keep names out of IDs, put them in `denyTokens`.** This is the only reliable tool in every language. IDs show up in URLs, logs and analytics, which matters under GDPR.

### 6.7 Language packs

The built-in languages are packs with the same interface as user packs (`src/lang/de.ts`, `src/lang/en.ts`). A user pack adds a language without a code change. `languagePacks` is **experimental** in v1: the interface may change before 1.0, and output for user packs is not under the 14.2 stability promise until it is declared stable.

```ts
export interface LanguagePack {
  code: string                          // /^[a-z]{2,3}$/, not 'und', not a built-in code
  id: string                            // version tag, recorded in the fingerprint, e.g. 'fr@1'
  stopWords: readonly string[]          // function words; normalized like titles
  conflictWords?: readonly string[]     // subset of stopWords removed only in titles of this language
  noiseWords?: readonly string[]        // extra noise words (added to the shared noise tier)
  lexicon?: readonly LexiconEntry[]     // entries without `lang` get lang = code
  stem: (ascii: string) => string       // pure, deterministic; result is stored (8.2)
  keyFold?: (ascii: string) => string   // fold before stemming (4.4); default identity
  translit?: Readonly<Record<string, string>>   // extra single-char table, applied before the built-in ones
  hints?: { chars?: string; suffixes?: readonly string[]; weakSuffixes?: readonly string[]
            digraphs?: readonly string[] }   // 6.1
  nounsCapitalized?: boolean            // true: name signal 4 is off, no model position after plain words (5.1, 6.6)
  compound?: {                          // 7; omit for languages without closed compounds
    parts: readonly string[]; linkers: readonly string[]
    weakHeads?: readonly string[]; genericModifiers?: readonly string[]
  }
  phonology?: { codas: readonly string[]; onsets: readonly string[] }   // 11.3; default: the en tables
  months?: readonly (readonly string[])[]   // 12 rows; row[0] is the 3-letter display form
  weekdays?: readonly (readonly string[])[] // 7 rows, Monday first; row[0] is the display form (5.4)
  weekPrefix?: string                   // default 'wk'; must end in a safe letter
  markers?: readonly { words: readonly string[]; prefix: string; takes: 'number' | 'number-or-letter' }[]
  units?: readonly (readonly string[])[]    // extra unit rows (5.2); row[0] is the display short form
  versionWords?: readonly string[]      // words before a version number (5.4), e.g. fr 'version'
  numberWords?: readonly (readonly string[])[]  // rows for 1..12; all forms of one number in a row (5.1 step 4b)
  attr?: {                              // 6.4; omit for no attr rules
    suffixes?: readonly string[]        // any case, token 6+ chars
    lowerSuffixes?: readonly string[]   // only when the raw case is lower
    lowerCaseRule?: boolean             // lower-case non-stop tokens are attr (use with nounsCapitalized)
  }
}
```

Rev 3.1 added `digraphs`, `weekdays`, `units`, `versionWords`, `numberWords` and `attr`, so a new language can reach the same level as `de` and `en`. The built-in packs fill every field with the data of sections 5 and 6.

Rules:
- `languages` lists the enabled codes in priority order (default `['de', 'en']`). A code must be built-in or come from `languagePacks`, else `ConfigError` reason `unknown-language`. `defaultLang` must be enabled.
- A user pack cannot reuse a built-in code in v1 (`ConfigError` reason `builtin-pack`). To change German data, use `stopWords`, `lexicon` and `denyTokens`.
- All lists are normalized like titles and must match `[a-z0-9]+` (phrases: words joined by single spaces). `stem` and `keyFold` must be functions.
- `stem` output that does not match `[a-z0-9]+` is replaced by the ascii input (deterministic, no warning). The function is called once per token and part.
- Only packs with `compound` data split compounds. Built in: `de`.
- The fingerprint (14.2 item 9) records every pack's `code`, `id` and data; functions are recorded as `"fn"`. So `id` MUST change when `stem` or `keyFold` change.
- Data size: a pack adds its lists to the config, not to the bundle.

---

## 7. Compound splitting (step 7)

Compound splitting runs only for packs with `compound` data (6.7). The built-in data below is the `de` pack.

### 7.1 Data

- `PARTS`: all single-word lexicon keys and forms with `part !== false` and `lang` `de` or `*` (built-in and user entries), plus the generic part list in section 15.7. Each part has an optional combining form without final `-e` (`schul` for `schule`), generated at build time of the lexicon map.
- `LINKERS = ['', 's', 'es', 'n', 'en', 'er', 'e', 'ens']`.
- `WEAK_HEADS` (head dropped, modifier becomes the concept), generic in rev 3: `wesen bereich thema frage bericht uebersicht liste plan planung prozess verfahren konzept system plattform projekt management leitfaden anleitung dokument vorlage sitzung besprechung protokoll information`.
- `GENERIC_MODIFIERS` (modifier dropped, head becomes the concept): `haupt gesamt sonder neu alt zusatz einzel jahr monat`. Compared on the part text without linker (`jahres` = `jahr` + `es`).
- `WEAK_HEADS` is built at first use as the union of the list above, all weak words (15.6) and all noise words (6.3).
- `isHeadPart(p)`: `p` is a known part and not a `GENERIC_MODIFIERS` entry. Weak heads are allowed: then 7.3 drops the head and the modifier becomes the concept (`lernplattform` -> `lern`, `urlaubsplan` -> `urlaub`).

Rev 2 weak heads and modifiers that were procurement words (`lieferung liefer vertrag vereinbarung anlage leistung dienst dienstleistung versorgung technik betrieb unterhalt`) are removed. `lieferung` and `vertrag` are normal parts now: `Pizzalieferung` -> `pizza` + `lieferung`.

### 7.2 DP split

Only for tokens with a per-token lang whose pack has `compound` data (6.1). Never for `und` or `translit` tokens or `name` tokens (6.6). Input is `ascii`.

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

Rev 1 allowed an unknown part anywhere at -100, which beat keeping the word whole and gave `lebens+mittel+lager` and `post+avki`. Now: `lebensmittellager` -> `lebensmittel` + `lager`, `xantoplex` stays whole (no known head), `postavki` is never split (`und`).

Integer scores, fixed loop order, so the result is deterministic. Cost is O(n^2 * 8), fine for 60 chars. Words longer than 64 chars are split on the first 64 only.

Inflected heads: `hasPart` also accepts a known part plus a plural/case ending `e n en er s es` at the end of the word (`kinder`, `fahrzeuge`, `gebaeuden`).

### 7.3 Parts to concepts

| Case | Rule | Example |
|---|---|---|
| Lexicon has the whole word | one concept with its rungs | `kindertagesstaette` -> `kita` |
| Every part is in `WEAK_HEADS`, `GENERIC_MODIFIERS` or a noise word | the whole token is a weak word (6.3, so the 6.5 back-off can restore it) | `jahresbericht`, `projektplan`, `themenliste`, `monatsbericht` |
| Head in `WEAK_HEADS` | drop head, modifier(s) form the concept | `urlaubsplan` -> `urlaub`, `buchungssystem` -> `buchung`, `sicherheitskonzept` -> `sicherheit`, `steuerfrage` -> `steuer`, `marketingbericht` -> `marketing` |
| Modifier in `GENERIC_MODIFIERS` | drop modifier, head is the concept | `hauptbahnhof` -> `bahnhof`, `jahresurlaub` -> `urlaub` |
| Modifier is a `direction`, `region` or `qualifier` entry (rev 3.1) | the modifier becomes its own concept with its own class (slot Q); the rest of the token follows the other rows | `norddeutschland` -> `nord` (direction) + `deutschland` (region), `suedbahnhof` -> `sued` + `bahnhof`, `onlinekurs` -> `online` (qualifier) + `kurs` |
| Adjacent parts that form a lexicon word | re-join first, then apply the rows above and below | `kinder` + `garten` -> `kindergarten` |
| 2 or more strong parts left (rev 3) | **one concept for the whole token** (below) | `apfelkuchen`, `kundenportal`, `sommerfest`, `kinderbetreuungskosten` |
| Hyphenated token | split given; same rules, in every language (5.1 step 3) | `e-mail-vorlage` -> `email` (joined lexicon form) + `vorlage` (weak head) -> `email`; `gluten-free` -> one concept `glutenfree` |
| Hyphenated token with an unknown head (rev 3.1) | one concept; class `topic` with prior `unknown` (an unknown word), stems of every part | `mathe-arbeitsblatt`, `onboarding-checkliste` (head `checkliste` is a doc-kind entry, so its `weight` applies) |

**One concept per compound (rev 3).** When two or more strong parts are left, the token stays one concept:
- `key` = stem of the head (last strong) part; `stemKeys` = stems of every part (8.2), so df and the re-pick diff still see each part.
- Class and prior come from the head part: a known part gives a lexicon `topic` with that entry's prior, and an entry `weight` of the head applies. A pass-2 split always has a known head. Only a typed hyphen can give an unknown head; then the concept is an unknown topic (row above).
- Rungs (11.1): the full word (cost by length); every prefix that ends at a part boundary (`apfel`, `kinderbetreuung`) as a morph rung (60); the head part as typed (`kuchen`, `kosten`) as a head rung (60); a lexicon abbr of one part joined with the full form or abbr of the other parts when the result is 8 chars or less (`kindertagesstaettenfest` -> `kitafest`, cost of the abbr); the cuts and the skeleton of the whole word.
- **Cryptic or plain** (rev 3.1). Morph and head rungs are cryptic (11.1), because each one drops a part that carries meaning (`fest` for `Sommerfest`, `eltern` for `Elternabend`, `miet` for `Mietvertrag`). Exception: the rung is a whole part of 5+ chars and every other part of the token is weak (a weak word or weak head), a noise word or a generic modifier (then nothing of meaning is dropped). A joined-abbr rung is plain only when every piece is a `known` abbr or a full part as typed (`kitafest`); otherwise it is cryptic.

Rev 2 made two bonded concepts for 2 strong parts and up to three concepts for 3+ parts. With a procurement lexicon that was rare. With generic everyday parts it happens in most German titles, and a title like `Sommerfest Kindergarten Nordstadt Programm 2026` produced five or six compound concepts that pushed the direction and the year out of the pool. One concept per token keeps the pool at one concept per content word, as in English.

Concept bonds (`Concept.bond`) remain only for the number bonds quarter + year and month + year (11.5), which are always joined into one segment, and (rev 3.1) the model bond word + number (5.1 step 4c, 11.5).

Rev 2 used procurement words in this table. The weak-head and modifier rows work as before; only the lists changed. The rev 2 "bond display" rule for compound parts is gone with the part concepts.

Unknown modifier parts (5+ chars, pass 2 only) count as strong parts. When the head is weak, they become the concept (often the real topic: `xantoplex` in `xantoplexplan`).

Parts-only entries (15.7, `partOnly: true`, no other data) that become concepts have `cls: 'topic'` and `prior: 'common'`.

---

## 8. Concepts and stems (step 8)

### 8.1 Concept

```ts
interface Concept {
  key: string            // identity: lexicon key (or group), or stem of the head part, or number key
  cls: ConceptClass      // topic | name | acronym | attr | qualifier | place | direction | region | marker | year | range
                         // | quarter | month | week | weekday | version | model | longnum | code | quantity
  weak: boolean
  verbatim: string[]     // ascii forms the user typed for this concept: full token and/or compound part
  pos: number            // index of the first source token
  tf: number             // number of merged occurrences
  lex?: LexiconEntry
  stemKeys: string[]     // lexicon-free stems of the source tokens/parts (8.2), for df and diff
  bond?: { with: string; kind: 'year' | 'word' }   // quarter/month + year, model number + word (11.5)
  score: number          // set in rank
  ladder: Rung[]         // set in ladders
}
```

Merge rule: concepts with the same `key` merge (tf adds up, pos = min). Lexicon `group` merges too (`technik` and `technology` share group `tech`, counted once). Rev 3.1: a topic whose key equals the marker word of a marker in the same title merges into the marker (5.3).

### 8.2 Stemming

- **Vendored, not a dependency.** These are the stemmers of the built-in `de` and `en` packs; user packs bring their own `stem` (6.7).
  - `src/vendor/cistem.ts`: port of official `Cistem.js` (MIT, header kept). Fix the implicit global `upper` (make it `let`). Always call with `case_insensitive = true`. Input: `keyFold(surface)` of the part. Output lowercase.
  - `src/vendor/porter2.ts`: Snowball 3.2.0 generated JS for `english` (BSD-3, header kept), converted to TS with `// @ts-nocheck` only if needed. Input: ascii.
- Stems are keys only, never displayed.
- For `und` tokens (rev 3.1): stem = `pluralFold(ascii)`. `pluralFold` removes one final `s` when the word has 4+ chars and does not end in `ss`, `us`, `is` or `os` (`recipes` -> `recipe`, `registers` -> `register`, `bus`, `status`, `analysis` stay). So plural near-duplicates of short titles that get no language (`Chocolate Cake Recipes`) still share stems (Q14). Display is never affected.
- Concept `key` for non-lexicon words: stem of the head part (or the whole token). For lexicon words: the lexicon `key` (or `group`). For numbers: the number key (5.2). `key` is only used inside one call (merge, sort, explain). It is never stored.
- **Stored stems do not depend on the lexicon.** `stem(t)` = the pack stemmer of the token language (CISTEM for `de`, Porter2 for `en`) of `keyFold(ascii)`, or `pluralFold(ascii)` for `und`. The stored set is the sorted unique union of:
  - `stem(t)` of every `word` token that survived stop words (weak, attr, name and acronym words included; function, noise, legal-form and deny tokens not),
  - `stem(p)` of every compound part from 7.2 (splitting uses the lexicon parts, so a parts edit can change this; parts change rarely and only with a data digest change),
  - number keys (`y2026`, `m03`, `wd5`, `v2.4`, `pt1`, `d8`, `n2345`, `csku4471`, `q128gb`), which come from tokenizer rules, not from the lexicon. (User marker entries make marker keys depend on the lexicon; they change rarely and only with a config fingerprint change.)
- Phrase entries (`machine learning`) store the stems of each word. Lexicon keys and groups (`ml`, `dev`) are never stored.
- `concept.stemKeys` = the stems of its source tokens and parts. At read time a concept maps to stored rows like this:
  - df(concept) = **min** df over its `stemKeys` (a phrase or compound is at most as frequent as its rarest word);
  - a concept is "in" another row when, for at least one of its source occurrences (merged concepts have several, e.g. `technik` and `technology` in group `tech`), **all** stems of that occurrence are in that row's stems. df of a merged concept is the max of its occurrences' df.
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
- `Assessment` -> `assessment` allowed (full word, verbatim); cuts starting with `ass` removed (B2). (Rev 2 used the removed procurement entries `ac` and `asmt` here.)
- `Sexton` -> `sexton` allowed verbatim (soft), `sext` removed.
- `Shiitake`, `Titanium`, `Kotflügel`, `Scheibenwischer`, `Hurtig`, `Kasse`, `Massnahme`, `Dokument` -> no false hits.
- Süd is never `sd`. Hamburg is never `hh`.

### 9.3 Reserved words

Default `reserved`: `new edit admin api settings login logout auth create delete update search null undefined index help static assets`. Entries are normalized like titles.
- `id` must not be in `reserved`.
- Reserved words are checked against the whole ID (and the body in max mode). As one segment of a longer body they are fine (`admin-env-26`).
- In max mode without tail, `body` must not be in `reserved`. If it is, a tail is forced (`new` -> `new-k3`).

---

## 10. Ranking (step 9)

All values are integers ("centi" units).

### 10.1 Class weights

| Class | Weight |
|---|---|
| topic (lexicon entry or parts-only entry) | 280 |
| name (6.6) | 260 |
| topic (unknown word, no lexicon entry) | 240 |
| acronym (6.6, rev 3.1) | 240 |
| place (user lexicon only) | 200 |
| marker | 180 |
| year, range | 160 |
| direction, region, qualifier (rev 3.1), quarter, month, week | 140 |
| attr (6.4) | 120 |
| version, model (rev 3.1), longnum | 120 |
| code | 100 |
| weekday (rev 3.1) | 100 |
| quantity | 50 |

Rev 3 changes: `org` (240), `action` (220), `activity` (200), `doctype` (100) are gone. Lexicon topics drop from 300 to 280 and unknown topics rise from 220 to 240, because the built-in lexicon is now made of common words (mostly `prior: 'common'`), not of strong domain terms. With priors this gives the order name (380) > user lexicon topic (355) > built-in lexicon topic (310) > unknown topic and acronym (300) > attr (180), before position and tf. Store df (10.2) then moves rare words up and frequent words down, which is the generic way to find what is specific in a scope. Doc-kind words (15.6) carry `weight: -60`, so they rank below the content words of the same title.

Unknown words get class `topic` with weight 240, unless 6.6 makes them `name` or `acronym` or 6.4 makes them `attr`. Direction cancel: if the title has 3 or more different concepts of class `direction` (rev 3.1: by class, so `nordost`, `links`, `northeast` and user directions count), all direction concepts get score 0.

Rev 2 had place markers that re-classed the next word as a place. Rev 3 removes them (no built-in places). A user who needs places adds lexicon entries of class `place`.

### 10.2 Rarity

```ts
const LOG2_FRAC_Q8 = [0, 22, 44, 63, 82, 100, 118, 134, 150, 165, 179, 193, 207, 220, 232, 244]
function ilog2q8(x: number): number {             // x >= 1, integer; returns round-ish 256*log2(x)
  x = Math.min(Math.max(1, Math.floor(x)), 0x7fffffff)
  const e = 31 - Math.clz32(x)
  const m = ((x << (31 - e)) >>> 27) & 15
  return e * 256 + LOG2_FRAC_Q8[m]
}
const NUMBER_CLASSES = new Set(['year', 'range', 'quarter', 'month', 'week', 'weekday', 'version', 'marker', 'model', 'longnum', 'code', 'quantity'])
const RARITY_NUMBER = 50
const BLEND_K = 200
function prior(c: Concept): number {
  if (c.lex) return PRIOR[c.lex.prior]           // resolved: built-in default 'common', user default 'medium' (15.1)
  if (c.cls === 'name') return PRIOR.proper
  return PRIOR.unknown                             // unknown topic, acronym and attr
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

Rev 2's `isProperNoun(c)` is replaced by the name signals of 6.6. A concept has the `proper` prior exactly when it is of class `name` without a lexicon prior.

### 10.3 Score

```
score = classWeight[cls]
      + floor(rarity * 3 / 2)                      // 0..150
      + positionBonus                              // T concepts (topic, name, acronym; not attr) in title order:
                                                   // 60, 30, 15, 8, 4, then 0 (rev 3.1)
      + 40 * (tf - 1)
      + (lex.weight ?? 0)                          // -100..+100
      + (diffBoost ? 300 : 0)                      // re-pick, section 13.4
```

There is no weak term: weak concepts are not scored for the pool (6.3). Restored weak concepts (6.5 back-off) are scored as normal concepts.

Rev 3 gave a bonus only to the first two T concepts, so every unknown word after position 2 scored exactly 300, and the fit broke ties by body text, which is alphabetical order (`eff-sleep-adults` beat `eff-sleep-memory`). The decreasing bonus keeps earlier words ahead, which matches how titles are written.

Sort: score desc, pos asc, key asc (code-unit compare). Never use `localeCompare`. This rank order picks which concepts enter the pool and which are dropped first. The order of segments in the ID is slot order, then title position (2.1).

### 10.4 Pool

`pool = concepts.filter(c => !c.weak && c.score >= 100 && c.ladder.length > 0).sort(rankOrder).slice(0, 6)`. A `model` concept counts as having a ladder (its rungs are the joined forms, 11.5). Quantities score 50 + 75 = 125 and so enter the pool at the lowest rank (rev 3.1; rev 3 said "never in pool", which its own formula contradicted); a decimal quantity has no rung and stays out.

Leak filters apply before the pool:
- `minimal`: drop concepts of class `name`, `attr`, `code`, `marker`, `model`, `version`, `longnum` and `quantity`. Keep `topic` (lexicon and unknown words), `acronym`, `qualifier`, `place`, `direction`, `region`, `year`, `range`, `quarter`, `month`, `week`, `weekday`. `maxSegments` becomes `min(maxSegments, 3)`. Rev 2 kept only lexicon concepts; with a generic lexicon that left most titles empty, so rev 3 keeps unknown topic words and drops the classes that most often carry names, numbers and identifiers. Rev 3.1 keeps acronyms (`AGB Version 3.1` gives `agb-[t12]`, not an empty body). `minimal` does not hide person names in `de` titles (6.6 privacy note).
- `opaque`: pool is empty, empty path with no body.

---

## 11. Ladders: readable display forms (step 10)

### 11.1 Rung kinds

| Kind | Cost | Example |
|---|---|---|
| lexicon abbr | `15 * index` in the entry's `abbr` list (0, 15, 30, ...) | `mktg` (0); `dev` (0), `entw` (15) |
| full ascii word, 6 chars or less | 0 | `budget`, `kita`, `recipe` |
| full ascii word, 7+ chars | 40 | `vertrieb`, `chocolate`, `release` |
| name, 12 chars or less (6.6) | 0 up to 8 chars, 40 for 9 to 12 | `acme`, `github`, `bluefin` |
| number long form (`2026`) | 30 | |
| morpheme cut (prefix ending at a compound part boundary; not for names); cryptic except as in 7.3 | 60 | `apfel` (from `apfelkuchen`), `kinder` (from the lexicon word `kindergarten`) |
| head rung (the head part of a compound concept as typed, 7.3); cryptic except as in 7.3 | 60 | `kuchen` (from `apfelkuchen`) |
| coda cut | 90 | `choc`, `chocol`, `rec`, `rel` |
| syllable cut | 110 | `ver`, `vert`, `check`, `scun` |
| consonant skeleton (not for names) | 200 | `vtb`, `wtg`, `lfrt` |

**Plain and cryptic rungs.** A rung is *plain* when it is a full word, a name's or acronym's full word, a morph or head rung under the exception of 7.3 (a whole part of 5+ chars, every other part weak, noise or a generic modifier), a joined-abbr rung whose pieces are all `known` abbreviations or full parts (7.3), a number form, a code, a lexicon abbr listed in the entry's `known` (15.1, for example `mktg intl hr db faq kita`), or a lexicon abbr that equals a whole compound part of the source word (a user entry `sommerferien` with abbr `sommer`). All other rungs (unknown abbreviations, cuts, other morph and head rungs, skeletons) are *cryptic*. The fit adds 40 per cryptic segment (12). So a body of known abbreviations and full words beats a body of cuts when both fit, and the choice between two spellings of one concept is made by readability, not only by length.

Build: collect all rungs, run B1, B2, B6, I8 on each, dedupe by text (keep lowest cost), sort by cost asc, then length asc, then text asc. Keep the first 4. Concepts with score < 150 keep only rungs with cost <= 110. Skeletons only for words of 7+ chars. A cut must be at least 2 chars shorter than the full word (so `mitte` has no cut `mitt`; lexicon abbreviations are explicit and exempt).

**No pad-only rungs.** A rung must be a form a person would write. Rev 1 had zero-pad marker rungs (`los01`) that only existed to fill length; they are removed. The full year `2026` stays, because people write it.

**`consistentRungs: true`** (option, default `false`): each concept keeps only its first rung (rung 0). The fit then fills missing length with the tail, so sibling IDs always spell a concept the same way (`mktg` in every Marketing ID). Costs more tails; see Q9.

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
// zeitung -> ztg, vertrag -> vtg, kalender -> kldr (checked by running the code)
```

### 11.5 Number rungs

| Concept | Rungs |
|---|---|
| year 2026 | `26` (0), `2026` (30). Blocked 2-digit forms (`18`, `88`) are removed |
| historic year 1889 (rev 3.1) | `1889` (0) only |
| fy year | `fy26` (0) |
| range 2025/2026 | `2526` (0). Range over different decades `2029/2031` -> `2931`. Only when the span is 9 years or less and both years are in one century |
| wide range 1950–2020 (rev 3.1) | `1950-2020` (0): one rung that fills **two segments** (counted in `maxSegments` and `chunks`, each segment checked by B1 and I8). With separator `''` it reads `19502020`. Rev 3 gave `5020`, which a reader cannot read |
| quarter + year bond | `26q1` when both chosen (joined, one segment) |
| month | `mrz` / `mar` (0); month + year bond `26mrz` / `26mar` when both chosen (joined, one segment) |
| week | `kw12` / `wk12` (0) |
| weekday (rev 3.1) | en `fri` (0), `friday` (cost by length); de `freitag` (cost by length) |
| version | `v2`, `v24` (0) |
| marker | `pt1`, `sprint14`, `nr4521`, `art28`, `sz` + `m` = `szm` (0) only |
| model + word bond (rev 3.1) | joined `<word rung><digits>` (`phone8`, `pro14`, `hist101`) at the cost of the word rung, in the word's slot and position. The model concept has no rung alone: the fit can choose it only together with its word. A joined form that fails B1, B2 or I8 (`polo1`) is removed; then the model concept is lost |
| quantity (rev 3.1) | `128gb`, `50mw`, `85m2` (0); decimal quantities have no rung |
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
    .filter(s => s.every(c => c.cls !== 'model' || s.some(w => w.key === c.bond!.with)))   // rev 3.1: model only with its word
    .map(s => ({ s, lb: lostOf(s, pool) + 60 * Math.max(0, minSegs(s) - 2) }))
    .sort((a, b) => a.lb - b.lb || a.mask - b.mask)
  const best: Candidate[] = []                                        // best candidate per subset, kept sorted
  for (const { s, lb } of subsets) {
    if (best.length >= cfg.maxPlans && lb > best[cfg.maxPlans - 1].cost) break   // strict '>' keeps ties exact
    let top: Candidate | undefined
    for (const rungs of product(s.map(c => c.ladder))) {             // <= 4 rungs each
      const segs = slotOrder(s, rungs, cfg)                           // T Q N, title position inside a slot, number and model bonds joined,
                                                                      // a wide range rung gives two segments, fallback if first starts with digit
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

- Per subset only the cheapest candidate is kept, so spelling variants (`mktg` vs `marketing`) never count as different candidates. Two different documents must not end up as `mktg-budget-26q3` and `marketing-budget-26`. (Rev 1 called this `dedupeByContent`.)
- `byCostThenLen`: cost asc, then `id` length asc (matters in max mode), then (rev 3) the rung costs of the candidate's concepts in rank order (10.3), compared as a list (lexicographic asc), then (rev 3.1) the content compared by rank (the candidate whose highest-ranked concept not shared with the other candidate ranks higher wins), then body asc (code units). The rung-cost step lets the higher-ranked concept keep its better form when costs tie (`firefox-rel-v132` beats `fir-release-v132`, both 230). Within one subset this step decides between rung combinations too.
- With separator `''`, segments are joined without separator. The cross-boundary check B3 and the joined I8 check matter more there.
- Size: `maxSegments` is limited to 1..5. Worst case pool 6 and `maxSegments` 5: 62 subsets x 1024 rung combos, about 63k string builds; with the default 4: 56 x 256, about 14k. The lower-bound cut skips most subsets in practice (typical titles have 3 to 5 concepts). Budget: p99 under 2 ms at the default, under 10 ms at 5 (bench in 19.6 Q12, with a gating test on the worst case).
- If the result is empty (nothing fits), the fallback chain is: drop the `maxSegments` cap to 1 and retry, then the empty path with `fallbackWord`.

### 12.1 Length policy in exact mode (decision for Q1)

With `tailMin` 2 and separator `-`, a body of length L-1 or L-2 (15 or 14) has no valid tail. Rev 1 then used pad tricks (`los02`, cuts like `mitt`, `stan`). Rev 2 rules:
- A body is either exactly L (no tail) or at most L-1-tailMin (with tail). No 1-char pads.
- No rung exists only to pad (11.1): no zero-pad markers, cuts must be 2+ chars shorter than the word, every cut and unknown abbr pays the cryptic cost.
- So the fit prefers a short tail over an ugly fill. The padding-tail rate is measured (Q4) and reported to the PO with the Q1 question. `lengthMode: 'max'` stays the "readable" preset.

### 12.2 Worked cost checks (rev 3 rules, hand-computed)

**A. `Jahresbericht Vertrieb Nord 2026`** (no store, priors only). Language `de` (lexicon hit `nord`, compound `jahresbericht`, parts hit `vertrieb` of 8 chars, 6.1). `jahresbericht` = `jahr` (generic modifier) + `es` + `bericht` (weak head): all parts weak or generic, so the token is a weak word and not in the pool. Ranking: `vertrieb` (parts-only entry, prior common) 280 + 30 + 60 = 370, `y2026` 160 + 75 = 235, `nord` (direction, prior medium) 140 + 75 = 215. Ladders: `vertrieb` 40, `ver` 110 (syll), `vert` 110 (syll), `vtb` 200; `nord` 0; `26` 0, `2026` 30.

| Candidate | Len | Cost |
|---|---|---|
| `vertrieb-nord-26` | 16 | rungs 40 + cryptic 0 + lost 0 + chunks 60 + tail 0 = **100** |
| `vertrieb-nord-2026` | 18 | too long |
| `vert-nord-26-<t3>` | 16 | 110 + 40 + 60 + 300 = 510 (same subset, so not a separate candidate) |
| `vertrieb-nord-<t2>` | 16 | 40 + lost y2026 235 + tail 250 = 525 |
| `vertrieb-2026-<t2>` | 16 | 40 + 30 + lost nord 215 + tail 250 = 535 |

**B. The same title again, after A** (memory store, tier C). `countBody('vertrieb-nord-26') = 1`, `findByBody` gives the same stems, so the diff is empty and the content stays. The body-only ID is taken, so `t = tailNeed(1) = 2` and `refitWithTail` keeps the same three concepts with room for a tail (body 13 or less):

| Candidate | Len | Cost |
|---|---|---|
| `ver-nord-2026-<t2>` | 16 | rungs 110 + 0 + 30 + cryptic 40 + chunks 60 + tail 250 = **490** |
| `vert-nord-26-<t3>` | 16 | 110 + 40 + 60 + 300 = 510 |
| `ver-nord-26-<t4>` | 16 | 110 + 40 + 60 + 350 = 560 |
| `vtb-nord-2026-<t2>` | 16 | 200 + 30 + 40 + 60 + 250 = 580 |

Result `ver-nord-2026-<t2>`, reason `shared-body`, warning `tail-grown`. This is the exact-mode cost of Q1: the duplicate loses the readable spelling. In `max` mode the result is `ver-nord-26-<t2>` (460, 14 chars).

**C. `Q3 2026 Marketing Budget Review`**. Language `en` (`-ing`). Title Case, so no name signal. Ranking: `marketing` (shared lexicon entry, prior common) 280 + 30 + 60 = 370, `budget` (shared part, prior common) 280 + 30 + 30 = 340, `review` (unknown, third T concept) 240 + 60 + 15 = 315, `y2026` 235, `q3` 215. Ladders: `mktg` 0 (known), `marketing` 40, `mark` 90, `market` 90; `budget` 0, `bud` 110; `review` 0, `rev` 90; `26`, `2026`; `q3` (bonded with the year to `26q3`).

| Candidate | Len | Cost |
|---|---|---|
| any body with all five concepts | 17+ | too long (`mktg-bud-rev-26q3` is 17) |
| `mktg-budget-26q3` | 16 | lost review 315 + chunks 60 = **375** |
| `mktg-review-26q3` | 16 | lost budget 340 + chunks 60 = 400 |
| `mktg-budget-2026` | 16 | rung 30 + lost q3 215 + review 315 + chunks 60 = 620 |

**D. `Chocolate Cake Recipe`**. Language `und` (no hint), so no split and EN cut tables. Title Case, no name signal. Ranking: `chocolate` 240 + 60 + 60 = 360, `cake` 330, `recipe` 315. Ladders: `chocolate` 40, `choc` 90, `chocol` 90; `cake` 0; `recipe` 0, `rec` 90.

| Candidate | Len | Cost |
|---|---|---|
| `choc-cake-recipe` | 16 | rungs 90 + cryptic 40 + chunks 60 = **190** |
| `chocolate-recipe` | 16 | 40 + lost cake 330 = 370 |
| `choc-cake-rec-<t2>` | 16 | 90 + 90 + 80 + 60 + 250 = 570 |

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
- Rev 1 took the first free candidate before it looked at what differs (a "Süd" sibling of a "Nord" title got an ID without `sued`). Now the best body is checked first. If it is taken, `findByBody` gives the diff, the diff concepts get +300, and only candidates that contain a diff concept are tried. For the "Süd" sibling the diff is `{sued}`, so the ID shows `sued`.
- Rev 1 re-picked identical or same-stem titles to a body with less content. Now an empty diff keeps the body and only the tail differs.
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
      const res = await slugger.generate(title, { store: prismaStore({ delegate: tx.document, ... }), scope, exclude: tried })
      last = res.id
      return tx.document.create({ data: { tenantId: scope, title, slug: res.id, slugBody: res.body, slugStems: [...res.stems] } })
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

`body` stored as `''` for opaque, `doc` for empty. The tail index starts at `countBody(body)` (tier B, C) or 0 (tier A), as in 13.4. Hash input uses the canonical title (or `raw:` hex for scripts that were dropped), so a CJK title and an Arabic title differ.

**Why opaque needs `secret`.** `K_V1` is public. Without a secret, anyone with a list of likely titles can compute the opaque ID of each and confirm a guess. With a secret this is not possible. So `leak: 'opaque'` without `secret` is a `ConfigError` (reason `opaque-needs-secret`). The same holds for `storeStems: 'hashed'` (stems are dictionary words, so unkeyed hashes are easy to reverse): `ConfigError` reason `hashed-needs-secret`. `titleKey` is keyed with `secret` when one is set; without it, `titleKey` is a plain title check and the README says to keep it server-side. Normal-mode tails without a secret are 2 to 6 chars, so they confirm a guessed title only weakly (at t = 2 a wrong guess also matches with chance 1/560); the README states this.

---

## 14. Determinism and versioning

### 14.1 Determinism rules (lint + review)

- Banned in `src/**` (except `src/cli.ts`): `Math.random`, `Date`, `crypto`, `Intl`, `localeCompare`, `toLocaleLowerCase`, `toLocaleUpperCase`, `toUpperCase` (`ß` -> `SS`), `Intl.Segmenter`, `BigInt`, `TextEncoder`, `process`, `Buffer`, `require`, `node:*` imports. Enforced in two ways:
  - Biome `noRestrictedGlobals` / `noRestrictedImports` on the source (identifiers, not strings).
  - `test/dist-sandbox.test.ts`: loads `dist/index.cjs` and `dist/adapters/memory.cjs` with `node:vm` in a fresh context that has only `module`, `exports` and the ES globals. In that context `process`, `Buffer`, `require`, `crypto`, `TextEncoder`, `Intl`, `Date`, `BigInt` and `Math.random` are getters that throw. Then it runs the golden subset through `slug()` and a memory store. A text grep is not used, because data strings like "processing" or "date" would match.
- No floats in decisions. All scores and costs are integers.
- Every sort has full tie-breakers ending in a code-unit string compare.
- Store results are looked up by key, never used by iteration order.
- "Deterministic" means: same title, same config fingerprint, same store answers, same store tier (13.3), same `exclude` give the same result. Insertion order is part of the store state.

### 14.2 Versioning

1. IDs are generated once and stored. A title edit keeps the ID. Rows are retired, never deleted, so an ID is never handed out twice.
2. `ALGORITHM_VERSION = 1`. Stored with every row and returned in `SlugResult.algorithm`.
3. Everything that affects output lives in `src/data/v1/` (normalization tables, stop words, number words, noise, weak and doc-kind lists, legal forms, lexicon, qualifiers, compound parts, markers, months, weekdays, units, linkers, coda/onset tables, blocklists, tail alphabets, ranking constants, `LOG2_FRAC_Q8`, `K_V1`), in the built-in packs `src/lang/de.ts` and `src/lang/en.ts`, or is vendored (stemmers). User config (lexicon, stop words, deny tokens, packs) is covered by the config fingerprint, not by the data digest.
4. `V1_DATA_DIGEST` (hex SipHash of the canonical JSON of the v1 profile) is a constant in `src/data/v1/digest.ts`. A test recomputes it. Any edit to v1 data fails CI until the digest is updated on purpose.
5. Golden files `test/golden/v1.{exact,max,minimal,opaque,len24,underscore}.{independent,sequential}.json`: all fixtures, once each alone (empty memory store) and once through one memory store in fixture order, scope `'golden'`. The `opaque` goldens use the fixed test secret `golden-secret-0123456789`. Format `{ "<fixture id>": "<id>", ... }`.
6. Before 1.0: a minor version may change output. The changeset must say "ID output changed".
7. From 1.0: a change to the default output for the same input/config/store state is a **major** release, or ships as opt-in `algorithm: 2` in a minor release. v1 stays in the bundle for at least one more major. A CI script (`scripts/check-golden-changeset.ts`) fails a PR that changes `test/golden/v1.*` without a major changeset.
8. Exception: adding words to the v1 blocklist is allowed in a minor release. In the independent goldens (each fixture alone) the diff may only change IDs that contain the new word. In the sequential goldens (one store, fixture order) later IDs may change as a cascade, because one changed ID changes body counts for later titles; the check script only requires that the first changed ID in fixture order contains the new word.
9. `SlugResult.configFingerprint` = 16 hex chars of SipHash over the canonical JSON of the resolved config (functions are recorded as `"fn"`; language packs as their `code`, `id` and data, 6.7).

---

## 15. v1 data: lexicon and lists

### 15.1 Entry type

```ts
export type ConceptClass = 'topic' | 'name' | 'acronym' | 'attr' | 'qualifier' | 'place' | 'direction' | 'region'
  | 'marker' | 'year' | 'range' | 'quarter' | 'month' | 'week' | 'weekday' | 'version' | 'model'
  | 'longnum' | 'code' | 'quantity'
export type LexiconClass = 'topic' | 'name' | 'qualifier' | 'place' | 'direction' | 'region' | 'marker'

export interface LexiconEntry {
  key: string                       // ascii lemma: 'abteilung', 'machine learning'
  lang: Lang | '*'                  // required for built-in entries (6.1); user entries default '*'
  phrase?: readonly string[]        // multi-word match on ascii tokens
  forms?: readonly string[]         // extra ascii forms: plurals, combining forms
  abbr?: readonly string[]          // display rungs; cost 15 * index (11.1); for 'marker': abbr[0] is the prefix (5.3)
  known?: readonly string[]         // the subset of abbr that is well known (plain rung, no cryptic cost)
  cls: LexiconClass                 // 'attr', 'acronym' and the number classes are not allowed in the lexicon
  weak?: boolean                    // weak word (6.3): never in the pool, back-off only
  upperOnly?: boolean               // match only when the raw token is upper case ('IT', 'EU', 'US', 'DACH')
  lowerOnly?: boolean               // rev 3.1: match only when the raw token is lower case ('links', 'rechts')
  weight?: number                   // -100..100
  prior?: 'common' | 'medium' | 'rare'   // built-in default 'common', user default 'medium'
  part?: boolean                    // usable as compound part, default true for single words
  partOnly?: boolean                // 15.7 entries: cls 'topic', prior 'common'
  group?: string                    // merge key for synonyms
  pair?: string                     // rev 3.1, built-in weak and doc-kind entries only: key of the entry
                                    // with the same meaning in the other built-in language (15.6)
}
```

Rev 3 changes: `cls` uses the smaller `LexiconClass` (`org`, `doctype`, `action`, `activity` are gone; `name` and `marker` are new), `upperOnly` replaces the rev 2 note "`dach`, `us`, `eu` only in upper case", and built-in entries default to `prior: 'common'` (they are everyday words), while user entries default to `medium` (a user's domain words are usually more specific than everyday words). Rev 3.1: class `qualifier`, flag `lowerOnly`, field `pair`. `upperOnly` and `lowerOnly` together give `ConfigError` reason `invalid-lexicon`.

Rungs list short to long, and the order sets the cost. A full word of 6 chars or less is always an extra rung and need not be listed. Lookup by stem (4.4) uses the same entries; no extra data.

**Merge with user entries.** `cfg.lexicon` is merged over the built-ins by `key`: the same key replaces the built-in entry completely (so `{ key: 'team', lang: '*', cls: 'topic' }` makes `team` a normal word, not weak). New keys are added. Pack lexicons (6.7) merge the same way, before user entries.

### 15.2 Rules for built-in entries

The built-in lexicon is small on purpose. Every entry must pass the **cross-domain test**:
1. The word is general language (a word a general reader of that language uses), or an abbreviation that is used without explanation in at least three unrelated fields (checked against the `kind` values of the corpus).
2. No brand, product, person, company or city names. Regions only at country or continent level (15.5).
3. `known` only for abbreviations that a general reader of that language knows (`faq`, `hr`, `ki`, `kita`, `intl`). Office, club and company jargon (`va`, `ma`, `mv`, `jhv`, `gf`, `br`, `abt`) is not `known`: a reader outside that office cannot expand it. Every other `abbr` is cryptic (11.1).
4. Every entry has an explicit `lang` (6.1).
5. Every `abbr` passes B1, B2 and I8 (a unit test runs them on the data).
6. A group merges words with the same meaning in every field. A word whose compounds often mean something else does not join a group (`entwicklung` is not in group `dev`: `Stadtentwicklung` is urban planning, not software).
7. Data changes follow 14.2 (digest, goldens, changeset).

**Size.** The starting set below has about 250 entries (15.3 to 15.6, counting each key of a grouped row; forms are not counted). The target at 1.0 is about 400. Growth is driven by the corpus report (19.6): words that appear in at least three domains and get poor rungs or wrong classes. No single field drives growth. Field-specific words go into the README recipes (15.8), not into the core.

**Known abbreviations (v1).** These are marked `known` in their entries (bold in the tables below). A unit test checks that this list and the `known` fields agree.

```
admin agm ai allhands api apac app arch at auth ch config crm dach db de dept dev docs doku emea eng
env erp eu faq fin gov hr hw infra info intl intro it kickoff ki kita kpi lab latam mail mgmt ml
mktg mtg oss ops org perf poc pr prod qa retro roi sec seo spec stats sw tech ui uk uni us ux wip
```

Rev 3.1 removed `abt br gf jhv ma mv va` from this list (rule 3). Lookup step 0 (4.4) uses this list: an upper-case token equal to one of these abbreviations maps to its entry.

### 15.3 DE entries (`lang: 'de'`)

Prior `common` unless noted. `abbr` in rung order; `known` abbreviations in bold.

| key (forms) | cls | abbr | flags |
|---|---|---|---|
| abteilung (abteilungen) | topic | abt | |
| geschaeftsfuehrung | topic | gf | |
| verwaltung | topic | verw | |
| personalabteilung, personalwesen | topic | **hr** | group `hr` |
| buchhaltung | topic | buha | |
| entwicklung (entwicklungen) | topic | entw | no group (rule 15.2.6) |
| dokumentation | topic | **doku**, **docs** | group `docs` |
| veranstaltung (veranstaltungen) | topic | va | |
| weiterbildung | topic | wb | |
| universitaet | topic | **uni** | group `uni` |
| hochschule | topic | hs | |
| kindertagesstaette, kita | topic | **kita** | |
| kindergarten (kindergaerten) | topic | kiga | |
| krankenhaus (krankenhaeuser) | topic | kh | |
| mitarbeiter (mitarbeitende, mitarbeiterin, mitarbeiterinnen) | topic | ma | |
| betriebsrat | topic | br | |
| mitgliederversammlung | topic | mv | |
| jahreshauptversammlung | topic | jhv | |
| oeffentlichkeitsarbeit | topic | **pr** | |
| wissenschaft (wissenschaften) | topic | wiss | |
| gesellschaft | topic | ges | |
| technik | topic | **tech** | group `tech` |
| technologie (technologien) | topic | **tech** | group `tech` |
| kuenstliche intelligenz (phrase), ki | topic | **ki** | group `ai`, `upperOnly` for the single form `ki` |
| haeufig gestellte fragen (phrase) | topic | **faq** | group `faq` |
| erste hilfe (phrase) | topic | eh | |
| retrospektive (retrospektiven) | topic | **retro** | group `retro` (rev 3.1) |
| nord, sued, ost, mitte | direction | | prior medium (`west` is shared, 15.5) |
| nordost, nordwest, suedost, suedwest | direction | | prior medium |
| links, rechts | direction | | prior medium, `lowerOnly` (rev 3.1: `Knie links` is a direction, `Nützliche Links` is a noun) |
| deutschland | region | **de** | prior medium |
| oesterreich | region | **at** | prior medium |
| schweiz | region | **ch** | prior medium |
| europa (europaeisch, europaeische, europaeischen) | region | **eu** | prior medium, group `eu` |

### 15.4 EN entries (`lang: 'en'`)

| key (forms) | cls | abbr | flags |
|---|---|---|---|
| management | topic | **mgmt** | |
| development | topic | **dev** | group `dev` |
| documentation, docs | topic | **docs** | group `docs` |
| application (applications) | topic | **app** | group `app` |
| configuration, config | topic | **config** | |
| administration | topic | **admin** | `admin` is a reserved word (9.3); as one segment of a longer body it is fine |
| environment (environments) | topic | **env** | |
| production | topic | **prod** | |
| infrastructure | topic | **infra** | |
| technology (technologies), technical | topic | **tech** | group `tech` |
| department, dept | topic | **dept** | |
| human resources (phrase) | topic | **hr** | group `hr` |
| operations | topic | **ops** | |
| introduction | topic | **intro** | |
| specification (specifications), spec | topic | **spec** | |
| requirements | topic | reqs | |
| architecture | topic | **arch** | |
| database (databases) | topic | **db** | |
| authentication | topic | **auth** | `auth` is reserved as a whole ID (9.3) |
| performance | topic | **perf** | |
| security | topic | **sec** | |
| statistics | topic | **stats** | |
| laboratory | topic | **lab** | |
| university (universities) | topic | **uni** | group `uni` |
| government | topic | **gov** | |
| organization, organisation | topic | **org** | |
| association | topic | assoc | |
| artificial intelligence (phrase) | topic | **ai** | group `ai` |
| machine learning (phrase) | topic | **ml** | |
| user interface (phrase) | topic | **ui** | |
| user experience (phrase) | topic | **ux** | |
| frequently asked questions (phrase) | topic | **faq** | group `faq` |
| proof of concept (phrase) | topic | **poc** | |
| quality assurance (phrase) | topic | **qa** | |
| customer relationship management (phrase) | topic | **crm** | group `crm` |
| search engine optimization, search engine optimisation (phrase) | topic | **seo** | |
| key performance indicator, key performance indicators (phrase) | topic | **kpi** | |
| return on investment (phrase) | topic | **roi** | |
| pull request (phrase) | topic | **pr** | |
| open source (phrase) | topic | **oss** | |
| work in progress (phrase) | topic | **wip** | weak |
| all hands (phrase) | topic | **allhands** | |
| annual general meeting (phrase) | topic | **agm** | |
| retrospective, retro | topic | **retro** | group `retro` |
| finance, financial | topic | **fin** | |
| accounting | topic | acct | |
| engineering | topic | **eng** | |
| customer (customers) | topic | cust | |
| meeting (meetings) | topic | **mtg** | weak (15.6), pair `besprechung` |
| north, south, east, central | direction | | prior medium (`west` is shared, 15.5) |
| northeast, northwest, southeast, southwest | direction | | prior medium |
| left, right | direction | | prior medium (no stem lookup for directions, 4.4, so `Rights` stays a word) |
| united states (phrase), usa | region | **us** | prior medium, group `us` |
| united kingdom, great britain (phrase) | region | **uk** | prior medium, group `uk` |
| europe, european | region | **eu** | prior medium, group `eu` |

### 15.5 Shared entries (`lang: '*'`) and qualifiers

Same spelling and meaning in German and English. They add no language score (6.1).

| key (forms) | cls | abbr | flags |
|---|---|---|---|
| international (internationale, internationalen, internationaler) | topic | **intl** | |
| information (informationen, info, infos) | topic | **info** | weak |
| marketing | topic | **mktg** | |
| software | topic | **sw** | |
| hardware | topic | **hw** | |
| it | topic | **it** | `upperOnly` (`it` is an EN function word) |
| erp | topic | **erp** | |
| crm | topic | **crm** | group `crm` |
| api (apis) | topic | **api** | `api` is reserved as a whole ID (9.3) |
| app (apps) | topic | **app** | group `app` |
| email, e-mail, mail | topic | **mail** | |
| onboarding | topic | onb | |
| kick off, kickoff, kick-off | topic | **kickoff** | |
| workshop (workshops), webinar, newsletter, podcast | topic | | full word only; listed for `lang` and as parts |
| west | direction | | prior medium (rev 3.1: one entry for de and en) |
| emea, apac, latam | region | **emea**, **apac**, **latam** | prior medium |
| dachregion (dach) | region | **dach** | prior medium, `upperOnly`, `part: false` (rev 3.1: the key differs from the part `dach`, roof, 15.7; only upper-case `DACH` matches this entry) |
| eu | region | **eu** | prior medium, `upperOnly`, group `eu` |
| us | region | **us** | prior medium, `upperOnly` (`us` is a pronoun and an EN function word, 6.3), group `us` |
| uk | region | **uk** | prior medium, group `uk` |

**Qualifiers** (rev 3.1, class `qualifier`, slot Q, class weight 140, prior medium, kept in `minimal`). Generic words that say which kind of a thing a title is about. Full word only, no abbr.

| key (forms) | lang | group |
|---|---|---|
| intern (interne, interner, internes, internen) | de | `intern` |
| internal | en | `intern` |
| extern (externe, externer, externes, externen) | de | `extern` |
| external | en | `extern` |
| privat (private, privater, privates, privaten) | `*` (the DE form `private` is the EN word) | |
| oeffentlich (oeffentliche, oeffentlicher, oeffentliches, oeffentlichen) | de | `public` |
| public | en | `public` |
| klein (kleine, kleiner, kleines, kleinen) | de | `small` |
| small | en | `small` |
| gross (grosse, grosser, grosses, grossen) | de | `large` |
| large, big | en | `large` |
| online, offline, junior, senior, basic, premium | `*` | |

A qualifier as a compound modifier becomes its own concept (7.3: `Onlinekurs` -> `online` + `kurs`).

### 15.6 Weak words (`weak: true`) and doc-kind words

**Weak words.** Generic words that carry no topic in most fields. They are lexicon entries (cls `topic`, prior `common`, `weak: true`), so users override them by key.

```
de: bericht berichte uebersicht entwurf entwuerfe neu neue neuer neues neuen aktualisierung aktuell
    aktuelle aktueller aktuelles aktuellen allgemein allgemeine allgemeines sonstiges sonstige
    diverses thema themen notiz notizen hinweis hinweise zusammenfassung liste listen projekt
    projekte planung besprechung besprechungen sitzung sitzungen protokoll protokolle wichtig
    dringend woechentlich monatlich jaehrlich taeglich quartalsweise weltweit
en: report reports overview draft drafts new notes note summary general misc miscellaneous item items
    list lists topic topics project projects planning minutes session sessions current weekly
    monthly quarterly annual yearly daily global various important urgent
*:  update updates final team teams plan plans status asap
```

(Each line is a group of entries; inflected forms are `forms` of one entry, for example `neu` with forms `neue neuer neues neuen`. Weak entries with abbreviations are in the tables above: `meeting` (`mtg`, 15.4), `information` (`info`, 15.5), `work in progress` (`wip`, 15.4). `projekt` and `project` have the cryptic abbr `proj` for when the back-off restores them.)

Rev 3.1 changes: `hinweis hinweise` (pair of `notes`), `planning` (pair of `planung`), `minutes` (pair of `protokoll`), `session sessions` (pair of `sitzung`) and `current` (pair of `aktuell`) are new; `vorlage vorlagen` moved to the doc-kind words (with `template`); `asap` is shared; `other` is removed (it is an EN function word, so the weak entry never matched).

**Doc-kind words** (rev 3.1). Words that name the kind of text, not its topic. They are lexicon entries (cls `topic`, prior `common`, `weight: -60`, not weak): they stay in the pool and show when there is room, but the content words of the same title rank above them. Rev 3 had none, so with the position bonus `best`, `guide`, `tips`, `effects` or `checklist` often took the first segment.

```
de: leitfaden ratgeber anleitung anleitungen tipps tipp checkliste checklisten vorlage vorlagen
    formular formulare handbuch handbuecher beste besten bester bestes auswirkung auswirkungen
en: guide guides tips tip checklist checklists template templates form forms handbook handbooks
    manual manuals howto tutorial tutorials best ultimate effect effects
```

**Pairs.** Every built-in weak and doc-kind entry with `lang` `de` or `en` names its counterpart in the other language with `pair` (`vorlage` <-> `template`, `protokoll` <-> `minutes`, `planung` <-> `planning`, `hinweis` <-> `note`, `retrospektive` and `retrospective` share group `retro`). A unit test checks that every `pair` key exists, has the other language and the same kind (weak or doc-kind), and that every entry without `pair` is on the exception list with a reason. Exceptions in v1: `item items` (German titles use `Punkt`, which is too broad to be weak), `ultimate` (no common German title word), `ratgeber` (a second German word for `guide`), `misc miscellaneous various` and `sonstiges sonstige diverses` (three words on each side for one meaning; `misc` pairs with `sonstiges`, the rest are listed). `*` entries need no pair.

Rev 2 weak words that were procurement terms (`lieferung leistung dienstleistung beschaffung einkauf standort liegenschaft material bedarf supply purchase procurement site`) are gone.

### 15.7 Generic compound parts (no abbr, `part: true`, `partOnly: true`)

When one of these becomes a concept (for example the modifier of a weak head: `urlaubsplan` -> `urlaub`), it has `cls: 'topic'` and `prior: 'common'`. Words in the `de` lines have `lang: 'de'`; words in the `*` line have the same spelling and meaning in English and `lang: '*'`. 240 parts in rev 3.1 (rev 3 said "about 300"; its list had 248), chosen as everyday, business and tech words. No field-specific jargon.

```
de (home and living): haus wohnung miete zimmer kueche bad garten balkon keller dach fenster tuer
    wand boden moebel tisch stuhl bett schrank licht lampe strom wasser gas heizung waerme energie
    muell abfall nachbar umzug
de (mobility and places): auto fahrrad rad bahn zug flug flughafen hafen bahnhof strasse weg platz
    stadt dorf land kreis bezirk gemeinde ort reise urlaub ferien karte fahrt verkehr
de (food): essen speise kuchen brot apfel obst gemuese fleisch fisch milch kaffee tee wein bier
    rezept getraenk lebensmittel mittag abendessen fruehstueck
de (family, school, research): kind kinder eltern familie schule schueler lehrer klasse unterricht
    kurs lern lehr studium pruefung noten forschung studie labor wissen bildung buch
de (health and sport): arzt praxis klinik kranken pflege gesundheit medizin therapie
    notfall impf sport verein spiel mannschaft lauf turnier
de (work and everyday life): arbeit beruf stelle gruppe leitung fuehrung kunde kunden
    markt vertrieb verkauf handel laden produkt ware preis kosten geld bank konto zahlung
    rechnung steuer finanz haushalt vertrag recht gesetz gericht antrag brief post paket
    lager lieferung versand logistik reinigung reparatur hilfe beratung
    sicherheit schutz versicherung bau gespraech idee ziel loesung erfolg
de (tech and media): daten netz netzwerk seite rechner drucker telefon handy passwort zugang
    nutzer benutzer programm fehler schnittstelle speicher datenbank bild foto musik nachricht
    zeitung
de (time and events): zeit tag woche monat jahr morgen abend nacht sommer winter fruehling herbst
    fest feier geburtstag hochzeit messe ausstellung konzert termin kalender
de (nature): umwelt klima natur tier baum blume wald see berg meer wetter
*:  web server system service portal cloud test code film hotel ticket shop job budget fitness
    training video park bus student patient transport region
```

Rev 3.1 changes: removed `personal einkauf liefer wartung neubau umbau sanierung` (procurement and facility words, or a stem that is no word), `formular` (now a doc-kind entry), and `app software marketing team online` (duplicates of entries in 15.5 and 15.6, or now a qualifier); added `gespraech idee ziel loesung erfolg`; moved `student patient transport region` to the `*` line, because they are also English words and must not count as German in language detection (6.1).

Parts that are lexicon single words (15.3 to 15.6, including weak words, doc-kind words and qualifiers) are parts too, and `WEAK_HEADS` (7.1) are known parts. Parts-only entries of 6+ chars add a language score (6.1, rev 3.1); shorter ones add none, because many short German parts are also English words (`see`, `bad`, `tag`, `kind`). A unit test checks: no part is in the blocklist, no part makes an I8 pair, every part has a `lang`, no two built-in entries share a key (over 15.3 to 15.7), and no `de` part of 6+ chars is an EN stop word or an EN lexicon key or form.

**Frequency check** (rev 3.1, review step, not a CI gate). `scripts/check-parts-frequency.ts <list.txt>` checks that every `de` part is in the top 10,000 words of a general German word-frequency list (for example a news or web frequency list; the list is passed by path and not committed, because of its license). Allowed exceptions are the combining stems `lern lehr impf kranken finanz`. The PR template asks for the script output when a data PR adds parts.

Rev 2 parts that were procurement or building-trade jargon (`rahmen gleit klausel frist schalt umspann melde sprinkler trag aggregat ...`) are gone.

### 15.8 Domain recipes (README, not shipped)

The README shows how a field adds its own knowledge with generic config. These snippets are documentation only: they are not exported, not in the package, and not part of the v1 data digest. A test runs each snippet against a few synthetic titles so the README stays correct.

```ts
// Procurement (one field among many)
const procurement = createSlugger({
  lexicon: [
    { key: 'rahmenvertrag', lang: 'de', cls: 'topic', forms: ['rahmenvertraege'], abbr: ['rv'], known: ['rv'] },
    { key: 'leistungsverzeichnis', lang: 'de', cls: 'topic', abbr: ['lv'], known: ['lv'] },
    { key: 'lieferung', lang: 'de', cls: 'topic', weak: true },
    { key: 'standort', lang: 'de', cls: 'topic', forms: ['standorte'], weak: true },
    { key: 'los', lang: 'de', cls: 'marker', abbr: ['los'] },
  ],
})
procurement.slug('Rahmenvertrag Stromlieferung Standorte Nord 2026')   // 'rv-strom-nord-26'

// Software
const software = createSlugger({
  lexicon: [
    { key: 'kubernetes', cls: 'name', abbr: ['k8s'], known: ['k8s'] },
    { key: 'epic', lang: 'en', cls: 'topic', weak: true },
  ],
  reserved: { add: ['tickets', 'board'] },
})

// Medicine
const medicine = createSlugger({
  lexicon: [{ key: 'magnetresonanztomographie', lang: 'de', cls: 'topic', abbr: ['mrt'], known: ['mrt'] }],
  denyTokens: ['patient', 'patientin'],
})
```

### 15.9 Removed data (rev 2 sections 15.2 to 15.8)

The rev 2 tables "DE document types and actions", "DE topics and activities", "EN entries", "Places, directions, regions", "Extra compound parts", "Line suffixes" and "First names" are removed. Their content was procurement-specific (or, for first names, a person rule). Directions and regions moved to 15.3 to 15.5; everything else is gone. `src/data/v1/first-names.ts` and `line-suffixes` are never created.

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
| types | | `SluggerConfig`, `ResolvedConfig`, `SuggestOptions`, `GenerateOptions`, `CreateUniqueOptions`, `SlugResult`, `Segment`, `Explanation`, `Step`, `Analysis`, `SlugStore`, `StoreContext`, `SlugRecord`, `LexiconEntry`, `LexiconClass`, `ConceptClass`, `LanguagePack` (experimental), `Lang`, `DetectedLang`, `MaybePromise`, `AbortSignalLike` |

`Slugger` instance: `slug`, `suggest`, `explain`, `analyze`, `slugMany`, `generate`, `createUnique`, `candidates`, `isValid`, `config: ResolvedConfig`, `pattern: RegExp`, `fingerprint: string`.

Nothing runs at module top level. The default slugger and compiled data are built on first use (lazy), so `sideEffects: false` holds.

`semantic-slugger/data` exports the frozen v1 data (stop words, number words, noise words, legal forms, weak and doc-kind words, lexicon, qualifiers, parts, markers, months, weekdays, units, blocklists, reserved words, tail alphabets) for inspection and for building custom lists. It exports no domain packs.

### 16.2 Config

```ts
export type Lang = 'de' | 'en' | (string & {})        // built-in codes; more through languagePacks
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
  languages?: readonly Lang[]        // ['de','en']; enabled pack codes in priority order (6.1, 6.7)
  defaultLang?: Lang                 // 'de'; must be in languages
  languagePacks?: readonly LanguagePack[]   // experimental (6.7); extra languages
  detectLanguage?: (normalized: string) => DetectedLang | undefined
  transliterate?: (input: string) => string
  stopWords?: ListOption             // function and noise tiers (6.3)
  reserved?: ListOption
  blocklist?: { hard?: ListOption; soft?: ListOption }
  lexicon?: readonly LexiconEntry[]  // merged over built-ins by key; same key replaces (15.1)
  denyTokens?: readonly string[]     // always dropped (person names, code names), 6.6
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

Rev 3 removed `domainStopWords` (use `stopWords`), `weakWords` (use lexicon entries with `weak: true`) and `dropPersonNames` (no person rule; use `denyTokens`). They are unknown keys now (`ConfigError` reason `unknown-key`); there is no compatibility shim before 1.0.

**Where domain knowledge goes.** All of it goes through five generic options (`lexicon`, `stopWords`, `denyTokens`, `reserved`, `languagePacks`). The library has no field-specific option.

| Need | Option |
|---|---|
| a word with a known short form (`Rahmenvertrag` -> `rv`, `Kubernetes` -> `k8s`) | `lexicon` entry with `abbr` and `known` |
| a word that should count less or more | `lexicon` entry with `weight`, or `weak: true` |
| synonyms that should merge | `lexicon` entries with the same `group` |
| a product, company or project name the signals miss | `lexicon` entry with `cls: 'name'` |
| a place | `lexicon` entry with `cls: 'place'` |
| a word that says which kind (`intern`, `premium`, a field's own qualifiers) | `lexicon` entry with `cls: 'qualifier'` |
| a word that names the kind of text (`Merkblatt`, `Datasheet`) | `lexicon` entry with `weight: -60` (like the doc-kind words, 15.6) |
| a word that only counts in lower or upper case | `lexicon` entry with `lowerOnly` or `upperOnly` |
| a numbered part (`Los 3`, `Lot 2`) | `lexicon` entry with `cls: 'marker'` |
| words to drop | `stopWords` (`add`) |
| words that must never show (person names, code names) | `denyTokens` |
| words that must never be an ID | `reserved` |
| another language | `languagePacks` (experimental) |

Config validation (`ConfigError` with `details: { field, value, reason }`): range checks above, unknown keys rejected, only own enumerable keys read (no prototype pollution), list entries normalized and checked against `[a-z0-9]+`, `secret` length, `secret` required for `leak: 'opaque'` and `storeStems: 'hashed'` (13.6), `fallbackWord` not blocked or reserved, custom alphabet rules (2.2), `String.prototype.normalize` present (4.1), lexicon `cls` in `LexiconClass`, not both `upperOnly` and `lowerOnly` (reason `invalid-lexicon`), marker prefix rule (5.3, reason `invalid-marker-prefix`), lexicon `lang` is `*` or an enabled code (reason `unknown-language`), language codes and packs (6.7, reasons `unknown-language`, `builtin-pack`, `invalid-language-pack`).

Multi-tenant use: the scope is not hashed (C4), so the same title gives the same ID in every tenant when no tail is needed, and the same tail when one is. The README recommends one `secret` per tenant (for example derived from a server key and the tenant id) so tails, opaque IDs and `titleKey` differ between tenants. The body still shows the topic, which is the purpose of the library.

### 16.3 Result

```ts
export interface Segment {
  text: string
  kind: 'word' | 'number' | 'code' | 'fallback' | 'tail'
  cls?: ConceptClass
  source?: string                    // ascii source word, e.g. 'vertrieb'
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
  | { stage: 'language'; lang: DetectedLang; source: 'option' | 'hook' | 'heuristic' | 'default'; scores: Readonly<Record<string, number>>; reasons: string[] }
  | { stage: 'tokens'; tokens: { text: string; cls: string; lang: DetectedLang }[] }
  | { stage: 'phrases'; matches: { tokens: string[]; key: string }[] }
  | { stage: 'stopwords'; removed: { word: string; list: 'function' | 'conflict' | 'noise' | 'legal' | 'custom' | 'deny' }[]; weak: string[]; backoff?: string }
  | { stage: 'names'; names: { word: string; signal: 'inner-caps' | 'acronym' | 'legal-form' | 'sentence-case' | 'lexicon' }[] }
  | { stage: 'compounds'; splits: { word: string; parts: string[]; linkers: string[]; kept: string[] }[] }
  | { stage: 'concepts'; rows: { key: string; cls: ConceptClass; stems: string[]; tf: number; pos: number }[] }
  | { stage: 'rank'; df: 'store' | 'static'; N?: number; rows: { key: string; cls: string; base: number; rarity: number; pos: number; tf: number; lex: number; diff: number; score: number }[]; excluded: { key: string; why: 'weak' | 'below-100' | 'no-rung' | 'leak' | 'pool-full' }[] }
  | { stage: 'ladders'; rows: { key: string; rungs: { text: string; kind: string; cost: number; plain: boolean }[]; rejected: { text: string; rule: string }[] }[] }
  | { stage: 'fit'; best: { id: string; cost: number; parts: { rungs: number; cryptic: number; lost: number; chunks: number; tail: number } }[] }   // top 5
  | { stage: 'resolve'; tried: { id: string; status: 'ok' | 'taken' | 'body-taken' | 'reserved' | 'blocked' | 'excluded'; detail?: string }[] }

export interface Explanation { input: string; config: ResolvedConfig; steps: readonly Step[]; result: SlugResult; toString(): string; toJSON(): object }
```

Rev 3: `scores` is keyed by pack code (not fixed `de`/`en`), the stop word list `domain` is now `noise`, deny tokens show as `deny`, and the new `names` stage lists the name signals.

`toString()` example:

```
semantic-slugger v1 | length 16 exact | sep "-" | leak normal | fp 3f9a1c0e8b2d4a71
normalize   jahresbericht vertrieb nord 2026
language    de (heuristic)  de 2 / en 0   lex:nord compound:jahresbericht
stopwords   weak:jahresbericht
names       -
compounds   jahresbericht = jahr + es + bericht (all weak/generic: weak word)
rank        key             cls        base  rar  pos  tf  lex  diff  score
            vertrieb        topic       280   30   60   0    0     0    370
            y2026           year        160   75    0   0    0     0    235
            nord            direction   140   75    0   0    0     0    215
            excluded: jahresbericht (weak)
ladders     vertrieb: vertrieb(40) ver(110*) vert(110*) vtb(200*)  nord: nord(0)  y2026: 26(0) 2026(30)   (* = cryptic)
fit         vertrieb-nord-26 100 | vertrieb-nord-<t2> 525 | vertrieb-2026-<t2> 535 | ...
resolve     vertrieb-nord-26 ok (tier C, countBody 0)
result      vertrieb-nord-26  reason base  tail none
```

### 16.5 Errors

All extend `SluggerError` with `code: string`. `isSluggerError(e, code?)` checks a `Symbol.for('semantic-slugger.error')` brand, so it works across the ESM and CJS copies. The library never logs.

| Class | code | When |
|---|---|---|
| `ConfigError` | `E_CONFIG` | invalid config at `createSlugger` (incl. lexicon, marker and language pack checks), or `createUnique` without an insert path |
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
    normalize.ts translit.ts tokenize.ts lang.ts phrase.ts stopwords.ts names.ts
    compound.ts concepts.ts stem.ts rank.ts graphemes.ts cuts.ts skeleton.ts ladder.ts
    fit.ts resolve.ts tail.ts safety.ts invariants.ts empty.ts drivers.ts
  lang/
    pack.ts                  LanguagePack type, validation, resolve (6.7)
    de.ts en.ts              built-in packs (stop words, conflicts, hints, stemmer, compound data, months)
  hash/ siphash.ts encode.ts
  data/
    index.ts                 re-exports for "semantic-slugger/data"
    v1/ stop-de.ts stop-en.ts conflict.ts noise.ts legal.ts weak.ts dockind.ts lexicon-de.ts lexicon-en.ts
        lexicon-shared.ts qualifiers.ts markers.ts months.ts weekdays.ts units.ts number-words.ts
        parts-de.ts blocklist.ts reserved.ts translit.ts phonology.ts constants.ts digest.ts
  vendor/ cistem.ts (MIT header) porter2.ts (BSD-3 header)
  adapters/ memory.ts prisma.ts sql.ts
  cli.ts                     Node only, node:util parseArgs
examples/ prisma/schema.prisma  sql/schema.sql  express-route.ts
          recipes/procurement.ts recipes/software.ts recipes/medicine.ts   (15.8; repo only, not in the package)
playground/ index.html app.js style.css
scripts/ corpus-report.ts smoke.ts check-golden-changeset.ts update-digest.ts update-golden.ts serve-playground.ts
         clean.ts ref-acceptance.ts check-parts-frequency.ts
test/
  fixtures/titles.json
  unit/*.test.ts  unit/redos.test.ts  corpus.test.ts  golden.test.ts  props.test.ts  parity.test.ts
  safety.test.ts  quality.test.ts  expect.test.ts  recipes.test.ts  dist-sandbox.test.ts  bench/slug.bench.ts
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

Rev 3: `core/org.ts` is now `core/names.ts`; `data/v1/domain.ts`, `places.ts`, `parts.ts` are replaced by `noise.ts`, `lexicon-shared.ts`, `parts-de.ts`, `markers.ts`, `months.ts`; there is no `first-names.ts` and no line-suffix file; `src/lang/` is new.

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
  "description": "Short, readable, unique IDs from any title. German + English built in. Zero dependencies.",
  "license": "MIT",
  "type": "module",
  "sideEffects": false,
  "repository": { "type": "git", "url": "git+https://github.com/heikotroetsch/semantic-slugger.git" },
  "homepage": "https://heikotroetsch.github.io/semantic-slugger/",
  "bugs": "https://github.com/heikotroetsch/semantic-slugger/issues",
  "keywords": ["slug", "id", "short-id", "readable-id", "german", "english", "abbreviation", "unique"],
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

`.size-limit.json`: `dist/index.js` (import `{ slug }`) <= 30 KB min+gz including data and the `de`/`en` packs; `dist/adapters/memory.js` <= 1 KB; `prisma.js` <= 1.5 KB; `sql.js` <= 1.5 KB.

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
- Left: textarea, one title per line, prefilled with 24 corpus titles from at least 10 domains (blog, news, product, ticket, meeting, recipe, research, event, HR, medical, education, software, procurement, ...), DE and EN mixed. Controls: length (8 to 32), lengthMode, separator, leak (opaque uses a visible demo secret), tailAlphabet, consistentRungs, languages, custom stop words, deny tokens, reserved words, a lexicon JSON box (with the three recipes of 15.8 as presets), "simulate DB".
- Right: table with title, ID, lang, reason, tail yes/no. "Simulate DB" runs `createUnique` in order against `memoryStore()`.
- Click a row: `explain().toString()` and the rank table.
- State in `location.hash` so links can be shared (also the bug report format).
- Banner: "Runs fully in your browser. Do not paste confidential data."

### 18.8 CLI

```
npx semantic-slugger "Jahresbericht Vertrieb Nord 2026"
npx semantic-slugger --explain --length 20 --leak minimal "..."
cat titles.txt | npx semantic-slugger --unique --json     # one title per line, unique within the batch
npx semantic-slugger --lexicon ./my-lexicon.json "..."    # JSON array of LexiconEntry
```

Flags: `--length --mode --sep --leak --lang --explain --json --unique --secret-env <VAR> --lexicon <file> --deny <file>`.

### 18.9 README outline

1. Name, one-liner ("Short, readable, unique IDs from any title"), badges (npm, CI, size, provenance).
2. Before/after table: 10 synthetic titles from at least 8 fields (DE, EN, mixed, duplicate, non-Latin).
3. Install.
4. Quick start: `slug()` in 3 lines.
5. Uniqueness: `suggest({ taken })`, `generate` with a store, `createUnique` with Prisma (schema snippet), transaction recipe.
6. Config table (field, type, default, effect), generated from `DEFAULTS` by a script.
7. Teach it your field: the "where domain knowledge goes" table of 16.2 and the recipes of 15.8 (procurement, software, medicine). Clear statement: the core is generic, no domain packs ship.
8. How it works: pipeline diagram, slot order, fit, collision order (same content: same body + tail; different content: re-pick in tier C).
9. `explain()` example. CLI.
10. Collisions and races: UNIQUE constraint, retry, deterministic order, tail index, store tiers A/B/C and what changes between them.
11. Privacy: leak levels, `secret` (required for `opaque` and `hashed`; one per tenant for multi-tenant use), `storeStems: 'hashed'`, what the `stems` column and `titleKey` hold, names in IDs (6.6: names are kept in `normal`; `minimal` drops `name` concepts, but in German titles person and city names are plain topics and stay; use `denyTokens` for every name that must not show, in every language). IDs show up in URLs, logs and analytics, which matters under GDPR.
12. Browser and CDN use (`https://cdn.jsdelivr.net/npm/semantic-slugger@<ver>/+esm`). Playground link.
13. Writing your own adapter (only `exists` is required; the tier table of 13.3 says which features each optional method enables).
14. Other languages: `languagePacks` (experimental), with a short skeleton of a pack.
15. Edge cases table.
16. Stability and versioning policy.
17. FAQ: why not slugify/nanoid/sqids; why no `-2`; hyphen and double-click (use `_` or a copy button); `safe` vs `strict` alphabet (screen vs phone, spell with NATO alphabet); why a 16-char ID sometimes has a short tail (12.1).
18. Limits: de/en built in, non-Latin needs the hook or a pack, the built-in lexicon is small and generic (add your field's words with `lexicon`).
19. Credits and licenses: CISTEM (MIT), Snowball (BSD-3), sqids-blocklist (MIT), LDNOOBW (CC-BY-4.0).
20. Contributing: lexicon entry (cross-domain test, 15.2) -> `pnpm test:update` -> review `corpus.*.md` and golden diff. Only synthetic titles.

### 18.10 Repo hygiene

- PR template checkbox: "All new titles, names and lexicon entries are synthetic. No customer, patient, employee or other confidential data."
- PR template checkbox for data changes: "New built-in lexicon entries pass the cross-domain test (SPEC 15.2)."
- Issue template "Bad or ugly ID": synthetic title, field (domain), config, ID, expected ID, playground link, same warning.
- `SECURITY.md`: input cap, linear regexes, known-key config merge.
- `NOTICE`: all vendored sources and licenses.

---

## 19. Test plan

### 19.1 Unit (one file per stage)

Rev 3: unit tests describe their cases by content, not by fixture id. Where a case comes from the corpus, the test selects it by `group` or by the `expect` field (19.7), so a new corpus does not break the unit tests.

| Area | Cases |
|---|---|
| normalize | umlauts, `ẞ`, `Łódź`, zero-width chars, markup and entities, emoji, `C++`/`C#`/`.NET`, noise removal with the cases of 4.3 (long order numbers, year lists, `kw12 2026 2027 2028`, `500 €`, phone, IBAN, email, URL), case flags, `normalize` feature check, own `utf8()` against `TextEncoder` output (test only) |
| redos | every regex in `src/` against the adversarial set of 4.3, < 50 ms each; unregistered regex fails |
| translit | Cyrillic and Greek titles, a user `transliterate` hook, a pack `translit` table |
| tokenize | years, historic years (`1889`), dates, ranges (`2025/2026`, `2025/26`, `2026–2028`, wide `1950–2020` as two segments), quarters, KW/week, months (5.4: capitalized, next to a year, `may` the verb stays a word), weekdays (`Friday`, `Freitag`, `sat` alone stays a word), versions (`v2`, `v2.4`, `Version 2.4`, `Release 3`, `Release Notes` stays words, `Versionshinweise 5.1`, `Python 3.12` in an EN title, `42,5` stays noise), markers (`Teil 2`, `Part B`, `Part One`, `Sprint 14`, `Phase II`, `#4521`, `Größe M`, `Variante B`, `Klasse 4b`, `Art. 28`, `§ 5`, a user marker `Ticket 42`), topic-to-marker merge (`Sprintplanung Sprint 22`), model numbers (`Tavora Phone 8`, `Brightwave Pro 14`, none after a plain noun in a `de` title), number words (dropped; `Elf on the Shelf` keeps `elf`), quantities (`50 kg`, `10 Tagen`, `128 GB`, `85 m²`, `1,7 Liter` with no rung and no topic `liter`), `2 PM` (noise), longnum, codes and code runs (`PROJ-1234`, `COVID-19`, `TCP/IP`, `USB-C`, `ISO 9001`, `SKU A-4471`; `A/B-Test`, `Input/Output`, `Report(Final)` are words), Roman numerals and `[ilo]` tokens as noise |
| lang | mixed DE/EN titles, EN titles without function words, Title Case EN, conflict words (`Die Casting`, `Brightwave Pro 14` stay), Cyrillic tokens are `und` and not split, every built-in single-word entry has `lang`, a user pack (6.7) wins detection with its hints; ASCII-folded German gets `de` (`Sommerfest Gaertnerei Muenchen 2026` and the umlaut form give the same language), digraph exclusions (`blue`, `issues`, `Tuesday`, `steuer`), parts hits from 6 chars, compound hint from 8 chars, `und` plural fold (`Recipes` and `Recipe` share stems) |
| phrases | `machine learning`, `user experience`, `frequently asked questions`, `künstliche Intelligenz`, `kick off`, a user phrase entry |
| stopwords | back-off rows of 6.5; each conflict word is in the list of each language it belongs to; weak words never in the pool; weak and doc-kind pairs (15.6); doc-kind weight; noise words; legal forms (always and ambiguous: `Acme AG` vs `Limited Edition`, `Spa Weekend`); person titles dropped without the next token (`Dr. Weber` keeps `weber`); `MS Teams` keeps `ms`, `US` and `IT` reach the lexicon, `us` is a stop word; pronouns and contraction stems (`Mein erstes Jahr`, `Cannot reset password`, `Best Ever Banana Bread`); `stopWords` add/remove/function forms; attr detection (DE suffix only in lower case, `Wirtschaft`, `Leipzig` are not attr, DE lower case, EN suffix) |
| names | each signal of 6.6 (`iPhone`, `Acme Inc`, `Onboarding checklist for Acme`), no signal in Title Case EN, no signal 4 in `de` titles (`Befund` stays topic) or for weekdays and months, name rungs never equal a stop word or another entry, lexicon `cls: 'name'`; acronyms (`NASA`, `RAM`, `AGB` are class `acronym`, kept in `minimal`; exclusions `Q1`, `II`, `2 PM`); lookup step 0 (`SEO Keyword Research` keeps `seo`, `KPIs`, `PR` by title language); `denyTokens` single and multi-word, removed before phrase match, never restored by back-off, never in stems |
| compound | table 7.3 rows, linkers, no linker before first part, pass 2 rules (`lebensmittellager`, `xantoplex`, `postavki`), `WEAK_HEADS` union, all-weak compounds become weak words, generic modifiers on the part text (`jahres`), one concept per compound with morph and head rungs (`apfelkuchen` -> `apfelkuchen`, `apfel`, `kuchen`), morph and head rungs cryptic (`sommer`, `fest`) except the 7.3 case, joined abbr plain only with known pieces (`kitafest`), direction, region and qualifier modifiers as own concepts (`Norddeutschland`, `Süddeutschland`, `Onlinekurs`), hyphen tokens in EN and `und` (`Gluten-Free`), unknown hyphen head (`Mathe-Arbeitsblatt`), stem lookup (`umzuege`, `kaesten`, `besprechungen`), no stem lookup for directions (`Rights`), `lowerOnly` (`Nützliche Links`) |
| stem | CISTEM reference pairs from the paper/NLTK tests, Porter2 Snowball voc/output sample (500 words), pack stem output that is not `[a-z0-9]+` falls back to ascii |
| rank | integer formula, `ilog2q8` against `256 * Math.log2` within 23 units for 1..1e6, monotonic, tie-breakers, blend at N = 1, 200, 2000, fixed number rarity, class weights of 10.1, built-in vs user default prior, position bonus 60/30/15/8/4 for T concepts only (not attr), direction cancel by class (`nordost`, `links`), quantity in the pool at 125 |
| cuts/skeleton | ladder table 11 and section 12 examples, coda/onset rules, never end on vowel, `skeleton('kalender') === 'kldr'`, `skeleton('vertrieb') === 'vtb'`, abbr cost by index, plain vs cryptic, no zero-pad rung, `consistentRungs`, model bond (`phone8`; `polo1` removed by I8), wide range rung counts two segments |
| safety | section 9.2 expected behaviors, every B rule, I8 (also joined with `''`), B5 with soft words and `v->u` (`s3x`, `f4g`, `4ss`, `k4ck3`, `fvck`), B7 across body and tail (`...fo` + `tz3`), full enumeration of 2- and 3-char `safe` tails against a committed list; every built-in `abbr`, part and marker prefix passes B1, B2 and I8 |
| fit | the cost tables of 12.2, one candidate per subset, tie-break by rung cost in rank order (`firefox-rel-v132`), then by content rank, max mode tie-break, a model concept only with its word, lower-bound cut gives the same result as a full search (property over random pools), worst case under 10 ms with `maxSegments` 5 |
| siphash | 64 reference vectors on the 32-bit implementation; `divSmall` against a test-only BigInt reference; `makeTail` pinned outputs for 20 keys |
| resolve | each branch: base, repick (findByBody diff), shared-body with empty diff (identical title, case variant, plural variant), shared-body in tier B, tier A walk, tail-grown via `refitWithTail` (12.2 B), exhausted (tier A after `maxScan`), exclude, reserved in max mode; a sibling that differs in one direction word shows that word after re-pick; hashed stems compare (`storeStems: 'hashed'`) |
| config | every `ConfigError` reason (incl. `opaque-needs-secret`, `hashed-needs-secret`, `runtime-no-normalize`, alphabet rules, `invalid-marker-prefix`, `unknown-language`, `builtin-pack`, `invalid-language-pack`), unknown keys (incl. the removed `domainStopWords`, `weakWords`, `dropPersonNames`), lexicon `cls: 'org'` and `cls: 'acronym'` rejected, `cls: 'qualifier'` accepted, `upperOnly` with `lowerOnly` rejected, prototype keys ignored |
| recipes | each README recipe of 15.8 gives its documented output; the procurement recipe separates `Los 1` and `Los 2` (the Q6 case skipped in default config, 19.7) |
| data | no two built-in entries share a key (15.3 to 15.7); `known` list equals the `known` fields; weak and doc-kind pairs (15.6); every abbr, part, unit short form and marker prefix passes B1, B2, I8 |

### 19.2 Corpus snapshots

- `corpus.independent.md` (`toMatchFileSnapshot`): every fixture alone, empty store, exact 16. Markdown table `id | lang | kind | title | slug | reason | rungs`, grouped by `kind`.
- `corpus.sequential.md`: all fixtures through `createUnique` with one `memoryStore`, in fixture order.
- `expect.test.ts`: every fixture with an `expect` field (19.7) is checked: body equal, tail length equal, in the stated mode (alone or after the listed fixtures).
- Golden JSON files (14.2) for exact, max, minimal, opaque, length 24, separator `_`.

### 19.3 Property tests (fast-check, 1000 runs in CI, seed printed)

```ts
const word = fc.constantFrom(...lexiconWords, ...partWords, ...stopWords, 'München', 'Süd', '2026', 'März', 'v2.4', 'Teil', 'iPhone', 'NASA', 'GmbH', '🚚', 'Москва', 'ß', 'Analyse', 'Fickenscher')
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

- Memory (tier C): insert `Chocolate Cake Recipe` 2,000 times. All IDs unique, at most 3 tail indexes tried per insert, tail grows at n = 35 (t=3) and n = 980 (t=4).
- Exists-only store (tier A): the same title 64 times works, the 65th throws `ExhaustedError` with a hint to use a counting store.
- pglite + SQL adapter: 50 parallel `createUnique` with the same title. All succeed, all unique, <= 5 retries each.
- pglite + Prisma-shaped delegate (a small fake that implements the delegate on SQL): conflict inside a transaction is retried, no `25P02`. A real `@prisma/client` test runs only in an optional CI job.

### 19.5 Package and runtime tests

- publint + attw (inside tsdown), `git diff --exit-code package.json`.
- `scripts/smoke.ts`: `pnpm pack`, install the tarball into 4 fixtures (ESM Node, CJS `require`, TS `node16`, TS `bundler`). Each runs `slug('Jahresbericht Vertrieb Nord 2026')` and compares to the golden value. It also runs the installed bin (`npx semantic-slugger "Jahresbericht Vertrieb Nord 2026"` and `--json`), checks the output, checks the shebang of `dist/cli.js`, and checks `sourcesContent` in the maps.
- Browser parity (`test/browser/golden.browser.test.ts`, vitest browser mode with the Playwright provider, chromium, firefox and webkit): the golden subset (independent goldens of all `edge` fixtures plus 60 content titles from at least 10 domains) gives the same IDs as in Node. happy-dom is not used, because it runs in Node's V8 and does not test ICU, `\p{Extended_Pictographic}` data or Safari.
- `dist-sandbox.test.ts` (14.1): the CJS builds run in a `node:vm` context where `process`, `Buffer`, `require`, `crypto`, `TextEncoder`, `Intl`, `Date`, `BigInt` and `Math.random` throw.
- Data digest test.
- Type tests (`expectTypeOf`): `createUnique<T>` returns `record: T | undefined`, config keys are strict, `ListOption` forms.

### 19.6 Quality metrics (`scripts/corpus-report.ts`, gated in `quality.test.ts`)

"Content titles" = fixtures with `kind !== 'edge'`. "Domain" = the fixture `kind`. Default config unless noted. All gates are computed over the multi-domain corpus of 19.7; the report also prints every metric per domain. Rev 3.1: Q1 and Q2 check the ranker against itself, so the readability gate is Q19, which checks the ID against words a native reader expects (fixture field `keep`).

| # | Metric | Definition | Target (gate) |
|---|---|---|---|
| Q1 | Recognizable token | ID has at least one segment that is a lexicon abbr of a title concept, or a prefix (3+ chars) of a title word or compound part (ascii) | >= 95% (gate), aim 98%. A sanity check only: it passes for bodies a reader cannot use; Q19 is the readability gate |
| Q2 | Top concept kept | top-ranked pool concept appears in the ID | report (rev 3.1: it measures the fit against the ranker, not the result against a reader) |
| Q3 | Skeleton share | segments with rung `skeleton` / all body segments | <= 5% (gate) |
| Q4 | Padding tail rate | exact, independent: IDs with a tail that is not caused by a collision, overall and per domain | report until M4. At M4 the gate is set from the measured value (overall and per domain, rounded up to the next 5%) and written into this table; it may only go down later. Rev 3 had a 45% gate copied from the rev 2 procurement corpus; on the new corpus 23% of content titles have 2 or fewer content words and always get a padding tail |
| Q5 | Collision fallback rate | sequential: titles with `reason: 'shared-body'` whose stems differ from the rows on that body (a content collision that re-pick did not solve). Same-stem titles (`dup-*` and `norm-*` groups and real `near` pairs, 19.7) are not counted, because sharing the body is the wanted result for them. Group siblings (rows with `vary`) are counted | <= 3% (gate) |
| Q6 | Sibling distinguishability | sequential, per sibling `group` (19.7): for each pair of siblings whose **canonical titles** (4.1) differ, the IDs differ in at least one body segment whose concept is in one title and not in the other. A pair whose only difference is a token the core drops by design counts as a failure, unless the group has `skip.Q6` (19.7) | >= 90% (gate); skipped pairs at most 3% of all sibling pairs |
| Q7 | Avg semantic segments | mean body segments over content titles | 2.5 to 3.5 (gate); max = `maxSegments` |
| Q8 | Normalization | each `norm-*` group (for example `norm-variants`) alone: identical IDs | 100% (gate) |
| Q9 | Uniqueness | sequential: all IDs distinct | 100% (gate) |
| Q10 | Bad words | full blocklist scan, hard words with no exceptions | 0 hits (gate) |
| Q11 | Re-pick share | sequential: `reason: 'repick'` / collisions | report |
| Q12 | Speed | `suggest()` median and p99 on Node 22 | median < 200 µs, p99 < 2 ms (bench, not gating); worst-case fit with pool 6 and `maxSegments` 5 < 10 ms (gate) |
| Q13 | Human review | for each language of the corpus, a native reader of the title's language (not necessarily an expert of the title's field) rates every ID of the full report: 1 = know it, 2 = can guess, 3 = no idea. Mixed titles are rated by a native reader of the title's detected language | >= 85% rated 1 before 1.0, and >= 75% rated 1 in every domain (manual) |
| Q14 | Same title, same content | sequential: rows with identical canonical titles, and real `near` pairs (19.7) with the same stems, have the same content key; if the first row's body has a tail, the bodies are equal | 100% (gate) |
| Q15 | Expected outputs | fixtures with `expect` (19.7) match | 100% (gate) |
| Q16 | (removed in rev 3) | was "org consistency"; there is no org class | - |
| Q17 | Spelling consistency | per concept over the corpus: share of IDs that use the concept's most common rung | report (input for Q9 of section 22) |
| Q18 | Domain balance | Q1 per domain with at least 15 content titles; Q19 per domain with at least 10 `keep` titles | Q1 >= 90% and Q19 >= 75% in every such domain (gate) |
| Q19 | Expected word kept (rev 3.1) | exact, independent, over content titles with `keep` (19.7): at least one `keep` word is visible in the ID. A word is visible when a body segment (or one part of a joined segment, for example `phone` in `phone8`) equals its ascii form, equals a lexicon abbr of its entry (`mktg` for `Marketing`), is a prefix of 3+ chars of it (`choc` for `chocolate`), or contains it as a whole compound part (`sommerfest` for `sommer`). A head or morph rung of another part does not count (`fest` does not show `sommer`) | >= 85% overall and >= 75% per domain with 10+ `keep` titles (gate from M4) |

The report also lists: rung kind mix, % plain rungs, IDs per reason, IDs per store tier, IDs per class mix (how often `name`, `code`, `month`, `version` show), and the 20 worst IDs by fit cost, overall and per domain.

### 19.7 Fixture corpus (rev 3, all synthetic)

The rev 2 corpus (407 titles, mostly procurement) is replaced by a multi-domain corpus in the same file `test/fixtures/titles.json`, written by a teammate in parallel to this revision. The schema is the rev 2 schema minus the `org` field, plus (rev 3.1) the fields `vary`, `keep` and `skip`:

```ts
interface Fixture {
  id: string                          // unique; tests never depend on specific ids
  lang: 'de' | 'en' | 'mixed'
  kind: string                        // the domain, e.g. 'blog' | 'news' | 'product' | 'ticket' | 'meeting' | 'recipe'
                                      // | 'research' | 'event' | 'legal' | 'hr' | 'medical' | 'education'
                                      // | 'software' | 'procurement' | ... ; 'edge' for edge cases
  title: string
  group?: string                      // sibling or variant group (conventions below)
  vary?: string                       // rev 3.1: what differs between the siblings of the group, a free label
                                      // ('year' | 'part' | 'edition' | 'variant' | 'direction' | 'city' | ...); report only
  near?: string                       // ONLY the id of another fixture that is a near-duplicate with the same stems
                                      // (plural, case, word order); never a label
  keep?: string[]                     // rev 3.1: title words (or compound parts) a native reader expects to see
                                      // in the ID, as typed in the title; Q19
  skip?: { Q6?: string }              // rev 3.1: the gate is not checked for this group; the value is the reason
  expect?: {                          // checked by expect.test.ts (Q15)
    body: string; tail: number        // tail = tail length (0 = none)
    after?: string[]                  // ids inserted before, in this order (default: alone)
    config?: Partial<SluggerConfig>   // default config if absent
  }
}
```

Rev 3 used `near` for labels (`'year'`, `'part'`, `'variant'`, `'norm'`, ...) on all 121 group rows. Then the check "every `near` id exists" fails, Q5 excluded every sibling and tested nothing, and Q14 compared siblings that are not near-duplicates. Rev 3.1 moves the labels to `vary`; `near` holds only ids.

At the time of writing the corpus has 533 titles: 450 content titles in 19 domains (blog, news, product, ticket, meeting, recipe, research, event, legal, HR, medical, education, software, finance, marketing, real estate, procurement, travel, project) and 83 edge cases; about 44% `de`, 44% `en`, 11% `mixed`. These numbers are information, not gates.

Corpus requirements (checked by `test/fixtures.test.ts`, which replaces the rev 2 count checks of 407 and 340):
- At least 12 content domains. No domain has more than 15% of the content titles. `procurement` has at most 10%.
- Languages: at least 35% `de`, at least 35% `en`, at least 5% `mixed`.
- Ids are unique. Every `near` and every `expect.after` id exists, and a `near` target is not the row itself. `kind` and `lang` are set on every entry.
- At least 10 real `near` pairs (rows with `near`), covering plural, case and word order.
- `keep` is set on at least 150 content titles and on at least 10 titles of every content domain. Every `keep` word occurs in its title (compared after `toCanonical`, 4.1, as a whole token or a compound part).
- `skip` is set only on rows with a sibling `group`, all rows of the group carry the same `skip`, the reason is not empty, and skipped sibling pairs are at most 3% of all sibling pairs.
- Only synthetic titles and invented names (public repo rule).

Group conventions (normative, used by Q5, Q6, Q8, Q14):
- `dup-<name>`: identical titles (sharing the body is wanted).
- `norm-<name>` (the corpus uses `norm-variants`): case, spacing, umlaut and `ß` variants of one title (Q8: identical IDs alone).
- any other group name: siblings that follow one pattern and differ in one or two concepts (`<domain>-<topic>-<what differs>`, for example `news-storm-direction`, `software-release-version`). Q6 runs over these, in default config. A group whose difference only a user config can show (a field rule) carries `skip.Q6` with the reason; its config is tested in `recipes.test.ts` or by `expect.config` rows. The two skipped groups at rev 3.1 are the floor group (`1. OG` vs `3. OG`: the CR removed floor codes, and an ordinal before a word is noise) and the `Los 1` / `Los 2` group (needs the procurement recipe marker `los`).

Coverage the corpus must have (not by id; by content):

| Purpose | Kinds of titles |
|---|---|
| siblings | at least 6 domains with sibling groups (same pattern, one concept differs: a direction, a month, a weekday, a version, a name, a number, a size or variant letter, a model number, a quantity) |
| names | inner-caps product names, company names before a legal form, person names in sentence-case EN, Title Case EN without signals, DE titles with city and person names |
| acronyms | technical acronyms (`RAM`, `VPN`, `NDA`), known abbreviations typed in capitals (`SEO`, `HR`, `KPI`), `2 PM` |
| time and numbers | years, historic years, wide ranges (`1950–2020`), quarters, months (DE and EN, with and without year, and with a year so the `26mrz` / `26mar` bond is tested), weekdays, weeks, versions (with `v`, after a version word, decimal after a name or version compound), markers (incl. `Phase II`, `Part One`, `Größe M`, `Art. 28`), ticket keys in the `PROJ-1234` form, long numbers, quantities (integer, decimal, `m²`), model numbers (`Phone 8`) |
| compounds | DE compounds with weak heads, generic modifiers, two strong parts, three or more parts, direction modifiers (`Norddeutschland`), hyphenated (DE and EN), inflected heads |
| duplicates | `dup-*` groups of 2 to 5 titles, real `near` pairs (plural, case, word order) |
| privacy | titles where `denyTokens` and `leak: 'minimal'` matter (synthetic person names, DE and EN) |
| edge | empty, whitespace, ZWSP, function words only, noise only, numbers only, legal forms only, umlauts, `ẞ`, Cyrillic, Greek, CJK, Arabic, emoji, markup, entities, `C++`/`C#`, look-alike junk, blocklist traps (`Analyseplattform`, `Cockpit`, `Scunthorpe`, `Shiitake`), reserved words, very long compounds, Roman numerals, code runs, slash and bracket words (`A/B-Test`, `Input/Output`), money, percent, phone, IBAN, email, URL, dates |

Rev 3.1 corpus work (part of M1.5, section 23 #18): rename `near` to `vary` on the group rows, add the missing coverage (month with year in DE and EN, real near pairs, `Phase II`, `PROJ-1234`-style keys, historic years, model numbers), set `keep` and `skip`, and keep the domain and language shares.

`expect` rows: the `ref` rows of section 20 are added as fixtures with `expect` at M4, after `scripts/ref-acceptance.ts` confirms them.

---

## 20. Acceptance examples (guidance until regenerated)

Default config: length 16, exact, `-`, leak `normal`, no store df (priors only), unless the row says otherwise. `[tN]` = a tail of N chars from the safe alphabet (first char a consonant). "Alone" = empty memory store. "After X" = inserted in order into one memory store. The body and the tail length are the target. Tail chars depend on the hash.

Rev 3: all rows are new. The titles are illustrative and come from many fields; they are not tied to fixture ids. Rows that are also in the corpus get an `expect` field at M4 (19.7). Rev 3.1: every row was checked against I1 (in exact mode 16 a body is exactly 16 chars, or 13 or less plus a tail of 16 - 1 - body length) and recomputed with the rev 3.1 rules; several rev 3 values were impossible (17 chars, or 14 to 15 chars without a tail).

**Status column.**
- `ref` = hand-computed with the rev 3.1 rules of sections 5 to 13 (cost in the note).
- `unv` = unverified target. The rules may give something else; the note says what the hand computation gives.

At M4, `scripts/ref-acceptance.ts` (a small, separate re-implementation of ranking, ladders and fit cost from this spec, not importing `src/core`) recomputes every row and prints both values. It also checks I1 and I2 on every expected value, `ref` and `unv`, for the row's mode and length, and fails on a value that cannot occur. Section 20 is then regenerated from it, and any row where the reference and `src` disagree is a bug in one of them. Reviewers may accept a different body if it is at least as readable and the metrics hold.

### 20.1 German

| # | Field | Title | Expected | Status | Note |
|---|---|---|---|---|---|
| 1 | finance | Jahresbericht Vertrieb Nord 2026 | `vertrieb-nord-26` | ref | 100 (12.2 A); `jahresbericht` is a weak word |
| 2 | finance | Jahresbericht Vertrieb Süd 2026, after 1 | `vertrieb-sued-26` | ref | free body, reason `base`; never `sd` |
| 3 | finance | Jahresbericht Vertrieb Nord 2026, after 1 | `ver-nord-2026-[t2]` | ref | 490 (12.2 B); diff empty, reason `shared-body`, warning `tail-grown` |
| 4 | recipe | Rezept Apfelkuchen mit Zimt | `apfelkuchen-zimt` | ref | 410: one compound concept (7.3), `rezept` (370) lost; nothing with all three concepts fits 16 (`rezept-apfel-zimt` is 17) |
| 5 | event | Sommerfest 2026 | `sommerfest-26-[t2]` | ref | 290; language `de` by the compound hint (8+ chars, 6.1); `sommerfest` is one concept (`sommer` + `fest`), full word 40; the morph rung `sommer` and the head rung `fest` are cryptic (100), so `sommer-2026-[t4]` costs 480 |
| 6 | medical | MRT Knie links | `mrt-knie-[t7]`; max mode `mrt-knie-links` | ref | exact 715 (`links` 215 lost, no 16-char body exists); max 60. `MRT` is an acronym (360), `links` a direction (lower case, `lowerOnly`). Q1 data point |
| 7 | procurement | Rahmenvertrag Stromlieferung Standorte Nord 2026, with the procurement recipe (15.8) | `rv-strom-nord-26` | ref | 120; `rv` (user entry, prior medium) 415, `strom` 340 (head `lieferung` weak by the recipe), `y2026` 235, `nord` 215; title order puts `rv` first |
| 8 | procurement | same title, default config | `vertrag-strom-26` | unv | hand result about 800: three compound concepts (`rahmen`+`vertrag`, `strom`+`lieferung`, `stand`+`orte`), cryptic head and morph rungs, `standorte` and `nord` lost; `vertrag-stand-26` (815) and `rahmen-nord-2026` (855) are close. Shows why a field adds a lexicon |
| 9 | hr | Mitarbeitergespräch Anna Weber 2026, with `denyTokens: ['anna', 'weber']` | `mitarb-2026-[t4]` | unv | hand result 510; the names never show. `mitarbeitergespraech` does not split (`gespraech` is a part only from rev 3.1 on, and then the rules give `gespraech-26-[t3]` at 400; check at M4). Without deny tokens the names are plain topics in a `de` title, also in `minimal` (6.6) |
| 10 | education | Elternabend Klasse 4b Grundschule Nord | `elternabend-nord` | unv | `Klasse 4b` is the marker `kla4b` (255). Hand result: `abend-kla4b-nord` (500) and `abend-grund-nord` (515) beat `elternabend-nord` (635), because a cryptic head rung (100) costs less than losing `grundschule` (340). Input for the head-rung cost at M8 (Q19 data) |
| 11 | legal | Mietvertrag Wohnung Kassel 2026 | `miet-kassel-2026` | ref | 530: `mietvertrag` one compound concept, morph rung `miet` cryptic (100), `kassel` an unknown topic (full word 0), `wohnung` (340) lost. `mietvertrag-26-[t2]` would be 17 chars; `mietvertrag-2026` costs 725 |
| 12 | meeting | Protokoll Teamsitzung 12.03.2026 | `protok-team-2026` | ref | 320: only weak words, so the back-off restores `protokoll` and `teamsitzung`; the date gives the year only. `protok` coda cut 130, `team` morph rung cryptic (4 chars) 100, `2026` 30, chunks 60. `protokoll-team-26` would be 17 chars |
| 13 | software | Versionshinweise 5.1 | `versionshinweise` | ref | 235: decimal version after a version compound (5.4) gives `v51` (195, lost); the all-weak compound is restored by the back-off. `hinweise-v51-[t3]` 360 |
| 14 | software | Versionshinweise 5.2, after 13 | `hinweise-v52-[t3]` | ref | 360, reason `repick`: the diff boosts `v52` to 495, so keeping `versionshinweise` costs 535. Head rung `hinweise` is plain (the other part `version` is a noise word, 7.3) |
| 15 | meeting | Sprintplanung Sprint 22 | `sprint22-[t7]` | ref | 500: the topic `sprint` (modifier of the weak head `planung`) merges into the marker `sprint22` (5.3), tf 2, score 295. Rev 3 gave `sprint-[t9]` (855) and lost the number |

### 20.2 English and mixed

| # | Field | Title | Expected | Status | Note |
|---|---|---|---|---|---|
| 16 | marketing | Q3 2026 Marketing Budget Review | `mktg-budget-26q3` | ref | 375 (12.2 C) |
| 17 | recipe | Chocolate Cake Recipe | `choc-cake-recipe` | ref | 190 (12.2 D); language `und` |
| 18 | software | Firefox v132 Release Notes | `firefox-rel-v132` | ref | 230; tie with `fir-release-v132` (230) broken by rung cost in rank order (12); `notes` weak |
| 19 | travel | Trip report from Lisbon | `trip-lisbon-[t4]` | ref | 350; sentence case makes `Lisbon` a name (410); max mode `trip-lisbon` |
| 20 | travel | Trip report from Porto, after 19 | `trip-porto-[t5]` | ref | free body; siblings differ in the name |
| 21 | hr | Onboarding checklist for Acme Corp | `onb-check-acme` (max mode) | unv | max 250. Exact: `onboar-chct-acme` (450). `checklist` is a doc-kind word (270), `Acme` a name (sentence case and legal form). M8: a cap on cryptic segments per ID, Q1 |
| 22 | ticket | PROJ-1234 Checkout fails in Safari | `check-safari-[t3]` | unv | about 935: code run `proj1234` (slot Q, 175) lost, `fails` lost. The title is `und` (no hint), so `fails` is a topic, and `fails-safari-[t3]` (835) may win; an EN verb rule is out of scope for v1. A code can never be the first segment while a T concept is in the body (2.1) |
| 23 | research | Effects of Sleep on Memory in Older Adults | `eff-sleep-memory` | unv | hand result about 800: `effects` is a doc-kind word (310), the decreasing position bonus keeps `memory` ahead of `older` and `adults`; `sleep-memory-old` (804) and `sleep-mem-adults` (808) are close. Rev 3 listed `sleep-memory-[t4]`, which is 17 chars |
| 24 | news | Storm warning for the north coast | `storm-warn-coast` | ref | 405: `warn` coda cut 130, chunks 60, `north` (215) lost; `storm-warn-north` 505. Rev 3 listed `storm-north-coast` (17 chars) |
| 25 | software | Kubernetes Upgrade Plan Q3 2026, with the software recipe (15.8) | `k8s-upgrade-26q3` | ref | 100: `kubernetes` lexicon name with known `k8s`, `upgrade` 40, bond `26q3`, chunks 60; `plan` weak |
| 26 | mixed | Kick-off Meeting KI Strategie Q1 2026 | `kickoff-ki-strat` | ref | 640: `kick off` phrase (known `kickoff`), `meeting` weak, `KI` known (`upperOnly`), `strat` coda cut 130, chunks 60, year and quarter (450) lost. Rev 3 listed `ki-strategie-26q1` (17 chars) |
| 27 | mixed | Release 2.4 Hinweise zur Migration | `migration-v24-[t2]` | ref | 290: `Release 2.4` is a version, `hinweise` is weak (rev 3.1, pair of `notes`). Rev 3 listed `migration-v24`, 13 chars without a tail |
| 28 | event | Team Lunch Friday | `lunch-friday-[t3]` | ref | 300: `team` weak, `friday` a weekday (175, full word 0). `lunch-fri-[t6]` 450 |
| 29 | event | Team Lunch Monday, after 28 | `lunch-monday-[t3]` | ref | free body, reason `base`; siblings differ in the weekday |
| 30 | legal | AGB Version 3.1 | `agb-v31-[t8]`; leak minimal `agb-[t12]` | ref | `AGB` is an acronym (kept in `minimal`); `Version 3.1` a version (dropped in `minimal`). Exact 550; minimal 750. Rev 3 gave an empty body in `minimal` |

### 20.3 Edge cases

| # | Title | Expected | Status |
|---|---|---|---|
| 31 | empty, spaces, tabs, ZWSP | `doc-[t12]` | ref |
| 32 | `der die das`, `und oder für mit von der`, `the and of` | `doc-[t12]` | ref |
| 33 | `GmbH AG Inc Ltd` (only legal forms) | `doc-[t12]` | ref |
| 34 | `Vertrag GmbH AG` | `vertrag-[t8]` | ref (590; `vertrag` is a normal part now, not a domain stop word) |
| 35 | `Vertrag_v2_FINAL_final(3).docx` | `vertrag-v2-[t5]` | ref (440; `v2` is a version, `final` weak, `docx` noise; `final(3).docx` has no upper-case letter, so it is no code run) |
| 36 | `Datei.pdf` | `datei-[t10]` | ref (only noise words: the back-off restores `datei`) |
| 37 | `2026` | `doc-2026-[t7]` | ref |
| 38 | `2025 2026 2027` | `doc-25-26-27-[t3]` | unv |
| 39 | `12345` | `doc-2345-[t7]` | ref |
| 40 | `Öl` | `oel-[t12]` | ref |
| 41 | `⚡️ Strom 2026 🔌` | `strom-2026-[t5]` | ref (430) |
| 42 | emoji only, punctuation only, look-alike junk | `doc-[t12]` | ref |
| 43 | Договор поставки электроэнергии 2026 | `dogovor-postavki` | unv (16 chars; tokens `und`, not split; hand result: cuts like `dog-post-elek-26` (about 530) beat it (630); input for the cryptic cap of Q1) |
| 44 | 电力供应框架协议 2026 | `doc-2026-[t7]`, warning `script-dropped` | ref |
| 45 | an Arabic title vs a CJK title, both without Latin letters | different tails | ref |
| 46 | `new` | `new-[t12]`; max mode `new-[t2]` | ref (`new` is weak, restored by the back-off; reserved in max mode) |
| 47 | STRASSE Strasse Straße STRAẞE | `strasse-[t8]` (one concept, tf 4) | ref |
| 48 | Teil 1 Teil 2 Teil 3 | `pt1-pt2-pt3-[t4]` | ref (410; markers start with a letter, so no `doc`) |
| 49 | row 1, leak opaque, secret set | `[t16]` | ref |
| 50 | row 1, max mode | `vertrieb-nord-26` | ref |
| 51 | row 16, max mode | `mktg-budget-26q3` | ref |
| 52 | row 1, leak minimal | `vertrieb-nord-26` | ref (no `name`, code or marker in the title) |

Rev 3.1 renumbered the rows (new rows 13 to 15 and 28 to 30). Section 22 (Q1, Q17) and Appendix B cite rows by the new numbers.

---

## 21. Milestones (build order)

Each milestone ends with green CI and a short changeset (pre-1.0, private until M7).

| M | Scope | Done when |
|---|---|---|
| M0 Scaffold | git init, package.json, pnpm, tsdown, tsconfigs, biome, vitest, size-limit, changesets, CI workflow, LICENSE, NOTICE, empty barrel, fixture file, PR/issue templates | done (`aa18096`) |
| M1 Hash + format | SipHash-2-4 + vectors, tail encoder, alphabets, `TAIL_BLOCK`, invariants, `isValidSlug`, config validation, errors, empty/opaque path | done (`aa18096`); rev 3 follow-ups in section 23 |
| M1.5 Rev 3 alignment | the code changes of section 23 (config keys, classes, lexicon validation, wording in repo docs, fixture schema and corpus fixes, fixture test) | `pnpm build && pnpm test && pnpm lint && pnpm typecheck` green; no procurement wording in `src/` (code, comments, data), `README.md` outside the recipe section, `CONTRIBUTING.md`, templates and `docs/`. Allowed: SPEC.md, the recipe example files `examples/recipes/*`, procurement titles in the corpus (one domain of many, at most 10%), and the hash-input strings of section 23 #11 |
| M2 Data v1 + language | normalize (ordered noise removal, protected spans, case flags), translit, tokenize (code runs, months, weekdays, versions, quantities, model numbers, number words, markers), `src/lang/` with the `de` and `en` packs and `LanguagePack` validation, all v1 lists (sections 6 and 15), vendored CISTEM + Porter2, language detection with `lang` on every entry and the rev 3.1 hints, lookup step 0, phrases, stop words, attr words, name signals, acronyms, deny tokens, back-off | unit tests for sections 4 to 6 green; ReDoS harness green; digest test in place; `fixtures.test.ts` corpus requirements (19.7) green |
| M3 Compounds + concepts + rank | two-pass splitter, concept rules incl. one concept per compound and direction, region and qualifier modifiers, topic-to-marker merge, lexicon-free stored stems with the `und` plural fold, stem lookup, integer ranking with priors, blend and the decreasing position bonus | compound and rank unit tests green; `analyze()` public |
| M4 Ladders + safety + fit | graphemes, cuts, skeleton, number rungs, plain/cryptic costs, blocklist checks, bounded fit search with the rev 3 tie-break, `suggest()` / `slug()` without store; `scripts/ref-acceptance.ts` | independent corpus snapshot written; section 20 regenerated from the reference script and `src` agree, and the script's I1 check passes on every row; `ref` rows moved to fixture `expect`; Q1 to Q4, Q7, Q8, Q10, Q15, Q18, Q19 measured; the Q4 gate is set from the measured values (19.6) |
| M5 Resolve + memory | sans-IO resolve, store tiers, sync `taken` driver, memory adapter, `generate`, `createUnique`, `slugMany`, tail index, re-pick, tail growth | sequential snapshot; Q5, Q6 (with `skip`), Q9, Q14 gates; tier parity properties; stress test |
| M6 DB adapters | SQL adapter, Prisma adapter, pglite integration, race tests, Prisma schema + SQL examples | integration tests green on Node 22.18 and 24 |
| M7 DX + release | `explain()` + `toString`, CLI (incl. `--lexicon`, `--deny`), playground + Pages, README with the domain recipes (15.8) and `recipes.test.ts`, smoke fixtures (incl. bin), Playwright browser job, dist sandbox test, size budgets, release workflow gated on CI, publish `0.0.1` by hand, trusted publisher, `0.1.0` via changesets | npm package with provenance, playground live |
| M8 Quality loop + freeze | corpus report review per domain, lexicon growth to about 400 entries by the cross-domain test (15.2), the `unv` rows of section 20, human rating (Q13) per language, golden files for all configs, golden-changeset guard, decision on `languagePacks` stability | Q1 to Q19 targets met (Q16 removed); no `unv` rows left; `1.0.0` |

---

## 22. Open questions for the product owner

| # | Question | Default in this spec |
|---|---|---|
| Q1 | `exact` or `max` as the default? Exact pads many IDs with a code that only fills space (rev 3.1: the rate on the new corpus is measured at M4, Q4; 23% of content titles have 2 or fewer content words and always get a tail). Short everyday words often give bodies of 14 or 15 chars, which cannot take a tail (`MRT Knie links` -> `mrt-knie-[t7]` in exact, `mrt-knie-links` in max; section 20 rows 6, 19, 21). Exact mode also prefers cut-heavy bodies when a word does not fit (rows 21, 43). | `exact` (PO request), with the length policy of 12.1. `max` documented as "readable" preset. Q4 data per domain goes to the PO at M4. |
| Q2 | Separator and double-click: `-` selects one segment on double-click; `_` or `''` select the whole ID but leave `[a-z0-9-]`. | `-`, with `_` and `''` as options and a README tip for a copy button. |
| Q3 | Names (companies, products, people) in `normal` leak level? | **Answered (rev 3):** allowed, they are the best discriminator ("supplier names are okay"). Dropped in `minimal`. Person names: `denyTokens`. |
| Q4 | (rev 2) City short forms (`muc`, `ffm`). | **Obsolete:** no built-in city table. |
| Q5 | (rev 2) `rv` for Rahmenvertrag and Rahmenvereinbarung. | **Obsolete:** procurement lexicon removed; a user lexicon decides (same `group` merges). |
| Q6 | Rarity from the DB makes new IDs depend on scope history. OK? | Yes. `rarity: 'static'` gives fully reproducible IDs. In rev 3 store df matters more, because the built-in lexicon is small. |
| Q7 | Identical titles: always a new ID, or offer `onDuplicateTitle: 'return-existing'` via `titleKey`? | Always a new ID in v1. |
| Q8 | Require `secret` when `leak: 'opaque'`? | Answered in rev 2: required (`ConfigError`), also for `storeStems: 'hashed'` (13.6). |
| Q9 | `consistentRungs` on by default? One spelling per concept in all IDs (`mktg` everywhere) costs more tails. | Off. Decide with the Q17 report at M8. |
| Q10 | (rev 2) Drop person names by default (first-name rule)? | **Obsolete:** no person rule. Users set `denyTokens` (every language) or `leak: 'minimal'` (drops `name` concepts, so it helps only where names are detected, mostly EN sentence case); the README privacy section says so. |
| Q11 | (rev 2) Building-type places below cities. | **Obsolete:** no built-in places. |
| Q12 | German name detection uses only positive signals (inner caps, before a legal form, lexicon). So `Kassel` or `Weber` in a German title is a plain topic, not a name, and `minimal` keeps it. OK, or do we want a heuristic that marks some capitalized German words as names (and drops them in `minimal`)? | Positive signals only (6.6). Store df ranks rare words up anyway. The README and 6.6 say clearly that `denyTokens` is the tool for names (rev 3.1). |
| Q13 | Month + year bond: `26mrz` (year first, like `26q1`) or `mrz26`? | `26mrz`, consistent with `26q1`. |
| Q14 | `languagePacks`: public and experimental in 0.x, or internal until 1.0? | Public, marked experimental; not under the stability promise until declared stable at M8. |
| Q15 | Code segments up to 8 chars (so ticket keys like `proj1234` show), rev 2 had 6. OK? | 8. |
| Q16 | Package wording: description "Short, readable, unique IDs from any title. German + English built in." and keywords without `procurement`. OK? | Yes (section 23). |
| Q17 | (rev 3.1) Compound head and morph rungs are cryptic now. In `Elternabend Klasse 4b Grundschule Nord` (section 20 row 10) a head rung (`abend`) still beats the full word. Raise their cost, or drop head rungs when the modifier is strong? | Cryptic at cost 60 (7.3, 11.1). Decide at M8 with Q19 and Q13 data. |

---

## 23. Rev 3 impact on M0-M1 code

M0 and M1 are implemented and committed (`aa18096`). Rev 3 needs these changes before M2 starts (milestone M1.5). None of them changes an ID that M1 can produce today (empty and opaque IDs depend only on the canonical title, the key and the tail rules); only `configFingerprint` values change, because the config shape changes.

| # | File | Change | Why (section) |
|---|---|---|---|
| 1 | `src/config.ts` | `ConceptClass`: remove `org`, `action`, `activity`, `doctype`; add `name`, `month`, `version` and (rev 3.1) `acronym`, `qualifier`, `weekday`, `model`. Add `export type LexiconClass = 'topic' \| 'name' \| 'qualifier' \| 'place' \| 'direction' \| 'region' \| 'marker'`. | 5.2, 15.1 |
| 2 | `src/config.ts` | `CONCEPT_CLASSES` (the set used to validate lexicon `cls`) becomes the `LexiconClass` set. It currently allows `org`, `action`, `activity`, `doctype`, `year`, `range`, `quarter`, `week`, `longnum`, `code`, `quantity`; number classes are not lexicon classes. Rename it `LEXICON_CLASSES`. | 15.1 |
| 3 | `src/config.ts` | `LexiconEntry`: `cls: LexiconClass`, `lang: Lang \| '*'`, new optional `upperOnly: boolean` and (rev 3.1) `lowerOnly: boolean` (validate with `bool`, add to the boolean key loop; both true gives `invalid-lexicon`), and (rev 3.1) optional `pair: string` (validated like `group`). For `cls: 'marker'`: `abbr` is required and `abbr[0]` must match `^[a-z]{0,5}[a-hj-km-np-z]$`, else reason `invalid-marker-prefix`. | 5.3, 15.1 |
| 4 | `src/config.ts` | Remove `domainStopWords`, `weakWords`, `dropPersonNames` from `SluggerConfig`, `ResolvedConfig`, `DefaultKeys`, `DEFAULTS`, `KNOWN_KEYS`, `LIST_DEFAULTS` and `resolveConfig`. They become unknown keys (`unknown-key`). `LIST_DEFAULTS` keeps only `stopWords`; its comment points to 6.3. | 6.3, 6.6, 16.2 |
| 5 | `src/config.ts` | `Lang` becomes `'de' \| 'en' \| (string & {})`. Add `languagePacks?: readonly LanguagePack[]` to `SluggerConfig` and `KNOWN_KEYS`. In M1.5 a minimal validator: array of plain objects with `code` (`/^[a-z]{2,3}$/`, not `und`, not `de`/`en` -> `builtin-pack`), `id` (non-empty string), `stopWords` (string list) and `stem` (function), else `invalid-language-pack`; full validation lands in M2 (`src/lang/pack.ts`). `resolveLanguages` accepts built-in codes and pack codes (else `unknown-language`) and keeps the given priority order instead of sorting to `['de', 'en']`; `defaultLang` must be in that list (existing reason `default-lang-not-enabled`). Lexicon `lang` must be `*` or an enabled code (`unknown-language`). `ResolvedConfig` gains `languagePacks` (frozen). | 6.7, 16.2 |
| 6 | `src/config.ts` | Default `prior` handling: user entries keep "no prior means `medium`" (no stored default, as today). Built-in entries get `prior: 'common'` filled in by the data loader in M2, not by `resolveLexicon`. No change now; note for M2. | 15.1 |
| 7 | `src/index.ts` | Export the type `LexiconClass`; export `LanguagePack` once `src/lang/pack.ts` exists (M1.5 can export a type-only stub). | 16.1 |
| 8 | `src/data/v1/blocklist.ts` | Header comment: "common inside normal German or English procurement words" -> "common inside normal German or English words". Comment only; no data change. | 15.2 |
| 9 | `test/unit/config.test.ts` | Remove `dropPersonNames` from the DEFAULTS expectation and from the "all fields" case; remove `domainStopWords` and `weakWords` from that case and the `cfg.domainStopWords` assertion; move the `not-boolean` case to another boolean (`consistentRungs`). Add cases: the three removed keys give `unknown-key`; lexicon `cls: 'org'` and `cls: 'year'` give `invalid-lexicon`; `cls: 'name'`, `cls: 'qualifier'` and `cls: 'marker'` (with a valid prefix) pass; `cls: 'acronym'` gives `invalid-lexicon`; `upperOnly` with `lowerOnly` gives `invalid-lexicon`; marker prefixes `vol`, `teil` give `invalid-marker-prefix`; `upperOnly` boolean check; `languages: ['en', 'de']` keeps the order; `languages: ['fr']` without a pack gives `unknown-language`; a pack with code `de` gives `builtin-pack`. The test strings `denyTokens: ['Fickenscher', 'Müller']` and lexicon key `strom` can stay (neutral). | 16.2 |
| 10 | `test/fixtures.test.ts` | Replace the fixed counts (407 titles, ids `t001..t407`, 340 content titles) by the corpus requirements of 19.7: unique ids, required fields, at least 12 content domains, no domain over 15%, procurement at most 10%, language shares, every `near` id exists and is not the row itself, at least 10 `near` pairs, `keep` on 150+ content titles and 10+ per domain, `keep` words occur in the title, `skip` rules. Add `vary?`, `near?`, `keep?`, `skip?` and `expect?` to the local `Fixture` type. | 19.7 |
| 11 | `test/unit/siphash.test.ts`, `test/unit/tail.test.ts`, `test/unit/invariants.test.ts`, `test/unit/empty.test.ts` | They use strings like `rahmenvertrag stromlieferung standorte nord 2026` and `strom-rv-nord-26` only as hash inputs and format samples. No behavior depends on them. Keep them (the pinned `makeTail` outputs depend on the inputs); optionally replace the format samples in `invariants.test.ts` with `vertrieb-nord-26`. | - |
| 12 | `package.json` | `description`: "Short, readable, unique IDs from any title. German + English built in. Zero dependencies." `keywords`: drop `procurement`; use `slug, id, short-id, readable-id, german, english, abbreviation, unique`. | 18.3, Q16 |
| 13 | `README.md` | One-liner as in `description`; example `Jahresbericht Vertrieb Nord 2026` -> `vertrieb-nord-26` (rev 2: `Rahmenvertrag ...` -> `strom-rv-nord-26`). | 1, 18.9 |
| 14 | `CONTRIBUTING.md`, `.github/pull_request_template.md`, `.github/ISSUE_TEMPLATE/bad-id.yml`, `.github/ISSUE_TEMPLATE/bug.yml` | "real contract titles, supplier names or customer data" -> "real customer, patient, employee or other confidential data, or real names". Add the cross-domain test checkbox (18.10) and a "field (domain)" input to `bad-id.yml`. | 18.10 |
| 15 | `docs/DEVIATIONS.md` | Entry 20 (lists default to empty until M2) mentions `domainStopWords` and `weakWords`: add a rev 3 note that these options are removed. Entry 10 (impossible opaque example) is resolved by the new example in 2.1. | 2.1, 16.2 |
| 16 | `src/core/*`, `src/hash/*`, `src/data/v1/constants.ts`, `src/data/v1/reserved.ts`, `src/errors.ts`, `src/result.ts` | No change. The tail hash, alphabets, invariants, blocklist checks, reserved words, fallback word `doc` and error classes are domain-neutral. | 2, 9, 13 |
| 17 | `.changeset/` | Add a changeset for M1.5: "Config: removed `domainStopWords`, `weakWords`, `dropPersonNames`; lexicon classes changed (`qualifier` added); lexicon flags `lowerOnly` and `pair`; `languagePacks` (experimental). Config fingerprints change. ID output unchanged." | 14.2 |
| 18 | `test/fixtures/titles.json` (rev 3.1) | (a) On every row whose `near` is a label (`part year edition variant exact norm city direction quarter week version issue number term region`), move the value to `vary` and remove `near` (121 rows at rev 3). (b) Add at least 10 real near-duplicate pairs with `near: <id>` (plural, case, word order; for example `Chocolate Cake Recipes` near `Chocolate Cake Recipe`). (c) Add the missing coverage of 19.7: titles with month and year in DE and EN (`Newsletter März 2026`, `Board Minutes March 2026`), `Phase II`, `PROJ-1234`-style ticket keys, historic years, model numbers, a decimal quantity, `A/B-Test`. (d) Set `keep` on at least 150 content titles, at least 10 per domain, written by a native reader of the title's language. (e) Set `skip: { Q6: '...' }` on the floor group (`1. OG` / `3. OG`) and the `Los 1` / `Los 2` group. (f) Keep the domain and language shares of 19.7 (procurement at most 10%). The rev 3.1 review numbers (68 sibling pairs, 23% short titles) refer to the corpus before these fixes. | 19.6, 19.7 |
| 19 | `.github/pull_request_template.md` (rev 3.1) | Add to the data checkbox: "New compound parts: output of `scripts/check-parts-frequency.ts` attached (15.7)." | 15.7, 18.10 |

---

## Appendix A. Review decisions (rev 2)

Issue numbers follow the rev 1 review. A = accepted, P = accepted in part or with a different fix, R = rejected.

**Rev 3 status.** Rows marked **[obsolete rev 3]** no longer apply, because the rule they decided was removed with the procurement-specific logic (see "Rev 3 changes"). Rows marked **[changed rev 3]** still apply in a generic form; the note says what changed. All other rows stay valid as written. Fixture ids in this appendix (`t001`, `t388`, ...) refer to the rev 2 corpus and are history only.

| # | Issue | Decision | Why / where |
|---|---|---|---|
| 1 | Acceptance table not computed with own formulas | A | Section 20 rows hand-recomputed with rev 2 rules and marked `ref` or `unv`; `scripts/ref-acceptance.ts` regenerates them at M4 (21). **[changed rev 3]** Section 20 rewritten with illustrative multi-domain titles; the reference script rule stays. |
| 2 | Weak words under-specified, enter pool and `lost` | A | Weak concepts are out of the pool and out of `lost`; only the back-off restores them (6.3, 6.5, 10.4). **[changed rev 3]** Weak words are now lexicon entries with `weak: true` (15.6); the pool rule is unchanged. |
| 3 | Class/prior missing for parts, numbers, place markers | A | Parts-only: topic + prior common (7.3, 15.7; rev 3 wrote 15.6). Number classes: fixed rarity 50. Place markers re-class only unknown proper-noun candidates (10.1). **[changed rev 3]** Parts-only and number-class rules stay; place markers are removed (no built-in places). |
| 4 | Small text errors, undefined functions | A | Explain example fixed (16.4), `lfrt` (11.4), `refitWithTail` defined, `idNoTail` removed (13.2). |
| 5 | Within-slot order by score | A | Order inside a slot is title position; score only picks concepts (2.1, C7). |
| 6 | Unknown words outrank lexicon words | A | Unknown words weight 220, prior 40; new `attr` class with DE/EN suffix and lower-case rules (6.4, 10.1). **[changed rev 3]** Weights retuned for a generic lexicon (10.1): lexicon topic 280, unknown 240, name 260. |
| 7 | `isProperNoun` useless in German | A | DE: only org-adjacent, or capitalized, not splittable, no lexicon match; EN Title Case gives no signal (10.2). **[obsolete rev 3]** `isProperNoun` is replaced by the positive name signals of 6.6; DE titles have no case-only signal. |
| 8 | EN entries untagged, `und` split as German | A | Every built-in entry has `lang`; extra EN endings; `und` and transliterated tokens never split (6.1, 15.4). **[changed rev 3]** Language tags stay; detection is generalized to packs (6.1, 6.7). |
| 9 | DE stop list missing words | A | Added `ab also bin binnen ca die fast hat man oder seit war will`; unit test per conflict word (6.3). **[changed rev 3]** Person titles added to the function lists (6.3). |
| 10 | Lexicon lookup exact only | A | Stem index fallback for tokens of 5+ chars (4.4). |
| 11 | Rarity swings at small N | A | Integer blend with k = 200 (10.2). |
| 12 | ReDoS in email regex | A | Bounded pattern; one harness for every regex in `src/` (4.3). |
| 13 | Phone regex eats PO numbers and years | A | Phone needs leading `+`/`0` and a separator, year groups rejected; number spans protected before money/percent (4.3). |
| 14 | Money regex `\b` after `€` | A | Unicode edge lookahead (4.3). |
| 15 | IBAN regex matches `kw12 2026 ...` | P | Fixed by a SEPA country list (no `kw`) and 4-char groups; IBAN runs before masking so real IBAN groups like `2013` are not masked first (4.3). **[changed rev 3]** IBAN rule unchanged; the `kw` example is generic. |
| 16 | Code fragments become junk words | A | Code runs joined first; Roman numerals and short `[ilo]` tokens are noise (5.1, 5.2). **[changed rev 3]** Code display limit raised from 6 to 8 chars (5.2). |
| 17 | Missing units and payment terms | A | Units added; payment-term pattern is noise (4.3, 5.2). **[changed rev 3]** Units stay (generic list); the payment-term pattern is removed. |
| 18 | Ambiguous legal forms | P | Accepted with a changed condition: the previous token must be capitalized (not "non-lexicon", which would break `Grauwacke Beton AG`); floors added to the lexicon (6.3, 15.5). **[obsolete rev 3]** Floor entries are gone; ambiguous legal forms use the simpler rule of 6.3. |
| 19 | Org walk picks wrong token | P | Accepted, but the proposed stop rule fails on `Beton AG` and `Nordlicht` (lexicon and splittable). New rule: skip line words, then take one name token (6.6, 15.7); checked on all 14 listed fixtures. **[obsolete rev 3]** No org walk, no line words (6.6). |
| 20 | Org morph cuts read as other words | A | Org tokens not split; org rungs equal to another class or a stop word removed; full name up to 10 chars (6.6). **[changed rev 3]** Org rungs become name rungs (6.6): no split, full word up to 12 chars, rungs equal to a stop word or another entry removed. |
| 21 | DP prefers known + unknown | P | Two passes: known parts only, then one unknown modifier (5+ chars) + known head. Weak heads are allowed as head (else `Analyseplattform` gives no concept), which the review did not allow (7.2). **[changed rev 3]** Two passes stay; weak heads are generic (7.1); 2+ strong parts now give one concept (7.3). |
| 22 | `WEAK_HEADS` and weak list differ | A | `WEAK_HEADS` = union of list, weak words, domain words (7.1). **[changed rev 3]** `WEAK_HEADS` = generic list + weak words + noise words. |
| 23 | All-weak compounds, `ersatz` modifier | A | All-weak/domain compound becomes a domain word; `ersatzteil` entry, `ersatz` removed from modifiers (7.3, 15.3). **[changed rev 3]** All-weak compounds become weak words (not domain stop words); the `ersatzteil` entry is gone. |
| 24 | All abbreviations cost 0 | A | Cost 15 per list index, +40 per cryptic segment, `known` list, `consistentRungs` option (11.1, 15.1). **[changed rev 3]** Cost rules stay; the known list is the generic list of 15.2. |
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
| 40 | Person names leak | A | First-name list rule, `denyTokens` documented, fixtures added (6.6, 15.8, 19.7). **[obsolete rev 3]** The first-name rule is removed; `denyTokens` and `leak: 'minimal'` stay as the privacy tools (6.6). |
| 41 | Same title same ID in every tenant | P | README recommends a per-tenant `secret` (16.2). `hashScope` option rejected: a per-tenant secret does the same with no new option. |
| 42 | tsdown exports format vs hand map | A | tsdown owns `exports`, `main`, `module`, `types`; hand map removed; publint/attw validate (18.3). |
| 43 | Build output risks | A | Separate clean step, `fixedExtension: false` for the CLI, smoke runs the bin, Pages copies all of `dist/` (18.3, 18.6, 19.5). |
| 44 | Browser and runtime gaps | A | Own UTF-8 encoder, SipHash on 32-bit halves, Playwright browser job (3 engines), `normalize` feature check (4.1, 13.1, 18.4, 19.5). |
| 45 | `dist` grep false positives | A | `node:vm` sandbox test plus Biome identifier rules (14.1). |
| 46 | Packaging items | A | `devEngines`, `.nvmrc`, `erasableSyntaxOnly`, release gated on CI with tests, `sourcesContent`, CHECK generated from separator (17.3, 18.2 to 18.5). |
| J1 | No expected outputs in fixtures | A | Optional `expect` field and `expect.test.ts`, gate Q15 (19.7). |
| J2 | No near-duplicate or same-supplier links | A | `near` and `org` fields; Q6, Q14, Q16 use them (19.6, 19.7). **[changed rev 3]** `near` stays; the `org` field and gate Q16 are removed. |
| J3 | Missing fixture kinds | A | New synthetic fixtures t408 onward for persons, floors, Roman numerals, umlaut plurals, money, adjectives, direction-word orgs, code runs, phone/IBAN (19.7). **[changed rev 3]** The rev 2 extra fixtures are replaced by the multi-domain corpus and its coverage table (19.7). |

Changes found while recomputing section 20 (not in the review). **Rev 3:** the org items, place markers, building-type places, the `gaa`/`pgk` known abbreviations and the floor-related items are obsolete; `upperOnly` replaces the `dach`/`us`/`eu` note; the tail start and length rule of 13.4 stays. pass 2 allows weak heads (t384); content line words stay as concepts at -50 (t388, t059); org full name up to 10 chars and stop-word org rungs removed (t063); place markers re-class only proper-noun candidates (t390); an abbr equal to a compound part is plain (t018, t030); building-type places get prior common (t007, Q11); `dach`, `us`, `eu` regions only in upper case; `gaa`, `pgk` added to the known list; the tail start index and tail length are counted again on the final body, so tiers agree for identical titles and the load rule holds after a refit (13.4).

---

## Appendix B. Review decisions (rev 3)

Issue numbers follow the review of rev 3. A = accepted, P = accepted in part or with a different fix, R = rejected. Fixture ids (`t065`, `t446`, ...) refer to the corpus at rev 3, before the fixes of section 23 #18.

| # | Issue | Decision | Why / where |
|---|---|---|---|
| 1 | `near` holds labels, not ids | A | Labels move to the new field `vary`; `near` holds only ids; at least 10 real near pairs; Q5 counts siblings again (19.6, 19.7, 23 #18). |
| 2 | Q6 fails or passes falsely | A | Q6 compares canonical titles; issues 8 to 10 fix 4 of the 6 pairs (quantity, size, variant, decimal version); the floor and `Los` groups carry `skip.Q6` with a reason (field rules), capped at 3% of pairs (19.6, 19.7). |
| 3 | Q1 and Q2 measure the ranker against itself | P | New field `keep` and gate Q19 (>= 85% overall, >= 75% per domain); Q2 is report only. Per-domain Q19 applies to domains with 10+ `keep` titles, and the corpus must have 10+ per domain, so the per-domain number is not noise (19.6, 19.7). |
| 4 | Q4 gate copied from the rev 2 corpus | A | Q4 is report only until M4, then the gate is set from the measured value, overall and per domain (19.6, 21). |
| 5 | Coverage gaps | A | Month with year, near pairs, `Phase II`, `PROJ-1234` keys added to the coverage table and to the corpus work list (19.7, 23 #18). |
| 6 | Short upper-case words become top-ranked names | P | New class `acronym` (slot T, weight 240, prior unknown, kept in `minimal`); name signal 2 removed. `am`/`pm` are noise only after a time number, because `PM` alone often means project or product manager (5.2, 6.6, 10). |
| 7 | Known abbreviations typed in capitals are lost | A | Lookup step 0 maps an upper-case token (also with a plural `s`) to the entry with that `known` abbr; 6.6 wording fixed. `SEO Keyword Research` now has the `seo` concept; the fit still picks `keyword-research` (450) over `seo-keyword-[t4]` (705), which Q19 accepts (4.4). |
| 8 | Bare numbers and missing generic markers | P | All proposed markers added (prefix `kla`, not `kl`, because a prefix may not end in `l`). Model numbers are a class `model` (weight 120), but they always join their word (`phone8`) and never stand alone, and in `de` titles they follow only names and acronyms, because every German noun is capitalized. Historic years `1500` to `1899` get a 4-digit rung (5.1, 5.2, 5.3, 5.4, 11.5). |
| 9 | Quantity rules contradict each other | P | Quantities enter the pool at 125 with key `q<number><unit>`; units extended (incl. `m2`); quantities are found before decimals. A decimal quantity keeps its key but gets no rung, because `1p7l` or `17l` would mislead (5.1, 5.2, 8.2, 10.4). |
| 10 | Decimal versions without `v` are noise | A | A dotted decimal after a version compound (`Versionshinweise`) or a model position (`Python 3.12`) is a version (5.4); section 20 rows 13 and 14. |
| 11 | Function-word gaps, number words | A | DE pronouns, possessives, modal verbs, question words and adverbs; EN `ever never cannot nobody ...` and contraction stems; `us` is an EN stop word with the upper-case exception; `pro` is a DE-only conflict word (`Pro 14`). Number words are dropped like `smallnum`, only in titles of their language (`Elf on the Shelf`), and count as marker numbers (`Part One`) (5.1 step 4b, 6.3). |
| 12 | Doc words rank high, DE/EN weak lists differ | A | Doc-kind entries with `weight: -60` (15.6); `vorlage` and `template` are both doc-kind; `minutes`, `planning`, `hinweis`, `session`, `current` are weak; `retrospektive` added; new field `pair` and a pair unit test with a named exception list. The weight only acts when something must be dropped: when all words fit, a doc word still shows (`best-banan-bread`), which is fine. |
| 13 | Compound handling loses meaning | A | Morph and head rungs are cryptic, except a whole part of 5+ chars whose other parts are weak, noise or generic modifiers; direction, region and qualifier modifiers become own concepts; joined abbr is plain only with known pieces; an unknown hyphen head is an unknown topic; the hyphen rule holds in every language (5.1, 7.3, 11.1). Row 10 shows that a cryptic head rung can still win; open question Q17. |
| 14 | Ties in `lost` decided alphabetically | A | Both fixes: decreasing position bonus 60/30/15/8/4 for T concepts, and a content-rank step before the body text in the fit tie-break (10.3, 12). |
| 15 | `und` for ASCII-folded German and short titles | A | Digraph hint with exclusions (`blue`, `issues`, `Tuesday`, `steuer` do not count), parts hits from 6 chars, compound hint from 8 chars, plural fold for `und` stems. Parts that are also English words (`student patient transport region`) moved to `*` so they give no German score (6.1, 8.2, 15.7). |
| 16 | Attr suffix false hits | A | `-haft` never matches `-schaft`; `-lich -ig -isch -bar -los -haft` only in lower case; `-iert` stays for any case (6.4). |
| 17 | Code runs eat slash and bracket words | A | A code run needs a digit or only upper-case letters (5.1 step 1b). |
| 18 | Marker vs compound topic | A | Topic-to-marker merge (5.3, 8.1); section 20 row 15. |
| 19 | Generic qualifiers missing | A | Class `qualifier` (slot Q, weight 140, kept in `minimal`) with DE and EN entries and groups; `online` left the parts list (15.5). |
| 20 | Weekdays and left/right | P | Directions: no stem lookup, and `links`/`rechts` are `lowerOnly`. Weekdays: rejected as weak words; they are a class `weekday` (slot N, weight 100), because a weak word never shows and weekdays separate siblings (`Team Lunch Friday` / `Monday`, rows 28 and 29). They are never names by sentence case (5.4, 6.6). |
| 21 | Section 20 rows with impossible lengths | A | All rows checked against I1 and recomputed with the rev 3.1 rules; `ref-acceptance.ts` checks I1 and I2 on every expected value (20). One correction to the review: `dogovor-postavki` is 16 chars (7 + 1 + 8), not 15; the row stays `unv` because cut-heavy bodies cost less (row 43). |
| 22 | Privacy text wrong for German titles | A | Wording option: 6.6, 10.4, README item 11 and Q10 say that `minimal` keeps names in `de` titles and that `denyTokens` is the tool. The heuristic option is rejected for the same reason as in Q12 (it would turn most German nouns into names). |
| 23 | Duplicate keys in built-in data | A | `west` is one `*` entry; `app software marketing team online` left the parts line; the part count is 240. Also fixed: the region `dach` clashed with the part `dach` (roof); the region key is now `dachregion` with form `dach` and `upperOnly` (15.5, 15.7). |
| 24 | `known` list breaks rule 15.2.3 | A | `va ma mv jhv gf br abt` are cryptic; `entwicklung` left the `dev` group (keeps `entw`); new rule 15.2.6 on groups. |
| 25 | Smaller inconsistencies | A | Direction cancel by class (10.1); deny tokens are removed in step 2, right after tokenizing (3, 6.6); Appendix A row 3 points to 15.7; person titles are listed per language (6.3); wide ranges show as two segments `1950-2020` (5.2, 11.5). |
| 26 | Procurement leftovers in normative text | P | Neutral examples in 4.3, 5.1, 6.4, 7.3, 8.2, 11.1, 11.4 and 19.1; procurement-leaning parts removed (`einkauf liefer wartung neubau umbau sanierung personal`); the M1.5 rule now names what is allowed (SPEC.md, recipe files, corpus titles, hash-input test strings). The word-frequency check is a review script with a list passed by path, not a CI gate, because no frequency list with a fitting license can be committed (15.7, 21, 23 #19). |
| 27 | `LanguagePack` lacks slots | A | Added `weekdays`, `units`, `versionWords`, `numberWords`, and also `attr` and `hints.digraphs`, so a new language can reach the level of `de` and `en` (6.7). |

**Hand simulation of the review, with the rev 3.1 rules** (default config, exact 16, no store; hand results, checked again at M4):

| Fixture | Title | Rev 3.1 result | Changed by |
|---|---|---|---|
| t446 / t450 | Sommerfest Gärtnerei München 2026 / Gaertnerei Muenchen | both `de` (umlaut chars; digraphs and compound hint), so the same concepts and the same ID (Q8) | 15 |
| t336 | SEO Keyword Research | `keyword-research` (450); `seo` is now a concept, lost by fit | 7 |
| t382 | Open House Saturday 2 PM | `open-hous-sat-[t2]` (440); `PM` noise, `Saturday` a weekday | 6, 20 |
| t004 | Mein erstes Jahr als Freelancerin in Leipzig | `mein` stop word, `erstes` number word, `Leipzig` a topic | 11, 16 |
| t137 | Best Ever Banana Bread | `best-banan-bread` (190); `ever` stop word | 11, 12 |
| t016 | Ten Houseplants That Survive Any Office | `ten` dropped (number word); `survive` attr | 11 |
| t065 / t066 | Tavora Phone 8 128/256 GB Midnight Blue | `phone8` bond and quantity `128gb` / `256gb` in the pool; the second sibling shows its quantity after re-pick | 8, 9 |
| t068/t069, t344/t345 | Größe M / L, Variante A / B | markers `szm` / `szl`, `vara` / `varb` | 8 |
| t323 / t324 | Versionshinweise 5.1 / 5.2 | `versionshinweise` / `hinweise-v52-[t3]` (rows 13, 14) | 10 |
| t387/t388, t410/t411 | 1. OG / 3. OG; Los 1 / Los 2 | `skip.Q6` (field rules); `Los` tested with the recipe | 2 |
| t164 / t165 | Niederschlagstrends in Nord/Süddeutschland 1950–2020 | `nord` / `sued` are own concepts (slot Q), range `1950-2020` | 13, 25 |
| t116 | Sprintplanung Sprint 22 | `sprint22-[t7]` (500), row 15 | 18 |
| t197 | Auftragsverarbeitungsvertrag nach Art. 28 DSGVO | marker `art28`, acronym `dsgvo` | 6, 8 |
| t095 / t094 | Checkout button unresponsive in Safari / Chrome | still `und` (no hint); open, see row 22 | - |
| t091 / t092 | Laptop startet nicht – Standort Berlin / Dresden | unchanged; Q1 open question (exact vs max) | - |
