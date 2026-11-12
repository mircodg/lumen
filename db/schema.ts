// Drizzle schema. Define tables here, then run `bun db:push`.
import { relations } from "drizzle-orm";
import {
	index,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import * as z from "zod";

export const bots = pgTable(
	"bots",
	{
		id: text()
			.primaryKey()
			.$defaultFn(() => nanoid()),
		name: text().notNull(),
		// Seed used to generate the bot's face.
		avatar: text()
			.notNull()
			.$defaultFn(() => nanoid()),
		// What the bot is created for, in a phrase.
		job: text().notNull(),
		// How it should go about the job.
		instructions: text(),
		// Daytona sandbox id, created with the bot and deleted with it.
		sandboxId: text(),
		// Third-party user id.
		userId: text().notNull(),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp({ withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [index("bot_user_id_idx").on(t.userId)],
);

export const chatKind = pgEnum("chat_kind", ["direct", "group"]);

export const chats = pgTable(
	"chats",
	{
		id: text()
			.primaryKey()
			.$defaultFn(() => nanoid()),
		// Third-party user id.
		userId: text().notNull(),
		kind: chatKind().notNull().default("direct"),
		// Null for direct chats, which show the bot's name.
		name: text(),
		lastMessagePreview: text(),
		lastMessageAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp({ withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [index("chat_user_id_idx").on(t.userId)],
);

export const chatMembers = pgTable(
	"chat_members",
	{
		chatId: text()
			.notNull()
			.references(() => chats.id, { onDelete: "cascade" }),
		botId: text()
			.notNull()
			.references(() => bots.id, { onDelete: "cascade" }),
		joinedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [
		// Leads with chatId, so it also serves lookups by chat.
		primaryKey({ columns: [t.chatId, t.botId] }),
		index("chat_member_bot_id_idx").on(t.botId),
	],
);

export const botsRelations = relations(bots, ({ many }) => ({
	memberships: many(chatMembers),
}));

export const chatsRelations = relations(chats, ({ many }) => ({
	members: many(chatMembers),
}));

export const chatMembersRelations = relations(chatMembers, ({ one }) => ({
	chat: one(chats, { fields: [chatMembers.chatId], references: [chats.id] }),
	bot: one(bots, { fields: [chatMembers.botId], references: [bots.id] }),
}));

// Validation for inserting a bot. Derived from the table so column changes flow through.
export const insertBotSchema = createInsertSchema(bots, {
	name: (s) => s.trim().min(1, "Give your bot a name.").max(50),
	job: (s) => s.trim().min(1, "Describe the bot's job.").max(100),
	instructions: (s) => s.trim().max(2000),
});

// The fields a user fills in. Ids, owner, and timestamps are set on the server.
// The form always sends a face seed and a (possibly blank) instructions string.
export const createBotSchema = insertBotSchema
	.pick({ name: true, job: true })
	.extend({
		avatar: insertBotSchema.shape.avatar.unwrap(),
		instructions: insertBotSchema.shape.instructions.unwrap(),
	});

export type CreateBotInput = z.input<typeof createBotSchema>;

// Editing changes the same fields the user filled in on create.
export const updateBotSchema = createBotSchema;

export type UpdateBotInput = z.input<typeof updateBotSchema>;

// The bot fields the edit form starts from.
export type EditableBot = Pick<
	typeof bots.$inferSelect,
	"id" | "name" | "avatar" | "job" | "instructions"
>;

// Validation for inserting a chat. Derived from the table so column changes flow through.
export const insertChatSchema = createInsertSchema(chats, {
	name: (s) => s.trim().min(1, "Give the group a name.").max(50),
});

// The fields a user fills in for a group chat. The name is required here, and
// the bots are the members, in the order they were picked.
export const createGroupChatSchema = insertChatSchema
	.pick({ name: true })
	.extend({
		name: insertChatSchema.shape.name.unwrap(),
		botIds: z.array(z.string()).min(2, "Pick at least two bots."),
	});

export type CreateGroupChatInput = z.input<typeof createGroupChatSchema>;

// Editing a group changes the same fields the user filled in on create. The
// bots are the members after the edit, existing ones first in join order.
export const updateGroupChatSchema = createGroupChatSchema;

export type UpdateGroupChatInput = z.input<typeof updateGroupChatSchema>;

// The group fields the edit form starts from.
export type EditableGroupChat = { id: string; name: string; botIds: string[] };
