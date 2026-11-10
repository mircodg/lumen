import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Chat, ChatSkeleton } from "@/components/chat";
import { getCurrentUser } from "@/lib/auth/user";
import { getChat, getChatTranscript } from "@/queries/chat";

export default function ChatPage(props: PageProps<"/chats/[chatId]">) {
	return (
		// The fallback is the thread's own layout, so a chat switch paints at once
		// and the content streams into place.
		<Suspense fallback={<ChatSkeleton />}>
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
	// Redirects signed-out visitors before anything is fetched. It also has to
	// come first for prerendering: the transcript request generates a random
	// id, which Next.js only allows after a request-time read like this one.
	// Cached per request, so getChat below reuses it.
	await getCurrentUser();

	// Started alongside the ownership check instead of from the browser after
	// hydration. It isn't awaited: the promise streams to the client, so the
	// thread's shell renders as soon as the chat itself is known.
	const transcript = getChatTranscript(chatId);
	// A failed load is reported by the client. This keeps the rejection handled
	// when the page 404s and nothing ever reads the promise.
	transcript.catch(() => {});

	const chat = await getChat(chatId);
	// Missing and someone else's chat look the same, so ids don't leak. The
	// transcript is only passed on below, after this check.
	if (!chat) notFound();

	// Keyed, so switching chats starts a fresh thread.
	return (
		<Chat
			key={chat.id}
			chatId={chat.id}
			name={chat.name}
			transcript={transcript}
		/>
	);
}
