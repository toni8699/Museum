<svelte:head>
  <title>Chopin Museum Graybox</title>
  <meta
    name="description"
    content="Phase 1 graybox layout for an interactive Chopin museum in Threlte."
  />
</svelte:head>

<main class="landing">
  <section class="card">
    <p class="eyebrow">Interactive Chopin Museum</p>
    <h1>Graybox visitor flow</h1>
    <p>
      A phase-one spatial prototype for testing room scale, circular route pacing, central piano
      sightlines, and guided navigation before detailed exhibits or final assets.
    </p>
    <a href="/museum">Enter graybox museum</a>
  </section>
</main>

<style>
  :global(body) {
    margin: 0;
    font-family:
      Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: #f8f1e2;
    background: #07070a;
  }

  .landing {
    min-height: 100vh;
    display: grid;
    place-items: center;
    background:
      radial-gradient(circle at 50% 20%, rgb(189 149 78 / 0.22), transparent 34rem),
      linear-gradient(135deg, #09090d, #16100f 55%, #050506);
    padding: 2rem;
  }

  .card {
    width: min(42rem, 100%);
    border: 1px solid rgb(255 255 255 / 0.14);
    border-radius: 1.5rem;
    padding: clamp(1.5rem, 4vw, 3rem);
    background: rgb(8 8 12 / 0.78);
    box-shadow: 0 2rem 5rem rgb(0 0 0 / 0.36);
  }

  .eyebrow {
    color: #d5b16b;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    font-size: 0.76rem;
  }

  h1 {
    font-size: clamp(2.5rem, 7vw, 5rem);
    line-height: 0.9;
    margin: 0 0 1rem;
  }

  p {
    color: rgb(248 241 226 / 0.76);
    line-height: 1.7;
  }

  a {
    display: inline-block;
    margin-top: 1.25rem;
    border: 1px solid rgb(213 177 107 / 0.8);
    border-radius: 999px;
    background: #d5b16b;
    color: #14100a;
    padding: 0.85rem 1.2rem;
    font-weight: 700;
    text-decoration: none;
  }
</style>