import {
	authorizationCodeGrant,
	buildAuthorizationUrl,
	calculatePKCECodeChallenge,
	ClientSecretPost,
	discovery,
	randomNonce,
	randomPKCECodeVerifier,
	randomState,
	type Configuration
} from 'openid-client';

const GOOGLE_ISSUER = new URL('https://accounts.google.com');

export type OidcAuthorizationRequest = {
	redirectUri: string;
	state: string;
	codeChallenge: string;
	nonce: string;
};

export type OidcCallbackRequest = {
	callbackUrl: URL;
	codeVerifier: string;
	expectedState: string;
	expectedNonce: string;
};

/** The only OIDC operations the API edge needs from its Google adapter. */
export type OidcClient = {
	createAuthorizationUrl(input: OidcAuthorizationRequest): Promise<URL | string>;
	exchangeAuthorizationCode(input: OidcCallbackRequest): Promise<{ subject: string }>;
};

export type OidcLoginState = {
	state: string;
	codeVerifier: string;
	nonce: string;
};

/**
 * Build the real Google adapter. Discovery is lazy so app construction and
 * tests never contact Google until a user starts the redirect flow.
 */
export function createGoogleOidc(input: {
	clientId: string;
	clientSecret: string;
}): OidcClient {
	let configurationPromise: Promise<Configuration> | undefined;
	const getConfiguration = () =>
		(configurationPromise ??= discovery(
			GOOGLE_ISSUER,
			input.clientId,
			{ client_secret: input.clientSecret },
			ClientSecretPost(input.clientSecret)
		));

	return {
		async createAuthorizationUrl(request) {
			const configuration = await getConfiguration();
			return buildAuthorizationUrl(configuration, {
				redirect_uri: request.redirectUri,
				scope: 'openid email profile',
				code_challenge: request.codeChallenge,
				code_challenge_method: 'S256',
				state: request.state,
				nonce: request.nonce
			});
		},
		async exchangeAuthorizationCode(request) {
			const configuration = await getConfiguration();
			const tokens = await authorizationCodeGrant(configuration, request.callbackUrl, {
				pkceCodeVerifier: request.codeVerifier,
				expectedState: request.expectedState,
				expectedNonce: request.expectedNonce,
				idTokenExpected: true
			});
			const subject = tokens.claims()?.sub;
			if (typeof subject !== 'string' || !subject.trim()) {
				throw new Error('OIDC identity has no subject');
			}
			return { subject };
		}
	};
}

export async function createOidcLoginState(): Promise<OidcLoginState & { codeChallenge: string }> {
	const codeVerifier = randomPKCECodeVerifier();
	return {
		state: randomState(),
		codeVerifier,
		nonce: randomNonce(),
		codeChallenge: await calculatePKCECodeChallenge(codeVerifier)
	};
}

/** Convert only a verified Google `sub` claim into the durable user id. */
export function googleUserId(subject: unknown): string | null {
	if (typeof subject !== 'string' || !/^[\x21-\x7e]{1,255}$/.test(subject)) return null;
	return `google:${subject}`;
}

export function isGoogleUserId(value: unknown): value is string {
	return typeof value === 'string' && /^google:[\x21-\x7e]{1,255}$/.test(value);
}
