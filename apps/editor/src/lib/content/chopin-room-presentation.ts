import type { Project } from '$lib/project/project-types';
import {
	neutralVisitorRoomPresentation,
	type VisitorRoomPresentation
} from '$lib/visitor/room-presentation';

export type ChopinRoomId =
	| 'entrance'
	| 'poland'
	| 'departure'
	| 'paris'
	| 'workshop'
	| 'music-chamber'
	| 'legacy';

export type ChopinRoomPresentation = VisitorRoomPresentation;

export const neutralRoomPresentation: ChopinRoomPresentation = neutralVisitorRoomPresentation;

export const chopinRoomPresentation: Readonly<Record<ChopinRoomId, ChopinRoomPresentation>> = {
	entrance: {
		subtitle: 'The First Note', mood: 'Dark, narrow, anticipatory',
		color: '#1b1824', accentColor: '#8c79b8', shell: 'layout'
	},
	poland: {
		subtitle: 'Roots and Early Voice', mood: 'Warm domestic amber',
		color: '#7a4f28', accentColor: '#f0c578', shell: 'layout'
	},
	departure: {
		subtitle: 'Distance From Home', mood: 'Long, blue-grey, distant',
		color: '#334456', accentColor: '#9fb9d1', shell: 'layout'
	},
	paris: {
		subtitle: 'Artist, Teacher, Performer', mood: 'Intimate velvet and candlelight',
		color: '#56313a', accentColor: '#d69d65', shell: 'layout'
	},
	workshop: {
		subtitle: 'Composition and Nohant', mood: 'Sunlit studio dissolving into abstraction',
		color: '#8d816b', accentColor: '#b7d8ef', shell: 'layout'
	},
	'music-chamber': {
		subtitle: 'Chopin Through Form', mood: 'Circular, focused, luminous',
		color: '#17151c', accentColor: '#d6b35f', shell: 'bespoke'
	},
	legacy: {
		subtitle: 'Continuing Music', mood: 'Pale, sparse, brightening',
		color: '#d8d7d1', accentColor: '#d5b16b', shell: 'layout'
	}
};

export function validateChopinRoomPresentation(project: Project): void {
	const roomIds = new Set(project.layout.floors.flatMap((floor) => floor.rooms.map((room) => room.id)));
	for (const roomId of Object.keys(chopinRoomPresentation)) {
		if (!roomIds.has(roomId)) throw new Error(`Chopin presentation references unknown project room: ${roomId}`);
	}
}

export function getChopinRoomPresentation(roomId: string): ChopinRoomPresentation {
	return chopinRoomPresentation[roomId as ChopinRoomId] ?? neutralRoomPresentation;
}
