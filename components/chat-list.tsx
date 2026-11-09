import { formatDistanceToNowStrict } from "date-fns";
import { io } from "next/cache";
import Link from "next/link";
import { ChatAvatar } from "@/components/chat-avatar";
import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { getUserChats } from "@/queries/bot";

// Reads the session cookie, so it must render inside Suspense.
export async function ChatList() {
	const chats = await getUserChats();
	// Relative times depend on the request time, so keep them out of the static shell.
	await io();

	return (
		<SidebarGroup>
			<SidebarGroupContent>
				<SidebarMenu>
					{chats.map((chat) => (
						<SidebarMenuItem key={chat.id}>
							<SidebarMenuButton
								render={<Link href={`/chats/${chat.id}`} />}
								className="h-auto gap-3"
							>
								<ChatAvatar seed={chat.avatar} />
								<div className="grid min-w-0 flex-1 leading-tight">
									<div className="flex items-baseline justify-between gap-2">
										<span className="truncate font-medium">{chat.name}</span>
										<time
											dateTime={chat.lastMessageAt.toISOString()}
											className="shrink-0 text-xs text-muted-foreground"
										>
											{formatDistanceToNowStrict(chat.lastMessageAt)}
										</time>
									</div>
									{chat.preview && (
										<span className="truncate text-xs text-muted-foreground">
											{chat.preview}
										</span>
									)}
								</div>
							</SidebarMenuButton>
						</SidebarMenuItem>
					))}
				</SidebarMenu>
			</SidebarGroupContent>
		</SidebarGroup>
	);
}

// SidebarMenuSkeleton picks a random width with Math.random(), which Cache
// Components rejects during prerender, so this fallback uses fixed sizes.
export function ChatListSkeleton() {
	return (
		<SidebarGroup>
			<SidebarGroupContent className="flex flex-col gap-1">
				{Array.from({ length: 3 }, (_, i) => (
					<div key={i} className="flex items-center gap-3 p-2">
						<Skeleton className="size-8 rounded-full" />
						<div className="flex flex-1 flex-col gap-1">
							<Skeleton className="h-3.5 w-24" />
							<Skeleton className="h-3 w-full" />
						</div>
					</div>
				))}
			</SidebarGroupContent>
		</SidebarGroup>
	);
}
