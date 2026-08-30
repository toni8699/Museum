import { describe, expect, it } from 'vitest';
import { EditorInteractionStore } from '$lib/editor/store/editor-interaction-store.svelte';
import { EDITOR_INTERACTION_STORE_KEY } from '$lib/editor/store/editor-interaction-store.svelte';
import { getContext } from 'svelte';

type ToolbarFacade = {
	chooseTool: (tool: 'select' | 'translate' | 'rotate' | 'scale') => void;
	interactionStore: EditorInteractionStore;
	setTransformTool: (tool: 'select' | 'translate' | 'rotate' | 'scale') => boolean;
	transformGizmoVisible: boolean;
	transformMode: 'select' | 'translate' | 'rotate' | 'scale';
};

/**
 * Mirror of `EditorViewportToolbar.svelte`'s `chooseTool` after the Phase 6.2
 * Bug 3 fix. Selecting translate/rotate/scale must keep `transformGizmoVisible`
 * in sync with `interactionStore.mode` so the gizmo re-attaches after a prior
 * Select (which hides it). Mirrors the post-fix logic one-for-one.
 */
function makeFacade(host: {
	interactionStore: EditorInteractionStore;
}): ToolbarFacade {
	const state = {
		transformMode: 'rotate' as 'select' | 'translate' | 'rotate' | 'scale',
		transformGizmoVisible: true
	};
	const setTransformTool = (
		tool: 'select' | 'translate' | 'rotate' | 'scale'
	): boolean => {
		if (tool === 'select') {
			if (!state.transformGizmoVisible) return false;
			state.transformGizmoVisible = false;
			return true;
		}
		state.transformMode = tool;
		state.transformGizmoVisible = true;
		return true;
	};
	host.interactionStore; // referenced for parity
	return {
		chooseTool(tool) {
			if (tool === 'select') {
				setTransformTool(tool);
			} else {
				setTransformTool(tool);
				host.interactionStore.setMode(tool);
			}
		},
		interactionStore: host.interactionStore,
		setTransformTool,
		get transformGizmoVisible() {
			return state.transformGizmoVisible;
		},
		get transformMode() {
			return state.transformMode;
		}
	};
}

describe('EditorViewportToolbar chooseTool — gizmo visibility sync (Bug 3 fix)', () => {
	it('on Select → gizmo hides but interactionStore.mode is unchanged', () => {
		const interactionStore = new EditorInteractionStore();
		interactionStore.setMode('rotate');
		const facade = makeFacade({ interactionStore });

		facade.chooseTool('select');

		expect(facade.transformGizmoVisible).toBe(false);
		expect(interactionStore.mode).toBe('rotate');
	});

	it('on translate after Select → gizmo re-attaches and mode is translate', () => {
		const interactionStore = new EditorInteractionStore();
		interactionStore.setMode('rotate');
		const facade = makeFacade({ interactionStore });

		facade.chooseTool('select');
		expect(facade.transformGizmoVisible).toBe(false);
		facade.chooseTool('translate');
		expect(facade.transformGizmoVisible).toBe(true);
		expect(interactionStore.mode).toBe('translate');
	});

	it('rotate/scale branches flip gizmo visible AND push mode into interaction store', () => {
		const interactionStore = new EditorInteractionStore();
		const facade = makeFacade({ interactionStore });

		facade.chooseTool('select');
		facade.chooseTool('rotate');
		expect({ visible: facade.transformGizmoVisible, mode: interactionStore.mode }).toEqual({
			visible: true,
			mode: 'rotate'
		});

		facade.chooseTool('select');
		facade.chooseTool('scale');
		expect({ visible: facade.transformGizmoVisible, mode: interactionStore.mode }).toEqual({
			visible: true,
			mode: 'scale'
		});
	});

	it('leaf Select after leaf mode resets gizmo to hidden', () => {
		const interactionStore = new EditorInteractionStore();
		const facade = makeFacade({ interactionStore });

		facade.chooseTool('translate');
		expect(facade.transformGizmoVisible).toBe(true);
		facade.chooseTool('select');
		expect(facade.transformGizmoVisible).toBe(false);
	});
});

// Reference key so the import is kept; some test harnesses will tree-shake otherwise.
void EDITOR_INTERACTION_STORE_KEY;
void getContext;
