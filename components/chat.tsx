"use client";

import { Chat as ChatState, useChat } from "@ai-sdk/react";
import {
	type LoadTranscriptResult,
	type UsePendingMessagesOptions,
	useLoadTranscript,
	usePendingMessages,
	useTriggerChatTransport,
} from "@trigger.dev/sdk/chat/react";
import {
	ArrowUpIcon,
	ChevronDownIcon,
	CircleAlertIcon,
	MessageCircleDashedIcon,
	SquareIcon,
} from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { mintChatAccessToken, startChatSession } from "@/actions/chat";
import { ChatAvatar } from "@/components/chat-avatar";
import { AssistantParts, hasVisibleParts } from "@/components/chat-parts";
import {
	Alert,
	AlertAction,
	AlertDescription,
	AlertTitle,
} from "@/components/ui/alert";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
	Message,
	MessageContent,
	MessageFooter,
} from "@/components/ui/message";
import {
	MessageScroller,
	MessageScrollerButton,
	MessageScrollerContent,
	MessageScrollerItem,
	MessageScrollerProvider,
	MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { Skeleton } from "@/components/ui/skeleton";
import type { ChatUIMessage, chatAgent } from "@/trigger/chat";

// The conversation for one chat, run by the Trigger.dev chat agent in
// trigger/chat.ts. The agent keeps the history in its transcript storage. The
// page starts that load on the server and passes the promise down, so the
// composer is usable while the history streams in. The page keys this by chat
// id, so switching chats starts a fresh thread.
export function Chat({
	chatId,
	name,
	bots,
	transcript,
}: {
	chatId: string;
	name: string;
	// The chat's bots, in join order. A group chat has several.
	bots: ChatBot[];
	transcript: Promise<LoadTranscriptResult>;
}) {
	// Which bot answers the next message. The first one until the user picks.
	const [botId, setBotId] = useState(bots[0]?.id);
	const bot = bots.find((bot) => bot.id === botId) ?? bots[0];

	const transport = useTriggerChatTransport<typeof chatAgent>({
		task: "chat",
		accessToken: ({ chatId }) => mintChatAccessToken(chatId),
		startSession: ({ chatId, clientData }) =>
			startChatSession({ chatId, clientData }),
		// Sent as metadata with every turn, so the agent answers as this bot.
		// The transport picks up changes without being rebuilt.
		clientData: { botId: bot?.id },
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
				: new ChatState<ChatUIMessage>({
						id: chatId,
						// Stored untyped; the agent wrote it with these tools.
						messages: loaded.messages as ChatUIMessage[],
						transport,
					}),
		[chatId, transport, loaded.isLoading, loaded.messages],
	);

	// A reload mid-reply picks the reply back up. The transport can only
	// reconnect to a session it knows, and a fresh page knows none, so hand it
	// one with a new token; the transcript load already seeded its cursor.
	// When no reply is in flight, the server says so and the stream closes
	// at once. A chat with no messages has no session yet, so it's skipped.
	useEffect(() => {
		if (!chat || chat.messages.length === 0) return;
		let cancelled = false;

		void (async () => {
			try {
				if (!transport.getSession(chatId)) {
					const publicAccessToken = await mintChatAccessToken(chatId);
					if (cancelled) return;
					transport.setSession(chatId, { publicAccessToken });
				}
				if (!cancelled) await chat.resumeStream();
			} catch (error) {
				// Nothing to resume is not an error worth showing; the thread is
				// already on screen from the transcript.
				console.error("Could not resume the chat stream", error);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [chat, chatId, transport]);

	// After a resume, the local stop only closes this tab's stream, so Stop
	// also tells the agent to stop generating.
	function stop() {
		void chat?.stop();
		void transport.stopGeneration(chatId);
	}

	// The composer sends through the thread's pending-messages hook, which
	// needs the chat's live state. The thread sets this once it mounts.
	const sendRef = useRef<((text: string) => void) | null>(null);

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
						<ChatMessages
							chat={chat}
							chatId={chatId}
							name={name}
							transport={transport}
							sendRef={sendRef}
						/>
					) : (
						<ChatMessagesSkeleton />
					)}
				</div>
				<ChatComposer
					chat={chat}
					name={bot?.name ?? name}
					bots={bots}
					botId={bot?.id}
					onBotChange={setBotId}
					sendRef={sendRef}
					onDraftStart={preload}
					onStop={stop}
				/>
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

function isBusy(status: ChatState<ChatUIMessage>["status"]) {
	return status === "submitted" || status === "streaming";
}

function ChatMessages({
	chat,
	chatId,
	name,
	transport,
	sendRef,
}: {
	chat: ChatState<ChatUIMessage>;
	chatId: string;
	name: string;
	transport: UsePendingMessagesOptions["transport"];
	sendRef: React.RefObject<((text: string) => void) | null>;
}) {
	const { messages, status, error, regenerate, setMessages, sendMessage } =
		useChat({ chat });
	// Sending while the agent works steers it: the message reaches the model at
	// its next step. Sending while idle is a normal send.
	const steering = usePendingMessages<ChatUIMessage>({
		transport,
		chatId,
		status,
		messages,
		setMessages,
		sendMessage,
	});
	useEffect(() => {
		sendRef.current = steering.steer;
		return () => {
			sendRef.current = null;
		};
	}, [sendRef, steering.steer]);
	// Sent mid-reply but not yet read by the agent. Once read, the message
	// shows inside the reply where it landed (see AssistantParts).
	const waiting = steering.pending.filter((message) => !message.injected);

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
	// assistant message with nothing to show yet.
	const pending =
		busy && (lastMessage?.role === "user" || !hasVisibleParts(lastMessage));

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
					{waiting.map((message) => (
						<MessageScrollerItem key={message.id} messageId={message.id}>
							<Message align="end">
								<MessageContent>
									<Bubble align="end" variant="outline">
										<BubbleContent className="whitespace-pre-wrap">
											{message.text}
										</BubbleContent>
									</Bubble>
								</MessageContent>
								<MessageFooter>
									{busy ? `Waiting for ${name}'s next step` : "Sending…"}
								</MessageFooter>
							</Message>
						</MessageScrollerItem>
					))}
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
	message: ChatUIMessage;
	streaming: boolean;
}) {
	const isUser = message.role === "user";
	if (!hasVisibleParts(message)) return null;

	return (
		<MessageScrollerItem messageId={message.id} scrollAnchor={isUser}>
			{isUser ? (
				<Message align="end">
					<MessageContent>
						<Bubble align="end" variant="muted">
							<BubbleContent className="whitespace-pre-wrap">
								{messageText(message)}
							</BubbleContent>
						</Bubble>
					</MessageContent>
				</Message>
			) : (
				<Message>
					<MessageContent>
						<AssistantParts parts={message.parts} streaming={streaming} />
					</MessageContent>
				</Message>
			)}
		</MessageScrollerItem>
	);
});

// Owns the draft, so typing re-renders the composer and not the thread.
// `chat` is null while the history loads: the draft can be written, and it
// can be sent once the thread is in. A send while the agent is working
// steers it instead of waiting for the reply to finish.
function ChatComposer({
	chat,
	name,
	bots,
	botId,
	onBotChange,
	sendRef,
	onDraftStart,
	onStop,
}: {
	chat: ChatState<ChatUIMessage> | null;
	name: string;
	bots: ChatBot[];
	botId: string | undefined;
	onBotChange: (botId: string) => void;
	sendRef: React.RefObject<((text: string) => void) | null>;
	onDraftStart: () => void;
	onStop: () => void;
}) {
	const [text, setText] = useState("");
	const formRef = useRef<HTMLFormElement>(null);
	const hasText = text.trim().length > 0;

	function onSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const send = sendRef.current;
		if (!chat || !hasText || !send) return;

		send(text.trim());
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
					{/* Only a group has a choice of bot. */}
					{bots.length > 1 && botId && (
						<BotSelect bots={bots} botId={botId} onBotChange={onBotChange} />
					)}
					{chat ? (
						<ChatComposerSubmit chat={chat} hasText={hasText} onStop={onStop} />
					) : (
						<SendButton disabled />
					)}
				</InputGroupAddon>
			</InputGroup>
		</form>
	);
}

// Send, or Stop while a reply is on its way, with Send beside it once there's
// a message to steer with. Split out so only these buttons follow the chat's
// status.
function ChatComposerSubmit({
	chat,
	hasText,
	onStop,
}: {
	chat: ChatState<ChatUIMessage>;
	hasText: boolean;
	onStop: () => void;
}) {
	const { status } = useChat({ chat });

	if (isBusy(status)) {
		return (
			<>
				<InputGroupButton
					type="button"
					variant={hasText ? "outline" : "default"}
					size="icon-sm"
					className="ml-auto"
					onClick={onStop}
				>
					<SquareIcon />
					<span className="sr-only">Stop</span>
				</InputGroupButton>
				{hasText && (
					<InputGroupButton type="submit" variant="default" size="icon-sm">
						<ArrowUpIcon />
						<span className="sr-only">Send</span>
					</InputGroupButton>
				)}
			</>
		);
	}

	return <SendButton disabled={!hasText} />;
}

type ChatBot = { id: string; name: string; avatar: string };

// Picks which of a group's bots answers the next message.
function BotSelect({
	bots,
	botId,
	onBotChange,
}: {
	bots: ChatBot[];
	botId: string;
	onBotChange: (botId: string) => void;
}) {
	const current = bots.find((bot) => bot.id === botId) ?? bots[0];

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<InputGroupButton
						type="button"
						size="sm"
						variant="ghost"
						aria-label={`Reply from ${current.name}`}
					/>
				}
			>
				<ChatAvatar seed={current.avatar} className="size-4" />
				{current.name}
				<ChevronDownIcon />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-48">
				<DropdownMenuGroup>
					<DropdownMenuLabel>Reply from</DropdownMenuLabel>
					<DropdownMenuRadioGroup
						value={botId}
						onValueChange={(value) => onBotChange(value)}
					>
						{bots.map((bot) => (
							<DropdownMenuRadioItem key={bot.id} value={bot.id} closeOnClick>
								<ChatAvatar seed={bot.avatar} className="size-4" />
								{bot.name}
							</DropdownMenuRadioItem>
						))}
					</DropdownMenuRadioGroup>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
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

function messageText(message: ChatUIMessage) {
	return message.parts
		.filter((part) => part.type === "text")
		.map((part) => part.text)
		.join("");
}
