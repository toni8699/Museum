import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	DEFAULT_EDITOR_SETTINGS,
	DEBOUNCE_MS,
	EDITOR_SETTINGS_KEY,
	EditorSettingsStore,
	loadEditorSettings,
	validateSettings,
	type EditorSettings
} from './settings-store.svelte';

function makeMemoryStorage(): Storage {
	const map = new Map<string, string>();
	const storage: Storage = {
		get length() {
			return map.size;
		},
		clear() {
			map.clear();
		},
		getItem(k: string) {
			return map.has(k) ? map.get(k)! : null;
		},
		key(i: number) {
			return Array.from(map.keys())[i] ?? null;
		},
		removeItem(k: string) {
			map.delete(k);
		},
		setItem(k: string, v: string) {
			map.set(k, v);
		}
	};
	return storage;
}

const VALID: EditorSettings = {
	translationStep: 0.5,
	rotationStepDegrees: 30,
	scaleStep: 0.2,
	snapDefaultOn: true,
	pivotMode: 'active-object'
};

describe('validateSettings', () => {
	it('returns defaults for null / undefined / non-object input', () => {
		expect(validateSettings(null)).toEqual(DEFAULT_EDITOR_SETTINGS);
		expect(validateSettings(undefined)).toEqual(DEFAULT_EDITOR_SETTINGS);
		expect(validateSettings('hello')).toEqual(DEFAULT_EDITOR_SETTINGS);
		expect(validateSettings(42)).toEqual(DEFAULT_EDITOR_SETTINGS);
		expect(validateSettings(true)).toEqual(DEFAULT_EDITOR_SETTINGS);
	});

	it('returns defaults when every field is invalid', () => {
		const raw = {
			translationStep: 'lots',
			rotationStepDegrees: -10,
			scaleStep: Number.NaN,
			snapDefaultOn: 'yes',
			pivotMode: 'magic'
		};
		expect(validateSettings(raw)).toEqual(DEFAULT_EDITOR_SETTINGS);
	});

	it('keeps valid per-field values and falls back for the rest', () => {
		const raw = {
			translationStep: 0.99,
			rotationStepDegrees: 7.8,
			scaleStep: 0.05,
			snapDefaultOn: false,
			pivotMode: 'center'
		};
		expect(validateSettings(raw)).toEqual({
			translationStep: 0.99,
			rotationStepDegrees: DEFAULT_EDITOR_SETTINGS.rotationStepDegrees,
			scaleStep: 0.05,
			snapDefaultOn: false,
			pivotMode: 'center'
		});
	});

	it('accepts edge-of-range values', () => {
		const raw = {
			translationStep: 0.01,
			rotationStepDegrees: 1,
			scaleStep: 0.5,
			snapDefaultOn: true,
			pivotMode: 'active-object'
		};
		expect(validateSettings(raw)).toEqual(raw);
	});

	it('rejects translationStep outside [0.01, 1.0]', () => {
		expect(validateSettings({ ...VALID, translationStep: 0.0 })).toMatchObject({
			translationStep: DEFAULT_EDITOR_SETTINGS.translationStep
		});
		expect(validateSettings({ ...VALID, translationStep: 1.01 })).toMatchObject({
			translationStep: DEFAULT_EDITOR_SETTINGS.translationStep
		});
		expect(validateSettings({ ...VALID, translationStep: Number.POSITIVE_INFINITY })).toMatchObject({
			translationStep: DEFAULT_EDITOR_SETTINGS.translationStep
		});
	});

	it('rejects rotationStepDegrees not integer or outside [1, 90]', () => {
		expect(validateSettings({ ...VALID, rotationStepDegrees: 0 })).toMatchObject({
			rotationStepDegrees: DEFAULT_EDITOR_SETTINGS.rotationStepDegrees
		});
		expect(validateSettings({ ...VALID, rotationStepDegrees: 91 })).toMatchObject({
			rotationStepDegrees: DEFAULT_EDITOR_SETTINGS.rotationStepDegrees
		});
		expect(validateSettings({ ...VALID, rotationStepDegrees: 7.5 })).toMatchObject({
			rotationStepDegrees: DEFAULT_EDITOR_SETTINGS.rotationStepDegrees
		});
	});

	it('rejects scaleStep outside [0.05, 0.5]', () => {
		expect(validateSettings({ ...VALID, scaleStep: 0.04 })).toMatchObject({
			scaleStep: DEFAULT_EDITOR_SETTINGS.scaleStep
		});
		expect(validateSettings({ ...VALID, scaleStep: 0.51 })).toMatchObject({
			scaleStep: DEFAULT_EDITOR_SETTINGS.scaleStep
		});
	});
});

