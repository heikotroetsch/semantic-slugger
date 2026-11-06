---
"semantic-slugger": patch
---

New DB adapters. `semantic-slugger/adapters/sql`: `sqlStore({ query, table, columns })` for any Postgres `query(text, values)` function (pg, PGlite, postgres.js, Prisma `$queryRawUnsafe`) and `sqlSchema()` for the table DDL. `semantic-slugger/adapters/prisma`: `prismaStore({ delegate, queryRaw, fields, scopeWhere, extraData })` and `isPrismaUniqueViolation()`. Both are tier C and give the same IDs as the memory store. `@prisma/client` is an optional peer dependency; the adapter imports nothing from it. `StoreError` now has `details.reason` (`insert-blocked`).
