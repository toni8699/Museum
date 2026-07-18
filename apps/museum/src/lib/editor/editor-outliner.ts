/** Turn stable placement ids into concise, human-readable outliner labels. */
export function formatPlacementLabel(id: string) {
	return id
		.trim()
		.split(/[-_\s]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
}
