"use client";

import { useChat } from "@ai-sdk/react";
import type { TriggerChatTransport } from "@trigger.dev/sdk/chat";
import {
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
import { useRef, useState } from "react";
import {
	loadChatTranscript,
	mintChatAccessToken,
	startChatSession,
} from "@/actions/chat";
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
import type { chatAgent } from "@/trigger/chat";

// The conversation for one chat, run by the Trigger.dev chat agent in
// trigger/chat.ts. The agent keeps the history in its transcript storage, so
// it's loaded first and the thread mounts once it's in. The page keys this by
// chat id, so switching chats starts a fresh thread.
export function Chat({ chatId, name }: { chatId: string; name: string }) {
	const transport = useTriggerChatTransport<typeof chatAgent>({
		task: "chat",
		accessToken: ({ chatId }) => mintChatAccessToken(chatId),
		startSession: ({ chatId, clientData }) =>
			startChatSession({ chatId, clientData }),
	});
	const transcript = useLoadTranscript(chatId, loadChatTranscript, {
		transport,
	});

	if (transcript.isLoading) return null;

	return (
		<ChatThread
			chatId={chatId}
			name={name}
			transport={transport}
			initialMessages={transcript.messages}
		/>
	);
}

function ChatThread({
	chatId,
	name,
	transport,
	initialMessages,
}: {
	chatId: string;
	name: string;
	transport: TriggerChatTransport;
	initialMessages: UIMessage[];
}) {
	const { messages, sendMessage, status, stop, error, regenerate } = useChat({
		id: chatId,
		messages: initialMessages,
		transport,
	});
	const [text, setText] = useState("");
	const formRef = useRef<HTMLFormElement>(null);

	const busy = status === "submitted" || status === "streaming";
	const canSend = text.trim().length > 0 && !busy;
	// Waiting for the first token: the last message is still the user's, or an
	// assistant message with no text yet.
	const lastMessage = messages.at(-1);
	const pending =
		busy && (lastMessage?.role === "user" || !messageText(lastMessage));

	function onSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!canSend) return;

		void sendMessage({ text: text.trim() });
		setText("");
	}

	return (
		<MessageScrollerProvider autoScroll>
			<div className="flex min-h-0 flex-1 flex-col">
				<div className="min-h-0 flex-1">
					{messages.length === 0 ? (
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
					) : (
						<MessageScroller>
							<MessageScrollerViewport>
								<MessageScrollerContent
									aria-busy={busy}
									className="mx-auto w-full max-w-3xl p-4"
								>
									{messages.map((message) => {
										const isUser = message.role === "user";
										const reply = messageText(message);
										// The assistant message exists before its first token.
										if (!reply) return null;

										return (
											<MessageScrollerItem
												key={message.id}
												messageId={message.id}
												scrollAnchor={isUser}
											>
												{isUser ? (
													<Message align="end">
														<MessageContent>
															<Bubble align="end" variant="muted">
																<BubbleContent className="whitespace-pre-wrap">
																	{reply}
																</BubbleContent>
															</Bubble>
														</MessageContent>
													</Message>
												) : (
													<Message>
														<MessageContent>
															<Markdown
																streaming={busy && message === messages.at(-1)}
															>
																{reply}
															</Markdown>
														</MessageContent>
													</Message>
												)}
											</MessageScrollerItem>
										);
									})}
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
					)}
				</div>
				<form
					ref={formRef}
					onSubmit={onSubmit}
					className="mx-auto w-full max-w-3xl p-4 pt-0"
				>
					<InputGroup>
						<InputGroupTextarea
							value={text}
							onChange={(event) => setText(event.target.value)}
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
							{busy ? (
								<InputGroupButton
									variant="default"
									size="icon-sm"
									className="ml-auto"
									onClick={() => void stop()}
								>
									<SquareIcon />
									<span className="sr-only">Stop</span>
								</InputGroupButton>
							) : (
								<InputGroupButton
									type="submit"
									variant="default"
									size="icon-sm"
									className="ml-auto"
									disabled={!canSend}
								>
									<ArrowUpIcon />
									<span className="sr-only">Send</span>
								</InputGroupButton>
							)}
						</InputGroupAddon>
					</InputGroup>
				</form>
			</div>
		</MessageScrollerProvider>
	);
}

function messageText(message: UIMessage | undefined) {
	if (!message) return "";

	return message.parts
		.filter((part) => part.type === "text")
		.map((part) => part.text)
		.join("");
}
