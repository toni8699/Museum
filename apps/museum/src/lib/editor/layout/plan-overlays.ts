import type { LayoutRoom, LayoutVec2 } from '$lib/layout/layout-types';
import type { LayoutPreviewModel } from './layout-mesh-factory';
import {
	primitiveDraftFootprint,
	rectanglePoints,
	type LayoutInteractionState,
	type LayoutSelection
} from './layout-interaction';
import { worldToPlanScreen, type PlanViewportState } from './layout-plan-transform';
import { geometryId } from '$lib/layout/layout-geometry-types';
import type {
	PlanHitIdentity,
	PlanInteractionProjection,
	PlanRenderPrimitive,
	PlanSelection,
	PlanStyleToken
} from '$lib/layout/plan-render-model';

/**
 * Transient interaction overlays, derived editor-side into world-space
 * `PlanRenderPrimitive` records. Screen-constant sizing/offsets are carried as
 * px hints (`radiusPx`/`offsetPx`) for the SVG adapter to apply after the view
 * transform. No Svelte/DOM imports; the viewport forwards interaction state
 * into this projection instead of computing overlay screen coordinates.
 */

const ROTATION_HANDLE_OFFSET_PX = 28;
const ROTATION_FEEDBACK_OFFSET_PX = 40;
const DIMENSION_LABEL_OFFSET_PX = 5;

function roomVertices(room: LayoutRoom): LayoutVec2[] {
	return room.boundary.segments.map((segment) => [...segment.start] as LayoutVec2);
}

function selectedPoints(interaction: LayoutInteractionState, selectedRoom: LayoutRoom | undefined): LayoutVec2[] {
	if (!selectedRoom) return [];
	if (interaction.editing?.roomId === selectedRoom.id) return interaction.editing.currentPoints;
	return roomVertices(selectedRoom);
}

/** World top-center of a room's plan bounds (min-Z edge midpoint = screen top). */
function roomTopCenter(model: LayoutPreviewModel, roomId: string): LayoutVec2 | null {
	const room = model.rooms.find((candidate) => candidate.roomId === roomId);
	if (!room) return null;
	const xs = room.floorPolygon.map(([x]) => x);
	const zs = room.floorPolygon.map(([, z]) => z);
	const minX = Math.min(...xs);
	const maxX = Math.max(...xs);
	const minZ = Math.min(...zs);
	return [(minX + maxX) / 2, minZ];
}

function rotationFeedbackText(interaction: LayoutInteractionState): string | null {
	const drag = interaction.roomUnitDrag;
	if (!drag || drag.mode !== 'rotate') return null;
	const degrees = Math.round((drag.yaw * 180) / Math.PI);
	return `${degrees >= 0 ? '+' : ''}${degrees}°`;
}

/** Editor selection → renderer-neutral selection identity for the model. */
function toPlanSelection(selection: LayoutSelection): PlanSelection {
	switch (selection.kind) {
		case 'none':
			return { kind: 'none' };
		case 'room':
			return { kind: 'room', roomId: selection.roomId };
		case 'wall':
			return { kind: 'wall', roomId: selection.roomId, segmentId: selection.segmentId };
		case 'opening':
			return { kind: 'opening', roomId: selection.roomId, segmentId: selection.segmentId, openingId: selection.openingId };
		case 'interiorAnchor':
			return { kind: 'interiorAnchor', roomId: selection.roomId, segmentId: selection.segmentId, anchorId: selection.anchorId };
		case 'object':
			return { kind: 'object', objectId: selection.objectId };
	}
}

/** Screen position of the rotation handle (top-center + 28px vertical offset). */
export function rotationHandleScreenPoint(
	planView: PlanViewportState,
	projection: PlanInteractionProjection
): LayoutVec2 | null {
	const handle = projection.selection.find(
		(primitive) => primitive.kind === 'circle' && primitive.style === 'rotation-handle'
	);
	if (!handle || handle.kind !== 'circle') return null;
	const base = worldToPlanScreen(planView, handle.center);
	return [base[0] + (handle.offsetPx?.[0] ?? 0), base[1] + (handle.offsetPx?.[1] ?? 0)];
}

/** Convert a world-space pivot/handle pair for a component-owned SVG overlay. */
export function planHandleScreenPoints(
	planView: PlanViewportState,
	pivot: LayoutVec2,
	handle: LayoutVec2
): { pivot: LayoutVec2; handle: LayoutVec2 } {
	return {
		pivot: worldToPlanScreen(planView, pivot),
		handle: worldToPlanScreen(planView, handle)
	};
}

