import { describe, expect, it } from 'vitest';

import {
	EditorSelectionStore,
	navigationSelectionFromState
} from '$lib/editor/store/selection-store.svelte';
import { EditorSessionState } from '$lib/editor/store/session-state.svelte';

describe('EditorSelectionStore', () => {
	it('delegates tree expansion to its bound session', () => {
		const selection = new EditorSelectionStore();
		const session = new EditorSessionState();
		selection.bindSession(session);

		expect(selection.expandRoom('music-chamber')).toBe(true);
		expect(selection.expandCluster('cluster-1')).toBe(true);
		expect(selection.expandCameraConnection('connection-1')).toBe(true);
		expect(selection.expandCameraDirection('connection-1', 'reverse')).toBe(true);

		expect(session.treeExpandedRoomIds).toContain('music-chamber');
		expect(session.treeExpandedClusterIds).toContain('cluster-1');
		expect(session.treeExpandedCameraConnectionIds).toContain('connection-1');
		expect(session.treeExpandedCameraDirectionKeys).toContain('connection-1::reverse');
	});

	it('setNavigation(connection) mirrors connectionId and direction into discovery', () => {
		const selection = new EditorSelectionStore();
		selection.setNavigation({
			kind: 'connection',
			connectionId: 'c1',
			direction: 'reverse'
		});
		expect(selection.discoveryConnectionId).toBe('c1');
		expect(selection.discoveryDirection).toBe('reverse');
		expect(selection.navigation).toEqual({
			kind: 'connection',
			connectionId: 'c1',
			direction: 'reverse'
		});
	});

	it('setNavigation(anchor) preserves discovery direction', () => {
		const selection = new EditorSelectionStore();
		selection.setDiscovery('c1', 'reverse');
		selection.setNavigation({
			kind: 'anchor',
			connectionId: 'c1',
			anchorId: 'a1'
		});
		expect(selection.discoveryConnectionId).toBe('c1');
		expect(selection.discoveryDirection).toBe('reverse');
	});

	it('setNavigation(view-keyframe) mirrors direction into discovery', () => {
		const selection = new EditorSelectionStore();
		selection.setNavigation({
			kind: 'view-keyframe',
			connectionId: 'c1',
			direction: 'reverse',
			keyframeId: 'k1'
		});
		expect(selection.discoveryConnectionId).toBe('c1');
		expect(selection.discoveryDirection).toBe('reverse');
	});

	it('setNavigation(node|none) clears discovery', () => {
		const selection = new EditorSelectionStore();
		selection.setNavigation({
			kind: 'connection',
			connectionId: 'c1',
			direction: 'reverse'
		});
		selection.setNavigation({ kind: 'node', nodeId: 'n1', handle: 'position' });
		expect(selection.discoveryConnectionId).toBeNull();
		expect(selection.discoveryDirection).toBe('forward');

		selection.setNavigation({
			kind: 'connection',
			connectionId: 'c1',
			direction: 'reverse'
		});
		selection.setNavigation({ kind: 'none' });
		expect(selection.discoveryConnectionId).toBeNull();
	});

	it('setWorkspace with real placement clears nav and discovery', () => {
		const selection = new EditorSelectionStore();
		selection.setNavigation({
			kind: 'connection',
			connectionId: 'c1',
			direction: 'reverse'
		});
		selection.setWorkspace({
			kind: 'placement',
			ids: ['p1'],
			clusterId: null,
			roomId: 'paris'
		});
		expect(selection.navigation).toEqual({ kind: 'none' });
		expect(selection.discoveryConnectionId).toBeNull();
		expect(selection.discoveryDirection).toBe('forward');
	});

	it('setWorkspace room-only (empty placement) does not clear nav', () => {
		const selection = new EditorSelectionStore();
		selection.setNavigation({
			kind: 'node',
			nodeId: 'n1',
			handle: 'position'
		});
		selection.setWorkspace({
			kind: 'placement',
			ids: [],
			clusterId: null,
			roomId: 'paris'
		});
		expect(selection.navigation).toEqual({
			kind: 'node',
			nodeId: 'n1',
			handle: 'position'
		});
	});

	it('setWorkspace(cluster) clears nav', () => {
		const selection = new EditorSelectionStore();
		selection.setNavigation({
			kind: 'node',
			nodeId: 'n1',
			handle: 'position'
		});
		selection.setWorkspace({
			kind: 'cluster',
			clusterId: 'cl1',
			roomId: 'paris'
		});
		expect(selection.navigation).toEqual({ kind: 'none' });
	});

	it('setNavigation non-none clears placement pick but keeps room', () => {
		const selection = new EditorSelectionStore();
		selection.setWorkspace({
			kind: 'placement',
			ids: ['p1'],
			clusterId: null,
			roomId: 'paris'
		});
		selection.setNavigation({
			kind: 'connection',
			connectionId: 'c1',
			direction: 'forward'
		});
		expect(selection.workspace).toEqual({
			kind: 'placement',
			ids: [],
			clusterId: null,
			roomId: 'paris'
		});
	});

	it('setDiscovery(non-null) clears placement pick but keeps room', () => {
		const selection = new EditorSelectionStore();
		selection.setWorkspace({
			kind: 'placement',
			ids: ['p1'],
			clusterId: null,
			roomId: 'paris'
		});
		selection.setDiscovery('c1', 'reverse');
		expect(selection.workspace).toEqual({
			kind: 'placement',
			ids: [],
			clusterId: null,
			roomId: 'paris'
		});
		expect(selection.discoveryConnectionId).toBe('c1');
		expect(selection.discoveryDirection).toBe('reverse');
	});

	// P7.1 — the read adapter moved off the facade into this module; pin its
	// contract: direction dropped on read (discovery owns it, H1 s4), all
	// other kinds round-trip exactly.
	it('navigationSelectionFromState drops direction on connection reads', () => {
		const selection = new EditorSelectionStore();
		selection.setNavigation({
			kind: 'connection',
			connectionId: 'c1',
			direction: 'reverse'
		});
		expect(navigationSelectionFromState(selection.navigation)).toEqual({
			kind: 'connection',
			connectionId: 'c1'
		});
	});

	it('navigationSelectionFromState round-trips none / node / anchor / view-keyframe', () => {
		const selection = new EditorSelectionStore();
		selection.setNavigation({ kind: 'none' });
		expect(navigationSelectionFromState(selection.navigation)).toBeNull();

		selection.setNavigation({ kind: 'node', nodeId: 'n1', handle: 'position' });
		expect(navigationSelectionFromState(selection.navigation)).toEqual({
			kind: 'node',
			nodeId: 'n1',
			handle: 'position'
		});

		selection.setNavigation({ kind: 'anchor', connectionId: 'c1', anchorId: 'a1' });
		expect(navigationSelectionFromState(selection.navigation)).toEqual({
			kind: 'anchor',
			connectionId: 'c1',
			anchorId: 'a1'
		});

		selection.setNavigation({
			kind: 'view-keyframe',
			connectionId: 'c1',
			direction: 'forward',
			keyframeId: 'k1'
		});
		expect(navigationSelectionFromState(selection.navigation)).toEqual({
			kind: 'view-keyframe',
			connectionId: 'c1',
			direction: 'forward',
			keyframeId: 'k1'
		});
	});
});
