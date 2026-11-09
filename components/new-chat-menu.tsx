"use client";

import { PlusIcon, UsersIcon } from "lucide-react";
import { useState } from "react";
import { BotDialog } from "@/components/bot-dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuButton } from "@/components/ui/sidebar";

export function NewChatMenu() {
	const [botDialogOpen, setBotDialogOpen] = useState(false);

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
						<DropdownMenuItem>
							<UsersIcon />
							Create a group chat
						</DropdownMenuItem>
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>
			{/* Rendered outside the menu so it stays mounted after the menu closes. */}
			<BotDialog open={botDialogOpen} onOpenChange={setBotDialogOpen} />
		</>
	);
}
