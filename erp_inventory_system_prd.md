# Product Requirement Document (PRD)

## Enterprise Resource Planning (ERP) & Inventory Management System

### **1. Informasi Umum**

- **Nama Proyek:** NextERP & Inventory Core

- **Versi Document:** 1.0 (Final)

- **Status:** Ready for Development

- **Tujuan Utama:** Membangun platform ERP & Manajemen Inventaris berbasis web yang andal, scalable, dan type-safe untuk mengelola operasional multi-gudang, rantai pasok (supply chain), serta pencatatan transaksi keuangan secara real-time.

### **2. Target Pengguna & Role-Based Access Control (RBAC)**

Sistem menggunakan hak akses bertingkat (_Role-Based Access Control_) untuk memastikan keamanan data:

| **Role** | **Deskripsi & Hak Akses** |
| **Super Admin** | Akses penuh ke seluruh fitur, manajemen user & role, konfigurasi sistem, dan audit log harian. |
| **Warehouse Manager** | Pengelolaan stok produk, transfer barang antar gudang, pencatatan stok masuk/keluar, dan verifikasi fisik barang. |
| **Sales Specialist** | Pengelolaan data pelanggan, pembuatan _Sales Order_ (SO), pelacakan pengiriman, dan pembuatan draf invoice. |
| **Purchasing Officer** | Pengelolaan data supplier/pemasok, pembuatan _Purchase Order_ (PO), dan penerimaan barang dari supplier. |
| **Finance Officer** | Verifikasi pembayaran invoice, pencatatan arus kas, dan pengunduhan laporan keuangan & valuasi inventaris. |

### **3. Arsitektur Teknis & Tech Stack**

#### **3.1 Tech Stack Utama**

- **Frontend:** Next.js 14+ (App Router, TypeScript)

- **Styling & UI:** Tailwind CSS + Shadcn UI + Lucide Icons

- **Data Table:** TanStack Table v8 (untuk server-side sorting, filtering, dan pagination)

- **Backend:** NestJS (TypeScript) / Node.js Express (Clean Architecture)

- **Database:** PostgreSQL (Relational Database)

- **ORM:** Prisma ORM / Drizzle ORM

- **State Management & Fetching:** TanStack Query v5 (React Query)

- **Validation:** Zod (Shared Schema between Frontend & Backend)

- **Caching & Queue:** Redis + BullMQ (Background processing untuk email alert & PDF generator)

- **Dokumentasi API:** Swagger / OpenAPI Spec

### **4. Modul & Fitur Utama**

#### **Modul 1: Autentikasi & Keamanan**

- **Auth System:** Login/Register berbasis JSON Web Token (JWT) dengan _HTTP-Only Refresh Token Cookie_.

- **RBAC Guard:** Middleware backend dan Next.js Guard frontend untuk membatasi navigasi dan API endpoint berdasarkan role.

- **Audit Trail:** Mencatat seluruh aksi penting (_SIAPA_, _MELAKUKAN APA_, _KAPAN_, _DATA SEBELUM/SESUDAH_).

#### **Modul 2: Master Data Management**

- **Manajemen Produk & SKU:**
  - Pencatatan SKU unik, Barcode, Kategori, Satuan Unit (Pcs, Box, Kg), Harga Beli, dan Harga Jual.

  - Batas minimum (_Min Stock Alert Threshold_) dan batas maksimum stok.

- **Manajemen Warehouse (Multi-Gudang):**
  - Pencatatan lokasi gudang fisik (misal: Gudang Utama, Gudang Transit, Gudang Cabang).

- **Entitas Eksternal:**
  - Database Pelanggan (_Customers_) dan Pemasok (_Suppliers_).

#### **Modul 3: Manajemen Inventaris & Multi-Warehouse**

- **Stock Overview:** Monitoring jumlah stok _real-time_ per gudang maupun secara global.

- **Stock Movement Logs:** Audit trail otomatis yang mencatat setiap alur barang (In, Out, Transfer, Adjustment).

- **Stock Transfer:** Pemindahan barang antar-gudang dengan status (_Draft_ $\rightarrow$ _In-Transit_ $\rightarrow$ _Received_).

- **Stock Adjustment:** Penyesuaian stok manual jika ada barang rusak, hilang, atau selisih opnam.

#### **Modul 4: Procurement / Pembelian (Purchase Order)**

- **Alur Transaksi PO:**
  1. Pembuatan _Purchase Order_ ke Pemasok (_Status: Draft/Pending_).

  2. Persetujuan PO (_Approved_).

  3. Penerimaan Barang (_Receiving Note_): Stok gudang **otomatis bertambah** secara atomic melalui DB Transaction.

  4. Penyelesaian Pembayaran ke Pemasok (_Status: Completed_).

