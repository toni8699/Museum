import secureSession from '@fastify/secure-session';
import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyServerOptions } from 'fastify';

import {
	createOidcLoginState,
	googleUserId,
	isGoogleUserId,
	type OidcClient,
	type OidcLoginIntent,
	type OidcLoginState
} from './auth.js';
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
	apiOrigin?: string;
	editorOrigin?: string;
	oidc?: OidcClient;
	sessionKey?: Buffer;
	logger?: FastifyServerOptions['logger'];
};

const BODY_LIMIT_BYTES = 2 * 1024 * 1024;
const SESSION_EXPIRY_SECONDS = 7 * 24 * 60 * 60;
const SESSION_NAME = 'session';
const SESSION_COOKIE_NAME = 'museum-editor-session';

export function createApp({
	pool,
	apiOrigin,
	editorOrigin,
	oidc,
	sessionKey,
	logger = true
}: ApiAppOptions): FastifyInstance {
	const safeLogger =
		logger === true
			? { serializers: { req: safeRequestLog } }
			: logger && typeof logger === 'object'
				? { ...logger, serializers: { ...logger.serializers, req: safeRequestLog } }
				: logger;
	const app = Fastify({ logger: safeLogger, bodyLimit: BODY_LIMIT_BYTES });
	const sessionsEnabled = sessionKey !== undefined;
	const expectedBrowserOrigin = editorOrigin ?? apiOrigin;

	if (sessionKey !== undefined) {
		app.register(secureSession, {
			sessionName: SESSION_NAME,
			cookieName: SESSION_COOKIE_NAME,
			key: sessionKey,
			expiry: SESSION_EXPIRY_SECONDS,
			cookie: {
				path: '/',
				httpOnly: true,
				secure: true,
				sameSite: 'lax',
				maxAge: SESSION_EXPIRY_SECONDS
			}
		});
	}

	pool.on?.('error', (error) => {
		app.log.error({ database: sanitizeDatabaseError(error) }, 'Database pool error');
	});

	let poolClose: Promise<void> | undefined;
	app.addHook('onClose', async () => {
		poolClose ??= Promise.resolve().then(() => pool.end());
		await poolClose;
	});

	if (editorOrigin || apiOrigin) {
		app.addHook('onRequest', async (request, reply) => {
			const origin = request.headers.origin;
			if (origin === expectedBrowserOrigin) {
				reply
					.header('Access-Control-Allow-Origin', origin)
					.header('Access-Control-Allow-Credentials', 'true')
					.header('Vary', 'Origin')
					.header('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS')
					.header('Access-Control-Allow-Headers', 'Content-Type');
			}
			if (request.method === 'OPTIONS') {
				if (!origin || origin !== expectedBrowserOrigin) {
					return reply.code(403).send(errorBody('forbidden', 'Forbidden'));
				}
				return reply.code(204).send();
			}
			const unsafeBrowserRequest =
				request.method === 'PUT' ||
				(request.method === 'POST' && request.url.startsWith('/auth/logout'));
			if (unsafeBrowserRequest && expectedBrowserOrigin && origin !== expectedBrowserOrigin) {
				return reply.code(403).send(errorBody('forbidden', 'Forbidden'));
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

	app.get('/auth/login', async (request, reply) => {
		if (!sessionsEnabled || !oidc) return authUnavailable(reply);
		const intent = readLoginIntent(request, apiOrigin);
		if (!intent) return invalidLoginIntent(reply);
		try {
			const login = await createOidcLoginState(intent);
			const redirectUri = getCallbackUrl(request, apiOrigin).toString();
			const authorizationUrl = await oidc.createAuthorizationUrl({
				redirectUri,
				state: login.state,
				codeChallenge: login.codeChallenge,
				nonce: login.nonce
			});
			appSession(request).set('oidcLogin', {
				state: login.state,
				codeVerifier: login.codeVerifier,
				nonce: login.nonce,
				intent: login.intent
			} satisfies OidcLoginState);
			return reply.redirect(String(authorizationUrl));
		} catch {
			return authUnavailable(reply);
		}
	});

	app.get('/auth/callback', async (request, reply) => {
		if (!sessionsEnabled || !oidc) return authUnavailable(reply);
		const login = readOidcLoginState(appSession(request).get('oidcLogin'));
		let callbackUrl: URL;
		try {
			callbackUrl = getRequestUrl(request, apiOrigin);
		} catch {
			clearOidcLoginState(request);
			return invalidCallback(reply);
		}
		const state = singleQueryParam(callbackUrl, 'state');
		const code = singleQueryParam(callbackUrl, 'code');
		const callbackError = singleQueryParam(callbackUrl, 'error');
		if (!login || !state || state !== login.state) {
			clearOidcLoginState(request);
			return invalidCallback(reply);
		}
		if (callbackError) {
			clearOidcLoginState(request);
			return callbackFailure(reply, editorOrigin, login.intent, callbackError === 'access_denied' ? 'cancelled' : 'failed');
		}
		if (!code) {
			clearOidcLoginState(request);
			return callbackFailure(reply, editorOrigin, login.intent, 'failed');
		}

		try {
			const result = await oidc.exchangeAuthorizationCode({
				callbackUrl,
				codeVerifier: login.codeVerifier,
				expectedState: login.state,
				expectedNonce: login.nonce
			});
			const userId = googleUserId(result.subject);
			if (!userId) throw new Error('Invalid OIDC subject');
			clearOidcLoginState(request);
			appSession(request).regenerate();
			appSession(request).set('userId', userId);
			return reply.redirect(
				boundedRedirect(
					editorOrigin ?? apiOrigin,
					login.intent === 'projects' ? '/projects' : '/?auth=success&intent=save'
				)
			);
		} catch {
			clearOidcLoginState(request);
			return callbackFailure(reply, editorOrigin, login.intent, 'failed');
		}
	});

	app.get('/auth/me', async (request) => {
		const userId = sessionUserId(request, sessionsEnabled);
		return userId
			? { authenticated: true, user: { id: userId } }
			: { authenticated: false };
	});

	app.post('/auth/logout', async (request, reply) => {
		if (sessionsEnabled) appSession(request).delete();
		return reply.code(204).send();
	});

	app.get('/projects', async (request, reply) => {
		const userId = sessionUserId(request, sessionsEnabled);
		if (!userId) return unauthorized(reply);
		try {
			return { projects: await listProjects(pool, userId) };
		} catch (error) {
			return databaseFailure(app, reply, error, 'Project list failed');
		}
	});

	app.put('/projects/:projectId', async (request, reply) => {
		const userId = sessionUserId(request, sessionsEnabled);
		if (!userId) return unauthorized(reply);
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
			return await saveProject(pool, userId, validation.project);
		} catch (error) {
			if (error instanceof ProjectNotFoundError) return notFound(reply);
			return databaseFailure(app, reply, error, 'Project save failed');
		}
	});

	app.get('/projects/:projectId', async (request, reply) => {
		const userId = sessionUserId(request, sessionsEnabled);
		if (!userId) return unauthorized(reply);
		const projectId = (request.params as { projectId?: unknown }).projectId;
		if (typeof projectId !== 'string' || !projectId) {
			return reply.code(400).send(errorBody('invalid_project_id', 'Invalid project ID'));
		}
		try {
			const loaded = await loadProject(pool, userId, projectId);
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

function sessionUserId(request: FastifyRequest, sessionsEnabled: boolean): string | null {
	if (!sessionsEnabled) return null;
	const userId = appSession(request).get('userId');
	return isGoogleUserId(userId) ? userId : null;
}

function readOidcLoginState(value: unknown): OidcLoginState | null {
	if (!isRecord(value)) return null;
	if (
		typeof value.state !== 'string' ||
		typeof value.codeVerifier !== 'string' ||
		typeof value.nonce !== 'string' ||
		!isLoginIntent(value.intent) ||
		!value.state ||
		!value.codeVerifier ||
		!value.nonce
	) {
		return null;
	}
	return {
		state: value.state,
		codeVerifier: value.codeVerifier,
		nonce: value.nonce,
		intent: value.intent
	};
}

function clearOidcLoginState(request: FastifyRequest): void {
	appSession(request).set('oidcLogin', undefined);
}

type AppSession = {
	get(key: string): unknown;
	set(key: string, value: unknown): void;
	regenerate(): void;
	delete(): void;
};

function appSession(request: FastifyRequest): AppSession {
	return request.session as unknown as AppSession;
}

function singleQueryParam(url: URL, name: string): string | null {
	const values = url.searchParams.getAll(name);
	return values.length === 1 && values[0] ? values[0] : null;
}

function readLoginIntent(request: FastifyRequest, apiOrigin?: string): OidcLoginIntent | null {
	let url: URL;
	try {
		url = getRequestUrl(request, apiOrigin);
	} catch {
		return null;
	}
	const values = url.searchParams.getAll('intent');
	if (values.length === 0) return 'projects';
	return values.length === 1 && isLoginIntent(values[0]) ? values[0] : null;
}

function isLoginIntent(value: unknown): value is OidcLoginIntent {
	return value === 'projects' || value === 'save';
}

function getCallbackUrl(request: FastifyRequest, apiOrigin?: string): URL {
	const base = apiOrigin ?? `${request.protocol}://${request.headers.host ?? 'localhost'}`;
	return new URL('/auth/callback', base);
}

function getRequestUrl(request: FastifyRequest, apiOrigin?: string): URL {
	const base = apiOrigin ?? `${request.protocol}://${request.headers.host ?? 'localhost'}`;
	return new URL(request.raw.url ?? request.url, base);
}

function authUnavailable(reply: { code(statusCode: number): { send(body: unknown): unknown } }) {
	return reply.code(503).send(errorBody('auth_unavailable', 'Authentication is unavailable'));
}

function invalidCallback(reply: { code(statusCode: number): { send(body: unknown): unknown } }) {
	return reply.code(400).send(errorBody('invalid_callback', 'Authentication callback was rejected'));
}

function invalidLoginIntent(reply: { code(statusCode: number): { send(body: unknown): unknown } }) {
	return reply.code(400).send(errorBody('invalid_intent', 'Authentication intent was rejected'));
}

function callbackFailure(
	reply: { redirect(url: string): unknown; code(statusCode: number): { send(body: unknown): unknown } },
	editorOrigin: string | undefined,
	intent: OidcLoginIntent,
	status: 'cancelled' | 'failed'
) {
	if (!editorOrigin) return invalidCallback(reply);
	return reply.redirect(boundedRedirect(editorOrigin, `/?auth=${status}&intent=${intent}`));
}

function boundedRedirect(origin: string | undefined, path: string): string {
	return origin ? new URL(path, origin).toString() : path;
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

function unauthorized(reply: { code(statusCode: number): { send(body: unknown): unknown } }) {
	return reply.code(401).send(errorBody('unauthorized', 'Unauthorized'));
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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeRequestLog(request: { method?: string; url?: string }) {
	return { method: request.method, url: request.url?.split('?', 1)[0] };
}
