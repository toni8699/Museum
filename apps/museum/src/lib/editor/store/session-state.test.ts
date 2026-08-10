import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi
} from 'vitest';
import { EditorSessionState } from './session-state.svelte';
// Inlined to match `museum-editor.svelte.ts` `EDITOR_VISITOR_LIGHTING` /
// `EDITOR_BRIGHT_LIGHTING`. The constants stay on the god file outside the
// types-only barrel per Slice 1 debt 3.11.
const EDITOR_VISITOR_LIGHTING = {
	ambientIntensity: 0.2,
	directionalIntensity: 0.7,
	fogEnabled: true,
	fogNear: 22,
	fogFar: 54
} as const;
const EDITOR_BRIGHT_LIGHTING = {
	ambientIntensity: 0.65,
	directionalIntensity: 1.15,
	fogEnabled: false,
	fogNear: 22,
	fogFar: 54
} as const;

describe('EditorSessionState', () => {
	let session: EditorSessionState;

	beforeEach(() => {
		vi.useFakeTimers();
		session = new EditorSessionState();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('viewport visibility flags', () => {
		it('defaults all three flags to true', () => {
			expect(session.viewportShowNodes).toBe(true);
			expect(session.viewportShowPaths).toBe(true);
			expect(session.viewportShowFraming).toBe(true);
		});

		it('toggleViewportShowNodes flips the flag', () => {
			session.toggleViewportShowNodes();
			expect(session.viewportShowNodes).toBe(false);
			session.toggleViewportShowNodes();
			expect(session.viewportShowNodes).toBe(true);
		});

		it('toggleViewportShowPaths flips the flag', () => {
			session.toggleViewportShowPaths();
			expect(session.viewportShowPaths).toBe(false);
			session.toggleViewportShowPaths();
			expect(session.viewportShowPaths).toBe(true);
		});

		it('toggleViewportShowFraming flips the flag', () => {
			session.toggleViewportShowFraming();
			expect(session.viewportShowFraming).toBe(false);
			session.toggleViewportShowFraming();
			expect(session.viewportShowFraming).toBe(true);
		});

		it('toggles are independent of one another', () => {
			session.toggleViewportShowNodes();
			expect(session.viewportShowPaths).toBe(true);
			expect(session.viewportShowFraming).toBe(true);
		});
	});

	describe('setStatusMessage + timer', () => {
		it('clears any prior timer and sets message immediately', () => {
			session.setStatusMessage('first');
			expect(session.statusMessage).toBe('first');
		});

		it('auto-clears after STATUS_MESSAGE_MS (2500ms)', () => {
			session.setStatusMessage('hello');
			expect(session.statusMessage).toBe('hello');
			vi.advanceTimersByTime(2499);
			expect(session.statusMessage).toBe('hello');
			vi.advanceTimersByTime(1);
			expect(session.statusMessage).toBe(null);
		});

		it('manual null clears immediately and cancels the pending timer', () => {
			session.setStatusMessage('hello');
			vi.advanceTimersByTime(1000);
			session.setStatusMessage(null);
			expect(session.statusMessage).toBe(null);
			vi.advanceTimersByTime(5000);
			expect(session.statusMessage).toBe(null);
		});

		it('a second setStatusMessage replaces the message and resets the timer', () => {
			session.setStatusMessage('first');
			vi.advanceTimersByTime(2000);
			session.setStatusMessage('second');
			vi.advanceTimersByTime(2000);
			expect(session.statusMessage).toBe('second');
			vi.advanceTimersByTime(500);
			expect(session.statusMessage).toBe(null);
		});

		it('keeps the message when re-asserted with same text and does not duplicate timers', () => {
			session.setStatusMessage('repeat');
			vi.advanceTimersByTime(1000);
			const timerCountBefore = vi.getTimerCount();
			session.setStatusMessage('repeat');
			expect(vi.getTimerCount()).toBe(timerCountBefore);
		});
	});

	describe('workspace chrome', () => {
		it('round-trips setWorkspace ↔ currentWorkspace', () => {
			session.setWorkspace('camera');
			expect(session.currentWorkspace).toBe('camera');
			session.setWorkspace('scene');
			expect(session.currentWorkspace).toBe('scene');
		});

		it('round-trips setLeftPanel ↔ leftPanel', () => {
			session.setLeftPanel('assets');
			expect(session.leftPanel).toBe('assets');
			session.setLeftPanel('scene');
			expect(session.leftPanel).toBe('scene');
		});

		it('round-trips setTimelineExpanded / setSceneTimelineExpanded ↔ fields', () => {
			session.setTimelineExpanded(true);
			expect(session.timelineExpanded).toBe(true);
			session.setSceneTimelineExpanded(true);
			expect(session.sceneTimelineExpanded).toBe(true);
		});

		it('setTimelineHeight persists numeric value', () => {
			session.setTimelineHeight(300);
			expect(session.timelineHeight).toBe(300);
		});
	});

	describe('lighting + fog', () => {
		it('defaults match EDITOR_BRIGHT_LIGHTING', () => {
			expect(session.ambientIntensity).toBe(EDITOR_BRIGHT_LIGHTING.ambientIntensity);
			expect(session.directionalIntensity).toBe(
				EDITOR_BRIGHT_LIGHTING.directionalIntensity
			);
			expect(session.fogEnabled).toBe(EDITOR_BRIGHT_LIGHTING.fogEnabled);
			expect(session.fogNear).toBe(EDITOR_BRIGHT_LIGHTING.fogNear);
			expect(session.fogFar).toBe(EDITOR_BRIGHT_LIGHTING.fogFar);
		});

		it('applyLighting replaces all five fields atomically', () => {
			session.applyLighting(EDITOR_VISITOR_LIGHTING);
			expect(session.ambientIntensity).toBe(EDITOR_VISITOR_LIGHTING.ambientIntensity);
			expect(session.directionalIntensity).toBe(
				EDITOR_VISITOR_LIGHTING.directionalIntensity
			);
			expect(session.fogEnabled).toBe(EDITOR_VISITOR_LIGHTING.fogEnabled);
			expect(session.fogNear).toBe(EDITOR_VISITOR_LIGHTING.fogNear);
			expect(session.fogFar).toBe(EDITOR_VISITOR_LIGHTING.fogFar);
		});
	});

	describe('lighting setters (Slice 5 — bind migration writers)', () => {
		it('setAmbientIntensity forwards to ambientIntensity', () => {
			session.setAmbientIntensity(1.25);
			expect(session.ambientIntensity).toBe(1.25);
		});

		it('setDirectionalIntensity forwards to directionalIntensity', () => {
			session.setDirectionalIntensity(0.85);
			expect(session.directionalIntensity).toBe(0.85);
		});

		it('setFogEnabled toggles fogEnabled boolean', () => {
			session.setFogEnabled(true);
			expect(session.fogEnabled).toBe(true);
			session.setFogEnabled(false);
			expect(session.fogEnabled).toBe(false);
		});

		it('setFogNear forwards to fogNear', () => {
			session.setFogNear(33);
			expect(session.fogNear).toBe(33);
		});

		it('setFogFar forwards to fogFar', () => {
			session.setFogFar(72);
			expect(session.fogFar).toBe(72);
		});

		it('applyLighting overrides any per-field setter write', () => {
			session.setFogEnabled(true);
			session.setFogNear(99);
			session.applyLighting(EDITOR_BRIGHT_LIGHTING);
			expect(session.fogEnabled).toBe(EDITOR_BRIGHT_LIGHTING.fogEnabled);
			expect(session.fogNear).toBe(EDITOR_BRIGHT_LIGHTING.fogNear);
		});
	});

	describe('snap + keep-on-floor', () => {
	it('defaults match editor-placement constants', () => {
		expect(session.translationSnap).toBe(0.1);
		expect(session.rotationSnapDegrees).toBe(15);
		expect(session.translationSnapEnabled).toBe(false);
		expect(session.rotationSnapEnabled).toBe(false);
		expect(session.scaleSnapEnabled).toBe(false);
		expect(session.scaleSnap).toBe(0.1);
		expect(session.keepOnFloor).toBe(false);
	});

		it('setTranslationSnapEnabled / setKeepOnFloor write absolute values', () => {
			session.setTranslationSnapEnabled(false);
			session.setRotationSnapEnabled(false);
			session.setKeepOnFloor(true);
			expect(session.translationSnapEnabled).toBe(false);
			expect(session.rotationSnapEnabled).toBe(false);
			expect(session.keepOnFloor).toBe(true);
		});

	it('toggleTranslationSnap flips the flag', () => {
		session.toggleTranslationSnap();
		expect(session.translationSnapEnabled).toBe(true);
		session.toggleTranslationSnap();
		expect(session.translationSnapEnabled).toBe(false);
	});

	it('toggleRotationSnap flips the flag', () => {
		session.toggleRotationSnap();
		expect(session.rotationSnapEnabled).toBe(true);
		session.toggleRotationSnap();
		expect(session.rotationSnapEnabled).toBe(false);
	});

	it('toggleScaleSnap flips the flag', () => {
		session.toggleScaleSnap();
		expect(session.scaleSnapEnabled).toBe(true);
		session.toggleScaleSnap();
		expect(session.scaleSnapEnabled).toBe(false);
	});

	it('setScaleSnap / setScaleSnapEnabled write absolute values', () => {
		session.setScaleSnapEnabled(true);
		session.setScaleSnap(0.05);
		expect(session.scaleSnapEnabled).toBe(true);
		expect(session.scaleSnap).toBe(0.05);
	});

		it('toggleKeepOnFloor flips the flag', () => {
			session.toggleKeepOnFloor();
			expect(session.keepOnFloor).toBe(true);
		});

		it('requestDropToFloor bumps the request id', () => {
			const before = session.dropToFloorRequestId;
			session.requestDropToFloor();
			expect(session.dropToFloorRequestId).toBeGreaterThan(before);
		});
	});

	describe('tree expansion', () => {
		it('expandRoom adds a room id and is idempotent', () => {
			expect(session.expandRoom('music-chamber')).toBe(true);
			expect(session.treeExpandedRoomIds).toContain('music-chamber');
			expect(session.expandRoom('music-chamber')).toBe(false);
		});

		it('toggleRoomExpanded adds then removes with stable identity', () => {
			session.toggleRoomExpanded('music-chamber');
			expect(session.treeExpandedRoomIds).toContain('music-chamber');
			session.toggleRoomExpanded('music-chamber');
			expect(session.treeExpandedRoomIds).not.toContain('music-chamber');
		});

		it('expandCluster adds a cluster id and is idempotent', () => {
			expect(session.expandCluster('c-test')).toBe(true);
			expect(session.treeExpandedClusterIds).toContain('c-test');
			expect(session.expandCluster('c-test')).toBe(false);
		});

		it('toggleClusterExpanded uses immutability (does not mutate the old array)', () => {
			const before = session.treeExpandedClusterIds;
			session.toggleClusterExpanded('c-test');
			expect(session.treeExpandedClusterIds).not.toBe(before);
		});

		it('expandCameraConnection adds a connection id and is idempotent', () => {
			expect(session.expandCameraConnection('conn-1')).toBe(true);
			expect(session.treeExpandedCameraConnectionIds).toContain('conn-1');
			expect(session.expandCameraConnection('conn-1')).toBe(false);
		});

		it('expandCameraDirection stores `${connection}::${direction}` keys', () => {
			session.expandCameraDirection('conn-1', 'forward');
			expect(session.treeExpandedCameraDirectionKeys).toContain('conn-1::forward');
			expect(session.expandCameraDirection('conn-1', 'forward')).toBe(false);
			expect(session.expandCameraDirection('conn-1', 'reverse')).toBe(true);
		});
	});

	describe('interaction flags + drag', () => {
		it('setTransformInteraction(true, "placement") sets kind = "placement"', () => {
			session.setTransformInteraction(true, 'placement');
			expect(session.transformInteractionActive).toBe(true);
			expect(session.transformInteractionKind).toBe('placement');
		});

		it('setTransformInteraction(false, …) clears kind', () => {
			session.setTransformInteraction(true, 'placement');
			session.setTransformInteraction(false, null);
			expect(session.transformInteractionActive).toBe(false);
			expect(session.transformInteractionKind).toBe(null);
		});

		it('setDirect{Path,Framing}Interaction toggles independently', () => {
			session.setDirectPathInteraction(true);
			session.setDirectFramingInteraction(true);
			expect(session.directPathInteractionActive).toBe(true);
			expect(session.directFramingInteractionActive).toBe(true);
			session.setDirectPathInteraction(false);
			expect(session.directPathInteractionActive).toBe(false);
			expect(session.directFramingInteractionActive).toBe(true);
		});

		it('startViewKeyframeProgressDrag + cancelViewKeyframeProgressDrag round-trip', () => {
			session.startViewKeyframeProgressDrag({
				connectionId: 'c-1',
				direction: 'forward',
				keyframeId: 'k-1'
			});
			expect(session.viewKeyframeProgressDrag).toEqual({
				connectionId: 'c-1',
				direction: 'forward',
				keyframeId: 'k-1'
			});
			session.cancelViewKeyframeProgressDrag();
			expect(session.viewKeyframeProgressDrag).toBe(null);
		});
	});

	describe('focus channel', () => {
		it('setCameraFocus assigns kind/placement/node and bumps version', () => {
			const before = session.cameraFocusVersion;
			session.setCameraFocus('placement', 'p-1', null);
			expect(session.cameraFocusKind).toBe('placement');
			expect(session.cameraFocusPlacementId).toBe('p-1');
			expect(session.cameraFocusNodeId).toBe(null);
			expect(session.cameraFocusVersion).toBeGreaterThan(before);
		});

		it('clearCameraFocus nulls every field and bumps version', () => {
			session.setCameraFocus('navigation-node', null, 'n-1');
			const before = session.cameraFocusVersion;
			session.clearCameraFocus();
			expect(session.cameraFocusKind).toBe(null);
			expect(session.cameraFocusPlacementId).toBe(null);
			expect(session.cameraFocusNodeId).toBe(null);
			expect(session.cameraFocusVersion).toBeGreaterThan(before);
		});
	});

	describe('pending nav / asset / frame', () => {
		it('setPendingNavigationCommand round-trips', () => {
			session.setPendingNavigationCommand({ kind: 'place-camera' });
			expect(session.pendingNavigationCommand?.kind).toBe('place-camera');
			session.setPendingNavigationCommand(null);
			expect(session.pendingNavigationCommand).toBe(null);
		});

		it('setPendingPlacementAssetId round-trips', () => {
			session.setPendingPlacementAssetId('asset-1');
			expect(session.pendingPlacementAssetId).toBe('asset-1');
			session.setPendingPlacementAssetId(null);
			expect(session.pendingPlacementAssetId).toBe(null);
		});

		it('setPendingFramePlacementIds bumps version and assigns ids', () => {
			const before = session.pendingFrameVersion;
			session.setPendingFramePlacementIds(['p-1', 'p-2']);
			expect(session.pendingFramePlacementIds).toEqual(['p-1', 'p-2']);
			expect(session.pendingFrameVersion).toBeGreaterThan(before);
		});

		it('clearPendingFramePlacementIds empties + bumps version', () => {
			session.setPendingFramePlacementIds(['p-1']);
			const before = session.pendingFrameVersion;
			session.clearPendingFramePlacementIds();
			expect(session.pendingFramePlacementIds).toEqual([]);
			expect(session.pendingFrameVersion).toBeGreaterThan(before);
		});
	});

	describe('Phase 5.2 — texture recents + load states + pending material edit', () => {
		it('starts empty for recents and load states, with no pending edit', () => {
			expect(session.recentTextureIds).toEqual([]);
			expect(session.textureLoadStates).toEqual({});
			expect(session.pendingMaterialEdit).toBe(null);
		});

		it('markTextureRecentlyUsed prepends, deduplicates, and caps at eight', () => {
			for (let i = 0; i < 12; i += 1) session.markTextureRecentlyUsed(`t-${i}`);
			expect(session.recentTextureIds).toEqual([
				't-11',
				't-10',
				't-9',
				't-8',
				't-7',
				't-6',
				't-5',
				't-4'
			]);
			session.markTextureRecentlyUsed('t-9');
			expect(session.recentTextureIds[0]).toBe('t-9');
			expect(session.recentTextureIds.filter((id) => id === 't-9')).toHaveLength(1);
			expect(session.recentTextureIds).toHaveLength(8);
		});

		it('ignores blank or whitespace-only texture ids', () => {
			session.markTextureRecentlyUsed('   ');
			session.markTextureRecentlyUsed('');
			expect(session.recentTextureIds).toEqual([]);
		});

		it('setTextureLoadState writes a fresh reactive record each call', () => {
			session.setTextureLoadState('/a.png', { status: 'loading' });
			const before = session.textureLoadStates;
			session.setTextureLoadState('/a.png', { status: 'ready' });
			expect(session.textureLoadStates).toEqual({ '/a.png': { status: 'ready' } });
			expect(session.textureLoadStates).not.toBe(before);
		});

		it('clearTextureLoadState removes only the keyed URI', () => {
			session.setTextureLoadState('/a.png', { status: 'ready' });
			session.setTextureLoadState('/b.png', { status: 'ready' });
			session.clearTextureLoadState('/a.png');
			expect(session.textureLoadStates).toEqual({ '/b.png': { status: 'ready' } });
			// double-clear is stable
			session.clearTextureLoadState('/a.png');
			expect(session.textureLoadStates).toEqual({ '/b.png': { status: 'ready' } });
		});

		it('error load states keep their message verbatim', () => {
			session.setTextureLoadState('/bad.png', {
				status: 'error',
				message: 'Texture image failed to load: /bad.png'
			});
			expect(session.textureLoadStates['/bad.png']).toEqual({
				status: 'error',
				message: 'Texture image failed to load: /bad.png'
			});
		});

		it('setPendingMaterialEdit stores and clears the request without touching other slots', () => {
			session.setPendingFramePlacementIds(['p-1']);
			const before = session.pendingFrameVersion;
			session.setPendingMaterialEdit({
				entityId: 'm-1',
				needsBaseMaterial: true,
				sharedMaterialInstanceId: null,
				patch: { baseTextureId: 't-wall' },
				recentTextureId: null
			});
			expect(session.pendingMaterialEdit?.entityId).toBe('m-1');
			expect(session.pendingFramePlacementIds).toEqual(['p-1']);
			expect(session.pendingFrameVersion).toBe(before);
			session.setPendingMaterialEdit(null);
			expect(session.pendingMaterialEdit).toBe(null);
		});
	});
});

describe('EditorSessionState — Phase 1a follow-up scaleVector memory', () => {
	function build() {
		return new EditorSessionState();
	}

	it('returns null when no vector has been stashed', () => {
		const session = build();
		expect(session.getPlacementScaleVector('p-1')).toBeNull();
	});

	it('stashes and reads back an independent vector; bumps the version counter', () => {
		const session = build();
		const before = session.placementScaleVectorVersion;
		session.setPlacementScaleVector('p-1', [5, 3, 0.05]);
		expect(session.getPlacementScaleVector('p-1')).toEqual([5, 3, 0.05]);
		expect(session.placementScaleVectorVersion).toBeGreaterThan(before);
	});

	it('clears the entry when passed null', () => {
		const session = build();
		session.setPlacementScaleVector('p-1', [5, 3, 0.05]);
		session.setPlacementScaleVector('p-1', null);
		expect(session.getPlacementScaleVector('p-1')).toBeNull();
	});

	it('skips the version bump when the new vector is identical (within 1e-6)', () => {
		const session = build();
		session.setPlacementScaleVector('p-1', [5, 3, 0.05]);
		const before = session.placementScaleVectorVersion;
		session.setPlacementScaleVector('p-1', [5, 3, 0.05]);
		expect(session.placementScaleVectorVersion).toBe(before);
	});

	it('clearAllPlacementScaleVectors drops every entry + bumps version once', () => {
		const session = build();
		session.setPlacementScaleVector('p-1', [5, 3, 0.05]);
		session.setPlacementScaleVector('p-2', [2, 2, 0.1]);
		const before = session.placementScaleVectorVersion;
		session.clearAllPlacementScaleVectors();
		expect(session.getPlacementScaleVector('p-1')).toBeNull();
		expect(session.getPlacementScaleVector('p-2')).toBeNull();
		expect(session.placementScaleVectorVersion).toBeGreaterThan(before);
	});
});
