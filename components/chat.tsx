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
import { Bubble, BubbleContent, BubbleReactions } from "@/components/ui/bubble";
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
	MessageAvatar,
	MessageContent,
	MessageFooter,
	MessageGroup,
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
	const sendRef = useRef<Send | null>(null);

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
							bots={bots}
							transport={transport}
							sendRef={sendRef}
							// The bot that took over answers the next message too.
							onHandoff={setBotId}
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
	bots,
	transport,
	sendRef,
	onHandoff,
}: {
	chat: ChatState<ChatUIMessage>;
	chatId: string;
	name: string;
	bots: ChatBot[];
	transport: UsePendingMessagesOptions["transport"];
	sendRef: React.RefObject<Send | null>;
	onHandoff: (botId: string) => void;
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
	// An idle send is stamped with the bot it's addressed to, so the bubble can
	// say who it was for. The steer helper can't set message metadata, and a
	// steered message lands inside the reply of the bot already answering.
	const { steer } = steering;
	useEffect(() => {
		sendRef.current = (text, botId) => {
			if (status === "streaming") steer(text);
			else void sendMessage({ text, metadata: { botId } });
		};
		return () => {
			sendRef.current = null;
		};
	}, [sendRef, steer, status, sendMessage]);
	// A handoff in the newest reply moves the composer to the bot that took
	// over. Ones already in the transcript when the thread opened don't.
	const handoff = latestHandoff(messages.at(-1));
	const handoffId = handoff?.toolCallId;
	const handoffBotId = handoff?.botId;
	const seenHandoff = useRef(handoffId);
	useEffect(() => {
		if (!handoffId || !handoffBotId || handoffId === seenHandoff.current) {
			return;
		}
		seenHandoff.current = handoffId;
		onHandoff(handoffBotId);
	}, [handoffId, handoffBotId, onHandoff]);

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
							// Only a group needs to say which bot wrote a reply.
							bots={bots.length > 1 ? bots : undefined}
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
	bots,
	streaming,
}: {
	message: ChatUIMessage;
	// A group's bots, to show who wrote each part of a reply. Unset otherwise.
	bots: ChatBot[] | undefined;
	streaming: boolean;
}) {
	const isUser = message.role === "user";
	if (!hasVisibleParts(message)) return null;
	// In a group, the bot the owner's message was addressed to.
	const addressee = isUser
		? bots?.find((bot) => bot.id === message.metadata?.botId)
		: undefined;

	return (
		<MessageScrollerItem messageId={message.id} scrollAnchor={isUser}>
			{isUser ? (
				<Message align="end">
					<MessageContent>
						<Bubble
							align="end"
							variant="muted"
							// Room for the addressee pill hanging off the bottom edge.
							className={addressee ? "mb-3" : undefined}
						>
							<BubbleContent className="whitespace-pre-wrap">
								{messageText(message)}
							</BubbleContent>
							{addressee && (
								<BubbleReactions className="gap-1 pr-2 text-xs font-medium ring-background">
									<ChatAvatar seed={addressee.avatar} className="size-3.5" />
									{addressee.name}
								</BubbleReactions>
							)}
						</Bubble>
					</MessageContent>
				</Message>
			) : bots ? (
				<GroupReply message={message} bots={bots} streaming={streaming} />
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

// A group chat's reply, split where one bot handed off to another, each part
// beside the avatar of the bot that wrote it. Reads like consecutive replies.
function GroupReply({
	message,
	bots,
	streaming,
}: {
	message: ChatUIMessage;
	bots: ChatBot[];
	streaming: boolean;
}) {
	const segments = replySegments(message).filter((segment) =>
		hasVisibleParts({ ...message, parts: segment.parts }),
	);

	return (
		<MessageGroup className="gap-6">
			{segments.map((segment, index) => {
				const bot = bots.find((bot) => bot.id === segment.botId);
				return (
					<Message key={segment.key}>
						{bot && (
							<MessageAvatar>
								<ChatAvatar seed={bot.avatar} />
								<span className="sr-only">{bot.name}</span>
							</MessageAvatar>
						)}
						<MessageContent>
							<AssistantParts
								parts={segment.parts}
								// Only the newest part can still be streaming.
								streaming={streaming && index === segments.length - 1}
							/>
						</MessageContent>
					</Message>
				);
			})}
		</MessageGroup>
	);
}

type Part = ChatUIMessage["parts"][number];

// A reply's parts, split after each handoff. The first part is written by the
// bot that started the reply; each later one by the bot handed to.
function replySegments(message: ChatUIMessage) {
	const segments: { key: string; botId?: string; parts: Part[] }[] = [
		{ key: "start", botId: message.metadata?.botId, parts: [] },
	];
	for (const part of message.parts) {
		segments[segments.length - 1].parts.push(part);
		if (part.type === "tool-handoff" && part.state === "output-available") {
			segments.push({
				key: part.toolCallId,
				botId: part.output.botId,
				parts: [],
			});
		}
	}
	return segments;
}

// The last completed handoff in a reply, if any.
function latestHandoff(message: ChatUIMessage | undefined) {
	if (message?.role !== "assistant") return undefined;
	for (const part of message.parts.toReversed()) {
		if (part.type === "tool-handoff" && part.state === "output-available") {
			return { toolCallId: part.toolCallId, botId: part.output.botId };
		}
	}
	return undefined;
}

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
	sendRef: React.RefObject<Send | null>;
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

		send(text.trim(), botId);
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

// Sends the composer's text, addressed to the picked bot.
type Send = (text: string, botId: string | undefined) => void;

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
