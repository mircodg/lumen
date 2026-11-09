import { ChatHeader } from "@/components/chat-header";

// Lives above [chatId], so the header shell persists across chat switches.
// A layout here doesn't receive chatId, so the title comes from the @header
// slot, which does.
export default function ChatsLayout({ children, header }: LayoutProps<"/chats">) {
	return (
		<div className="flex flex-1 flex-col">
			<ChatHeader>{header}</ChatHeader>
			{children}
		</div>
	);
}
