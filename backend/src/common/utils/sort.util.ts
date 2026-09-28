export type SortOrder = 'asc' | 'desc';

export interface ResolvedSort {
  field: string;
  order: SortOrder;
}

/**
 * Whitelist kolom pengurutan server-side (A2).
 * Kolom di luar whitelist diabaikan dan diganti fallback, agar query
 * `orderBy` Prisma tidak memicu error 500 ataupun kebocoran kolom sensitif.
 */
export function resolveSort(
  sortBy: string | undefined,
  allowed: readonly string[],
  fallback: string,
  sortOrder?: string,
): ResolvedSort {
  const field = sortBy && allowed.includes(sortBy) ? sortBy : fallback;
  const order: SortOrder = sortOrder === 'asc' ? 'asc' : 'desc';
  return { field, order };
}
