"use server";

import { auth } from "@trigger.dev/sdk";
import { type ChatStartSessionParams, chat } from "@trigger.dev/sdk/ai";
import { and, eq, inArray } from "drizzle-orm";
import { refresh } from "next/cache";
import * as z from "zod";
import { db } from "@/db";
import {
	bots,
	type CreateGroupChatInput,
	chatMembers,
	chats,
	createGroupChatSchema,
} from "@/db/schema";
import { auth as userAuth } from "@/lib/auth/server";
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

export type CreateGroupChatResult =
	| { ok: true; chatId: string }
	| { ok: false; error: string };

export async function createGroupChat(
	input: CreateGroupChatInput,
): Promise<CreateGroupChatResult> {
	const { data: session } = await userAuth.getSession();
	if (!session?.user) {
		return { ok: false, error: "You need to be signed in to create a group." };
	}

	const parsed = createGroupChatSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: z.prettifyError(parsed.error) };
	}

	const userId = session.user.id;
	const botIds = [...new Set(parsed.data.botIds)];

	try {
		// Only the user's own bots can join, so another user's bot id is rejected.
		const owned = await db
			.select({ id: bots.id })
			.from(bots)
			.where(and(inArray(bots.id, botIds), eq(bots.userId, userId)));
		if (owned.length !== botIds.length) {
			return { ok: false, error: "Some of these bots no longer exist." };
		}

		const chatId = await db.transaction(async (tx) => {
			const [chat] = await tx
				.insert(chats)
				.values({ userId, kind: "group", name: parsed.data.name })
				.returning({ id: chats.id });

			// One statement gives every row the same now(), so the join times are
			// spaced out to keep the order the bots were picked in.
			const now = Date.now();
			await tx.insert(chatMembers).values(
				botIds.map((botId, index) => ({
					chatId: chat.id,
					botId,
					joinedAt: new Date(now + index),
				})),
			);

			return chat.id;
		});

		refresh();
		return { ok: true, chatId };
	} catch (error) {
		console.error("createGroupChat failed", error);
		return {
			ok: false,
			error: "Could not create the group. Please try again.",
		};
	}
}
