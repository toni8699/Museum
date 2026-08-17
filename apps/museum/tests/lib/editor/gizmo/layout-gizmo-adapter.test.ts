/**
 * S8 step 2 — layout-gizmo-adapter session tests.
 *
 * Drives `createLayoutGizmoAdapter` against a real `MuseumEditorStore` with a
 * registered layout history host + a `LayoutPreviewState` surface, exercising
 * the candidate-session seams: begin refusal, canonical-untouched preview,
 * last-valid retention on an invalid candidate, one atomic install + one
 * `layout` history entry on commit, no-op adds none, every cancel reason
 * restores + no history, and the transient slot cleared on commit/cancel.
 *
 * The invalid-candidate paths use the opening identity: scaling its height
 * past the floor height trips the blocking `opening_over_height` geometry
 * issue (a reliable trigger — translating a rectangle wall never folds it).
 */

import { describe, expect, it } from 'vitest';
import { Object3D } from 'three';
import { createMuseumEditorStore } from '$lib/editor/museum-editor.svelte';
import { createEmptyMuseumProject } from '$lib/project/project-codec';
import { createLayoutRoomRegistry } from '$lib/project/project-layout-semantics';
import {
	captureLayoutPreviewSnapshot,
	commitLayoutDraftRoom,
	commitLayoutOpening,
	createEmptyLayoutPreviewState,
	layoutPreviewCanonicalJson,
	restoreLayoutPreviewSnapshot
} from '$lib/editor/layout/layout-preview-state.svelte';
import {
	createLayoutInteractionState,
	selectLayoutOpening,
	selectLayoutRoom
} from '$lib/editor/layout/layout-interaction';
import {
	resolveLayoutGizmoTarget,
	type LayoutGizmoDelta
} from '$lib/editor/gizmo/layout-gizmo-target';
import {
	applyLayoutSnapPolicy,
	createLayoutGizmoAdapter
} from '$lib/editor/gizmo/layout-gizmo-adapter.svelte';
import type { LayoutGizmoCandidateBundle } from '$lib/editor/gizmo/layout-gizmo-candidate';
import type { LayoutVec2 } from '$lib/layout/layout-types';

const ROOM_POINTS = [
	[0, 0],
	[4, 0],
	[4, 3],
	[0, 3]
] as const;

function setup() {
	const bootProject = createEmptyMuseumProject({
		id: 'project:untitled',
		name: 'Untitled project'
	});
	const store = createMuseumEditorStore({
		document: bootProject.scene,
		rooms: createLayoutRoomRegistry(bootProject.layout)
	});
	const layoutPreview = createEmptyLayoutPreviewState();
	const layoutInteraction = createLayoutInteractionState();
	store.registerLayoutHistory({
		capture: () => captureLayoutPreviewSnapshot(layoutPreview),
		replace: (snapshot) =>
			restoreLayoutPreviewSnapshot(
				layoutPreview,
				snapshot as ReturnType<typeof captureLayoutPreviewSnapshot>
			),
		matches: (a, b) =>
			JSON.stringify((a as { project: { layout: unknown } }).project.layout) ===
			JSON.stringify((b as { project: { layout: unknown } }).project.layout)
	});
	// Deterministic: no grid snapping unless a test opts in.
	layoutInteraction.planView.snapEnabled = false;
	const committed = commitLayoutDraftRoom(layoutPreview, [...ROOM_POINTS] as LayoutVec2[]);
	if (!committed.success) throw new Error(`room draft failed: ${committed.message}`);
	const roomId = committed.roomId;
	const segmentId = `${roomId}:wall:0`;
	const opening = commitLayoutOpening(layoutPreview, roomId, segmentId, 'door', 1, false);
	if (!opening.success) throw new Error(`opening failed: ${opening.message}`);
	// Default selection: the room (draggable on X/Z).
	selectLayoutRoom(layoutInteraction, roomId);
	const proxy = new Object3D();
	return {
		store,
		layoutPreview,
		layoutInteraction,
		proxy,
		roomId,
		segmentId,
		openingId: opening.openingId
	};
}

function makeAdapter(input: ReturnType<typeof setup>) {
	const descriptor = resolveLayoutGizmoTarget(
		input.layoutPreview.project.layout,
		input.layoutPreview.geometry,
		input.layoutInteraction.selection
	)!;
	const transients: (LayoutGizmoCandidateBundle | null)[] = [];
	const adapter = createLayoutGizmoAdapter({
		store: input.store,
		layoutPreview: input.layoutPreview,
		layoutInteraction: input.layoutInteraction,
		descriptor,
		proxy: input.proxy,
		isShiftHeld: () => false,
		onTransient: (bundle) => transients.push(bundle)
	});
	return { adapter, transients };
}

