import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { createApp } from '../dist/app.js';
import { runMigrations } from '../dist/migrate.js';
import { ConfigError, readConfig } from '../dist/config.js';
import { sanitizeDatabaseError } from '../dist/database.js';
import { installShutdownHandlers } from '../dist/shutdown.js';
import { startServer } from '../dist/server.js';

const SESSION_KEY = Buffer.alloc(32, 7);
const SESSION_COOKIE = 'museum-editor-session';

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

function cookieFrom(response) {
	const header = response.headers['set-cookie'];
	const value = Array.isArray(header) ? header[0] : header;
	assert.ok(value, 'response should set a session cookie');
	return value.split(';', 1)[0];
}

async function sessionCookie(app, userId) {
	await app.ready();
	const value = app.encodeSecureSession(app.createSecureSession({ userId }));
	return `${SESSION_COOKIE}=${encodeURIComponent(value)}`;
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

test('configuration validates deployment auth values without exposing secrets', async () => {
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

	const key = Buffer.alloc(32, 9);
	const config = readConfig({
		DATABASE_URL: 'postgres://user@db.example.test/app',
		PORT: '3000',
		API_ORIGIN: 'https://api.example.test/',
		EDITOR_ORIGIN: 'https://editor.example.test/',
		GOOGLE_CLIENT_ID: 'client-id',
		GOOGLE_CLIENT_SECRET: 'client-secret',
		SESSION_KEY: key.toString('base64')
	});
	assert.equal(config.databaseUrl, 'postgres://user@db.example.test/app');
	assert.equal(config.port, 3000);
	assert.equal(config.apiOrigin, 'https://api.example.test');
	assert.equal(config.editorOrigin, 'https://editor.example.test');
	assert.equal(config.googleClientId, 'client-id');
	assert.equal(config.googleClientSecret, 'client-secret');
	assert.deepEqual(config.sessionKey, key);
	assert.throws(
		() => readConfig({
			DATABASE_URL: 'postgres://user@db.example.test/app',
			PORT: '3000',
			EDITOR_ORIGIN: 'https://editor.example.test',
			GOOGLE_CLIENT_ID: 'client-id',
			GOOGLE_CLIENT_SECRET: 'client-secret',
			SESSION_KEY: 'short'
		}),
		(error) => error instanceof ConfigError && !error.message.includes('short')
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

test('login creates fresh state, PKCE, nonce, callback URL, and secure cookie', async () => {
	let authorization;
	const app = createApp({
		pool: stubPool(),
		apiOrigin: 'https://api.example.test',
		editorOrigin: 'https://editor.example.test',
		sessionKey: SESSION_KEY,
		oidc: {
			async createAuthorizationUrl(input) {
				authorization = input;
				return `https://accounts.google.test/auth?${new URLSearchParams({
					client_id: 'client-id',
					redirect_uri: input.redirectUri,
					response_type: 'code',
					scope: 'openid email profile',
					state: input.state,
					code_challenge: input.codeChallenge,
					code_challenge_method: 'S256',
					nonce: input.nonce
				})}`;
			},
			async exchangeAuthorizationCode() {
				throw new Error('not called');
			}
		},
		logger: false
	});
	try {
		const response = await app.inject({ method: 'GET', url: '/auth/login' });
		assert.equal(response.statusCode, 302);
		assert.equal(authorization.redirectUri, 'https://api.example.test/auth/callback');
		assert.match(authorization.state, /^\S+$/);
		assert.match(authorization.codeChallenge, /^\S+$/);
		assert.match(authorization.nonce, /^\S+$/);
		assert.notEqual(authorization.codeChallenge, authorization.state);
		const location = new URL(response.headers.location);
		assert.equal(location.searchParams.get('scope'), 'openid email profile');
		assert.equal(location.searchParams.get('redirect_uri'), authorization.redirectUri);
		assert.equal(location.searchParams.get('state'), authorization.state);
		assert.equal(location.searchParams.get('code_challenge_method'), 'S256');
		const cookie = cookieFrom(response);
		assert.match(response.headers['set-cookie'], /HttpOnly/i);
		assert.match(response.headers['set-cookie'], /Secure/i);
		assert.match(response.headers['set-cookie'], /SameSite=Lax/i);
		assert.match(cookie, new RegExp(`^${SESSION_COOKIE}=`));
	} finally {
		await app.close();
	}
});

test('callback validates the session-bound state and forwards PKCE plus nonce', async () => {
	let authorization;
	let callback;
	let queries = 0;
	const pool = stubPool({ query: async () => queries++ });
	const app = createApp({
		pool,
		apiOrigin: 'https://api.example.test',
		editorOrigin: 'https://editor.example.test',
		sessionKey: SESSION_KEY,
		oidc: {
			async createAuthorizationUrl(input) {
				authorization = input;
				return 'https://accounts.google.test/auth';
			},
			async exchangeAuthorizationCode(input) {
				callback = input;
				return { subject: 'google-subject-1' };
			}
		},
		logger: false
	});
	try {
		const login = await app.inject({ method: 'GET', url: '/auth/login' });
		const callbackResponse = await app.inject({
			method: 'GET',
			url: `/auth/callback?code=authorization-code&state=${encodeURIComponent(authorization.state)}`,
			headers: { cookie: cookieFrom(login) }
		});
		assert.equal(callbackResponse.statusCode, 302);
		assert.equal(callbackResponse.headers.location, 'https://editor.example.test');
		assert.equal(callback.callbackUrl.toString(), `https://api.example.test/auth/callback?code=authorization-code&state=${encodeURIComponent(authorization.state)}`);
		assert.equal(callback.codeVerifier.length > 20, true);
		assert.equal(callback.expectedState, authorization.state);
		assert.equal(callback.expectedNonce, authorization.nonce);
		assert.equal(queries, 0);

		const me = await app.inject({
			method: 'GET',
			url: '/auth/me',
			headers: { cookie: cookieFrom(callbackResponse) }
		});
		assert.deepEqual(me.json(), { authenticated: true, user: { id: 'google:google-subject-1' } });
	} finally {
		await app.close();
	}
});

test('tampered state, rejected PKCE/token, and invalid identity never create a session', async () => {
	let exchangeCalls = 0;
	const app = createApp({
		pool: stubPool(),
		apiOrigin: 'https://api.example.test',
		editorOrigin: 'https://editor.example.test',
		sessionKey: SESSION_KEY,
		oidc: {
			async createAuthorizationUrl(input) {
				return `https://accounts.google.test/auth?state=${encodeURIComponent(input.state)}`;
			},
			async exchangeAuthorizationCode() {
				exchangeCalls += 1;
				throw new Error('token exchange rejected');
			}
		},
		logger: false
	});
	try {
		const login = await app.inject({ method: 'GET', url: '/auth/login' });
		const cookie = cookieFrom(login);
		const tampered = await app.inject({
			method: 'GET',
			url: '/auth/callback?code=authorization-code&state=wrong',
			headers: { cookie }
		});
		assert.equal(tampered.statusCode, 400);
		assert.equal(exchangeCalls, 0);
		const tamperedMe = await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie: cookieFrom(tampered) } });
		assert.deepEqual(tamperedMe.json(), { authenticated: false });

		const secondLogin = await app.inject({ method: 'GET', url: '/auth/login' });
		const state = new URL(secondLogin.headers.location).searchParams.get('state');
		const rejected = await app.inject({
			method: 'GET',
			url: `/auth/callback?code=authorization-code&state=${encodeURIComponent(state)}`,
			headers: { cookie: cookieFrom(secondLogin) }
		});
		assert.equal(rejected.statusCode, 400);
		assert.equal(exchangeCalls, 1);
		const rejectedMe = await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie: cookieFrom(rejected) } });
		assert.deepEqual(rejectedMe.json(), { authenticated: false });
		assert.equal(rejected.body.includes('token exchange'), false);
	} finally {
		await app.close();
	}
});

