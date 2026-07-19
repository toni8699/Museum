import { describe, expect, it } from 'vitest';
import { museumSceneDocument, type MuseumSceneDocument } from './scene';
import {
	parseSceneDocumentJson,
	serializeSceneDocument,
	validateSceneDocument
} from './scene-codec';

function cloneDocument() {
	return JSON.parse(JSON.stringify(museumSceneDocument)) as MuseumSceneDocument;
}

describe('scene document codec', () => {
	it('serializes the checked-in scene canonically without mutating it', () => {
		const before = JSON.stringify(museumSceneDocument);
		const json = serializeSceneDocument(museumSceneDocument);
		const parsed = parseSceneDocumentJson(json);

		expect(json).toMatch(/^\{\n  "version": 1,\n  "objects": \[/);
		expect(json).toContain('\n  "navigationNodes": [');
		expect(json).not.toContain('\n  "clusters":');
		expect(json.endsWith('\n')).toBe(true);
		expect(parsed.success).toBe(true);
		if (parsed.success) expect(parsed.canonicalJson).toBe(json);
		expect(JSON.stringify(museumSceneDocument)).toBe(before);
	});

	it('canonicalizes numeric spelling while preserving array order and optional empty arrays', () => {
		const document = cloneDocument();
		document.clusters = [];
		document.objects[0]!.position[0] = -0;
		const json = serializeSceneDocument(document);
		const parsed = JSON.parse(json) as MuseumSceneDocument;

		expect(json).toContain('"clusters": []');
		expect(Object.is(parsed.objects[0]!.position[0], -0)).toBe(false);
		expect(parsed.objects.map((object) => object.id)).toEqual(document.objects.map((object) => object.id));
	});

	it('reports malformed JSON separately and rejects strict unknown or null fields', () => {
		const malformed = parseSceneDocumentJson('{\n  "version": 1,\n');
		expect(malformed).toEqual({
			success: false,
			issues: [expect.objectContaining({ path: '$', code: 'invalid_json' })]
		});

		const unknown = cloneDocument() as unknown as { navigationNodes: Array<Record<string, unknown>> };
		unknown.navigationNodes[0]!.cameraTaret = [0, 1, 2];
		const unknownResult = validateSceneDocument(unknown);
		expect(unknownResult.success).toBe(false);
		if (!unknownResult.success) expect(unknownResult.issues).toContainEqual(expect.objectContaining({ path: '$.navigationNodes[0].cameraTaret', code: 'unknown_property' }));

		const nullOptional = cloneDocument() as unknown as { navigationNodes: Array<Record<string, unknown>> };
		nullOptional.navigationNodes[0]!.nextNodeId = null;
		const nullResult = validateSceneDocument(nullOptional);
		expect(nullResult.success).toBe(false);
		if (!nullResult.success) expect(nullResult.issues).toContainEqual(expect.objectContaining({ path: '$.navigationNodes[0].nextNodeId', code: 'invalid_type' }));
	});

	it('reports graph, pose, and cluster semantic blockers', () => {
		const document = cloneDocument();
		document.navigationNodes[0]!.connectedNodeIds.push(document.navigationNodes[0]!.connectedNodeIds[0]!);
		document.navigationNodes[1]!.cameraTarget = [...document.navigationNodes[1]!.position];
		document.clusters = [
			{
				id: 'empty-name',
				name: 'Cluster',
				roomId: document.objects[0]!.roomId,
				memberIds: [document.objects[0]!.id, document.objects[0]!.id]
			}
		];
		const result = validateSceneDocument(document);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.issues.map((issue) => issue.code)).toEqual(
				expect.arrayContaining(['duplicate_adjacency', 'camera_target_too_close', 'duplicate_cluster_member'])
			);
		}
	});

	it('rejects split guided cycles even when the navigation graph remains connected', () => {
		const document = cloneDocument();
		const [a, b, c, d] = document.navigationNodes;
		a!.nextNodeId = b!.id;
		a!.previousNodeId = b!.id;
		b!.nextNodeId = a!.id;
		b!.previousNodeId = a!.id;
		c!.nextNodeId = d!.id;
		c!.previousNodeId = d!.id;
		d!.nextNodeId = c!.id;
		d!.previousNodeId = c!.id;
		const result = validateSceneDocument(document);
		expect(result.success).toBe(false);
		if (!result.success) expect(result.issues).toContainEqual(expect.objectContaining({ code: 'invalid_tour_cycle' }));
	});
});
