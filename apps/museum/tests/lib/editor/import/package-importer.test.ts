import { beforeEach, describe, expect, it } from 'vitest';
import { unzipSync, zipSync } from 'fflate';
import { importPackage } from '$lib/editor/import/package-importer';
import {
	REWRITE_URI_PREFIX,
	derivePackageId
} from '@portfolio/project-model';
import { parseSceneDocumentJson } from '$lib/content/scene-codec';
import { sha256Bytes } from '@portfolio/project-model';
import baseSceneFixture from '$lib/content/scene.json';

async function buildMinimalValidPackage(): Promise<Uint8Array> {
	const textureBytes = new TextEncoder().encode('PNG_BYTES_PLACEHOLDER');
	const fingerprint = await sha256Bytes(textureBytes);
	const pkg = await derivePackageId([fingerprint]);

	const baseScene = baseSceneFixture as unknown as Record<string, unknown>;
	const scene = {
		...baseScene,
		textures: [
			{ id: 'walnut', name: 'Walnut Detail', uri: `${REWRITE_URI_PREFIX(pkg)}walnut.png` }
		],
		materials: []
	};
	const sceneParse = parseSceneDocumentJson(JSON.stringify(scene));
	if (!sceneParse.success) {
		throw new Error(
			`scene did not parse: ${sceneParse.issues.map((i) => i.code).join(', ')}`
		);
	}
	const manifest = {
		package: {
			id: pkg,
			createdAt: '2026-08-07T18:30:00.000Z',
			generator: 'editor-5.4',
			documentTitle: 'scene'
		},
		textures: [
			{
				assetId: 'walnut',
				originalName: 'walnut.png',
				mime: 'image/png',
				size: textureBytes.byteLength,
				fingerprint,
				destinationPath: 'textures/walnut.png'
			}
		]
	};
	return zipSync(
		{
			'scene.json': new TextEncoder().encode(sceneParse.canonicalJson),
			'manifest.json': new TextEncoder().encode(JSON.stringify(manifest)),
			'textures/walnut.png': textureBytes
		},
		{ level: 6 }
	);
}

function packZip(input: Record<string, Uint8Array>): Uint8Array {
	return zipSync(input, { level: 6 });
}

function readJson(zip: Uint8Array, name: string, mutate?: (obj: unknown) => unknown): Uint8Array {
	const map = unzipSync(zip);
	const raw = map[name];
	if (!raw) throw new Error(`missing ${name}`);
	const text = new TextDecoder().decode(raw);
	const obj: unknown = JSON.parse(text);
	if (mutate) {
		const mutated = mutate(obj) as Record<string, unknown>;
		return new TextEncoder().encode(JSON.stringify(mutated));
	}
	return raw;
}

