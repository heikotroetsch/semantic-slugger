/**
 * Type-level test (SPEC 17.2, DEVIATIONS 133): a generated Prisma model delegate must be assignable
 * to `PrismaSlugDelegate` without a cast. `GeneratedDelegate` copies the shape of the methods that
 * `prisma generate` (prisma-client-js 6.x) writes for a model: generic args checked with `Subset` /
 * `SelectSubset`, model-specific input types and conditional return types. `pnpm typecheck` checks
 * this file (tsconfig.node.json, strict and exactOptionalPropertyTypes).
 */
import { describe, expect, it } from 'vitest'
import { type PrismaSlugDelegate, prismaStore } from '../../src/adapters/prisma.ts'

type Subset<T, U> = { [K in keyof T]: K extends keyof U ? T[K] : never }
type SelectAndInclude = { select: unknown; include: unknown }
type SelectSubset<T, U> = { [K in keyof T]: K extends keyof U ? T[K] : never } & (T extends SelectAndInclude
  ? 'Please either choose `select` or `include`.'
  : Record<never, never>)
type SubsetIntersection<T, U, K> = { [P in keyof T]: P extends keyof U ? T[P] : never } & K
type PrismaPromise<T> = Promise<T> & { [Symbol.toStringTag]: 'PrismaPromise' }
type BatchPayload = { count: number }

type ScalarField = 'id' | 'tenantId' | 'title' | 'slug' | 'slugBody' | 'slugStems'
type Doc = { id: string; tenantId: string; title: string; slug: string; slugBody: string; slugStems: string[] }
type StringFilter = string | { equals?: string; in?: string[]; not?: string }
type WhereInput = {
  AND?: WhereInput | WhereInput[]
  id?: StringFilter
  tenantId?: StringFilter
  title?: StringFilter
  slug?: StringFilter
  slugBody?: StringFilter
  slugStems?: { has?: string; hasSome?: string[] }
}
type Select = { [K in ScalarField]?: boolean }
type OrderBy = { [K in ScalarField]?: 'asc' | 'desc' }
type CountAggregate = { [K in ScalarField | '_all']?: true }
type CreateManyInput = {
  id?: string
  tenantId: string
  title: string
  slug: string
  slugBody: string
  slugStems?: string[] | { set: string[] }
}

type CountArgs = { where?: WhereInput; take?: number; skip?: number; select?: CountAggregate | true }
type FindManyArgs = { where?: WhereInput; select?: Select | null; orderBy?: OrderBy | OrderBy[]; take?: number }
type CreateManyArgs = { data: CreateManyInput | CreateManyInput[]; skipDuplicates?: boolean }
type GroupByArgs = {
  where?: WhereInput
  orderBy?: OrderBy | OrderBy[]
  by: ScalarField[] | ScalarField
  take?: number
  _count?: CountAggregate | true
}
type FindResult<T> = T extends { select: infer S } ? { [K in keyof S & keyof Doc]: Doc[K] } : Doc

interface GeneratedDelegate {
  count<T extends CountArgs>(
    args?: Subset<T, CountArgs>,
  ): PrismaPromise<
    T extends Record<'select', unknown> ? (T['select'] extends true ? number : Record<string, number>) : number
  >
  findMany<T extends FindManyArgs>(args?: SelectSubset<T, FindManyArgs>): PrismaPromise<FindResult<T>[]>
  create<T extends { data: CreateManyInput }>(args: SelectSubset<T, { data: CreateManyInput }>): PrismaPromise<Doc>
  createMany<T extends CreateManyArgs>(args?: SelectSubset<T, CreateManyArgs>): PrismaPromise<BatchPayload>
  groupBy<
    T extends GroupByArgs,
    OrderByArg extends { orderBy?: GroupByArgs['orderBy'] },
    InputErrors extends T['by'] extends never[] ? 'Error: "by" must not be empty.' : Record<never, never>,
  >(
    args: SubsetIntersection<T, GroupByArgs, OrderByArg> & InputErrors,
  ): Record<never, never> extends InputErrors
    ? PrismaPromise<Array<Pick<Doc, 'slugBody'> & { _count: number }>>
    : PrismaPromise<InputErrors>
}

/** The delegate shape of SPEC 17.2 word for word, kept to show why it was changed. */
interface SpecShape {
  count(args: { where: Record<string, unknown> }): Promise<number>
  findMany(args: {
    where: Record<string, unknown>
    select: Record<string, true>
    take?: number
    orderBy?: Record<string, 'asc' | 'desc'>
  }): Promise<Record<string, unknown>[]>
  createMany?(args: { data: Record<string, unknown>[]; skipDuplicates?: boolean }): Promise<{ count: number }>
  groupBy?(args: {
    by: string[]
    where: Record<string, unknown>
    _count: Record<string, true>
  }): Promise<Record<string, unknown>[]>
}

declare const generated: GeneratedDelegate
declare const tx: { document: GeneratedDelegate }

function compileOnly(): unknown[] {
  const a: PrismaSlugDelegate = generated
  const b: PrismaSlugDelegate = tx.document
  // @ts-expect-error the SPEC 17.2 shape rejects a generated delegate (createMany data, groupBy by)
  const c: SpecShape = generated
  return [a, b, c, prismaStore({ delegate: tx.document, scopeWhere: (t) => ({ tenantId: t }) })]
}

describe('PrismaSlugDelegate types', () => {
  it('a generated delegate fits (checked by tsc, see compileOnly)', () => {
    expect(typeof compileOnly).toBe('function')
  })

  it('a hand-written delegate with typed args still fits', () => {
    const d: PrismaSlugDelegate = {
      count: async (_a: { where: object }) => 0,
      findMany: async (_a: { where: object; select: object }) => [],
      createMany: async (a: { data: object[] }) => ({ count: a.data.length }),
      groupBy: async (_a: { by: string[] }) => [],
    }
    expect(typeof prismaStore({ delegate: d }).insert).toBe('function')
  })
})
