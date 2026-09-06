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

interface GmailProfileResponse {
	emailAddress?: string;
	messagesTotal?: number;
	threadsTotal?: number;
	historyId?: string;
}

interface GmailConnectionRow {
	id: number;
	firebase_uid?: string;
	gmail_account_id: string;
	email_address: string;
	refresh_token: string;
	is_primary: number;
	created_at: string;
	updated_at: string;
}

interface GmailAccountRequest {
	accountId?: string;
	emailAddress?: string;
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

async function readOptionalJson<T extends object>(request: Request): Promise<Partial<T>> {
	const text = await request.text();

	if (!text.trim()) {
		return {};
	}

	try {
		return JSON.parse(text) as Partial<T>;
	} catch {
		throw new Error('Invalid JSON request body.');
	}
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

async function getGmailProfile(accessToken: string): Promise<GmailProfileResponse> {
	const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
		headers: {
			Authorization: `Bearer ${accessToken}`,
		},
	});

	const data = (await response.json()) as GmailProfileResponse & {
		error?: {
			message?: string;
		};
	};

	if (!response.ok) {
		throw new Error(data.error?.message || `Unable to load Gmail profile. Status: ${response.status}.`);
	}

	if (!data.emailAddress) {
		throw new Error('Google did not return the Gmail email address.');
	}

	return data;
}

async function findGmailConnection(env: Env, firebaseUid: string, accountId?: string): Promise<GmailConnectionRow | null> {
	if (accountId) {
		return env.DB.prepare(
			`
			SELECT
				id,
				gmail_account_id,
				email_address,
				refresh_token,
				is_primary,
				created_at,
				updated_at
			FROM gmail_connections
			WHERE firebase_uid = ?
				AND gmail_account_id = ?
				AND email_address <> 'unknown'
			LIMIT 1
			`,
		)
			.bind(firebaseUid, accountId)
			.first<GmailConnectionRow>();
	}

	return env.DB.prepare(
		`
		SELECT
			id,
			gmail_account_id,
			email_address,
			refresh_token,
			is_primary,
			created_at,
			updated_at
		FROM gmail_connections
		WHERE firebase_uid = ?
			AND email_address <> 'unknown'
		ORDER BY is_primary DESC, created_at ASC
		LIMIT 1
		`,
	)
		.bind(firebaseUid)
		.first<GmailConnectionRow>();
}

async function handleConfig(request: Request, env: Env): Promise<Response> {
	await getFirebaseUser(request);

	const configured = Boolean(env.GOOGLE_OAUTH_CLIENT_ID?.trim()) && Boolean(env.GOOGLE_OAUTH_CLIENT_SECRET?.trim());

	return json({
		configured,
		clientId: configured ? env.GOOGLE_OAUTH_CLIENT_ID : null,
	});
}

