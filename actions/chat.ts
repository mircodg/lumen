"use server";

import { auth } from "@trigger.dev/sdk";
import {
	type ChatStartSessionParams,
	chat,
	defaultStorage,
} from "@trigger.dev/sdk/ai";
import { getChat } from "@/queries/chat";
import type { chatAgent } from "@/trigger/chat";

// The transport calls these three. chatId comes from the browser, so each one
// checks that the signed-in user owns the chat first. getChat redirects
// signed-out callers and returns null for missing and someone else's chats.

const start = chat.createStartSessionAction<typeof chatAgent>("chat");
const load = chat.createLoadTranscriptAction(defaultStorage);

async function assertChatOwner(chatId: string) {
	if (!(await getChat(chatId))) throw new Error("Chat not found");
}

// Creates the chat's session and first run, or returns the existing one.
export async function startChatSession(
	params: ChatStartSessionParams<typeof chatAgent>,
) {
	await assertChatOwner(params.chatId);
	return start(params);
}

// Refreshes the session token when it expires.
export async function mintChatAccessToken(chatId: string) {
	await assertChatOwner(chatId);
	return auth.createPublicToken({
		scopes: { read: { sessions: chatId }, write: { sessions: chatId } },
		expirationTime: "1h",
	});
}

// The saved conversation, for rendering before the chat connects.
export async function loadChatTranscript(params: {
	chatId: string;
	limit?: number;
}) {
	await assertChatOwner(params.chatId);
	return load(params);
}
