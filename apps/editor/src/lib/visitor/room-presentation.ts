/**
 * P21.4 — generic visitor room presentation.
 *
 * Neutral room tint data with no Chopin coupling. The legacy Chopin module
 * (content presentation for the frozen relic) re-exports this shape for its
 * caller records; the generic visitor shell + layout shell consume only this
 * module.
 * Type-only imports erase at runtime; the runtime neutral value has no
 * Chopin dependency.
 */

export type VisitorRoomPresentation = {
	subtitle?: string;
	mood?: string;
	color: string;
	accentColor: string;
	shell: 'layout' | 'bespoke';
};

export const neutralVisitorRoomPresentation: VisitorRoomPresentation = {
	color: '#4b4b52',
	accentColor: '#a6a6ad',
	shell: 'layout'
};
