import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	computeConfirmNavigation,
	createTextureLifecycle,
	createUnloadGuard,
	type BinaryTextureStoreLike,
	type EventTargetLike
} from '$lib/editor/hooks/editor-shell-boot-core';
import {
	__resetDefaultSourceLoaderForTests,
	loadSourceTexture,
	resetTextureCachesForTests,
	type TextureSourceLoader
} from '$lib/museum/materials/texture-cache';
import type { Texture as ThreeTexture } from 'three';

function makeUnloadEvent(returnValue: string) {
	return { preventDefault: vi.fn(), returnValue } as unknown as BeforeUnloadEvent;
}

function makeTarget() {
	const listeners = new Set<(event: BeforeUnloadEvent) => void>();
	const target: EventTargetLike = {
		addEventListener(_type, listener) {
			listeners.add(listener);
		},
		removeEventListener(_type, listener) {
			listeners.delete(listener);
		}
	};
	return { target, listeners };
}

const fakeTexture = {
	uuid: 'editor-shell-boot-fake',
	wrapS: 0,
	wrapT: 0,
	colorSpace: '',
	needsUpdate: false
} as unknown as ThreeTexture;

describe('computeConfirmNavigation', () => {
	it('needs no confirmation when neither scene nor layout is dirty', () => {
		expect(computeConfirmNavigation({ sceneDirty: false, layoutDirty: false })).toEqual({
			needsConfirmation: false,
			label: null
		});
	});

	it('labels scene-only, layout-only, and combined dirt', () => {
		expect(computeConfirmNavigation({ sceneDirty: true, layoutDirty: false })).toEqual({
			needsConfirmation: true,
			label: 'scene'
		});
		expect(computeConfirmNavigation({ sceneDirty: false, layoutDirty: true })).toEqual({
			needsConfirmation: true,
			label: 'layout'
		});
		expect(computeConfirmNavigation({ sceneDirty: true, layoutDirty: true })).toEqual({
			needsConfirmation: true,
			label: 'scene and layout'
		});
	});
});

describe('createUnloadGuard', () => {
	it('attaches and detaches the beforeunload listener idempotently', () => {
		const { target, listeners } = makeTarget();
		const guard = createUnloadGuard(target);

		expect(listeners.size).toBe(0);

		guard.attach();
		expect(listeners.size).toBe(1);
		guard.attach();
		expect(listeners.size).toBe(1);

		guard.detach();
		expect(listeners.size).toBe(0);
		guard.detach();
		expect(listeners.size).toBe(0);
	});

	it('the registered listener prevents unload and clears returnValue', () => {
		const { target, listeners } = makeTarget();
		const guard = createUnloadGuard(target);
		guard.attach();

		const event = makeUnloadEvent('keep-me');
		for (const listener of listeners) listener(event);

		expect(event.preventDefault).toHaveBeenCalledOnce();
		expect(event.returnValue).toBe('');
	});
});

describe('createTextureLifecycle', () => {
	beforeEach(() => {
		resetTextureCachesForTests();
		__resetDefaultSourceLoaderForTests();
	});

	afterEach(() => {
		resetTextureCachesForTests();
		__resetDefaultSourceLoaderForTests();
	});

	it('installs the injected loader as the active source dispatcher', async () => {
		const loader: TextureSourceLoader = vi.fn(async () => fakeTexture);
		const swept = vi.fn();
		const binaryStore: BinaryTextureStoreLike = {
			objectUrlFor: () => null,
			clearExcept: (retain) => swept(retain)
		};
		const lifecycle = createTextureLifecycle(loader, binaryStore);

		lifecycle.install();
		const loaded = await loadSourceTexture('/textures/installed-by-boot.png', 'map');

		expect(loader).toHaveBeenCalledWith('/textures/installed-by-boot.png', 'map');
		expect(loaded).toBe(fakeTexture);
	});

	it('teardown sweeps the binary store registry with an empty retain set', () => {
		const loader: TextureSourceLoader = vi.fn(async () => fakeTexture);
		const swept = vi.fn();
		const binaryStore: BinaryTextureStoreLike = {
			objectUrlFor: () => null,
			clearExcept: (retain) => swept(retain)
		};
		const lifecycle = createTextureLifecycle(loader, binaryStore);

		lifecycle.install();
		lifecycle.teardown();

		expect(swept).toHaveBeenCalledWith(new Set());
	});
});
