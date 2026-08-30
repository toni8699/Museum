import * as THREE from 'three';
import type { CompiledLayoutGeometry } from '$lib/layout/layout-geometry-types';
import { buildRoomWallMesh } from '$lib/layout/wall-mesh-builder';
import { toWallBufferGeometry } from '$lib/render/wall-geometry-adapter';
import type { WallMeshRenderPolicy, WallMeshTopology } from './browser-bench';

/**
 * Live Three.js resource counters for the browser tier. Reads `renderer.info`
 * after a render and builds the real procedural wall-mesh scene (one
 * `BufferGeometry` per room via the G4 builder + adapter) so draw calls and
 * triangles reflect the actual indexed topology, not the retired chord-box
 * approximation.
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

export type WallMeshScene = {
	scene: THREE.Scene;
	/** Topology counts derived from the same generated meshes the scene renders. */
	counts: WallMeshTopology;
	/** Disposes every adapted geometry and material created by this scene. */
	dispose: () => void;
};

/**
 * Build a real wall-mesh scene from compiled geometry under the given render
 * policy: one `IndexedWallMesh` per room wrapped through the adapter, materials
 * shared per distinct tint. It returns no renderer stats — the caller renders
 * the scene and reads `renderer.info` via `readThreeRenderStats`.
 */
export function buildWallMeshScene(compiled: CompiledLayoutGeometry, policy: WallMeshRenderPolicy): WallMeshScene {
	const scene = new THREE.Scene();
	const materials = new Map<string, THREE.Material>();
	const disposers: Array<() => void> = [];

	function materialFor(roomId: string): THREE.Material {
		const tint = policy.presentation[roomId]?.tint ?? '#ffffff';
		let material = materials.get(tint);
		if (!material) {
			material = new THREE.MeshStandardMaterial({ color: tint });
			materials.set(tint, material);
		}
		return material;
	}

	const counts: WallMeshTopology = { objectCount: 0, materialCount: 0, drawCalls: 0, triangles: 0 };
	const excluded = policy.excludedRoomIds ?? [];
	for (const room of compiled.rooms) {
		// Bespoke-shell rooms are skipped before building, matching
		// `estimateWallMeshTopology` and the live `LayoutMuseumShell`, so the
		// live WebGL scene reports the same room/draw/material counts.
		if (excluded.includes(room.roomId)) continue;
		const result = buildRoomWallMesh(room, { classifySurface: policy.classifySurface });
		if (!result.mesh) {
			const details = result.issues.map((issue) => `${issue.code}: ${issue.message}`).join('; ');
			throw new Error(`wall mesh build failed for room ${room.roomId}: ${details}`);
		}
		const adapted = toWallBufferGeometry(result.mesh, (_surfaceKey, mesh) => ({
			material: materialFor(mesh.roomId)
		}));
		const mesh = new THREE.Mesh(adapted.geometry, adapted.materials);
		mesh.matrixAutoUpdate = false;
		scene.add(mesh);
		counts.objectCount += 1;
		counts.drawCalls += result.mesh.materialGroups.length;
		counts.triangles += result.mesh.indices.length / 3;
		disposers.push(() => adapted.dispose());
	}
	counts.materialCount = materials.size;

	return {
		scene,
		counts,
		dispose: () => {
			for (const dispose of disposers) dispose();
			for (const material of materials.values()) material.dispose();
		}
	};
}
