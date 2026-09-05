import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import test from 'node:test';

import { createApp } from '../dist/app.js';
import { runMigrations } from '../dist/migrate.js';
import { ConfigError, readConfig } from '../dist/config.js';
import { sanitizeDatabaseError } from '../dist/database.js';
import { installShutdownHandlers } from '../dist/shutdown.js';
import { startServer } from '../dist/server.js';

const SESSION_KEY = Buffer.alloc(32, 7);
const SESSION_COOKIE = 'museum-editor-session';
const R2_ENV = {
	R2_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
	R2_BUCKET: 'museum-assets',
	R2_ACCESS_KEY_ID: 'access-key',
	R2_SECRET_ACCESS_KEY: 'secret-key'
};

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

function assetMemoryPool(options = {}) {
	const projects = new Map([
		['project:test', { id: 'project:test', ownerId: 'google:user-1', name: 'Cloud project' }]
	]);
	const assets = new Map();
	const calls = [];
	const now = '2026-09-03T00:00:00.000Z';

	function assetRow(asset) {
		return {
			id: asset.id,
			projectId: asset.projectId,
			name: asset.name,
			kind: asset.kind,
			storageKind: asset.storageKind,
			sourceKind: asset.sourceKind,
			sourceRef: asset.sourceRef,
			mime: asset.mime,
			byteSize: asset.byteSize,
			sha256: asset.sha256,
			objectKey: asset.objectKey,
			importState: asset.importState,
			createdAt: asset.createdAt,
			updatedAt: asset.updatedAt
		};
	}

	function projectFor(projectId, ownerId) {
		const project = projects.get(projectId);
		return project?.ownerId === ownerId ? project : null;
	}

	function selectAsset(values) {
		const [assetId, projectId, ownerId] = values;
		const asset = assets.get(assetId);
		return asset && asset.projectId === projectId && projectFor(projectId, ownerId)
			? [assetRow(asset)]
			: [];
	}

	function query(text, values = []) {
		calls.push({ text, values });
		if (text.includes('INSERT INTO assets')) {
			const [id, projectId, name, ownerId, objectKey] = values;
			if (!projectFor(projectId, ownerId)) return Promise.resolve({ rows: [] });
			const asset = {
				id,
				projectId,
				name,
				kind: 'texture',
				storageKind: 'r2',
				sourceKind: 'upload',
				sourceRef: null,
				mime: null,
				byteSize: null,
				sha256: null,
				objectKey,
				importState: 'pending',
				createdAt: now,
				updatedAt: now
			};
			assets.set(id, asset);
			return Promise.resolve({ rows: [assetRow(asset)] });
		}
		if (text.includes('LEFT JOIN assets')) {
			const [projectId, ownerId] = values;
			if (!projectFor(projectId, ownerId)) return Promise.resolve({ rows: [] });
			const rows = [...assets.values()]
				.filter((asset) => asset.projectId === projectId)
				.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
				.map(assetRow);
			return Promise.resolve({ rows: rows.length > 0 ? rows : [{ id: null }] });
		}
		if (text.includes('SET object_key =')) {
			const [id, projectId, ownerId, objectKey] = values;
			const asset = assets.get(id);
			if (!asset || asset.projectId !== projectId || !projectFor(projectId, ownerId) || asset.importState === 'ready') {
				return Promise.resolve({ rows: [] });
			}
			Object.assign(asset, { objectKey, importState: 'pending', updatedAt: now });
			return Promise.resolve({ rows: [assetRow(asset)] });
		}
		if (text.includes("SET import_state = 'failed'")) {
			const [id, projectId, ownerId, objectKey] = values;
			const asset = assets.get(id);
			if (
				!asset ||
				asset.projectId !== projectId ||
				!projectFor(projectId, ownerId) ||
				asset.objectKey !== objectKey ||
				asset.importState === 'ready'
			) {
				return Promise.resolve({ rows: [] });
			}
			asset.importState = 'failed';
			return Promise.resolve({ rows: [] });
		}
		if (text.includes('SET mime =')) {
			if (options.failFinalize) return Promise.reject(new Error('injected finalize failure'));
			const [id, projectId, ownerId, mime, byteSize, sha256, objectKey] = values;
			const asset = assets.get(id);
			if (
				!asset ||
				asset.projectId !== projectId ||
				!projectFor(projectId, ownerId) ||
				asset.objectKey !== objectKey ||
				asset.importState !== 'pending'
			) {
				return Promise.resolve({ rows: [] });
			}
			Object.assign(asset, { mime, byteSize, sha256, importState: 'ready', updatedAt: now });
			return Promise.resolve({ rows: [assetRow(asset)] });
		}
		if (text.includes('FROM assets a')) return Promise.resolve({ rows: selectAsset(values) });
		return Promise.reject(new Error(`Unexpected asset pool query: ${text}`));
	}

	return {
		assets,
		calls,
		query,
		async end() {}
	};
}

