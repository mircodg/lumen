"use server";

import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { chatMembers } from "@/db/schema";
import { connectBotSandbox, getDesktopConnection } from "@/lib/daytona";
import { getChat } from "@/queries/chat";

export type OpenDesktopResult =
	| { ok: true; url: string; width: number; height: number }
	| { ok: false; error: string };

// Wakes the chat's bot sandbox, starts its desktop, and returns a signed
// WebSocket URL and the screen size for it. chatId comes from the browser, so
// getChat checks that the signed-in user owns the chat first (and redirects
// signed-out callers).
export async function openChatDesktop(
	chatId: string,
): Promise<OpenDesktopResult> {
	if (!(await getChat(chatId))) return { ok: false, error: "Chat not found." };

	const member = await db.query.chatMembers.findFirst({
		where: eq(chatMembers.chatId, chatId),
		orderBy: asc(chatMembers.joinedAt),
		with: { bot: { columns: { sandboxId: true } } },
	});
	const sandboxId = member?.bot.sandboxId;
	if (!sandboxId) return { ok: false, error: "This chat has no sandbox." };

	try {
		const sandbox = await connectBotSandbox(sandboxId);
		return { ok: true, ...(await getDesktopConnection(sandbox)) };
	} catch (error) {
		console.error("Failed to open the sandbox desktop", error);
		return { ok: false, error: "The desktop couldn't be started." };
	}
}
