"use client";

import { LogOutIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth/client";

export function SignOutButton() {
	const router = useRouter();
	const [pending, setPending] = useState(false);

	async function onClick() {
		setPending(true);
		try {
			await authClient.signOut();
			router.replace("/sign-in");
			router.refresh();
		} finally {
			setPending(false);
		}
	}

	return (
		<Button variant="outline" onClick={onClick} disabled={pending}>
			{pending ? (
				<Spinner data-icon="inline-start" />
			) : (
				<LogOutIcon data-icon="inline-start" />
			)}
			Sign out
		</Button>
	);
}