function memoryObjectStore(options = {}) {
	const objects = new Map();
	const puts = [];
	const gets = [];
	let closes = 0;
	return {
		objects,
		puts,
		gets,
		get closes() {
			return closes;
		},
		async put(key, body, metadata) {
			const chunks = [];
			for await (const chunk of body) chunks.push(Buffer.from(chunk));
			puts.push({ key, options: metadata, bytes: Buffer.concat(chunks) });
			if (options.failPut) throw new Error('injected R2 failure');
			objects.set(key, { bytes: Buffer.concat(chunks), options: metadata });
		},
		async get(key) {
			gets.push(key);
			const object = objects.get(key);
			return object ? { body: Readable.from([object.bytes]), contentLength: object.bytes.length } : null;
		},
		close() {
			closes += 1;
		}
	};
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
		SESSION_KEY: key.toString('base64'),
		...R2_ENV
	});
	assert.equal(config.databaseUrl, 'postgres://user@db.example.test/app');
	assert.equal(config.port, 3000);
	assert.equal(config.apiOrigin, 'https://api.example.test');
	assert.equal(config.editorOrigin, 'https://editor.example.test');
	assert.equal(config.googleClientId, 'client-id');
	assert.equal(config.googleClientSecret, 'client-secret');
	assert.deepEqual(config.sessionKey, key);
	assert.equal(config.r2Endpoint, R2_ENV.R2_ENDPOINT);
	assert.equal(config.r2Bucket, R2_ENV.R2_BUCKET);
	assert.equal(config.r2AccessKeyId, R2_ENV.R2_ACCESS_KEY_ID);
	assert.equal(config.r2SecretAccessKey, R2_ENV.R2_SECRET_ACCESS_KEY);
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
	assert.throws(
		() => readConfig({
			DATABASE_URL: 'postgres://user@db.example.test/app',
			PORT: '3000',
			EDITOR_ORIGIN: 'https://editor.example.test',
			GOOGLE_CLIENT_ID: 'client-id',
			GOOGLE_CLIENT_SECRET: 'client-secret',
			SESSION_KEY: key.toString('base64'),
			...R2_ENV,
			R2_ENDPOINT: 'https://user:secret@r2.example.test'
		}),
		(error) => error instanceof ConfigError && error.message === 'R2_ENDPOINT must be a credential-free HTTPS URL' && !error.message.includes('secret')
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
		assert.equal(callbackResponse.headers.location, 'https://editor.example.test/projects');
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
	const logs = [];
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
		logger: { level: 'warn', stream: { write: (line) => logs.push(JSON.parse(line)) } }
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
		assert.equal(rejected.statusCode, 302);
		assert.equal(rejected.headers.location, 'https://editor.example.test/?auth=failed&intent=projects');
		assert.equal(exchangeCalls, 1);
		assert.equal(
			logs.some((entry) => entry.msg === 'OIDC callback failed' && entry.auth?.reason === 'exchange_failed' && entry.auth?.error?.name === 'Error'),
			true
		);
		assert.equal(JSON.stringify(logs).includes('token exchange rejected'), false);
		const rejectedMe = await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie: cookieFrom(rejected) } });
		assert.deepEqual(rejectedMe.json(), { authenticated: false });
		assert.equal(rejected.body.includes('token exchange'), false);
	} finally {
		await app.close();
	}
});

