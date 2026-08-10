# Phase 5 editor — manual test runbook

**Target:** `/dev/museum-editor` on port `5173` with `npm run dev -w @portfolio/museum` running locally.
**URL:** `http://localhost:5173/dev/museum-editor`
**Workspace:** single source of truth is `apps/museum/src/lib/content/museum-scene.json` (v6 schema). Tests are session-only until you commit; a Reset or Import restores `museum-scene.json` from disk.
**Reference code:**
- Texture library: `apps/museum/src/lib/editor/EditorAssetLibrary.svelte`
- Safe-URI predicate: `apps/museum/src/lib/content/texture-uri.ts`
- Verifier: `apps/museum/src/lib/editor/texture-verifier.ts`
- Material inspector + choice dialog: `apps/museum/src/lib/editor/EditorMaterialInspector.svelte`, `EditorMaterialChoiceDialog.svelte`
- Drag-drop wiring: `apps/museum/src/lib/editor/EditorSelection.svelte`
- Shared render path: `apps/museum/src/lib/museum/materials/scene-instance-material.ts`, `SceneInstanceMaterial.svelte`
- Cache lifecycle: `apps/museum/src/lib/museum/materials/texture-cache.ts`, `instance-material-remap.ts`

---

## Pre-flight

1. `npm run dev -w @portfolio/museum` (or `screen -dmS muvmEditor bash -c '...'` from `.freebuff/run.md`).
2. `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5173/dev/museum-editor` → must return `200`. First compile can take 10–30 s.
3. Open the editor URL in a fresh browser tab. The Preview tab (this thread) will mirror it.
4. Open DevTools → **Console**. Clear it. Filter by `warn`/`error`. Drop the `[vite]` debug noise.
5. Open DevTools → **Network**. Filter by `Image` and `Fetch`. You will revisit this for tests below.

Baseline correct render (no manual changes yet):
- Sidebar Scene tab: 7 rooms (5 `Read only`); Paris Salon expanded with 21 children.
- Assets tab → Textures tab: status `0 textures`, Register button **disabled**.
- Viewport: 7 rooms visible around a central chamber (rotated gloves visible on central floor).
- Status badge: `SAVED`, `Undo`/`Redo` both disabled.

If any of these is wrong, stop — fix the project state first; the rest of this runbook assumes a clean baseline.

---

## Test 1 — Register a known-good texture URI

**Goal:** `EditorAssetLibrary` accepts a root-relative public URI, verifies it, lists it as Ready with a thumbnail, no console noise, no document mutation in the on-disk file.

1. Assets → Textures.
2. Name field: type `Walnut Wood`.
3. Public URI field: type `/textures/wood-walnut/map.png`.
4. Click **Register texture**.
5. Expected within ~250 ms:
   - Form clears.
   - Status text increments to `1 textures`.
   - Card appears with thumbnail (`<img>` from `/textures/wood-walnut/map.png`), name `Walnut Wood`, the `Ready` badge, a `Retire` button, and `draggable="true"`.
   - `Register texture` button returns to disabled (form empty).
6. Console: zero entries.
7. Network: one new Image request to `/textures/wood-walnut/map.png` → `200`. (Vite already served this image earlier for catalogue rendering — the second fetch is dedicated to the thumbnail cache; both are fine.)
8. **Document check:** the on-disk `museum-scene.json` should be UNCHANGED. Confirm:
   ```bash
   git diff -- apps/museum/src/lib/content/museum-scene.json
   ```
   Should be empty. (The session only holds the registration; persistence happens when you save/export.)

Repeat with `/textures/plaster-warm/map.png` and `/textures/brass-aged/map.png` — both should behave identically (3 textures total).

Pass signal: 3 Ready cards, 0 console errors/warns, `git diff` empty.

---

## Test 2 — Reject unsafe URIs

**Goal:** Safe-URI predicate blocks `blob:`, encoded-traversal, absolute paths, missing files. No history entry, no document mutation.

For each row below, fill **Public URI**, click **Register texture**, then confirm:

| # | Public URI | Expected behavior |
|---|------------|-------------------|
| 2.1 | `blob:http://localhost:5173/abc-123` | Form shows rejection reason `unsafe_uri` (or inline error near the field); no new card; status remains `1 textures` (or whatever it was — no increment); console may have an editor-only warn. |
| 2.2 | `../../etc/passwd` | Same — rejected, no card, no increment. |
| 2.3 | `/etc/passwd` | Same — protocols/absolute paths blocked. |
| 2.4 | `https://example.com/x.png` | Same — non-relative scheme blocked. |
| 2.5 | `/textures/missing.png` | Form goes through verify with status `load_failed`; card still NOT added; status unchanged; console shows the failed-load event. |
| 2.6 | `/textures/wood-walnut/../plaster-warm/map.png` (encoded traversal) | Rejected as `unsafe_uri` (encoded `%2e%2e` form too if you try it). |

