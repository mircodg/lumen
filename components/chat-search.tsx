import { formatDistanceToNowStrict } from "date-fns";
import { io } from "next/cache";
import { ChatSearchDialog } from "@/components/chat-search-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { getUserChats } from "@/queries/bot";

// Reads the session cookie, so it must render inside Suspense.
export async function ChatSearch() {
	const chats = await getUserChats();
	// Relative times depend on the request time, so keep them out of the static shell.
	await io();

	return (
		<ChatSearchDialog
			chats={chats.map((chat) => ({
				id: chat.id,
				name: chat.name,
				preview: chat.preview,
				avatar: chat.avatar,
				lastMessageAt: chat.lastMessageAt.toISOString(),
				lastMessageAgo: formatDistanceToNowStrict(chat.lastMessageAt),
			}))}
		/>
	);
}

// Matches the search bar's height while the chats load.
export function ChatSearchSkeleton() {
	return <Skeleton className="h-8 w-full" />;
}
