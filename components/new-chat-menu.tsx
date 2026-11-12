"use client";

import { PlusIcon, UsersIcon } from "lucide-react";
import { useState } from "react";
import { BotDialog } from "@/components/bot-dialog";
import { GroupChatDialog } from "@/components/group-chat-dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import type { PickableBot } from "@/queries/bot";

// `bots` are the ones a group chat can be made from.
export function NewChatMenu({ bots }: { bots: PickableBot[] }) {
	const [botDialogOpen, setBotDialogOpen] = useState(false);
	const [groupDialogOpen, setGroupDialogOpen] = useState(false);

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<SidebarMenuButton
							aria-label="New chat"
							className="size-8 justify-center data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground"
						/>
					}
				>
					<PlusIcon />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-auto">
					<DropdownMenuGroup>
						<DropdownMenuItem onClick={() => setBotDialogOpen(true)}>
							<PlusIcon />
							Create a new bot
						</DropdownMenuItem>
						<DropdownMenuItem onClick={() => setGroupDialogOpen(true)}>
							<UsersIcon />
							Create a group chat
						</DropdownMenuItem>
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>
			{/* Rendered outside the menu so they stay mounted after the menu closes. */}
			<BotDialog open={botDialogOpen} onOpenChange={setBotDialogOpen} />
			<GroupChatDialog
				bots={bots}
				open={groupDialogOpen}
				onOpenChange={setGroupDialogOpen}
			/>
		</>
	);
}
