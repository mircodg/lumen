"use server";

import { refresh } from "next/cache";
import * as z from "zod";
import { db } from "@/db";
import {
	bots,
	type CreateBotInput,
	chatMembers,
	chats,
	createBotSchema,
} from "@/db/schema";
import { auth } from "@/lib/auth/server";

export type CreateBotResult =
	| { ok: true; bot: { id: string; name: string }; chatId: string }
	| { ok: false; error: string };

export async function createBot(input: CreateBotInput): Promise<CreateBotResult> {
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

	try {
		// Every bot starts with a direct chat. Create all three rows or none.
		const { bot, chatId } = await db.transaction(async (tx) => {
			const [bot] = await tx
				.insert(bots)
				.values({
					...values,
					// Store a blank textarea as "no instructions".
					instructions: instructions || null,
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
		return { ok: false, error: "Could not create the bot. Please try again." };
	}
}
