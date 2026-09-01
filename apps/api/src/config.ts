export type ApiConfig = {
	databaseUrl: string;
	port: number;
	editorOrigin?: string;
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

function readEditorOrigin(value: string | undefined): string | undefined {
	const origin = value?.trim();
	if (!origin) return undefined;
	try {
		const url = new URL(origin);
		if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== '/' || url.search || url.hash) {
			throw new Error();
		}
		return url.origin;
	} catch {
		throw new ConfigError('EDITOR_ORIGIN must be an HTTP(S) origin');
	}
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
	const databaseUrl = readDatabaseUrl(env.DATABASE_URL);
	const port = readPort(env.PORT);
	const editorOrigin = readEditorOrigin(env.EDITOR_ORIGIN);
	return editorOrigin ? { databaseUrl, port, editorOrigin } : { databaseUrl, port };
}
