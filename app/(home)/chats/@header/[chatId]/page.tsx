import { Suspense } from "react";
import {
	ChatHeaderTitle,
	ChatHeaderTitleSkeleton,
} from "@/components/chat-header";
import { getChat } from "@/queries/chat";

export default function ChatHeaderSlot(props: PageProps<"/chats/[chatId]">) {
	return (
		<Suspense fallback={<ChatHeaderTitleSkeleton />}>
			<ChatHeaderTitleContent params={props.params} />
		</Suspense>
	);
}

// Params and the session are request-time data, so they're read inside
// Suspense. getChat is cached per request, so this and the page share one query.
async function ChatHeaderTitleContent({
	params,
}: {
	params: PageProps<"/chats/[chatId]">["params"];
}) {
	const { chatId } = await params;
	const chat = await getChat(chatId);
	// The page renders the 404; the header just stays empty.
	if (!chat) return null;

	return <ChatHeaderTitle chat={chat} />;
}
