import { Suspense } from "react";
import { SignOutMenuItem } from "@/components/auth/sign-out-menu-item";
import { ChatList, ChatListSkeleton } from "@/components/chat-list";
import { ChatSearch, ChatSearchSkeleton } from "@/components/chat-search";
import { NewChatMenu } from "@/components/new-chat-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/lib/auth/user";
import { getUserBots } from "@/queries/bot";

function getUserAvatarUrl(seed: string) {
	const params = new URLSearchParams({ seed });
	return `https://api.dicebear.com/10.x/open-peeps/svg?${params}`;
}

// Reads the session cookie, so it must render inside Suspense.
async function UserButton() {
	const user = await getCurrentUser();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<SidebarMenuButton
						size="lg"
						// Collapsed, every button is size-8. p-0.5 centers the size-7 avatar,
						// the same box the chat avatars use.
						className="group-data-[collapsible=icon]:p-0.5! data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground"
					/>
				}
			>
				<Avatar className="transition-[width,height] group-data-[collapsible=icon]:size-7">
					<AvatarImage src={user.image ?? getUserAvatarUrl(user.id)} alt="" />
					<AvatarFallback>{user.name.charAt(0).toUpperCase()}</AvatarFallback>
				</Avatar>
				<div className="grid flex-1 leading-tight group-data-[collapsible=icon]:hidden">
					<span className="truncate font-medium">{user.name}</span>
					<span className="truncate text-xs text-foreground">{user.email}</span>
				</div>
			</DropdownMenuTrigger>
			<DropdownMenuContent side="top">
				<DropdownMenuGroup>
					<SignOutMenuItem />
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

// SidebarMenuSkeleton picks a random width with Math.random(), which Cache
// Components rejects during prerender, so this fallback uses fixed sizes.
function UserButtonSkeleton() {
	return (
		<div className="flex h-12 items-center gap-2 p-2 group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:p-0.5">
			<Skeleton className="size-8 shrink-0 rounded-full group-data-[collapsible=icon]:size-7" />
			<div className="flex flex-col gap-1 group-data-[collapsible=icon]:hidden">
				<Skeleton className="h-3.5 w-28" />
				<Skeleton className="h-3 w-36" />
			</div>
		</div>
	);
}

// Reads the session cookie, so it must render inside Suspense.
async function NewChat() {
	const bots = await getUserBots();
	return <NewChatMenu bots={bots} />;
}

export function AppSidebar() {
	return (
		<Sidebar collapsible="icon">
			<SidebarHeader>
				<SidebarMenu className="items-end">
					<SidebarMenuItem>
						<Suspense fallback={<Skeleton className="size-8" />}>
							<NewChat />
						</Suspense>
					</SidebarMenuItem>
				</SidebarMenu>
				<Suspense fallback={<ChatSearchSkeleton />}>
					<ChatSearch />
				</Suspense>
			</SidebarHeader>
			<SidebarContent>
				<Suspense fallback={<ChatListSkeleton />}>
					<ChatList />
				</Suspense>
			</SidebarContent>
			<SidebarFooter>
				<SidebarMenu>
					<SidebarMenuItem>
						<Suspense fallback={<UserButtonSkeleton />}>
							<UserButton />
						</Suspense>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
