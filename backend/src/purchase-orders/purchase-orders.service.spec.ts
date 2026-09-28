import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { POStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PurchaseOrdersService } from './purchase-orders.service';

/**
 * Unit test aturan transisi status PO (mock prisma — tanpa DB).
 * Inti transaksi stok-nya sendiri diuji di test/stock-transactions.spec.ts.
 */
describe('PurchaseOrdersService.updateStatus — aturan transisi (unit)', () => {
  let service: PurchaseOrdersService;
  let prismaMock: { purchaseOrder: { findUnique: jest.Mock }; $transaction: jest.Mock };

  const basePo = {
    id: 'po-id',
    poNumber: 'PO-202609-0001',
    supplierId: 'sup-id',
    warehouseId: 'wh-id',
    status: POStatus.DRAFT,
    supplier: { name: 'Supplier Test' },
    items: [] as unknown[],
  };

  beforeEach(() => {
    prismaMock = {
      purchaseOrder: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    };
    service = new PurchaseOrdersService(prismaMock as unknown as PrismaService);
  });

  it('PO tidak ditemukan -> NotFoundException', async () => {
    prismaMock.purchaseOrder.findUnique.mockResolvedValue(null);

    await expect(
      service.updateStatus('missing-id', { status: POStatus.PENDING }, 'user-1', 'SUPER_ADMIN'),
    ).rejects.toThrow(NotFoundException);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('Transisi dari==ke adalah no-op tanpa transaksi', async () => {
    const po = { ...basePo, status: POStatus.APPROVED };
    prismaMock.purchaseOrder.findUnique.mockResolvedValue(po);

    await expect(
      service.updateStatus(po.id, { status: POStatus.APPROVED }, 'user-1', 'SUPER_ADMIN'),
    ).resolves.toEqual(po);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('Transisi di luar whitelist ditolak (DRAFT -> RECEIVED)', async () => {
    prismaMock.purchaseOrder.findUnique.mockResolvedValue({ ...basePo, status: POStatus.DRAFT });

    await expect(
      service.updateStatus(basePo.id, { status: POStatus.RECEIVED }, 'user-1', 'SUPER_ADMIN'),
    ).rejects.toThrow(BadRequestException);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('APPROVED hanya SUPER_ADMIN (separation of duties)', async () => {
    prismaMock.purchaseOrder.findUnique.mockResolvedValue({ ...basePo, status: POStatus.PENDING });

    await expect(
      service.updateStatus(
        basePo.id,
        { status: POStatus.APPROVED },
        'user-1',
        'PURCHASING_OFFICER',
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('RECEIVED -> COMPLETED hanya FINANCE_OFFICER atau SUPER_ADMIN', async () => {
    prismaMock.purchaseOrder.findUnique.mockResolvedValue({ ...basePo, status: POStatus.RECEIVED });

    await expect(
      service.updateStatus(
        basePo.id,
        { status: POStatus.COMPLETED },
        'user-1',
        'PURCHASING_OFFICER',
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
