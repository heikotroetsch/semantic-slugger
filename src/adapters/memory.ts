/**
 * "semantic-slugger/adapters/memory" (SPEC 17.1): a tier C store held in memory. All methods are sync.
 * Good for tests, scripts, single-process apps and seeding; a database adapter is the guarantee for
 * concurrent writers (SPEC 13.5).
 */

export { MEMORY_CONFLICT, MemoryConflictError, type MemoryInit, type MemoryStore, memoryStore } from '../core/memory.ts'
