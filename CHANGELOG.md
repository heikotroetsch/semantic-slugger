# semantic-slugger

## 0.1.0

First public release. Short, readable, unique IDs from any title. German and English built in, zero
dependencies, ESM and CommonJS, browser-safe core. Pre-1.0: minor releases may change the ID output.

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
  `@prisma/client` is an optional peer dependency; the adapter imports nothing from it.
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
