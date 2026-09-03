# Spatial Sketch Editor

Layout-first editor for indoor 3D. Draw a floor plan. Place openings and objects. Author a camera tour. Export one file. A separate visitor runtime renders it.

Local-first: the editor works offline in your browser. Optional authenticated
cloud project save/load runs through the Fastify API and Postgres when configured;
portable export/import remains available as well.

## Example

**Chopin museum** is the first project built with it. Guided tour, free roam, reduced motion. Paris Salon included.

Any indoor space works. Gallery, office, store, venue.

## Features

- **Plan editor:** draw rooms, bend walls into curves, snap to grid
- **Openings:** doors, windows, round/pointed profiles
- **Objects:** boxes, cylinders, spheres, GLB assets
- **Camera tours:** place nodes, connect paths, smooth rides
- **3D view:** live preview of your compiled plan
- **Undo / redo:** shared across the editor
- **Portable project:** export JSON, import anywhere

## Run locally

Needs Node.js 20+ and a WebGL browser.

Create the local environment file once if it does not exist, then set the local
values in [`.env`](.env) (do not commit it):

```bash
cp .env.example .env
```

Use a local Postgres database:

```bash
brew services start postgresql@14
createdb biskiq
```

Set these local values in `.env`:

```env
DATABASE_URL=postgresql://localhost:5432/biskiq
PORT=8787
EDITOR_ORIGIN=http://localhost:5173
API_ORIGIN=http://localhost:8787
PUBLIC_API_ORIGIN=http://localhost:8787
```

Keep valid local Google OAuth credentials and a 32-byte `SESSION_KEY` in the
same file. Google must allow:

```text
Authorized JavaScript origin: http://localhost:5173
Authorized redirect URI:     http://localhost:8787/auth/callback
```

Apply the database schema once:

```bash
npm run migrate:api
```

Start the backend and frontend in separate terminals:

```bash
# Terminal 1
npm run api
```

```bash
# Terminal 2
npm run dev
```

Open <http://localhost:5173>. The root scripts load `.env` automatically.

Stop Postgres when finished:

```bash
brew services stop postgresql@14
```

The editor alone can still run without the API; cloud Save/Load and Google
sign-in stay disabled until `PUBLIC_API_ORIGIN` and the backend are configured.

## Other commands

```bash
npm install
```

- `/` or `/editor`: main editor. 2D CAD plan -> 3D render
- `/museum/editor`: legacy editor

The read-only visitor is a separate app:

```bash
npm run dev:museum
```

- `/museum`: frozen Chopin museum visitor

```bash
npm run build   # production build
npm run check   # svelte + TS checks
npm test        # tests
```
