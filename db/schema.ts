// Drizzle schema. Define tables here, then run `bun db:push`.
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";

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
