import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import {
	Card,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { auth } from "@/lib/auth/server";

export default function Home() {
	return (
		<main className="flex flex-1 items-center justify-center bg-background p-6">
			<Card className="w-full max-w-sm">
				<Suspense fallback={<UserSkeleton />}>
					<CurrentUser />
				</Suspense>
			</Card>
		</main>
	);
}

// Reads the session cookie at request time, so it streams in behind Suspense.
async function CurrentUser() {
	const { data: session } = await auth.getSession();
	const user = session?.user;
	if (!user) redirect("/sign-in");

	return (
		<>
			<CardHeader>
				<CardTitle>Welcome, {user.name}</CardTitle>
				<CardDescription>Signed in as {user.email}</CardDescription>
			</CardHeader>
			<CardFooter>
				<SignOutButton />
			</CardFooter>
		</>
	);
}

function UserSkeleton() {
	return (
		<>
			<CardHeader>
				<Skeleton className="h-5 w-40" />
				<Skeleton className="h-4 w-56" />
			</CardHeader>
			<CardFooter>
				<Skeleton className="h-8 w-24" />
			</CardFooter>
		</>
	);
}
