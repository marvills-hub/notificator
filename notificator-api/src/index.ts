import { createRemoteJWKSet, jwtVerify } from 'jose';

interface Env {
	DB: D1Database;

	GOOGLE_OAUTH_CLIENT_ID: string;
	GOOGLE_OAUTH_CLIENT_SECRET: string;
}

interface FirebaseTokenPayload {
	user_id?: string;
	sub?: string;
	email?: string;
}

interface GoogleTokenResponse {
	access_token?: string;
	refresh_token?: string;
	expires_in?: number;
	scope?: string;
	token_type?: string;
	error?: string;
	error_description?: string;
}

const FIREBASE_PROJECT_ID = 'notificator-d6266';

const GOOGLE_JWKS = createRemoteJWKSet(
	new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
);

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Headers': 'Authorization, Content-Type',
			'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
		},
	});
}

async function getFirebaseUser(request: Request): Promise<FirebaseTokenPayload> {
	const authorization = request.headers.get('Authorization');

	if (!authorization?.startsWith('Bearer ')) {
		throw new Error('Missing Firebase authorization token.');
	}

	const token = authorization.substring(7);

	const { payload } = await jwtVerify(token, GOOGLE_JWKS, {
		issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
		audience: FIREBASE_PROJECT_ID,
	});

	const uid = typeof payload.user_id === 'string' ? payload.user_id : typeof payload.sub === 'string' ? payload.sub : null;

	if (!uid) {
		throw new Error('Firebase token does not contain a valid user ID.');
	}

	return {
		user_id: uid,
		sub: typeof payload.sub === 'string' ? payload.sub : undefined,
		email: typeof payload.email === 'string' ? payload.email : undefined,
	};
}

async function googleTokenRequest(params: URLSearchParams): Promise<GoogleTokenResponse> {
	const response = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		body: params,
	});

	const data = (await response.json()) as GoogleTokenResponse;

	if (!response.ok) {
		throw new Error(data.error_description || data.error || `Google token request failed with status ${response.status}.`);
	}

	return data;
}

async function handleConfig(request: Request, env: Env): Promise<Response> {
	await getFirebaseUser(request);

	return json({
		clientId: env.GOOGLE_OAUTH_CLIENT_ID,
	});
}

async function handleExchange(request: Request, env: Env): Promise<Response> {
	const firebaseUser = await getFirebaseUser(request);

	const body = (await request.json()) as {
		code?: string;
		codeVerifier?: string;
		redirectUri?: string;
	};

	if (!body.code || !body.codeVerifier || !body.redirectUri) {
		return json(
			{
				error: 'code, codeVerifier and redirectUri are required.',
			},
			400,
		);
	}

	const params = new URLSearchParams({
		client_id: env.GOOGLE_OAUTH_CLIENT_ID,
		client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
		code: body.code,
		code_verifier: body.codeVerifier,
		grant_type: 'authorization_code',
		redirect_uri: body.redirectUri,
	});

	const tokens = await googleTokenRequest(params);

	if (!tokens.access_token) {
		return json(
			{
				error: 'Google did not return an access token.',
			},
			502,
		);
	}

	if (tokens.refresh_token) {
		await env.DB.prepare(
			`
      INSERT INTO gmail_connections (
        firebase_uid,
        refresh_token,
        email_address,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(firebase_uid)
      DO UPDATE SET
        refresh_token = excluded.refresh_token,
        email_address = excluded.email_address,
        updated_at = CURRENT_TIMESTAMP
      `,
		)
			.bind(firebaseUser.user_id, tokens.refresh_token, firebaseUser.email ?? null)
			.run();
	}

	return json({
		accessToken: tokens.access_token,
	});
}

async function handleRefresh(request: Request, env: Env): Promise<Response> {
	const firebaseUser = await getFirebaseUser(request);

	const connection = await env.DB.prepare(
		`
    SELECT refresh_token
    FROM gmail_connections
    WHERE firebase_uid = ?
    LIMIT 1
    `,
	)
		.bind(firebaseUser.user_id)
		.first<{ refresh_token: string }>();

	if (!connection?.refresh_token) {
		return json(
			{
				error: 'Gmail is not connected for this Notificator account.',
				connected: false,
			},
			404,
		);
	}

	const params = new URLSearchParams({
		client_id: env.GOOGLE_OAUTH_CLIENT_ID,
		client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
		refresh_token: connection.refresh_token,
		grant_type: 'refresh_token',
	});

	const tokens = await googleTokenRequest(params);

	if (!tokens.access_token) {
		return json(
			{
				error: 'Google did not return a refreshed access token.',
			},
			502,
		);
	}

	return json({
		accessToken: tokens.access_token,
		connected: true,
	});
}

async function handleDisconnect(request: Request, env: Env): Promise<Response> {
	const firebaseUser = await getFirebaseUser(request);

	await env.DB.prepare(
		`
		DELETE FROM gmail_connections
		WHERE firebase_uid = ?
		`,
	)
		.bind(firebaseUser.user_id)
		.run();

	return json({
		success: true,
		connected: false,
	});
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		if (request.method === 'OPTIONS') {
			return new Response(null, {
				status: 204,
				headers: {
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Headers': 'Authorization, Content-Type',
					'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
				},
			});
		}

		const url = new URL(request.url);

		try {
			if (url.pathname === '/api/gmail/config' && request.method === 'GET') {
				return await handleConfig(request, env);
			}

			if (url.pathname === '/api/gmail/exchange' && request.method === 'POST') {
				return await handleExchange(request, env);
			}

			if (url.pathname === '/api/gmail/refresh' && request.method === 'POST') {
				return await handleRefresh(request, env);
			}

			if (url.pathname === '/api/gmail/disconnect' && request.method === 'POST') {
				return await handleDisconnect(request, env);
			}

			if (url.pathname === '/health') {
				return json({
					status: 'ok',
					service: 'notificator-api',
				});
			}

			return json(
				{
					error: 'Not found.',
				},
				404,
			);
		} catch (error) {
			console.error(error);

			return json(
				{
					error: error instanceof Error ? error.message : 'Unexpected server error.',
				},
				401,
			);
		}
	},
};
