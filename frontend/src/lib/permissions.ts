// RBAC Frontend - selaras dengan @Roles() di backend & matriks role PRD (B3)

export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  WAREHOUSE_MANAGER: 'WAREHOUSE_MANAGER',
  SALES_SPECIALIST: 'SALES_SPECIALIST',
  PURCHASING_OFFICER: 'PURCHASING_OFFICER',
  FINANCE_OFFICER: 'FINANCE_OFFICER',
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];

const ALL_ROLES: RoleName[] = Object.values(ROLES);

/**
 * Hak akses BACA per route. Route yang tidak terdaftar = semua role.
 * Route SUPER_ADMIN-only (Users & Audit Logs) wajib didaftarkan eksplisit.
 */
export const ROUTE_ACCESS: Record<string, RoleName[]> = {
  '/dashboard': ALL_ROLES,
  '/dashboard/inventory': ALL_ROLES,
  '/dashboard/inventory/movements': ALL_ROLES,
  '/dashboard/products': ALL_ROLES, // baca terbuka; aksi tulis via ACTION_ACCESS
  '/dashboard/categories': [ROLES.SUPER_ADMIN, ROLES.WAREHOUSE_MANAGER],
  '/dashboard/warehouses': [ROLES.SUPER_ADMIN, ROLES.WAREHOUSE_MANAGER],
  '/dashboard/suppliers': [ROLES.SUPER_ADMIN, ROLES.PURCHASING_OFFICER],
  '/dashboard/customers': [ROLES.SUPER_ADMIN, ROLES.SALES_SPECIALIST],
  '/dashboard/transfers': [ROLES.SUPER_ADMIN, ROLES.WAREHOUSE_MANAGER],
  // Fase 4: daftar dokumen workflow PO/SO terbuka utk semua role;
  // aksi tulis (submit/approve/receive/dsb) dibatasi via ACTION_ACCESS.
  '/dashboard/purchase-orders': ALL_ROLES,
  '/dashboard/sales-orders': ALL_ROLES,
  // Fase 5: daftar invoice terbuka semua role; catat bayar via ACTION_ACCESS.
  '/dashboard/invoices': ALL_ROLES,
  '/dashboard/users': [ROLES.SUPER_ADMIN],
  '/dashboard/audit-logs': [ROLES.SUPER_ADMIN],
};

/**
 * Hak akses AKSI (tombol tulis/hapus) - dipakai menyembunyikan tombol.
 * Backend tetap penjaga final melalui @Roles().
 */
export type Action =
  | 'manageProducts'
  | 'manageCategories'
  | 'manageWarehouses'
  | 'manageSuppliers'
  | 'manageCustomers'
  | 'adjustStock'
  | 'manageTransfers'
  | 'managePurchaseOrders'
  | 'approvePurchaseOrders'
  | 'completePurchaseOrders'
  | 'manageSalesOrders'
  | 'recordPayments'
  | 'manageUsers'
  | 'viewAuditLogs';

export const ACTION_ACCESS: Record<Action, RoleName[]> = {
  manageProducts: [ROLES.SUPER_ADMIN, ROLES.WAREHOUSE_MANAGER],
  manageCategories: [ROLES.SUPER_ADMIN, ROLES.WAREHOUSE_MANAGER],
  manageWarehouses: [ROLES.SUPER_ADMIN, ROLES.WAREHOUSE_MANAGER],
  manageSuppliers: [ROLES.SUPER_ADMIN, ROLES.PURCHASING_OFFICER],
  manageCustomers: [ROLES.SUPER_ADMIN, ROLES.SALES_SPECIALIST],
  adjustStock: [ROLES.SUPER_ADMIN, ROLES.WAREHOUSE_MANAGER],
  manageTransfers: [ROLES.SUPER_ADMIN, ROLES.WAREHOUSE_MANAGER],
  // Fase 4 - selaras whitelist transisi + @Roles() di backend
  managePurchaseOrders: [ROLES.SUPER_ADMIN, ROLES.PURCHASING_OFFICER],
  approvePurchaseOrders: [ROLES.SUPER_ADMIN], // PENDING->APPROVED & cancel setelah APPROVED
  completePurchaseOrders: [ROLES.SUPER_ADMIN, ROLES.FINANCE_OFFICER], // RECEIVED->COMPLETED
  manageSalesOrders: [ROLES.SUPER_ADMIN, ROLES.SALES_SPECIALIST],
  // Fase 5 - selaras @Roles() backend: catat pembayaran invoice
  recordPayments: [ROLES.SUPER_ADMIN, ROLES.FINANCE_OFFICER],
  manageUsers: [ROLES.SUPER_ADMIN],
  viewAuditLogs: [ROLES.SUPER_ADMIN],
};

/** Route mana yang boleh dibuka role ini? (match terpanjang, mis. /dashboard/inventory/movements) */
export function allowedRolesForPath(pathname: string): RoleName[] {
  let matchedRoute = '';
  let roles: RoleName[] = ALL_ROLES;

  for (const [route, routeRoles] of Object.entries(ROUTE_ACCESS)) {
    const isMatch = pathname === route || pathname.startsWith(`${route}/`);
    if (isMatch && route.length > matchedRoute.length) {
      matchedRoute = route;
      roles = routeRoles;
    }
  }

  return roles;
}

export function canAccessPath(role: string | undefined | null, pathname: string): boolean {
  if (!role) return false;
  return allowedRolesForPath(pathname).includes(role as RoleName);
}

export function can(role: string | undefined | null, action: Action): boolean {
  if (!role) return false;
  return ACTION_ACCESS[action].includes(role as RoleName);
}
