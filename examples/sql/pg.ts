/**
 * semantic-slugger with node-postgres (SPEC 17.3). Create the table with `examples/sql/schema.sql`
 * (the output of `sqlSchema()`). Not part of the package.
 *
 * Other drivers:
 *   PGlite:      sqlStore({ query: (t, v) => db.query(t, v), table: 'slug_entry' })
 *   postgres.js: sqlStore({ query: (t, v) => sql.unsafe(t, v), table: 'slug_entry' })
 *   Prisma:      sqlStore({ query: (t, v) => prisma.$queryRawUnsafe(t, ...v), table: 'slug_entry' })
 */
import pg from 'pg'
import { createSlugger } from 'semantic-slugger'
import { sqlStore } from 'semantic-slugger/adapters/sql'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const slugger = createSlugger()
const store = sqlStore({ query: (text, values) => pool.query(text, values), table: 'slug_entry' })

// Insert a new row with a unique ID. `retryKey` spreads parallel calls for the same title.
export async function createId(title: string, scope: string, rowKey: string): Promise<string> {
  const { result } = await slugger.createUnique(title, { store, scope, retryKey: rowKey })
  return result.id
}

// Your own table: map the columns and insert the row yourself.
const documents = sqlStore({
  query: (text, values) => pool.query(text, values),
  table: 'document',
  columns: { scope: 'tenant_id', body: 'slug_body', stems: 'slug_stems', retiredAt: null },
})

export async function createDocument(title: string, tenantId: string): Promise<number> {
  const { record } = await slugger.createUnique(title, {
    store: documents,
    scope: tenantId,
    insert: async (r) => {
      const { rows } = await pool.query(
        'insert into document (tenant_id, title, slug, slug_body, slug_stems) values ($1, $2, $3, $4, $5) returning id',
        [tenantId, title, r.id, r.body, [...r.stems]],
      )
      return rows[0].id as number
    },
  })
  return record as number
}
