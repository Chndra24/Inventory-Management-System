import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const ROLES = [
  { name: 'SUPER_ADMIN', description: 'Akses penuh ke seluruh fitur dan sistem' },
  { name: 'WAREHOUSE_MANAGER', description: 'Pengelolaan stok produk, transfer barang, dan verifikasi fisik' },
  { name: 'SALES_SPECIALIST', description: 'Pengelolaan pelanggan, Sales Order, dan draf invoice' },
  { name: 'PURCHASING_OFFICER', description: 'Pengelolaan supplier dan Purchase Order' },
  { name: 'FINANCE_OFFICER', description: 'Verifikasi pembayaran invoice dan laporan keuangan' },
];

async function main() {
  console.log('--- Starting Database Seeding ---');

  // Seed Roles
  for (const roleData of ROLES) {
    const role = await prisma.role.upsert({
      where: { name: roleData.name },
      update: { description: roleData.description },
      create: roleData,
    });
    console.log(`[Role] Upserted: ${role.name}`);
  }

  // Seed Super Admin User
  const superAdminRole = await prisma.role.findUnique({
    where: { name: 'SUPER_ADMIN' },
  });

  if (!superAdminRole) {
    throw new Error('SUPER_ADMIN role not found');
  }

  const defaultEmail = 'admin@erp.com';
  const defaultPassword = 'Admin123!';
  const hashedPassword = await bcrypt.hash(defaultPassword, 10);

  const superAdminUser = await prisma.user.upsert({
    where: { email: defaultEmail },
    update: {
      passwordHash: hashedPassword,
      roleId: superAdminRole.id,
    },
    create: {
      name: 'Super Administrator',
      email: defaultEmail,
      passwordHash: hashedPassword,
      roleId: superAdminRole.id,
    },
  });

  console.log(`[User] Default Super Admin created/updated: ${superAdminUser.email}`);
  console.log('--- Database Seeding Completed Successfully ---');
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

