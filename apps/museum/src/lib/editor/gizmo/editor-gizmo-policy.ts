/**
 * H1 S7 — pure gizmo-policy helpers.
 *
 * One `EditorGizmoPolicy` drives the host, the toolbar, and the W/E/R/T
 * shortcuts. These helpers are the single place that derives:
 *  - remembered-mode → effective-mode resolution (the user's remembered
 *    scene mode is kept, never overwritten by a refused target);
 *  - lowercase semantic axis ↔ Three uppercase axis mapping;
 *  - `showX/showY/showZ` for the effective mode;
 *  - defensive begin guards (unsupported input never reaches an adapter);
 *  - the toolbar/shortcut capability projection.
 *
 * Pure: no Three imports, no Svelte runes, no DOM access.
 */

import type {
	EditorGizmoPolicy,
	EditorGizmoScaleControl,
	GizmoAxis,
	GizmoMode,
	GizmoSpace,
	ThreeGizmoAxis
} from './editor-gizmo-contract';

/** UI/canonical order used only to pick a defensive fallback mode. */
const CANONICAL_MODES: readonly GizmoMode[] = ['translate', 'rotate', 'scale'];

const ALL_COMPONENT_AXES: readonly GizmoAxis[] = ['x', 'y', 'z'];

export const SEMANTIC_AXIS_TO_THREE: Readonly<Record<GizmoAxis, ThreeGizmoAxis>> = {
	x: 'X',
	y: 'Y',
	z: 'Z',
	xy: 'XY',
	xz: 'XZ',
	yz: 'YZ',
	xyz: 'XYZ'
};

/**
 * Reverse map for the seven planar handles. Three's rotate-only `E` and
 * `XYZE` handles have no semantic counterpart — they are derived host
 * capabilities gated by `rotateScreenHandlesAllowed`.
 */
export const THREE_AXIS_TO_SEMANTIC: Readonly<Partial<Record<ThreeGizmoAxis, GizmoAxis>>> = {
	X: 'x',
	Y: 'y',
	Z: 'z',
	XY: 'xy',
	XZ: 'xz',
	YZ: 'yz',
	XYZ: 'xyz'
};

export function semanticAxisToThree(axis: GizmoAxis): ThreeGizmoAxis {
	return SEMANTIC_AXIS_TO_THREE[axis];
}

/** `null` for Three-only rotate handles (`E`/`XYZE`) and unknown values. */
export function threeAxisToSemantic(axis: ThreeGizmoAxis): GizmoAxis | null {
	return THREE_AXIS_TO_SEMANTIC[axis] ?? null;
}

/**
 * Effective mode for a target: the user's remembered mode when the allowed
 * set contains it, otherwise the target's `defaultMode` — the remembered
 * value is never overwritten, so returning to a compatible target restores
 * the user's mode. Defensive dev guard only: if even `defaultMode` is not
 * allowed, fall back to the first canonical allowed mode.
 */
export function resolveEffectiveMode(
	rememberedMode: GizmoMode,
	policy: EditorGizmoPolicy
): GizmoMode {
	if (policy.allowedModes.has(rememberedMode)) return rememberedMode;
	if (policy.allowedModes.has(policy.defaultMode)) return policy.defaultMode;
	const fallback = CANONICAL_MODES.find((mode) => policy.allowedModes.has(mode));
	if (fallback) return fallback;
	// Degenerate policy (no modes allowed): nothing is draggable anyway;
	// the begin guard refuses every axis and `allowedModes` stays empty for
	// toolbar/shortcuts.
	return policy.defaultMode;
}

const AXES_WITH_COMPONENT: Record<'x' | 'y' | 'z', readonly GizmoAxis[]> = {
	x: ['x', 'xy', 'xz', 'xyz'],
	y: ['y', 'xy', 'yz', 'xyz'],
	z: ['z', 'xz', 'yz', 'xyz']
};

export interface ShowAxes {
	showX: boolean;
	showY: boolean;
	showZ: boolean;
}

/**
 * `showX/showY/showZ` for the *effective* mode's allowed-axis set. A
 * restricted target (e.g. room-Y rotation) hides the other component
 * handles automatically, and the rotate-only `E`/`XYZE` handles stay
 * gated separately (they require all three components).
 */
export function deriveShowAxes(mode: GizmoMode, policy: EditorGizmoPolicy): ShowAxes {
	const axes = policy.allowedAxes(resolveEffectiveMode(mode, policy));
	return {
		showX: AXES_WITH_COMPONENT.x.some((axis) => axes.has(axis)),
		showY: AXES_WITH_COMPONENT.y.some((axis) => axes.has(axis)),
		showZ: AXES_WITH_COMPONENT.z.some((axis) => axes.has(axis))
	};
}

