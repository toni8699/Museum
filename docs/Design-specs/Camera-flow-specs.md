# Camera Graph & Sequence Authoring — Behavior Specification

**Status:** Proposed product/UX amendment
**Scope:** Camera Plan, Sequence Inspector, Unsequenced cameras, reordering, playback, branches, and graph/sequence interaction.

This specification preserves the existing distinction between **connections** and **sequence order**, and preserves Camera Plan as the place for spatial node/path editing. It changes how cameras enter, leave, and reorder within the sequence.

## 1. Core mental model

Camera authoring has two independent layers:

### Graph

The graph answers:

> **Where can the camera move?**

Camera Plan owns the graph.

It contains:

* camera nodes at real world positions
* undirected connections between nodes
* connection path geometry
* curved path anchors
* connection timing where supported

Example:

```text
A — B — C — D
        \
         E
```

This graph contains five cameras and four possible movement connections.

### Sequence

The sequence answers:

> **Which connected path is used for primary ordered playback?**

Example:

```text
① A
② B
③ C
④ D
```

E remains connected to C but has no sequence position.

The sequence is therefore an **ordered subset of the camera graph**, not a separate camera system.

---

## 2. Terminology

Use:

* **Sequence** — cameras currently assigned an explicit playback order.
* **Unsequenced** — cameras without an explicit sequence position.
* **Connection** — an undirected travel relationship between two cameras.
* **Sequence connection** — an existing connection currently used between two adjacent sequence nodes.
* **Branch** — connected graph content that is not currently part of the sequence.
* **Detour** — an explicitly authored branch behavior that leaves and later rejoins sequence playback.

Retire **Free Cameras** as primary terminology.

An Unsequenced camera may still:

* have multiple connections
* belong to a branch
* participate in a detour
* have a fully authored pose
* be previewed independently

“Unsequenced” means only:

> This camera currently has no sequence index.

---

# 3. Camera Plan responsibility

Camera Plan answers:

> **Where are cameras, and how can movement occur between them?**

The Plan viewport supports:

* Add Camera
* move camera in X/Z
* select camera
* connect cameras
* delete valid connections
* select connections
* add/edit interior path anchors
* curve movement paths in X/Z
* inspect connection timing
* preview individual cameras/connections through contextual actions

Camera Plan does **not** determine sequence order through spatial dragging.

Dragging a camera on the Plan always means:

> Move camera physically.

It never means:

> Move camera earlier/later in playback.

This keeps spatial position and playback order unambiguous.

Camera Plan continues to preserve authored Y while editing X/Z, as required by the existing Camera Plan model.

---

# 4. Sequence responsibility

Sequence authoring answers:

> **Which path through the existing graph is the current ordered playback sequence?**

Sidebar structure:

```text
SEQUENCE

① Camera B
② Camera C
③ Camera D


UNSEQUENCED

◯ Camera A
  Connected to B

◯ Camera E
  Connected to C
```

The two sections together account for every camera node exactly once.

A camera can move between sections without being created or deleted.

---

# 5. Sequence validity invariant

Adjacent Sequence nodes must have a real connection.

For:

```text
① A
② B
③ C
```

the graph must contain:

```text
A — B
B — C
```

Sequence authoring does **not** silently create connections.

Sequence authoring does **not** silently delete connections.

Sequence authoring selects a traversal through topology already authored in Camera Plan.

This is the primary invariant:

> **Plan defines possible movement. Sequence chooses ordered movement from those possibilities.**

---

# 6. Creating the initial sequence

If Sequence is empty:

```text
SEQUENCE

Drop a camera here


UNSEQUENCED

◯ A
◯ B
◯ C
```

Dragging A into Sequence makes:

```text
① A
```

No connection requirement exists because Sequence contains only one node.

The same operation may be exposed contextually as:

**Add to Sequence**

or:

**Set as First**

---

# 7. Extending the sequence

Given graph:

```text
A — B — C — D
        \
         E
```

and:

```text
SEQUENCE
① A

UNSEQUENCED
B
C
D
E
```

Only cameras connected to A are valid immediate second nodes.

Therefore B can become second:

```text
① A
② B
```

C cannot be inserted directly after A because `A — C` does not exist.

As the sequence grows, each new endpoint must connect to the current endpoint.

Example:

```text
① A
② B
③ C
④ D
```

E remains Unsequenced.

---

# 8. Branch behavior

Unsequenced graph neighbors remain available as branches.

Graph:

```text
A — B — C — D
        \
         E
```

Sequence:

```text
① A
② B
③ C
④ D
```

E becomes:

```text
UNSEQUENCED

◯ E
  Connected to C
```

The graph still contains:

```text
C — E
```

