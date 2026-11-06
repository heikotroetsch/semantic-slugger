# Contributing

- Use only synthetic titles and invented names. Never paste real customer, patient, employee or other
  confidential data, or real names.
- Run `pnpm build && pnpm test && pnpm lint && pnpm typecheck` before you open a pull request.
- Add a changeset (`pnpm changeset`). If generated IDs change, write "ID output changed" in it.
- The core is generic. A new built-in lexicon entry must pass the cross-domain test (SPEC 15.2): general
  language, or an abbreviation used without explanation in at least three unrelated fields. Words of one
  field belong in user config (`lexicon`, `stopWords`, `denyTokens`), not in `src/data/`.
- A new lexicon entry: add it in `src/data/v1/`, run `pnpm test:update`, and review the corpus and golden diffs.
- New compound parts: attach the output of `scripts/check-parts-frequency.ts` (SPEC 15.7).
- Core code in `src/` (except `src/cli.ts`) must stay browser-safe and deterministic: no `node:` imports,
  no `Date`, `Math.random`, `Intl`, `localeCompare`, `toUpperCase`, `BigInt` or `TextEncoder` (SPEC 14.1).
