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
import {
	type ChatTools,
	createHandoffTool,
	createSandboxTools,
} from "@/trigger/tools";

// Gemini Flash is on the Gemini API free tier. Reads GOOGLE_GENERATIVE_AI_API_KEY.
const model = google("gemini-3.5-flash-lite");

// At most this many handoffs in one turn, so bots can't pass a request back
// and forth without anyone answering it.
const MAX_HANDOFFS = 2;

// One long-lived run per chat. The conversation is kept by the platform's
// default transcript storage, keyed by chat id, so a reload or a fresh run
// picks up the history. Sessions are only started by the server actions in
// actions/chat.ts, which check that the signed-in user owns the chat.
//
// In a group chat, the composer picks which bot answers. Its id arrives with
// each turn as the transport's client data, and that bot answers the turn
// with its own instructions and sandbox. Its reply is stamped with the bot's
// id, so the thread can show who wrote it. A bot can hand the turn to
// another bot with the handoff tool: that bot takes over from the next step
// of the same reply, and the handoff part records who wrote what follows.
export const chatAgent = chat
	.withUIMessage<ChatUIMessage>()
	.withClientData({ schema: z.object({ botId: z.string().optional() }) })
	.agent({
		id: "chat",
		// Declared here so each tool's toModelOutput (screenshots as images) is
		// re-applied to history on later turns. Only the definitions matter:
		// run passes each turn's own working set, so these never execute.
		tools: {
			...createSandboxTools(notThisTurn),
			handoff: createHandoffTool(notThisTurn),
		},
		// Messages the owner sends mid-reply steer it: they're added to the
		// model's context at the next step boundary (between tool calls). One that
		// arrives after the last step is answered as the next turn instead.
		pendingMessages: { shouldInject: () => true },
		run: async ({ chatId, clientData, messages, signal, streamText }) => {
			// Read every turn, so bot edits and the bot picked apply to the next reply.
			const bots = await getChatBots(chatId);
			// The picked bot when it's in the chat, else the chat's first one. botId
			// comes from the browser, so it's only matched against the chat's members.
			const first = bots.find((bot) => bot.id === clientData?.botId) ?? bots[0];
			if (!first) {
				return streamText({
					model,
					instructions: "You are a helpful assistant.",
					messages,
					abortSignal: signal,
				});
			}

			// Sent with the reply's start chunk and saved with it in the transcript.
			chat.setUIMessageStreamOptions({
				messageMetadata: () => ({ botId: first.id }),
			});

			const turn = createTurn(bots, first);
			return streamText({
				model,
				instructions: turn.instructions(),
				messages,
				tools: turn.tools,
				// Runs after the SDK's own step preparation (steering, injection).
				prepareStep: turn.prepareStep,
				// Computer use takes many small steps: look, click, look again.
				stopWhen: isStepCount(40),
				abortSignal: signal,
			});
		},
	});

// Which bot wrote a reply: the one that started it. Handoff parts in the
// reply name the bots that took over. On the owner's messages in a group
// chat, the bot the message was addressed to (set by the composer).
export type ChatMessageMetadata = { botId?: string };

export type ChatUIMessage = UIMessage<
	ChatMessageMetadata,
	UIDataTypes,
	InferUITools<ChatTools>
>;

function notThisTurn(): never {
	throw new Error("This tool is only run through a turn's own tool set.");
}

// One turn's state: which bot is speaking, and the tools it works with. A
// handoff picks the next speaker, and prepareStep switches to it at the next
// step boundary. Tool calls made in the same step as the handoff still run
// as the bot that made them.
function createTurn(bots: ChatBot[], first: ChatBot) {
	const group = bots.length > 1;
	let speaker = first;
	let next = first;
	let handoff: Handoff | undefined;
	let handoffs = 0;
	const authors = group ? replyAuthors(bots) : [];

	// Each bot's sandbox connects on its first use in the turn, then is reused.
	// A failed connect is retried by the next tool call.
	const sandboxes = new Map<string, Promise<Sandbox>>();
	function getSandbox() {
		const bot = speaker;
		let sandbox = sandboxes.get(bot.id);
		if (!sandbox) {
			sandbox = (async () => {
				if (!bot.sandboxId) throw new Error("This bot has no sandbox.");
				return connectBotSandbox(bot.sandboxId);
			})().catch((error) => {
				sandboxes.delete(bot.id);
				throw error;
			});
			sandboxes.set(bot.id, sandbox);
		}
		return sandbox;
	}

	async function handOff(botId: string, note: string) {
		if (next !== speaker) {
			throw new Error("You already handed off in this step.");
		}
		if (handoffs >= MAX_HANDOFFS) {
			throw new Error(
				"This request has already been handed off too many times. Answer it yourself.",
			);
		}
		const target = bots.find((bot) => bot.id === botId);
		if (!target) {
			throw new Error(
				`No bot with id "${botId}" is in this chat. The bots are: ${bots.map((bot) => `${bot.name} (id: ${bot.id})`).join(", ")}.`,
			);
		}
		if (target.id === speaker.id) {
			throw new Error("That is you. Answer the request yourself.");
		}

		handoffs += 1;
		next = target;
		handoff = { from: speaker, note };
		return { botId: target.id, name: target.name, note };
	}

	const sandboxTools = createSandboxTools(getSandbox);

	function instructions() {
		return botInstructions(speaker, group ? { bots, authors, handoff } : null);
	}

	return {
		instructions,
		// A chat with one bot has no one to hand off to.
		tools: group
			? { ...sandboxTools, handoff: createHandoffTool(handOff) }
			: sandboxTools,
		// Returned instructions carry forward to later steps, so they're only
		// sent when the speaker changes.
		prepareStep: () => {
			if (next === speaker) return undefined;
			speaker = next;
			return { instructions: instructions() };
		},
	};
}