test('project routes require a valid secure session and do not query anonymously', async () => {
	let queries = 0;
	const app = createApp({
		pool: stubPool({ query: async () => queries++ }),
		sessionKey: SESSION_KEY,
		logger: false
	});
	try {
		const missing = await app.inject({ method: 'GET', url: '/projects' });
		const invalid = await app.inject({
			method: 'GET',
			url: '/projects',
			headers: { cookie: `${SESSION_COOKIE}=invalid` }
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
	const app = createApp({ pool, sessionKey: SESSION_KEY, logger: false });
	try {
		const userOne = await sessionCookie(app, 'google:user-1');
		const userTwo = await sessionCookie(app, 'google:user-2');
		const first = await app.inject({
			method: 'PUT',
			url: '/projects/project:test',
			headers: { cookie: userOne },
			payload: { document: projectDocument() }
		});
		const secondDocument = projectDocument('Renamed project');
		const second = await app.inject({
			method: 'PUT',
			url: '/projects/project:test',
			headers: { cookie: userOne },
			payload: { document: secondDocument }
		});
		const loaded = await app.inject({ method: 'GET', url: '/projects/project:test', headers: { cookie: userOne } });
		const list = await app.inject({ method: 'GET', url: '/projects', headers: { cookie: userOne } });
		const otherList = await app.inject({ method: 'GET', url: '/projects', headers: { cookie: userTwo } });
		const otherLoad = await app.inject({ method: 'GET', url: '/projects/project:test', headers: { cookie: userTwo } });
		const otherSave = await app.inject({
			method: 'PUT',
			url: '/projects/project:test',
			headers: { cookie: userTwo },
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
		assert.equal(pool.calls.filter(({ text }) => text.includes('INSERT INTO users')).length, 3);
	} finally {
		await app.close();
	}
});

test('project body parsing keeps malformed, invalid, mismatched, and oversized JSON distinct', async () => {
	const app = createApp({ pool: memoryPool(), sessionKey: SESSION_KEY, logger: false });
	try {
		const cookie = await sessionCookie(app, 'google:user-1');
		const headers = { cookie, 'content-type': 'application/json' };
		const malformed = await app.inject({ method: 'PUT', url: '/projects/project:test', headers, payload: '{"document":' });
		const invalidDocument = await app.inject({
			method: 'PUT',
			url: '/projects/project:test',
			headers,
			payload: JSON.stringify({ document: { id: 'project:test', name: 'Missing fields' } })
		});
		const mismatchedDocument = await app.inject({
			method: 'PUT',
			url: '/projects/project:test',
			headers,
			payload: JSON.stringify({ document: { ...projectDocument(), id: 'project:other' } })
		});
		const oversized = await app.inject({
			method: 'PUT',
			url: '/projects/project:test',
			headers,
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
	const app = createApp({ pool, sessionKey: SESSION_KEY, logger: false });
	try {
		const cookie = await sessionCookie(app, 'google:user-1');
		const limit = 2 * 1024 * 1024;
		const basePayload = JSON.stringify({ document: projectDocument('') });
		const name = 'x'.repeat(limit - Buffer.byteLength(basePayload) - 1);
		const payload = JSON.stringify({ document: projectDocument(name) });
		assert.equal(Buffer.byteLength(payload), limit - 1);

		const response = await app.inject({
			method: 'PUT',
			url: '/projects/project:test',
			headers: { cookie, 'content-type': 'application/json' },
			payload
		});

		assert.equal(response.statusCode, 200);
		assert.equal(response.json().version, 1);
	} finally {
		await app.close();
	}
});

test('CORS, credentials, origin checks, and logout are restricted to the editor origin', async () => {
	const app = createApp({
		pool: memoryPool(),
		apiOrigin: 'https://api.example.test',
		editorOrigin: 'https://editor.example.test',
		sessionKey: SESSION_KEY,
		logger: false
	});
	try {
		const allowed = await app.inject({
			method: 'OPTIONS',
			url: '/projects',
			headers: {
				origin: 'https://editor.example.test',
				'access-control-request-method': 'GET',
				'access-control-request-headers': 'content-type'
			}
		});
		const rejected = await app.inject({
			method: 'OPTIONS',
			url: '/projects',
			headers: { origin: 'https://other.example.test' }
		});
		assert.equal(allowed.statusCode, 204);
		assert.equal(allowed.headers['access-control-allow-origin'], 'https://editor.example.test');
		assert.equal(allowed.headers['access-control-allow-credentials'], 'true');
		assert.equal(allowed.headers['access-control-allow-methods'], 'GET, PUT, POST, OPTIONS');
		assert.equal(allowed.headers['access-control-allow-headers'], 'Content-Type');
		assert.equal(rejected.statusCode, 403);

		const cookie = await sessionCookie(app, 'google:user-1');
		const badPut = await app.inject({
			method: 'PUT',
			url: '/projects/project:test',
			headers: { origin: 'https://other.example.test', cookie },
			payload: { document: projectDocument() }
		});
		const badLogout = await app.inject({
			method: 'POST',
			url: '/auth/logout',
			headers: { origin: 'https://other.example.test', cookie }
		});
		assert.equal(badPut.statusCode, 403);
		assert.equal(badLogout.statusCode, 403);

		const logout = await app.inject({
			method: 'POST',
			url: '/auth/logout',
			headers: { origin: 'https://editor.example.test', cookie }
		});
		assert.equal(logout.statusCode, 204);
		const me = await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie: cookieFrom(logout) } });
		assert.deepEqual(me.json(), { authenticated: false });
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
