import { google } from "@ai-sdk/google";
import { chat } from "@trigger.dev/sdk/ai";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { chatMembers } from "@/db/schema";

// Gemini Flash is on the Gemini API free tier. Reads GOOGLE_GENERATIVE_AI_API_KEY.
const model = google("gemini-3.5-flash-lite");

// One long-lived run per chat. The conversation is kept by the platform's
// default transcript storage, keyed by chat id, so a reload or a fresh run
// picks up the history. Sessions are only started by the server actions in
// actions/chat.ts, which check that the signed-in user owns the chat.
export const chatAgent = chat.agent({
	id: "chat",
	run: async ({ chatId, messages, signal, streamText }) =>
		streamText({
			model,
			// Read every turn, so bot edits apply to the next reply.
			instructions: botInstructions(await getChatBot(chatId)),
			messages,
			abortSignal: signal,
		}),
});

// The chat's first bot, or null when it has none.
async function getChatBot(chatId: string) {
	const member = await db.query.chatMembers.findFirst({
		where: eq(chatMembers.chatId, chatId),
		orderBy: asc(chatMembers.joinedAt),
		with: {
			bot: { columns: { name: true, job: true, instructions: true } },
		},
	});
	return member?.bot ?? null;
}

function botInstructions(
	bot: Awaited<ReturnType<typeof getChatBot>>,
) {
	if (!bot) return "You are a helpful assistant.";

	return [`You are ${bot.name}. Your job: ${bot.job}`, bot.instructions]
		.filter(Boolean)
		.join("\n\n");
}
