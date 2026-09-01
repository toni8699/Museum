import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { createApp } from '../dist/app.js';
import { runMigrations } from '../dist/migrate.js';
import { ConfigError, readConfig } from '../dist/config.js';
import { sanitizeDatabaseError } from '../dist/database.js';
import { installShutdownHandlers } from '../dist/shutdown.js';
import { startServer } from '../dist/server.js';

function stubPool({ query = async () => undefined, end = async () => undefined } = {}) {
	return { query, end };
}

function projectDocument(name = 'Cloud project') {
	return {
		id: 'project:test',
		name,
		layout: {
			units: 'meters',
			floors: [],
			objects: []
		},
		scene: {
			textures: [],
			materials: [],
			entities: [],
			clusters: [],
			navigationNodes: [],
			connections: []
		}
	};
}

function memoryPool() {
	const projects = new Map();
	const versions = new Map();
	const calls = [];
	const pool = {
		calls,
		versions,
		async query(text, values = []) {
			calls.push({ text, values });
			if (text.includes('FROM projects\nWHERE owner_id')) {
				return {
					rows: [...projects.values()]
						.filter((project) => project.ownerId === values[0])
						.map((project) => ({
							id: project.id,
							name: project.name,
							version: project.version,
							updatedAt: project.updatedAt
						}))
				};
			}
			if (text.includes('FROM projects p')) {
				const project = projects.get(values[0]);
				if (!project || project.ownerId !== values[1]) return { rows: [] };
				return {
					rows: [{
						projectId: project.id,
						name: project.name,
						version: project.version,
						updatedAt: project.updatedAt,
						document: versions.get(project.id).get(project.version)
					}]
				};
			}
			throw new Error(`Unexpected pool query: ${text}`);
		},
		async connect() {
			return {
				async query(text, values = []) {
					calls.push({ text, values });
					if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
					if (text.includes('INSERT INTO users')) return { rows: [] };
					if (text.includes('INSERT INTO projects')) {
						const [id, ownerId, name] = values;
						if (!projects.has(id)) projects.set(id, { id, ownerId, name, version: 0, updatedAt: '2026-08-31T00:00:00.000Z' });
						return { rows: [] };
					}
					if (text.includes('owner_id AS "ownerId"')) {
						const project = projects.get(values[0]);
						return {
							rows: project ? [{ ...project, ownerId: project.ownerId }] : []
						};
					}
					if (text.includes('INSERT INTO project_versions')) {
						const [id, version, document] = values;
						if (!versions.has(id)) versions.set(id, new Map());
						versions.get(id).set(version, document);
						return { rows: [] };
					}
					if (text.includes('RETURNING id, name')) {
						const [id, version, name] = values;
						const project = projects.get(id);
						project.name = name;
						project.version = version;
						return { rows: [{ id, name, version, updatedAt: project.updatedAt }] };
					}
					throw new Error(`Unexpected client query: ${text}`);
				},
				release() {}
			};
		},
		async end() {}
	};
	return pool;
}

test('liveness is independent of Postgres', async () => {
	let queries = 0;
	const app = createApp({
		pool: stubPool({ query: async () => queries++ }),
		logger: false
	});

	try {
		const response = await app.inject('/health/live');
		assert.equal(response.statusCode, 200);
		assert.deepEqual(response.json(), { status: 'ok' });
		assert.equal(queries, 0);
	} finally {
		await app.close();
	}
});

test('readiness succeeds after SELECT 1', async () => {
	let statement;
	const app = createApp({
		pool: stubPool({ query: async (text) => (statement = text) }),
		logger: false
	});

	try {
		const response = await app.inject('/health/ready');
		assert.equal(response.statusCode, 200);
		assert.deepEqual(response.json(), { status: 'ok' });
		assert.equal(statement, 'SELECT 1');
	} finally {
		await app.close();
	}
});

test('readiness hides database failures behind a generic 503', async () => {
	const app = createApp({
		pool: stubPool({
			query: async () => {
				throw new Error('postgres://user:secret@example.test/db');
			}
		}),
		logger: false
	});

	try {
		const response = await app.inject('/health/ready');
		assert.equal(response.statusCode, 503);
		assert.deepEqual(response.json(), { status: 'unavailable' });
		assert.equal(response.body.includes('secret'), false);
	} finally {
		await app.close();
	}
});

