import type { ProjectDocument, ProjectValidationResult } from '@portfolio/project-model';

import type { DatabaseClient, DatabasePool, DatabaseQueryResult } from './database.js';

export type ProjectSummary = {
	id: string;
	name: string;
	version: number;
	updatedAt: string;
};

export type SavedProject = Omit<ProjectSummary, 'id'> & {
	projectId: string;
};

export type LoadedProject = SavedProject & {
	document: unknown;
};

export class ProjectNotFoundError extends Error {
	constructor() {
		super('Project not found');
		this.name = 'ProjectNotFoundError';
	}
}

type ProjectRow = {
	id: unknown;
	name: unknown;
	version: unknown;
	updatedAt: unknown;
};

type OwnedProjectRow = ProjectRow & { ownerId: unknown };

type LoadedProjectRow = ProjectRow & { projectId: unknown; document: unknown };

export async function listProjects(
	db: Pick<DatabasePool, 'query'>,
	ownerId: string
): Promise<ProjectSummary[]> {
	const result = await queryRows<ProjectRow>(
		db,
		`SELECT id, name, latest_version AS version, updated_at AS "updatedAt"
FROM projects
WHERE owner_id = $1
ORDER BY updated_at DESC, id ASC`,
		[ownerId]
	);
	return result.map(readProjectSummary);
}

export async function saveProject(
	pool: DatabasePool,
	ownerId: string,
	project: ProjectDocument
): Promise<SavedProject> {
	return withTransaction(pool, async (db) => {
		await db.query(
			`INSERT INTO users (id)
VALUES ($1)
ON CONFLICT (id) DO NOTHING`,
			[ownerId]
		);
		await db.query(
			`INSERT INTO projects (id, owner_id, name)
VALUES ($1, $2, $3)
ON CONFLICT (id) DO NOTHING`,
			[project.id, ownerId, project.name]
		);

		const owned = await queryRows<OwnedProjectRow>(
			db,
			`SELECT id, owner_id AS "ownerId", name, latest_version AS version,
	updated_at AS "updatedAt"
FROM projects
WHERE id = $1
FOR UPDATE`,
			[project.id]
		);
		const row = owned[0];
		if (!row || row.ownerId !== ownerId) throw new ProjectNotFoundError();

		const nextVersion = readSafeInteger(row.version) + 1;
		await db.query(
			`INSERT INTO project_versions (project_id, version, document)
VALUES ($1, $2, $3)`,
			[project.id, nextVersion, project]
		);
		const updated = await queryRows<ProjectRow>(
			db,
			`UPDATE projects
SET name = $3, latest_version = $2, updated_at = now()
WHERE id = $1
RETURNING id, name, latest_version AS version, updated_at AS "updatedAt"`,
			[project.id, nextVersion, project.name]
		);
		const result = updated[0];
		if (!result) throw new Error('Project update returned no row');
		const summary = readProjectSummary(result);
		return {
			projectId: summary.id,
			name: summary.name,
			version: summary.version,
			updatedAt: summary.updatedAt
		};
	});
}

export async function loadProject(
	db: Pick<DatabasePool, 'query'>,
	ownerId: string,
	projectId: string
): Promise<LoadedProject> {
	const result = await queryRows<LoadedProjectRow>(
		db,
		`SELECT p.id AS "projectId", p.name, p.latest_version AS version,
	p.updated_at AS "updatedAt", v.document
FROM projects p
JOIN project_versions v
	ON v.project_id = p.id AND v.version = p.latest_version
WHERE p.id = $1 AND p.owner_id = $2`,
		[projectId, ownerId]
	);
	const row = result[0];
	if (!row) throw new ProjectNotFoundError();
	const summary = readProjectSummary({
			id: row.projectId,
			name: row.name,
			version: row.version,
			updatedAt: row.updatedAt
		});
	return {
		projectId: readString(row.projectId),
		name: summary.name,
		version: summary.version,
		updatedAt: summary.updatedAt,
		document: parseJsonb(row.document)
	};
}

async function withTransaction<T>(
	pool: DatabasePool,
	work: (db: DatabaseClient) => Promise<T>
): Promise<T> {
	if (!pool.connect) throw new Error('Database transactions are unavailable');
	const db = await pool.connect();
	try {
		await db.query('BEGIN');
		const result = await work(db);
		await db.query('COMMIT');
		return result;
	} catch (error) {
		try {
			await db.query('ROLLBACK');
		} catch {
			// Preserve the original failure; the route returns one bounded error.
		}
		throw error;
	} finally {
		db.release();
	}
}

export async function queryRows<Row>(
	db: Pick<DatabasePool, 'query'>,
	text: string,
	values: unknown[]
): Promise<Row[]> {
	const result = (await db.query(text, values)) as DatabaseQueryResult<Row>;
	if (!result || !Array.isArray(result.rows)) throw new Error('Database query returned no rows');
	return result.rows;
}

function readProjectSummary(row: ProjectRow): ProjectSummary {
	return {
		id: readString(row.id),
		name: readString(row.name),
		version: readSafeInteger(row.version),
		updatedAt: readTimestamp(row.updatedAt)
	};
}

function readString(value: unknown): string {
	if (typeof value !== 'string' || value.length === 0) throw new Error('Database row contained an invalid string');
	return value;
}

function readSafeInteger(value: unknown): number {
	const result = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
	if (!Number.isSafeInteger(result) || result < 0) throw new Error('Database row contained an invalid version');
	return result;
}

function readTimestamp(value: unknown): string {
	const date = value instanceof Date ? value : new Date(String(value));
	if (Number.isNaN(date.getTime())) throw new Error('Database row contained an invalid timestamp');
	return date.toISOString();
}

function parseJsonb(value: unknown): unknown {
	if (typeof value !== 'string') return value;
	try {
		return JSON.parse(value) as unknown;
	} catch {
		throw new Error('Database row contained invalid JSON');
	}
}

export function projectValidationError(result: ProjectValidationResult): string {
	return result.success
		? ''
		: result.issues[0]
			? `${result.issues[0].path}: ${result.issues[0].message}`
			: 'Invalid project document';
}