Nothing is deleted.

E can later:

* be inserted into Sequence where connectivity permits
* remain an optional branch
* become part of a detour
* be previewed independently

An Unsequenced branch is **not automatically a detour**. Detour behavior remains an explicit higher-level playback decision.

---

# 9. Changing the first camera

Changing the first camera uses **re-root semantics**, not ordinary list rotation.

Given:

```text
① A
② B
③ C
④ D
```

with graph:

```text
A — B — C — D
        \
         E
```

## Set B as first

The existing valid forward suffix is preserved:

```text
SEQUENCE

① B
② C
③ D


UNSEQUENCED

◯ A
  Connected to B

◯ E
  Connected to C
```

A is not deleted and `A — B` remains.

A is now a branch adjacent to the new first camera.

The user may instead choose A as B's continuation:

```text
① B
② A
```

In that case C/D remain outside the Sequence because A has no connection to C.

Sequence remains one linear ordered traversal. It never forks.

## Set C as first

The existing forward suffix becomes:

```text
① C
② D
```

A and B become Unsequenced:

```text
A — B — ① C — ② D
        |
        E
```

B/A form an off-sequence branch from C.

E is another off-sequence neighbor of C.

The user could instead choose:

```text
① C
② B
③ A
```

or:

```text
① C
② E
```

because both B and E are directly connected to C.

The selected continuation determines the Sequence; other connected neighbors remain branches.

---

# 10. Reordering existing Sequence nodes

Normal drag reorder preserves Sequence membership and must produce a connected sequence.

Given:

```text
① A
② B
③ C
④ D
```

Dragging C between A and B would propose:

```text
A → C → B → D
```

This is valid only if graph contains:

```text
A — C
C — B
B — D
```

If any required connection is missing, that drop target is invalid.

UI should show the exact reason:

```text
Cannot move Camera C here
No connection between Camera A and Camera C
```

Do not:

* create the missing connection
* silently remove another camera
* partially apply the reorder

The operation either produces a valid Sequence or makes no change.

---

# 11. Sequence insertion

Dragging an Unsequenced camera into a gap requires connectivity to its new neighbors.

Given:

```text
① A
② B
③ C
```

and Unsequenced X.

Dropping X between B and C requires:

```text
B — X
X — C
```

If both exist:

```text
① A
② B
③ X
④ C
```

If only `B — X` exists, the middle drop is invalid.

X may still be valid at the end after B if B is currently the tail or if the rest of the sequence is intentionally changed.

Start and end are always real insertion positions.

---

# 12. Removing a camera from Sequence

Removing Sequence membership never deletes the camera or its graph connections.

### Head

```text
A → B → C
```

Remove A:

```text
B → C
```

A becomes Unsequenced.

Always valid.

### Tail

```text
A → B → C
```

Remove C:

```text
A → B
```

C becomes Unsequenced.

Always valid.

### Middle

```text
A → B → C
```

Removing B would require:

```text
A — C
```

If that connection exists:

```text
A → C
```

is valid and B becomes Unsequenced.

If `A — C` does not exist, **Remove only** is rejected because it would create an invalid Sequence.

UI should explain:

```text
Cannot remove Camera B from Sequence
Camera A has no connection to Camera C
```

The user may instead:

* change Sequence order
* edit topology in Camera Plan
* trim a sequence end
* explicitly choose another continuation

No hidden reconnection occurs.

---

# 13. Re-root versus reorder

The UI must distinguish:

### Reorder

> Keep these cameras in Sequence, but change their relative positions.

Subject to adjacency validation.

### Set as First

> Begin Sequence from this camera and preserve the valid forward continuation from this point.

Earlier Sequence nodes move to Unsequenced.

This distinction is important.

Dragging B into a normal internal gap means **reorder**.

Dragging B onto an explicitly labeled:

```text
Make First
```

target means **re-root**.

Do not make the semantic difference invisible.

---

# 14. Connections survive Sequence changes

Sequence membership never owns connection lifetime.

Example:

```text
Sequence:
A → B → C
```

with path A—B carefully curved in Camera Plan.

If A later becomes Unsequenced:

```text
Sequence:
B → C
```

the connection:

```text
A — B
```

and all its authored path anchors remain exactly intact.

This is critical because path geometry is authored work.

Sequence edits must never destroy spatial authoring.

---

# 15. Editing a Sequence path in Camera Plan

Sequence adjacency references the same real connection shown in Camera Plan.

Example:

```text
Sequence:
① A
② B
```

Plan initially:

```text
① A ───────── ② B
```

User curves the connection:

```text
① A
    ╲
     ●────●
           ╲
            ② B
```

Playback from A to B now follows that curved path.

