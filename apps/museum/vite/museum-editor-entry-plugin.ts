import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const VIRTUAL_ID = 'virtual:museum-editor-entry';
const RESOLVED_VIRTUAL_ID = `\0${VIRTUAL_ID}`;

const pluginDir = path.dirname(fileURLToPath(import.meta.url));
const editorRoot = path.resolve(pluginDir, '../src/lib/editor');

export function museumEditorEntryPlugin(): Plugin {
	let command: 'build' | 'serve' = 'build';

	return {
		name: 'museum-editor-entry',
		configResolved(config) {
			command = config.command;
		},
		resolveId(id) {
			if (id === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID;
		},
		load(id) {
			if (id !== RESOLVED_VIRTUAL_ID) return;

			// Ship the real editor in production builds only when explicitly
			// requested (VITE_MUSEUM_EDITOR=1) — e.g. a demo deploy. The default
			// production build keeps the editor out of the bundle entirely.
			const includeEditor =
				command === 'serve' || process.env.VITE_MUSEUM_EDITOR === '1';

			const entry = includeEditor
				? path.join(editorRoot, 'MuseumEditorApp.svelte')
				: path.join(editorRoot, 'MuseumEditorStub.svelte');

			return `export { default } from ${JSON.stringify(entry)};`;
		}
	};
}
