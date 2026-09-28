'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/use-auth';
import { canAccessPath, can, type Action } from '@/lib/permissions';
import {
  Building2,
  Package,
  Layers,
  Warehouse,
  Truck,
  Users,
  LogOut,
  User,
  LayoutDashboard,
  Boxes,
  ArrowRightLeft,
  History,
  ShieldAlert,
  ShieldCheck,
  ScrollText,
  ShoppingCart,
  Receipt,
  ReceiptText,
} from 'lucide-react';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  action?: Action;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { user, role, isLoading, isError } = useAuth();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!isLoading) {
      if (isError) {
        router.push('/login');
      } else {
        setChecking(false);
      }
    }
  }, [isLoading, isError, router]);

  const handleLogout = async () => {
    try {
      await apiClient.post('/auth/logout');
    } catch (e) {
      // ignore
    } finally {
      // Buang SELURUH cache query (termasuk 'auth-me') agar role/pengguna
      // berikutnya tidak memakai data sesi lama (Revisi 4)
      queryClient.clear();
      // Bersihkan sisa localStorage lama (B2: auth berbasis cookie)
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
      router.push('/login');
    }
  };

  const navOverview: NavItem[] = [
    { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  ];

  const navInventory: NavItem[] = [
    { href: '/dashboard/inventory', label: 'Stock Overview', icon: Boxes },
    {
      href: '/dashboard/transfers',
      label: 'Transfer Stok (WH)',
      icon: ArrowRightLeft,
      action: 'manageTransfers',
    },
    { href: '/dashboard/inventory/movements', label: 'Log Pergerakan', icon: History },
  ];

  const navMaster: NavItem[] = [
    {
      href: '/dashboard/products',
      label: 'Produk & SKU',
      icon: Package,
    },
    {
      href: '/dashboard/categories',
      label: 'Kategori',
      icon: Layers,
      action: 'manageCategories',
    },
    {
      href: '/dashboard/warehouses',
      label: 'Gudang (Multi-WH)',
      icon: Warehouse,
      action: 'manageWarehouses',
    },
    {
      href: '/dashboard/suppliers',
      label: 'Pemasok / Supplier',
      icon: Truck,
    },
    {
      href: '/dashboard/customers',
      label: 'Pelanggan / Customer',
      icon: Users,
    },
  ];

  // Fase 4: dokumen workflow PO/SO - tanpa `action`, terlihat semua role
  // (daftar terbuka semua role; aksi tombol difilter per-status via ACTION_ACCESS)
  const navDocuments: NavItem[] = [
    { href: '/dashboard/purchase-orders', label: 'Purchase Order', icon: ShoppingCart },
    { href: '/dashboard/sales-orders', label: 'Sales Order', icon: Receipt },
    { href: '/dashboard/invoices', label: 'Invoice (Keuangan)', icon: ReceiptText },
  ];

  const navSettings: NavItem[] = [
    { href: '/dashboard/users', label: 'Manajemen User', icon: ShieldCheck, action: 'manageUsers' },
    { href: '/dashboard/audit-logs', label: 'Audit Log', icon: ScrollText, action: 'viewAuditLogs' },
  ];

  const isAccessAllowed = role ? canAccessPath(role, pathname) : false;

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500"></div>
      </div>
    );
  }

  const renderNavItems = (items: NavItem[]) =>
    items
      // Visibilitas = akses baca route (ROUTE_ACCESS) + aksi tulis (ACTION_ACCESS)
      .filter((item) => canAccessPath(role, item.href) && (!item.action || can(role, item.action)))
      .map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
              isActive
                ? 'bg-sky-600 text-white shadow-lg shadow-sky-600/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span>{item.label}</span>
          </Link>
        );
      });

  const navSection = (title: string, items: NavItem[]) => {
    const visible = items.filter(
      (item) => canAccessPath(role, item.href) && (!item.action || can(role, item.action)),
    );
    if (visible.length === 0) return null;
    return (
      <div>
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 mb-2">
          {title}
        </div>
        <div className="space-y-1">{renderNavItems(items)}</div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col flex-shrink-0">
        <div className="p-6 flex items-center space-x-3 border-b border-slate-800">
          <div className="p-2 bg-sky-500/10 text-sky-400 rounded-lg border border-sky-500/20">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-bold text-white tracking-wide">NextERP</h1>
            <p className="text-xs text-slate-400 font-mono">v1.0 - Core ERP</p>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-6 overflow-y-auto">
          {/* Main Section */}
          <div className="space-y-1">{renderNavItems(navOverview)}</div>

          {/* Inventaris & Stok */}
          {navSection('Inventaris & Stok', navInventory)}

          {/* Master Data */}
          {navSection('Master Data', navMaster)}

          {/* Fase 4: Dokumen Workflow PO & SO */}
          {navSection('Pembelian & Penjualan', navDocuments)}

          {/* Pengaturan (Super Admin) */}
          {navSection('Pengaturan', navSettings)}
        </nav>

        {/* User Info Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 truncate">
              <div className="p-1.5 bg-slate-800 text-sky-400 rounded-md">
                <User className="w-4 h-4" />
              </div>
              <div className="truncate">
                <p className="text-sm font-medium text-white truncate">{user?.name}</p>
                <p className="text-xs text-sky-400 font-mono font-semibold">{role}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              title="Logout"
              className="text-slate-400 hover:text-red-400 p-1.5 rounded-lg hover:bg-slate-800 transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <div className="p-8 max-w-7xl w-full mx-auto">
          {isAccessAllowed ? (
            children
          ) : (
            /* Halaman 403 untuk route yang tidak diizinkan role ini */
            <div className="min-h-[60vh] flex items-center justify-center">
              <div className="text-center max-w-md">
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-full w-fit mx-auto mb-6">
                  <ShieldAlert className="w-12 h-12 text-red-400" />
                </div>
                <h1 className="text-2xl font-bold text-white mb-2">403 - Akses Ditolak</h1>
                <p className="text-slate-400 text-sm mb-6">
                  Role <span className="font-mono text-red-400">{role}</span> tidak memiliki
                  izin untuk membuka halaman ini. Hubungi Super Admin jika Anda merasa ini
                  keliru.
                </p>
                <Link
                  href="/dashboard"
                  className="inline-block px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium rounded-lg transition"
                >
                  Kembali ke Overview
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
