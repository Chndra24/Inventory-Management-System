# 📦 NextERP — Inventory Management System

Sistem manajemen inventori & ERP ringan dengan dashboard interaktif: backend RESTful berbasis **NestJS** dan frontend **Next.js** App Router. Dikembangkan bertahap per fase sesuai [PRD](./erp_inventory_system_prd.md) — dari master data hingga modul keuangan (invoice, pembayaran, PDF, analytics).

## ✨ Modul Fitur

| # | Modul | Ringkasan |
|---|-------|-----------|
| 1 | **Auth & RBAC** | Login cookie HttpOnly (access + refresh token), rate-limit login (5/menit), 5 role: `SUPER_ADMIN`, `WAREHOUSE_MANAGER`, `SALES_SPECIALIST`, `PURCHASING_OFFICER`, `FINANCE_OFFICER` |
| 2 | **Master Data** | Kategori, Produk (SKU/barcode auto-generate), Supplier, Customer, Gudang (kode auto-generate) — CRUD + pencarian + pagination + sort |
| 3 | **Inventory** | Overview stok (global/per gudang), filter *low stock*, penyesuaian stok (adjustment IN/OUT), mutasi stok (audit pergerakan), **transfer antar gudang** dengan alur status |
| 4 | **Procurement (PO)** | Purchase Order `DRAFT → PENDING → APPROVED → RECEIVED → COMPLETED`, penerimaan barang **atomik** (stok masuk + StockMovement + audit dalam satu transaksi) |
| 5 | **Sales (SO)** | Sales Order `PENDING → ALLOCATED → INVOICED → COMPLETED`, alokasi stok **anti negative-stock**, pembuatan invoice otomatis (jatuh tempo +30 hari) |
| 6 | **Keuangan** | Daftar invoice dengan status efektif **OVERDUE on-read** (tanpa cron), catat pembayaran (lunas/parsial), **cetak PDF invoice**, dashboard analytics (nilai inventori, tren pembelian/penjualan, produk terlaris, low stock) |

**Jaminan teknis:** transaksi ACID (rollback penuh saat gagal), audit trail semua aksi sensitif, validasi DTO menyeluruh (whitelist + `forbidNonWhitelisted`), respons konsisten `{ data, meta }`, dokumentasi Swagger otomatis.

## 🛠 Tech Stack

- **Backend:** [NestJS 10](https://nestjs.com) · [Prisma 5](https://www.prisma.io) · PostgreSQL (Supabase) · class-validator · `@nestjs/swagger` · Jest + Supertest
- **Frontend:** [Next.js 14](https://nextjs.org) (App Router) · [TanStack Query v5](https://tanstack.com/query) · Zod · Tailwind CSS

## 📁 Struktur Repo

```
Inventory-Management-System/
├── backend/                    # NestJS REST API (port 4000)
│   ├── prisma/                 # schema.prisma + seed
│   ├── src/                    # modul: auth, master data, inventory, PO, SO, invoices, analytics
│   ├── test/                   # integration test transaksi stok (schema erp_test)
│   └── .env.example            # template environment
├── frontend/                   # Next.js dashboard (port 3000)
│   └── .env.example
├── erp_inventory_system_prd.md # Product Requirement Document
└── README.md
```

## 🚀 Menjalankan Proyek

### Prasyarat

- Node.js **18.17+** dan npm
- Database PostgreSQL (mis. proyek [Supabase](https://supabase.com)) — sediakan *connection string* `DATABASE_URL` dan `DIRECT_URL`

### 1. Backend

```bash
cd backend
npm ci
cp .env.example .env        # Windows: copy .env.example .env
# edit .env — isi DATABASE_URL, DIRECT_URL, JWT_SECRET, JWT_REFRESH_SECRET
npx prisma db push          # sinkronkan skema database
npm run prisma:seed         # buat 5 role + user super admin
npm run start:dev           # → http://localhost:4000/api
```

### 2. Frontend

```bash
cd frontend
npm ci
cp .env.example .env.local  # default sudah benar untuk development
npm run dev                 # → http://localhost:3000
```

### 3. Dokumentasi API

Buka **[http://localhost:4000/api/docs](http://localhost:4000/api/docs)** (Swagger UI).

> Autentikasi memakai **cookie HttpOnly** — login dulu lewat `POST /api/auth/login`, lalu klik **Authorize** di Swagger untuk menyimpan cookie `access_token`.

## 🧪 Testing

```bash
cd backend
npm run test:db:setup   # SEKALI saja — membuat schema test `erp_test` yang terpisah
npm test                # 41 test: unit + integration transaksi stok
npm run test:cov        # laporan coverage
```

- **Isolasi:** seluruh test berjalan di schema `erp_test`, bukan di data development — aman dijalankan kapan pun, bahkan saat server berjalan. Sebelum setiap kasus ada *guard* `current_schema()` yang menghentikan suite bila koneksi menyimpang.
- **Cakupan:** penerimaan PO (atomik), alokasi SO (anti negative-stock + rollback penuh), alokasi paralel, transfer gudang, penyesuaian stok, state machine status PO/SO, util pagination & status invoice.

Perintah lain: `npm run lint`, `npm run build`.

## 🔐 Kredensial Demo & Keamanan

Seed membuat satu user admin:

| Email | Password | Role |
|-------|----------|------|
| `admin@erp.com` | `Admin123!` | SUPER_ADMIN |

> ⚠️ **PENTING — baca sebelum deploy:**
> - Kredensial di atas **hanya untuk development** — karena repo ini publik, siapa pun bisa membacanya. **Ganti password admin** segera setelah login pertama, atau ubah `defaultPassword` di `backend/prisma/seed.ts` sebelum menjalankan seed.
> - **Ganti `JWT_SECRET` dan `JWT_REFRESH_SECRET`** di `.env` dengan nilai acak yang kuat. Kode memuat *fallback* hardcoded (juga terbaca publik) yang ditujukan hanya agar berjalan lokal — jangan pernah mengandalkannya di produksi.
> - Jangan pernah commit file `.env` (sudah masuk `.gitignore` — pastikan tetap begitu).
> - Pastikan lingkungan produksi sudah mengganti **seluruh** rahasia di atas sebelum mengekspos aplikasi ke internet.

## 📄 PRD

Rincian kebutuhan produk, cakupan fase, dan kriteria penerimaan ada di [`erp_inventory_system_prd.md`](./erp_inventory_system_prd.md).
