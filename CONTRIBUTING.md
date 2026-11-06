# Contributing

- Use only synthetic titles and names. Never paste customer data, real contract titles or real supplier names.
- Run `pnpm build && pnpm test && pnpm lint && pnpm typecheck` before you open a pull request.
- Add a changeset (`pnpm changeset`). If generated IDs change, write "ID output changed" in it.
- A new lexicon entry: add it in `src/data/v1/`, run `pnpm test:update`, and review the corpus and golden diffs.
- Core code in `src/` (except `src/cli.ts`) must stay browser-safe and deterministic: no `node:` imports,
  no `Date`, `Math.random`, `Intl`, `localeCompare`, `toUpperCase`, `BigInt` or `TextEncoder` (SPEC 14.1).
