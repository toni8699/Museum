import type { FastifyInstance } from 'fastify';

import { createApp } from './app.js';
import { createGoogleOidc, type OidcClient } from './auth.js';
import { ConfigError, readConfig, type ApiConfig } from './config.js';
import { createPool, type DatabasePool } from './database.js';
import { installShutdownHandlers, type ShutdownProcess } from './shutdown.js';

export type StartServerOptions = {
	config?: ApiConfig;
	env?: NodeJS.ProcessEnv;
	pool?: DatabasePool;
	oidc?: OidcClient;
	processLike?: ShutdownProcess;
};

export async function startServer(options: StartServerOptions = {}): Promise<FastifyInstance> {
	const config = options.config ?? readConfig(options.env);
	const oidc =
		options.oidc ??
		(config.googleClientId && config.googleClientSecret
			? createGoogleOidc({ clientId: config.googleClientId, clientSecret: config.googleClientSecret })
			: undefined);
	const app = createApp({
		pool: options.pool ?? createPool(config),
		apiOrigin: config.apiOrigin,
		editorOrigin: config.editorOrigin,
		oidc,
		sessionKey: config.sessionKey
	});
	const closeOnce = installShutdownHandlers(app, options.processLike);

	try {
		await app.listen({ host: '0.0.0.0', port: config.port });
	} catch (error) {
		await closeOnce();
		throw error;
	}

	return app;
}

export async function main(): Promise<void> {
	try {
		await startServer();
	} catch (error) {
		console.error(error instanceof ConfigError ? `[api] ${error.message}` : '[api] failed to start');
		process.exitCode = 1;
	}
}
