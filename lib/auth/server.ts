import { createNeonAuth } from "@neon/auth/next/server";

// While prerendering, Next.js rejects cookies() once the static shell is done.
// getSession reads cookies inside its own try/catch, so it catches that
// expected rejection and logs it as a "Cookie validation error". Drop only
// that case; every other warning still reaches the console.
function isPrerenderInterrupt(meta?: Record<string, unknown>) {
	const err = meta?.err;
	return (
		typeof err === "object" &&
		err !== null &&
		"digest" in err &&
		err.digest === "HANGING_PROMISE_REJECTION"
	);
}

export const auth = createNeonAuth({
	baseUrl: process.env.NEON_AUTH_BASE_URL!,
	cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET! },
	logger: {
		warn(message, meta) {
			if (isPrerenderInterrupt(meta)) return;
			console.warn(message, meta);
		},
	},
});
