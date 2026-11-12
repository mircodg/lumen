"use server";

import { and, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { refresh } from "next/cache";
import * as z from "zod";
import { db } from "@/db";
import {
	bots,
	type CreateBotInput,
	chatMembers,
	chats,
	createBotSchema,
	type UpdateBotInput,
	updateBotSchema,
} from "@/db/schema";
import { auth } from "@/lib/auth/server";
import { createBotSandbox, deleteBotSandbox } from "@/lib/daytona";

export type CreateBotResult =
	| { ok: true; bot: { id: string; name: string }; chatId: string }
	| { ok: false; error: string };

export async function createBot(
	input: CreateBotInput,
): Promise<CreateBotResult> {
	const { data: session } = await auth.getSession();
	if (!session?.user) {
		return { ok: false, error: "You need to be signed in to create a bot." };
	}

	const parsed = createBotSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: z.prettifyError(parsed.error) };
	}

	const { instructions, ...values } = parsed.data;
	const userId = session.user.id;
	// Generated up front so the sandbox can be labeled with it.
	const botId = nanoid();

	let sandboxId: string;
	try {
		sandboxId = await createBotSandbox({ botId, userId });
	} catch (error) {
		console.error("createBot: sandbox creation failed", error);
		return { ok: false, error: "Could not create the bot. Please try again." };
	}

	try {
		// Every bot starts with a direct chat. Create all three rows or none.
		const { bot, chatId } = await db.transaction(async (tx) => {
			const [bot] = await tx
				.insert(bots)
				.values({
					...values,
					id: botId,
					// Store a blank textarea as "no instructions".
					instructions: instructions || null,
					sandboxId,
					userId,
				})
				.returning({ id: bots.id, name: bots.name });

			// Direct chats have no name of their own; they show the bot's name.
			const [chat] = await tx
				.insert(chats)
				.values({ userId, kind: "direct" })
				.returning({ id: chats.id });

			await tx.insert(chatMembers).values({ chatId: chat.id, botId: bot.id });

			return { bot, chatId: chat.id };
		});

		refresh();
		return { ok: true, bot, chatId };
	} catch (error) {
		console.error("createBot failed", error);
		// No bot row points at the sandbox, so remove it rather than leak it.
		await deleteBotSandbox(sandboxId).catch((cleanupError) =>
			console.error(
				"createBot: sandbox cleanup failed",
				sandboxId,
				cleanupError,
			),
		);
		return { ok: false, error: "Could not create the bot. Please try again." };
	}
}

export type UpdateBotResult =
	| { ok: true; bot: { id: string; name: string } }
	| { ok: false; error: string };

export async function updateBot(
	botId: string,
	input: UpdateBotInput,
): Promise<UpdateBotResult> {
	const { data: session } = await auth.getSession();
	if (!session?.user) {
		return { ok: false, error: "You need to be signed in to edit a bot." };
	}

	const parsed = updateBotSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: z.prettifyError(parsed.error) };
	}

	const { instructions, ...values } = parsed.data;

	try {
		// Scoped to the owner, so another user's bot id updates nothing.
		const [bot] = await db
			.update(bots)
			.set({ ...values, instructions: instructions || null })
			.where(and(eq(bots.id, botId), eq(bots.userId, session.user.id)))
			.returning({ id: bots.id, name: bots.name });

		if (!bot) {
			return { ok: false, error: "This bot no longer exists." };
		}

		refresh();
		return { ok: true, bot };
	} catch (error) {
		console.error("updateBot failed", error);
		return { ok: false, error: "Could not save the bot. Please try again." };
	}
}

export type DeleteBotResult =
	| { ok: true; bot: { id: string; name: string } }
	| { ok: false; error: string };

// Deletes the bot and its direct chats, which would be left with no one in
// them. Group chats only lose the bot as a member (the FK cascades).
// Doesn't call refresh(): the caller is on the deleted chat's page, which would
// re-render as a 404. The client navigates away and refreshes instead.
export async function deleteBot(botId: string): Promise<DeleteBotResult> {
	const { data: session } = await auth.getSession();
	if (!session?.user) {
		return { ok: false, error: "You need to be signed in to delete a bot." };
	}

	const userId = session.user.id;

	try {
		const bot = await db.transaction(async (tx) => {
			// Read before deleting the bot, which cascades away its memberships.
			const directChats = await tx
				.select({ id: chats.id })
				.from(chats)
				.innerJoin(chatMembers, eq(chatMembers.chatId, chats.id))
				.where(
					and(
						eq(chatMembers.botId, botId),
						eq(chats.userId, userId),
						eq(chats.kind, "direct"),
					),
				);

			// Scoped to the owner, so another user's bot id deletes nothing.
			const [bot] = await tx
				.delete(bots)
				.where(and(eq(bots.id, botId), eq(bots.userId, userId)))
				.returning({
					id: bots.id,
					name: bots.name,
					sandboxId: bots.sandboxId,
				});
			if (!bot) return null;

			if (directChats.length > 0) {
				await tx.delete(chats).where(
					inArray(
						chats.id,
						directChats.map((chat) => chat.id),
					),
				);
			}

			return bot;
		});

		if (!bot) {
			return { ok: false, error: "This bot no longer exists." };
		}

		// The bot is gone either way; a failed sandbox delete is only logged.
		if (bot.sandboxId) {
			await deleteBotSandbox(bot.sandboxId).catch((error) =>
				console.error("deleteBot: sandbox delete failed", bot.sandboxId, error),
			);
		}

		return { ok: true, bot: { id: bot.id, name: bot.name } };
	} catch (error) {
		console.error("deleteBot failed", error);
		return { ok: false, error: "Could not delete the bot. Please try again." };
	}
}
