/**
 * TypeScript support for server-side imports of src/utils/*.ts modules.
 * Requires Node to start with `node --import tsx` (see package.json dev:api/start).
 */
export function ensureTsRegister() {
  // tsx is registered globally via the Node `--import tsx` preload hook.
}
