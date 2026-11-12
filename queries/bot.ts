import { asc, desc, eq } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { bots, chatMembers, chats } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/user";

export type SidebarChat = {
	id: string;
	name: string;
	preview: string | null;
	lastMessageAt: Date;
	// Face seeds of the chat's bots, in join order. One for a direct chat.
	avatars: string[];
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
		columns: {
			id: true,
			name: true,
			lastMessageAt: true,
			lastMessagePreview: true,
		},
		with: {
			members: {
				orderBy: asc(chatMembers.joinedAt),
				with: { bot: { columns: { name: true, avatar: true } } },
			},
		},
	});

	return rows.map((chat) => {
		const avatars = chat.members.map((member) => member.bot.avatar);
		return {
			id: chat.id,
			name: chat.name ?? chat.members[0]?.bot.name ?? "Untitled chat",
			preview: chat.lastMessagePreview,
			lastMessageAt: chat.lastMessageAt,
			// A chat with no bots left still gets a face of its own.
			avatars: avatars.length > 0 ? avatars : [chat.id],
		};
	});
});

export type PickableBot = { id: string; name: string; avatar: string };

// The signed-in user's bots, oldest first, for picking group members. Reads
// the session cookie, so callers must render inside <Suspense>.
export const getUserBots = cache(async (): Promise<PickableBot[]> => {
	const user = await getCurrentUser();

	return db.query.bots.findMany({
		where: eq(bots.userId, user.id),
		orderBy: asc(bots.createdAt),
		columns: { id: true, name: true, avatar: true },
	});
});
