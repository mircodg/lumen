import { BotDialog } from "@/components/bot-dialog";
import { DesktopPanelToggle } from "@/components/desktop-panel";
import { GroupChatAvatar } from "@/components/group-chat-avatar";
import { GroupChatDialog } from "@/components/group-chat-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { PickableBot } from "@/queries/bot";
import type { Chat } from "@/queries/chat";

// The static shell. Paints at once; only the title passed as children streams.
export function ChatHeader({ children }: { children: React.ReactNode }) {
	return (
		<header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
			{children}
			<DesktopPanelToggle />
		</header>
	);
}

// The chat's avatar and name, as a button that opens its editor: the bot's
// for a direct chat, the group's for a group. Reads the database, so it
// streams in. `bots` are the ones a group can be made from.
export function ChatHeaderTitle({
	chat,
	bots,
}: {
	chat: Chat;
	bots: PickableBot[];
}) {
	// Avatar and name share one button, so either opens the editor.
	const trigger = (
		<Button
			type="button"
			variant="ghost"
			size="sm"
			aria-label={`Edit ${chat.name}`}
			// Pull back by the button's start padding so the avatar stays aligned.
			className="-ml-1.5 min-w-0"
		>
			<GroupChatAvatar
				seeds={chat.avatars}
				data-icon="inline-start"
				className="size-5"
			/>
			<span className="truncate text-sm">{chat.name}</span>
		</Button>
	);

	if (chat.kind === "group") {
		return (
			<GroupChatDialog
				bots={bots}
				chat={{
					id: chat.id,
					name: chat.name,
					botIds: chat.bots.map((bot) => bot.id),
				}}
				trigger={trigger}
			/>
		);
	}

	const bot = chat.bots[0];
	// A direct chat whose bot is gone has nothing to edit.
	if (!bot) {
		return (
			<>
				<GroupChatAvatar seeds={chat.avatars} className="size-5" />
				<h1 className="truncate text-sm font-medium">{chat.name}</h1>
			</>
		);
	}

	return <BotDialog bot={bot} trigger={trigger} />;
}

// Same footprint as the title, so nothing shifts when it streams in.
export function ChatHeaderTitleSkeleton() {
	return (
		<div className="flex items-center gap-2">
			<Skeleton className="size-5 rounded-full" />
			<Skeleton className="h-3.5 w-24" />
		</div>
	);
}
