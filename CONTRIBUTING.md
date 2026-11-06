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

## Checks

- `pnpm build && pnpm test && pnpm lint && pnpm typecheck`: the full check. Some tests use `dist/`, so
  build first.
- `pnpm smoke`: packs the package, installs it into four fixtures (ESM, CJS, TS node16, TS bundler)
  and runs the installed bin.
- `pnpm test:browser`: the golden subset in chromium, firefox and webkit
  (`pnpm exec playwright install chromium firefox webkit` once; `BROWSERS=chromium` runs one).
- `pnpm size`: size budgets. `pnpm playground`: the playground on http://localhost:5173.
- `pnpm test:update`: writes the golden subset, the SQL example and the generated README tables.

## Releasing (maintainers)

Releases run in GitHub Actions only (`.github/workflows/release.yml`), after `ci` passed on a push to
`main`, with npm trusted publishing (OIDC) and provenance. One-time setup:

1. Publish a first version by hand with 2FA to create the package name.
2. On npmjs.com, add a trusted publisher: repo `heikotroetsch/semantic-slugger`, workflow
   `release.yml`, environment `npm`.
3. Set "Require 2FA and disallow tokens" on the package.

After that, merge changesets to `main`. The release job opens a "version packages" pull request; merging
it publishes the new version.
