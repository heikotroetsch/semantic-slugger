---
"semantic-slugger": patch
---

Store-backed resolve: `generate(title, { store, scope, lang, exclude, signal })`, `createUnique()` (generate, insert, retry on a lost race), `slugMany()` (a sync batch, unique within the batch) and `isUniqueViolation()`. New adapter `semantic-slugger/adapters/memory` (`memoryStore()`, tier C). Store tiers A, B and C follow the methods a store has. In tiers B and C the tail grows when a window of tail indexes is full, so many rows with the same title do not exhaust.
