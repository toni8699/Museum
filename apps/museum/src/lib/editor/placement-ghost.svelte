<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { useTask, useThrelte } from '@threlte/core';
	import {
		BufferAttribute,
		BufferGeometry,
		LineBasicMaterial,
		LineSegments,
		type Object3D,
		Raycaster,
		Vector2
	} from 'three';
	import {
		box3CornersToLineGeometry,
		localCornersInto
	} from './obb-util';
	import {
		computeGhostTransform,
		computePrototypeBox3,
		getGhostColorForReason,
		isValidGhostPlacement,
		type PlacementGhostPrototype
	} from './placement-ghost';
	import type { MuseumEditorStore } from './museum-editor.svelte';
	import { getAssetById } from '$lib/content/assets';
	import type { MuseumRoomId, Vec3 } from '$lib/types/museum';
	import type { ScenePrimitiveDimensions, ScenePrimitiveKind } from '$lib/content/scene';

	let { store }: { store: MuseumEditorStore } = $props();

	const { scene, camera: threlteCamera, invalidate, dom } = useThrelte();
	const raycaster = new Raycaster();
	const pointer = new Vector2();

	const primitiveDefaults = new Map<
		'box' | 'plane' | 'cylinder' | 'sphere',
		ScenePrimitiveDimensions
	>([
		['box', { width: 1, height: 1, depth: 1 }],
		['plane', { width: 2, height: 2 }],
		['cylinder', { radius: 0.5, height: 1 }],
		['sphere', { radius: 0.5 }]]
	);

	function dimensionsForKind(kind: ScenePrimitiveKind): ScenePrimitiveDimensions {
		return primitiveDefaults.get(kind) ?? { width: 1, height: 1, depth: 1 };
	}

	function buildPrototype(): PlacementGhostPrototype | null {
		const primKind = store.pendingPlacementPrimitiveKind;
		if (primKind) {
			return {
				primitiveKind: primKind,
				dimensions: dimensionsForKind(primKind),
				assetBounds: null,
				defaultRotation: [0, 0, 0],
				defaultScaleScalar: 1,
				defaultScaleVector: null,
				scaleMode: 'uniform',
				defaultYOffset: 0
			};
		}
		const assetId = store.pendingPlacementAssetId;
		if (!assetId) return null;
		const asset = getAssetById(assetId);
		if (!asset) return null;
		// `MuseumAsset` doesn't carry authoritative bounds; the renderer derives
		// them from the cached GLTF. Default to a 1×1×1 placeholder so the ghost
		// OBB is visible before the asset's first on-mount.
		const bounds: Vec3 = [1, 1, 1];
		return {
			primitiveKind: 'model',
			dimensions: null,
			assetBounds: bounds,
			defaultRotation: (asset.defaultRotation ?? [0, 0, 0]) as Vec3,
			defaultScaleScalar: asset.defaultScale ?? 1,
			defaultScaleVector: null,
			scaleMode: 'uniform',
			defaultYOffset: 0
		};
	}

	const isPreviewActive = $derived(store.cameraPreview !== null);
	const activePrototype = $derived(buildPrototype());

	let ghost: LineSegments | null = null;
	let material: LineBasicMaterial | null = null;
	let geometry: BufferGeometry | null = null;
	let positionBuffer: Float32Array | null = null;
	let lastPrototypeRef: PlacementGhostPrototype | null = null;

	function buildGhost(prototype: PlacementGhostPrototype) {
		disposeGhost();
		const box = computePrototypeBox3(prototype, primitiveDefaults);
		const { indices, initialFloats } = box3CornersToLineGeometry(box);
		positionBuffer = initialFloats;
		const positionAttribute = new BufferAttribute(initialFloats, 3);
		const geom = new BufferGeometry();
		geom.setAttribute('position', positionAttribute);
		geom.setIndex(new BufferAttribute(indices, 1));
		const mat = new LineBasicMaterial({
			color: 0x88ddff,
			depthTest: false,
			transparent: true,
			fog: false,
			linewidth: 1,
			opacity: 0.55
		});
		const ls = new LineSegments(geom, mat);
		ls.renderOrder = 2000;
		ls.frustumCulled = false;
		ls.raycast = () => null;
		ls.userData.role = 'placement-ghost';
		ls.visible = false;
		geometry = geom;
		material = mat;
		ghost = ls;
		lastPrototypeRef = prototype;
	}

	function disposeGhost() {
		if (ghost) ghost.removeFromParent();
		if (material) material.dispose();
		if (geometry) geometry.dispose();
		ghost = null;
		material = null;
		geometry = null;
		positionBuffer = null;
		lastPrototypeRef = null;
	}

	$effect(() => {
		const prototype = activePrototype;
		if (!prototype) {
			disposeGhost();
			return;
		}
		if (!ghost || lastPrototypeRef !== prototype) {
			buildGhost(prototype);
			invalidate();
		}
	});

	let latestPointerEvent: PointerEvent | null = null;
	function onPointerMove(event: PointerEvent) {
		latestPointerEvent = event;
	}
	function onKeyDown(event: KeyboardEvent) {
		if (event.key !== 'Escape') return;
		if (store.pendingPlacementPrimitiveKind || store.pendingPlacementAssetId) {
			store.cancelPrimitivePlacement();
			event.stopImmediatePropagation();
		}
	}

	onMount(() => {
		window.addEventListener('pointermove', onPointerMove, true);
		window.addEventListener('keydown', onKeyDown, true);
	});

	onDestroy(() => {
		if (typeof window !== 'undefined') {
			window.removeEventListener('pointermove', onPointerMove, true);
			window.removeEventListener('keydown', onKeyDown, true);
		}
		disposeGhost();
	});

	/**
	 * Walk the scene tree and return every `userData.editorSurface.type === 'floor'`
	 * mesh. We re-walk on each task to handle lazy room mounts; the tree is small
	 * enough that the linear walk is essentially free.
	 */
	function collectFloorTargets(): Object3D[] {
		const out: Object3D[] = [];
		scene.traverse((child) => {
			const surface = (child as Object3D).userData?.editorSurface as
				| { type: string; placeable: boolean }
				| undefined;
			if (surface?.type === 'floor' && surface.placeable) out.push(child);
		});
		return out;
	}

	function projectCursorToFloor():
		| { point: Vec3; roomId: MuseumRoomId | null }
		| null {
		const target = dom as HTMLElement | undefined;
		if (!target) return null;
		const event = latestPointerEvent;
		if (!event) return null;
		const rect = target.getBoundingClientRect();
		if (rect.width === 0 || rect.height === 0) return null;
		const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		const ny = -((event.clientY - rect.top) / rect.height) * 2 + 1;
		pointer.set(nx, ny);
		const cam = threlteCamera.current as unknown as Parameters<
			typeof raycaster.setFromCamera
		>[1];
		raycaster.setFromCamera(pointer, cam);
		const floors = collectFloorTargets();
		if (floors.length === 0) {
			// Fallback to ground plane so ghost still tracks at y=0.
			const groundHit = raycaster.intersectObject(scene, true)[0];
			return groundHit
				? { point: [groundHit.point.x, groundHit.point.y, groundHit.point.z], roomId: null }
				: null;
		}
		const intersections = raycaster.intersectObjects(floors, false);
		for (const hit of intersections) {
			let cursor: Object3D | null = hit.object;
			while (cursor) {
				const surface = cursor.userData?.editorSurface as
					| { type: string; placeable: boolean; roomId?: string }
					| undefined;
				if (surface?.type === 'floor' && surface.placeable && surface.roomId) {
					return {
						point: [hit.point.x, hit.point.y, hit.point.z],
						roomId: surface.roomId as MuseumRoomId
					};
				}
				cursor = cursor.parent;
			}
		}
		return null;
	}

	useTask(() => {
		const prototype = activePrototype;
		if (!prototype || !ghost || !geometry || !material) return;

		if (isPreviewActive) {
			if (ghost.parent !== null) ghost.removeFromParent();
			return;
		}

		const hit = projectCursorToFloor();
		const validation = isValidGhostPlacement(hit, store.selectedRoomId);
		const ghostMatrix = computeGhostTransform(hit, prototype);

		if (ghost.parent === null) scene.add(ghost);

		const localBox = computePrototypeBox3(prototype, primitiveDefaults);
		if (positionBuffer && positionBuffer.length >= 24) {
			localCornersInto(ghostMatrix, localBox, positionBuffer);
			(geometry.attributes.position as BufferAttribute).needsUpdate = true;
		}
		material.color.setHex(getGhostColorForReason(validation.reason));
		material.opacity = validation.isValid ? 0.6 : validation.reason === 'no-floor' ? 0.3 : 0.45;
		ghost.visible = !isPreviewActive;

		invalidate();
	});
</script>
