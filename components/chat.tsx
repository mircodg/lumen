"use client";

import { Chat as ChatState, useChat } from "@ai-sdk/react";
import {
	type LoadTranscriptResult,
	useLoadTranscript,
	useTriggerChatTransport,
} from "@trigger.dev/sdk/chat/react";
import type { UIMessage } from "ai";
import {
	ArrowUpIcon,
	CircleAlertIcon,
	MessageCircleDashedIcon,
	SquareIcon,
} from "lucide-react";
import { memo, useMemo, useRef, useState } from "react";
import { mintChatAccessToken, startChatSession } from "@/actions/chat";
import { Markdown } from "@/components/markdown";
import {
	Alert,
	AlertAction,
	AlertDescription,
	AlertTitle,
} from "@/components/ui/alert";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupTextarea,
} from "@/components/ui/input-group";
import { Message, MessageContent } from "@/components/ui/message";
import {
	MessageScroller,
	MessageScrollerButton,
	MessageScrollerContent,
	MessageScrollerItem,
	MessageScrollerProvider,
	MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { Skeleton } from "@/components/ui/skeleton";
import type { chatAgent } from "@/trigger/chat";

// The conversation for one chat, run by the Trigger.dev chat agent in
// trigger/chat.ts. The agent keeps the history in its transcript storage. The
// page starts that load on the server and passes the promise down, so the
// composer is usable while the history streams in. The page keys this by chat
// id, so switching chats starts a fresh thread.
export function Chat({
	chatId,
	name,
	transcript,
}: {
	chatId: string;
	name: string;
	transcript: Promise<LoadTranscriptResult>;
}) {
	const transport = useTriggerChatTransport<typeof chatAgent>({
		task: "chat",
		accessToken: ({ chatId }) => mintChatAccessToken(chatId),
		startSession: ({ chatId, clientData }) =>
			startChatSession({ chatId, clientData }),
	});
	// The hook also seeds the transport's resume cursor from the transcript.
	// Promise.resolve turns the streamed promise into one the hook can chain.
	const loaded = useLoadTranscript(chatId, () => Promise.resolve(transcript), {
		transport,
	});
	// The chat state has to start from the saved transcript, so it's created
	// once that is in. It lives here, above the thread and the composer, so
	// the composer stays mounted (and keeps its draft and focus) while the
	// thread swaps from skeleton to messages.
	const chat = useMemo(
		() =>
			loaded.isLoading
				? null
				: new ChatState<UIMessage>({
						id: chatId,
						messages: loaded.messages,
						transport,
					}),
		[chatId, transport, loaded.isLoading, loaded.messages],
	);

	// Creating the session and booting the agent's run takes a moment. Starting
	// it when the user begins typing moves that wait off the first send.
	// Idempotent on the transport, and a failure here is retried by the send.
	const preloaded = useRef(false);
	function preload() {
		if (preloaded.current) return;
		preloaded.current = true;
		transport.preload(chatId).catch(() => {});
	}

	return (
		<MessageScrollerProvider autoScroll>
			<div className="flex min-h-0 flex-1 flex-col">
				<div className="min-h-0 flex-1">
					{chat ? (
						<ChatMessages chat={chat} name={name} />
					) : (
						<ChatMessagesSkeleton />
					)}
				</div>
				<ChatComposer chat={chat} name={name} onDraftStart={preload} />
			</div>
		</MessageScrollerProvider>
	);
}

// The page's Suspense fallback: the thread's layout with nothing in it yet.
// It's replaced as soon as the chat is known, so its composer is inert.
export function ChatSkeleton() {
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="min-h-0 flex-1">
				<ChatMessagesSkeleton />
			</div>
			<div className="mx-auto w-full max-w-3xl p-4 pt-0">
				<InputGroup>
					<InputGroupTextarea
						placeholder="Message…"
						aria-label="Message"
						disabled
						className="max-h-48 min-h-14"
					/>
					<InputGroupAddon align="block-end">
						<InputGroupButton
							variant="default"
							size="icon-sm"
							className="ml-auto"
							disabled
						>
							<ArrowUpIcon />
							<span className="sr-only">Send</span>
						</InputGroupButton>
					</InputGroupAddon>
				</InputGroup>
			</div>
		</div>
	);
}

function ChatMessagesSkeleton() {
	return (
		<div
			aria-hidden
			className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4"
		>
			<Skeleton className="h-9 w-56 self-end rounded-2xl" />
			<div className="flex flex-col gap-2">
				<Skeleton className="h-4 w-full" />
				<Skeleton className="h-4 w-11/12" />
				<Skeleton className="h-4 w-2/3" />
			</div>
			<Skeleton className="h-9 w-40 self-end rounded-2xl" />
			<div className="flex flex-col gap-2">
				<Skeleton className="h-4 w-10/12" />
				<Skeleton className="h-4 w-1/2" />
			</div>
		</div>
	);
}

function isBusy(status: ChatState<UIMessage>["status"]) {
	return status === "submitted" || status === "streaming";
}

