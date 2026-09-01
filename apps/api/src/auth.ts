export type VerifiedIdentity = { subject: string };

export type TokenVerifierResult = string | VerifiedIdentity | null | undefined;

/** Provider-neutral edge seam; the production adapter is added after approval. */
export type TokenVerifier = (token: string) => TokenVerifierResult | Promise<TokenVerifierResult>;

export function bearerToken(authorization: unknown): string | null {
	if (typeof authorization !== 'string') return null;
	const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
	return match?.[1] ?? null;
}

export async function verifyBearer(
	authorization: unknown,
	verifier: TokenVerifier | undefined
): Promise<VerifiedIdentity | null> {
	const token = bearerToken(authorization);
	if (!token || !verifier) return null;
	try {
		const result = await verifier(token);
		const subject = typeof result === 'string' ? result : result?.subject;
		return subject?.trim() ? { subject: subject.trim() } : null;
	} catch {
		return null;
	}
}
