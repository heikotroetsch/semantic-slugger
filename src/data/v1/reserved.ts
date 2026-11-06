/**
 * Default reserved words (SPEC 9.3). An ID never equals one of these.
 * In max mode without a tail, the body must not be one of these either (a tail is forced).
 */
export const RESERVED: readonly string[] = [
  'new',
  'edit',
  'admin',
  'api',
  'settings',
  'login',
  'logout',
  'auth',
  'create',
  'delete',
  'update',
  'search',
  'null',
  'undefined',
  'index',
  'help',
  'static',
  'assets',
]
