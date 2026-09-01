import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';

import { verifyBearer, type TokenVerifier } from './auth.js';
import { sanitizeDatabaseError, type DatabasePool } from './database.js';
import {
	listProjects,
	loadProject,
	ProjectNotFoundError,
	projectValidationError,
	saveProject
} from './project-persistence.js';
import { validateProject } from '@portfolio/project-model';

export type ApiAppOptions = {
	pool: DatabasePool;
	authVerifier?: TokenVerifier;
	editorOrigin?: string;
	logger?: FastifyServerOptions['logger'];
};

const BODY_LIMIT_BYTES = 2 * 1024 * 1024;

export function createApp({ pool, authVerifier, editorOrigin, logger = true }: ApiAppOptions): FastifyInstance {
	const app = Fastify({ logger, bodyLimit: BODY_LIMIT_BYTES });

	pool.on?.('error', (error) => {
		app.log.error({ database: sanitizeDatabaseError(error) }, 'Database pool error');
	});

	let poolClose: Promise<void> | undefined;
	app.addHook('onClose', async () => {
		poolClose ??= Promise.resolve().then(() => pool.end());
		await poolClose;
	});

	if (editorOrigin) {
		app.addHook('onRequest', async (request, reply) => {
			const origin = request.headers.origin;
			if (origin === editorOrigin) {
				reply
					.header('Access-Control-Allow-Origin', editorOrigin)
					.header('Vary', 'Origin')
					.header('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS')
					.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
			}
			if (request.method === 'OPTIONS') {
				if (origin !== editorOrigin) return reply.code(403).send(errorBody('forbidden', 'Forbidden'));
				return reply.code(204).send();
			}
		});
	}

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

	app.setErrorHandler((error, _request, reply) => {
		const code = (error as { code?: unknown }).code;
		if (code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
			return reply.code(413).send(errorBody('payload_too_large', 'Payload Too Large'));
		}
		if (code === 'FST_ERR_CTP_INVALID_JSON_BODY') {
			return reply.code(400).send(errorBody('invalid_json', 'Malformed JSON body'));
		}
		return reply.code(500).send(errorBody('internal_error', 'Internal Server Error'));
	});

	app.get('/projects', async (request, reply) => {
		const identity = await authenticate(request.headers.authorization, authVerifier);
		if (!identity) return unauthorized(reply);
		try {
			return { projects: await listProjects(pool, identity.subject) };
		} catch (error) {
			return databaseFailure(app, reply, error, 'Project list failed');
		}
	});

	app.put('/projects/:projectId', async (request, reply) => {
		const identity = await authenticate(request.headers.authorization, authVerifier);
		if (!identity) return unauthorized(reply);
		const projectId = (request.params as { projectId?: unknown }).projectId;
		const body = request.body;
		if (typeof projectId !== 'string' || !projectId) {
			return reply.code(400).send(errorBody('invalid_project_id', 'Invalid project ID'));
		}
		if (!isDocumentBody(body)) {
			return reply.code(400).send(errorBody('invalid_body', 'Expected a document body'));
		}
		const validation = validateProject(body.document);
		if (!validation.success) {
			return reply.code(400).send(errorBody('invalid_project', projectValidationError(validation)));
		}
		if (validation.project.id !== projectId) {
			return reply.code(400).send(errorBody('project_id_mismatch', 'Project ID does not match document ID'));
		}
		try {
			return await saveProject(pool, identity.subject, validation.project);
		} catch (error) {
			if (error instanceof ProjectNotFoundError) return notFound(reply);
			return databaseFailure(app, reply, error, 'Project save failed');
		}
	});

	app.get('/projects/:projectId', async (request, reply) => {
		const identity = await authenticate(request.headers.authorization, authVerifier);
		if (!identity) return unauthorized(reply);
		const projectId = (request.params as { projectId?: unknown }).projectId;
		if (typeof projectId !== 'string' || !projectId) {
			return reply.code(400).send(errorBody('invalid_project_id', 'Invalid project ID'));
		}
		try {
			const loaded = await loadProject(pool, identity.subject, projectId);
			const validation = validateProject(loaded.document);
			if (!validation.success || validation.project.id !== projectId) {
				return databaseFailure(app, reply, new Error('Stored project failed validation'), 'Stored project failed validation');
			}
			return { ...loaded, document: validation.project };
		} catch (error) {
			if (error instanceof ProjectNotFoundError) return notFound(reply);
			return databaseFailure(app, reply, error, 'Project load failed');
		}
	});

	return app;
}

async function authenticate(authorization: unknown, verifier: TokenVerifier | undefined) {
	return verifyBearer(authorization, verifier);
}

function isDocumentBody(value: unknown): value is { document: unknown } {
	return (
		typeof value === 'object' &&
		value !== null &&
		!Array.isArray(value) &&
		Object.keys(value).length === 1 &&
		Object.prototype.hasOwnProperty.call(value, 'document')
	);
}

function errorBody(code: string, message: string) {
	return { error: { code, message } };
}

function unauthorized(reply: { code(statusCode: number): { header(name: string, value: string): { send(body: unknown): unknown } } }) {
	return reply.code(401).header('WWW-Authenticate', 'Bearer').send(errorBody('unauthorized', 'Unauthorized'));
}

function notFound(reply: { code(statusCode: number): { send(body: unknown): unknown } }) {
	return reply.code(404).send(errorBody('not_found', 'Not Found'));
}

function databaseFailure(
	app: FastifyInstance,
	reply: { code(statusCode: number): { send(body: unknown): unknown } },
	error: unknown,
	message: string
) {
	app.log.warn({ database: sanitizeDatabaseError(error) }, message);
	return reply.code(503).send(errorBody('service_unavailable', 'Service Unavailable'));
}
