import { google } from "@ai-sdk/google";
import {
	convertToModelMessages,
	createUIMessageStreamResponse,
	safeValidateUIMessages,
	streamText,
	toUIMessageStream,
} from "ai";
import { auth } from "@/lib/auth/server";
import { type Chat, getChat } from "@/queries/chat";

// Gemini Flash is on the Gemini API free tier. Reads GOOGLE_GENERATIVE_AI_API_KEY.
const model = google("gemini-3.5-flash-lite");

// The client sends the whole conversation on every turn. Nothing is persisted
// yet, so the history lives only in the browser.
export async function POST(request: Request) {
	// getChat redirects signed-out callers, which is wrong for a fetch: answer
	// with a status instead.
	const { data: session } = await auth.getSession();
	if (!session?.user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const body: { id?: unknown; messages?: unknown } = await request
		.json()
		.catch(() => ({}));

	// Missing and someone else's chat look the same, so ids don't leak.
	const chat = typeof body.id === "string" ? await getChat(body.id) : null;
	if (!chat) {
		return Response.json({ error: "Chat not found" }, { status: 404 });
	}

	const messages = await safeValidateUIMessages({ messages: body.messages });
	if (!messages.success) {
		return Response.json({ error: "Invalid messages" }, { status: 400 });
	}

	const result = streamText({
		model,
		instructions: botInstructions(chat.bot),
		messages: await convertToModelMessages(messages.data),
		abortSignal: request.signal,
	});

	return createUIMessageStreamResponse({
		stream: toUIMessageStream({ stream: result.stream }),
	});
}

function botInstructions(bot: Chat["bot"]) {
	if (!bot) return "You are a helpful assistant.";

	return [`You are ${bot.name}. Your job: ${bot.job}`, bot.instructions]
		.filter(Boolean)
		.join("\n\n");
}
