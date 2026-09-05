/** Presentation only: callers supply the existing document baseline and blockers. */
export function projectPersistencePresentation(input: {
	owned: boolean; dirty: boolean; saving: boolean; blocker: string | null;
}) {
	return {
		location: input.owned ? 'Cloud' : 'Local Session',
		label: input.saving ? 'Saving…' : input.blocker ? 'Save Blocked'
			: input.dirty ? (input.owned ? 'Save changes' : 'Save to Cloud')
			: input.owned ? 'Saved' : 'Session active',
		actionable: !input.saving && !input.blocker && input.dirty,
		hint: input.owned ? 'Project document cloud save state' : 'Draft exists only in current browser tab.'
	};
}