test('configuration rejects missing and invalid startup values without exposing them', async () => {
	assert.throws(
		() => readConfig({ PORT: '3000' }),
		(error) => error instanceof ConfigError && error.message === 'DATABASE_URL is required'
	);
	assert.throws(
		() => readConfig({ DATABASE_URL: 'https://user:secret@example.test/db', PORT: '3000' }),
		(error) =>
			error instanceof ConfigError &&
			error.message === 'DATABASE_URL must be a PostgreSQL connection URL' &&
			!error.message.includes('secret')
	);
	assert.throws(
		() => readConfig({ DATABASE_URL: 'postgres://user:secret@example.test/db', PORT: '0' }),
		(error) => error instanceof ConfigError && error.message.startsWith('PORT must be')
	);

	await assert.rejects(
		startServer({
			env: { DATABASE_URL: 'not-a-url', PORT: '3000' },
			pool: stubPool()
		}),
		(error) => error instanceof ConfigError
	);
	assert.deepEqual(
		readConfig({ DATABASE_URL: 'postgres://user@db.example.test/app', PORT: '3000' }),
		{ databaseUrl: 'postgres://user@db.example.test/app', port: 3000 }
	);
	assert.equal(
		readConfig({
			DATABASE_URL: 'postgres://user@db.example.test/app',
			PORT: '3000',
			EDITOR_ORIGIN: 'https://editor.example.test/'
		}).editorOrigin,
		'https://editor.example.test'
	);
	assert.throws(
		() => readConfig({ DATABASE_URL: 'postgres://user@db.example.test/app', PORT: '3000', EDITOR_ORIGIN: 'https://editor.example.test/path' }),
		(error) => error instanceof ConfigError && error.message === 'EDITOR_ORIGIN must be an HTTP(S) origin'
	);
});

test('Fastify closes the pool once through the guarded signal path', async () => {
	let closes = 0;
	const app = createApp({
		pool: stubPool({ end: async () => closes++ }),
		logger: false
	});
	const signals = new EventEmitter();
	const closeOnce = installShutdownHandlers(app, signals);

	signals.emit('SIGTERM');
	signals.emit('SIGINT');
	await closeOnce();
	assert.equal(closes, 1);
});

test('database logs retain only safe error metadata', () => {
	const error = Object.assign(new Error('postgres://user:secret@example.test/db'), {
		code: 'ECONNREFUSED'
	});
	assert.deepEqual(sanitizeDatabaseError(error), { name: 'Error', code: 'ECONNREFUSED' });
});

test('project routes require a verified bearer and do not query anonymously', async () => {
	let queries = 0;
	const app = createApp({
		pool: stubPool({ query: async () => queries++ }),
		authVerifier: async (token) => (token === 'valid' ? { subject: 'user-1' } : null),
		logger: false
	});
	try {
		const missing = await app.inject({ method: 'GET', url: '/projects' });
		const invalid = await app.inject({
			method: 'GET',
			url: '/projects',
			headers: { authorization: 'Bearer wrong' }
		});
		assert.equal(missing.statusCode, 401);
		assert.equal(invalid.statusCode, 401);
		assert.equal(queries, 0);
	} finally {
		await app.close();
	}
});

test('project save/load appends immutable versions and isolates owners', async () => {
	const pool = memoryPool();
	const app = createApp({
		pool,
		authVerifier: async (token) => (token === 'other' ? 'user-2' : token === 'valid' ? 'user-1' : null),
		logger: false
	});
	try {
		const first = await app.inject({
			method: 'PUT',
			url: '/projects/project:test',
			headers: { authorization: 'Bearer valid' },
			payload: { document: projectDocument() }
		});
		const secondDocument = projectDocument('Renamed project');
		const second = await app.inject({
			method: 'PUT',
			url: '/projects/project:test',
			headers: { authorization: 'Bearer valid' },
			payload: { document: secondDocument }
		});
		const loaded = await app.inject({
			method: 'GET',
			url: '/projects/project:test',
			headers: { authorization: 'Bearer valid' }
		});
		const list = await app.inject({
			method: 'GET',
			url: '/projects',
			headers: { authorization: 'Bearer valid' }
		});
		const otherList = await app.inject({
			method: 'GET',
			url: '/projects',
			headers: { authorization: 'Bearer other' }
		});
		const otherLoad = await app.inject({
			method: 'GET',
			url: '/projects/project:test',
			headers: { authorization: 'Bearer other' }
		});
		const otherSave = await app.inject({
			method: 'PUT',
			url: '/projects/project:test',
			headers: { authorization: 'Bearer other' },
			payload: { document: projectDocument('Intruder') }
		});

		assert.equal(first.statusCode, 200);
		assert.equal(first.json().version, 1);
		assert.equal(second.statusCode, 200);
		assert.equal(second.json().version, 2);
		assert.equal(loaded.statusCode, 200);
		assert.deepEqual(loaded.json().document, secondDocument);
		assert.deepEqual(list.json().projects.map(({ id, version }) => ({ id, version })), [{ id: 'project:test', version: 2 }]);
		assert.deepEqual(otherList.json(), { projects: [] });
		assert.equal(otherLoad.statusCode, 404);
		assert.equal(otherSave.statusCode, 404);
		assert.deepEqual(pool.versions.get('project:test').get(1), projectDocument());
	} finally {
		await app.close();
	}
});

