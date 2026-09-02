export type ApiConfig = {
	databaseUrl: string;
	port: number;
	editorOrigin?: string;
	apiOrigin?: string;
	googleClientId?: string;
	googleClientSecret?: string;
	sessionKey?: Buffer;
};

export class ConfigError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ConfigError';
	}
}

function readDatabaseUrl(value: string | undefined): string {
	const databaseUrl = value?.trim();
	if (!databaseUrl) throw new ConfigError('DATABASE_URL is required');

	try {
		const url = new URL(databaseUrl);
		if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) {
			throw new Error();
		}
	} catch {
		throw new ConfigError('DATABASE_URL must be a PostgreSQL connection URL');
	}

	return databaseUrl;
}

function readPort(value: string | undefined): number {
	const portText = value?.trim();
	if (!portText) throw new ConfigError('PORT is required');

	if (!/^\d+$/.test(portText)) {
		throw new ConfigError('PORT must be an integer between 1 and 65535');
	}

	const port = Number(portText);
	if (!Number.isInteger(port) || port < 1 || port > 65_535) {
		throw new ConfigError('PORT must be an integer between 1 and 65535');
	}

	return port;
}

function readOrigin(value: string | undefined, name: string, required = false): string | undefined {
	const origin = value?.trim();
	if (!origin) {
		if (required) throw new ConfigError(`${name} is required`);
		return undefined;
	}
	try {
		const url = new URL(origin);
		if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== '/' || url.search || url.hash) {
			throw new Error();
		}
		return url.origin;
	} catch {
		throw new ConfigError(`${name} must be an HTTP(S) origin`);
	}
}

function readRequired(value: string | undefined, name: string): string {
	const result = value?.trim();
	if (!result) throw new ConfigError(`${name} is required`);
	return result;
}

function readSessionKey(value: string | undefined): Buffer {
	const encoded = readRequired(value, 'SESSION_KEY');
	const key = /^[0-9a-f]{64}$/i.test(encoded)
		? Buffer.from(encoded, 'hex')
		: Buffer.from(encoded, 'base64');
	if (key.length !== 32) {
		throw new ConfigError('SESSION_KEY must be a 32-byte base64 or hex key');
	}
	return key;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
	const databaseUrl = readDatabaseUrl(env.DATABASE_URL);
	const port = readPort(env.PORT);
	const editorOrigin = readOrigin(env.EDITOR_ORIGIN, 'EDITOR_ORIGIN', true)!;
	const apiOrigin = readOrigin(env.API_ORIGIN ?? env.RENDER_EXTERNAL_URL, 'API_ORIGIN');
	return {
		databaseUrl,
		port,
		editorOrigin,
		...(apiOrigin ? { apiOrigin } : {}),
		googleClientId: readRequired(env.GOOGLE_CLIENT_ID, 'GOOGLE_CLIENT_ID'),
		googleClientSecret: readRequired(env.GOOGLE_CLIENT_SECRET, 'GOOGLE_CLIENT_SECRET'),
		sessionKey: readSessionKey(env.SESSION_KEY)
	};
}
