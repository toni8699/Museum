import { describe, expect, it } from 'vitest';

import { cloneResolvedCameraRoute } from '$lib/editor/helpers/route-clone';
import type { ResolvedCameraRoute } from '@portfolio/camera-core';

function routeWithEnvelope(): ResolvedCameraRoute {
	return {
		positionParts: [{ kind: 'auto-bezier', anchors: [[0, 0, 0], [1, 0, 0]] }],
		targetPoints: [[0, 1, 0], [1, 1, 0]],
		nodeIds: ['a', 'b'],
		edges: [{
			connectionId: 'a-b',
			direction: 'forward',
			fromNodeId: 'a',
			toNodeId: 'b',
			positionSpan: {
				start: { partIndex: 0, pointIndex: 0 },
				end: { partIndex: 0, pointIndex: 1 }
			},
			viewTrack: {
				start: { cameraTarget: [0, 1, 0], fov: 54 },
				keyframes: [],
				end: { cameraTarget: [1, 1, 0], fov: 48 },
				framingEnvelope: { enterStart: 0.1, enterEnd: 0.25, exitStart: 0.8, exitEnd: 1 }
			}
		}]
	};
}

describe('cloneResolvedCameraRoute', () => {
	it('preserves framing envelopes without aliasing the source', () => {
		const source = routeWithEnvelope();
		const clone = cloneResolvedCameraRoute(source);
		expect(clone.edges[0]!.viewTrack?.framingEnvelope).toEqual(
			source.edges[0]!.viewTrack?.framingEnvelope
		);
		expect(clone.edges[0]!.viewTrack?.framingEnvelope).not.toBe(
			source.edges[0]!.viewTrack?.framingEnvelope
		);
		clone.edges[0]!.viewTrack!.framingEnvelope!.enterStart = 0.6;
		expect(source.edges[0]!.viewTrack?.framingEnvelope?.enterStart).toBe(0.1);
	});

	it('keeps an absent framing envelope absent', () => {
		const source = routeWithEnvelope();
		delete source.edges[0]!.viewTrack!.framingEnvelope;
		expect(cloneResolvedCameraRoute(source).edges[0]!.viewTrack).not.toHaveProperty(
			'framingEnvelope'
		);
	});
});