test('save login intent survives the OIDC round trip and access denial is bounded', async () => {
	let authorization;
	const app = createApp({
		pool: stubPool(),
		apiOrigin: 'https://api.example.test',
		editorOrigin: 'https://editor.example.test',
		sessionKey: SESSION_KEY,
		oidc: {
			async createAuthorizationUrl(input) {
				authorization = input;
				return `https://accounts.google.test/auth?state=${encodeURIComponent(input.state)}`;
			},
			async exchangeAuthorizationCode() {
				return { subject: 'google-save-user' };
			}
		},
		logger: false
	});
	try {
		const invalid = await app.inject({ method: 'GET', url: '/auth/login?intent=other' });
		assert.equal(invalid.statusCode, 400);

		const saveLogin = await app.inject({ method: 'GET', url: '/auth/login?intent=save' });
		const saveCallback = await app.inject({
			method: 'GET',
			url: `/auth/callback?error=access_denied&state=${encodeURIComponent(authorization.state)}`,
			headers: { cookie: cookieFrom(saveLogin) }
		});
		assert.equal(saveCallback.statusCode, 302);
		assert.equal(saveCallback.headers.location, 'https://editor.example.test/?auth=cancelled&intent=save');
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
		assert.equal(allowed.headers['access-control-allow-methods'], 'GET, PUT, POST, PATCH, DELETE, OPTIONS');
		assert.equal(allowed.headers['access-control-allow-headers'], 'Content-Type');
		assert.equal(rejected.statusCode, 403);

		const cookie = await sessionCookie(app, 'google:user-1');
		const badPut = await app.inject({
			method: 'PUT',
			url: '/projects/project:test',
			headers: { origin: 'https://other.example.test', cookie },
			payload: { document: projectDocument() }
		});
		const badAssetPost = await app.inject({
			method: 'POST',
			url: '/projects/project:test/assets',
			headers: { origin: 'https://other.example.test', cookie },
			payload: { name: 'blocked.png' }
		});
		const badLogout = await app.inject({
			method: 'POST',
			url: '/auth/logout',
			headers: { origin: 'https://other.example.test', cookie }
		});
		assert.equal(badPut.statusCode, 403);
		assert.equal(badAssetPost.statusCode, 403);
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

test('asset routes authenticate before parsing or touching storage', async () => {
	const pool = assetMemoryPool();
	const store = memoryObjectStore();
	const app = createApp({ pool, objectStore: store, sessionKey: SESSION_KEY, logger: false });
	try {
		const headers = {
			'content-type': 'application/octet-stream',
			'content-length': '8'
		};
		const missing = await app.inject({
			method: 'PUT',
			url: '/projects/project:test/assets/00000000-0000-4000-8000-000000000001/content',
			headers,
			payload: Buffer.from('ignored')
		});
		const invalid = await app.inject({
			method: 'POST',
			url: '/projects/project:test/assets',
			headers: { cookie: `${SESSION_COOKIE}=invalid` },
			payload: '{"name":"ignored"}'
		});
		assert.equal(missing.statusCode, 401);
		assert.equal(invalid.statusCode, 401);
		assert.equal(pool.calls.length, 0);
		assert.equal(store.puts.length, 0);
	} finally {
		await app.close();
	}
});

test('owned asset registration, streaming upload, metadata, bytes, and isolation work', async () => {
	const pool = assetMemoryPool();
	const store = memoryObjectStore();
	const app = createApp({ pool, objectStore: store, sessionKey: SESSION_KEY, logger: false });
	try {
		const owner = await sessionCookie(app, 'google:user-1');
		const other = await sessionCookie(app, 'google:user-2');
		const registered = await app.inject({
			method: 'POST',
			url: '/projects/project:test/assets',
			headers: { cookie: owner },
			payload: { name: 'Cafe\u0301.png' }
		});
		assert.equal(registered.statusCode, 201);
		const pending = registered.json();
		assert.equal(pending.name, 'Café.png');
		assert.equal(pending.importState, 'pending');
		assert.equal('objectKey' in pending, false);
		assert.match(pending.id, /^[0-9a-f-]{36}$/);

		const assetId = pending.id;
		const pendingBytes = await app.inject({
			method: 'GET',
			url: `/projects/project:test/assets/${assetId}/content`,
			headers: { cookie: owner }
		});
		assert.equal(pendingBytes.statusCode, 409);
		assert.equal(store.gets.length, 0);

		const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
		const uploaded = await app.inject({
			method: 'PUT',
			url: `/projects/project:test/assets/${assetId}/content`,
			headers: {
				cookie: owner,
				'content-type': 'application/octet-stream',
				'content-length': String(bytes.length)
			},
			payload: Readable.from([bytes.subarray(0, 3), bytes.subarray(3, 8), bytes.subarray(8)])
		});
		assert.equal(uploaded.statusCode, 200);
		const ready = uploaded.json();
		assert.equal(ready.importState, 'ready');
		assert.equal(ready.mime, 'image/png');
		assert.equal(ready.byteSize, bytes.length);
		assert.match(ready.sha256, /^sha256-[0-9a-f]{64}$/);
		assert.equal('objectKey' in ready, false);
		assert.equal(store.puts.length, 1);
		assert.match(store.puts[0].key, new RegExp(`^projects/project:test/assets/${assetId}/[0-9a-f]+$`));
		assert.deepEqual(store.puts[0].bytes, bytes);

		const listed = await app.inject({ method: 'GET', url: '/projects/project:test/assets', headers: { cookie: owner } });
		const read = await app.inject({ method: 'GET', url: `/projects/project:test/assets/${assetId}`, headers: { cookie: owner } });
		assert.equal(listed.statusCode, 200);
		assert.equal(listed.json().assets[0].id, assetId);
		assert.deepEqual(read.json(), ready);

		const fetched = await app.inject({
			method: 'GET',
			url: `/projects/project:test/assets/${assetId}/content`,
			headers: { cookie: owner }
		});
		assert.equal(fetched.statusCode, 200);
		assert.equal(fetched.headers['content-type'], 'image/png');
		assert.equal(fetched.headers['content-length'], String(bytes.length));
		assert.equal(fetched.headers['cache-control'], 'private, no-store');
		assert.deepEqual(fetched.rawPayload, bytes);

		for (const request of [
			{ method: 'GET', url: `/projects/project:test/assets/${assetId}` },
			{ method: 'PUT', url: `/projects/project:test/assets/${assetId}/content`, payload: bytes },
			{ method: 'GET', url: `/projects/project:test/assets/${assetId}/content` }
		]) {
			const response = await app.inject({ ...request, headers: { cookie: other, 'content-type': 'application/octet-stream', 'content-length': String(bytes.length) } });
			assert.equal(response.statusCode, 404);
		}
		assert.equal(store.gets.length, 1);
	} finally {
		await app.close();
		assert.equal(store.closes, 1);
	}
});

test('asset upload validation and storage failure never produce ready metadata', async () => {
	const pool = assetMemoryPool();
	const storeOptions = { failPut: true };
	const store = memoryObjectStore(storeOptions);
	const app = createApp({ pool, objectStore: store, sessionKey: SESSION_KEY, logger: false });
	try {
		const cookie = await sessionCookie(app, 'google:user-1');
		const registered = await app.inject({
			method: 'POST',
			url: '/projects/project:test/assets',
			headers: { cookie },
			payload: { name: 'texture.png' }
		});
		const assetId = registered.json().id;
		const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
		const base = {
			method: 'PUT',
			url: `/projects/project:test/assets/${assetId}/content`,
			headers: { cookie, 'content-type': 'application/octet-stream' }
		};
		const missingLength = await app.inject({
			...base,
			headers: { ...base.headers, 'transfer-encoding': 'chunked' },
			payload: Readable.from([bytes])
		});
		const wrongType = await app.inject({ ...base, headers: { cookie, 'content-type': 'text/plain', 'content-length': String(bytes.length) }, payload: bytes });
		const badMagic = await app.inject({ ...base, headers: { ...base.headers, 'content-length': '4' }, payload: Buffer.from('nope') });
		const mismatchedLength = await app.inject({ ...base, headers: { ...base.headers, 'content-length': String(bytes.length + 1) }, payload: bytes });
		const oversized = await app.inject({ ...base, headers: { ...base.headers, 'content-length': String(25 * 1024 * 1024 + 1) }, payload: bytes });
		const failedStore = await app.inject({ ...base, headers: { ...base.headers, 'content-length': String(bytes.length) }, payload: bytes });
		assert.equal(missingLength.statusCode, 411);
		assert.equal(wrongType.statusCode, 415);
		assert.equal(badMagic.statusCode, 415);
		assert.equal(mismatchedLength.statusCode, 400);
		assert.equal(oversized.statusCode, 413);
		assert.equal(failedStore.statusCode, 503);
		assert.equal(pool.assets.get(assetId).importState, 'failed');
		assert.notEqual(pool.assets.get(assetId).importState, 'ready');

		storeOptions.failPut = false;
		const retried = await app.inject({ ...base, headers: { ...base.headers, 'content-length': String(bytes.length) }, payload: bytes });
		assert.equal(retried.statusCode, 200);
		assert.equal(retried.json().id, assetId);
		assert.equal(retried.json().importState, 'ready');
	} finally {
		await app.close();
	}
});

test('finalize failure leaves pending metadata and retains the uploaded object', async () => {
	const poolOptions = { failFinalize: true };
	const pool = assetMemoryPool(poolOptions);
	const store = memoryObjectStore();
	const app = createApp({ pool, objectStore: store, sessionKey: SESSION_KEY, logger: false });
	try {
		const cookie = await sessionCookie(app, 'google:user-1');
		const registered = await app.inject({
			method: 'POST',
			url: '/projects/project:test/assets',
			headers: { cookie },
			payload: { name: 'pending.png' }
		});
		const assetId = registered.json().id;
		const bytes = Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3]);
		const response = await app.inject({
			method: 'PUT',
			url: `/projects/project:test/assets/${assetId}/content`,
			headers: { cookie, 'content-type': 'application/octet-stream', 'content-length': String(bytes.length) },
			payload: bytes
		});
		assert.equal(response.statusCode, 503);
		assert.equal(pool.assets.get(assetId).importState, 'pending');
		assert.equal(store.objects.size, 1);
		assert.equal(store.puts[0].bytes.equals(bytes), true);

		poolOptions.failFinalize = false;
		const retried = await app.inject({
			method: 'PUT',
			url: `/projects/project:test/assets/${assetId}/content`,
			headers: { cookie, 'content-type': 'application/octet-stream', 'content-length': String(bytes.length) },
			payload: bytes
		});
		assert.equal(retried.statusCode, 200);
		assert.equal(retried.json().id, assetId);
		assert.equal(store.objects.size, 2);
	} finally {
		await app.close();
	}
});

test('multi-chunk PNG, WebP, and JPEG uploads record exact metadata and hashes', async () => {
	const pool = assetMemoryPool();
	const store = memoryObjectStore();
	const app = createApp({ pool, objectStore: store, sessionKey: SESSION_KEY, logger: false });
	try {
		const cookie = await sessionCookie(app, 'google:user-1');
		const fixtures = [
			{ name: 'split.png', mime: 'image/png', bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]) },
			{ name: 'split.webp', mime: 'image/webp', bytes: Buffer.from('RIFF1234WEBPpayload') },
			{ name: 'split.jpg', mime: 'image/jpeg', bytes: Buffer.from([0xff, 0xd8, 0xff, 3, 4, 5]) }
		];
		for (const fixture of fixtures) {
			const registered = await app.inject({
				method: 'POST',
				url: '/projects/project:test/assets',
				headers: { cookie },
				payload: { name: fixture.name }
			});
			const assetId = registered.json().id;
			const response = await app.inject({
				method: 'PUT',
				url: `/projects/project:test/assets/${assetId}/content`,
				headers: {
					cookie,
					'content-type': 'application/octet-stream',
					'content-length': String(fixture.bytes.length)
				},
				payload: Readable.from([
					fixture.bytes.subarray(0, 1),
					fixture.bytes.subarray(1, 4),
					fixture.bytes.subarray(4)
				])
			});
			const asset = response.json();
			assert.equal(response.statusCode, 200);
			assert.equal(asset.mime, fixture.mime);
			assert.equal(asset.byteSize, fixture.bytes.length);
			assert.equal(asset.sha256, `sha256-${createHash('sha256').update(fixture.bytes).digest('hex')}`);
		}
	} finally {
		await app.close();
	}
});