function moveProxyX(input: ReturnType<typeof setup>, dx: number): void {
	input.proxy.position.x =
		input.proxy.position.x + dx;
	input.proxy.updateMatrixWorld(true);
}

describe('layout-gizmo-adapter — session lifecycle', () => {
	it('refuses begin while a scene document transaction is open (no session, no history)', () => {
		const input = setup();
		const { adapter } = makeAdapter(input);
		// A scene transaction blocks the layout facade → the adapter refuses.
		expect(input.store.beginDocumentTransaction()).toBe(true);
		expect(adapter.begin({ targetKey: adapter.key })).toBeNull();
		expect(input.store.isDocumentTransactionActive).toBe(true); // scene tx still open
		input.store.cancelDocumentTransaction();
	});

	it('preview keeps the canonical layoutPreview untouched and publishes the transient', () => {
		const input = setup();
		const { adapter, transients } = makeAdapter(input);
		const canonicalBefore = layoutPreviewCanonicalJson(input.layoutPreview);
		const session = adapter.begin({ targetKey: adapter.key })!;
		moveProxyX(input, 2);
		session.preview({ targetKey: adapter.key, axis: 'X' });
		expect(transients.at(-1)).not.toBeNull();
		// The committed project never changes during preview.
		expect(layoutPreviewCanonicalJson(input.layoutPreview)).toBe(canonicalBefore);
		expect(input.store.canUndo).toBe(false);
		session.cancel('escape');
	});

	it('commit installs the last-valid candidate atomically + exactly one layout history entry', () => {
		const input = setup();
		const { adapter, transients } = makeAdapter(input);
		const historyBefore = input.store.historyVersion;
		const session = adapter.begin({ targetKey: adapter.key })!;
		moveProxyX(input, 2);
		session.preview({ targetKey: adapter.key, axis: 'X' });
		session.commit({ targetKey: adapter.key });
		expect(input.store.historyVersion).toBe(historyBefore + 1);
		expect(input.store.canUndo).toBe(true);
		expect(input.store.isDocumentTransactionActive).toBe(false);
		// The room moved by +2 on X in the committed document.
		const room = input.layoutPreview.project.layout.floors[0]!.rooms[0]!;
		expect(room.boundary.segments[0]!.start[0]).toBeCloseTo(2);
		expect(room.boundary.segments[0]!.end[0]).toBeCloseTo(6);
		// Transient cleared on commit.
		expect(transients.at(-1)).toBeNull();
	});

	it('retains the last valid bundle when a preview becomes invalid; commit installs the last valid', () => {
		const input = setup();
		selectLayoutOpening(input.layoutInteraction, input.roomId, input.segmentId, input.openingId);
		const { adapter, transients } = makeAdapter(input);
		const session = adapter.begin({ targetKey: adapter.key })!;
		input.proxy.scale.y = 1.2; // height 2.52 < 3 → valid
		session.preview({ targetKey: adapter.key, axis: 'Y' });
		const validTransient = transients.at(-1)!;
		expect(validTransient).not.toBeNull();
		input.proxy.scale.y = 1.5; // height 3.15 > 3 → invalid
		session.preview({ targetKey: adapter.key, axis: 'Y' });
		// The transient stays at the last valid bundle; canonical untouched.
		expect(transients.at(-1)).toBe(validTransient);
		const committedOpening = input.layoutPreview.project.layout.floors[0]!.rooms[0]!.openings[0]!;
		expect(committedOpening.height).toBeCloseTo(2.1);
		session.commit({ targetKey: adapter.key });
		// The committed opening reflects the last valid height (2.52).
		const after = input.layoutPreview.project.layout.floors[0]!.rooms[0]!.openings[0]!;
		expect(after.height).toBeCloseTo(2.52);
	});

	it('surfaces the first blocking issue via the status message and clears it on the next valid frame', () => {
		const input = setup();
		selectLayoutOpening(input.layoutInteraction, input.roomId, input.segmentId, input.openingId);
		const { adapter } = makeAdapter(input);
		const session = adapter.begin({ targetKey: adapter.key })!;
		input.proxy.scale.y = 1.5; // height 3.15 > 3 → invalid
		session.preview({ targetKey: adapter.key, axis: 'Y' });
		expect(input.store.statusMessage).not.toBeNull();
		input.proxy.scale.y = 1.2; // height 2.52 → valid again
		session.preview({ targetKey: adapter.key, axis: 'Y' });
		expect(input.store.statusMessage).toBeNull();
		session.cancel('escape');
	});

	it('a no-op drag (candidate equals baseline) adds no history entry', () => {
		const input = setup();
		const { adapter } = makeAdapter(input);
		const historyBefore = input.store.historyVersion;
		const session = adapter.begin({ targetKey: adapter.key })!;
		// No movement → the candidate equals the baseline document.
		session.preview({ targetKey: adapter.key, axis: 'X' });
		session.commit({ targetKey: adapter.key });
		expect(input.store.historyVersion).toBe(historyBefore);
		expect(input.store.canUndo).toBe(false);
	});

	it('every cancel reason restores the canonical layout and adds no history; transient cleared', () => {
		for (const reason of [
			'escape',
			'pointer-cancel',
			'target-change',
			'view-change',
			'unmount',
			'external-replacement'
		] as const) {
			const input = setup();
			const { adapter, transients } = makeAdapter(input);
			const canonicalBefore = layoutPreviewCanonicalJson(input.layoutPreview);
			const historyBefore = input.store.historyVersion;
			const session = adapter.begin({ targetKey: adapter.key })!;
			moveProxyX(input, 3);
			session.preview({ targetKey: adapter.key, axis: 'X' });
			session.cancel(reason);
			expect(layoutPreviewCanonicalJson(input.layoutPreview)).toBe(canonicalBefore);
			expect(input.store.historyVersion).toBe(historyBefore);
			expect(input.store.canUndo).toBe(false);
			expect(transients.at(-1)).toBeNull();
		}
	});

	it('a commit with no ever-valid candidate behaves as cancel (no history)', () => {
		const input = setup();
		selectLayoutOpening(input.layoutInteraction, input.roomId, input.segmentId, input.openingId);
		const { adapter } = makeAdapter(input);
		const historyBefore = input.store.historyVersion;
		const session = adapter.begin({ targetKey: adapter.key })!;
		input.proxy.scale.y = 1.5; // immediately invalid
		session.preview({ targetKey: adapter.key, axis: 'Y' });
		session.commit({ targetKey: adapter.key });
		expect(input.store.historyVersion).toBe(historyBefore);
		expect(input.store.canUndo).toBe(false);
	});
});

