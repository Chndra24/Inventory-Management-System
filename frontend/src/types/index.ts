import '@tanstack/react-table';

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData, TValue> {
    align?: 'left' | 'right';
  }
}

/* ===== Shared API types (C3) - menggantikan `any` di seluruh halaman ===== */

export interface PaginationMeta {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface Role {
  id: string;
  name: string;
  description: string | null;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  roleId: string;
  role: Role;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
  _count?: { products: number };
}

export interface WarehouseRef {
  id: string;
  code: string;
  name: string;
}

export interface CategoryRef {
  id: string;
  name: string;
  slug?: string;
}

export interface InventoryRecord {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  warehouse?: WarehouseRef;
  updatedAt?: string;
}

export interface Product {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  unit: string;
  categoryId: string;
  category: CategoryRef;
  minStock: number;
  buyPrice: number | string;
  sellPrice: number | string;
  createdAt: string;
  updatedAt: string;
  inventories?: InventoryRecord[];
}

export interface Warehouse extends WarehouseRef {
  address: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: {
    inventories: number;
    stockMovements: number;
    purchaseOrders: number;
    salesOrders: number;
  };
}

export interface Supplier {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { purchaseOrders: number };
}

export interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { salesOrders: number };
}

export interface InventoryOverviewItem {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  unit: string;
  minStock: number;
  category: CategoryRef | null;
  totalStock: number;
  isLowStock: boolean;
  inventories: InventoryRecord[];
}

export type StockMovementType = 'IN' | 'OUT' | 'TRANSFER' | 'ADJUSTMENT';

export interface StockMovement {
  id: string;
  productId: string;
  warehouseId: string;
  type: StockMovementType;
  quantity: number;
  referenceId: string | null;
  createdAt: string;
  product: { id: string; sku: string; name: string; unit: string };
  warehouse: WarehouseRef;
}

export type TransferStatus = 'DRAFT' | 'IN_TRANSIT' | 'RECEIVED' | 'CANCELLED';

export interface TransferItem {
  id: string;
  productId: string;
  quantity: number;
  product: { id: string; sku: string; name: string; unit: string };
}

export interface StockTransfer {
  id: string;
  transferNumber: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  status: TransferStatus;
  notes: string | null;
  createdById: string | null;
  fromWarehouse: WarehouseRef;
  toWarehouse: WarehouseRef;
  createdBy: { id: string; name: string; email: string } | null;
  items: TransferItem[];
  createdAt: string;
  updatedAt: string;
  _count?: { items: number };
}

export interface UserListItem {
  id: string;
  name: string;
  email: string;
  roleId: string;
  role: Role;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  userId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: { name: string };
  } | null;
}

export interface AuditLogResponse extends PaginatedResponse<AuditLog> {
  filters: { actions: string[]; entities: string[] };
}

/* ===== Fase 4 - Purchase Order, Sales Order & Invoice ===== */

export type POStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'APPROVED'
  | 'RECEIVED'
  | 'COMPLETED'
  | 'CANCELLED';

export type SOStatus = 'PENDING' | 'ALLOCATED' | 'INVOICED' | 'COMPLETED' | 'CANCELLED';

export type InvoiceStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE';

/* ===== Fase 5 - Payment, Invoice (lengkap) & Analytics ===== */

export type PaymentMethod = 'CASH' | 'TRANSFER' | 'QRIS' | 'OTHER';

export interface Payment {
  id: string;
  invoiceId: string;
  amount: number | string;
  paidAt: string;
  method: PaymentMethod | null;
  note: string | null;
  recordedBy: string | null;
  user?: { id: string; name: string } | null;
  createdAt: string;
}

export interface PurchaseOrderItem {
  id: string;
  poId: string;
  productId: string;
  quantity: number;
  unitPrice: number | string;
  product: { id: string; sku: string; name: string; unit: string };
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  warehouseId: string;
  status: POStatus;
  totalAmount: number | string;
  supplier: { id: string; name: string };
  warehouse: WarehouseRef;
  items?: PurchaseOrderItem[];
  _count?: { items: number };
  createdAt: string;
  updatedAt: string;
}

export interface SalesOrderItem {
  id: string;
  soId: string;
  productId: string;
  quantity: number;
  unitPrice: number | string;
  product: { id: string; sku: string; name: string; unit: string };
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  salesOrderId: string;
  /** Status efektif — OVERDUE dihitung on-read oleh server (bukan nilai tersimpan). */
  status: InvoiceStatus;
  /** Status tersimpan di DB: UNPAID / PARTIALLY_PAID / PAID. */
  storedStatus: InvoiceStatus;
  dueDate: string | null;
  totalAmount: number | string;
  paidAmount: number;
  remainingAmount: number;
  createdAt: string;
  updatedAt: string;
  salesOrder: {
    id: string;
    soNumber: string;
    status: SOStatus;
    customer: {
      id: string;
      name: string;
      address?: string | null;
      phone?: string | null;
      email?: string | null;
    };
    warehouse: WarehouseRef;
    items?: SalesOrderItem[];
  };
  payments: Payment[];
}

export interface SalesOrder {
  id: string;
  soNumber: string;
  customerId: string;
  warehouseId: string;
  status: SOStatus;
  totalAmount: number | string;
  customer: { id: string; name: string };
  warehouse: WarehouseRef;
  items?: SalesOrderItem[];
  /** Pilihan ringkas dari endpoint SO (tanpa field total/paid invoice). */
  invoice?: {
    id: string;
    invoiceNumber: string;
    status: InvoiceStatus;
    dueDate: string | null;
  } | null;
  _count?: { items: number };
  createdAt: string;
  updatedAt: string;
}

/* ===== Fase 5 - Analytics Dashboard ===== */

export interface AnalyticsTrendPoint {
  key: string;
  label: string;
  sales: number;
  purchases: number;
}

export interface AnalyticsTopProduct {
  id: string;
  sku: string;
  name: string;
  quantity: number;
  value: number;
}

export interface AnalyticsOverview {
  inventoryValue: number;
  salesThisMonth: number;
  purchasesThisMonth: number;
  lowStockCount: number;
  trend: AnalyticsTrendPoint[];
  topProducts: AnalyticsTopProduct[];
  generatedAt: string;
}
