/**
 * Util paginasi server-side — sebelumnya terduplikasi identik di 12 service
 * (Fase 6 refactoring). Perilaku dipertahankan persis seperti aslinya:
 * page default 1, limit default 10, totalPages dibulatkan ke atas.
 */
export interface PagingQuery {
  page?: unknown;
  limit?: unknown;
}

export interface Paging {
  page: number;
  limit: number;
  skip: number;
}

export interface PageMeta {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
}

/**
 * Parsing paginasi dari query DTO.
 * @param maxLimit batas atas limit (mis. 50 untuk endpoint audit log).
 */
export function resolvePaging(query: PagingQuery, maxLimit?: number): Paging {
  const page = Number(query.page) || 1;
  let limit = Number(query.limit) || 10;
  if (maxLimit) limit = Math.min(limit, maxLimit);
  return { page, limit, skip: (page - 1) * limit };
}

/** Meta standar respons daftar `{ data, meta }`. */
export function buildPageMeta(page: number, limit: number, totalItems: number): PageMeta {
  return { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) };
}
