// Vitest config for @portfolio/museum — Slice 1.E infrastructure.
//
// Goal: let `npm test` exercise the editor test suite so future refactor
// slices can prove correctness the same way the safety net does.
//
// Problem this file fixes:
//   - Vitest does NOT inherit SvelteKit's `$lib` alias from vite.config.ts
//     automatically (the SvelteKit `@sveltejs/kit/vite` `sveltekit()` plugin
//     is wired up for `vite dev`/`vite build` but its alias registration
//     is not picked up by vitest's Vite instance in this SvelteKit 2.x
//     project). Without an explicit resolve.alias, every test importing
//     `from '$lib/...'` errors at module-resolution time with
//     `Cannot find module '$lib/content/scene'`.
//   - `.svelte.ts` files that use Svelte 5 runes (`$state`, `$derived`,
//     `$effect`) need the Svelte Vite plugin's compile step to be active
//     inside vitest's transform. The full `sveltekit()` plugin alone
//     doesn't propagate; the direct `svelte()` plugin from
//     `@sveltejs/vite-plugin-svelte` does.
//
// We import the same `@sveltejs/vite-plugin-svelte` package already pinned
// in `apps/museum/package.json` (^5.1.0) so we don't add a new dependency.
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	plugins: [
		// Hot-reload off during test so EditorSessionState's statusMessage
		// auto-clear setTimeout doesn't fire twice in vitest's tick loop.
		svelte({ hot: false })
	],
	resolve: {
		alias: {
			$lib: path.resolve(here, 'src/lib')
		}
	},
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}'],
		environment: 'node'
	}
});
