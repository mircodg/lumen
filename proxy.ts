import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";

const authPages = ["/sign-in", "/sign-up"];

const requireSession = auth.middleware({
	loginUrl: "/sign-in",
	publicRoutes: authPages,
});

export default async function proxy(request: NextRequest) {
	// Signed-in users have no business on the auth pages: send them home.
	if (authPages.includes(request.nextUrl.pathname)) {
		const { data: session } = await auth.getSession();
		if (session?.user) {
			return NextResponse.redirect(new URL("/", request.url));
		}
		return NextResponse.next();
	}

	return requireSession(request);
}

export const config = {
	// Skip /api/auth: the auth handler validates its own requests, and running
	// the session lookup there only adds an upstream round trip to every
	// sign-in, sign-out, and session call.
	matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
