import { readFileSync, writeFileSync } from 'node:fs';

const path = new URL('../.vercel/output/config.json', import.meta.url);
const config = JSON.parse(readFileSync(path, 'utf8'));

config.routes.unshift({
	src: '^/api/(.*)$',
	dest: 'https://biskiq-api.onrender.com/$1'
});

writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
