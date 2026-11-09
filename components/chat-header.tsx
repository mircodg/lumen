import { MonitorIcon } from "lucide-react";
import { BotDialog } from "@/components/bot-dialog";
import { ChatAvatar } from "@/components/chat-avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Chat } from "@/queries/chat";

// The static shell. Rendered by the chats layout, so it stays mounted while
// switching chats; only the title passed as children changes.
export function ChatHeader({ children }: { children: React.ReactNode }) {
	return (
		<header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
			{children}
			{/* Not wired up yet. */}
			<Button
				type="button"
				variant="ghost"
				size="icon-sm"
				aria-label="Desktop"
				className="ml-auto"
			>
				<MonitorIcon />
			</Button>
		</header>
	);
}

// The chat's avatar and name. Reads the database, so it streams in.
export function ChatHeaderTitle({ chat }: { chat: Chat }) {
	if (!chat.bot) {
		return (
			<>
				<ChatAvatar seed={chat.avatar} className="size-5" />
				<h1 className="truncate text-sm font-medium">{chat.name}</h1>
			</>
		);
	}

	return (
		<BotDialog
			bot={chat.bot}
			trigger={
				// Avatar and name share one button, so either opens the editor.
				<Button
					type="button"
					variant="ghost"
					size="sm"
					aria-label={`Edit ${chat.bot.name}`}
					// Pull back by the button's start padding so the avatar stays aligned.
					className="-ml-1.5 min-w-0"
				>
					<ChatAvatar
						seed={chat.avatar}
						data-icon="inline-start"
						className="size-5"
					/>
					<span className="truncate text-sm">{chat.name}</span>
				</Button>
			}
		/>
	);
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
