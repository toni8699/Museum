/** Turn stable placement ids into concise, human-readable outliner labels. */
export function formatPlacementLabel(id: string) {
	return id
		.trim()
		.split(/[-_\s]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
}

/** Prefer the authored product label while keeping imported/legacy nodes readable. */
export function formatCameraNodeLabel(label: string | undefined, id: string) {
	return label?.trim() || formatPlacementLabel(id);
}
