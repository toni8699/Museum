import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROUTES_DIR = fileURLToPath(new URL('../../../../src/routes', import.meta.url));
const LIB_DIR = fileURLToPath(new URL('../../../../src/lib', import.meta.url));

function libSource(relative: string): string {
	return fs.readFileSync(path.join(LIB_DIR, relative), 'utf8');
}
function routeSource(relative: string): string {
	return fs.readFileSync(path.join(ROUTES_DIR, relative), 'utf8');
}

describe('P21.4 project flows', () => {
	it('keeps the strict Hub: sorted owned table, guest callout, one-click New', () => {
		const hub = routeSource('projects/+page.svelte');
		// No Recent shelf, covers, or fake drafts.
		expect(hub).not.toContain('Recent');
		expect(hub.toLowerCase()).not.toContain('cover shelf');
		expect(hub).not.toContain('resume promise');
		// Sorted owned table with name/version/modification/location/Open.
		expect(hub).toContain('updatedAt');
		expect(hub).toContain('v{project.version}');
		expect(hub).toContain('Cloud');
		expect(hub).toContain('Open');
		expect(hub).toContain('?load=1');
		// Guest temporary-session copy + Google sign-in + New.
		expect(hub).toContain('temporary session');
		expect(hub).toContain('Continue with Google');
		expect(hub).toContain('New Project');
		expect(hub).toContain('createProjectId()');
		// Loading, empty and failure states.
		expect(hub).toContain('Checking sign-in');
		expect(hub).toContain('No saved projects');
		expect(hub).toContain("sessionStatus === 'error'");
	});

	it('preserves entry handoffs: guest/auth trampoline, OAuth intents, load + resume-save', () => {
		const entry = routeSource('+page.svelte');
		expect(entry).toContain('intent');
		expect(entry).toContain("'projects'");
		expect(entry).toContain('resume-save=1');
		expect(entry).toContain('readPendingCloudSave');
		const editorRedirect = routeSource('editor/+page.svelte');
		expect(editorRedirect).toContain('/spatial');
		expect(editorRedirect).toContain('createProjectId');
		const host = libSource('editor/app/ProjectShellHost.svelte');
		expect(host).toContain("get('load') === '1'");
		expect(host).toContain("get('resume-save') === '1'");
	});

	it('owns preview as a layout-level takeover (no sibling session)', () => {
		const host = libSource('editor/app/ProjectShellHost.svelte');
		expect(host).toContain("endsWith('/preview')");
		expect(host).toContain('{surface}');
		const app = libSource('editor/app/EditorApp.svelte');
		expect(app).toContain('VisitorPreviewSurface');
		expect(app).toContain('enterPreviewFromSpatial');
		expect(app).toContain('computeVisitorPreviewBlocker');
		expect(app).toContain('composeDetachedPreviewBundle');
		expect(app).toContain('isRetainedSessionNavigation');
		expect(app).toContain('isSuppressed');
		expect(app).toContain('previewEntryNotice');
		expect(app).toContain('Preview needs an open draft');
		expect(app).toContain('captureTakeoverOrbit');
		expect(app).toContain('captureTakeoverObserver');
		expect(app).toContain('takeoverPose');
		expect(app).toContain('takeoverObserver');
		expect(app).toContain('TakeoverObserverState');
		expect(app).toContain('onTakeoverPoseRestored');
		expect(app).toContain('returnFocusKey');
		expect(app).toContain('previewRestoring');
		expect(app).toContain('setDefaultTextureSourceLoader');
		expect(app).toContain('await tick()');
		const shortcuts = libSource('editor/hooks/shortcuts.svelte.ts');
		expect(shortcuts).toContain('isSuppressed');
		const boot = libSource('editor/hooks/editor-shell-boot.svelte.ts');
		expect(boot).toContain('isRetainedSessionNavigation');
		const rig = libSource('editor/camera/EditorCameraRig.svelte');
		expect(rig).toContain('setTakeoverOrbitCapturer');
		expect(rig).toContain('setTakeoverObserverCapturer');
		expect(rig).toContain('takeoverPose');
		expect(rig).toContain('takeoverObserver');
		// Entry-button/reconciler own the transitioning guard; the entry body
		// must only bail on an existing bundle (regression: setting the flag
		// before calling entry stalled the button with no navigation).
		const entryBody = app.slice(
			app.indexOf('function enterPreviewFromSpatial'),
			app.indexOf('function disposePreviewBundle')
		);
		expect(entryBody).toContain('if (previewBundle) return previewBundle;');
		expect(entryBody).not.toContain('previewTransitioning || previewBundle');
		// Direct preview route is intent-only.
		const previewPage = routeSource('project/[projectId]/preview/+page.svelte');
		expect(previewPage).not.toContain('<EditorApp');
		expect(previewPage).not.toContain('VisitorPreviewSurface');
	});
});
