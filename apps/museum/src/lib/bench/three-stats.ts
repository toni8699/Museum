import * as THREE from 'three';
import type { CompiledLayoutGeometry } from '$lib/layout/layout-geometry-types';

/**
 * Live Three.js resource counters for the browser tier. Reads
 * `renderer.info` after a render and builds the current chord-box scene (one
 * box per compiled solid span, matching the editor/visitor adapters) so draw
 * calls and triangles reflect the real chord-box debt G4 targets.
 */

export type ThreeRenderStats = {
	drawCalls: number;
	triangles: number;
	lines: number;
	points: number;
	geometries: number;
	textures: number;
	programs: number;
};

export function readThreeRenderStats(renderer: THREE.WebGLRenderer): ThreeRenderStats {
	const render = renderer.info.render;
	const memory = renderer.info.memory;
	return {
		drawCalls: render.calls,
		triangles: render.triangles,
		lines: render.lines,
		points: render.points,
		geometries: memory.geometries,
		textures: memory.textures,
		programs: renderer.info.programs?.length ?? 0
	};
}

export type ChordBoxScene = {
	scene: THREE.Scene;
	meshCount: number;
	materialCount: number;
	spanCount: number;
	/** Estimated triangles for the chord-box scene (12 per box). */
	triangleEstimate: number;
};

/**
 * Build a chord-box scene from compiled solid spans. Each span is an axis-aligned
 * box from `span.start`/`span.end` (plan XZ) and `span.bottomY`/`span.topY`. This
 * mirrors the G1 chord-box adapter shape so object/material counts are real.
 */
export function buildChordBoxScene(compiled: CompiledLayoutGeometry, maxMeshes = 40_000): ChordBoxScene {
	const scene = new THREE.Scene();
	const materials = new Map<string, THREE.Material>();
	let meshCount = 0;
	let spanCount = 0;
	let truncated = false;

	for (const room of compiled.rooms) {
		let material = materials.get(room.roomId);
		if (!material) {
			material = new THREE.MeshBasicMaterial();
			materials.set(room.roomId, material);
		}
		for (const wall of room.walls) {
			for (const span of wall.solidSpans) {
				spanCount += 1;
				if (meshCount >= maxMeshes) {
					truncated = true;
					continue;
				}
				const midX = (span.start[0] + span.end[0]) / 2;
				const midZ = (span.start[1] + span.end[1]) / 2;
				const length = Math.hypot(span.end[0] - span.start[0], span.end[1] - span.start[1]);
				const height = Math.max(0.001, span.topY - span.bottomY);
				const geometry = new THREE.BoxGeometry(length, height, wall.thickness);
				const mesh = new THREE.Mesh(geometry, material);
				mesh.position.set(midX, (span.topY + span.bottomY) / 2, midZ);
				const angle = Math.atan2(span.end[1] - span.start[1], span.end[0] - span.start[0]);
				mesh.rotation.y = -angle;
				scene.add(mesh);
				meshCount += 1;
			}
		}
	}

	return {
		scene,
		meshCount: truncated ? meshCount : meshCount,
		materialCount: materials.size,
		spanCount,
		triangleEstimate: spanCount * 12
	};
}
