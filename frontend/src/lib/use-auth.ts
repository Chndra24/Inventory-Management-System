'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { RoleName } from '@/lib/permissions';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  roleId: string;
  role: { id: string; name: RoleName; description?: string | null };
}

/**
 * Hook auth terpusat berbasis cookie (B2): sesi diverifikasi via GET /auth/me,
 * token tidak disimpan di localStorage. Query key 'auth-me' dipakai bersama
 * oleh DashboardLayout & halaman lain agar cukup satu request.
 */
export function useAuth() {
  const { data, isLoading, error } = useQuery<AuthUser>({
    queryKey: ['auth-me'],
    queryFn: async () => {
      const res = await apiClient.get('/auth/me');
      return res.data.user;
    },
    retry: false,
    staleTime: 60_000,
  });

  return {
    user: data ?? null,
    role: (data?.role?.name as RoleName | undefined) ?? null,
    isLoading,
    isError: !!error,
  };
}
