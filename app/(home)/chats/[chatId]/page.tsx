import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Chat, ChatSkeleton } from "@/components/chat";
import {
	ChatHeader,
	ChatHeaderTitle,
	ChatHeaderTitleSkeleton,
} from "@/components/chat-header";
import { DesktopPanel, DesktopPanelProvider } from "@/components/desktop-panel";
import { ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/lib/auth/user";
import { getChat, getChatTranscript } from "@/queries/chat";

export default function ChatPage(props: PageProps<"/chats/[chatId]">) {
	return (
		// The provider lets the header's toggle drive the desktop panel.
		<DesktopPanelProvider params={props.params}>
			<ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
				<ResizablePanel
					minSize="30%"
					className="flex h-full flex-col"
					// The library makes panels scroll containers. Only the thread's
					// messages should scroll, so the header and composer stay put.
					style={{ overflow: "hidden" }}
				>
					<ChatHeader>
						<Suspense fallback={<ChatHeaderTitleSkeleton />}>
							<ChatTitle params={props.params} />
						</Suspense>
					</ChatHeader>
					{/* The fallback is the thread's own layout, so a chat switch paints
					    at once and the content streams into place. */}
					<Suspense fallback={<ChatSkeleton />}>
						<ChatContent params={props.params} />
					</Suspense>
				</ResizablePanel>
				<DesktopPanel
					label={
						<Suspense fallback={<Skeleton className="mx-auto h-4 w-28" />}>
							<DesktopLabel params={props.params} />
						</Suspense>
					}
				/>
			</ResizablePanelGroup>
		</DesktopPanelProvider>
	);
}

// Params and the session are request-time data, so they're read inside
// Suspense. getChat is cached per request, so this and the content share one
// query.
async function ChatTitle({
	params,
}: {
	params: PageProps<"/chats/[chatId]">["params"];
}) {
	const { chatId } = await params;
	const chat = await getChat(chatId);
	// The content renders the 404; the header just stays empty.
	if (!chat) return null;

	return <ChatHeaderTitle chat={chat} />;
}

// Names the desktop after the bot it belongs to. Shares getChat's per-request
// cache with the title and content.
async function DesktopLabel({
	params,
}: {
	params: PageProps<"/chats/[chatId]">["params"];
}) {
	const { chatId } = await params;
	const chat = await getChat(chatId);
	if (!chat) return null;

	return `${chat.bot?.name ?? chat.name}'s screen`;
}

// getChat checks the session first, so signed-out visitors are redirected even
// if the proxy lets the request through. Params are request-time data under
// Cache Components, so they're read inside Suspense.
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
