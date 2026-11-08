# semantic-slugger

## 0.1.1

### Patch Changes

- bbf6d0c: Releases now go through npm staged publishing from CI (trusted publishing, approved with 2FA). The README links to the new start page of the playground, where you type one title and get its ID.

## 0.1.0

First public release. Short, readable, unique IDs from any title. German and English built in, zero
dependencies, ESM and CommonJS, browser-safe core. Pre-1.0: minor releases may change the ID output.

### ID output (quality rounds 1 to 3, review fixes)

These changes came after the first draft of this entry; they are part of 0.1.0. See
docs/DEVIATIONS.md rows 151 to 188.

- A fill segment from an unused title word, or more letters of a cut word, takes the place of a
  padding tail (`board-meet-minut`, `release-v23-note`, `employe-handbook`, `open-house-satur`).
- Long words get long prefix cuts (`spesenab-hamburg`, `versionshinw-v51`) instead of 3-letter cuts
  and consonant skeletons. Cuts that read as another word (`for`, `ein`, `bus`, `star`, `chick`) are
  not used.
- Common verbs, evaluative adjectives, frame and filler words give way to the topic. The word that
  tells sibling titles apart (year, North/South, phase, side, week) is kept more often
  (`weath-warn-north`, `kniegelenk-links`, `trial-compou-ph1`).
- Fewer 2 to 4 letter stubs; two whole words win over three or four cuts (`rekordhitze-juli`).
- Negations and privative heads are kept (`nobake-pean-bars`, `glutenfr-cookies`); common multi-word
  terms stay one unit (`rfq-office-furni`, `castiron-skillet`). `#812` shows `812` or `no812` outside
  German titles.
- Review fixes: a fill that starts with a digit is never the first segment (`a380-4k-sprint14`; this
  threw `InternalError` before). No list word of 4+ chars may reach from the body into the tail, so
  every generated ID passes `isValid()`. `İ` (Turkish dotted I) and combining marks no longer split a
  word (`istan-reise-2026`). Long hyphen chains, very long titles and large non-Latin titles stay
  fast and no longer overflow the stack.
- Review fixes, stores: `createUnique` with an `insert` callback no longer reports a unique violation
  on another column as a lost race (`StoreError` reason `insert-blocked`); `ConflictError.details.tried`
  lists only the tried IDs and `cause` holds the last database error. `sqlStore` and `prismaStore`
  have an `isConflict` bound to the slug column. `isUniqueViolation` reads Prisma 7 driver adapter
  errors and raw query errors (`P2010`). An `undefined` adapter field keeps its default.
- CLI: a blank stdin line gives an empty output line, so plain output lines up with the input.

### Minor Changes

- `explain(title, opts?)` and `slugger.explain()`: every step of the pipeline as data (`steps`), as a
  text table (`toString()`) and as plain JSON (`toJSON()`, the secret is hidden).
  `generate(title, { store, trace: true })` attaches the trace to the result. `slugger.candidates(title)`
  lists the best bodies of the fit search.
- CLI `semantic-slugger`: titles from arguments or stdin, `--length --mode --sep --leak --lang --explain
  --json --unique --secret-env --lexicon --deny --check --version`.
- Playground (static, runs in the browser) and README with domain recipes (software, medicine,
  procurement) as plain user config.
- DB adapters. `semantic-slugger/adapters/sql`: `sqlStore({ query, table, columns })` for any Postgres
  `query(text, values)` function (pg, PGlite, postgres.js, Prisma `$queryRawUnsafe`) and `sqlSchema()`.
  `semantic-slugger/adapters/prisma`: `prismaStore({ delegate, queryRaw, fields, scopeWhere, extraData })`
  and `isPrismaUniqueViolation()`. Both are tier C and give the same IDs as the memory store.
  No peer dependency: the adapter imports nothing from `@prisma/client` (Prisma 5 and later).
- Store-backed resolve: `generate()`, `createUnique()` (generate, insert, retry on a lost race),
  `slugMany()` (sync batch, unique within the batch), `isUniqueViolation()` and the memory adapter
  `semantic-slugger/adapters/memory`. Store tiers A, B and C follow the methods a store has.
- Ladders, safety and fit: short forms per word (cuts, skeletons, number forms), bad-word checks on
  every form and ID, a bounded fit search for the cheapest body, `suggest()` and `slug()`.
- Compounds, concepts and rank: German compound splitting, one concept per idea, lexicon-free stored
  stems (plain or hashed), integer ranking with priors and store rarity, `analyze()`.
- v1 data and the language front: normalization with noise removal, transliteration, tokenizer
  (years, months, weekdays, versions, quantities, model numbers, markers, codes), built-in `de` and `en`
  language packs, `languagePacks` (experimental), vendored CISTEM and Porter2 stemmers, language
  detection, stop words, names, acronyms, deny tokens. Data exports in `semantic-slugger/data`.
- Config: generic options only (`lexicon`, `stopWords`, `denyTokens`, `reserved`, `languagePacks`).
  The core ships no domain packs.
- SipHash-2-4 tail hash, tail alphabets (`safe`, `strict`, custom), ID invariants, `isValidSlug()`,
  config validation with `ConfigError` details, error classes with `isSluggerError()`, and the empty
  and opaque ID path.
