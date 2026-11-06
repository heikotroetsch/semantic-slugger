## What changed

## Checklist

- [ ] All new titles, names and lexicon entries are synthetic. No customer, patient, employee or other confidential data.
- [ ] Data changes only: new built-in lexicon entries pass the cross-domain test (SPEC 15.2).
- [ ] Data changes only: new compound parts: output of `scripts/check-parts-frequency.ts` attached (15.7).
- [ ] `pnpm build && pnpm test && pnpm lint && pnpm typecheck` pass.
- [ ] A changeset is added (`pnpm changeset`). If IDs change, it says "ID output changed".
- [ ] If `test/golden/v1.*` changed: the changeset is a major one (from 1.0).