Sequence order remains:

```text
A → B
```

Therefore:

> **Sequence determines which connection is traversed. Connection geometry determines how the movement occurs.**

This is a foundational rule.

---

# 16. Graph changes affecting Sequence

A connection currently required by Sequence cannot normally be deleted.

Given:

```text
Sequence:
A → B → C
```

the connections:

```text
A — B
B — C
```

are required.

Deleting `A — B` should be rejected with:

```text
Cannot delete connection
Sequence requires movement between Camera A and Camera B.
```

The user must first alter Sequence.

This preserves the existing invariant that connection deletion does not silently reorder guided playback.

If malformed imported data somehow contains a missing required connection, playback stops at the last valid camera and reports the exact missing pair.

Example:

```text
Playback stops at Camera B
No connection to Camera C.
```

---

# 17. Deleting cameras

### Unsequenced camera

May be deleted normally subject to graph validation.

### Sequence head/tail

Deleting it removes the camera and shrinks Sequence by one node.

### Sequence middle

Deletion is allowed only when the remaining predecessor/successor pair forms a valid Sequence adjacency.

For:

```text
A → B → C
```

deleting B requires an existing:

```text
A — C
```

Otherwise deletion is rejected and the user is asked to adjust Sequence first.

Deletion never creates a replacement connection automatically.

One successful delete remains one undo entry.

---

# 18. Preview behavior

Every camera can be previewed regardless of Sequence membership.

A camera stores a complete static viewpoint:

* position
* target/orientation
* FOV

Therefore:

```text
Preview Camera
```

works for both:

```text
① Sequenced Camera
```

and:

```text
◯ Unsequenced Camera
```

A connection is required only for movement preview, not for viewing a camera pose.

From Camera Plan, previewing a camera may switch to Camera 3D while preserving selection.

This follows the existing shared-selection rule between Camera Plan and Camera 3D.

---

# 19. Timeline behavior

The timeline represents Sequence, not the complete camera graph.

The primary Camera Path lane shows:

```text
① A ───── ② B ───── ③ C
```

Unsequenced cameras do not appear as normal Sequence stops.

They may appear only in explicit branch/detour presentation where applicable.

Timeline reordering uses the same validity rules as the Sequence Inspector:

* existing connections only
* no automatic connection creation
* no automatic graph deletion
* invalid targets explain the missing connection
* start and end positions are supported

Camera Plan remains the place to create or reshape topology.

---

# 20. Plan visualization

Camera Plan should visually distinguish:

### Sequenced

```text
①
②
③
```

### Unsequenced

```text
◯
```

Connections remain undirected and therefore use no directional arrows.

Sequence numbers communicate order without changing connection semantics.

Example:

```text
◯ A — ① B — ② C — ③ D
             \
              ◯ E
```

This tells the user immediately:

* B/C/D are sequenced.
* A/E are unsequenced.
* A connects to B.
* E connects to C.
* neither connection automatically implies playback order.

---

# 21. Branch and detour interpretation

Given:

```text
A — B — C — D
        \
         E
```

Sequence:

```text
① B
② C
③ D
```

A and E are connected branches.

They do not need sequence numbers.

A future or existing detour system may explicitly define traversal through these branches.

For example, if topology supports:

```text
B — X — Y — C
```

then:

```text
B → X → Y → C
```

may be authored as a detour while B and C retain their Sequence positions.

This does not rewrite Sequence itself.

---

# 22. Undo

One completed user intent = one undo entry.

Examples:

* Sequence reorder
* Set as First
* Add to Sequence
* Remove from Sequence
* node drag in Plan
* path-anchor drag
* connect
* delete

Sequence changes and graph changes remain separate operations.

A Sequence operation must not hide additional graph mutations inside the same history entry because this model deliberately makes topology authoring explicit.

---

# 23. Summary of behavioral rules

| Action               | Changes Sequence |                 Changes Graph |
| -------------------- | ---------------: | ----------------------------: |
| Move camera in Plan  |               No |            node position only |
| Curve path           |               No |                 path geometry |
| Connect cameras      |               No |                           Yes |
| Delete connection    |               No | Yes, if not Sequence-required |
| Add to Sequence      |              Yes |                            No |
| Reorder Sequence     |              Yes |                            No |
| Set as First         |              Yes |                            No |
| Remove from Sequence |              Yes |                            No |
| Preview camera       |               No |                            No |
| Preview connection   |               No |                            No |

The key product principle is:

> **Camera Plan authors spatial possibilities. Sequence selects one ordered traversal through those possibilities.**

This keeps camera placement, path shaping, branches, and future general-purpose camera workflows flexible without forcing every camera into one route-oriented model.
