export default function ChatsLayout({ children }: LayoutProps<"/chats">) {
	return (
		// Viewport height, so the thread scrolls inside the page and the prompt
		// stays pinned to the bottom. The page composes the header and panels.
		<div className="flex h-svh flex-col">{children}</div>
	);
}
