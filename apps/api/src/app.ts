import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';

import { sanitizeDatabaseError, type DatabasePool } from './database.js';

export type ApiAppOptions = {
	pool: DatabasePool;
	logger?: FastifyServerOptions['logger'];
};

export function createApp({ pool, logger = true }: ApiAppOptions): FastifyInstance {
	const app = Fastify({ logger });

	pool.on?.('error', (error) => {
		app.log.error({ database: sanitizeDatabaseError(error) }, 'Database pool error');
	});

	let poolClose: Promise<void> | undefined;
	app.addHook('onClose', async () => {
		poolClose ??= Promise.resolve().then(() => pool.end());
		await poolClose;
	});

	app.get('/health/live', async () => ({ status: 'ok' }));
	app.get('/health/ready', async (_request, reply) => {
		try {
			await pool.query('SELECT 1');
			return { status: 'ok' };
		} catch (error) {
			app.log.warn(
				{ database: sanitizeDatabaseError(error) },
				'Database readiness check failed'
			);
			return reply.code(503).send({ status: 'unavailable' });
		}
	});

	return app;
}