async function handleAccounts(request: Request, env: Env): Promise<Response> {
	const firebaseUser = await getFirebaseUser(request);

	const result = await env.DB.prepare(
		`
		SELECT
			id,
			gmail_account_id,
			email_address,
			is_primary,
			created_at,
			updated_at
		FROM gmail_connections
		WHERE firebase_uid = ?
			AND email_address <> 'unknown'
		ORDER BY is_primary DESC, created_at ASC
		`,
	)
		.bind(firebaseUser.user_id)
		.all<{
			id: number;
			gmail_account_id: string;
			email_address: string;
			is_primary: number;
			created_at: string;
			updated_at: string;
		}>();

	const accounts = (result.results ?? []).map((account) => ({
		id: account.id,
		accountId: account.gmail_account_id,
		emailAddress: account.email_address,
		isPrimary: account.is_primary === 1,
		createdAt: account.created_at,
		updatedAt: account.updated_at,
	}));

	return json({
		accounts,
		count: accounts.length,
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

	if (!env.GOOGLE_OAUTH_CLIENT_ID?.trim() || !env.GOOGLE_OAUTH_CLIENT_SECRET?.trim()) {
		return json(
			{
				error: 'Google OAuth is not configured for Notificator.',
			},
			503,
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

	const gmailProfile = await getGmailProfile(tokens.access_token);

	const emailAddress = gmailProfile.emailAddress!.trim();
	const accountId = emailAddress.toLowerCase();

	const existing = await findGmailConnection(env, firebaseUser.user_id!, accountId);

	if (!tokens.refresh_token && !existing?.refresh_token) {
		return json(
			{
				error: 'Google did not return a refresh token. Please reconnect the Gmail account and approve access again.',
			},
			502,
		);
	}

	const countResult = await env.DB.prepare(
		`
		SELECT COUNT(*) AS count
		FROM gmail_connections
		WHERE firebase_uid = ?
			AND email_address <> 'unknown'
		`,
	)
		.bind(firebaseUser.user_id)
		.first<{ count: number }>();

	const isPrimary = existing ? existing.is_primary : (countResult?.count ?? 0) === 0 ? 1 : 0;

	const refreshToken = tokens.refresh_token ?? existing?.refresh_token;

	if (!refreshToken) {
		return json(
			{
				error: 'Unable to store Gmail authorization because no refresh token is available.',
			},
			502,
		);
	}

	await env.DB.prepare(
		`
		INSERT INTO gmail_connections (
			firebase_uid,
			gmail_account_id,
			email_address,
			refresh_token,
			is_primary,
			created_at,
			updated_at
		)
		VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
		ON CONFLICT(firebase_uid, gmail_account_id)
		DO UPDATE SET
			email_address = excluded.email_address,
			refresh_token = excluded.refresh_token,
			updated_at = CURRENT_TIMESTAMP
		`,
	)
		.bind(firebaseUser.user_id, accountId, emailAddress, refreshToken, isPrimary)
		.run();

	return json({
		accessToken: tokens.access_token,
		account: {
			accountId,
			emailAddress,
			isPrimary: isPrimary === 1,
		},
	});
}

async function handleRefresh(request: Request, env: Env): Promise<Response> {
	const firebaseUser = await getFirebaseUser(request);

	const body = await readOptionalJson<GmailAccountRequest>(request);

	const requestedAccount = body.accountId?.trim().toLowerCase() || body.emailAddress?.trim().toLowerCase();

	const connection = await findGmailConnection(env, firebaseUser.user_id!, requestedAccount);

	if (!connection?.refresh_token) {
		return json(
			{
				error: 'No matching Gmail account is connected to this Notificator account.',
				connected: false,
			},
			404,
		);
	}

	if (!env.GOOGLE_OAUTH_CLIENT_ID?.trim() || !env.GOOGLE_OAUTH_CLIENT_SECRET?.trim()) {
		return json(
			{
				error: 'Google OAuth is not configured for Notificator.',
				connected: false,
			},
			503,
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
		account: {
			accountId: connection.gmail_account_id,
			emailAddress: connection.email_address,
			isPrimary: connection.is_primary === 1,
		},
	});
}

async function handleSetPrimary(request: Request, env: Env): Promise<Response> {
	const firebaseUser = await getFirebaseUser(request);

	const body = (await request.json()) as GmailAccountRequest;

	const accountId = body.accountId?.trim().toLowerCase();

	if (!accountId) {
		return json(
			{
				error: 'accountId is required.',
			},
			400,
		);
	}

	const connection = await findGmailConnection(env, firebaseUser.user_id!, accountId);

	if (!connection) {
		return json(
			{
				error: 'Gmail account was not found.',
			},
			404,
		);
	}

	await env.DB.batch([
		env.DB.prepare(
			`
			UPDATE gmail_connections
			SET is_primary = 0,
				updated_at = CURRENT_TIMESTAMP
			WHERE firebase_uid = ?
			`,
		).bind(firebaseUser.user_id),
		env.DB.prepare(
			`
			UPDATE gmail_connections
			SET is_primary = 1,
				updated_at = CURRENT_TIMESTAMP
			WHERE firebase_uid = ?
				AND gmail_account_id = ?
			`,
		).bind(firebaseUser.user_id, accountId),
	]);

	return json({
		success: true,
		accountId,
		isPrimary: true,
	});
}

async function handleDisconnect(request: Request, env: Env): Promise<Response> {
	const firebaseUser = await getFirebaseUser(request);

	const body = await readOptionalJson<GmailAccountRequest>(request);

	const requestedAccount = body.accountId?.trim().toLowerCase() || body.emailAddress?.trim().toLowerCase();

	const connection = await findGmailConnection(env, firebaseUser.user_id!, requestedAccount);

	if (!connection) {
		return json({
			success: true,
			connected: false,
		});
	}

	await env.DB.prepare(
		`
		DELETE FROM gmail_connections
		WHERE id = ?
			AND firebase_uid = ?
		`,
	)
		.bind(connection.id, firebaseUser.user_id)
		.run();

	if (connection.is_primary === 1) {
		const nextAccount = await env.DB.prepare(
			`
			SELECT id
			FROM gmail_connections
			WHERE firebase_uid = ?
				AND email_address <> 'unknown'
			ORDER BY created_at ASC
			LIMIT 1
			`,
		)
			.bind(firebaseUser.user_id)
			.first<{ id: number }>();

		if (nextAccount) {
			await env.DB.prepare(
				`
				UPDATE gmail_connections
				SET is_primary = 1,
					updated_at = CURRENT_TIMESTAMP
				WHERE id = ?
					AND firebase_uid = ?
				`,
			)
				.bind(nextAccount.id, firebaseUser.user_id)
				.run();
		}
	}

	const remaining = await env.DB.prepare(
		`
		SELECT COUNT(*) AS count
		FROM gmail_connections
		WHERE firebase_uid = ?
			AND email_address <> 'unknown'
		`,
	)
		.bind(firebaseUser.user_id)
		.first<{ count: number }>();

	return json({
		success: true,
		connected: (remaining?.count ?? 0) > 0,
		disconnectedAccountId: connection.gmail_account_id,
		disconnectedEmailAddress: connection.email_address,
		remainingAccounts: remaining?.count ?? 0,
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

			if (url.pathname === '/api/gmail/accounts' && request.method === 'GET') {
				return await handleAccounts(request, env);
			}

			if (url.pathname === '/api/gmail/exchange' && request.method === 'POST') {
				return await handleExchange(request, env);
			}

			if (url.pathname === '/api/gmail/refresh' && request.method === 'POST') {
				return await handleRefresh(request, env);
			}

			if (url.pathname === '/api/gmail/primary' && request.method === 'POST') {
				return await handleSetPrimary(request, env);
			}

			if (url.pathname === '/api/gmail/disconnect' && request.method === 'POST') {
				return await handleDisconnect(request, env);
			}

			if (url.pathname === '/health' && request.method === 'GET') {
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

			const message = error instanceof Error ? error.message : 'Unexpected server error.';

			const authError =
				message.includes('Firebase') ||
				message.includes('authorization token') ||
				message.includes('JWT') ||
				message.includes('token expired');

			return json(
				{
					error: message,
				},
				authError ? 401 : 500,
			);
		}
	},
};
