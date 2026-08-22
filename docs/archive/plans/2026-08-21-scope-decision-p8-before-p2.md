# Scope decision — P8 ahead of P2 (2026-08-21)

**Decision (owner):** P8 (camera preview scopes) becomes the active gate;
P2 (plan staging) follows it. This **extends** the
[2026-08-18 camera-first decision](2026-08-18-scope-decision-camera-first.md)
— the camera phase continues while P1 context is warm — rather than reversing
its P2-before-P3 tail.

**Rationale:**

- P8 closes the editor timing-parity gap (the same connection must not move
  differently across preview paths) before further authoring happens on
  mismatched previews.
- P8 must precede P3 regardless: the Camera 3D transport/timeline chrome
  settles once, then P3 stays purely cosmetic.
- No technical coupling with P2 (staging/furnishing vs camera session state);
  P2's only dependency (P1 close) is satisfied whenever it runs.
- Branch-rejoin experiment (conceptually gated on P8 Slices 1–4) unblocks
  earlier.

**Consequences:**

- Tracker execution order: **P6 → P1 → P8 → P2 → P3**.
- Remaining **P7** increments (**P7.1 → P7.5 → P7.2 → P7.3**, Option B)
  resume **after P8 Slices 1–4 land**; never interleaved with P8 Slices 2–4.
  P7.5's `cameraTimelinePlayhead`-ownership DoD item folds into P8 Slice 2
  acceptance and is struck from P7.5 when P7 resumes.
- P4/P5 remain unscheduled until the owner re-prioritizes.
