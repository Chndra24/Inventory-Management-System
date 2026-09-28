import * as fs from 'fs';
import * as path from 'path';

/**
 * Setup lingkungan test (Fase 6) — dijalankan Jest sebelum modul test di-import.
 *
 * - .env tidak di-load otomatis oleh Jest (dotenv/ConfigModule hanya jalan di
 *   aplikasi), jadi DATABASE_URL dibaca manual dari backend/.env.
 * - Koneksi DIARAHKAN ke schema khusus test `erp_test` melalui koneksi DIRECT
 *   (tanpa pgbouncer) agar:
 *   (1) data development di schema public tidak pernah tersentuh, dan
 *   (2) transaksi interaktif Prisma + search_path andal di test.
 */
const envPath = path.join(__dirname, '..', '.env');
const raw = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

function readVar(name: string): string | undefined {
  const match = raw.match(new RegExp(`^${name}\\s*=\\s*"?([^"\\r\\n]+)"?`, 'm'));
  return match ? match[1] : process.env[name];
}

function toTestSchema(url: string): string {
  const withSchema = /([?&])schema=[^&]*/.test(url)
    ? url.replace(/([?&])schema=[^&]*/, '$1schema=erp_test')
    : url + (url.includes('?') ? '&schema=erp_test' : '?schema=erp_test');
  // Koneksi test memakai jalur direct (bukan pooler transaksional).
  return withSchema.replace(/([?&])pgbouncer=true/g, '');
}

const direct = readVar('DIRECT_URL') || readVar('DATABASE_URL');
if (!direct) {
  throw new Error(
    'DIRECT_URL/DATABASE_URL tidak ditemukan di backend/.env — test tidak bisa berjalan',
  );
}
process.env.DATABASE_URL = toTestSchema(direct);
