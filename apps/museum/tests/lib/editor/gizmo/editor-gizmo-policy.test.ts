import { describe, expect, it } from 'vitest';
import type { EditorGizmoPolicy, GizmoAxis, GizmoMode } from '$lib/editor/gizmo/editor-gizmo-contract';
import {
	deriveShowAxes,
	isAxisAllowed,
	isThreeAxisAllowed,
	projectGizmoCapabilities,
	resolveEffectiveMode,
	rotateScreenHandlesAllowed,
	semanticAxisToThree,
	threeAxisToSemantic
} from '$lib/editor/gizmo/editor-gizmo-policy';

const ALL_AXES: ReadonlySet<GizmoAxis> = new Set(['x', 'y', 'z', 'xy', 'xz', 'yz', 'xyz']);
const XZ_AXES: ReadonlySet<GizmoAxis> = new Set(['x', 'z', 'xz']);

/** Scene placements: everything, world space, scene scale-mode chain. */
const SCENE_POLICY: EditorGizmoPolicy = {
	defaultMode: 'translate',
	allowedModes: new Set(['translate', 'rotate', 'scale']),
	allowedAxes: () => ALL_AXES,
	space: () => 'world',
	scaleControl: 'scene-scale-mode'
};

/** Camera: world translate only, horizontal handles, no scale chain. */
const CAMERA_POLICY: EditorGizmoPolicy = {
	defaultMode: 'translate',
	allowedModes: new Set(['translate']),
	allowedAxes: () => XZ_AXES,
	space: () => 'world',
	scaleControl: 'hidden'
};

/** Layout room: translate x/z/xz or rotate y (room Y rotation); never scale. */
const ROOM_POLICY: EditorGizmoPolicy = {
	defaultMode: 'translate',
	allowedModes: new Set(['translate', 'rotate']),
	allowedAxes: (mode) => (mode === 'translate' ? XZ_AXES : new Set(['y'])),
	space: () => 'world',
	scaleControl: 'hidden'
};

/** Layout object: full modes; translate world, rotate/scale local. */
const OBJECT_POLICY: EditorGizmoPolicy = {
	defaultMode: 'translate',
	allowedModes: new Set(['translate', 'rotate', 'scale']),
	allowedAxes: () => ALL_AXES,
	space: (mode) => (mode === 'translate' ? 'world' : 'local'),
	scaleControl: 'fixed-independent'
};

describe('resolveEffectiveMode — remembered → effective', () => {
	it('keeps the remembered mode when the target allows it', () => {
		expect(resolveEffectiveMode('rotate', SCENE_POLICY)).toBe('rotate');
		expect(resolveEffectiveMode('scale', OBJECT_POLICY)).toBe('scale');
	});

	it('uses defaultMode when the remembered mode is refused, without overwriting it', () => {
		expect(resolveEffectiveMode('scale', ROOM_POLICY)).toBe('translate');
		expect(resolveEffectiveMode('rotate', CAMERA_POLICY)).toBe('translate');
	});

	it('defaults to defaultMode when no remembered mode is given', () => {
		expect(resolveEffectiveMode(ROOM_POLICY.defaultMode, ROOM_POLICY)).toBe('translate');
	});

	it('defensive dev guard: falls back to a canonical allowed mode when even defaultMode is refused', () => {
		const broken: EditorGizmoPolicy = {
			defaultMode: 'scale',
			allowedModes: new Set(['translate']),
			allowedAxes: () => ALL_AXES,
			space: () => 'world',
			scaleControl: 'hidden'
		};
		expect(resolveEffectiveMode('scale', broken)).toBe('translate');
	});

	it('degenerate empty policy resolves its defaultMode (nothing is draggable anyway)', () => {
		const empty: EditorGizmoPolicy = {
			defaultMode: 'translate',
			allowedModes: new Set(),
			allowedAxes: () => new Set(),
			space: () => 'world',
			scaleControl: 'hidden'
		};
		expect(resolveEffectiveMode('translate', empty)).toBe('translate');
	});
});

