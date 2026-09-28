// Konfigurasi Jest (Fase 6).
// - Unit test: file spec di src/ (mock prisma, tanpa DB)
// - Integration test: file spec di test/ (transaksi stok ke schema test erp_test)
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/*.spec.ts', '<rootDir>/test/**/*.spec.ts'],
  // Setup env SEBELUM modul test di-import: arahkan DATABASE_URL ke schema test.
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  // Suite integrasi berbagi satu schema test — serial agar truncate/seed
  // antar file test tidak saling menghapus.
  maxWorkers: 1,
  testTimeout: 30000,
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
};
