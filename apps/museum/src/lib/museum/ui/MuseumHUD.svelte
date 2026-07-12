<script lang="ts">
  import { navigationNodes, roomById } from '$lib/content/rooms';
  import { museumState } from '$lib/state/museum-state.svelte';

  const currentRoom = $derived(roomById.get(museumState.currentRoomId));
</script>

<aside class="hud" aria-label="Museum navigation controls">
  <div class="panel title-panel">
    <p class="eyebrow">Phase 1 graybox</p>
    <h1>{currentRoom?.title}</h1>
    {#if currentRoom?.subtitle}<p class="subtitle">{currentRoom.subtitle}</p>{/if}
    <p class="mood">{currentRoom?.mood}</p>
  </div>

  <div class="panel controls">
    <button onclick={() => museumState.goBack()} disabled={museumState.isTransitioning}>Back</button>
    <button class="primary" onclick={() => museumState.goNext()} disabled={museumState.isTransitioning}>
      Next
    </button>
    <button onclick={() => museumState.toggleTourMode()}>Mode: {museumState.tourMode}</button>
    <button onclick={() => museumState.toggleReducedMotion()}>
      Reduced motion: {museumState.reducedMotion ? 'on' : 'off'}
    </button>
  </div>

  <nav class="panel route" aria-label="Museum route">
    {#each navigationNodes as node, index (node.id)}
      <button
        class:active={museumState.activeNodeId === node.id}
        class:visited={museumState.visitedRoomIds.has(node.roomId)}
        disabled={!museumState.canNavigateTo(node.id)}
        onclick={() => museumState.requestNode(node.id)}
      >
        <span>{index + 1}</span>{node.label}
      </button>
    {/each}
  </nav>

  <p class="hint">Keyboard: arrows / space move, M toggles mode, R toggles reduced motion.</p>
</aside>

<style>
  .hud {
    position: fixed;
    inset: 1rem auto 1rem 1rem;
    width: min(23rem, calc(100vw - 2rem));
    z-index: 10;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    pointer-events: none;
    color: #f8f1e2;
  }

  .panel,
  .hint {
    pointer-events: auto;
    border: 1px solid rgb(255 255 255 / 0.14);
    border-radius: 1rem;
    background: rgb(6 6 10 / 0.68);
    backdrop-filter: blur(16px);
    box-shadow: 0 1rem 3rem rgb(0 0 0 / 0.26);
  }

  .title-panel {
    padding: 1rem;
  }

  .eyebrow {
    margin: 0 0 0.35rem;
    color: #d6b35f;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    font-size: 0.68rem;
  }

  h1 {
    margin: 0;
    font-size: clamp(1.6rem, 4vw, 2.5rem);
  }

  .subtitle,
  .mood,
  .hint {
    color: rgb(248 241 226 / 0.74);
    line-height: 1.45;
  }

  .subtitle {
    margin: 0.2rem 0 0;
  }

  .mood {
    margin: 0.7rem 0 0;
    font-size: 0.9rem;
  }

  .controls {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.45rem;
    padding: 0.55rem;
  }

  button {
    border: 1px solid rgb(255 255 255 / 0.14);
    border-radius: 0.7rem;
    background: rgb(255 255 255 / 0.08);
    color: #f8f1e2;
    padding: 0.62rem 0.7rem;
    cursor: pointer;
    text-align: left;
  }

  button:hover:not(:disabled),
  button.active {
    border-color: rgb(214 179 95 / 0.8);
    background: rgb(214 179 95 / 0.2);
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.42;
  }

  .primary {
    background: #d6b35f;
    color: #151006;
    font-weight: 800;
  }

  .route {
    max-height: min(44vh, 26rem);
    overflow: auto;
    display: grid;
    gap: 0.25rem;
    padding: 0.55rem;
  }

  .route button {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    font-size: 0.82rem;
  }

  .route span {
    display: grid;
    place-items: center;
    width: 1.45rem;
    height: 1.45rem;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.1);
    color: #d6b35f;
  }

  .visited span {
    background: rgb(214 179 95 / 0.2);
  }

  .hint {
    margin: 0;
    padding: 0.8rem 1rem;
    font-size: 0.78rem;
  }

  @media (max-width: 720px) {
    .hud {
      inset: auto 0.75rem 0.75rem;
      width: auto;
    }

    .route {
      display: none;
    }
  }
</style>
