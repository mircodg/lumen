"use client";

import { LogOutIcon } from "lucide-react";
import { useState } from "react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { authClient } from "@/lib/auth/client";

export function SignOutMenuItem() {
	const [pending, setPending] = useState(false);

	async function onClick() {
		setPending(true);
		try {
			const { error } = await authClient.signOut();
			if (error) {
				toast.add({
					type: "error",
					title: "Couldn't sign out",
					description: error.message ?? "Please try again.",
				});
				setPending(false);
				return;
			}
			// Full reload, not router.replace: Cache Components keeps visited pages
			// alive in <Activity>, so a client navigation would preserve this
			// user's UI state (like this open menu) for the next user who signs in.
			window.location.assign("/sign-in");
		} catch {
			toast.add({
				type: "error",
				title: "Network error",
				description: "Check your connection and try again.",
			});
			setPending(false);
		}
	}

	return (
		// Stay open while signing out so the spinner is visible.
		<DropdownMenuItem
			variant="destructive"
			closeOnClick={false}
			disabled={pending}
			onClick={onClick}
		>
			{pending ? <Spinner /> : <LogOutIcon />}
			Sign out
		</DropdownMenuItem>
	);
}
