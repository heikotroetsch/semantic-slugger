/**
 * semantic-slugger with Prisma (SPEC 13.5, 17.2). Two ways to store a new ID.
 * Not part of the package; `@prisma/client` is an optional peer dependency.
 */
import { PrismaClient } from '@prisma/client'
import { createSlugger, isUniqueViolation } from 'semantic-slugger'
import { prismaStore } from 'semantic-slugger/adapters/prisma'

const prisma = new PrismaClient()
const slugger = createSlugger()

// Layout 1: a slug table. createUnique inserts the row and retries after a lost race.
export async function createSlugEntry(title: string, scope: string): Promise<string> {
  const store = prismaStore({
    delegate: prisma.slugEntry,
    queryRaw: (sql, values) => prisma.$queryRawUnsafe(sql, ...values),
  })
  const { result } = await slugger.createUnique(title, { store, scope })
  return result.id
}

// Layout 2: the slug as columns on the entity, written in one interactive transaction.
// A unique violation aborts the Postgres transaction, so retry the whole transaction.
export async function createDocument(title: string, tenantId: string) {
  const tried = new Set<string>()
  for (let r = 0; r < 5; r++) {
    let last = ''
    try {
      return await prisma.$transaction(async (tx) => {
        const store = prismaStore({
          delegate: tx.document,
          fields: { slug: 'slug', body: 'slugBody', stems: 'slugStems', retiredAt: null },
          scopeWhere: (scope) => ({ tenantId: scope }),
        })
        const res = await slugger.generate(title, { store, scope: tenantId, exclude: tried })
        last = res.id
        return tx.document.create({
          data: { tenantId, title, slug: res.id, slugBody: res.body, slugStems: [...res.stems] },
        })
      })
    } catch (e) {
      if (isUniqueViolation(e, 'slug')) {
        tried.add(last)
        continue
      }
      throw e
    }
  }
  throw new Error(`no free slug for "${title}" after 5 tries`)
}
