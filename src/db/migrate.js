import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../config/database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, 'migrations');

/* 
import.meta.url — every ES Module file automatically has access to import.meta, an object containing metadata about the current file. .url gives you the current file's location — but not as a normal path like C:\Users\..., instead as a URL string, something like file:///C:/Users/Lenovo/.../migrate.js. This URL format is a quirk of how ESM identifies files internally.

fileURLToPath(...) — this is a function from Node's built-in url module (that's why we added import { fileURLToPath } from 'url';). Its entire job is converting that awkward file:///... URL string into a normal, usable file path your OS understands — e.g., C:\Users\Lenovo\...\migrate.js.

path.dirname(...) — once we have the full path to the file itself (migrate.js), we don't want the file path — we want the folder it's sitting in. path.dirname() strips the filename off the end and gives you just the containing directory — e.g., from C:\Users\Lenovo\...\src\db\migrate.js it gives you C:\Users\Lenovo\...\src\db.
*/

async function runMigrations() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  /*pool.query(...) — this is the actual method the pg package gives us to run SQL. Remember pool from database.js? Calling .query() on it does the full cycle behind the scenes: grab an available connection from the pool, run this SQL through it, get the result back, and automatically return that connection to the pool when done — you don't need to manually .connect()/.release() yourself here, pool.query() handles that whole lifecycle for you in one call. (Compare that to our testConnection() function back in database.js, where we did manually connect/release — that was deliberate there, since we wanted to prove a connection could be individually borrowed and returned. For everyday queries like this, pool.query() is the simpler, more common way.)*/

  const { rows } = await pool.query('SELECT filename FROM schema_migrations');
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

    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf-8');

    console.log(`Applying migration: ${file}`);
    await pool.query(sql);
    await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
  }

  console.log('All migrations applied.');
  await pool.end();
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});