/* eslint-disable */
/**
 * Membuat schema `erp_test` + push seluruh tabel Prisma ke sana.
 * Jalankan SEKALI sebelum suite test:  npm run test:db:setup
 *
 * Schema test terpisah dari public (data development) sehingga truncate
 * di dalam test tidak pernah menyentuh data asli.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const envPath = path.join(__dirname, '..', '.env');
const raw = fs.readFileSync(envPath, 'utf8');

function readVar(name) {
  const m = raw.match(new RegExp(`^${name}\\s*=\\s*"?([^"\\r\\n]+)"?`, 'm'));
  return m ? m[1] : undefined;
}

function toTestSchema(url) {
  const u = /([?&])schema=[^&]*/.test(url)
    ? url.replace(/([?&])schema=[^&]*/, '$1schema=erp_test')
    : url + (url.includes('?') ? '&schema=erp_test' : '?schema=erp_test');
  return u.replace(/([?&])pgbouncer=true/g, '');
}

const direct = readVar('DIRECT_URL') || readVar('DATABASE_URL');
if (!direct) {
  console.error('DIRECT_URL/DATABASE_URL tidak ditemukan di backend/.env');
  process.exit(1);
}

const env = {
  ...process.env,
  DATABASE_URL: toTestSchema(direct),
  DIRECT_URL: toTestSchema(direct),
};

console.log('-> prisma db push ke schema erp_test (koneksi direct)...');
execSync('npx prisma db push --skip-generate', {
  env,
  stdio: 'inherit',
  cwd: path.join(__dirname, '..'),
});
console.log('\n[OK] Schema test erp_test siap. Jalankan suite dengan: npm test');
