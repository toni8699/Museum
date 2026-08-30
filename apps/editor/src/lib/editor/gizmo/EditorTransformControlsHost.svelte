<script lang="ts">
	import { getContext, onDestroy } from 'svelte';
	import { useThrelte } from '@threlte/core';
	import { useOrbitControls } from '@threlte/extras';
	import { TransformControls as ThreeTransformControls } from 'three/examples/jsm/controls/TransformControls.js';
	import type { EditorInteractionStore } from '../store/editor-interaction-store.svelte';
	import { EDITOR_INTERACTION_STORE_KEY } from '../store/editor-interaction-store.svelte';
	import type { EditorStore } from '../editor-store.svelte';
	import type { EditorGizmoTargetAdapter } from './editor-gizmo-contract';
	import {
		EditorGizmoHostController,
		type EditorGizmoHostControls
	} from './editor-gizmo-host-controller';
	import { applyEditorGizmoPalette } from '../styles/scene-palette';

	let {
		store,
		adapter,
		controls = $bindable(),
		controller = $bindable()
	}: {
		store: EditorStore;
		/** One nullable target adapter; the composer resolves it each derive. */
		adapter: EditorGizmoTargetAdapter | null;
		controls?: ThreeTransformControls;
		controller?: EditorGizmoHostController | null;
	} = $props();

	const { scene, camera: threlteCamera, dom, invalidate } = useThrelte();
	const editorOrbitControls = useOrbitControls();
	const interactionStore = getContext<EditorInteractionStore | undefined>(
		EDITOR_INTERACTION_STORE_KEY
	);

	// this component is the ONE TransformControls owner: constructor,
	// helper, and disposer live only here.
	const transformControls = new ThreeTransformControls(threlteCamera.current, dom);
	const transformHelper = transformControls.getHelper();
	// P3.2 — cosmetic only: map TransformControls' default primary axis
	// materials onto the canonical §8 tokens (geometry/pickers untouched).
	applyEditorGizmoPalette(transformHelper);
	scene.add(transformHelper);
	controls = transformControls;

	// Bridge the real controls onto the structural controller surface (the
	// single documented cast — the controller is typed for fake-host tests).
	const host = new EditorGizmoHostController({
		controls: transformControls as unknown as EditorGizmoHostControls,
		getOrbit: () => editorOrbitControls.current ?? null,
		getMode: () => interactionStore?.mode ?? store.transformMode,
		getSnapPreferences: () => ({
			translationSnap: store.translationSnap,
			rotationSnapDegrees: store.rotationSnapDegrees,
			scaleSnap: store.scaleSnap,
			translationSnapEnabled: store.translationSnapEnabled,
			rotationSnapEnabled: store.rotationSnapEnabled
		}),
		dispatch: (event) => interactionStore?.dispatch(event),
		recomputeCursor: (dragging) => interactionStore?.recomputeCursor(dragging),
		invalidate
	});
	controller = host;

	$effect(() => {
		// Camera replacement updates controls.camera without recreating controls.
		transformControls.camera = threlteCamera.current;
	});

	$effect(() => {
		// Target changes detach first (the controller cancels any live session
		// with 'target-change' before detaching).
		host.setAdapter(adapter ?? null);
	});

	$effect(() => {
		// Mode / snap preference changes reapply the active policy without
		// churning the attached proxy.
		void interactionStore?.mode;
		void store.transformMode;
		void store.translationSnap;
		void store.translationSnapEnabled;
		void store.rotationSnapEnabled;
		void store.rotationSnapDegrees;
		void store.scaleSnap;
		host.refreshConfiguration();
	});

	const onMouseDown = () => host.onControlsMouseDown();
	const onObjectChange = () => host.onControlsObjectChange(transformControls.axis);
	const onMouseUp = () => host.onControlsMouseUp();
	const onDraggingChanged = (event: { value: unknown }) =>
		host.onDraggingChanged(event.value);
	const onChange = () => invalidate();

	transformControls.addEventListener('mouseDown', onMouseDown);
	transformControls.addEventListener('objectChange', onObjectChange);
	transformControls.addEventListener('mouseUp', onMouseUp);
	transformControls.addEventListener('dragging-changed', onDraggingChanged);
	transformControls.addEventListener('change', onChange);

	function onKeyDown(event: KeyboardEvent) {
		if (host.onKeyDown({ key: event.key })) {
			event.preventDefault();
			event.stopImmediatePropagation();
		}
	}
	function onKeyUp(event: KeyboardEvent) {
		host.onKeyUp({ key: event.key });
		host.onSnapModifierChange(event);
	}
	function onWindowBlur() {
		host.onWindowBlur();
	}

	$effect(() => {
		// Host owns the canceler seam + window listeners and tears them down
		// exactly once.
		store.setTransformCanceler(() => host.cancelSession('external-replacement'));
		window.addEventListener('keydown', onKeyDown, true);
		window.addEventListener('keyup', onKeyUp);
		window.addEventListener('blur', onWindowBlur);
		return () => {
			store.setTransformCanceler(null);
			window.removeEventListener('keydown', onKeyDown, true);
			window.removeEventListener('keyup', onKeyUp);
			window.removeEventListener('blur', onWindowBlur);
		};
	});

	onDestroy(() => {
		host.dispose();
		transformControls.removeEventListener('mouseDown', onMouseDown);
		transformControls.removeEventListener('objectChange', onObjectChange);
		transformControls.removeEventListener('mouseUp', onMouseUp);
		transformControls.removeEventListener('dragging-changed', onDraggingChanged);
		transformControls.removeEventListener('change', onChange);
		transformHelper.removeFromParent();
		transformControls.dispose();
		controls = undefined;
	});
</script>