import type { AnyProcedure, Router } from '../core/types';

/**
 * Returns a cached procedure resolver for the given router.
 * Repeated lookups for the same path are O(1) after the first call.
 */
export function createProcedureResolver(router: Router) {
  const cache = new Map<string, AnyProcedure | null>();

  return function resolve(path: string): AnyProcedure | null {
    if (cache.has(path)) return cache.get(path)!;

    const parts = path.split('.');
    let current: any = router;

    for (const part of parts) {
      current = current[part];
      if (!current) {
        cache.set(path, null);
        return null;
      }
    }

    const procedure = current as AnyProcedure;
    cache.set(path, procedure);
    return procedure;
  };
}
