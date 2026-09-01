import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { main } from './server.js';

export * from './app.js';
export * from './auth.js';
export * from './config.js';
export * from './database.js';
export * from './document-boundary.js';
export * from './project-persistence.js';
export { runMigrations } from './migrate.js';
export * from './server.js';
export * from './shutdown.js';

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
	void main();
}
