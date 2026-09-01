import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { createPool, sanitizeDatabaseError, type DatabasePool } from './database.js';
import { ConfigError, readConfig } from './config.js';

const MIGRATION_DIRECTORY = fileURLToPath(new URL('../migrations/', import.meta.url));
const MIGRATION_FILE = /^(\d+)-[^/]+\.sql$/;

export async function runMigrations(
	pool: DatabasePool,
	directory = MIGRATION_DIRECTORY
): Promise<void> {
	if (!pool.connect) throw new Error('Database transactions are unavailable');
	const files = (await readdir(directory))
		.map((name) => {
			const match = MIGRATION_FILE.exec(name);
			return match ? { name, version: Number(match[1]) } : null;
		})
		.filter((item): item is { name: string; version: number } => item !== null)
		.sort((a, b) => a.version - b.version);
	const db = await pool.connect();
	try {
		await db.query('BEGIN');
		await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
	version integer PRIMARY KEY,
	applied_at timestamptz NOT NULL DEFAULT now()
)`);
		await db.query('COMMIT');

		for (const file of files) {
			const applied = await db.query<{ version: number }>(
				'SELECT version FROM schema_migrations WHERE version = $1',
				[file.version]
			);
			if (applied.rows.length > 0) continue;
			const sql = await readFile(resolve(directory, file.name), 'utf8');
			await db.query('BEGIN');
			try {
				await db.query(sql);
				await db.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file.version]);
				await db.query('COMMIT');
			} catch (error) {
				try {
					await db.query('ROLLBACK');
				} catch {
					// Keep the migration failure as the command result.
				}
				throw error;
			}
		}
	} finally {
		db.release();
	}
}

export async function main(): Promise<void> {
	let pool: DatabasePool | undefined;
	try {
		pool = createPool(readConfig());
		await runMigrations(pool);
		console.log('[api] migrations applied');
	} catch (error) {
		const safe = sanitizeDatabaseError(error);
		console.error(error instanceof ConfigError ? `[api] ${error.message}` : `[api] migration failed (${safe.name})`);
		process.exitCode = 1;
	} finally {
		await pool?.end();
	}
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
	void main();
}
