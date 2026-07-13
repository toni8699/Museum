import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { museumEditorEntryPlugin } from './vite/museum-editor-entry-plugin';

export default defineConfig({
	plugins: [museumEditorEntryPlugin(), sveltekit()]
});
