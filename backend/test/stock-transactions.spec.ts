import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  InvoiceStatus,
  POStatus,
  SOStatus,
  StockMovementType,
  TransferStatus,
} from '@prisma/client';
import { PurchaseOrdersService } from '../src/purchase-orders/purchase-orders.service';
import { SalesOrdersService } from '../src/sales-orders/sales-orders.service';
import { TransfersService } from '../src/transfers/transfers.service';
import { InventoryService } from '../src/inventory/inventory.service';
import { AdjustmentType } from '../src/inventory/dto/adjust-stock.dto';
import { Fixtures, getStock, prisma, resetDatabase, seedFixtures, setStock } from './helpers/db';

jest.setTimeout(60_000);

/**
 * Integration test transaksi stok (Fase 6 — PRD NFR ACID, baris 160).
 *
 * Berjalan di schema test `erp_test` (terpisah dari data development) dengan
 * reset total sebelum tiap kasus. Membuktikan:
 * - atomicity penerimaan PO & alokasi SO,
 * - rollback penuh saat gagal (tidak ada perubahan parsial),
 * - anti negative-stock,
 * - StockMovement & AuditLog selalu tercatat mengikuti transaksi.
 */
describe('Transaksi stok (integration, schema erp_test)', () => {
  let fx: Fixtures;
  let poService: PurchaseOrdersService;
  let soService: SalesOrdersService;
  let transferService: TransfersService;
  let inventoryService: InventoryService;

  beforeAll(() => {
    poService = new PurchaseOrdersService(prisma);
    soService = new SalesOrdersService(prisma);
    transferService = new TransfersService(prisma);
    inventoryService = new InventoryService(prisma);
  });

  beforeEach(async () => {
    await resetDatabase();
    fx = await seedFixtures();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ---------- pembantu ----------

  async function createPo(quantity: number) {
    return poService.create(
      {
        supplierId: fx.supplierId,
        warehouseId: fx.warehouseAId,
        items: [{ productId: fx.productId, quantity, unitPrice: 1000 }],
      },
      fx.userId,
    );
  }

  function poStatus(poId: string, to: POStatus, roleName = 'SUPER_ADMIN') {
    return poService.updateStatus(poId, { status: to }, fx.userId, roleName);
  }

  async function createSo(quantity: number) {
    return soService.create(
      {
        customerId: fx.customerId,
        warehouseId: fx.warehouseAId,
        items: [{ productId: fx.productId, quantity, unitPrice: 1500 }],
      },
      fx.userId,
    );
  }

  function soStatus(soId: string, to: SOStatus, roleName = 'SUPER_ADMIN') {
    return soService.updateStatus(soId, { status: to }, fx.userId, roleName);
  }

  async function createTransfer(quantity: number) {
    return transferService.create(
      {
        fromWarehouseId: fx.warehouseAId,
        toWarehouseId: fx.warehouseBId,
        items: [{ productId: fx.productId, quantity }],
        notes: 'Transfer uji Fase 6',
      },
      fx.userId,
    );
  }

  // =====================================================
  // Modul 4 — Purchase Order: penerimaan barang
  // =====================================================
  describe('PO receiving (Modul 4)', () => {
    it('RECEIVED menambah stok atomik + mencatat StockMovement IN + audit', async () => {
      const po = await createPo(10);
      await poStatus(po.id, POStatus.PENDING);
      await poStatus(po.id, POStatus.APPROVED);
      const received = await poStatus(po.id, POStatus.RECEIVED);

      expect(received.status).toBe(POStatus.RECEIVED);
      expect(await getStock(fx.productId, fx.warehouseAId)).toBe(10);

      const movements = await prisma.stockMovement.findMany({
        where: { productId: fx.productId, type: StockMovementType.IN },
      });
      expect(movements).toHaveLength(1);
      expect(movements[0].quantity).toBe(10);
      expect(movements[0].referenceId).toContain(po.poNumber);

      const audit = await prisma.auditLog.findFirst({
        where: { action: 'UPDATE_PO_STATUS', entityId: po.id },
      });
      expect(audit).not.toBeNull();
    });

    it('Penerimaan ganda tidak menggandakan stok (no-op + whitelist)', async () => {
      const po = await createPo(10);
      await poStatus(po.id, POStatus.PENDING);
      await poStatus(po.id, POStatus.APPROVED);
      await poStatus(po.id, POStatus.RECEIVED);

      // Panggil ulang dengan status yang sama = no-op, stok tidak dobel.
      await poStatus(po.id, POStatus.RECEIVED);
      expect(await getStock(fx.productId, fx.warehouseAId)).toBe(10);

      // Setelah COMPLETED, RECEIVED tidak lagi diizinkan whitelist transisi.
      await poStatus(po.id, POStatus.COMPLETED);
      await expect(poStatus(po.id, POStatus.RECEIVED)).rejects.toThrow(BadRequestException);
      expect(await getStock(fx.productId, fx.warehouseAId)).toBe(10);
    });

    it('Transisi liar & role tidak berhak ditolak tanpa menyentuh stok', async () => {
      const po = await createPo(5);
      await poStatus(po.id, POStatus.PENDING);

      // Separation of duties: APPROVED hanya SUPER_ADMIN.
      await expect(poStatus(po.id, POStatus.APPROVED, 'PURCHASING_OFFICER')).rejects.toThrow(
        ForbiddenException,
      );
      // PENDING -> RECEIVED tidak ada di whitelist.
      await expect(poStatus(po.id, POStatus.RECEIVED)).rejects.toThrow(BadRequestException);

      expect(await getStock(fx.productId, fx.warehouseAId)).toBe(0);
      const still = await prisma.purchaseOrder.findUnique({ where: { id: po.id } });
      expect(still?.status).toBe(POStatus.PENDING);
      const movements = await prisma.stockMovement.count();
      expect(movements).toBe(0);
    });
  });

  // =====================================================
  // Modul 5 — Sales Order: alokasi & potong stok
  // =====================================================
  describe('SO allocation (Modul 5)', () => {
    it('ALLOCATED memotong stok atomik + mencatat StockMovement OUT', async () => {
      await setStock(fx.productId, fx.warehouseAId, 10);
      const so = await createSo(3);

      await soStatus(so.id, SOStatus.ALLOCATED, 'SALES_SPECIALIST');

      expect(await getStock(fx.productId, fx.warehouseAId)).toBe(7);
      const movements = await prisma.stockMovement.findMany({
        where: { productId: fx.productId, type: StockMovementType.OUT },
      });
      expect(movements).toHaveLength(1);
      expect(movements[0].quantity).toBe(-3);
      expect(movements[0].referenceId).toContain(so.soNumber);

      const audit = await prisma.auditLog.findFirst({
        where: { action: 'UPDATE_SO_STATUS', entityId: so.id },
      });
      expect(audit).not.toBeNull();
    });

    it('Stok kurang: ditolak dengan ROLLBACK penuh (stok, status, movement)', async () => {
      await setStock(fx.productId, fx.warehouseAId, 5);
      const so = await createSo(10);

      await expect(soStatus(so.id, SOStatus.ALLOCATED)).rejects.toThrow(ConflictException);

      // Tidak ada perubahan parsial — seluruh transaksi ter-rollback.
      expect(await getStock(fx.productId, fx.warehouseAId)).toBe(5);
      const after = await prisma.salesOrder.findUnique({ where: { id: so.id } });
      expect(after?.status).toBe(SOStatus.PENDING);
      const outs = await prisma.stockMovement.count({
        where: { type: StockMovementType.OUT },
      });
      expect(outs).toBe(0);
    });

    it('Alokasi paralel atas stok terbatas: persis satu yang berhasil', async () => {
      await setStock(fx.productId, fx.warehouseAId, 10);
      const so1 = await createSo(6);
      const so2 = await createSo(6);

      const results = await Promise.allSettled([
        soStatus(so1.id, SOStatus.ALLOCATED),
        soStatus(so2.id, SOStatus.ALLOCATED),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      expect(fulfilled).toHaveLength(1);
      expect(await getStock(fx.productId, fx.warehouseAId)).toBe(4);

      const outs = await prisma.stockMovement.count({
        where: { type: StockMovementType.OUT },
      });
      expect(outs).toBe(1);
    });

    it('INVOICED membuat Invoice UNPAID otomatis (jatuh tempo +30 hari)', async () => {
      await setStock(fx.productId, fx.warehouseAId, 10);
      const so = await createSo(3); // total 3 x Rp 1.500 = Rp 4.500
      await soStatus(so.id, SOStatus.ALLOCATED);

      const invoiced = await soStatus(so.id, SOStatus.INVOICED);
      expect(invoiced.invoice).not.toBeNull();

      const invoice = await prisma.invoice.findUnique({
        where: { salesOrderId: so.id },
      });
      expect(invoice).not.toBeNull();
      expect(invoice!.status).toBe(InvoiceStatus.UNPAID);
      expect(Number(invoice!.totalAmount)).toBe(4500);

      const expectedDue = Date.now() + 30 * 24 * 60 * 60 * 1000;
      expect(Math.abs(invoice!.dueDate!.getTime() - expectedDue)).toBeLessThan(5 * 60 * 1000);
    });

    it('Cancel setelah stok bergerak ditolak (koreksi hanya via adjustment)', async () => {
      await setStock(fx.productId, fx.warehouseAId, 10);
      const so = await createSo(3);
      await soStatus(so.id, SOStatus.ALLOCATED);

      await expect(soStatus(so.id, SOStatus.CANCELLED)).rejects.toThrow(BadRequestException);
      // Stok TIDAK dikembalikan otomatis — tetap 7 sesuai alokasi.
      expect(await getStock(fx.productId, fx.warehouseAId)).toBe(7);
    });
  });

  // =====================================================
  // Modul 3 — Transfer antar gudang
  // =====================================================
  describe('Stock transfer (Modul 3)', () => {
    it('DRAFT -> IN_TRANSIT -> RECEIVED memindahkan stok + 2 movement', async () => {
      await setStock(fx.productId, fx.warehouseAId, 20);
      const transfer = await createTransfer(5);
      expect(transfer.status).toBe(TransferStatus.DRAFT);

      await transferService.updateStatus(
        transfer.id,
        { status: TransferStatus.IN_TRANSIT },
        fx.userId,
      );
      expect(await getStock(fx.productId, fx.warehouseAId)).toBe(15);
      expect(await getStock(fx.productId, fx.warehouseBId)).toBe(0);

      await transferService.updateStatus(
        transfer.id,
        { status: TransferStatus.RECEIVED },
        fx.userId,
      );
      expect(await getStock(fx.productId, fx.warehouseAId)).toBe(15);
      expect(await getStock(fx.productId, fx.warehouseBId)).toBe(5);

      const movements = await prisma.stockMovement.findMany({
        where: { productId: fx.productId, type: StockMovementType.TRANSFER },
        orderBy: { createdAt: 'asc' },
      });
      expect(movements).toHaveLength(2);
      expect(movements[0].quantity).toBe(-5);
      expect(movements[1].quantity).toBe(5);
    });

    it('IN_TRANSIT saat stok asal kurang: gagal total, stok & status tak berubah', async () => {
      await setStock(fx.productId, fx.warehouseAId, 3);
      const transfer = await createTransfer(5);

      await expect(
        transferService.updateStatus(transfer.id, { status: TransferStatus.IN_TRANSIT }, fx.userId),
      ).rejects.toThrow(BadRequestException);

      expect(await getStock(fx.productId, fx.warehouseAId)).toBe(3);
      const after = await prisma.stockTransfer.findUnique({
        where: { id: transfer.id },
      });
      expect(after?.status).toBe(TransferStatus.DRAFT);
      expect(await prisma.stockMovement.count()).toBe(0);
    });

    it('Penerimaan ganda & jalur status salah ditolak', async () => {
      await setStock(fx.productId, fx.warehouseAId, 10);
      const transfer = await createTransfer(5);

      // DRAFT langsung RECEIVED ditolak.
      await expect(
        transferService.updateStatus(transfer.id, { status: TransferStatus.RECEIVED }, fx.userId),
      ).rejects.toThrow(BadRequestException);

      await transferService.updateStatus(
        transfer.id,
        { status: TransferStatus.IN_TRANSIT },
        fx.userId,
      );
      await transferService.updateStatus(
        transfer.id,
        { status: TransferStatus.RECEIVED },
        fx.userId,
      );

      // Terima kedua kali (status sama) = no-op idempoten, stok tidak dobel.
      await transferService.updateStatus(
        transfer.id,
        { status: TransferStatus.RECEIVED },
        fx.userId,
      );
      expect(await getStock(fx.productId, fx.warehouseBId)).toBe(5);

      // Status final tidak bisa diubah ke status lain (guard dokumen final).
      await expect(
        transferService.updateStatus(transfer.id, { status: TransferStatus.IN_TRANSIT }, fx.userId),
      ).rejects.toThrow(BadRequestException);

      expect(await getStock(fx.productId, fx.warehouseAId)).toBe(5);
      expect(await getStock(fx.productId, fx.warehouseBId)).toBe(5);
    });

    it('Membatalkan transfer IN_TRANSIT mengembalikan stok ke gudang asal', async () => {
      await setStock(fx.productId, fx.warehouseAId, 20);
      const transfer = await createTransfer(5);

      await transferService.updateStatus(
        transfer.id,
        { status: TransferStatus.IN_TRANSIT },
        fx.userId,
      );
      expect(await getStock(fx.productId, fx.warehouseAId)).toBe(15);

      await transferService.updateStatus(
        transfer.id,
        { status: TransferStatus.CANCELLED },
        fx.userId,
      );
      expect(await getStock(fx.productId, fx.warehouseAId)).toBe(20);

      const movements = await prisma.stockMovement.findMany({
        where: { productId: fx.productId },
        orderBy: { createdAt: 'asc' },
      });
      // OUT saat IN_TRANSIT + pengembalian saat batal.
      expect(movements).toHaveLength(2);
      expect(movements[1].quantity).toBe(5);
      expect(movements[1].referenceId).toContain('Batal Transfer');
    });

    it('Gudang asal sama dengan tujuan ditolak saat pembuatan', async () => {
      await expect(
        transferService.create(
          {
            fromWarehouseId: fx.warehouseAId,
            toWarehouseId: fx.warehouseAId,
            items: [{ productId: fx.productId, quantity: 1 }],
          },
          fx.userId,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =====================================================
  // Modul 3 — Penyesuaian stok (adjustment)
  // =====================================================
  describe('Stock adjustment (Modul 3)', () => {
    it('IN membuat baris inventori + movement ADJUSTMENT + audit', async () => {
      const result = await inventoryService.adjustStock(
        {
          productId: fx.productId,
          warehouseId: fx.warehouseAId,
          type: AdjustmentType.IN,
          quantity: 8,
          reason: 'Opname awal gudang',
        },
        fx.userId,
      );

      expect(result.previousQuantity).toBe(0);
      expect(result.newQuantity).toBe(8);
      expect(await getStock(fx.productId, fx.warehouseAId)).toBe(8);

      const movements = await prisma.stockMovement.findMany({
        where: { productId: fx.productId, type: StockMovementType.ADJUSTMENT },
      });
      expect(movements).toHaveLength(1);
      expect(movements[0].quantity).toBe(8);

      const audit = await prisma.auditLog.findFirst({
        where: { action: 'STOCK_ADJUSTMENT' },
      });
      expect(audit).not.toBeNull();
    });

    it('OUT melewati sisa stok: ditolak dengan rollback penuh', async () => {
      await setStock(fx.productId, fx.warehouseAId, 5);

      await expect(
        inventoryService.adjustStock(
          {
            productId: fx.productId,
            warehouseId: fx.warehouseAId,
            type: AdjustmentType.OUT,
            quantity: 10,
            reason: 'Rusak',
          },
          fx.userId,
        ),
      ).rejects.toThrow(BadRequestException);

      // Stok tidak berubah, tidak ada movement/audit yatim dari transaksi gagal.
      expect(await getStock(fx.productId, fx.warehouseAId)).toBe(5);
      expect(await prisma.stockMovement.count()).toBe(0);
      expect(await prisma.auditLog.count()).toBe(0);
    });

    it('OUT valid mengurangi stok dan mencatat selisih negatif di movement', async () => {
      await setStock(fx.productId, fx.warehouseAId, 10);

      await inventoryService.adjustStock(
        {
          productId: fx.productId,
          warehouseId: fx.warehouseAId,
          type: AdjustmentType.OUT,
          quantity: 4,
          reason: 'Barang rusak',
        },
        fx.userId,
      );

      expect(await getStock(fx.productId, fx.warehouseAId)).toBe(6);
      const movement = await prisma.stockMovement.findFirst({
        where: { type: StockMovementType.ADJUSTMENT },
      });
      expect(movement?.quantity).toBe(-4);
      expect(movement?.referenceId).toContain('Barang rusak');
    });

    it('Produk tidak dikenal ditolak', async () => {
      await expect(
        inventoryService.adjustStock(
          {
            productId: '00000000-0000-4000-8000-000000000000',
            warehouseId: fx.warehouseAId,
            type: AdjustmentType.IN,
            quantity: 1,
            reason: 'Uji',
          },
          fx.userId,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
