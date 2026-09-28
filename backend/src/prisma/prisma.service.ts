import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    // DB remote via Supabase pooler (pgbouncer): default Prisma (maxWait 2s,
    // timeout 5s) terlalu ketat — transaksi bisa gugur di tengah jalan dengan
    // P2028 "Transaction not found". Naikkan default utk semua $transaction.
    super({ transactionOptions: { maxWait: 5_000, timeout: 15_000 } });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

