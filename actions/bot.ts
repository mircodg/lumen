"use server";

import { refresh } from "next/cache";
import * as z from "zod";
import { db } from "@/db";
import { bots, type CreateBotInput, createBotSchema } from "@/db/schema";
import { auth } from "@/lib/auth/server";

export type CreateBotResult =
	| { ok: true; bot: { id: string; name: string } }
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

	try {
		const [bot] = await db
			.insert(bots)
			.values({
				...values,
				// Store a blank textarea as "no instructions".
				instructions: instructions || null,
				userId: session.user.id,
			})
			.returning({ id: bots.id, name: bots.name });

		refresh();
		return { ok: true, bot };
	} catch (error) {
		console.error("createBot failed", error);
		return { ok: false, error: "Could not create the bot. Please try again." };
	}
}