#### **Modul 5: Sales & Penjualan (Sales Order)**

- **Alur Transaksi SO:**
  1. Pembuatan _Sales Order_ untuk Pelanggan (_Status: Pending_).

  2. Alokasi & Pemotongan Stok: Stok gudang **otomatis berkurang** secara atomic.

  3. Pembuatan Faktur (_Invoice Generation_).

  4. Pengiriman & Penghentian Transaksi (_Status: Completed_).

- **Aturan Bisnis Penting:** Mencegah transaksi jika stok di gudang yang dipilih kurang dari jumlah pesanan (_Prevent Negative Stock_).

#### **Modul 6: Keuangan & Faktur (Invoicing)**

- **Invoice Generator:** Pembuatan faktur dalam format PDF yang dapat diunduh langsung (_React-PDF_ / _Puppeteer_).

- **Pelacakan Pembayaran:** Status faktur (_Unpaid_, _Partially Paid_, _Paid_, _Overdue_).

- **Laporan Valuasi Inventaris:** Menghitung total nilai aset barang yang ada di gudang (_Total Stock Quantity_ $\times$ _Cost Price_).

#### **Modul 7: Dashboard Analytics & Alerts**

- **Widgets Utama:**
  - Total Nilai Inventaris saat ini.

  - Ringkasan Penjualan vs Pembelian bulan berjalan.

  - Widget _Low Stock Alert_ (Daftar barang yang menyentuh batas minimum).

  - Produk Terlaris (_Top-selling items_).

- **Background Jobs:** Notifikasi email/sistem otomatis jika ada barang yang perlu di-reorder.

### **5. Perancangan Skema Database (Ringkasan Entitas)**

1.  **`users`**: `id, name, email, password_hash, role_id, created_at`

2.  **`warehouses`**: `id, code, name, address, created_at`

3.  **`categories`**: `id, name, slug`

4.  **`products`**: `id, sku, name, category_id, min_stock, buy_price, sell_price, created_at`

5.  **`inventories`**: `id, product_id, warehouse_id, quantity` _(Junction Table)_

6.  **`stock_movements`**: `id, product_id, warehouse_id, type (IN/OUT/TRANSFER/ADJUSTMENT), quantity, reference_id, created_at`

7.  **`suppliers`**: `id, name, email, phone, address`

8.  **`customers`**: `id, name, email, phone, address`

9.  **`purchase_orders`**: `id, po_number, supplier_id, warehouse_id, status, total_amount, created_at`

10. **`purchase_order_items`**: `id, po_id, product_id, quantity, unit_price`

11. **`sales_orders`**: `id, so_number, customer_id, warehouse_id, status, total_amount, created_at`

12. **`sales_order_items`**: `id, so_id, product_id, quantity, unit_price`

13. **`invoices`**: `id, invoice_number, sales_order_id, status, due_date, total_amount`

14. **`audit_logs`**: `id, user_id, action, entity, entity_id, payload, created_at`

### **6. Kriteria Non-Fungsional (Non-Functional Requirements)**

- **Integritas Data (ACID Compliance):** Setiap proses penerimaan (PO) dan pemotongan stok (SO) **WAJIB** menggunakan `prisma.$transaction` atau `BEGIN ... COMMIT` SQL transaksi agar tidak terjadi perselisihan data (_race condition_).

- **Performa Server-Side:** Endpoint daftar inventaris dan transaksi harus menggunakan server-side pagination (10-50 data per halaman) untuk mengoptimalkan memori browser dan backend.

- **Type Safety:** Menggunakan Zod schema validation dari layer request body hingga response API.

- **Dokumentasi API:** Dokumentasi Swagger UI interaktif yang dapat dicoba oleh HR/Recruiter saat meninjau portofolio.

### **7. Tahapan Eksekusi (Roadmap Implemetasi)**

- **Fase 1 (Minggu 1):** Inisialisasi Project (Monorepo/Polyrepo), Setup PostgreSQL DB, Prisma Schema Migration, Auth & RBAC API.

- **Fase 2 (Minggu 2):** Backend & UI Master Data (Products, Categories, Warehouses, Suppliers, Customers).

- **Fase 3 (Minggu 3):** Modul Stok & Logic Database Transaction (Stock Movement, Stock Transfer, Inventory View).

- **Fase 4 (Minggu 4):** Modul PO & SO Workflow (Order Creation, Auto Stock Updates, Status State Machine).

- **Fase 5 (Minggu 5):** Modul Keuangan (Invoicing, Invoice PDF Export, Analytics Dashboard).

- **Fase 6 (Minggu 6):** Refactoring, Testing (Unit Test untuk transaksi stok), dan Dokumentasi Swagger.
