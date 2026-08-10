<script lang="ts">
	import { getContext } from 'svelte';
	import EditorNumberField from './EditorNumberField.svelte';
	import {
		degreesToRadians,
		MIN_PLACEMENT_SCALE,
		radiansToDegrees,
		type PlacementTransform
	} from './editor-transform';
	import type { ScaleMode } from './scale-vector';
	import type { Vec3 } from '$lib/types/museum';
	import type { MuseumEditorStore } from './museum-editor.svelte';
	import {
		EDITOR_INTERACTION_STORE_KEY,
		type EditorInteractionStore
	} from './store/editor-interaction-store.svelte';

	let { store }: { store: MuseumEditorStore } = $props();

	const interactionStore = getContext<EditorInteractionStore | undefined>(
		EDITOR_INTERACTION_STORE_KEY
	);
	const scaleMode = $derived<ScaleMode>(interactionStore?.scaleMode ?? 'uniform');

	const selectedObject = $derived(store.selectedObject);
	const transform = $derived(store.selectedTransform);

	function commitTransform(next: PlacementTransform) {
		const id = selectedObject?.id;
		if (!id) return;
		store.commitPlacementTransform(id, next);
	}

	function setPosition(index: 0 | 1 | 2, value: number) {
		if (!transform) return;
		const next: PlacementTransform = {
			...transform,
			position: [...transform.position],
			rotation: [...transform.rotation]
		};
		next.position[index] = value;
		commitTransform(next);
	}

	function setRotation(index: 0 | 1 | 2, degrees: number) {
		if (!transform) return;
		const next: PlacementTransform = {
			...transform,
			position: [...transform.position],
			rotation: [...transform.rotation]
		};
		next.rotation[index] = degreesToRadians(degrees);
		commitTransform(next);
	}

	function setUniformScale(value: number) {
		if (!transform) return;
		commitTransform({
			...transform,
			position: [...transform.position],
			rotation: [...transform.rotation],
			scale: value,
			scaleScalar: value,
			scaleVector: null,
			scaleMode: 'uniform'
		});
	}

	function setIndependentScale(axis: 0 | 1 | 2, value: number) {
		if (!transform) return;
		const current: Vec3 = transform.scaleVector
			? [...transform.scaleVector]
			: ([transform.scaleScalar, transform.scaleScalar, transform.scaleScalar] as Vec3);
		current[axis] = value;
		const scalar = (current[0] + current[1] + current[2]) / 3;
		commitTransform({
			...transform,
			position: [...transform.position],
			rotation: [...transform.rotation],
			scale: scalar,
			scaleScalar: scalar,
			scaleVector: current,
			scaleMode: 'independent'
		});
	}

	function toggleChain() {
		interactionStore?.toggleScaleMode();
	}
</script>

