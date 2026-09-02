import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';	export default defineConfig({
		plugins: [sveltekit()],
		server: {
			fs: {
				// SvelteKit replaces Vite's default fs.allow with its own fixed set
				// (src, .svelte-kit, node_modules), which blocks workspace packages
				// resolved to ../packages/* sources in dev. strict:false is the only
				// key that survives that merge; the repo is a trusted local tree.
				strict: false
			}
		},
		cacheDir: 'node_modules/.vite/museum'
	});
