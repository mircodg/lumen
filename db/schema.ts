// Drizzle schema. Define tables here, then run `bun db:push`.
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import type * as z from "zod";

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
		// Third-party sandbox id, created lazily.
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
