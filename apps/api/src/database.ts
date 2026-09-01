import { Pool } from 'pg';

import type { ApiConfig } from './config.js';

export type DatabaseQueryResult<Row = Record<string, unknown>> = {
	rows: Row[];
};

export interface DatabaseClient {
	query<Row = Record<string, unknown>>(
		text: string,
		values?: unknown[]
	): Promise<DatabaseQueryResult<Row>>;
	release(): void;
}

export interface DatabasePool {
	query(text: string, values?: unknown[]): Promise<unknown>;
	connect?(): Promise<DatabaseClient>;
	end(): Promise<void>;
	on?(event: 'error', listener: (error: unknown) => void): unknown;
}

export type SanitizedDatabaseError = {
	name: string;
	code?: string;
};

const POSTGRES_TIMEOUT_MS = 5_000;

export function createPool(config: ApiConfig): DatabasePool {
	return new Pool({
		connectionString: config.databaseUrl,
		max: 5,
		connectionTimeoutMillis: POSTGRES_TIMEOUT_MS,
		query_timeout: POSTGRES_TIMEOUT_MS,
		idleTimeoutMillis: 30_000
	});
}

export function sanitizeDatabaseError(error: unknown): SanitizedDatabaseError {
	if (!(error instanceof Error)) return { name: 'Error' };

	const code = (error as { code?: unknown }).code;
	return typeof code === 'string' ? { name: error.name, code } : { name: error.name };
}