/** Add the P2 Scene placement rotation arm without moving SVG rendering into the viewport. */
export function withPlanSceneRotationHandle(
	projection: PlanInteractionProjection,
	overlay: { entityId: string; pivot: LayoutVec2; handle: LayoutVec2 } | null
): PlanInteractionProjection {
	if (!overlay) return projection;
	return {
		...projection,
		selection: [
			...projection.selection,
			{
				kind: 'polyline',
				key: geometryId(['plan', 'scene-overlay', 'rotation-arm', overlay.entityId]),
				points: [overlay.pivot, overlay.handle],
				style: 'rotation-arm'
			},
			{
				kind: 'circle',
				key: geometryId(['plan', 'scene-overlay', 'rotation-handle', overlay.entityId]),
				center: overlay.handle,
				radiusPx: 7,
				style: 'rotation-handle'
			}
		]
	};
}

/**
 * Add the P10 Plan layout-object yaw rotation arm (same handle contract as the
 * Scene staging handle; the layout-object handle orbits its own world pivot).
 */
export function withPlanObjectRotationHandle(
	projection: PlanInteractionProjection,
	overlay: { objectId: string; pivot: LayoutVec2; handle: LayoutVec2 } | null
): PlanInteractionProjection {
	if (!overlay) return projection;
	return {
		...projection,
		selection: [
			...projection.selection,
			{
				kind: 'polyline',
				key: geometryId(['plan', 'object-overlay', 'rotation-arm', overlay.objectId]),
				points: [overlay.pivot, overlay.handle],
				style: 'rotation-arm'
			},
			{
				kind: 'circle',
				key: geometryId(['plan', 'object-overlay', 'rotation-handle', overlay.objectId]),
				center: overlay.handle,
				radiusPx: 7,
				style: 'rotation-handle'
			}
		]
	};
}

function draftPolyline(interaction: LayoutInteractionState): LayoutVec2[] | null {
	if (interaction.tool === 'rectangle') return rectanglePoints(interaction);
	return interaction.polygonPoints.length > 0 ? interaction.polygonPoints : null;
}

function ghostStyle(interaction: LayoutInteractionState): PlanStyleToken {
	const draft = interaction.primitiveDraft;
	if (!draft) return 'primitive-ghost';
	if (!draft.valid) return 'primitive-ghost-invalid';
	if (draft.kind === 'sphere') return 'primitive-ghost-sphere';
	if (draft.kind === 'cylinder') return 'primitive-ghost-circle';
	return 'primitive-ghost';
}

