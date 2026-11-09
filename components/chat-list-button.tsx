"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { SidebarMenuButton } from "@/components/ui/sidebar";

// Client-side so it follows navigation: the chat list itself is a server
// component rendered once in the layout and doesn't re-render per route.
export function ChatListButton({
	chatId,
	tooltip,
	children,
}: {
	chatId: string;
	tooltip: string;
	children: React.ReactNode;
}) {
	const params = useParams<{ chatId?: string }>();
	const isActive = params.chatId === chatId;

	return (
		<SidebarMenuButton
			render={
				<Link
					href={`/chats/${chatId}`}
					aria-current={isActive ? "page" : undefined}
				/>
			}
			isActive={isActive}
			tooltip={tooltip}
			// Collapsed, every button is size-8. p-0.5 centers the size-7 avatar.
			className="h-auto gap-3 group-data-[collapsible=icon]:p-0.5!"
		>
			{children}
		</SidebarMenuButton>
	);
}
