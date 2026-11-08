import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/lib/auth/server";

export type CurrentUser = {
	id: string;
	name: string;
	email: string;
	image: string | null;
};

// Data Access Layer: the one place pages and components read the signed-in
// user. The proxy already redirects signed-out visitors, but every server-side
// read checks again so a proxy gap never exposes a page.
// Reads the session cookie, so callers must render inside <Suspense>.
export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
	const { data: session } = await auth.getSession();
	if (!session?.user) {
		redirect("/sign-in");
	}

	const { id, name, email, image } = session.user;
	return { id, name, email, image: image ?? null };
});
