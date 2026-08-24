/*
 * P3.2 — canonical Scene 3D overlay palette (Design-specs.md §8).
 *
 * Three.js materials cannot read CSS custom properties, so the Scene 3D
 * overlay colors (selection outlines, hover/layout boxes, gizmo axes) are
 * mirrored here from `styles/tokens.css`. The contract test
 * (`tests/lib/editor/styles/scene-palette.test.ts`) parses tokens.css and
 * fails if the two sources drift. Never inline these values elsewhere.
 */

export const SCENE_PALETTE = {
	/** Selected-object outline + selected camera path emphasis. */
	selectionOutline: 0x2f8cff,
	/** Hover-tier outline: clearly not-selected. */
	selectionOutlineHover: 0x55a1ff,
	/** Passive/context geometry boxes (muted warm gray per DS §8). */
	layoutBox: 0x92908a,
	layoutBoxHover: 0x77766f,
	/** Handle/vertex fill on active gestures. */
	selectionHandle: 0xedf3f8,
	/** Transform-axis mapping shared with the orientation box (DS §8). */
	axisX: 0xf05252,
	axisY: 0x45c878,
	axisZ: 0x3b82f6,
	/** Active/hover emphasis on gizmo interaction states. */
	gizmoActive: 0x2f8cff,
	gizmoHover: 0x55a1ff
} as const;

/**
 * Recolor three.js TransformControls' default primary-color gizmo materials
 * onto the canonical §8 axis tokens. Strictly cosmetic: only materials whose
 * color exactly matches one of TransformControls' built-in axis colors are
 * touched — geometry, pickers, opacity semantics, and interaction behavior
 * are untouched. Safe to call once at host mount (the material instances
 * persist across mode changes).
 */
const GIZMO_COLOR_MAP: Readonly<Record<number, number>> = {
	// TransformControls builds matRed/matGreen/matBlue (+ transparent clones)
	// from these exact primaries; see three/examples/jsm/controls/TransformControls.js.
	0xff0000: SCENE_PALETTE.axisX,
	0x00ff00: SCENE_PALETTE.axisY,
	0x0000ff: SCENE_PALETTE.axisZ
};

/** `#rrggbb` string form for Three.js material/Threlte `color` props. */
export function scenePaletteHex(value: number): string {
	return `#${value.toString(16).padStart(6, '0')}`;
}

/** Preformatted string forms for the shared selection/hover language. */
export const SCENE_PALETTE_HEX = {
	selected: scenePaletteHex(SCENE_PALETTE.selectionOutline),
	hover: scenePaletteHex(SCENE_PALETTE.selectionOutlineHover)
} as const;

export function applyEditorGizmoPalette(gizmoRoot: unknown): void {	const root = gizmoRoot as { children?: unknown[] } | null | undefined;
	if (!root?.children) return;
	const seen = new Set<object>();
	const visit = (node: unknown): void => {
		const obj = node as {
			children?: unknown[];
			material?: { color?: { getHex(): number; setHex(hex: number): void } } | Array<{
				color?: { getHex(): number; setHex(hex: number): void }
			}>;
		} | null;
		if (!obj) return;
		const materials = Array.isArray(obj.material)
			? obj.material
			: obj.material
				? [obj.material]
				: [];
		for (const material of materials) {
			if (!material?.color || typeof material.color.getHex !== 'function') continue;
			if (seen.has(material as object)) continue;
			seen.add(material as object);
			const mapped = GIZMO_COLOR_MAP[material.color.getHex()];
			if (mapped !== undefined) material.color.setHex(mapped);
		}
		if (Array.isArray(obj.children)) obj.children.forEach(visit);
	};
	root.children.forEach(visit);
}