describe('loadEditorSettings', () => {
	let memory: ReturnType<typeof makeMemoryStorage>;
	beforeEach(() => {
		memory = makeMemoryStorage();
	});
	afterEach(() => memory.clear());

	it('reads defaults when storage is empty', () => {
		expect(loadEditorSettings(memory)).toEqual(DEFAULT_EDITOR_SETTINGS);
	});

	it('returns all-defaults when stored JSON is malformed', () => {
		memory.setItem(EDITOR_SETTINGS_KEY, '{ this is not json');
		expect(loadEditorSettings(memory)).toEqual(DEFAULT_EDITOR_SETTINGS);
	});

	it('round-trips valid settings', () => {
		memory.setItem(EDITOR_SETTINGS_KEY, JSON.stringify(VALID));
		expect(loadEditorSettings(memory)).toEqual(VALID);
	});

	it('passes null storage back defaults', () => {
		expect(loadEditorSettings(null)).toEqual(DEFAULT_EDITOR_SETTINGS);
	});
});

describe('EditorSettingsStore', () => {
	let memory: ReturnType<typeof makeMemoryStorage>;
	beforeEach(() => {
		memory = makeMemoryStorage();
	});
	afterEach(() => memory.clear());

	it('hydrates with defaults on first construction', () => {
		const s = new EditorSettingsStore(memory);
		expect(s.settings).toEqual(DEFAULT_EDITOR_SETTINGS);
		expect(s.hydrated).toBe(true);
	});

	it('hydrates from stored JSON if present', () => {
		memory.setItem(EDITOR_SETTINGS_KEY, JSON.stringify(VALID));
		const s = new EditorSettingsStore(memory);
		expect(s.settings).toEqual(VALID);
	});

	it('set() updates state, validates per-key, persists', async () => {
		const s = new EditorSettingsStore(memory);
		s.set({ translationStep: 0.5, pivotMode: 'active-object' });
		expect(s.settings).toMatchObject({ translationStep: 0.5, pivotMode: 'active-object' });
		// Persist is debounced by DEBOUNCE_MS; wait one cycle.
		await new Promise((r) => setTimeout(r, DEBOUNCE_MS + 50));
		const persisted = memory.getItem(EDITOR_SETTINGS_KEY);
		expect(persisted).not.toBeNull();
		const parsed = JSON.parse(persisted!);
		expect(parsed).toMatchObject({ translationStep: 0.5, pivotMode: 'active-object' });
	});

	it('set() rejects invalid patch values silently and keeps last good', () => {
		const s = new EditorSettingsStore(memory);
		s.set({ translationStep: 0.33 });
		s.set({ translationStep: 5.0 as unknown as number });
		expect(s.settings.translationStep).toBe(0.33);
	});

	it('debounce coalesces rapid slider writes', async () => {
		const s = new EditorSettingsStore(memory);
		const writeSpy = vi.spyOn(memory, 'setItem');
		for (let i = 0; i < 10; i++) s.set({ translationStep: 0.25 + i * 0.01 });
		await new Promise((r) => setTimeout(r, DEBOUNCE_MS + 50));
		expect(writeSpy.mock.calls.length).toBeLessThan(10);
		expect(s.settings.translationStep).toBeCloseTo(0.34, 2);
	});

	it('reset() restores defaults + persists immediately', () => {
		const s = new EditorSettingsStore(memory);
		s.set({ translationStep: 0.9 });
		// Let any debounce fire so the original persists
		void s;
		// Reset before the debounce timer fires — reset must persist immediately.
		s.reset();
		expect(s.settings).toEqual(DEFAULT_EDITOR_SETTINGS);
		const persisted = memory.getItem(EDITOR_SETTINGS_KEY);
		expect(persisted).not.toBeNull();
		expect(JSON.parse(persisted!)).toEqual(DEFAULT_EDITOR_SETTINGS);
	});

	it('persists nothing when storage is null', () => {
		const s = new EditorSettingsStore(null);
		s.set({ translationStep: 0.9 });
		expect(s.settings.translationStep).toBe(0.9);
	});
});
