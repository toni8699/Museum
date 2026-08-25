import type { SceneConnection, SceneDocument } from '$lib/content/scene';
import type { CameraConnectionDirection } from '$lib/types/scene';
import type { EditorCameraPreview } from '../editor-types';
import { formatCameraNodeLabel } from '../editor-outliner';

export type CameraEdgePreviewChoice = {
	direction: CameraConnectionDirection;
	fromNodeId: string;
	toNodeId: string;
	label: string;
};

function nodeLabel(document: SceneDocument, nodeId: string): string {
	const node = document.navigationNodes.find((candidate) => candidate.id === nodeId);
	return formatCameraNodeLabel(node?.label, nodeId);
}

function choice(
	document: SceneDocument,
	connection: SceneConnection,
	direction: CameraConnectionDirection
): CameraEdgePreviewChoice {
	const fromNodeId = direction === 'forward' ? connection.fromNodeId : connection.toNodeId;
	const toNodeId = direction === 'forward' ? connection.toNodeId : connection.fromNodeId;
	return {
		direction,
		fromNodeId,
		toNodeId,
		label: `${nodeLabel(document, fromNodeId)} → ${nodeLabel(document, toNodeId)}`
	};
}

/**
 * P3B.5 preview grammar. A sequence-adjacent undirected edge has one direct
 * action whose direction comes only from predecessor → immediate successor.
 * Every other edge exposes both explicit directions in endpoint order.
 */
export function getCameraEdgePreviewChoices(
	document: SceneDocument,
	guidedNodeIds: readonly string[],
	connection: SceneConnection
): { sequenceAdjacent: boolean; choices: CameraEdgePreviewChoice[] } {
	for (let index = 0; index + 1 < guidedNodeIds.length; index += 1) {
		const predecessor = guidedNodeIds[index];
		const successor = guidedNodeIds[index + 1];
		if (
			(predecessor === connection.fromNodeId && successor === connection.toNodeId) ||
			(predecessor === connection.toNodeId && successor === connection.fromNodeId)
		) {
			return {
				sequenceAdjacent: true,
				choices: [
					choice(
						document,
						connection,
						predecessor === connection.fromNodeId ? 'forward' : 'reverse'
					)
				]
			};
		}
	}
	return {
		sequenceAdjacent: false,
		choices: [choice(document, connection, 'forward'), choice(document, connection, 'reverse')]
	};
}

export function getCameraPreviewScopeLabel(
	document: SceneDocument,
	preview: Exclude<EditorCameraPreview, null>,
	sequenceLabel = 'Main Visitor Tour'
): string {
	if (preview.kind === 'camera') {
		return `Preview: Camera · ${nodeLabel(document, preview.nodeId)}`;
	}
	if (preview.kind === 'sequence') return `Preview: Sequence · ${sequenceLabel}`;
	return `Preview: Edge · ${nodeLabel(document, preview.fromNodeId)} → ${nodeLabel(document, preview.toNodeId)}`;
}
