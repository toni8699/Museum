import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	createEmptyProject,
	derivePackageId,
	sha256Bytes,
	validateProject
} from '@portfolio/project-model';

const testDir = dirname(fileURLToPath(import.meta.url));
const packageSrc = resolve(testDir, '../../../../packages/project-model/src');

function sourceFiles(root: string): string[] {
	const files: string[] = [];
	const pending = [root];
	while (pending.length > 0) {
		const entry = pending.pop()!;
		const stat = statSync(entry);
		if (stat.isDirectory()) {
			for (const child of readdirSync(entry)) pending.push(resolve(entry, child));
		} else if (entry.endsWith('.ts')) {
			files.push(entry);
		}
	}
	return files;
}

describe('project-model package boundary', () => {
	it('exposes the portable package primitives directly', async () => {
		expect(await sha256Bytes(new Uint8Array())).toMatch(/^sha256-[0-9a-f]{64}$/);
		expect(await derivePackageId([])).toMatch(/^package-[0-9a-f]{12}$/);
		const project = createEmptyProject({ id: 'project', name: 'Project' });
		expect(validateProject(project).success).toBe(true);
	});

	it('keeps the extracted leaf independent from app/editor/rendering code', () => {
		for (const path of sourceFiles(packageSrc)) {
			const source = readFileSync(path, 'utf8');
			expect(source, path).not.toMatch(
			/from\s*['"][^'"]*(\$lib|\/editor\/|svelte|@threlte|three)/
		);
		}
	});

	it('leaves the old app paths as re-export-only compatibility facades', () => {
		const packageFacade = readFileSync(
			resolve(testDir, '../../src/lib/content/package-format.ts'),
			'utf8'
		);
		const shaFacade = readFileSync(
			resolve(testDir, '../../src/lib/editor/helpers/package-sha.ts'),
			'utf8'
		);
		expect(packageFacade).toMatch(/export \* from '@portfolio\/project-model'/);
		expect(shaFacade).toMatch(/export \{ sha256Bytes \} from '@portfolio\/project-model'/);
		expect(packageFacade).not.toContain('$lib/editor');
		expect(shaFacade).not.toContain('globalThis.crypto');
	});
});
