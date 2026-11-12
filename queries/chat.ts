import { chat as chatAgents, defaultStorage } from "@trigger.dev/sdk/ai";
import { and, asc, eq } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { chatMembers, chats, type EditableBot } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/user";

export type Chat = {
	id: string;
	kind: "direct" | "group";
	name: string;
	// Face seeds of the chat's bots, in join order. One for a direct chat.
	avatars: string[];
	// The chat's bots, in join order. The first one answers by default.
	bots: EditableBot[];
};

// One of the signed-in user's chats, or null when it doesn't exist or belongs
// to someone else. Scoped to the session's user id, never to a caller-supplied
// one. Reads the session cookie, so callers must render inside <Suspense>.
// Cached per request, so the page and its header share one query.
export const getChat = cache(async (chatId: string): Promise<Chat | null> => {
	const user = await getCurrentUser();

	const chat = await db.query.chats.findFirst({
		where: and(eq(chats.id, chatId), eq(chats.userId, user.id)),
		columns: { id: true, kind: true, name: true },
		with: {
			members: {
				orderBy: asc(chatMembers.joinedAt),
				with: {
					bot: {
						columns: {
							id: true,
							name: true,
							avatar: true,
							job: true,
							instructions: true,
						},
					},
				},
			},
		},
	});
	if (!chat) return null;

	const bots = chat.members.map((member) => member.bot);
	return {
		id: chat.id,
		kind: chat.kind,
		name: chat.name ?? bots[0]?.name ?? "Untitled chat",
		avatars: bots.length > 0 ? bots.map((bot) => bot.avatar) : [chat.id],
		bots,
	};
});

const loadTranscript = chatAgents.createLoadTranscriptAction(defaultStorage);

// A chat's saved conversation, read from the agent's transcript storage.
// Loads purely by chat id with no owner check, so call getChat for the same
// id and only send the result to the browser when it returns the chat.
export function getChatTranscript(chatId: string) {
	return loadTranscript({ chatId });
}
