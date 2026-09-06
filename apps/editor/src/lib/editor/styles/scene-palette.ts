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
	/** Passive/context geometry boxes — P3B.2 white/light treatment
	    (scene-3d-layout-selection.png authoritative; blue is selection only). */
	layoutBox: 0xe7e4dd,
	layoutBoxHover: 0xd8d5cc,
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
	hover: scenePaletteHex(SCENE_PALETTE.selectionOutlineHover),
	layoutBox: scenePaletteHex(SCENE_PALETTE.layoutBox),
	layoutBoxHover: scenePaletteHex(SCENE_PALETTE.layoutBoxHover)
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

/**
 * P21.5 §2.4 — TransformControls single-ending. Detaches the negative-end tip
 * meshes per axis (the arrow cone / scale grip at the `−` end) so each axis
 * keeps exactly one tip at the `+` end.
 *
 * Modern three bakes tip positions into the cloned geometries
 * (`setupGizmo` applies the definition matrix to the geometry and resets
 * `object.position`), so tips are identified by their geometry bounding-box
 * center — never object transforms. Axis shafts (centers at 0.25), the
 * plane handles, the center XYZ gizmos, and the rotate circles (centers
 * within ±0.3 of the origin) are skipped.
 *
 * Detach, never hide: `TransformControlsRoot.updateMatrixWorld()` re-enables
 * every handle (`handle.visible = true`) per frame (three 0.175
 * TransformControls.js:1487), so a one-shot `visible = false` is undone on
 * frame one. Removed children are never re-added by three, so the single
 * ending survives per-frame updates and mode cycles. `setupGizmo()` clones
 * geometry per mesh (baking the definition transform in), so disposing the
 * detached geometry cannot break the remaining `+` tips; materials are
 * shared and never disposed.
 *
 * Strictly cosmetic: nothing else is touched. The `picker` mode groups live
 * under the same gizmo root in current three and are hidden at the GROUP
 * level at the end of the gizmo constructor (their `matInvisible` material
 * is opacity-0.15, not invisible), so the walker never descends into an
 * invisible subtree — picker meshes (hit-testing/snap/hover/active) are
 * left byte-identical. The `helper` axis rails and markers are all Lines or
 * origin-centered geometry that no tip rule matches. Safe to call once at
 * host mount beside `applyEditorGizmoPalette`.
 */
export function applyEditorGizmoSingleEnding(gizmoRoot: unknown): void {
	const root = gizmoRoot as { children?: unknown[] } | null | undefined;
	const gizmo = root?.children?.find(
		(child) =>
			(child as { isTransformControlsGizmo?: boolean })?.isTransformControlsGizmo === true
	) as { children?: unknown[] } | null | undefined;
	if (!gizmo?.children) return;

	/** Tip meshes sit at ±0.45+ on their axis; shafts at 0.25, handles ≤0.15. */
	const TIP_RADIUS = 0.3;

	const visit = (node: unknown, parent: unknown): void => {
		const obj = node as {
			children?: unknown[];
			isMesh?: boolean;
			geometry?: {
				boundingBox?: {
					min: { x: number; y: number; z: number };
					max: { x: number; y: number; z: number };
				} | null;
			computeBoundingBox?: () => void;
			dispose?: () => void;
		} | null;
		visible?: boolean;
	} | null;
		if (!obj) return;
		// Never descend into an invisible subtree: the picker mode groups are
		// hidden at the end of the gizmo constructor and must keep every mesh
		// pickable (raycast resolves there).
		if (obj.visible === false) return;
		if (obj.isMesh && obj.geometry) {
			const geometry = obj.geometry;
			if (geometry.boundingBox === null && typeof geometry.computeBoundingBox === 'function') {
				geometry.computeBoundingBox();
			}
			const box = geometry.boundingBox;
			if (box) {
				const center = {
					x: (box.min.x + box.max.x) / 2,
					y: (box.min.y + box.max.y) / 2,
					z: (box.min.z + box.max.z) / 2
				};
				const magnitudes: Array<['x' | 'y' | 'z', number]> = [
					['x', Math.abs(center.x)],
					['y', Math.abs(center.y)],
					['z', Math.abs(center.z)]
				];
				magnitudes.sort((a, b) => b[1] - a[1]);
				const [axis, magnitude] = magnitudes[0]!;
				if (magnitude >= TIP_RADIUS && center[axis] < 0) {
					// Detach + dispose, then stop descending: three never re-adds
					// removed children, and the geometry is exclusively ours.
					(parent as { remove?: (child: object) => void }).remove?.(obj);
					geometry.dispose?.();
					return;
				}
			}
		}
		if (Array.isArray(obj.children)) obj.children.forEach((child) => visit(child, obj));
	};
	gizmo.children.forEach((child) => visit(child, gizmo));
}
