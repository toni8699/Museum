import { describe, expect, it } from 'vitest';

import { EditorSelectionStore } from './selection-store.svelte';

describe('EditorSelectionStore', () => {
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
});