export function buildPlanInteractionProjection(
	interaction: LayoutInteractionState,
	rooms: readonly LayoutRoom[],
	model: LayoutPreviewModel
): PlanInteractionProjection {
	const selection: PlanRenderPrimitive[] = [];
	const handles: PlanRenderPrimitive[] = [];
	const drafts: PlanRenderPrimitive[] = [];
	const labels: PlanRenderPrimitive[] = [];

	const activeSelection = interaction.selection;
	const selectedRoom =
		interaction.tool === 'select' && activeSelection.kind === 'room'
			? rooms.find((room) => room.id === activeSelection.roomId)
			: undefined;
	const points = selectedPoints(interaction, selectedRoom);

	if (selectedRoom && points.length > 0) {
		selection.push({
			kind: 'polygon',
			key: geometryId(['plan', 'overlay', 'selection-bounds', selectedRoom.id]),
			points: points.map(([x, z]) => [x, z] as LayoutVec2),
			style: 'selection-bounds'
		});
		const topCenter = roomTopCenter(model, selectedRoom.id);
		if (topCenter) {
			selection.push({
				kind: 'polyline',
				key: geometryId(['plan', 'overlay', 'rotation-arm', selectedRoom.id]),
				points: [topCenter, topCenter],
				endOffsetPx: [0, -ROTATION_HANDLE_OFFSET_PX],
				style: 'rotation-arm'
			});
			selection.push({
				kind: 'circle',
				key: geometryId(['plan', 'overlay', 'rotation-handle', selectedRoom.id]),
				center: topCenter,
				radiusPx: 7,
				offsetPx: [0, -ROTATION_HANDLE_OFFSET_PX],
				style: 'rotation-handle',
				hit: { kind: 'room', roomId: selectedRoom.id }
			});
			const feedback = rotationFeedbackText(interaction);
			if (feedback) {
				selection.push({
					kind: 'text',
					key: geometryId(['plan', 'overlay', 'rotation-feedback', selectedRoom.id]),
					anchor: topCenter,
					text: feedback,
					offsetPx: [0, -ROTATION_FEEDBACK_OFFSET_PX],
					style: 'rotation-feedback'
				});
			}
		}
		for (const [index, point] of points.entries()) {
			handles.push({
				kind: 'circle',
				key: geometryId(['plan', 'overlay', 'vertex-handle', selectedRoom.id, String(index)]),
				center: point,
				radiusPx: 6,
				style: 'vertex-handle',
				hit: { kind: 'vertex', roomId: selectedRoom.id, vertexIndex: index } satisfies PlanHitIdentity
			});
		}
		for (let edgeIndex = 0; edgeIndex < points.length; edgeIndex += 1) {
			const start = points[edgeIndex]!;
			const end = points[(edgeIndex + 1) % points.length]!;
			const edgeLength = model.rooms.find((room) => room.roomId === selectedRoom.id)?.walls[edgeIndex]?.length;
			const text = edgeLength === undefined
				? Math.hypot(end[0] - start[0], end[1] - start[1]).toFixed(2)
				: edgeLength.toFixed(2);
			labels.push({
				kind: 'text',
				key: geometryId(['plan', 'overlay', 'dimension-label', selectedRoom.id, String(edgeIndex)]),
				anchor: [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2],
				text: `${text} m`,
				offsetPx: [0, -DIMENSION_LABEL_OFFSET_PX],
				style: 'dimension-label'
			});
		}
	}

	for (const record of model.queries.points) {
		if (record.kind !== 'interior-anchor') continue;
		handles.push({
			kind: 'circle',
			key: geometryId(['plan', 'overlay', 'interior-anchor', record.roomId, record.segmentId, record.sourceId]),
			center: record.point,
			radiusPx: 5,
			style: activeSelection.kind === 'interiorAnchor' &&
				activeSelection.roomId === record.roomId &&
				activeSelection.segmentId === record.segmentId &&
				activeSelection.anchorId === record.sourceId
				? 'interior-anchor-selected'
				: 'interior-anchor',
			hit: { kind: 'interiorAnchor', roomId: record.roomId, segmentId: record.segmentId, anchorId: record.sourceId } satisfies PlanHitIdentity
		});
	}

	if (interaction.primitiveDraft) {
		drafts.push({
			kind: 'polygon',
			key: geometryId(['plan', 'overlay', 'primitive-ghost']),
			points: primitiveDraftFootprint(interaction.primitiveDraft),
			style: ghostStyle(interaction)
		});
	}

	const draft = draftPolyline(interaction);
	if (draft) {
		drafts.push({
			kind: 'polyline',
			key: geometryId(['plan', 'overlay', 'draft-outline']),
			points: draft,
			style: 'draft-outline'
		});
		for (const [index, point] of draft.entries()) {
			drafts.push({
				kind: 'circle',
				key: geometryId(['plan', 'overlay', 'draft-point', String(index)]),
				center: point,
				radiusPx: 5,
				style: 'draft-point'
			});
		}
	}

	const roomOverrides = interaction.editing
		? [{ roomId: interaction.editing.roomId, points: interaction.editing.currentPoints }]
		: [];

	const objectOverrides = interaction.objectDrag
		? model.objects
				.filter((object) => object.objectId === interaction.objectDrag!.objectId)
				.map((object) => {
					const drag = interaction.objectDrag!;
					const dx = drag.candidatePosition[0] - drag.originalPosition[0];
					const dz = drag.candidatePosition[2] - drag.originalPosition[2];
					const yawDelta = drag.candidateRotation[1] - drag.originalRotation[1];
					if (Math.abs(yawDelta) <= 1e-9) {
						return {
							objectId: object.objectId,
							points: object.planFootprint.map(([x, z]) => [x + dx, z + dz] as LayoutVec2)
						};
					}
					// Rotate around the object's world pivot using the shared positive-Y
					// Plan convention, then apply the translate delta.
					const cos = Math.cos(yawDelta);
					const sin = Math.sin(yawDelta);
					const pivot: LayoutVec2 = [object.position[0], object.position[2]];
					return {
						objectId: object.objectId,
						points: object.planFootprint.map(([x, z]) => {
							const lx = x - pivot[0];
							const lz = z - pivot[1];
							return [pivot[0] + cos * lx + sin * lz + dx, pivot[1] - sin * lx + cos * lz + dz] as LayoutVec2;
						})
					};
				})
		: [];

	return { selected: toPlanSelection(interaction.selection), selection, handles, drafts, labels, roomOverrides, objectOverrides };
}
