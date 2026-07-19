# Interactive Chopin Museum

An experimental 3D museum experience about the life and music of Frédéric Chopin. Visitors move through a circular sequence of rooms using guided camera transitions, connecting places such as Poland, Paris, the composer’s workshop, and a central music chamber.

The project is currently a spatial prototype: the layout, pacing, navigation, and atmosphere are being established before the remaining rooms receive final exhibits and artwork.

## Features

- Guided tour through eight narrative stops
- Free-tour mode for exploring the museum’s connected spaces
- Smooth 3D camera movement with reduced-motion support
- Central piano chamber and gold staff-line path
- Shared materials for floors, walls, ceilings, wood, plaster, and brass
- Paris Salon asset slice with furniture, lighting, and decorative GLB models
- Responsive HUD with room titles, navigation, and tour controls
- Development previews for materials, assets, and museum layout editing

## Run locally

Requires Node.js 20 or newer and a WebGL-capable browser.

```bash
npm install
npm run dev
```

Open the local URL and visit `/museum`.

Useful commands:

```bash
npm run build   # Create a production build
npm run check   # Run Svelte and TypeScript checks
npm test        # Run the test suite
```

## Controls

- **Next / Back:** HUD buttons, arrow keys, `Space`, and `Backspace`
- **Navigation nodes:** Click glowing nodes when available
- **M:** Toggle guided and free-tour modes
- **R:** Toggle reduced motion
- **Paris Salon:** Drag the scene or use arrow keys to look around

## Technology

Built with SvelteKit, Svelte 5, Threlte, Three.js, and TypeScript.

The main application lives in [`apps/museum`](./apps/museum). Additional development views are available at `/dev/materials`, `/dev/assets`, and `/dev/museum-editor`.

## Status

This is an evolving graybox museum and interactive portfolio experiment. The Paris Salon is the first detailed asset slice; exhibit interactions, final artwork, and further room development are still in progress.