describe('axis mapping — lowercase semantic ↔ Three uppercase', () => {
	it('maps every semantic axis to its Three handle', () => {
		expect(semanticAxisToThree('x')).toBe('X');
		expect(semanticAxisToThree('y')).toBe('Y');
		expect(semanticAxisToThree('z')).toBe('Z');
		expect(semanticAxisToThree('xy')).toBe('XY');
		expect(semanticAxisToThree('xz')).toBe('XZ');
		expect(semanticAxisToThree('yz')).toBe('YZ');
		expect(semanticAxisToThree('xyz')).toBe('XYZ');
	});

	it('round-trips exactly for all planar handles', () => {
		for (const axis of ['x', 'y', 'z', 'xy', 'xz', 'yz', 'xyz'] as const) {
			expect(threeAxisToSemantic(semanticAxisToThree(axis))).toBe(axis);
		}
	});

	it('Three-only rotate handles (E / XYZE) have no semantic counterpart', () => {
		expect(threeAxisToSemantic('E')).toBeNull();
		expect(threeAxisToSemantic('XYZE')).toBeNull();
	});
});

describe('deriveShowAxes — showX/showY/showZ for the effective mode', () => {
	it('scene translate/rotate show every component', () => {
		expect(deriveShowAxes('translate', SCENE_POLICY)).toEqual({
			showX: true,
			showY: true,
			showZ: true
		});
	});

	it('room rotate (Y only) shows just Y', () => {
		expect(deriveShowAxes('rotate', ROOM_POLICY)).toEqual({
			showX: false,
			showY: true,
			showZ: false
		});
	});

	it('room translate (x/z/xz) hides Y', () => {
		expect(deriveShowAxes('translate', ROOM_POLICY)).toEqual({
			showX: true,
			showY: false,
			showZ: true
		});
	});

	it('camera translate (x/z/xz) hides Y', () => {
		expect(deriveShowAxes('translate', CAMERA_POLICY)).toEqual({
			showX: true,
			showY: false,
			showZ: true
		});
	});

	it('a refused remembered mode derives the effective mode\'s axes (room scale → translate)', () => {
		expect(deriveShowAxes('scale', ROOM_POLICY)).toEqual({
			showX: true,
			showY: false,
			showZ: true
		});
	});
});

describe('isAxisAllowed — defensive begin guard', () => {
	it('accepts only the effective mode\'s allowed axes', () => {
		expect(isAxisAllowed('translate', 'x', ROOM_POLICY)).toBe(true);
		expect(isAxisAllowed('translate', 'xz', ROOM_POLICY)).toBe(true);
		expect(isAxisAllowed('translate', 'z', ROOM_POLICY)).toBe(true);
		expect(isAxisAllowed('translate', 'y', ROOM_POLICY)).toBe(false);
		expect(isAxisAllowed('translate', 'xyz', ROOM_POLICY)).toBe(false);
		expect(isAxisAllowed('rotate', 'y', ROOM_POLICY)).toBe(true);
		expect(isAxisAllowed('rotate', 'x', ROOM_POLICY)).toBe(false);
	});

	it('refuses entire disallowed modes, even after effective-mode resolution', () => {
		// remembered 'scale' on a room resolves to translate, where 'y' is
		// refused; a rotate 'xy' handle cannot start on a translate-only
		// camera under any interpretation.
		expect(isAxisAllowed('scale', 'y', ROOM_POLICY)).toBe(false);
		expect(isAxisAllowed('rotate', 'xy', CAMERA_POLICY)).toBe(false);
	});

	it('a refused remembered mode resolves its effective axes instead of refusing blindly', () => {
		// remembered 'scale' on a room → effective translate, so 'x' is a
		// legitimate handle for the effective mode.
		expect(isAxisAllowed('scale', 'x', ROOM_POLICY)).toBe(true);
	});
});

