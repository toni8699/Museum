import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { museumEditorEntryPlugin } from './vite/museum-editor-entry-plugin';

export default defineConfig({
	plugins: [museumEditorEntryPlugin(), sveltekit()],
	// Keep museum's dep cache out of shared paths so preview/dev restarts
	// don't race on stale hashed chunks under node_modules/.vite/deps.
	cacheDir: 'node_modules/.vite/editor',
	optimizeDeps: {
		// Prebundle Three/Threlte and deep JSM/addons up front. Late discovery
		// of these paths rewrites deps mid-session and leaves browsers holding
		// deleted chunk-* URLs (the "file does not exist … optimize deps" error).
		include: [
			'three',
			'three/addons/lines/Line2.js',
			'three/addons/lines/LineGeometry.js',
			'three/addons/lines/LineMaterial.js',
			'three/examples/jsm/controls/TransformControls.js',
			'three/examples/jsm/utils/SkeletonUtils.js',
			'@threlte/core',
			'@threlte/extras'
		]
	}
});
