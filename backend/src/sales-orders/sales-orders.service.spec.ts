import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SOStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SalesOrdersService } from './sales-orders.service';

/**
 * Unit test aturan transisi status SO (mock prisma — tanpa DB).
 * Inti pemotongan stok atomik diuji di test/stock-transactions.spec.ts.
 */
describe('SalesOrdersService.updateStatus — aturan transisi (unit)', () => {
  let service: SalesOrdersService;
  let prismaMock: { salesOrder: { findUnique: jest.Mock }; $transaction: jest.Mock };

  const baseSo = {
    id: 'so-id',
    soNumber: 'SO-202609-0001',
    customerId: 'cus-id',
    warehouseId: 'wh-id',
    status: SOStatus.PENDING,
    customer: { name: 'Customer Test' },
    items: [] as unknown[],
    invoice: null,
  };

  beforeEach(() => {
    prismaMock = {
      salesOrder: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    };
    service = new SalesOrdersService(prismaMock as unknown as PrismaService);
  });

  it('SO tidak ditemukan -> NotFoundException', async () => {
    prismaMock.salesOrder.findUnique.mockResolvedValue(null);

    await expect(
      service.updateStatus('missing-id', { status: SOStatus.ALLOCATED }, 'user-1', 'SUPER_ADMIN'),
    ).rejects.toThrow(NotFoundException);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('Transisi dari==ke adalah no-op tanpa transaksi', async () => {
    const so = { ...baseSo, status: SOStatus.ALLOCATED };
    prismaMock.salesOrder.findUnique.mockResolvedValue(so);

    await expect(
      service.updateStatus(so.id, { status: SOStatus.ALLOCATED }, 'user-1', 'SUPER_ADMIN'),
    ).resolves.toEqual(so);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('Cancel setelah stok bergerak ditolak (ALLOCATED -> CANCELLED di luar whitelist)', async () => {
    prismaMock.salesOrder.findUnique.mockResolvedValue({ ...baseSo, status: SOStatus.ALLOCATED });

    await expect(
      service.updateStatus(baseSo.id, { status: SOStatus.CANCELLED }, 'user-1', 'SUPER_ADMIN'),
    ).rejects.toThrow(BadRequestException);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('Alokasi hanya SUPER_ADMIN atau SALES_SPECIALIST', async () => {
    prismaMock.salesOrder.findUnique.mockResolvedValue({ ...baseSo, status: SOStatus.PENDING });

    await expect(
      service.updateStatus(baseSo.id, { status: SOStatus.ALLOCATED }, 'user-1', 'FINANCE_OFFICER'),
    ).rejects.toThrow(ForbiddenException);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('COMPLETED hanya dari INVOICED (PENDING -> COMPLETED ditolak)', async () => {
    prismaMock.salesOrder.findUnique.mockResolvedValue({ ...baseSo, status: SOStatus.PENDING });

    await expect(
      service.updateStatus(baseSo.id, { status: SOStatus.COMPLETED }, 'user-1', 'SUPER_ADMIN'),
    ).rejects.toThrow(BadRequestException);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
