<script lang="ts">
	import { onDestroy } from 'svelte';
	import { useThrelte } from '@threlte/core';
	import { TransformControls } from '@threlte/extras';
	import { Group, Matrix4 } from 'three';
	import type { TransformControls as ThreeTransformControls } from 'three/examples/jsm/controls/TransformControls.js';
	import {
		applyRigidPivotDelta,
		captureMemberTransformBaselines,
		resetSessionPivot,
		snapPivotRoomLocal,
		type MemberTransformBaseline
	} from './editor-cluster-transform';
	import { groundSelectionRigidly, rotationSnapRadians } from './editor-placement';
	import { enforceUniformObjectScale, placementTransformFromObject } from './editor-transform';
	import type { MuseumEditorStore } from './museum-editor.svelte';

	let {
		store,
		controls = $bindable()
	}: {
		store: MuseumEditorStore;
		controls?: ThreeTransformControls;
	} = $props();

	const { scene } = useThrelte();
	const pivot = new Group();
	pivot.name = 'EditorSelectionPivot';
	pivot.userData.editorEntity = 'selection-pivot';
	scene.add(pivot);

	type TransformSession = {
		startPivotWorldMatrix: Matrix4;
		members: MemberTransformBaseline[];
	};

	let session: TransformSession | null = null;
	let shiftHeld = $state(false);
	const selectedRoots = $derived(store.getPlacementRoots());
	const effectiveRotationSnap = $derived(
		store.rotationSnapEnabled && !shiftHeld
			? rotationSnapRadians(store.rotationSnapDegrees)
			: null
	);

	$effect(() => {
		void store.selectionKey;
		void store.registryVersion;
		void store.historyVersion;
		if (session) return;
		resetSessionPivot(pivot, selectedRoots);
	});

	function beginTransform() {
		const ids = [...store.selectedPlacementIds];
		const roots = store.getPlacementRoots(ids);
		if (ids.length === 0 || roots.length !== ids.length) return;
		pivot.updateMatrixWorld(true);
		if (!store.beginDocumentTransaction()) return;
		session = {
			startPivotWorldMatrix: pivot.matrixWorld.clone(),
			members: captureMemberTransformBaselines(ids, roots)
		};
	}

	function previewTransform() {
		const active = session;
		if (!active) return;

		if (store.transformMode === 'scale') {
			enforceUniformObjectScale(pivot, controls?.axis ?? null);
		}
		if (store.transformMode === 'translate' && store.translationSnapEnabled && !shiftHeld) {
			snapPivotRoomLocal(
				pivot,
				active.members[0]?.root.parent ?? null,
				store.translationSnap,
				!store.keepOnFloor
			);
		}

		pivot.updateMatrixWorld(true);
		const transforms = applyRigidPivotDelta(
			active.startPivotWorldMatrix,
			pivot.matrixWorld,
			active.members
		);
		for (const [id, transform] of transforms) {
			store.updatePlacementTransform(id, transform);
		}
	}

	function finishTransform() {
		const active = session;
		if (!active) return;
		previewTransform();

		if (store.keepOnFloor) {
			const roots = active.members.map((member) => member.root);
			const result = groundSelectionRigidly(roots, [scene]);
			if (!result.grounded) {
				store.setStatusMessage('No floor below selection');
			} else if (result.deltaY !== 0) {
				for (const member of active.members) {
					store.updatePlacementTransform(
						member.id,
						placementTransformFromObject(member.root)
					);
				}
			}
		}

		session = null;
		store.commitDocumentTransaction();
		resetSessionPivot(pivot, store.getPlacementRoots());
	}

	function onKeyDown(event: KeyboardEvent) {
		if (event.key === 'Shift') shiftHeld = true;
	}

	function clearShift() {
		shiftHeld = false;
	}

	$effect(() => {
		window.addEventListener('keydown', onKeyDown);
		window.addEventListener('keyup', clearShift);
		window.addEventListener('blur', clearShift);
		return () => {
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('keyup', clearShift);
			window.removeEventListener('blur', clearShift);
		};
	});

	onDestroy(() => {
		pivot.removeFromParent();
		if (!session) return;
		session = null;
		store.cancelDocumentTransaction();
	});
</script>

{#if selectedRoots.length > 0}
	<TransformControls
		bind:controls
		object={pivot}
		mode={store.transformMode}
		space="world"
		translationSnap={null}
		rotationSnap={effectiveRotationSnap}
		autoPauseControls
		onmouseDown={beginTransform}
		onobjectChange={previewTransform}
		onmouseUp={finishTransform}
	/>
{/if}
