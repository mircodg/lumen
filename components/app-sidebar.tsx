import { Suspense } from "react";
import { SignOutMenuItem } from "@/components/auth/sign-out-menu-item";
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
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/lib/auth/user";

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
						className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground"
					/>
				}
			>
				<Avatar>
					<AvatarImage src={user.image ?? getUserAvatarUrl(user.id)} alt="" />
					<AvatarFallback>{user.name.charAt(0).toUpperCase()}</AvatarFallback>
				</Avatar>
				<div className="grid flex-1 leading-tight">
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
		<div className="flex h-12 items-center gap-2 p-2">
			<Skeleton className="size-8 rounded-full" />
			<div className="flex flex-col gap-1">
				<Skeleton className="h-3.5 w-28" />
				<Skeleton className="h-3 w-36" />
			</div>
		</div>
	);
}

export function AppSidebar() {
	return (
		<Sidebar>
			<SidebarHeader className="flex-row justify-end">
				<NewChatMenu />
			</SidebarHeader>
			<SidebarContent />
			<SidebarFooter>
				<SidebarMenu>
					<SidebarMenuItem>
						<Suspense fallback={<UserButtonSkeleton />}>
							<UserButton />
						</Suspense>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarFooter>
		</Sidebar>
	);
}
