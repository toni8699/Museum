import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SCENE_PALETTE } from '$lib/editor/styles/scene-palette';

const STYLES_DIR = fileURLToPath(new URL('../../../../src/lib/editor/styles', import.meta.url));

function readTokenSource(): string {
	return fs.readFileSync(path.join(STYLES_DIR, 'tokens.css'), 'utf8');
}

/** Extract `--editor-<name>: <hex>;` declarations from tokens.css. */
function tokenHex(source: string, name: string): string | null {
	const match = source.match(new RegExp(`--editor-${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`));
	return match ? match[1]!.toLowerCase() : null;
}

describe('scene palette ↔ tokens.css contract (P3.2)', () => {
	const source = readTokenSource();

	it('mirrors every Scene 3D overlay color from the canonical token file', () => {
		const expected: Array<[keyof typeof SCENE_PALETTE, string]> = [
			['selectionOutline', 'selection-outline'],
			['selectionOutlineHover', 'selection-outline-hover'],
			['layoutBox', 'layout-box'],
			['layoutBoxHover', 'layout-box-hover'],
			['selectionHandle', 'selection-handle'],
			['axisX', 'gizmo-x'],
			['axisY', 'gizmo-y'],
			['axisZ', 'gizmo-z'],
			['gizmoActive', 'accent'],
			['gizmoHover', 'accent-hover']
		];
		for (const [paletteKey, tokenName] of expected) {
			const hex = tokenHex(source, tokenName);
			expect(hex, `tokens.css must define --editor-${tokenName}`).not.toBeNull();
			expect(
				SCENE_PALETTE[paletteKey].toString(16).padStart(6, '0'),
				`SCENE_PALETTE.${paletteKey} must equal --editor-${tokenName}`
			).toBe(hex!.slice(1));
		}
	});

	it('pins the six-file styles directory required by Design-specs §37', () => {
		for (const file of [
			'tokens.css',
			'editor-shell.css',
			'controls.css',
			'inspector.css',
			'timeline.css',
			'plan.css'
		]) {
			expect(fs.existsSync(path.join(STYLES_DIR, file)), `${file} must exist`).toBe(true);
		}
	});
});
