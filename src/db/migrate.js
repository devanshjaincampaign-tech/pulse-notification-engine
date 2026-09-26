import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const envFile = process.argv[2] === 'test' ? '.env.test' : '.env';
dotenv.config({ path: envFile });

const { pool } = await import('../config/database.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, 'migrations');
const migrationLockId = 'pulse-notification-system-migrations';

async function applyMigration(client, filename) {
  const filePath = path.join(migrationsDir, filename);
  const sql = fs.readFileSync(filePath, 'utf-8');

  await client.query('BEGIN');

  try {
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function runMigrations() {
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query('SELECT pg_advisory_lock(hashtext($1))', [migrationLockId]);

    try {
      const { rows } = await client.query('SELECT filename FROM schema_migrations');
      const alreadyApplied = new Set(rows.map((row) => row.filename));

      const files = fs
        .readdirSync(migrationsDir)
        .filter((file) => file.endsWith('.sql'))
        .sort();

      for (const file of files) {
        if (alreadyApplied.has(file)) {
          console.log(`Skipping already-applied migration: ${file}`);
          continue;
        }

        console.log(`Applying migration: ${file}`);
        await applyMigration(client, file);
        alreadyApplied.add(file);
      }

      console.log('All migrations applied.');
    } finally {
      await client.query('SELECT pg_advisory_unlock(hashtext($1))', [migrationLockId]);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