describe('layout-gizmo-adapter — snap policy', () => {
	it('snaps room translation to the 0.25 m grid when enabled and Shift is not held', () => {
		const delta = applyLayoutSnapPolicy(
			{ kind: 'room', translation: [0.13, 0], yaw: 0 },
			{ basePosition: [2, 0, 1.5], snapEnabled: true, angleSnapEnabled: false },
			false
		);
		if (delta.kind !== 'room') throw new Error('expected a room delta');
		// Absolute [2.13, 1.5] snaps to [2.25, 1.5]; the delta is re-derived.
		expect(delta.translation[0]).toBeCloseTo(0.25);
		expect(delta.translation[1]).toBeCloseTo(0);
	});

	it('re-derives the snapped delta from the absolute position so the grid never drifts', () => {
		const delta = applyLayoutSnapPolicy(
			{ kind: 'room', translation: [0.1, 0.1], yaw: 0 },
			{ basePosition: [2.13, 0, 1.43], snapEnabled: true, angleSnapEnabled: false },
			false
		);
		if (delta.kind !== 'room') throw new Error('expected a room delta');
		// Naively snapping the raw delta [0.1, 0.1] would give [0, 0]; the
		// absolute position [2.23, 1.53] snaps to [2.25, 1.5] instead.
		expect(delta.translation[0]).toBeCloseTo(0.12);
		expect(delta.translation[1]).toBeCloseTo(0.07);
	});

	it('snaps room rotation to 15° and bypasses translation snap when Shift is held', () => {
		const delta = applyLayoutSnapPolicy(
			{ kind: 'room', translation: [1, 0], yaw: 0.3 },
			{ basePosition: [0, 0, 0], snapEnabled: true, angleSnapEnabled: true },
			true
		);
		if (delta.kind !== 'room') throw new Error('expected a room delta');
		expect(delta.translation).toEqual([1, 0]);
		expect(delta.yaw).toBeCloseTo(Math.PI / 12);
	});

	it('leaves room translation and yaw raw when snapping is disabled', () => {
		const delta = applyLayoutSnapPolicy(
			{ kind: 'room', translation: [0.13, 0.07], yaw: 0.3 },
			{ basePosition: [0, 0, 0], snapEnabled: false, angleSnapEnabled: true },
			false
		);
		if (delta.kind !== 'room') throw new Error('expected a room delta');
		expect(delta.translation).toEqual([0.13, 0.07]);
		expect(delta.yaw).toBe(0.3);
	});

	it('leaves non-room deltas untouched', () => {
		const wall: LayoutGizmoDelta = { kind: 'wall', translation: [0.13, 0.07] };
		const out = applyLayoutSnapPolicy(
			wall,
			{ basePosition: [0, 0, 0], snapEnabled: true, angleSnapEnabled: true },
			true
		);
		expect(out).toBe(wall);
	});
});
