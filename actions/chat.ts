"use server";

import { auth } from "@trigger.dev/sdk";
import { type ChatStartSessionParams, chat } from "@trigger.dev/sdk/ai";
import { getChat } from "@/queries/chat";
import type { chatAgent } from "@/trigger/chat";

// The transport calls these two. chatId comes from the browser, so each one
// checks that the signed-in user owns the chat first. getChat redirects
// signed-out callers and returns null for missing and someone else's chats.

const start = chat.createStartSessionAction<typeof chatAgent>("chat");

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
