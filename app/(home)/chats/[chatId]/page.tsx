import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Chat } from "@/components/chat";
import { getChat } from "@/queries/chat";

export default function ChatPage(props: PageProps<"/chats/[chatId]">) {
	return (
		<Suspense>
			<ChatContent params={props.params} />
		</Suspense>
	);
}

// getChat checks the session first, so signed-out visitors are redirected even
// if the proxy lets the request through. Params are request-time data under
// Cache Components, so they're read inside Suspense. The header lives in the
// chats layout.
async function ChatContent({
	params,
}: {
	params: PageProps<"/chats/[chatId]">["params"];
}) {
	const { chatId } = await params;
	const chat = await getChat(chatId);
	// Missing and someone else's chat look the same, so ids don't leak.
	if (!chat) notFound();

	// Keyed, so switching chats starts a fresh thread.
	return <Chat key={chat.id} chatId={chat.id} name={chat.name} />;
}