describe('package-importer', () => {
	let bundle: Uint8Array;
	beforeEach(async () => {
		bundle = await buildMinimalValidPackage();
	});

	it('accepts a minimal valid .scenepack.zip', async () => {
		const result = await importPackage(bundle);
		if (result.status !== 'ok') {
			throw new Error(`expected ok, got rejected: ${result.reason} — ${result.detail}`);
		}
		expect(result.document.textures.length).toBe(1);
		expect(result.binaries.size).toBe(1);
		expect(result.packageId).toMatch(/^package-[0-9a-f]{12}$/);
	});

	it('rejects garbage bytes', async () => {
		const result = await importPackage(new Uint8Array([1, 2, 3, 4, 5, 6]));
		expect(result.status).toBe('rejected');
		if (result.status === 'rejected') expect(result.reason).toBe('format-unsupported');
	});

	it('rejects missing scene.json', async () => {
		const manifestBytes = readJson(bundle, 'manifest.json');
		const map = unzipSync(bundle);
		const sceneBytes = map['scene.json']!;
		void sceneBytes;
		const result = await importPackage(packZip({ 'manifest.json': manifestBytes }));
		expect(result.status).toBe('rejected');
		if (result.status === 'rejected') expect(result.reason).toBe('missing-bytes');
	});

	it('rejects legacy archive carrying museum-scene.json (format hard break)', async () => {
		// Everything is byte-identical to the valid bundle except the scene
		// member's name — a legacy fallback would have to accept this archive.
		const map = unzipSync(bundle);
		const sceneBytes = map['scene.json']!;
		const manifestBytes = map['manifest.json']!;
		const textureBytes = map['textures/walnut.png']!;
		const result = await importPackage(
			packZip({
				'museum-scene.json': sceneBytes,
				'manifest.json': manifestBytes,
				'textures/walnut.png': textureBytes
			})
		);
		expect(result.status).toBe('rejected');
		if (result.status === 'rejected') expect(result.reason).toBe('missing-bytes');
	});

	it('rejects missing manifest.json', async () => {
		const map = unzipSync(bundle);
		const sceneBytes = map['scene.json']!;
		const result = await importPackage(packZip({ 'scene.json': sceneBytes }));
		expect(result.status).toBe('rejected');
		if (result.status === 'rejected') expect(result.reason).toBe('missing-bytes');
	});

	it('rejects on fingerprint mismatch', async () => {
		const map = unzipSync(bundle);
		const bytes = map['textures/walnut.png']!;
		const tampered = new Uint8Array(bytes);
		tampered[tampered.length - 1] = (tampered[tampered.length - 1]! ^ 0xff) & 0xff;
		const sceneBytes = map['scene.json']!;
		const manifestBytes = map['manifest.json']!;
		const result = await importPackage(
			packZip({
				'scene.json': sceneBytes,
				'manifest.json': manifestBytes,
				'textures/walnut.png': tampered
			})
		);
		expect(result.status).toBe('rejected');
		if (result.status === 'rejected') expect(result.reason).toBe('fingerprint-mismatch');
	});

	it('rejects when manifest entry not referenced in JSON', async () => {
		const manifestBytes = readJson(bundle, 'manifest.json', (obj) => {
			const o = obj as { textures: Array<Record<string, unknown>> };
			o.textures.push({
				assetId: 'extra',
				originalName: 'extra.png',
				mime: 'image/png',
				size: 1,
				fingerprint: 'sha256-0000000000000000000000000000000000000000000000000000000000000000',
				destinationPath: 'textures/extra.png'
			});
			return o;
		});
		const sceneBytes = unzipSync(bundle)['scene.json']!;
		const result = await importPackage(packZip({ 'scene.json': sceneBytes, 'manifest.json': manifestBytes }));
		expect(result.status).toBe('rejected');
		if (result.status === 'rejected') expect(result.reason).toBe('manifest-mismatch');
	});

	it('rejects when rewritten scene contains unsafe URI', async () => {
		// The codec's strict v6 parse already rejects unsafe URIs as a structural
		// error before the importer cross-check runs. Either 'schema-mismatch'
		// or 'unsafe-uri' is acceptable defence-in-depth; we only assert the
		// package is rejected.
		const sceneBytes = readJson(bundle, 'scene.json', (obj) => {
			const o = obj as { textures: Array<{ uri: string }> };
			o.textures[0]!.uri = 'https://example.com/x.png';
			return o;
		});
		const manifestBytes = unzipSync(bundle)['manifest.json']!;
		const result = await importPackage(packZip({ 'scene.json': sceneBytes, 'manifest.json': manifestBytes }));
		expect(result.status).toBe('rejected');
		if (result.status === 'rejected') {
			expect(['unsafe-uri', 'schema-mismatch']).toContain(result.reason);
		}
	});

	it('rejects when scene JSON is not strict-parseable', async () => {
		const invalidScene = new TextEncoder().encode(
			'{"version":99,"textures":[],"materials":[],"entities":[],"navigationNodes":[],"connections":[]}'
		);
		const manifestBytes = unzipSync(bundle)['manifest.json']!;
		const result = await importPackage(packZip({ 'scene.json': invalidScene, 'manifest.json': manifestBytes }));
		expect(result.status).toBe('rejected');
		if (result.status === 'rejected') expect(result.reason).toBe('schema-mismatch');
	});
});
