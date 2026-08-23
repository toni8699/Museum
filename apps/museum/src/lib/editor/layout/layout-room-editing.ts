import type { LayoutDocument } from '$lib/layout/layout-types';

/**
 * Pure layout-domain room deletion ().
 *
 * Removes the room (with its openings, boundary segments, and interior
 * anchors) from its floor, deletes every layout object owned by the room
 * (`object.roomId === roomId`), and clears the `connectsRoomIds` portal
 * relation on any *other* room's door that references the deleted room.
 *
 * Scene references are deliberately NOT this module's concern — the editor
 * layer checks those first (reject-when-referenced policy) so a delete never
 * leaves a dangling `roomId` in `project.scene`. The returned document is not
 * validated here; callers run it through the layout codec / geometry gate.
 */
export function deleteLayoutRoom(
	document: LayoutDocument,
	roomId: string
): LayoutDocument | null {
	const floor = document.floors.find((candidate) =>
		candidate.rooms.some((room) => room.id === roomId)
	);
	if (!floor) return null;
	const floors = document.floors.map((candidate) =>
		candidate === floor
			? { ...candidate, rooms: candidate.rooms.filter((room) => room.id !== roomId) }
			: candidate
	);
	// Drop the deleted room's owned objects (rough primitives die with the
	// architecture they sketched) and clear portal relations held by other
	// rooms' doors so the strict codec never sees a dangling reference.
	const objects = document.objects.filter((object) => object.roomId !== roomId);
	const nextFloors = floors.map((candidate) => ({
		...candidate,
		rooms: candidate.rooms.map((room) => ({
			...room,
			openings: room.openings.map((opening) => {
				if (!opening.connectsRoomIds?.includes(roomId)) return opening;
				const next = { ...opening };
				delete next.connectsRoomIds;
				return next;
			})
		}))
	}));
	return { ...document, floors: nextFloors, objects };
}
