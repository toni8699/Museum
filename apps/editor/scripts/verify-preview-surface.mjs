import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const editorRoot = resolve(scriptDir, '..');
const visitorDir = join(editorRoot, 'src', 'lib', 'visitor');
const rootFile = join(visitorDir, 'VisitorPreviewSurface.svelte');
const viteConfig = join(editorRoot, 'vite.config.ts');

function listFiles(dir) {
	const entries = readdirSync(dir);
	const files = [];
	for (const entry of entries) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) files.push(...listFiles(full));
		else files.push(full);
	}
	return files;
}

// Static pre-build guard (fast grep). The authoritative gate is the Vite
// `preview-surface-boundary` plugin, which walks the resolved module graph
// (no regex) during `vite build`. This script fails fast on obvious leaks
// and verifies the root + plugin wiring.
const FORBIDDEN = [
	'$lib/editor/',
	'MuseumScene.svelte',
	'MuseumHUD.svelte',
	'MuseumCanvas.svelte',
	'Workspace3DView',
	'EditorSceneEntities',
	'chopin-project',
	'chopin-room-presentation',
	'content/rooms',
	'chopin-layout',
	'state/runtime-state',
	'museum/navigation/CameraDirector',
	'museum/MuseumEntities',
	'paris-activation',
	'museum/rooms/',
	'museum/layout/LayoutMuseumShell',
	'project/project-codec',
	'project-export-store',
	'binary-texture-store'
];

try {
	readFileSync(rootFile, 'utf8');
} catch {
	console.error(`preview surface gate: missing root ${rootFile}`);
	process.exit(1);
}

const configSource = readFileSync(viteConfig, 'utf8');
if (!configSource.includes('preview-surface-boundary')) {
	console.error('preview surface gate: preview-surface-boundary plugin not registered in vite.config.ts');
	process.exit(1);
}

const files = listFiles(visitorDir);
const violations = [];
for (const file of files) {
	// The boundary validator itself names forbidden modules in its patterns;
	// that is the gate definition, not a leak.
	if (file.endsWith('preview-surface-boundary.ts')) continue;
	const source = readFileSync(file, 'utf8');
	for (const token of FORBIDDEN) {
		if (source.includes(token)) violations.push(`${file}: contains forbidden '${token}'`);
	}
}

if (violations.length > 0) {
	console.error(`preview surface gate: visitor closure reaches forbidden modules:\n${violations.join('\n')}`);
	process.exit(1);
}

console.log(`preview surface ok: ${files.length} visitor files, root + plugin wired, no static leaks`);
