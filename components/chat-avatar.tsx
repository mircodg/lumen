import Image from "next/image"

import { cn } from "@/lib/utils"

const SIZE = 32

type ChatAvatarProps = {
	seed: string
	animated?: boolean
	className?: string
}

function getAvatarUrl(seed: string, animated: boolean) {
	const params = new URLSearchParams({ seed })
	if (animated) params.set("tags", "animation")
	return `https://api.dicebear.com/10.x/gaze/svg?${params}`
}

export function ChatAvatar({ seed, animated = false, className }: ChatAvatarProps) {
	return (
		<Image
			src={getAvatarUrl(seed, animated)}
			alt=""
			width={SIZE}
			height={SIZE}
			// The DiceBear API returns SVG, which Next.js does not optimize.
			unoptimized
			className={cn("size-8 shrink-0", className)}
		/>
	)
}
