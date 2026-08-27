import type { Handle } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';
import { createSupabaseServerClient } from '$lib/supabase/server';
import { createAuthStateLoader } from '$lib/server/auth-state';

function connectSources() {
	const sources = ["'self'"];
	try {
		const publicUrl = new URL(env.PUBLIC_SUPABASE_URL ?? '');
		sources.push(publicUrl.origin);
		sources.push(`${publicUrl.protocol === 'https:' ? 'wss' : 'ws'}://${publicUrl.host}`);
	} catch {
		// Keep the self-only baseline when public runtime configuration is absent.
	}
	return sources.join(' ');
}

function applySecurityHeaders(response: Response) {
	const currentPolicy = response.headers.get('content-security-policy');
	const policy = currentPolicy
		? currentPolicy
				.split(';')
				.map((directive) => directive.trim())
				.filter((directive) => directive && !directive.startsWith('connect-src '))
				.concat(`connect-src ${connectSources()}`)
				.join('; ')
		: [
				"default-src 'self'",
				"base-uri 'self'",
				"object-src 'none'",
				"frame-ancestors 'none'",
				"form-action 'self'",
				`connect-src ${connectSources()}`,
				"img-src 'self' data: blob:",
				"font-src 'self' data:",
				"style-src 'self' 'unsafe-inline'",
				"script-src 'self'"
			].join('; ');
	response.headers.set('Content-Security-Policy', policy);
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
	response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
	response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
	if ((env.PUBLIC_SITE_URL ?? '').startsWith('https://')) {
		response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	}
}

export const handle: Handle = async ({ event, resolve }) => {
	let supabase: App.Locals['supabase'] = null;

	const authConfigured = Boolean(
		env.PUBLIC_SUPABASE_URL?.trim() &&
		env.PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() &&
		env.PUBLIC_SITE_URL?.trim() &&
		!env.PUBLIC_SUPABASE_PUBLISHABLE_KEY.startsWith('replace-with')
	);

	if (authConfigured) {
		supabase = createSupabaseServerClient(event);
	}

	event.locals.supabase = supabase;
	event.locals.getAuthState = createAuthStateLoader(supabase);

	const response = await resolve(event);
	applySecurityHeaders(response);
	return response;
};
