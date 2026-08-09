export type PivotMode = 'center' | 'active-object';

export type EditorSettings = {
	translationStep: number;
	rotationStepDegrees: number;
	scaleStep: number;
	snapDefaultOn: boolean;
	pivotMode: PivotMode;
};

export const EDITOR_SETTINGS_KEY = 'museum-editor:settings:v1';

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
	translationStep: 0.25,
	rotationStepDegrees: 15,
	scaleStep: 0.1,
	snapDefaultOn: false,
	pivotMode: 'center'
};

export const DEBOUNCE_MS = 200;

const VALIDATORS = {
	translationStep(v: unknown): v is number {
		return typeof v === 'number' && Number.isFinite(v) && v >= 0.01 && v <= 1.0;
	},
	rotationStepDegrees(v: unknown): v is number {
		return Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 90;
	},
	scaleStep(v: unknown): v is number {
		return typeof v === 'number' && Number.isFinite(v) && v >= 0.05 && v <= 0.5;
	},
	snapDefaultOn(v: unknown): v is boolean {
		return typeof v === 'boolean';
	},
	pivotMode(v: unknown): v is PivotMode {
		return v === 'center' || v === 'active-object';
	}
};

/**
 * Validate arbitrary JSON-decoded values into EditorSettings.
 * Per-key: invalid value falls back to its default; valid value kept.
 * Non-object input → full defaults.
 */
export function validateSettings(raw: unknown): EditorSettings {
	const result: EditorSettings = { ...DEFAULT_EDITOR_SETTINGS };
	if (raw == null || typeof raw !== 'object') return result;
	const obj = raw as Record<keyof EditorSettings, unknown>;
	if (VALIDATORS.translationStep(obj.translationStep)) result.translationStep = obj.translationStep;
	if (VALIDATORS.rotationStepDegrees(obj.rotationStepDegrees))
		result.rotationStepDegrees = obj.rotationStepDegrees;
	if (VALIDATORS.scaleStep(obj.scaleStep)) result.scaleStep = obj.scaleStep;
	if (VALIDATORS.snapDefaultOn(obj.snapDefaultOn)) result.snapDefaultOn = obj.snapDefaultOn;
	if (VALIDATORS.pivotMode(obj.pivotMode)) result.pivotMode = obj.pivotMode;
	return result;
}

function getStorage(): Storage | null {
	if (typeof localStorage === 'undefined') return null;
	try {
		const probe = '__probe__';
		localStorage.setItem(probe, probe);
		localStorage.removeItem(probe);
		return localStorage;
	} catch {
		return null;
	}
}

export function loadEditorSettings(storage?: Storage | null): EditorSettings {
	const store = storage ?? getStorage();
	if (!store) return { ...DEFAULT_EDITOR_SETTINGS };
	const raw = store.getItem(EDITOR_SETTINGS_KEY);
	if (raw == null) return { ...DEFAULT_EDITOR_SETTINGS };
	try {
		return validateSettings(JSON.parse(raw));
	} catch {
		return { ...DEFAULT_EDITOR_SETTINGS };
	}
}

function persistSync(storage: Storage, settings: EditorSettings): void {
	storage.setItem(EDITOR_SETTINGS_KEY, JSON.stringify(settings));
}

export interface EditorSettingsStoreHandle {
	readonly settings: EditorSettings;
	readonly hydrated: boolean;
	set(patch: Partial<EditorSettings>): void;
	reset(): void;
}

/**
 * Reactive settings store backed by localStorage. Reads are atomic via `$state`.
 * Writes debounce for {@link DEBOUNCE_MS} milliseconds.
 */
export class EditorSettingsStore implements EditorSettingsStoreHandle {
	_settings = $state({ ...DEFAULT_EDITOR_SETTINGS });
	_hydrated = $state(false);
	private _storage: Storage | null;
	private _writeTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(storage?: Storage | null) {
		this._storage = storage ?? getStorage();
		this._settings = loadEditorSettings(this._storage);
		this._hydrated = true;
	}

	get settings(): EditorSettings {
		return this._settings;
	}

	get hydrated(): boolean {
		return this._hydrated;
	}

	set(patch: Partial<EditorSettings>): void {
		const next: EditorSettings = { ...this._settings };
		if (patch.translationStep !== undefined && VALIDATORS.translationStep(patch.translationStep))
			next.translationStep = patch.translationStep;
		if (patch.rotationStepDegrees !== undefined && VALIDATORS.rotationStepDegrees(patch.rotationStepDegrees))
			next.rotationStepDegrees = patch.rotationStepDegrees;
		if (patch.scaleStep !== undefined && VALIDATORS.scaleStep(patch.scaleStep))
			next.scaleStep = patch.scaleStep;
		if (patch.snapDefaultOn !== undefined && VALIDATORS.snapDefaultOn(patch.snapDefaultOn))
			next.snapDefaultOn = patch.snapDefaultOn;
		if (patch.pivotMode !== undefined && VALIDATORS.pivotMode(patch.pivotMode))
			next.pivotMode = patch.pivotMode;
		this._settings = next;
		this._schedulePersist();
	}

	reset(): void {
		this._settings = { ...DEFAULT_EDITOR_SETTINGS };
		if (this._writeTimer != null) clearTimeout(this._writeTimer);
		if (this._storage) persistSync(this._storage, this._settings);
	}

	private _schedulePersist(): void {
		if (!this._storage) return;
		if (this._writeTimer != null) clearTimeout(this._writeTimer);
		const captured = { storage: this._storage, settings: this._settings };
		this._writeTimer = setTimeout(() => {
			persistSync(captured.storage, captured.settings);
			this._writeTimer = null;
		}, DEBOUNCE_MS);
	}
}

export const SETTINGS_STORE_KEY = Symbol('museum-editor:settings-store');
