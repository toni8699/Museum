import { sha256Bytes } from '@portfolio/project-model';
import { ProjectPersistenceError } from '$lib/editor/project-persistence';

export async function registerVerifiedProjectAsset(
	bytes: Uint8Array,
	expectedSha256: string,
	register: (fingerprint: string) => unknown | Promise<unknown>
): Promise<void> {
	const fingerprint = await sha256Bytes(bytes);
	if (fingerprint !== expectedSha256) {
		throw new ProjectPersistenceError('invalid', 'Cloud asset bytes failed integrity validation');
	}
	await register(fingerprint);
}
