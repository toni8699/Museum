import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const VIRTUAL_ID = 'virtual:museum-editor-entry';
const RESOLVED_VIRTUAL_ID = `\0${VIRTUAL_ID}`;

const pluginDir = path.dirname(fileURLToPath(import.meta.url));
const editorRoot = path.resolve(pluginDir, '../src/lib/editor');

export function museumEditorEntryPlugin(): Plugin {
	return {
		name: 'museum-editor-entry',
		resolveId(id) {
			if (id === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID;
		},
		load(id) {
			if (id !== RESOLVED_VIRTUAL_ID) return;
			return `export { default } from ${JSON.stringify(path.join(editorRoot, 'MuseumEditorApp.svelte'))};`;
		}
	};
}