/**
 * Defensive guard used by the host at begin: an axis is allowed only when
 * the *effective* mode (which may differ from the remembered one) supports
 * both mode and axis. Unsupported input never reaches an adapter and is
 * never accepted then discarded.
 */
export function isAxisAllowed(
	mode: GizmoMode,
	axis: GizmoAxis,
	policy: EditorGizmoPolicy
): boolean {
	const effective = resolveEffectiveMode(mode, policy);
	return policy.allowedModes.has(effective) && policy.allowedAxes(effective).has(axis);
}

/**
 * Three's rotate-only screen (`E`) and free (`XYZE`) handles are derived
 * host capabilities: reachable only when rotation is allowed and all
 * component rotation axes are allowed.
 */
export function rotateScreenHandlesAllowed(policy: EditorGizmoPolicy): boolean {
	return (
		policy.allowedModes.has('rotate') &&
		ALL_COMPONENT_AXES.every((axis) => policy.allowedAxes('rotate').has(axis))
	);
}

/**
 * Defensive check of a raw TransformControls `controls.axis` value
 * (uppercase, possibly `E`/`XYZE`). Accepts the effective mode's allowed
 * planar handles plus the rotate-only derived handles; anything else —
 * including a string the declarative type cannot express — is refused.
 */
export function isThreeAxisAllowed(
	mode: GizmoMode,
	axis: string,
	policy: EditorGizmoPolicy
): boolean {
	if (axis === 'E' || axis === 'XYZE') {
		const effective = resolveEffectiveMode(mode, policy);
		return effective === 'rotate' && rotateScreenHandlesAllowed(policy);
	}
	const semantic = threeAxisToSemantic(axis as ThreeGizmoAxis);
	return semantic !== null && isAxisAllowed(mode, semantic, policy);
}

/**
 * Toolbar/shortcut capability projection for one target policy. Both the
 * toolbar and the W/E/R/T shortcuts consume this single projection, so an
 * unsupported mode can never be selected through one and refused by the
 * other. `rememberedMode` optional (absent → the policy `defaultMode`).
 */
export interface EditorGizmoCapabilities {
	/** Modes the UI may offer for this target. */
	allowedModes: ReadonlySet<GizmoMode>;
	/** Mode the host will actually engage (remembered, or default when refused). */
	effectiveMode: GizmoMode;
	/** Allowed semantic axes for the effective mode. */
	axes: ReadonlySet<GizmoAxis>;
	/** Show-axes for the effective mode (labels: `showX/showY/showZ`). */
	show: ShowAxes;
	/** Whether Three rotate-only `E`/`XYZE` handles are reachable. */
	rotateScreenHandles: boolean;
	/** Space for the effective mode (world/local), e.g. for a space chip. */
	space: GizmoSpace;
	/** Scale-chain visibility rule for the toolbar. */
	scaleControl: EditorGizmoScaleControl;
}

export function projectGizmoCapabilities(
	policy: EditorGizmoPolicy,
	rememberedMode?: GizmoMode
): EditorGizmoCapabilities {
	const effectiveMode = resolveEffectiveMode(rememberedMode ?? policy.defaultMode, policy);
	return {
		allowedModes: policy.allowedModes,
		effectiveMode,
		axes: policy.allowedAxes(effectiveMode),
		show: deriveShowAxes(effectiveMode, policy),
		rotateScreenHandles: rotateScreenHandlesAllowed(policy),
		space: policy.space(effectiveMode),
		scaleControl: policy.scaleControl
	};
}

/** H1 S3 active domain → the one interactive gizmo policy projection. */
export type GizmoActiveDomain = 'scene' | 'camera' | 'layout' | 'none';

/** Policies the H1 shell maps a domain onto (the adapter-owned constants). */
export interface EditorGizmoDomainPolicies {
	scene: EditorGizmoPolicy;
	camera: EditorGizmoPolicy;
}

/**
 * Single projection shared by the H1 toolbar and the W/E/R/T shortcuts.
 * `scene`/`camera` project the target policy with the remembered mode;
 * `layout` (detached in S7) and `none` return `null` — no interactive gizmo
 * policy. The relic has no `ActiveEditorSelection` and keeps its legacy
 * navigation-before-placement arbitration instead of this helper.
 */
export function projectDomainGizmoCapabilities(
	domain: GizmoActiveDomain,
	rememberedMode: GizmoMode,
	policies: EditorGizmoDomainPolicies
): EditorGizmoCapabilities | null {
	if (domain === 'scene') return projectGizmoCapabilities(policies.scene, rememberedMode);
	if (domain === 'camera') return projectGizmoCapabilities(policies.camera, rememberedMode);
	return null;
}