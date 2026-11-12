import { google } from "@ai-sdk/google";
import type { Sandbox } from "@daytona/sdk";
import { chat } from "@trigger.dev/sdk/ai";
import {
	type InferUITools,
	isStepCount,
	type UIDataTypes,
	type UIMessage,
} from "ai";
import { asc, eq } from "drizzle-orm";
import * as z from "zod";
import { db } from "@/db";
import { chatMembers } from "@/db/schema";
import { connectBotSandbox } from "@/lib/daytona";
import { createSandboxTools, type SandboxTools } from "@/trigger/tools";

// Gemini Flash is on the Gemini API free tier. Reads GOOGLE_GENERATIVE_AI_API_KEY.
const model = google("gemini-3.5-flash-lite");

// One long-lived run per chat. The conversation is kept by the platform's
// default transcript storage, keyed by chat id, so a reload or a fresh run
// picks up the history. Sessions are only started by the server actions in
// actions/chat.ts, which check that the signed-in user owns the chat.
//
// In a group chat, the composer picks which bot answers. Its id arrives with
// each turn as the transport's client data, and that bot answers the turn
// with its own instructions and sandbox. Its reply is stamped with the bot's
// id, so the thread can show who wrote it.
export const chatAgent = chat
	.withUIMessage<ChatUIMessage>()
	.withClientData({ schema: z.object({ botId: z.string().optional() }) })
	.agent({
		id: "chat",
		// Declared here as well as on streamText so each tool's toModelOutput
		// (screenshots as images) is re-applied to history on later turns.
		// Resolved per turn, so the tools work in the turn's bot's sandbox.
		tools: ({ chatId, clientData }) =>
			createSandboxTools(sandboxConnector(chatId, clientData?.botId)),
		// Messages the owner sends mid-reply steer it: they're added to the
		// model's context at the next step boundary (between tool calls). One that
		// arrives after the last step is answered as the next turn instead.
		pendingMessages: { shouldInject: () => true },
		run: async ({
			chatId,
			clientData,
			messages,
			tools,
			signal,
			streamText,
		}) => {
			// Read every turn, so bot edits and the bot picked apply to the next reply.
			const bot = await getChatBot(chatId, clientData?.botId);
			// Sent with the reply's start chunk and saved with it in the transcript.
			if (bot) {
				chat.setUIMessageStreamOptions({
					messageMetadata: () => ({ botId: bot.id }),
				});
			}

			return streamText({
				model,
				instructions: botInstructions(bot),
				messages,
				tools,
				// Computer use takes many small steps: look, click, look again.
				stopWhen: isStepCount(40),
				abortSignal: signal,
			});
		},
	});

// Which bot wrote a reply. Unset on the owner's own messages.
export type ChatMessageMetadata = { botId?: string };

export type ChatUIMessage = UIMessage<
	ChatMessageMetadata,
	UIDataTypes,
	InferUITools<SandboxTools>
>;

// Connects to the chat's bot sandbox on first use, then reuses it for the
// rest of the turn. A failed connect is retried by the next tool call.
function sandboxConnector(chatId: string, botId: string | undefined) {
	let sandbox: Promise<Sandbox> | undefined;

	return () => {
		sandbox ??= (async () => {
			const bot = await getChatBot(chatId, botId);
			if (!bot?.sandboxId) throw new Error("This bot has no sandbox.");
			return connectBotSandbox(bot.sandboxId);
		})().catch((error) => {
			sandbox = undefined;
			throw error;
		});
		return sandbox;
	};
}

// The bot answering this turn: the picked one when it's in the chat, else
// the chat's first bot, or null when it has none. botId comes from the
// browser, so it's only matched against the chat's own members.
async function getChatBot(chatId: string, botId: string | undefined) {
	const members = await db.query.chatMembers.findMany({
		where: eq(chatMembers.chatId, chatId),
		orderBy: asc(chatMembers.joinedAt),
		with: {
			bot: {
				columns: {
					id: true,
					name: true,
					job: true,
					instructions: true,
					sandboxId: true,
				},
			},
		},
	});
	const member = members.find((member) => member.botId === botId) ?? members[0];
	return member?.bot ?? null;
}

type ChatBot = NonNullable<Awaited<ReturnType<typeof getChatBot>>>;

// The system prompt. Fixed sections first, then the owner's own instructions,
// so theirs read as the most specific guidance.
function botInstructions(bot: ChatBot | null) {
	if (!bot) return "You are a helpful assistant.";

	return [
		identitySection(bot),
		bot.sandboxId ? SANDBOX_SECTION : null,
		BEHAVIOR_SECTION,
		bot.instructions
			? `# Instructions from your owner\n\n${bot.instructions}`
			: null,
	]
		.filter(Boolean)
		.join("\n\n");
}

function identitySection(bot: ChatBot) {
	return `# Who you are

You are ${bot.name}, a bot that your owner created for one job: ${bot.job}

Your purpose is to do that job well for your owner. Keep the conversation centered on it. When a request falls outside it, help briefly if you reasonably can, and say when something is better handled elsewhere.

Your owner chose your name and your job. Introduce yourself as ${bot.name} when it is natural, and do not claim to be a general-purpose assistant.`;
}

const SANDBOX_SECTION = `# Your environment

You have your own sandbox: an isolated Linux computer with its own filesystem, network access, and dedicated CPU, memory, and disk. It belongs to you alone and exists for as long as you do. It is created with you and deleted with you. It goes to sleep when idle and keeps its files while asleep; the first action after a sleep takes a little longer while it wakes.

It has a graphical desktop as well as a shell. Use your tools to work in it:

- Prefer the shell and file tools for anything they can do. They are faster and more reliable than the desktop.
- Use the desktop for graphical apps and web pages. Look before you act: call viewScreen to see the screen, then click, type, or scroll at pixel coordinates read from that screenshot. After an action that changes the screen, look again to confirm it worked before moving on.
- Your screenshots are private to you. When your owner asks what is on the screen or wants to see it, use showScreen so the image appears in the chat.
- Work step by step toward the goal, and stop to ask when you need something only your owner can provide, such as a password or a decision.`;

const BEHAVIOR_SECTION = `# How you work

- Be direct and concise. Lead with the answer, then add detail only when it helps.
- Ask a short clarifying question when a request is ambiguous enough that guessing would waste your owner's time.
- Be honest about what you know and what you have done. Never claim to have taken an action, run something, or checked something that you did not.`;
