/**
 * Slice 5 bind-migration contract smoke (plan §5.4 / §5.5 unit stand-in).
 *
 * Full Vitest-browser + Playwright against `/dev/museum-editor` is not wired
 * in this package yet (`@vitest/browser` absent). This file proves the Phase B
 * write paths the migrated components call, and that session is the owner.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { createMuseumEditorStore } from './museum-editor.svelte';

const editorDir = path.dirname(fileURLToPath(import.meta.url));

function listSvelteFiles(dir: string): string[] {
	const entries = readdirSync(dir, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) files.push(...listSvelteFiles(full));
		else if (entry.name.endsWith('.svelte')) files.push(full);
	}
	return files;
}

describe('Slice 5 bind-migration contract', () => {
	it('has zero bind:value/checked against store.* session/selection fields', () => {
		const storeBind = /bind:(?:value|checked)=\{store\./;
		const offenders: string[] = [];
		for (const file of listSvelteFiles(editorDir)) {
			const source = readFileSync(file, 'utf8');
			if (storeBind.test(source)) offenders.push(path.relative(editorDir, file));
		}
		expect(offenders).toEqual([]);
	});

	it('lighting writes go through sessionView setters', () => {
		const store = createMuseumEditorStore();
		store.sessionView.setAmbientIntensity(1.1);
		store.sessionView.setDirectionalIntensity(2.2);
		store.sessionView.setFogEnabled(true);
		store.sessionView.setFogNear(10);
		store.sessionView.setFogFar(40);
		expect(store.ambientIntensity).toBe(1.1);
		expect(store.directionalIntensity).toBe(2.2);
		expect(store.fogEnabled).toBe(true);
		expect(store.fogNear).toBe(10);
		expect(store.fogFar).toBe(40);
		expect(store.sessionView.ambientIntensity).toBe(1.1);
	});

	it('placement snap / keep-on-floor writes go through sessionView setters', () => {
		const store = createMuseumEditorStore();
		store.sessionView.setTranslationSnapEnabled(false);
		store.sessionView.setTranslationSnap(0.25);
		store.sessionView.setRotationSnapEnabled(false);
		store.sessionView.setRotationSnapDegrees(45);
		store.sessionView.setKeepOnFloor(true);
		expect(store.translationSnapEnabled).toBe(false);
		expect(store.translationSnap).toBe(0.25);
		expect(store.rotationSnapEnabled).toBe(false);
		expect(store.rotationSnapDegrees).toBe(45);
		expect(store.keepOnFloor).toBe(true);
		expect(store.sessionView.keepOnFloor).toBe(true);
	});

	it('facade assignment still forwards snap flags (test/JS compat)', () => {
		const store = createMuseumEditorStore();
		store.translationSnapEnabled = false;
		store.rotationSnapDegrees = 30;
		store.keepOnFloor = true;
		expect(store.sessionView.translationSnapEnabled).toBe(false);
		expect(store.sessionView.rotationSnapDegrees).toBe(30);
		expect(store.sessionView.keepOnFloor).toBe(true);
	});
});
