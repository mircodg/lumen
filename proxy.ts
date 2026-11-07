import { auth } from "@/lib/auth/server";

export default auth.middleware({
	loginUrl: "/sign-in",
	publicRoutes: ["/sign-in", "/sign-up"],
});

export const config = {
	matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