{#if selectedObject && transform}
	<section class="transform" aria-label="Placement transform">
		<div class="section-heading">
			<h2>Transform</h2>
			<span>Room-local</span>
		</div>

		<div class="axis-legend" aria-label="Gizmo axis colors">
			<span class="x">X</span><span>Red</span>
			<span class="y">Y</span><span>Green</span>
			<span class="z">Z</span><span>Blue</span>
		</div>

		<fieldset>
			<legend>Position (m)</legend>
			<div class="field-grid">
				<EditorNumberField
					label="X"
					value={transform.position[0]}
					step={store.translationSnapEnabled ? store.translationSnap : 0.01}
					oncommit={(value) => setPosition(0, value)}
				/>
				<EditorNumberField
					label="Y"
					value={transform.position[1]}
					step={store.translationSnapEnabled ? store.translationSnap : 0.01}
					oncommit={(value) => setPosition(1, value)}
				/>
				<EditorNumberField
					label="Z"
					value={transform.position[2]}
					step={store.translationSnapEnabled ? store.translationSnap : 0.01}
					oncommit={(value) => setPosition(2, value)}
				/>
			</div>
		</fieldset>

		<fieldset>
			<legend>Rotation (degrees)</legend>
			<div class="field-grid">
				<EditorNumberField
					label="X"
					value={radiansToDegrees(transform.rotation[0])}
					step={store.rotationSnapEnabled ? store.rotationSnapDegrees : 1}
					fractionDigits={2}
					oncommit={(value) => setRotation(0, value)}
				/>
				<EditorNumberField
					label="Y"
					value={radiansToDegrees(transform.rotation[1])}
					step={store.rotationSnapEnabled ? store.rotationSnapDegrees : 1}
					fractionDigits={2}
					oncommit={(value) => setRotation(1, value)}
				/>
				<EditorNumberField
					label="Z"
					value={radiansToDegrees(transform.rotation[2])}
					step={store.rotationSnapEnabled ? store.rotationSnapDegrees : 1}
					fractionDigits={2}
					oncommit={(value) => setRotation(2, value)}
				/>
			</div>
		</fieldset>

		<fieldset>
			<legend>Scale</legend>
			<div class="scale-row">
				<button
					type="button"
					class="scale-toggle"
					aria-pressed={scaleMode === 'independent'}
					aria-label="Toggle uniform / independent scale mode"
					title={
						scaleMode === 'uniform'
							? 'Uniform scale — click to switch to independent (× Y / Z scale separately)'
							: 'Independent scale — click to switch to uniform (single scale across X / Y / Z)'
					}
					disabled={!interactionStore}
					onclick={toggleChain}
				>
				{#if scaleMode === 'uniform'}
					<!-- Locked link: two interlocked C-curves. Atomic — toggling
					     the chain breaks the link so X / Y / Z scale independently. -->
					<svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16">
						<g
							fill="none"
							stroke="currentColor"
							stroke-width="1.8"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
							<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
						</g>
					</svg>
				{:else}
					<!-- Unlocked link: same shape with a slash + visible gap, so
					     the user sees that atomic scale is broken. -->
					<svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16">
						<g
							fill="none"
							stroke="currentColor"
							stroke-width="1.8"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
							<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
						</g>
						<line
							x1="5"
							y1="5"
							x2="19"
							y2="19"
							stroke="currentColor"
							stroke-width="1.8"
							stroke-linecap="round"
						/>
					</svg>
				{/if}
				</button>

				{#if scaleMode === 'uniform'}
					<EditorNumberField
						label="Scale"
						value={transform.scaleScalar}
						step={0.01}
						min={MIN_PLACEMENT_SCALE}
						oncommit={setUniformScale}
					/>
				{:else}
					<div class="field-grid three">
						<EditorNumberField
							label="X"
							value={transform.scaleVector
								? transform.scaleVector[0]
								: transform.scaleScalar}
							step={0.01}
							min={MIN_PLACEMENT_SCALE}
							oncommit={(value) => setIndependentScale(0, value)}
						/>
						<EditorNumberField
							label="Y"
							value={transform.scaleVector
								? transform.scaleVector[1]
								: transform.scaleScalar}
							step={0.01}
							min={MIN_PLACEMENT_SCALE}
							oncommit={(value) => setIndependentScale(1, value)}
						/>
						<EditorNumberField
							label="Z"
							value={transform.scaleVector
								? transform.scaleVector[2]
								: transform.scaleScalar}
							step={0.01}
							min={MIN_PLACEMENT_SCALE}
							oncommit={(value) => setIndependentScale(2, value)}
						/>
					</div>
				{/if}
			</div>
		</fieldset>
	</section>
{/if}

<style>
	.transform {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
	}

	.section-heading {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
	}

	h2 {
		margin: 0;
		font-size: 0.9rem;
	}

	.section-heading span {
		color: #8d887f;
		font-size: 0.68rem;
	}

	.axis-legend {
		display: grid;
		grid-template-columns: auto 1fr auto 1fr auto 1fr;
		align-items: center;
		gap: 0.25rem;
		color: #8d887f;
		font-size: 0.67rem;
	}

	.axis-legend .x,
	.axis-legend .y,
	.axis-legend .z {
		font-weight: 750;
	}

	.axis-legend .x { color: #ff4b4b; }
	.axis-legend .y { color: #35d765; }
	.axis-legend .z { color: #4d7dff; }

	fieldset {
		margin: 0;
		padding: 0.65rem;
		border: 1px solid #2e2e37;
		border-radius: 0.4rem;
	}

	legend {
		padding: 0 0.25rem;
		color: #bbb4a8;
		font-size: 0.72rem;
	}

	.field-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.35rem;
	}

	.field-grid.three {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}

	.scale-row {
		display: flex;
		align-items: stretch;
		gap: 0.4rem;
	}

	.scale-toggle {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.7rem;
		min-height: 1.7rem;
		padding: 0;
		border-radius: 0.3rem;
		border: 1px solid #3a3644;
		background: rgba(255, 255, 255, 0.04);
		color: var(--museum-editor-fg, #e9e3f0);
		cursor: pointer;
		transition: background 80ms ease;
	}

	.scale-toggle:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.1);
	}

	.scale-toggle[aria-pressed='true'] {
		background: rgba(136, 221, 255, 0.18);
		color: #88ddff;
		border-color: rgba(136, 221, 255, 0.5);
	}

	.scale-toggle:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
</style>