type Handoff = { from: ChatBot; note: string };

// The chat's bots, in join order.
async function getChatBots(chatId: string) {
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
	return members.map((member) => member.bot);
}

type ChatBot = Awaited<ReturnType<typeof getChatBots>>[number];

// Who wrote each reply so far, oldest first, as names. The model sees earlier
// replies as plain assistant messages, so this tells it which were whose.
// Only the latest few, to keep the prompt short.
function replyAuthors(bots: ChatBot[]) {
	const nameOf = (botId: string) =>
		bots.find((bot) => bot.id === botId)?.name ?? "a bot no longer in this chat";

	return (chat.history.all() as ChatUIMessage[])
		.filter((message) => message.role === "assistant")
		.map((message) => {
			const ids = [
				message.metadata?.botId,
				...message.parts.flatMap((part) =>
					part.type === "tool-handoff" && part.state === "output-available"
						? [part.output.botId]
						: [],
				),
			].filter((id): id is string => Boolean(id));
			return ids.map(nameOf).join(", then (after a handoff) ");
		})
		.filter(Boolean)
		.slice(-20);
}

type GroupContext = {
	bots: ChatBot[];
	authors: string[];
	handoff: Handoff | undefined;
};

// The system prompt. Fixed sections first, then the owner's own instructions,
// so theirs read as the most specific guidance.
// In a group chat, the group's sections come after the bot's own setup, and
// a handoff's note comes last of the fixed ones, as the most immediate context.
function botInstructions(bot: ChatBot, group: GroupContext | null) {
	return [
		identitySection(bot),
		bot.sandboxId ? SANDBOX_SECTION : null,
		BEHAVIOR_SECTION,
		group ? groupSection(bot, group) : null,
		group ? HANDOFF_SECTION : null,
		group?.handoff ? handedToYouSection(group.handoff) : null,
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

function groupSection(bot: ChatBot, { bots, authors }: GroupContext) {
	const roster = bots
		.map(
			(member) =>
				`- ${member.name} (id: ${member.id})${member.id === bot.id ? ", that is you" : ""}: ${member.job}`,
		)
		.join("\n");
	const history =
		authors.length > 0
			? `\n\nWho wrote the replies so far, oldest first:\n\n${authors.map((author, index) => `${index + 1}. ${author}`).join("\n")}`
			: "";

	return `# This group chat

This is a group chat. Your owner added several bots to it, each created for its own job, with its own instructions and its own sandbox. The bots in this chat:

${roster}

How a group chat works:

- Your owner picks which bot answers each message, and only that bot replies. You are the one answering now.
- Speak only for yourself. Do not write replies for other bots, and do not start your reply with your name; the chat already shows who wrote it.
- The conversation includes replies from the other bots, shown to you as if they were your own. You did not write them or run their tool calls, and you cannot reach their sandboxes: files they made are in their sandbox, not yours. Build on what they said, and never present their work as yours.${history}`;
}

const HANDOFF_SECTION = `# Handing off

When a request is clearly a better fit for another bot's job than yours, call handoff to pass it to that bot instead of answering it yourself. That bot takes over at once, in this same reply, so your owner does not have to ask again.

- Decide before doing any work. If you hand off, you may first write one short sentence saying who you are handing to and why, then call handoff on its own and stop.
- Write the note for the bot taking over: what your owner wants, and anything useful you already know or did, so it does not start from nothing.
- Hand off only when another bot is clearly better suited. If the request fits your job, or no bot fits it better, answer it yourself. Never hand off just to avoid a hard task.
- When your owner asks you by name to do something you can do, do it yourself.`;

function handedToYouSection({ from, note }: Handoff) {
	return `# You were handed this request

${from.name} handed your owner's latest message to you, because it fits your job better than theirs.${note ? ` Their note: "${note}"` : ""}

Answer it now, as yourself. Do not hand it back to ${from.name}. Hand it on only if it is clearly another bot's job.`;
}
