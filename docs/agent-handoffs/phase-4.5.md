# Phase 4.5 — Browser/production verification and handoff

**Status:** Complete  
**Plan:** [`../plans/museum-editor-workspace/phase-4-scene-creation.md`](../plans/museum-editor-workspace/phase-4-scene-creation.md) slice 4.5  
**Phase 4 gate:** Closed. Models, primitives, and lights are first-class v5 entities. Texture/material-instance work remains Phase 5.

## Delivered

- Full automated gate re-run after Phase 4.1–4.4.
- Production isolation re-verified (HTTP + chunk scan).
- One typecheck fix from 4.4 fallout: `editor-lights.test.ts` no longer reads `.range` on the un-narrowed `SceneLightEntity` union (`toMatchObject` instead).
- No schema or feature changes in this slice.

## Verification evidence

| Gate | Result |
|---|---|
| `npm run test -w @portfolio/museum` | **568 / 568** passed (36 files) |
| `npm run check -w @portfolio/museum` | **0 errors / 0 warnings** (after lights-test fix) |
| `npm run build -w @portfolio/museum` | exit 0 |
| Production preview `/museum` | **200** |
| Production preview `/dev/museum-editor` | **404** (`Not found`) |
| Dev `/museum` + `/dev/museum-editor` | **200** / **200** |
| Client/server chunks | No `MuseumEditorApp`, `createMuseumEditorStore`, `EditorCameraPathHelpers`, `beginLightPlacement`, `EditorLightInspector`, `beginPrimitivePlacement` |
| Editor client leaf | Stub-sized (`nodes/5.*.js` ≈ 346 B) |
| Visitor entity parity | `EntityPrimitive` / `EntityLight` present in museum page SSR; visitor light branch omits `showPickProxy` |

## Automated acceptance (Phase 4 plan)

Covered by existing vitest + codec/editor suites from 4.1–4.4:

- v1–v4 → v5 migration deterministic.
- Model placements preserve IDs/transforms/clusters.
- Primitive + light kinds validate, serialize, resolve, select, round-trip.
- Invalid dimensions/light values rejected.
- Add/edit/delete/undo/redo atomic.
- Camera graph / view tracks / timing / playback unchanged by entity work.
- Production isolation intact (above).

## Browser acceptance

Pointer-level WebGL placement/inspector gestures remain **manual** (no `agent-browser` / Playwright control in this session). Contracts confirmed in source + HTTP:

1. Add menu exposes Box / Plane / Cylinder / Sphere and Point / Spot / Directional Light (`EditorViewportToolbar.svelte`).
2. Assets → Shapes / Lights place actions exist (`EditorAssetLibrary.svelte`).
3. Inspector kind-gates light fields (`EditorLightInspector.svelte`); primitives via existing primitive inspector path.
4. Shared renderer dispatches model / primitive / light (`MuseumEntities.svelte`); editor helpers stay behind `placementRegistry`.
5. Duplicate + history paths covered by `museum-editor.test.ts` / lights / primitives unit tests.

Manual checklist to spot-check in `/dev/museum-editor` when convenient:

1. Add each primitive from Add and Assets → Shapes; place in straight + yawed rooms.
2. Edit dimensions, transform, catalogue material, shadows.
3. Add each light; confirm only applicable fields.
4. Select model / primitive / light from tree and viewport.
5. Export/import + undo/redo entity ops.
6. Preview Museum; confirm camera/model parity.

## Files changed this slice

- `apps/museum/src/lib/editor/editor-lights.test.ts` — type-safe range assertion.
- `docs/agent-handoffs/phase-4.5.md` — this handoff.
- `docs/agent-handoffs/CURRENT.md` — pointer update.
- `docs/plans/museum-editor-workspace/README-museum-editor.md` — Phase 4 complete status.

## Next

**Phase 5** — textures / material instances (package export follow-on). Anchor: [`../plans/museum-editor-workspace/phase-5-textures.md`](../plans/museum-editor-workspace/phase-5-textures.md).

Do not start Phase 5 schema (v6) until this Phase 4 gate is accepted. Do not commit unless requested.