Pass signal: every row either rejects inline or fails verify; total card count never increases; **document state** in the session is unchanged (Undo/Redo still disabled); `git diff` empty.

> Background: predicate lives at `apps/museum/src/lib/content/texture-uri.ts` (`isSafeTextureUri`). Cross-check by `git grep unsafe_uri` to confirm test coverage.

---

## Test 3 — Drag/drop Ready texture onto a primitive

**Goal:** Viewport drag-drop resolves one renderable target, opens the choice dialog, commits the assignment, viewport reflects within one frame.

**Setup:** a primitive must be visible. Click `Add ▾ → Shape → Box` (or use an existing primitive — there are none in the baseline `museum-scene.json`; you need to add one to Paris Salon).

Steps:
1. Make sure camera-frame shows Paris Salon (click the `Paris Salon` treeitem, use `F` or mouse-drag the camera if needed).
2. In the viewport, click `Add ▾` → `Shape` → `Box`. A small primitive appears at the world origin.
3. Click the primitive to select it (sidebar list shows the new box entity).
4. From the Textures tab, drag the `Ready` thumbnail of `Walnut Wood`.
5. Drop over the viewport. Expected:
   - Cursor shows reject (🚫) if no renderable target is under the cursor; drop is silently ignored.
   - If over the primitive: the Material inspector opens a choice dialog (`EditorMaterialChoiceDialog`) with:
     - Base material select (`Warm Plaster`, `Walnut Wood`, `Aged Brass`, `Light Marble`, …).
     - Base texture: `Walnut Wood` (auto-selected from the dragged URI).
     - Roughness / Metalness numeric fields with `Use base` checkboxes.
     - `Confirm` button (disabled until a base material is chosen).
     - `Cancel` button + `Escape` key.
6. Pick `Walnut Wood` as base material, click **Confirm**.
7. Expected within one frame:
   - Dialog closes.
   - Primitive re-renders with the walnut texture in the viewport.
   - Sidebar shows `SAVED` (the model is dirty).
   - `Undo` button enables; `Redo` stays disabled.
8. Network: one extra fetch to `/textures/wood-walnut/map.png` may appear (renderer warm-fetch); it's `200`.

Pass signal: primitive visibly swapped to walnut, `Undo` enables, no console noise, no GLTF 404.

---

## Test 4 — Same flow on a model (not a primitive)

1. In the Scene hierarchy, click **Paris Salon Grand Piano** (the model entity).
2. Drag a Ready thumbnail onto the piano mesh in the viewport.
3. Material inspector opens. Expected:
   - For **models**, base-material defaults to *piano* (a per-asset fallback). The choice dialog opens with `decision-required` semantics: the model has a base material override candidate; you must explicitly choose **Keep current** or **Make unique**.
   - Pick **Make unique**. The dialog commits a new `SceneMaterialInstance` keyed to that `materialInstanceId`, the piano remaps its meshes (every mesh gets a fresh `MeshStandardMaterial` referencing the same refcounted `THREE.Texture` — verifiable via `mesh.material instanceof THREE.MeshStandardMaterial`).
4. Expected within one frame:
   - Piano shows the new texture.
   - Sidebar `SAVED`, `Undo` enables.
5. In DevTools console run:
   ```js
   document.querySelectorAll('canvas').length  // ≥1
   ```
   Then via store:
   ```js
   // inspect the live editor store
   ```
   (skip if no API exposed — visual confirmation is enough for manual test.)

Pass signal: piano visibly swapped, `Undo` enables, no console noise.

---

## Test 5 — Inspector live edit

**Setup:** keep the textured primitive from Test 3 selected.

1. In Material inspector, change **Base texture** to `Plaster Warm`. Expected: primitive tint changes within one frame.
2. Toggle `Use base` off on Roughness, set numeric value to `0.4`. Expected: visible roughness change (a subtly more polished surface for plaster).
3. Repeat with Metalness `0.1`. Expected: subtle specular drift on metalness-bound slots.
4. Click `Undo`. Expected: each Undo step rewinds one change in order (texture → roughness → metalness). After 3 Undos, the primitive should be back to its pre-edit state.
5. Click `Redo` three times. Expected: forward replay, primitive restored to the 0.4-roughness / 0.1-metalness / plaster-warm look.
6. `git diff -- museum-scene.json` should be empty until you export.

Pass signal: undo restores texture+overrides, redo replays, no console errors.

