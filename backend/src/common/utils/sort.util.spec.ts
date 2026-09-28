import { resolveSort } from './sort.util';

describe('resolveSort (whitelist pengurutan server-side)', () => {
  const allowed = ['createdAt', 'name'] as const;

  it('memakai kolom yang ada di whitelist', () => {
    expect(resolveSort('name', allowed, 'createdAt', 'asc')).toEqual({
      field: 'name',
      order: 'asc',
    });
  });

  it('mengembalikan fallback utk kolom di luar whitelist (tolak injeksi orderBy)', () => {
    expect(resolveSort('password_hash', allowed, 'createdAt', 'desc')).toEqual({
      field: 'createdAt',
      order: 'desc',
    });
  });

  it('mengembalikan fallback saat sortBy kosong', () => {
    expect(resolveSort(undefined, allowed, 'createdAt')).toEqual({
      field: 'createdAt',
      order: 'desc',
    });
  });

  it('order asc hanya bila persis "asc", selain itu desc', () => {
    expect(resolveSort('name', allowed, 'createdAt', 'asc').order).toBe('asc');
    expect(resolveSort('name', allowed, 'createdAt', 'ASC').order).toBe('desc');
    expect(resolveSort('name', allowed, 'createdAt', 'random').order).toBe('desc');
    expect(resolveSort('name', allowed, 'createdAt').order).toBe('desc');
  });
});
