import { describe, expect, it } from 'vitest';
import { projectPersistencePresentation } from '$lib/editor/app/project-persistence-presentation';

describe('Project Row persistence presentation', () => {
	it.each([
		[false, false, false, null, 'Local Session', 'Session active', false],
		[false, true, false, null, 'Local Session', 'Save to Cloud', true],
		[true, false, false, null, 'Cloud', 'Saved', false],
		[true, true, false, null, 'Cloud', 'Save changes', true],
		[true, true, true, 'Busy', 'Cloud', 'Saving…', false],
		[true, true, false, 'Invalid layout', 'Cloud', 'Save Blocked', false],
		[false, true, false, 'Missing texture', 'Local Session', 'Save Blocked', false]
	] as const)('keeps location independent from save state (%s, %s, %s, %s)',
		(owned, dirty, saving, blocker, location, label, actionable) => {
			expect(projectPersistencePresentation({ owned, dirty, saving, blocker }))
				.toMatchObject({ location, label, actionable });
		});
});