test('project body parsing keeps malformed and oversized JSON distinct', async () => {
	const app = createApp({ pool: stubPool(), authVerifier: async () => 'user-1', logger: false });
	try {
		const malformed = await app.inject({
			method: 'PUT',
			url: '/projects/project:test',
			headers: { authorization: 'Bearer valid', 'content-type': 'application/json' },
			payload: '{"document":'
		});
		const invalidDocument = await app.inject({
			method: 'PUT',
			url: '/projects/project:test',
			headers: { authorization: 'Bearer valid', 'content-type': 'application/json' },
			payload: JSON.stringify({ document: { id: 'project:test', name: 'Missing fields' } })
		});
		const mismatchedDocument = await app.inject({
			method: 'PUT',
			url: '/projects/project:test',
			headers: { authorization: 'Bearer valid', 'content-type': 'application/json' },
			payload: JSON.stringify({ document: { ...projectDocument(), id: 'project:other' } })
		});
		const oversized = await app.inject({
			method: 'PUT',
			url: '/projects/project:test',
			headers: { authorization: 'Bearer valid', 'content-type': 'application/json' },
			payload: JSON.stringify({ document: 'x'.repeat(2 * 1024 * 1024) })
		});
		assert.equal(malformed.statusCode, 400);
		assert.equal(invalidDocument.statusCode, 400);
		assert.equal(invalidDocument.json().error.code, 'invalid_project');
		assert.equal(mismatchedDocument.statusCode, 400);
		assert.equal(mismatchedDocument.json().error.code, 'project_id_mismatch');
		assert.equal(oversized.statusCode, 413);
	} finally {
		await app.close();
	}
});

test('project payload just under 2 MiB is accepted', async () => {
	const pool = memoryPool();
	const app = createApp({ pool, authVerifier: async () => 'user-1', logger: false });
	try {
		const limit = 2 * 1024 * 1024;
		const basePayload = JSON.stringify({ document: projectDocument('') });
		const name = 'x'.repeat(limit - Buffer.byteLength(basePayload) - 1);
		const payload = JSON.stringify({ document: projectDocument(name) });
		assert.equal(Buffer.byteLength(payload), limit - 1);

		const response = await app.inject({
			method: 'PUT',
			url: '/projects/project:test',
			headers: { authorization: 'Bearer valid', 'content-type': 'application/json' },
			payload
		});

		assert.equal(response.statusCode, 200);
		assert.equal(response.json().version, 1);
	} finally {
		await app.close();
	}
});

test('CORS exposes only the configured editor origin', async () => {
	const app = createApp({
		pool: stubPool(),
		editorOrigin: 'https://editor.example.test',
		logger: false
	});
	try {
		const allowed = await app.inject({
			method: 'OPTIONS',
			url: '/projects',
			headers: {
				origin: 'https://editor.example.test',
				'access-control-request-method': 'GET'
			}
		});
		const rejected = await app.inject({
			method: 'OPTIONS',
			url: '/projects',
			headers: { origin: 'https://other.example.test' }
		});
		assert.equal(allowed.statusCode, 204);
		assert.equal(allowed.headers['access-control-allow-origin'], 'https://editor.example.test');
		assert.equal(rejected.statusCode, 403);
	} finally {
		await app.close();
	}
});

test('migration runner records a migration once and reapplying is a no-op', async () => {
	const applied = new Set();
	const transactions = [];
	const client = {
		async query(text, values = []) {
			transactions.push({ text, values });
			if (text.startsWith('SELECT version')) return { rows: applied.has(values[0]) ? [{ version: values[0] }] : [] };
			if (text.startsWith('INSERT INTO schema_migrations')) applied.add(values[0]);
			return { rows: [] };
		},
		release() {}
	};
	const pool = { connect: async () => client, end: async () => {} };
	await runMigrations(pool);
	const firstSqlCount = transactions.filter(({ text }) => text.includes('CREATE TABLE IF NOT EXISTS users')).length;
	await runMigrations(pool);
	assert.equal(firstSqlCount, 1);
	assert.equal(transactions.filter(({ text }) => text.includes('CREATE TABLE IF NOT EXISTS users')).length, 1);
});