test('storage-less asset metadata remains readable without an object key', async () => {
	const pool = assetMemoryPool();
	const store = memoryObjectStore();
	const app = createApp({ pool, objectStore: store, sessionKey: SESSION_KEY, logger: false });
	const assetId = '00000000-0000-4000-8000-000000000010';
	pool.assets.set(assetId, {
		id: assetId,
		projectId: 'project:test',
		name: 'Built-in texture',
		kind: 'texture',
		storageKind: 'none',
		sourceKind: 'builtin',
		sourceRef: 'builtin:texture',
		mime: null,
		byteSize: null,
		sha256: null,
		objectKey: null,
		importState: 'ready',
		createdAt: '2026-09-03T00:00:00.000Z',
		updatedAt: '2026-09-03T00:00:00.000Z'
	});
	try {
		const cookie = await sessionCookie(app, 'google:user-1');
		const metadata = await app.inject({
			method: 'GET',
			url: `/projects/project:test/assets/${assetId}`,
			headers: { cookie }
		});
		const content = await app.inject({
			method: 'GET',
			url: `/projects/project:test/assets/${assetId}/content`,
			headers: { cookie }
		});
		assert.equal(metadata.statusCode, 200);
		assert.equal(metadata.json().storageKind, 'none');
		assert.equal('objectKey' in metadata.json(), false);
		assert.equal(content.statusCode, 409);
		assert.equal(store.gets.length, 0);
	} finally {
		await app.close();
	}
});

