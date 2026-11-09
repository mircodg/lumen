"use client";

import { SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ChatAvatar } from "@/components/chat-avatar";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { Kbd, KbdGroup } from "@/components/ui/kbd";

export type SearchableChat = {
	id: string;
	name: string;
	preview: string | null;
	avatar: string;
	lastMessageAt: string;
	lastMessageAgo: string;
};

const noopSubscribe = () => () => {};

// The platform never changes, so there is nothing to subscribe to. The server
// snapshot renders "⌘" and the client corrects it after hydration.
function useModifierKey() {
	return useSyncExternalStore(
		noopSubscribe,
		() => (/Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl"),
		() => "⌘",
	);
}

export function ChatSearchDialog({ chats }: { chats: SearchableChat[] }) {
	const [open, setOpen] = useState(false);
	const router = useRouter();
	const modifierKey = useModifierKey();

	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
				event.preventDefault();
				setOpen((open) => !open);
			}
		}

		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, []);

	function openChat(id: string) {
		setOpen(false);
		router.push(`/chats/${id}`);
	}

	return (
		<>
			<Button
				type="button"
				variant="outline"
				aria-haspopup="dialog"
				onClick={() => setOpen(true)}
				// Looks like <Input /> at rest (its placeholder color included) while
				// keeping the outline button's hover.
				className="w-full min-w-0 justify-start border-input bg-transparent px-2.5 py-1 text-base font-normal text-muted-foreground transition-colors md:text-sm dark:bg-input/30"
			>
				<SearchIcon data-icon="inline-start" />
				Search chats
				<KbdGroup className="ml-auto">
					<Kbd>{modifierKey}K</Kbd>
				</KbdGroup>
			</Button>
			<CommandDialog
				open={open}
				onOpenChange={setOpen}
				title="Search chats"
				description="Find a chat by name or message."
			>
				<Command>
					<CommandInput placeholder="Search chats..." />
					<CommandList>
						<CommandEmpty>No chats found.</CommandEmpty>
						<CommandGroup heading="Chats">
							{chats.map((chat) => (
								<CommandItem
									key={chat.id}
									value={chat.id}
									keywords={[chat.name, chat.preview ?? ""]}
									onSelect={() => openChat(chat.id)}
									className="gap-3"
								>
									<ChatAvatar seed={chat.avatar} />
									<div className="grid min-w-0 flex-1 leading-tight">
										<div className="flex items-baseline justify-between gap-2">
											<span className="truncate font-medium">{chat.name}</span>
											<time
												dateTime={chat.lastMessageAt}
												className="shrink-0 text-xs text-muted-foreground"
											>
												{chat.lastMessageAgo}
											</time>
										</div>
										{chat.preview && (
											<span className="truncate text-xs text-muted-foreground">
												{chat.preview}
											</span>
										)}
									</div>
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</CommandDialog>
		</>
	);
}
