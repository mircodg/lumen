import { asc, desc, eq } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { chatMembers, chats } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/user";

export type SidebarChat = {
	id: string;
	name: string;
	preview: string | null;
	lastMessageAt: Date;
	// Seed for the chat's face. Group chats fall back to their first bot.
	avatar: string;
};

// The signed-in user's chats, most recent first. Scoped to the session's user
// id, never to a caller-supplied one. Reads the session cookie, so callers
// must render inside <Suspense>. Cached per request, so the sidebar list and
// the search dialog share one query.
export const getUserChats = cache(async (): Promise<SidebarChat[]> => {
	const user = await getCurrentUser();

	const rows = await db.query.chats.findMany({
		where: eq(chats.userId, user.id),
		orderBy: desc(chats.lastMessageAt),
		columns: { id: true, name: true, lastMessageAt: true, lastMessagePreview: true },
		with: {
			members: {
				orderBy: asc(chatMembers.joinedAt),
				limit: 1,
				with: { bot: { columns: { name: true, avatar: true } } },
			},
		},
	});

	return rows.map((chat) => {
		const bot = chat.members[0]?.bot;
		return {
			id: chat.id,
			name: chat.name ?? bot?.name ?? "Untitled chat",
			preview: chat.lastMessagePreview,
			lastMessageAt: chat.lastMessageAt,
			avatar: bot?.avatar ?? chat.id,
		};
	});
});
