export type ApiConfig = {
	databaseUrl: string;
	port: number;
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

export function readConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
	return {
		databaseUrl: readDatabaseUrl(env.DATABASE_URL),
		port: readPort(env.PORT)
	};
}
