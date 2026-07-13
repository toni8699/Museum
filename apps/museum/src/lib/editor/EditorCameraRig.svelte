<script lang="ts">
	import { T } from '@threlte/core';
	import { OrbitControls } from '@threlte/extras';
</script>

<T.PerspectiveCamera
	makeDefault
	position={[0, 18, 24]}
	fov={50}
	near={0.1}
	far={120}
/>
<OrbitControls
	enableDamping
	target={[0, 1, 0]}
	minDistance={4}
	maxDistance={60}
/>