describe('rotate-only handles (E / XYZE) — derived host capabilities', () => {
	it('scene full-rotation targets expose them', () => {
		expect(rotateScreenHandlesAllowed(SCENE_POLICY)).toBe(true);
		expect(isThreeAxisAllowed('rotate', 'E', SCENE_POLICY)).toBe(true);
		expect(isThreeAxisAllowed('rotate', 'XYZE', SCENE_POLICY)).toBe(true);
	});

	it('E/XYZE are rotate-only: refused outside rotate even on full targets', () => {
		expect(isThreeAxisAllowed('translate', 'E', SCENE_POLICY)).toBe(false);
		expect(isThreeAxisAllowed('scale', 'XYZE', SCENE_POLICY)).toBe(false);
	});

	it('restricted rotation (room Y) hides both derived handles', () => {
		expect(rotateScreenHandlesAllowed(ROOM_POLICY)).toBe(false);
		expect(isThreeAxisAllowed('rotate', 'E', ROOM_POLICY)).toBe(false);
		expect(isThreeAxisAllowed('rotate', 'XYZE', ROOM_POLICY)).toBe(false);
		expect(isThreeAxisAllowed('rotate', 'Y', ROOM_POLICY)).toBe(true);
		expect(isThreeAxisAllowed('rotate', 'X', ROOM_POLICY)).toBe(false);
	});

	it('translate-only targets never expose them', () => {
		expect(rotateScreenHandlesAllowed(CAMERA_POLICY)).toBe(false);
		expect(isThreeAxisAllowed('rotate', 'E', CAMERA_POLICY)).toBe(false);
	});

	it('defensive: any unexpected uppercase value is refused', () => {
		expect(isThreeAxisAllowed('translate', 'Q', SCENE_POLICY)).toBe(false);
		expect(isThreeAxisAllowed('scale', 'E', SCENE_POLICY)).toBe(false);
	});
});

describe('projectGizmoCapabilities — single projection for toolbar + shortcuts', () => {
	it('scene target projects full capabilities for the remembered mode', () => {
		const caps = projectGizmoCapabilities(SCENE_POLICY, 'scale');
		expect(caps.effectiveMode).toBe('scale');
		expect(caps.allowedModes).toEqual(new Set(['translate', 'rotate', 'scale']));
		expect(caps.axes).toEqual(ALL_AXES);
		expect(caps.show).toEqual({ showX: true, showY: true, showZ: true });
		expect(caps.rotateScreenHandles).toBe(true);
		expect(caps.space).toBe('world');
		expect(caps.scaleControl).toBe('scene-scale-mode');
	});

	it('room target refuses the remembered scale mode and projects translate', () => {
		const caps = projectGizmoCapabilities(ROOM_POLICY, 'scale');
		expect(caps.effectiveMode).toBe('translate');
		expect(caps.allowedModes).toEqual(new Set(['translate', 'rotate']));
		expect(caps.axes).toEqual(XZ_AXES);
		expect(caps.show).toEqual({ showX: true, showY: false, showZ: true });
		expect(caps.rotateScreenHandles).toBe(false);
	});

	it('layout-object target switches space per effective mode (rotate → local)', () => {
		expect(projectGizmoCapabilities(OBJECT_POLICY, 'translate').space).toBe('world');
		expect(projectGizmoCapabilities(OBJECT_POLICY, 'rotate').space).toBe('local');
		expect(projectGizmoCapabilities(OBJECT_POLICY).effectiveMode).toBe('translate');
		expect(projectGizmoCapabilities(OBJECT_POLICY, 'scale').scaleControl).toBe(
			'fixed-independent'
		);
	});

	it('refuses nothing through projection that the begin guard would refuse', () => {
		const caps = projectGizmoCapabilities(ROOM_POLICY, 'rotate');
		expect(caps.allowedModes.has('scale')).toBe(false);
		// The Y-rotate handle stays reachable under the room policy.
		expect(isThreeAxisAllowed(caps.effectiveMode, 'Y', ROOM_POLICY)).toBe(true);
	});
});

describe('policy mode-set helper typing — GizmoMode is a closed union', () => {
	it('scenario coverage: every mode appears in at least one fixture policy', () => {
		const modes = new Set<GizmoMode>();
		for (const policy of [SCENE_POLICY, CAMERA_POLICY, ROOM_POLICY, OBJECT_POLICY]) {
			for (const mode of policy.allowedModes) modes.add(mode);
		}
		expect(modes).toEqual(new Set(['translate', 'rotate', 'scale']));
	});
});