test('asset byte reads fail closed for missing, mismatched, and broken objects', async () => {
	const pool = assetMemoryPool();
	const store = memoryObjectStore();
	const app = createApp({ pool, objectStore: store, sessionKey: SESSION_KEY, logger: false });
	try {
		const cookie = await sessionCookie(app, 'google:user-1');
		const registered = await app.inject({
			method: 'POST',
			url: '/projects/project:test/assets',
			headers: { cookie },
			payload: { name: 'read.png' }
		});
		const assetId = registered.json().id;
		const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
		await app.inject({
			method: 'PUT',
			url: `/projects/project:test/assets/${assetId}/content`,
			headers: { cookie, 'content-type': 'application/octet-stream', 'content-length': String(bytes.length) },
			payload: bytes
		});
		const key = pool.assets.get(assetId).objectKey;
		const object = store.objects.get(key);
		store.objects.delete(key);
		const missing = await app.inject({ method: 'GET', url: `/projects/project:test/assets/${assetId}/content`, headers: { cookie } });
		store.objects.set(key, { ...object, bytes: Buffer.concat([object.bytes, Buffer.from([0])]) });
		const mismatched = await app.inject({ method: 'GET', url: `/projects/project:test/assets/${assetId}/content`, headers: { cookie } });
		assert.equal(missing.statusCode, 503);
		assert.equal(mismatched.statusCode, 503);

		store.get = async () => ({
			body: Readable.from((async function* () {
				yield bytes.subarray(0, 4);
				throw new Error('injected read failure');
			})()),
			contentLength: bytes.length
		});
		await assert.rejects(
			app.inject({ method: 'GET', url: `/projects/project:test/assets/${assetId}/content`, headers: { cookie } }),
			/response destroyed before completion/
		);
	} finally {
		await app.close();
	}
});