---

## Test 6 — Shared instance across two entities

**Goal:** Two primitives share one `materialInstanceId`. Editing one opens the **Edit shared / Make unique** dialog.

1. Add two boxes (Shape → Box) to Paris Salon.
2. Select the first box; assign `Walnut Wood` (Base texture) + base material `Walnut Wood`. Confirm.
3. Select the second box. From the Textures tab drag the **same** walnut thumbnail.
4. Expect the choice dialog to show shared-instance support: if you keep the shared `materialInstanceId` across both, edits later surface the *Edit shared / Make unique* prompt. Confirm shared path.
5. Select **either** primitive; in the inspector, change Roughness to `0.2`.
6. Expected: dialog reopens with text `Shared by N entities`. Two paths:
   - **Edit shared:** changing roughness affects BOTH primitives simultaneously.
   - **Make unique:** this primitive gets a cloned `materialInstanceId`; the other stays original.
7. Test the **Edit shared** path first:
   - Both primitives should now show identical surface response.
   - `Undo` to collapse back if needed.
8. Test the **Make unique** path:
   - Change metalness to `0.7` on primitive A → confirmed dialog → choose **Make unique**.
   - Primitive A's metalness update applies only to A; primitive B is unchanged.
   - Inspector on B now reads "Material instance unique to this entity" + lower-metalness values.

Pass signal: Shared path applies to both; Make-unique isolates A; no console noise.

---

## Test 7 — JSON round-trip

**Goal:** Project menu exports the v6 JSON; re-importing it produces equivalent document + appearance.

1. Top bar → **Project** menu. Pick **Copy JSON** or **Download JSON** (per the menu options). Confirm copy/download succeeded.
2. Quickly inspect the JSON: it must contain `version: 6`, a non-empty `textures` array (size ≥ 3 from Test 1), a non-empty `materials` array (size ≥ 2 from Tests 4 + 6), and `entities[]` carrying `materialInstanceId` on the textured primitives and piano.
3. Trigger **Reset** from the same Project menu. Expected: side panel cleared, viewport cleared (or default view), `SAVED`, Undo/Redo disabled.
4. Open **Project → Import JSON**; paste the copied JSON (or drop the downloaded file if Import supports drag-in).
5. Expected after import:
   - All Test 1 textures appear Ready.
   - All Test 3/4/6 entities materialize with their textures + overrides.
   - The viewport renders to the same look as before Reset (modulo camera position).
6. `git diff -- museum-scene.json`: in this session the file should still NOT be mutated unless you Save/Commit. The on-disk state is preserved at whatever you committed to before starting Tests 1–7.

Pass signal: round-trip restores textures, materials, assignments, looks; no warnings; no 404s on missing texture URIs.

---

## Test 8 — Visitor parity (`/museum`)

**Goal:** The visitor route reflects the editor assignments with identical rendering.

1. While the editor session is in a fully-assigned state (no Reset), click the **`Preview Museum`** link in the top bar. This opens `/museum` in a new tab.
2. Expect:
   - The visitor scene includes the textured primitive (Tests 3, 5) and the textured piano (Test 4).
   - Surface response to lighting matches the editor viewport — i.e., identical material-instance rendering.
   - No new console errors specific to the visitor route. Some `[vite]` debug noise may repeat because the visitor tab mounts a fresh app.
3. Network: shared cache — `/textures/wood-walnut/map.png`, `/textures/plaster-warm/map.png`, `/textures/brass-aged/map.png` are fetched ONCE in the visitor's first paint (per `texture-cache.texture-cache.ts` dedup contract) even if you'd expect multiple references.
4. Switch back to the editor tab; toggle the workflow:
   - In Test 6 make-unique state, the same primitive appears with isolated overrides in the visitor.
   - If you change the editor material for primitive A after import, the visitor route (if already loaded) won't update because `/museum` is its own Canvas; refresh `/museum` and re-confirm.

Pass signal: `/museum` view matches the editor with the same textures and override response. No errors.

---

## Tear-down

Once you've finished testing, two options:

- **Keep testing:** leave the dev server running. Refresh the browser as needed. No commit needed.
- **Discard session:** New Project → **Reset**, or simply kill the dev server.
  ```bash
  screen -S muvmEditor -X quit
  ```
  The on-disk `museum-scene.json` is unchanged by any of the tests above as long as you did **not** Save/Commit in the Project menu.

---

## Reporting issues

Any failure — drop the relevant section, the failing step, console excerpt (with `[vite]` noise stripped), and `git diff` output into a thread reply. Reference the source file under test by relative path so a fix can land quickly. Filename and step number from this runbook > prose; quote exact error strings.
