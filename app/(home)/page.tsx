import { PlusIcon } from "lucide-react";
import { connection } from "next/server";
import { Suspense } from "react";
import { BotDialog } from "@/components/bot-dialog";
import { ChatAvatar } from "@/components/chat-avatar";
import { Button } from "@/components/ui/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";

// Defer to request time so every refresh gets a fresh seed.
async function RandomAvatar() {
	await connection();
	return <ChatAvatar seed={crypto.randomUUID()} animated className="size-10" />;
}

export default function Home() {
	return (
		<main className="flex flex-1 bg-background">
			<Empty>
				<EmptyHeader>
					<EmptyMedia>
						<Suspense fallback={<Skeleton className="size-10 rounded-full" />}>
							<RandomAvatar />
						</Suspense>
					</EmptyMedia>
					<EmptyTitle>Meet your first bot</EmptyTitle>
					<EmptyDescription>
						Every bot gets its own personality, memory, and face. Spin one up
						and start the conversation.
					</EmptyDescription>
				</EmptyHeader>
				<EmptyContent>
					<BotDialog
						trigger={
							<Button variant="secondary">
								<PlusIcon data-icon="inline-start" />
								Create a new bot
							</Button>
						}
					/>
				</EmptyContent>
			</Empty>
		</main>
	);
}