function ChatMessages({
	chat,
	name,
}: {
	chat: ChatState<UIMessage>;
	name: string;
}) {
	const { messages, status, error, regenerate } = useChat({ chat });

	if (messages.length === 0) {
		return (
			<Empty className="h-full">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<MessageCircleDashedIcon />
					</EmptyMedia>
					<EmptyTitle>Start the conversation</EmptyTitle>
					<EmptyDescription>
						Send a message to start chatting with {name}.
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}

	const busy = isBusy(status);
	const lastMessage = messages.at(-1);
	// Waiting for the first token: the last message is still the user's, or an
	// assistant message with no text yet.
	const pending =
		busy && (lastMessage?.role === "user" || !messageText(lastMessage));

	return (
		<MessageScroller>
			<MessageScrollerViewport>
				<MessageScrollerContent
					aria-busy={busy}
					className="mx-auto w-full max-w-3xl p-4"
				>
					{messages.map((message) => (
						<ChatMessage
							key={message.id}
							message={message}
							streaming={busy && message === lastMessage}
						/>
					))}
					{pending && (
						<MessageScrollerItem messageId="pending">
							<Message>
								<MessageContent>
									<span className="shimmer w-fit text-muted-foreground">
										Thinking…
									</span>
								</MessageContent>
							</Message>
						</MessageScrollerItem>
					)}
					{error && (
						<MessageScrollerItem messageId="error">
							<Alert variant="destructive">
								<CircleAlertIcon />
								<AlertTitle>Something went wrong</AlertTitle>
								<AlertDescription>
									The reply could not be generated.
								</AlertDescription>
								<AlertAction>
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => void regenerate()}
									>
										Retry
									</Button>
								</AlertAction>
							</Alert>
						</MessageScrollerItem>
					)}
				</MessageScrollerContent>
			</MessageScrollerViewport>
			<MessageScrollerButton />
		</MessageScroller>
	);
}

// Memoized: while a reply streams, only the message being written changes, so
// the rest of the thread skips rendering on every token.
const ChatMessage = memo(function ChatMessage({
	message,
	streaming,
}: {
	message: UIMessage;
	streaming: boolean;
}) {
	const isUser = message.role === "user";
	const text = messageText(message);
	// The assistant message exists before its first token.
	if (!text) return null;

	return (
		<MessageScrollerItem messageId={message.id} scrollAnchor={isUser}>
			{isUser ? (
				<Message align="end">
					<MessageContent>
						<Bubble align="end" variant="muted">
							<BubbleContent className="whitespace-pre-wrap">
								{text}
							</BubbleContent>
						</Bubble>
					</MessageContent>
				</Message>
			) : (
				<Message>
					<MessageContent>
						<Markdown streaming={streaming}>{text}</Markdown>
					</MessageContent>
				</Message>
			)}
		</MessageScrollerItem>
	);
});

// Owns the draft, so typing re-renders the composer and not the thread.
// `chat` is null while the history loads: the draft can be written, and it
// can be sent once the thread is in.
function ChatComposer({
	chat,
	name,
	onDraftStart,
}: {
	chat: ChatState<UIMessage> | null;
	name: string;
	onDraftStart: () => void;
}) {
	const [text, setText] = useState("");
	const formRef = useRef<HTMLFormElement>(null);
	const hasText = text.trim().length > 0;

	function onSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		// The status is read here rather than subscribed to: it only matters at
		// the moment of sending.
		if (!chat || !hasText || isBusy(chat.status)) return;

		void chat.sendMessage({ text: text.trim() });
		setText("");
	}

	return (
		<form
			ref={formRef}
			onSubmit={onSubmit}
			className="mx-auto w-full max-w-3xl p-4 pt-0"
		>
			<InputGroup>
				<InputGroupTextarea
					value={text}
					onChange={(event) => {
						setText(event.target.value);
						if (event.target.value.trim()) onDraftStart();
					}}
					placeholder={`Message ${name}…`}
					aria-label="Message"
					autoFocus
					className="max-h-48 min-h-14"
					onKeyDown={(event) => {
						if (
							event.key === "Enter" &&
							!event.shiftKey &&
							!event.nativeEvent.isComposing
						) {
							event.preventDefault();
							formRef.current?.requestSubmit();
						}
					}}
				/>
				<InputGroupAddon align="block-end">
					{chat ? (
						<ChatComposerSubmit chat={chat} hasText={hasText} />
					) : (
						<SendButton disabled />
					)}
				</InputGroupAddon>
			</InputGroup>
		</form>
	);
}

// Send, or Stop while a reply is on its way. Split out so only this button
// follows the chat's status.
function ChatComposerSubmit({
	chat,
	hasText,
}: {
	chat: ChatState<UIMessage>;
	hasText: boolean;
}) {
	const { status, stop } = useChat({ chat });

	if (isBusy(status)) {
		return (
			<InputGroupButton
				type="button"
				variant="default"
				size="icon-sm"
				className="ml-auto"
				onClick={() => void stop()}
			>
				<SquareIcon />
				<span className="sr-only">Stop</span>
			</InputGroupButton>
		);
	}

	return <SendButton disabled={!hasText} />;
}

function SendButton({ disabled }: { disabled: boolean }) {
	return (
		<InputGroupButton
			type="submit"
			variant="default"
			size="icon-sm"
			className="ml-auto"
			disabled={disabled}
		>
			<ArrowUpIcon />
			<span className="sr-only">Send</span>
		</InputGroupButton>
	);
}

function messageText(message: UIMessage | undefined) {
	if (!message) return "";

	return message.parts
		.filter((part) => part.type === "text")
		.map((part) => part.text)
		.join("");
}
