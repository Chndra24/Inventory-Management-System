'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { DashboardLayout } from '@/components/dashboard-layout';
import { useAuth } from '@/lib/use-auth';
import { canAccessPath } from '@/lib/permissions';
import { apiClient } from '@/lib/api-client';
import type { AnalyticsOverview, InventoryOverviewItem, PaginatedResponse } from '@/types';
import Link from 'next/link';
import {
  Layers,
  Package,
  Warehouse,
  Truck,
  Users,
  ShieldCheck,
  Boxes,
  Receipt,
  ShoppingCart,
  AlertTriangle,
  BarChart3,
  ArrowRight,
} from 'lucide-react';

function formatRupiah(value: number): string {
  return `Rp ${value.toLocaleString('id-ID')}`;
}

/** Format ringkas utk sumbu chart: "1,5 jt" / "250 rb" */
function formatRupiahRingkas(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toLocaleString('id-ID')} M`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toLocaleString('id-ID')} jt`;
  if (abs >= 1_000) return `${(value / 1_000).toLocaleString('id-ID')} rb`;
  return String(value);
}

const TOOLTIP_STYLE = {
  backgroundColor: '#0F172A',
  border: '1px solid #334155',
  borderRadius: 8,
  fontSize: 12,
};

export default function DashboardPage() {
  const { role } = useAuth();

  // Fase 5 - Modul 7: widget analytics dari endpoint /analytics/overview
  const { data: overviewResp, isLoading: overviewLoading } = useQuery<{
    data: AnalyticsOverview;
  }>({
    queryKey: ['analytics-overview'],
    queryFn: async () => {
      const res = await apiClient.get('/analytics/overview');
      return res.data;
    },
  });
  const overview = overviewResp?.data;

  // Daftar item low stock (reuse endpoint inventory lama, tanpa duplikasi backend)
  const { data: lowStockResp } = useQuery<PaginatedResponse<InventoryOverviewItem>>({
    queryKey: ['low-stock-widget'],
    queryFn: async () => {
      const res = await apiClient.get('/inventory', {
        params: { lowStockOnly: true, limit: 5 },
      });
      return res.data;
    },
  });
  const lowStockItems = lowStockResp?.data ?? [];

  const masterModules = [
    { title: 'Manajemen Produk & SKU', href: '/dashboard/products', icon: Package, countLabel: 'Katalog SKU & Harga' },
    { title: 'Kategori Produk', href: '/dashboard/categories', icon: Layers, countLabel: 'Pengelompokan Barang' },
    { title: 'Gudang (Multi-Warehouse)', href: '/dashboard/warehouses', icon: Warehouse, countLabel: 'Lokasi Fisik Gudang' },
    { title: 'Pemasok / Supplier', href: '/dashboard/suppliers', icon: Truck, countLabel: 'Database Supplier PO' },
    { title: 'Pelanggan / Customer', href: '/dashboard/customers', icon: Users, countLabel: 'Database Client SO' },
  ].filter((m) => canAccessPath(role, m.href));

  const statCards = overview
    ? [
        {
          title: 'Nilai Inventaris',
          value: formatRupiah(overview.inventoryValue),
          sub: 'Σ (stok × harga beli)',
          icon: Boxes,
          iconCls: 'text-emerald-400',
          bgCls: 'bg-emerald-500/10',
          href: '/dashboard/inventory',
        },
        {
          title: 'Penjualan Bulan Ini',
          value: formatRupiah(overview.salesThisMonth),
          sub: 'Invoice terbit bulan berjalan',
          icon: Receipt,
          iconCls: 'text-sky-400',
          bgCls: 'bg-sky-500/10',
          href: '/dashboard/invoices',
        },
        {
          title: 'Pembelian Bulan Ini',
          value: formatRupiah(overview.purchasesThisMonth),
          sub: 'PO diterima bulan berjalan',
          icon: ShoppingCart,
          iconCls: 'text-violet-400',
          bgCls: 'bg-violet-500/10',
          href: '/dashboard/purchase-orders',
        },
        {
          title: 'Stok Menipis',
          value: `${overview.lowStockCount} produk`,
          sub: 'Menyentuh batas minimum',
          icon: AlertTriangle,
          iconCls: 'text-amber-400',
          bgCls: 'bg-amber-500/10',
          href: '/dashboard/inventory',
        },
      ]
    : [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header analytics */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
            <BarChart3 className="text-sky-400 w-6 h-6" />
            NextERP Analytics Overview
          </h2>
          <p className="text-slate-400 text-sm">
            Ringkasan aset inventaris, penjualan vs pembelian bulan berjalan, dan peringatan stok
            minimum.
          </p>
        </div>

        {/* 4 kartu statistik utama (Modul 7) */}
        {overviewLoading || !overview ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-slate-900 border border-slate-800 rounded-xl p-5 animate-pulse h-28"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {statCards.map((card) => {
              const Icon = card.icon;
              return (
                <Link
                  key={card.title}
                  href={card.href}
                  className="bg-slate-900 border border-slate-800 hover:border-sky-500/40 rounded-xl p-5 transition group"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-slate-400">{card.title}</span>
                    <div className={`p-2 rounded-lg ${card.bgCls}`}>
                      <Icon className={`w-4 h-4 ${card.iconCls}`} />
                    </div>
                  </div>
                  <p className="font-mono text-lg font-bold text-white group-hover:text-sky-400 transition break-words">
                    {card.value}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">{card.sub}</p>
                </Link>
              );
            })}
          </div>
        )}

        {/* Grafik tren + top produk (Recharts) */}
        {overview && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5">
              <h3 className="font-bold text-white mb-4">Tren Penjualan vs Pembelian (6 Bulan)</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={overview.trend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: '#64748B', fontSize: 12 }}
                    axisLine={{ stroke: '#334155' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#64748B', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={formatRupiahRingkas}
                    width={70}
                  />
                  <Tooltip
                    formatter={(value) => formatRupiah(Number(value))}
                    contentStyle={TOOLTIP_STYLE}
                    cursor={{ fill: '#1E293B' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar
                    dataKey="sales"
                    name="Penjualan"
                    fill="#38BDF8"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={30}
                  />
                  <Bar
                    dataKey="purchases"
                    name="Pembelian"
                    fill="#A78BFA"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={30}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <h3 className="font-bold text-white mb-4">Produk Terlaris</h3>
              {overview.topProducts.length === 0 ? (
                <p className="text-sm text-slate-500 italic py-8 text-center">
                  Belum ada penjualan tercatat
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart
                    layout="vertical"
                    data={overview.topProducts}
                    margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
                  >
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={110}
                      interval={0}
                      tick={{ fill: '#94A3B8', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(value) => `${value} unit`}
                      contentStyle={TOOLTIP_STYLE}
                      cursor={{ fill: '#1E293B' }}
                    />
                    <Bar
                      dataKey="quantity"
                      name="Terjual"
                      fill="#34D399"
                      radius={[0, 4, 4, 0]}
                      maxBarSize={16}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
              <p className="text-[11px] text-slate-500 mt-3">
                Diurutkan dari jumlah unit terjual (semua waktu).
              </p>
            </div>
          </div>
        )}

        {/* Low Stock Alert (Modul 7) */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-white flex items-center gap-2">
              <AlertTriangle className="text-amber-400 w-5 h-5" />
              Low Stock Alert
            </h3>
            <Link
              href="/dashboard/inventory"
              className="text-xs text-sky-400 hover:text-sky-300 font-medium inline-flex items-center gap-1"
            >
              <span>Lihat semua</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          {lowStockItems.length === 0 ? (
            <p className="text-sm text-slate-500 italic">
              Semua stok aman di atas batas minimum — tidak ada produk perlu di-reorder.
            </p>
          ) : (
            <ul className="divide-y divide-slate-800">
              {lowStockItems.map((item) => (
                <li key={item.id} className="py-2.5 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{item.name}</p>
                    <p className="text-[11px] font-mono text-slate-500">{item.sku}</p>
                  </div>
                  <span className="font-mono text-xs whitespace-nowrap">
                    <span className="text-red-400 font-semibold">{item.totalStock}</span>
                    <span className="text-slate-500"> / min {item.minStock}</span>{' '}
                    <span className="text-slate-500">{item.unit}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Modul master (navigasi) */}
        <div>
          <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-1">
            <ShieldCheck className="text-emerald-400 w-5 h-5" />
            Modul Master Data
          </h3>
          <p className="text-slate-400 text-sm">
            Kelola entitas master di bawah ini (akses disesuaikan dengan role Anda).
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {masterModules.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="bg-slate-900 border border-slate-800 hover:border-sky-500/50 p-6 rounded-xl transition group flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-slate-800 text-sky-400 rounded-lg group-hover:bg-sky-500/10 transition">
                      <Icon className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-semibold text-sky-400 bg-sky-500/10 border border-sky-500/20 px-2.5 py-1 rounded-full">
                      Kelola
                    </span>
                  </div>
                  <h3 className="font-bold text-white text-lg group-hover:text-sky-400 transition">
                    {item.title}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">{item.countLabel}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
