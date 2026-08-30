<script lang="ts">
	import { dev } from '$app/environment';
	import { chopinProject } from '$lib/content/chopin-project';
	import { compileLayoutGeometry } from '$lib/layout/layout-geometry';
	import { buildScaleFixture, SCALE_FIXTURE_SEEDS } from '../../../../tests/lib/layout/__fixtures__/layout-scale-fixtures';
	import { measureNodeTier, makeNodeProvenance, type NodeTierOptions } from '$lib/bench/plan-bench';
	import { buildWallMeshScene, readThreeRenderStats } from '$lib/bench/three-stats';
	import {
		chopinWallMeshRenderPolicyFactory,
		measureBrowserTier,
		visitorWallMeshPolicy,
		type BrowserTierOptions
	} from '$lib/bench/browser-bench';
	import type { BenchProvenance, BenchTier } from '$lib/bench/bench-types';
	import * as THREE from 'three';

	type TierChoice = 'chopin' | 'small' | 'medium' | 'large';

	const LARGE_OPTIONS: NodeTierOptions = { warmup: 1, samples: 3, hitPoints: 40, tolerance: 0.2 };

	let tier = $state<TierChoice>('small');
	let running = $state(false);
	let reportJson = $state<string>('');
	let webglJson = $state<string>('');
	let errorMessage = $state<string>('');

	function fixtureFor(choice: TierChoice) {
		if (choice === 'chopin') return chopinProject.layout;
		return buildScaleFixture(SCALE_FIXTURE_SEEDS[choice]);
	}

	function provenance(choice: TierChoice): BenchProvenance {
		const base = makeNodeProvenance({
			deviceProfile: 'browser',
			browser: { name: navigator.userAgent, version: '' }
		});
		return base;
	}

	function run() {
		running = true;
		errorMessage = '';
		reportJson = '';
		// Yield once so the button state paints before the synchronous burn.
		setTimeout(() => {
			try {
				const fixture = fixtureFor(tier);
				const prov = provenance(tier);
				const options = tier === 'large' ? LARGE_OPTIONS : undefined;
				const seed = tier === 'chopin' ? undefined : SCALE_FIXTURE_SEEDS[tier].seed;
				const node = measureNodeTier(fixture, tier as BenchTier, prov, options, seed);
				const browserOptions: BrowserTierOptions = { samples: 3 };
				// Chopin mirrors the recorded baseline + live shell: production
				// presentation + bespoke exclusion (6 rooms).
				if (tier === 'chopin') browserOptions.policyFactory = chopinWallMeshRenderPolicyFactory();
				const browser = measureBrowserTier(fixture, tier as BenchTier, prov, browserOptions, seed);
				reportJson = JSON.stringify({ node, browser }, null, 2);
			} catch (error) {
				errorMessage = error instanceof Error ? error.message : String(error);
			} finally {
				running = false;
			}
		}, 30);
	}

	function runWebgl() {
		webglJson = '';
		errorMessage = '';
		try {
			const compiled = compileLayoutGeometry(fixtureFor(tier)).geometry;
			const policy = tier === 'chopin'
				? chopinWallMeshRenderPolicyFactory()(compiled)
				: visitorWallMeshPolicy(compiled);
			const sceneResult = buildWallMeshScene(compiled, policy);
			const renderer = new THREE.WebGLRenderer({ antialias: false });
			renderer.setSize(64, 64);
			const camera = new THREE.OrthographicCamera(-40, 40, 40, -40, 0.1, 1000);
			camera.position.set(0, 40, 0);
			camera.lookAt(0, 0, 0);
			renderer.render(sceneResult.scene, camera);
			const stats = readThreeRenderStats(renderer);
			webglJson = JSON.stringify({ scene: sceneResult.counts, renderer: stats }, null, 2);
			renderer.dispose();
			sceneResult.dispose();
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : String(error);
		}
	}

	const tiers: { value: TierChoice; label: string; rooms: number }[] = [
		{ value: 'chopin', label: 'Chopin (product)', rooms: 7 },
		{ value: 'small', label: '10 rooms', rooms: 10 },
		{ value: 'medium', label: '100 rooms', rooms: 100 },
		{ value: 'large', label: '1,000 rooms', rooms: 1000 }
	];
