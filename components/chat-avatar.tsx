import { Avatar, Style } from "@dicebear/core"
import gaze from "@dicebear/styles/gaze.json" with { type: "json" }
import Image from "next/image"

import { cn } from "@/lib/utils"

const SIZE = 32

type ChatAvatarProps = Omit<
	React.ComponentProps<typeof Image>,
	"src" | "alt" | "width" | "height"
> & {
	seed: string
	animated?: boolean
}

const style = new Style(gaze)

// Rendered avatars by seed. The same faces repeat across the sidebar, the
// header, and search, so each one is generated once.
const cache = new Map<string, string>()
const CACHE_LIMIT = 500

// Generated in-process, so a face paints with the markup instead of after a
// request to the DiceBear API. The output is the same SVG the API returns.
function getAvatarUri(seed: string, animated: boolean) {
	const key = `${animated ? "a" : "s"}:${seed}`
	let uri = cache.get(key)

	if (!uri) {
		uri = new Avatar(style, {
			seed,
			...(animated ? { tags: ["animation"] } : {}),
		}).toDataUri()
		// Seeds can be random (the home page, the shuffle button), so the cache
		// is dropped before it grows without bound.
		if (cache.size >= CACHE_LIMIT) cache.clear()
		cache.set(key, uri)
	}

	return uri
}

export function ChatAvatar({
	seed,
	animated = false,
	className,
	...props
}: ChatAvatarProps) {
	return (
		<Image
			{...props}
			src={getAvatarUri(seed, animated)}
			alt=""
			width={SIZE}
			height={SIZE}
			// An inline SVG data URI: there is nothing for Next.js to optimize.
			unoptimized
			className={cn("size-8 shrink-0", className)}
		/>
	)
}
