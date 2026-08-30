import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { createApp } from '../dist/app.js';
import { ConfigError, readConfig } from '../dist/config.js';
import { sanitizeDatabaseError } from '../dist/database.js';
import { installShutdownHandlers } from '../dist/shutdown.js';
import { startServer } from '../dist/server.js';

function stubPool({ query = async () => undefined, end = async () => undefined } = {}) {
	return { query, end };
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
