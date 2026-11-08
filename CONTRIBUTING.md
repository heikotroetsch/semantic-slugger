# Contributing

- Use only synthetic titles and invented names. Never paste real customer, patient, employee or other
  confidential data, or real names.
- Run `pnpm build && pnpm test && pnpm lint && pnpm typecheck && pnpm size` before you open a pull
  request. CI fails when a size budget is exceeded, and then no release runs.
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

Releases run in GitHub Actions (`.github/workflows/release.yml`) after `ci` passed on a push to `main`.
They use npm trusted publishing (OIDC) with **staged publishing**: CI only stages a version, and a
maintainer approves it with 2FA. No npm token is stored anywhere.

1. Add a changeset to your pull request: `pnpm changeset`.
2. After the merge, the release job opens a "version packages" pull request. Merge it.
3. The release job runs `pnpm release` (`scripts/stage-publish.ts`): it stages the new version with
   `npm stage publish` and pushes the tag `v<version>`.
4. Approve the staged version on npmjs.com, or run `npm stage list` and `npm stage approve <id>`.

One-time setup (done): the package was created by a hand publish of 0.1.0. The trusted publisher on
npmjs.com is repo `heikotroetsch/semantic-slugger`, workflow `release.yml`, environment `npm`, with
the permission "npm stage publish" only. Set "Require 2FA and disallow tokens" on the package.