test('concurrent uploads use distinct claims and only latest claim finalizes', async () => {
	const pool = assetMemoryPool();
	const store = memoryObjectStore();
	const originalPut = store.put.bind(store);
	const releases = [];
	store.put = async (...args) => {
		await new Promise((resolve) => releases.push(resolve));
		return originalPut(...args);
	};
	const app = createApp({ pool, objectStore: store, sessionKey: SESSION_KEY, logger: false });
	try {
		const cookie = await sessionCookie(app, 'google:user-1');
		const registered = await app.inject({
			method: 'POST',
			url: '/projects/project:test/assets',
			headers: { cookie },
			payload: { name: 'race.jpg' }
		});
		const assetId = registered.json().id;
		const bytes = Buffer.from([0xff, 0xd8, 0xff, 1]);
		const request = () => app.inject({
			method: 'PUT',
			url: `/projects/project:test/assets/${assetId}/content`,
			headers: { cookie, 'content-type': 'application/octet-stream', 'content-length': String(bytes.length) },
			payload: bytes
		});
		const first = request();
		while (releases.length < 1) await new Promise((resolve) => setImmediate(resolve));
		const second = request();
		while (releases.length < 2) await new Promise((resolve) => setImmediate(resolve));
		releases[0]();
		const firstResponse = await first;
		releases[1]();
		const secondResponse = await second;
		assert.equal(firstResponse.statusCode, 409);
		assert.equal(secondResponse.statusCode, 200);
		assert.notEqual(store.puts[0].key, store.puts[1].key);
		assert.equal(pool.calls.some(({ text }) => text === 'BEGIN'), false);
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
	const firstAssetSqlCount = transactions.filter(({ text }) => text.includes('CREATE TABLE IF NOT EXISTS assets')).length;
	await runMigrations(pool);
	assert.equal(firstSqlCount, 1);
	assert.equal(firstAssetSqlCount, 1);
	assert.equal(transactions.filter(({ text }) => text.includes('CREATE TABLE IF NOT EXISTS users')).length, 1);
	assert.equal(transactions.filter(({ text }) => text.includes('CREATE TABLE IF NOT EXISTS assets')).length, 1);
});
