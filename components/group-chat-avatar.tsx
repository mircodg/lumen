import { ChatAvatar } from "@/components/chat-avatar";
import { cn } from "@/lib/utils";

// Up to three faces, then a count of the rest.
const MAX_FACES = 3;

// Where each face sits inside the square, by how many items there are. Sizes
// and offsets are percentages, so the cluster takes exactly the box of a
// single ChatAvatar and scales with the same size-* classes.
const LAYOUTS: Record<2 | 3, string[]> = {
	// Side by side, overlapping.
	2: ["left-0 top-[18.75%] size-[62.5%]", "right-0 top-[18.75%] size-[62.5%]"],
	// A triangle: one on top, two below.
	3: [
		"left-[22.5%] top-0 size-[55%]",
		"bottom-0 left-0 size-[55%]",
		"right-0 bottom-0 size-[55%]",
	],
};

// A chat's face: the bot's own for a direct chat, a cluster for a group. The
// seeds are the bots' face seeds in join order.
export function GroupChatAvatar({
	seeds,
	className,
	"data-icon": dataIcon,
}: {
	seeds: string[];
	className?: string;
	// Lets a Button lay it out like an icon.
	"data-icon"?: "inline-start" | "inline-end";
}) {
	if (seeds.length <= 1) {
		return (
			<ChatAvatar
				seed={seeds[0] ?? ""}
				data-icon={dataIcon}
				className={className}
			/>
		);
	}

	// Four or more: a 2x2 grid of three faces and the count of the rest.
	if (seeds.length > MAX_FACES) {
		const rest = seeds.length - MAX_FACES;
		return (
			<span
				aria-hidden
				data-icon={dataIcon}
				className={cn(
					"@container grid size-8 shrink-0 grid-cols-2 grid-rows-2",
					className,
				)}
			>
				{seeds.slice(0, MAX_FACES).map((seed) => (
					<ChatAvatar key={seed} seed={seed} className="size-full" />
				))}
				<span className="flex items-center justify-center rounded-full bg-muted text-[22cqw] leading-none font-medium text-muted-foreground tabular-nums">
					+{rest}
				</span>
			</span>
		);
	}

	const layout = LAYOUTS[seeds.length as 2 | 3];
	return (
		<span
			aria-hidden
			data-icon={dataIcon}
			className={cn("relative size-8 shrink-0", className)}
		>
			{seeds.map((seed, index) => (
				<ChatAvatar
					key={seed}
					seed={seed}
					className={cn("absolute", layout[index])}
				/>
			))}
		</span>
	);
}
