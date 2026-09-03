<script lang="ts">
	// Twin of the legacy MuseumEditorApp (mounted at /museum/editor). The editor
	// replaces the top-level chrome; the boot glue (dirty guard + texture
	// lifecycle) is shared via `useEditorShellBoot`, and only the shortcut wiring
	// below is shell-owned.
	import type { Asset } from '$lib/types/assets';
	import { onMount, setContext, untrack } from 'svelte';
	import { env } from '$env/dynamic/public';
	// P3.2 — canonical token architecture + Inter Variable (Design-specs §37).
	import '@fontsource-variable/inter';
	import '$lib/editor/styles/tokens.css';
	import '$lib/editor/styles/editor-shell.css';
	import '$lib/editor/styles/controls.css';
	import '$lib/editor/styles/inspector.css';
	import '$lib/editor/styles/timeline.css';
	import '$lib/editor/styles/plan.css';
	import EditorCameraTimelineFrame from '$lib/editor/camera/EditorCameraTimelineFrame.svelte';
	import EditorInspector from '$lib/editor/EditorInspector.svelte';
	import EditorMaterialChoiceDialog from '$lib/editor/EditorMaterialChoiceDialog.svelte';
	import EditorSidebar from './EditorSidebar.svelte';
	import { registerEditorShortcuts } from '$lib/editor/hooks/shortcuts.svelte';
	import {
		EditorInteractionStore,
		EDITOR_INTERACTION_STORE_KEY
	} from '$lib/editor/store/editor-interaction-store.svelte';
	import { createEditorStore } from '$lib/editor/editor-store.svelte';
	import {
		createEmptyProject,
		validateProject
	} from '$lib/project/project-codec';
	import type { ProjectDocument } from '$lib/project/project-types';
	import { createLayoutRoomRegistry } from '$lib/project/project-layout-semantics';
	import { serializeSceneDocument } from '$lib/content/scene-codec';
	import { serializeLayoutDocument } from '$lib/layout/layout-codec';
	import { hasBlockingLayoutIssues } from '$lib/layout/layout-geometry-validation';
	import { computeCloudSaveBlocker } from '$lib/editor/store/project-export-store.svelte';
	import {
		captureLayoutPreviewSnapshot,
		createEmptyLayoutPreviewState,
		derivePreviewBundle,
		installLayoutPreviewBundle,
		layoutPreviewCanonicalJson,
		layoutPreviewIsDirty,
		markLayoutPreviewSaved,
		restoreLayoutPreviewSnapshot
	} from '$lib/editor/layout/layout-preview-state.svelte';
	import { useEditorShellBoot } from '$lib/editor/hooks/editor-shell-boot.svelte';
	import {
		clearLayoutSelection,
		createLayoutInteractionState,
		reconcileLayoutSelection,
		setLayoutViewMode
	} from '$lib/editor/layout/layout-interaction';
	import EditorAppBar from './EditorAppBar.svelte';
	import PlanWorkspace from './PlanWorkspace.svelte';
	import Workspace3DView from './Workspace3DView.svelte';
	import CameraPlanWorkspace from './CameraPlanWorkspace.svelte';
	import StatusBar from './StatusBar.svelte';
	import { createCameraPlanState } from '$lib/editor/camera-plan/camera-plan-state.svelte';
	import { createEditorContextMenuStore } from '$lib/editor/context-menu/context-menu-state.svelte';
	import ContextMenu from '$lib/editor/context-menu/ContextMenu.svelte';
	import { EditorViewState } from './editor-view-state.svelte';
	import {
		ACTIVE_EDITOR_SELECTION_KEY,
		EditorActiveSelectionStore
	} from './active-editor-selection.svelte';
	import { SCENE_GIZMO_POLICY } from '$lib/editor/gizmo/scene-gizmo-adapter.svelte';
	import { CAMERA_GIZMO_POLICY } from '$lib/editor/gizmo/camera-gizmo-adapter.svelte';
	import { projectDomainGizmoCapabilities } from '$lib/editor/gizmo/editor-gizmo-policy';
	import { resolveLayoutGizmoTarget } from '$lib/editor/gizmo/layout-gizmo-target';
	import { buildPlanSceneFootprintProjection } from '$lib/editor/layout/plan-scene-footprint';
	import { resolveEditorPlacementScale } from '$lib/editor/scale-vector';
	import {
		createProjectAuth,
		createProjectApi,
		createProjectId,
		clearPendingCloudSave,
		projectFingerprint,
		ProjectPersistenceError,
		readPendingCloudSave,
		sameProjectFingerprint,
		writePendingCloudSave,
		type ProjectPersistenceConfig,
		type ProjectSummary
	} from '$lib/editor/project-persistence';

	let {
		projectId: routeProjectId = null,
		loadOwnedProject = false,
		resumePendingSave = false,
		projectPersistence = null
	}: {
		projectId?: string | null;
		loadOwnedProject?: boolean;
		resumePendingSave?: boolean;
		projectPersistence?: ProjectPersistenceConfig | null;
	} = $props();
	const configuredProjectPersistence = untrack(() => projectPersistence);
	const initialProjectId = untrack(() => routeProjectId || 'project:untitled');

	// the editor boots blank on every load: one canonical empty project
	// seeds both the scene-only store and the layout-only preview surface.
	const bootProject = createEmptyProject({
		id: initialProjectId,
		name: 'Untitled project'
	});
	let projectId = $state<string | null>(untrack(() => routeProjectId));
	let projectName = $state(bootProject.name);
	let savedProjectName = $state(bootProject.name);
	let projectVersion = $state<number | null>(null);
	let ownedProjects = $state<ProjectSummary[]>([]);
	let cloudError = $state<string | null>(null);
	let cloudStatus = $state<'disabled' | 'ready' | 'loading' | 'saving' | 'error'>('disabled');
	let sessionStatus = $state<'checking' | 'authenticated' | 'unauthenticated' | 'error'>('unauthenticated');
	let projectMutationInFlight = $state(false);
	let projectRequestToken = 0;
	let projectRequestController: AbortController | null = null;
	let projectMutationEpoch = 0;
	let projectListRequestToken = 0;
	let saveAuthGateOpen = $state(false);
	let pendingSaveActive = $state(untrack(() => resumePendingSave));
	const projectApiOrigin = configuredProjectPersistence?.apiOrigin ?? env.PUBLIC_API_ORIGIN;
	const projectAuth =
		configuredProjectPersistence?.auth ??
		(projectApiOrigin
			? createProjectAuth(projectApiOrigin, configuredProjectPersistence?.fetch)
			: null);
	const projectApi = createProjectApi(
		{
			apiOrigin: projectApiOrigin
		},
		configuredProjectPersistence?.fetch
	);
	if (projectApi) {
		cloudStatus = 'ready';
		sessionStatus = 'checking';
	}
	const layoutPreview = $state(createEmptyLayoutPreviewState());
	const layoutInteraction = $state(createLayoutInteractionState());
	// Construct before the store: the selection activation hook gates its
	// cross-domain clear through the current Scene Plan authority.
	const viewState = new EditorViewState();
	const store = createEditorStore({
		document: bootProject.scene,
		rooms: createLayoutRoomRegistry(bootProject.layout),
		// an actionable scene/camera pick clears the layout selection
		// (detach-then-attach: the new domain lands, the previous one drops).
		onSelectionActivate: (source) => {
			const stagingScenePick =
				source === 'workspace' &&
				viewState.domain === 'scene' &&
				viewState.activeView === 'plan' &&
				layoutInteraction.planViewMode === 'staging';
			if (!stagingScenePick) clearLayoutSelection(layoutInteraction);
		}
	});
	// P1.5 — Camera Plan session state owned here, high enough to survive the
	// Camera Plan ↔ Camera 3D component swap and separate from Scene Plan state.
	// `$state` deep-proxies `planView`/`tool`/`hover` so the viewport's pan,
	// zoom, hover, and tool mutations stay reactive (Scene Plan wraps the same
	// way via `layoutInteraction`).
	const cameraPlanState = $state(createCameraPlanState());
	// P3.4 — one shared context-menu slot; surface adapters open through it.
	const contextMenu = createEditorContextMenuStore();
	// one active selection domain at the editor composition root.
	const activeSelection = new EditorActiveSelectionStore(
		store,
		layoutInteraction,
		viewState,
		() => clearLayoutSelection(layoutInteraction)
	);
	setContext(ACTIVE_EDITOR_SELECTION_KEY, activeSelection);
	store.registerLayoutHistory({
		capture: () => captureLayoutPreviewSnapshot(layoutPreview),
		replace: (snapshot) => restoreLayoutPreviewSnapshot(layoutPreview, snapshot as ReturnType<typeof captureLayoutPreviewSnapshot>),
		matches: (a, b) => JSON.stringify((a as { project: { layout: unknown } }).project.layout) === JSON.stringify((b as { project: { layout: unknown } }).project.layout)
	});

	// keep the store's room registry live: every layout mutation
	// replaces `layoutPreview.project`, so re-derive the registry from the
	// current layout. Without this, `store.rooms.has(draftedRoomId)` stays
	// false and camera/primitive placement on a drafted room is rejected
	// ("Click a tagged room floor") and node creation would throw on
	// the unknown room. `updateRooms` also re-resolves the runtime scene, so a
	// moved room immediately moves the rendered node/entity helpers.
	$effect(() => {
		// Scene and layout commit separate history entries (atomic cross-domain
		// history is deferred to S8), so a layout undo can outrun a scene that
		// references it — the new registry would fail to resolve. Keep the
		// previous consistent snapshot rather than crashing the editor; the
		// divergence surfaces through the normal scene-mutation path.
		try {
			store.updateRooms(createLayoutRoomRegistry(layoutPreview.project.layout));
		} catch (error) {
			console.error('Editor: skipped room-registry sync (layout/scene divergence)', error);
		}
	});

	// activating the layout domain (a Plan pick) detaches any actionable
	// scene/camera pick. The guard + writes live on the wrapper so the contract
	// is unit-testable; the effect is a thin reactive trigger.
	$effect(() => {
		// Establish the sole reactive dependency before untracking the facade's
		// workspace/mode reads. Mode switches re-gate authority; only a genuine
		// Layout slot change may detach another slot.
		JSON.stringify(layoutInteraction.selection);
		untrack(() => activeSelection.onLayoutSelectionChanged());
	});

	// re-validate the layout selection against the live layout after
	// every layout swap (undo/redo/commit/cancel/delete/reset/import), including
	// paths that bypass the layout history bridge. Converges in one pass: the
	// reconciled selection is written only when it differs. The compare is
	// structural rather than reference-identity so the effect stays idempotent
	// even if `reconcileLayoutSelection` ever returns a fresh-but-equal object
	// for the valid case (which would otherwise re-write and loop).
	$effect(() => {
		const layout = layoutPreview.project.layout;
		const reconciled = reconcileLayoutSelection(layoutInteraction.selection, layout);
		if (
			JSON.stringify(reconciled) !== JSON.stringify(layoutInteraction.selection)
		) {
			layoutInteraction.selection = reconciled;
		}
	});

	// Map the domain×view matrix onto the legacy store's `currentWorkspace`.
	// The layout view mode follows the *view* (plan cells → 'plan', 3D cells →
	// '3d' — keeping Plan-only placement tools disabled in 3D, per the
	// inspector's Place accordion + primitive guard reads). The workspace
	// follows the domain: Scene plan owns the layout workspace, Scene 3D owns
	// scene, and **both Camera cells keep the camera workspace** (G3) so
	// `setWorkspace`'s timeline-expansion / preview-stop / pending-navigation
	// side effects never fire on Camera 3D ↔ Plan toggles.
	$effect(() => {
		const isPlan = viewState.activeView === 'plan';
		setLayoutViewMode(layoutInteraction, isPlan ? 'plan' : '3d');
		if (viewState.domain === 'camera') {
			store.setWorkspace('camera');
		} else if (isPlan) {
			store.setWorkspace('layout');
		} else {
			store.setWorkspace('scene');
		}
	});

	// Phase 6.1 — single shared FSM sub-store. Set on context so every editor
	// child reads the same reactive state.
	const interactionStore = new EditorInteractionStore();
	setContext(EDITOR_INTERACTION_STORE_KEY, interactionStore);

	// resolve the active layout selection's descriptor so the toolbar /
	// shortcuts publish its per-kind policy (`null` for a stale/missing
	// identity, which stays inert).
	const layoutDescriptor = $derived(
		activeSelection.active.domain === 'layout'
			? resolveLayoutGizmoTarget(
					layoutPreview.project.layout,
					layoutPreview.geometry,
					layoutInteraction.selection
				)
			: null
	);

	// step 6 — the active target's generic capability projection for the
	// W/E/R/T shortcuts. Same policies + projection the toolbar and the host
	// use, so an unsupported mode can never start through one and be refused
	// by another. `null` for a stale layout identity / no target.
	const activeGizmoCapabilities = $derived.by(() =>
		projectDomainGizmoCapabilities(
			activeSelection.active.domain,
			interactionStore.mode,
			{
				scene: SCENE_GIZMO_POLICY,
				camera: CAMERA_GIZMO_POLICY,
				layout: layoutDescriptor?.policy ?? null
			}
		)
	);

	function canDeleteSceneSelection(): boolean {
		if (viewState.domain !== 'scene') return false;
		if (viewState.activeView === '3d') return true;
		// P10 — in Arrange the scene Delete gate applies only while the Scene
		// slot is the active owner (a Layout-object target routes Delete to the
		// layout pipeline instead).
		if (activeSelection.active.domain !== 'scene') return false;
		if (layoutInteraction.planViewMode !== 'staging' || store.selectedClusterId !== null) {
			return false;
		}
		const eligible = new Set(
			buildPlanSceneFootprintProjection(store.document, store.rooms, {
				getEffectiveScale: (entity) =>
					resolveEditorPlacementScale(entity.scale, store.getPlacementScaleVector(entity.id))
			}).footprints.map((footprint) => footprint.entityId)
		);
		return store.selectedPlacementIds.every((id) => eligible.has(id));
	}

	let outlinerElement = $state<HTMLElement | null>(null);
	let viewportElement = $state<HTMLElement | null>(null);
	let clusterNameInput = $state<HTMLInputElement>();
	let selectedAsset = $state<Asset>();
	const projectIsDirty = $derived(
		store.isDirty ||
		layoutPreviewIsDirty(layoutPreview) ||
		projectName !== savedProjectName
	);

	// P7.4 — shared boot composable (dirty guard + texture lifecycle only).
	// Shortcut wiring stays shell-owned; see `useEditorShellBoot`.
	const { confirmSceneReplacement, confirmLayoutReplacement } = useEditorShellBoot({
		store,
		layoutPreview,
		projectNameDirty: () => projectName !== savedProjectName
	});

	function currentProjectFingerprint() {
		return projectFingerprint(
			store.canonicalJson ?? JSON.stringify(store.document),
			layoutPreviewCanonicalJson(layoutPreview),
			projectName
		);
	}

	function setCloudError(message: string): void {
		cloudError = message;
		cloudStatus = 'error';
		store.setStatusMessage(message);
	}

	function persistenceMessage(error: unknown, fallback: string): string {
		return error instanceof ProjectPersistenceError ? error.message : fallback;
	}

	function clearExpiredProjectSession(error: unknown): boolean {
		if (!(error instanceof ProjectPersistenceError) || error.code !== 'auth') return false;
		sessionStatus = 'unauthenticated';
		ownedProjects = [];
		projectListRequestToken += 1;
		return true;
	}

	type SaveSnapshot = {
		project: ProjectDocument;
		sceneCanonicalJson: string;
		layoutCanonicalJson: string;
	};

	function canCaptureProjectSnapshot(): boolean {
		if (projectMutationInFlight) return false;
		if (store.isEditorInteractionActive || store.isDocumentTransactionActive) {
			setCloudError('Stop the current interaction before saving');
			return false;
		}
		return true;
	}

	function canStartProjectMutation(): boolean {
		if (!projectApi) {
			setCloudError('Cloud Save/Load is not configured');
			return false;
		}
		if (sessionStatus !== 'authenticated') {
			setCloudError('Sign-in is required');
			return false;
		}
		if (projectMutationInFlight) return false;
		if (store.isEditorInteractionActive || store.isDocumentTransactionActive) {
			setCloudError('Stop the current interaction before changing projects');
			return false;
		}
		return true;
	}

	function confirmProjectReplacement(): boolean {
		return !projectIsDirty || window.confirm('Discard unsaved project changes?');
	}

	async function refreshOwnedProjects(signal?: AbortSignal): Promise<void> {
		if (!projectApi || sessionStatus !== 'authenticated') return;
		const requestToken = ++projectListRequestToken;
		const mutationEpoch = projectMutationEpoch;
		try {
			const projects = await projectApi.listProjects(signal);
			if (
				requestToken !== projectListRequestToken ||
				mutationEpoch !== projectMutationEpoch ||
				projectMutationInFlight
			) return;
			ownedProjects = projects;
			cloudError = null;
			cloudStatus = 'ready';
		} catch (error) {
			if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) return;
			if (clearExpiredProjectSession(error)) {
				setCloudError('Sign-in is required');
				return;
			}
			if (
				requestToken === projectListRequestToken &&
				mutationEpoch === projectMutationEpoch &&
				!projectMutationInFlight
			) {
				setCloudError(persistenceMessage(error, 'Could not list cloud projects'));
			}
		}
	}

	async function bootstrapProjectSession(signal?: AbortSignal): Promise<void> {
		if (!projectApi || !projectAuth) {
			if (resumePendingSave) setCloudError('Cloud Save/Load is not configured');
			return;
		}
		sessionStatus = 'checking';
		cloudStatus = 'loading';
		cloudError = null;
		try {
			const session = await projectAuth.getSession(signal);
			if (!session.authenticated) {
				sessionStatus = 'unauthenticated';
				ownedProjects = [];
				cloudStatus = 'ready';
				if (resumePendingSave) setCloudError('Sign-in is required to resume this save');
				return;
			}
			sessionStatus = 'authenticated';
			await refreshOwnedProjects(signal);
			if (signal?.aborted || sessionStatus !== 'authenticated') return;
			if (resumePendingSave) await resumePendingCloudSave();
			else if (loadOwnedProject && projectId) await loadProject(projectId);
		} catch (error) {
			if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) return;
			if (clearExpiredProjectSession(error)) {
				setCloudError('Sign-in is required');
				return;
			}
			sessionStatus = 'error';
			setCloudError(persistenceMessage(error, 'Could not check sign-in status'));
		}
	}

	async function signInToProjects(): Promise<void> {
		if (!projectAuth?.signIn) return;
		try {
			cloudStatus = 'ready';
			cloudError = null;
			await projectAuth.signIn('projects');
		} catch (error) {
			setCloudError(persistenceMessage(error, 'Sign-in failed'));
		}
	}

	function captureValidatedSaveSnapshot(): SaveSnapshot | null {
		if (!canCaptureProjectSnapshot()) return null;
		const name = projectName.trim();
		if (!name) {
			setCloudError('Project name cannot be empty');
			return null;
		}
		if (store.projectCloudSaveBlocker) {
			setCloudError('Save blocked: resolve texture asset references first');
			return null;
		}
		if (hasBlockingLayoutIssues(layoutPreview.issues)) {
			setCloudError(`Save blocked: ${layoutPreview.issues[0]?.message ?? 'Layout geometry is invalid'}`);
			return null;
		}

		const saveProjectId = projectId ?? createProjectId();
		const validation = validateProject({
			id: saveProjectId,
			name,
			layout: layoutPreview.project.layout,
			scene: store.document
		});
		if (!validation.success) {
			setCloudError(`Save blocked: ${validation.issues[0]?.message ?? 'Project validation failed'}`);
			return null;
		}
		const snapshot = JSON.parse(validation.canonicalJson) as ProjectDocument;
		return {
			project: snapshot,
			sceneCanonicalJson: serializeSceneDocument(snapshot.scene),
			layoutCanonicalJson: serializeLayoutDocument(snapshot.layout)
		};
	}

	async function submitSaveSnapshot(snapshot: SaveSnapshot): Promise<boolean> {
		if (!canStartProjectMutation()) return false;
		// Defense in depth for resumed/stale handoff drafts: every payload must
		// pass the cloud durability gate immediately before leaving the browser.
		if (computeCloudSaveBlocker(snapshot.project.scene)) {
			setCloudError('Save blocked: resolve texture asset references first');
			return false;
		}
		const token = ++projectRequestToken;
		const controller = new AbortController();
		projectRequestController = controller;
		projectMutationInFlight = true;
		projectMutationEpoch += 1;
		if (projectId === null) projectId = snapshot.project.id;
		cloudStatus = 'saving';
		cloudError = null;
		try {
			const saved = await projectApi!.saveProject(snapshot.project, controller.signal);
			if (token !== projectRequestToken) return false;
			projectId = saved.projectId;
			projectVersion = saved.version;
			savedProjectName = snapshot.project.name;
			if (projectName.trim() === snapshot.project.name) projectName = snapshot.project.name;
			store.markSaved(snapshot.sceneCanonicalJson);
			markLayoutPreviewSaved(layoutPreview, snapshot.layoutCanonicalJson);
			ownedProjects = [
				{ id: saved.projectId, name: saved.name, version: saved.version, updatedAt: saved.updatedAt },
				...ownedProjects.filter((project) => project.id !== saved.projectId)
			];
			if (pendingSaveActive) {
				clearPendingCloudSave();
				pendingSaveActive = false;
			}
			cloudStatus = 'ready';
			store.setStatusMessage(`Saved ${saved.name} v${saved.version}`);
			return true;
		} catch (error) {
			if (token === projectRequestToken && !controller.signal.aborted) {
				clearExpiredProjectSession(error);
				setCloudError(persistenceMessage(error, 'Could not save project'));
			}
			return false;
		} finally {
			if (token === projectRequestToken) {
				projectMutationEpoch += 1;
				projectMutationInFlight = false;
				projectRequestController = null;
			}
		}
	}

	async function signOutFromProjects(): Promise<void> {
		if (!projectAuth || projectMutationInFlight) return;
		try {
			cloudStatus = 'loading';
			cloudError = null;
			await projectAuth.signOut();
			projectListRequestToken += 1;
			ownedProjects = [];
			sessionStatus = 'unauthenticated';
			cloudStatus = 'ready';
			store.setStatusMessage('Signed out');
		} catch (error) {
			setCloudError(persistenceMessage(error, 'Sign-out failed'));
		}
	}

	async function saveProject(): Promise<void> {
		if (!projectApi) {
			setCloudError('Cloud Save/Load is not configured');
			return;
		}
		if (sessionStatus !== 'authenticated') {
			if (projectAuth?.signIn) {
				saveAuthGateOpen = true;
				cloudError = null;
			} else {
				setCloudError('Sign-in is required');
			}
			return;
		}
		const snapshot = captureValidatedSaveSnapshot();
		if (snapshot) await submitSaveSnapshot(snapshot);
	}

	async function continueSaveAuthentication(): Promise<void> {
		if (!projectAuth?.signIn) return;
		if (pendingSaveActive) {
			const pending = readPendingCloudSave();
			if (pending.status === 'ready') {
				if (pending.project.id !== projectId) {
					setCloudError('The pending save draft does not match this project');
					return;
				}
				saveAuthGateOpen = false;
				try {
					await projectAuth.signIn('save');
				} catch (error) {
					saveAuthGateOpen = true;
					setCloudError(persistenceMessage(error, 'Sign-in failed'));
				}
				return;
			}
			pendingSaveActive = false;
		}
		const snapshot = captureValidatedSaveSnapshot();
		if (!snapshot) return;
		if (!writePendingCloudSave(snapshot.project)) {
			setCloudError('Could not preserve the project before sign-in');
			return;
		}
		pendingSaveActive = true;
		saveAuthGateOpen = false;
		try {
			await projectAuth.signIn('save');
		} catch (error) {
			saveAuthGateOpen = true;
			setCloudError(persistenceMessage(error, 'Sign-in failed'));
		}
	}

	function discardPendingSave(): void {
		clearPendingCloudSave();
		pendingSaveActive = false;
		saveAuthGateOpen = false;
		store.setStatusMessage('Discarded pending save draft');
	}

	async function resumePendingCloudSave(): Promise<void> {
		const pending = readPendingCloudSave();
		if (pending.status !== 'ready') {
			pendingSaveActive = false;
			if (pending.status === 'expired') setCloudError('The pending save draft expired');
			return;
		}
		if (projectId !== pending.project.id) {
			clearPendingCloudSave();
			pendingSaveActive = false;
			setCloudError('The pending save draft does not match this project');
			return;
		}
		if (store.isEditorInteractionActive || store.isDocumentTransactionActive) {
			setCloudError('Stop the current interaction before resuming this save');
			return;
		}

		let bundle: ReturnType<typeof derivePreviewBundle>;
		try {
			bundle = derivePreviewBundle(
				pending.project.id,
				pending.project.name,
				pending.project.layout,
				pending.project.scene
			);
		} catch {
			clearPendingCloudSave();
			pendingSaveActive = false;
			setCloudError('The pending save draft is invalid');
			return;
		}
		if (hasBlockingLayoutIssues(bundle.issues)) {
			clearPendingCloudSave();
			pendingSaveActive = false;
			setCloudError('The pending save draft has invalid layout geometry');
			return;
		}

		const sceneBaseline = store.baselineCanonicalJson;
		const rooms = createLayoutRoomRegistry(pending.project.layout);
		if (!store.replaceProjectDocument(pending.project.scene, rooms)) {
			setCloudError('Could not restore the pending save draft');
			return;
		}
		installLayoutPreviewBundle(layoutPreview, bundle);
		setLayoutViewMode(layoutInteraction, viewState.activeView === 'plan' ? 'plan' : '3d');
		// Replacement installs a temporary clean baseline; restore the blank boot
		// baseline so a failed resumed Save leaves the draft visibly dirty.
		store.markSaved(sceneBaseline);
		activeSelection.reset();
		projectName = pending.project.name;
		projectVersion = null;
		pendingSaveActive = true;
		await submitSaveSnapshot({
			project: pending.project,
			sceneCanonicalJson: serializeSceneDocument(pending.project.scene),
			layoutCanonicalJson: serializeLayoutDocument(pending.project.layout)
		});
	}

	async function loadProject(selectedProjectId: string): Promise<void> {
		if (!canStartProjectMutation() || !confirmProjectReplacement()) return;
		const fingerprint = currentProjectFingerprint();
		const token = ++projectRequestToken;
		const controller = new AbortController();
		projectRequestController = controller;
		projectMutationInFlight = true;
		projectMutationEpoch += 1;
		cloudStatus = 'loading';
		cloudError = null;
		try {
			const loaded = await projectApi!.loadProject(selectedProjectId, controller.signal);
			const validation = validateProject(loaded.document);
			if (!validation.success || validation.project.id !== selectedProjectId) {
				throw new ProjectPersistenceError('invalid', 'Loaded project failed validation');
			}
			const bundle = derivePreviewBundle(
				validation.project.id,
				validation.project.name,
				validation.project.layout,
				validation.project.scene
			);
			if (hasBlockingLayoutIssues(bundle.issues)) {
				throw new ProjectPersistenceError('invalid', 'Loaded project has invalid layout geometry');
			}
			if (!sameProjectFingerprint(fingerprint, currentProjectFingerprint())) {
				throw new ProjectPersistenceError('invalid', 'Project changed while loading; please load again');
			}
			if (store.isEditorInteractionActive || store.isDocumentTransactionActive) {
				throw new ProjectPersistenceError('invalid', 'Project changed while loading; please load again');
			}
			const rooms = createLayoutRoomRegistry(validation.project.layout);
			if (!store.replaceProjectDocument(validation.project.scene, rooms)) {
				throw new ProjectPersistenceError('invalid', 'Could not replace the current project');
			}
			installLayoutPreviewBundle(layoutPreview, bundle);
			setLayoutViewMode(layoutInteraction, viewState.activeView === 'plan' ? 'plan' : '3d');
			store.markSaved(serializeSceneDocument(validation.project.scene));
			markLayoutPreviewSaved(layoutPreview, serializeLayoutDocument(validation.project.layout));
			activeSelection.reset();
			projectId = loaded.projectId;
			projectName = validation.project.name;
			savedProjectName = validation.project.name;
			projectVersion = loaded.version;
			cloudStatus = 'ready';
			store.setStatusMessage(`Loaded ${validation.project.name} v${loaded.version}`);
		} catch (error) {
			if (token === projectRequestToken && !controller.signal.aborted) {
				clearExpiredProjectSession(error);
				setCloudError(persistenceMessage(error, 'Could not load project'));
			}
		} finally {
			if (token === projectRequestToken) {
				projectMutationEpoch += 1;
				projectMutationInFlight = false;
				projectRequestController = null;
			}
		}
	}

	onMount(() => {
		const controller = new AbortController();
		void bootstrapProjectSession(controller.signal);
		return () => {
			controller.abort();
			projectRequestController?.abort();
		};
	});

	onMount(() =>
		registerEditorShortcuts(
			store,
			{
				getViewportElement: () => viewportElement,
				getOutlinerElement: () => outlinerElement,
				getClusterNameInput: () => clusterNameInput
			},
			interactionStore,
			() => activeSelection.deselectActive(),
			// the stale-identity gate: a live layout selection publishes
			// its descriptor policy (the caps check below refuses disallowed
			// modes); only a stale layout identity refuses W/E/R/T/X outright.
			() => activeSelection.active.domain === 'layout' && layoutDescriptor === null,
			// step 6 — refuse modes the active target's policy does not allow.
			() => activeGizmoCapabilities,
			() => viewState.domain === 'scene' && viewState.activeView === '3d',
			canDeleteSceneSelection
		)
	);

