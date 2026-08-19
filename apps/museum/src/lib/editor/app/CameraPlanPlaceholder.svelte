<!-- P1.1 — the Camera → Plan cell is a placeholder until P1.5 mounts the
     Camera Plan surface (nodes/edges/anchors, 2D toolbar modes,
     backdrop/hit-test discipline). Deliberately inert: no backdrop, no
     hit-testing, no camera mutation surface (mirrors the PlanWorkspace
     no-mutator pin). -->
<div class="camera-plan-placeholder" role="application" aria-label="Camera Plan surface">
	<div class="placeholder-card">
		<span class="placeholder-kicker">Camera Plan</span>
		<p class="placeholder-title">The camera graph surface lands in P1.5</p>
		<p class="placeholder-copy">
			This cell will host the top-down camera network — create, drag, connect,
			and reorder camera nodes over the scene plan.
		</p>
		<p class="placeholder-hint">The camera timeline and Sequence panel stay available below.</p>
	</div>
</div>

<style>
	.camera-plan-placeholder {
		position: relative;
		display: grid;
		width: 100%;
		height: 100%;
		min-height: 0;
		place-items: center;
		overflow: hidden;
		background: #0b0b10;
		/* S10.1.6 — Plan ↔ 3D mount fade (240 ms). */
		animation: placeholder-fade-in 240ms ease both;
	}
	@keyframes placeholder-fade-in {
		from { opacity: 0; }
		to { opacity: 1; }
	}
	@media (prefers-reduced-motion: reduce) {
		.camera-plan-placeholder { animation: none; }
	}
	.placeholder-card {
		display: flex;
		max-width: 24rem;
		flex-direction: column;
		gap: 0.5rem;
		padding: 1.4rem 1.6rem;
		border: 1px solid #2e2e37;
		border-radius: 0.6rem;
		background: rgb(19 19 26 / 92%);
		text-align: center;
	}
	.placeholder-kicker {
		color: #d6b35f;
		font-size: 0.66rem;
		font-weight: 650;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.placeholder-title { margin: 0; color: #f4efe4; font-size: 0.95rem; font-weight: 650; }
	.placeholder-copy { margin: 0; color: #a8a29a; font-size: 0.76rem; line-height: 1.5; }
	.placeholder-hint { margin: 0; color: #77736d; font-size: 0.68rem; line-height: 1.45; }
</style>
