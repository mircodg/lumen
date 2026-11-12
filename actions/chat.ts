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
	type UpdateGroupChatInput,
	updateGroupChatSchema,
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

export type UpdateGroupChatResult =
	| { ok: true; chat: { id: string; name: string } }
	| { ok: false; error: string };

// Renames the group and sets its members to exactly `botIds`. Members who stay
// keep their join time, so their order holds; new ones join after them in the
// order they were picked.
export async function updateGroupChat(
	chatId: string,
	input: UpdateGroupChatInput,
): Promise<UpdateGroupChatResult> {
	const { data: session } = await userAuth.getSession();
	if (!session?.user) {
		return { ok: false, error: "You need to be signed in to edit a group." };
	}

	const parsed = updateGroupChatSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: z.prettifyError(parsed.error) };
	}

	const userId = session.user.id;
	const botIds = [...new Set(parsed.data.botIds)];

	try {
		const owned = await db
			.select({ id: bots.id })
			.from(bots)
			.where(and(inArray(bots.id, botIds), eq(bots.userId, userId)));
		if (owned.length !== botIds.length) {
			return { ok: false, error: "Some of these bots no longer exist." };
		}

		const chat = await db.transaction(async (tx) => {
			// Scoped to the owner and to groups, so another user's chat id or a
			// direct chat updates nothing.
			const [chat] = await tx
				.update(chats)
				.set({ name: parsed.data.name })
				.where(
					and(
						eq(chats.id, chatId),
						eq(chats.userId, userId),
						eq(chats.kind, "group"),
					),
				)
				.returning({ id: chats.id, name: chats.name });
			if (!chat) return null;

			const current = await tx
				.select({ botId: chatMembers.botId })
				.from(chatMembers)
				.where(eq(chatMembers.chatId, chatId));
			const currentIds = new Set(current.map((member) => member.botId));

			const removed = [...currentIds].filter((id) => !botIds.includes(id));
			if (removed.length > 0) {
				await tx
					.delete(chatMembers)
					.where(
						and(
							eq(chatMembers.chatId, chatId),
							inArray(chatMembers.botId, removed),
						),
					);
			}

			const added = botIds.filter((id) => !currentIds.has(id));
			if (added.length > 0) {
				// Spaced out like on create, so they keep the order they were picked in.
				const now = Date.now();
				await tx.insert(chatMembers).values(
					added.map((botId, index) => ({
						chatId,
						botId,
						joinedAt: new Date(now + index),
					})),
				);
			}

			return { id: chat.id, name: chat.name ?? parsed.data.name };
		});

		if (!chat) {
			return { ok: false, error: "This group no longer exists." };
		}

		refresh();
		return { ok: true, chat };
	} catch (error) {
		console.error("updateGroupChat failed", error);
		return { ok: false, error: "Could not save the group. Please try again." };
	}
}

export type DeleteGroupChatResult =
	| { ok: true; chat: { id: string; name: string } }
	| { ok: false; error: string };

// Deletes the group and its memberships (the FK cascades). The bots stay.
// Doesn't call refresh(): the caller is on the deleted chat's page, which would
// re-render as a 404. The client navigates away and refreshes instead.
export async function deleteGroupChat(
	chatId: string,
): Promise<DeleteGroupChatResult> {
	const { data: session } = await userAuth.getSession();
	if (!session?.user) {
		return { ok: false, error: "You need to be signed in to delete a group." };
	}

	try {
		// Scoped to the owner and to groups, so another user's chat id or a direct
		// chat deletes nothing.
		const [chat] = await db
			.delete(chats)
			.where(
				and(
					eq(chats.id, chatId),
					eq(chats.userId, session.user.id),
					eq(chats.kind, "group"),
				),
			)
			.returning({ id: chats.id, name: chats.name });

		if (!chat) {
			return { ok: false, error: "This group no longer exists." };
		}

		return { ok: true, chat: { id: chat.id, name: chat.name ?? "Group" } };
	} catch (error) {
		console.error("deleteGroupChat failed", error);
		return {
			ok: false,
			error: "Could not delete the group. Please try again.",
		};
	}
}
