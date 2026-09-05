import secureSession from '@fastify/secure-session';
import Fastify, {
	type FastifyInstance,
	type FastifyReply,
	type FastifyRequest,
	type FastifyServerOptions
} from 'fastify';
import { Readable } from 'node:stream';

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
	assetMetadata,
	AssetInputError,
	AssetNotFoundError,
	AssetNotReadyError,
	isValidAssetId,
	isValidProjectId,
	listAssets,
	MAX_ASSET_BYTES,
	readAsset,
	readAssetNameBody,
	registerAsset,
	uploadAsset
} from './asset-persistence.js';
import type { ObjectStore } from './object-store.js';
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
	objectStore?: ObjectStore;
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
	objectStore,
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
	app.addContentTypeParser(
		'application/octet-stream',
		async (_request: FastifyRequest, payload: FastifyRequest['raw']) => payload
	);

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
	let objectStoreClose: Promise<void> | undefined;
	app.addHook('onClose', async () => {
		poolClose ??= Promise.resolve().then(() => pool.end());
		if (objectStore?.close) {
			objectStoreClose ??= Promise.resolve().then(() => objectStore.close?.()).then(() => undefined);
		}
		await Promise.all([poolClose, objectStoreClose]);
	});

	if (editorOrigin || apiOrigin) {
		app.addHook('onRequest', async (request, reply) => {
			const origin = request.headers.origin;
			if (origin === expectedBrowserOrigin) {
				reply
					.header('Access-Control-Allow-Origin', origin)
					.header('Access-Control-Allow-Credentials', 'true')
					.header('Vary', 'Origin')
					.header('Access-Control-Allow-Methods', 'GET, PUT, POST, PATCH, DELETE, OPTIONS')
					.header('Access-Control-Allow-Headers', 'Content-Type');
			}
			if (request.method === 'OPTIONS') {
				if (!origin || origin !== expectedBrowserOrigin) {
					return reply.code(403).send(errorBody('forbidden', 'Forbidden'));
				}
				return reply.code(204).send();
			}
			const unsafeBrowserRequest = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method);
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

	app.setErrorHandler((error, request, reply) => {
		const code = (error as { code?: unknown }).code;
		if (code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
			return reply.code(413).send(errorBody('payload_too_large', 'Payload Too Large'));
		}
		if (code === 'FST_ERR_CTP_INVALID_JSON_BODY') {
			return reply.code(400).send(errorBody('invalid_json', 'Malformed JSON body'));
		}
		if (code === 'FST_ERR_CTP_EMPTY_JSON_BODY') {
			const isAssetRegistration = request.url.startsWith('/projects/') && request.url.includes('/assets');
			return reply
				.code(400)
				.send(errorBody(isAssetRegistration ? 'invalid_asset' : 'invalid_json', 'Malformed JSON body'));
		}
		if (code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') {
			return reply.code(415).send(errorBody('unsupported_media_type', 'Unsupported Media Type'));
		}
		if (code === 'FST_ERR_CTP_INVALID_CONTENT_LENGTH') {
			return reply.code(400).send(errorBody('invalid_upload', 'Invalid upload length'));
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
		} catch (error) {
			app.log.warn({ auth: { stage: 'login', error: sanitizeAuthError(error) } }, 'OIDC login failed');
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
			app.log.warn(
				{ auth: { stage: 'callback', reason: 'invalid_state', hasLogin: Boolean(login), hasState: Boolean(state) } },
				'OIDC callback rejected'
			);
			clearOidcLoginState(request);
			return invalidCallback(reply);
		}
		if (callbackError) {
			app.log.warn(
				{ auth: { stage: 'callback', reason: callbackError === 'access_denied' ? 'access_denied' : 'provider_error' } },
				'OIDC callback failed'
			);
			clearOidcLoginState(request);
			return callbackFailure(reply, editorOrigin, login.intent, callbackError === 'access_denied' ? 'cancelled' : 'failed');
		}
		if (!code) {
			app.log.warn({ auth: { stage: 'callback', reason: 'missing_code' } }, 'OIDC callback failed');
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
			app.log.info({ auth: { stage: 'callback', intent: login.intent } }, 'OIDC callback succeeded');
			return reply.redirect(
				boundedRedirect(
					editorOrigin ?? apiOrigin,
					login.intent === 'projects' ? '/projects' : '/?auth=success&intent=save'
				)
			);
		} catch (error) {
			app.log.warn(
				{ auth: { stage: 'callback', reason: 'exchange_failed', error: sanitizeAuthError(error) } },
				'OIDC callback failed'
			);
			clearOidcLoginState(request);
			return callbackFailure(reply, editorOrigin, login.intent, 'failed');
		}
	});

	app.get('/auth/me', async (request) => {
		const userId = sessionUserId(request, sessionsEnabled);
		app.log.info(
			{
				auth: {
					stage: 'session',
					hasCookie: request.headers.cookie?.includes(`${SESSION_COOKIE_NAME}=`) ?? false,
					authenticated: Boolean(userId)
				}
			},
			'Authentication session checked'
		);
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

	const requireAssetSession = async (request: FastifyRequest, reply: FastifyReply) => {
		if (!sessionUserId(request, sessionsEnabled)) return unauthorized(reply);
	};
	const requireAssetUpload = async (request: FastifyRequest, reply: FastifyReply) => {
		if (!sessionUserId(request, sessionsEnabled)) return unauthorized(reply);
		const { projectId, assetId } = request.params as { projectId?: unknown; assetId?: unknown };
		if (!isValidProjectId(projectId) || !isValidAssetId(assetId)) {
			return assetInputFailure(reply, new AssetInputError('invalid_asset', 400, 'Invalid asset identifier'));
		}
		const contentLength = readUploadContentLength(request);
		if (contentLength instanceof AssetInputError) return assetInputFailure(reply, contentLength);
	};

	app.get('/projects/:projectId/assets', { onRequest: requireAssetSession }, async (request, reply) => {
		const userId = sessionUserId(request, sessionsEnabled);
		const projectId = (request.params as { projectId?: unknown }).projectId;
		if (!userId) return unauthorized(reply);
		if (!isValidProjectId(projectId)) return assetInputFailure(reply, new AssetInputError('invalid_asset', 400, 'Invalid project ID'));
		try {
			return { assets: await listAssets(pool, userId, projectId) };
		} catch (error) {
			return assetFailure(app, reply, error, 'Asset list failed');
		}
	});

	app.post('/projects/:projectId/assets', { onRequest: requireAssetSession }, async (request, reply) => {
		const userId = sessionUserId(request, sessionsEnabled);
		const projectId = (request.params as { projectId?: unknown }).projectId;
		if (!userId) return unauthorized(reply);
		if (!isValidProjectId(projectId)) return assetInputFailure(reply, new AssetInputError('invalid_asset', 400, 'Invalid project ID'));
		try {
			if (!isJsonContentType(request.headers['content-type'])) {
				return assetInputFailure(reply, new AssetInputError('unsupported_media_type', 415, 'Unsupported Media Type'));
			}
			const name = readAssetNameBody(request.body);
			const asset = await registerAsset(pool, userId, projectId, name);
			return reply.code(201).send(asset);
		} catch (error) {
			return assetFailure(app, reply, error, 'Asset registration failed');
		}
	});

	app.get('/projects/:projectId/assets/:assetId', { onRequest: requireAssetSession }, async (request, reply) => {
		const userId = sessionUserId(request, sessionsEnabled);
		const { projectId, assetId } = request.params as { projectId?: unknown; assetId?: unknown };
		if (!userId) return unauthorized(reply);
		if (!isValidProjectId(projectId) || !isValidAssetId(assetId)) {
			return assetInputFailure(reply, new AssetInputError('invalid_asset', 400, 'Invalid asset identifier'));
		}
		try {
			return assetMetadata(await readAsset(pool, userId, projectId, assetId));
		} catch (error) {
			return assetFailure(app, reply, error, 'Asset read failed');
		}
	});

	app.put('/projects/:projectId/assets/:assetId/content', { onRequest: requireAssetUpload }, async (request, reply) => {
		const userId = sessionUserId(request, sessionsEnabled);
		const { projectId, assetId } = request.params as { projectId?: unknown; assetId?: unknown };
		if (!userId) return unauthorized(reply);
		if (!isValidProjectId(projectId) || !isValidAssetId(assetId)) {
			return assetInputFailure(reply, new AssetInputError('invalid_asset', 400, 'Invalid asset identifier'));
		}
		const contentLength = readUploadContentLength(request);
		if (contentLength instanceof AssetInputError) return assetInputFailure(reply, contentLength);
		if (!(request.body instanceof Readable)) {
			return assetInputFailure(reply, new AssetInputError('invalid_upload', 400, 'Invalid upload body'));
		}
		try {
			return await uploadAsset(pool, userId, projectId, assetId, contentLength, request.body, objectStore);
		} catch (error) {
			return assetFailure(app, reply, error, 'Asset upload failed');
		}
	});

	app.get('/projects/:projectId/assets/:assetId/content', { onRequest: requireAssetSession }, async (request, reply) => {
		const userId = sessionUserId(request, sessionsEnabled);
		const { projectId, assetId } = request.params as { projectId?: unknown; assetId?: unknown };
		if (!userId) return unauthorized(reply);
		if (!isValidProjectId(projectId) || !isValidAssetId(assetId)) {
			return assetInputFailure(reply, new AssetInputError('invalid_asset', 400, 'Invalid asset identifier'));
		}
		try {
			const asset = await readAsset(pool, userId, projectId, assetId);
			if (asset.importState !== 'ready') throw new AssetNotReadyError();
			if (asset.storageKind !== 'r2' || asset.objectKey === null) throw new AssetNotReadyError();
			if (asset.mime === null || asset.byteSize === null) {
				return databaseFailure(app, reply, new Error('Ready asset metadata is incomplete'), 'Asset bytes failed');
			}
			if (!objectStore) throw new Error('Object storage is unavailable');
			const stored = await objectStore.get(asset.objectKey);
			if (!stored || stored.contentLength !== asset.byteSize) {
				return reply.code(503).send(errorBody('service_unavailable', 'Service Unavailable'));
			}
			reply
				.header('Content-Type', asset.mime)
				.header('Content-Length', String(asset.byteSize))
				.header('Cache-Control', 'private, no-store');
			return reply.send(stored.body);
		} catch (error) {
			return assetFailure(app, reply, error, 'Asset bytes failed');
		}
	});

	return app;
}

function assetInputFailure(reply: FastifyReply, error: AssetInputError) {
	return reply.code(error.statusCode).send(errorBody(error.code, error.message));
}

function assetFailure(app: FastifyInstance, reply: FastifyReply, error: unknown, message: string) {
	if (error instanceof AssetInputError) return assetInputFailure(reply, error);
	if (error instanceof AssetNotFoundError) return notFound(reply);
	if (error instanceof AssetNotReadyError) {
		return reply.code(409).send(errorBody('asset_not_ready', 'Asset Not Ready'));
	}
	return databaseFailure(app, reply, error, message);
}

function isOctetStream(value: string | undefined): boolean {
	return value?.split(';', 1)[0]?.trim().toLowerCase() === 'application/octet-stream';
}

function isJsonContentType(value: string | undefined): boolean {
	return value?.split(';', 1)[0]?.trim().toLowerCase() === 'application/json';
}

function readUploadContentLength(request: FastifyRequest): number | AssetInputError {
	if (!isOctetStream(request.headers['content-type'])) {
		return new AssetInputError('unsupported_media_type', 415, 'Unsupported Media Type');
	}
	const value = request.headers['content-length'];
	if (typeof value !== 'string') {
		return new AssetInputError('length_required', 411, 'Content-Length is required');
	}
	if (!/^\d+$/.test(value)) {
		return new AssetInputError('invalid_upload', 400, 'Invalid Content-Length');
	}
	const declaredLength = BigInt(value);
	if (declaredLength === 0n) {
		return new AssetInputError('invalid_upload', 400, 'Invalid upload length');
	}
	if (declaredLength > BigInt(MAX_ASSET_BYTES)) {
		return new AssetInputError('payload_too_large', 413, 'Payload Too Large');
	}
	return Number(declaredLength);
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
	return publicApiUrl(request, apiOrigin, '/auth/callback');
}

function getRequestUrl(request: FastifyRequest, apiOrigin?: string): URL {
	return publicApiUrl(request, apiOrigin, request.raw.url ?? request.url);
}

function publicApiUrl(request: FastifyRequest, apiOrigin: string | undefined, path: string): URL {
	const base = `${apiOrigin ?? `${request.protocol}://${request.headers.host ?? 'localhost'}`}/`;
	return new URL(path.replace(/^\/+/, ''), base);
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

function sanitizeAuthError(error: unknown): { name: string; code?: string } {
	if (!(error instanceof Error)) return { name: 'Error' };
	const code = (error as { code?: unknown }).code;
	return typeof code === 'string' ? { name: error.name, code } : { name: error.name };
}

function safeRequestLog(request: { method?: string; url?: string }) {
	return { method: request.method, url: request.url?.split('?', 1)[0] };
}