</script>

<main class="page editor-page" class:previewing={store.isDocumentMutationBlocked}>
	<EditorAppBar
		{store}
		{layoutPreview}
		{viewState}
		{confirmSceneReplacement}
		{confirmLayoutReplacement}
		{projectName}
		projectIsDirty={projectIsDirty}
		onProjectNameChange={(name) => (projectName = name)}
		onSaveProject={saveProject}
		onLoadProject={loadProject}
		onRefreshProjects={() => void refreshOwnedProjects()}
		onSignIn={projectAuth?.signIn ? signInToProjects : undefined}
		onSignOut={projectAuth?.signOut ? signOutFromProjects : undefined}
		{sessionStatus}
		{ownedProjects}
		{cloudStatus}
		{cloudError}
		{saveAuthGateOpen}
		onContinueSaveAuth={continueSaveAuthentication}
		onCancelSaveAuth={() => (saveAuthGateOpen = false)}
		pendingSaveActive={pendingSaveActive}
		onDiscardPendingSave={discardPendingSave}
		onReset={() => activeSelection.reset()}
	/>
	<EditorSidebar
		{store}
		{layoutPreview}
		{layoutInteraction}
		{activeSelection}
		{viewState}
		{contextMenu}
		bind:outlinerElement
		onAssetSelection={(asset) => (selectedAsset = asset)}
		// Explicit Models-tab click: detach the active scene selection so the
		// asset panel (details + Place) shows immediately — browsing/filtering
		// never fires this (only `onAssetSelection`), so a scene pick survives
		// search. Deselection is not a document mutation — no history entry.
		onSelectAsset={() => activeSelection.deselectActive()}
	/>
	<!-- svelte-ignore a11y_no_noninteractive_tabindex (the WebGL viewport owns guarded editor shortcuts) -->
	<div
		bind:this={viewportElement}
		class="center"
		role="application"
		aria-label="Editor viewport"
		tabindex="0"
		onpointerdown={(event) => event.currentTarget.focus()}
		style="grid-area: center;"
	>
		<!-- P1.7 owner follow-up — view/domain switches are INSTANT (no fade):
		     the 3D cell is one component for both domains and both plan
		     surfaces stay mounted, so a switch only toggles visibility. -->
		{#if viewState.activeView === 'plan'}
			<!-- P1.7 review fix — Plan parity with the 3D cell: both plan
		     surfaces stay mounted across Scene ⇄ Camera (G3 pattern), so
		     each keeps its pan/zoom and local state; only the sidebar/menu
		     functionality swaps, instantly (owner: no fade). The hidden cell
		     is `inert` + visibility-hidden. -->
			<div
				class="plan-cell"
				class:plan-cell--hidden={viewState.domain !== 'scene'}
				inert={viewState.domain !== 'scene'}
			>
				<PlanWorkspace
					{store}
					{layoutPreview}
					{layoutInteraction}
					active={viewState.domain === 'scene'}
					{contextMenu}
				/>
			</div>
			<div
				class="plan-cell"
				class:plan-cell--hidden={viewState.domain !== 'camera'}
				inert={viewState.domain !== 'camera'}
			>
				<!-- P1.5 — Camera → Plan is the live camera-graph authoring surface. -->
				<CameraPlanWorkspace {store} {layoutPreview} cameraPlan={cameraPlanState} {contextMenu} />
			</div>
		{:else}
			<!-- explicit 3D context seam: camera authoring overlays and
			     the bottom timeline are Camera-only; Scene stays scene chrome. -->
			<Workspace3DView {store} {layoutPreview} {layoutInteraction} context={viewState.domain} {contextMenu} />
		{/if}
		{#if viewState.domain === 'camera'}
			<EditorCameraTimelineFrame {store} viewMode={viewState.activeView} {contextMenu} />
		{/if}
	</div>
	<EditorInspector
		{store}
		{layoutPreview}
		{layoutInteraction}
		{activeSelection}
		{selectedAsset}
		viewMode={viewState.activeView}
		{viewState}
		bind:clusterNameInput
	/>
	<!-- P1.1 (design-spec §2/§18) — persistent status bar in every workspace. -->
	<StatusBar {store} {layoutPreview} {layoutInteraction} {viewState} {activeSelection} />
	<EditorMaterialChoiceDialog {store} />
	<!-- P3.4 — the one shared context-menu shell. -->
	<ContextMenu store={contextMenu} />
</main>

<style>
	:global(body) { margin: 0; }
	.page {
		display: grid;
		grid-template-columns: minmax(15rem, var(--editor-left-width)) minmax(0, 1fr) minmax(17.5rem, var(--editor-right-width));
		grid-template-rows: auto minmax(0, 1fr) auto;
		grid-template-areas:
			'top top top'
			'left center right'
			'status status status';
		height: 100vh;
		height: 100dvh;
		overflow: hidden;
		background: var(--editor-bg-app);
		color: var(--editor-text-primary);
		font-family: var(--editor-font);
	}
	.center { position: relative; min-width: 0; min-height: 0; overflow: hidden; outline: none; }
	.center:focus-visible { box-shadow: inset 0 0 0 1px var(--editor-accent); }

	/* P1.7 review fix — both plan surfaces stay mounted (G3 pattern). The
	   hidden cell flips instantly (owner: no fade on view/domain switches)
	   and `inert` strips it from interaction + the a11y tree. */
	.plan-cell {
		position: absolute;
		inset: 0;
		min-width: 0;
		min-height: 0;
	}
	.plan-cell--hidden {
		visibility: hidden;
	}

	@media (max-width: 78rem) {
		.page { grid-template-columns: minmax(14rem, 22vw) minmax(0, 1fr) minmax(14rem, 24vw); }
	}

	@media (max-width: 62rem) {
		.page {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
			grid-template-rows: auto minmax(24rem, 58vh) minmax(16rem, 34rem) auto;
			grid-template-areas:
				'top top'
				'center center'
				'left right'
				'status status';
			height: auto;
			min-height: 100vh;
			min-height: 100dvh;
			overflow-y: auto;
		}
	}

	@media (max-width: 44rem) {
		.page {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: auto minmax(22rem, 55vh) minmax(16rem, 30rem) minmax(18rem, 30rem) auto;
			grid-template-areas:
				'top'
				'center'
				'left'
				'right'
				'status';
		}
	}
</style>
