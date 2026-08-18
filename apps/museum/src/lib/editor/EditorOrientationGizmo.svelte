<script lang="ts">
	import { useTask, useThrelte } from '@threlte/core';
	import { Vector3 } from 'three';
	import { editorOrientationGizmo } from './editor-orientation-gizmo.svelte';

	// S10.1.7 — non-interactive XYZ orientation indicator. Runs inside the
	// Canvas: each frame it transforms the orbit camera's world axes into
	// camera space and publishes their screen-space directions to the shared
	// module state the HTML overlay reads. Never raycasts, never intercepts
	// pointer events, never renders a mesh into the scene.
	const { camera } = useThrelte();
	const worldAxes = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)];
	const viewAxis = new Vector3();

	useTask(() => {
		const current = camera.current;
		if (!current) return;
		current.updateMatrixWorld();

		// `matrixWorldInverse` maps world → camera space; its upper-left 3x3 is
		// the rotation part, so a world axis direction transforms straight into
		// view space. View-space X is screen-right and view-space Y is screen-up
		// (three.js NDC), so CSS (+y down) only needs the Y sign flipped. The
		// length of the (x, y) pair is exactly how "facing" the axis is — 1 when
		// perpendicular to the view, 0 when it points at/away from the camera.
		const e = current.matrixWorldInverse.elements;
		for (let index = 0; index < worldAxes.length; index += 1) {
			const axis = worldAxes[index];
			viewAxis
				.set(
					e[0] * axis.x + e[4] * axis.y + e[8] * axis.z,
					e[1] * axis.x + e[5] * axis.y + e[9] * axis.z,
					e[2] * axis.x + e[6] * axis.y + e[10] * axis.z
				);
			const length = Math.hypot(viewAxis.x, viewAxis.y);
			const out =
				index === 0
					? editorOrientationGizmo.x
					: index === 1
						? editorOrientationGizmo.y
						: editorOrientationGizmo.z;
			if (length < 1e-6) {
				out.x = 0;
				out.y = 0;
				out.visibility = 0;
				continue;
			}
			out.x = viewAxis.x / length;
			out.y = -viewAxis.y / length;
			out.visibility = Math.min(1, length);
		}
		editorOrientationGizmo.ready = true;
	});
</script>