</script>

<svelte:head>
	<title>G3 Performance Harness — Chopin Museum Dev</title>
</svelte:head>

{#if dev}
	<main class="page">
		<aside class="panel">
			<p class="eyebrow">/dev/perf</p>
			<h1>G3 performance harness</h1>
			<p class="lede">
				Deterministic scale fixtures + Node/browser-tier measurements. Deterministic budgets are
				enforced only for the <strong>Chopin</strong> golden fixture; 10/100/1,000-room tiers are
				comparison data.
			</p>

			<div class="controls">
				{#each tiers as choice (choice.value)}
					<label>
						<input type="radio" bind:group={tier} value={choice.value} />
						{choice.label}
					</label>
				{/each}
			</div>

			<div class="actions">
				<button disabled={running} onclick={run}>
					{running ? 'Measuring…' : 'Run report'}
				</button>
				<button disabled={running} onclick={runWebgl}>Live WebGL (wall-mesh)</button>
			</div>

			{#if errorMessage}
				<p class="error">{errorMessage}</p>
			{/if}

			<a href="/museum">Back to museum</a>
		</aside>

		<section class="output">
			{#if reportJson}
				<h2>Report</h2>
				<pre>{reportJson}</pre>
			{/if}
			{#if webglJson}
				<h2>Live WebGL</h2>
				<pre>{webglJson}</pre>
			{/if}
			{#if !reportJson && !webglJson}
				<p class="hint">Pick a tier and run the report. The Chopin tier also feeds the budget CI check.</p>
			{/if}
		</section>
	</main>
{/if}

<style>
	.page {
		display: grid;
		grid-template-columns: minmax(18rem, 24rem) 1fr;
		min-height: 100vh;
		background: #0b0b10;
		color: #f4efe4;
		font-family:
			ui-sans-serif,
			system-ui,
			-apple-system,
			sans-serif;
	}

	.panel {
		padding: 1.25rem 1.35rem;
		border-right: 1px solid rgb(255 255 255 / 0.1);
		background: rgb(10 10 14 / 0.92);
		overflow: auto;
	}

	.eyebrow {
		margin: 0;
		color: #d6b35f;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		font-size: 0.72rem;
	}

	h1 {
		margin: 0.35rem 0 0.6rem;
		font-size: 1.6rem;
	}

	h2 {
		margin: 0 0 0.5rem;
		font-size: 1rem;
		color: #d6b35f;
	}

	.lede,
	.hint,
	.error {
		color: rgb(244 239 228 / 0.72);
		line-height: 1.45;
		font-size: 0.9rem;
	}

	.error {
		color: #e08a6e;
	}

	.controls {
		display: grid;
		gap: 0.4rem;
		margin: 1rem 0;
	}

	.controls label {
		display: flex;
		gap: 0.5rem;
		font-size: 0.9rem;
	}

	.actions {
		display: grid;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	button {
		padding: 0.55rem 0.8rem;
		border: 1px solid rgb(255 255 255 / 0.2);
		border-radius: 0.5rem;
		background: rgb(214 179 95 / 0.12);
		color: #f4efe4;
		cursor: pointer;
		font-size: 0.9rem;
	}

	button:disabled {
		opacity: 0.5;
		cursor: default;
	}

	a {
		color: #d6b35f;
	}

	.output {
		padding: 1.25rem 1.35rem;
		overflow: auto;
	}

	pre {
		margin: 0;
		padding: 1rem;
		background: rgb(255 255 255 / 0.04);
		border: 1px solid rgb(255 255 255 / 0.08);
		border-radius: 0.5rem;
		font-size: 0.78rem;
		line-height: 1.4;
		max-height: 80vh;
		overflow: auto;
	}

	@media (max-width: 840px) {
		.page {
			grid-template-columns: 1fr;
		}

		.panel {
			border-right: 0;
			border-bottom: 1px solid rgb(255 255 255 / 0.1);
		}
	}
</style>
