"use client";

import { cn } from "cn";
import {
	CircleAlertIcon,
	EyeIcon,
	FilePenIcon,
	FileTextIcon,
	FolderOpenIcon,
	ForwardIcon,
	KeyboardIcon,
	LoaderCircleIcon,
	MonitorIcon,
	MouseIcon,
	MousePointer2Icon,
	MousePointerClickIcon,
	TerminalIcon,
	TypeIcon,
} from "lucide-react";
import Image from "next/image";
import { Markdown } from "@/components/markdown";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import {
	CodeBlock,
	CodeBlockContent,
	CodeBlockCopyButton,
	CodeBlockHeader,
	CodeBlockTitle,
} from "@/components/ui/code-block";
import {
	Trace,
	TraceCollapsible,
	TraceCollapsibleContent,
	TraceCollapsibleTrigger,
	TraceDescription,
	TraceIcon,
	TraceLine,
	TraceTitle,
} from "@/components/ui/trace";
import type { ChatUIMessage } from "@/trigger/chat";

type Part = ChatUIMessage["parts"][number];
type ToolPart = Extract<Part, { type: `tool-${string}` }>;

// An assistant message's parts in order: text as markdown, each run of tool
// calls as one Trace, and screenshots the bot showed as images in the thread.
export function AssistantParts({
	parts,
	streaming,
}: {
	parts: Part[];
	streaming: boolean;
}) {
	const blocks = groupParts(parts);

	return blocks.map((block, index) => {
		const last = index === blocks.length - 1;
		switch (block.kind) {
			case "text":
				return (
					<Markdown key={block.key} streaming={streaming && last}>
						{block.text}
					</Markdown>
				);
			case "screen":
				return <ScreenImage key={block.key} part={block.part} />;
			case "steer":
				// Where the agent read the owner's mid-reply message, shown as the
				// owner's bubble at that point in the reply.
				return block.messages.map((message) => (
					<Bubble key={message.id} align="end" variant="muted">
						<BubbleContent className="whitespace-pre-wrap">
							{message.text}
						</BubbleContent>
					</Bubble>
				));
			default:
				return (
					<Trace key={block.key}>
						{block.parts.map((part, partIndex) => (
							<ToolRow
								key={part.toolCallId}
								part={part}
								// Only the newest run can still be in flight.
								streaming={streaming && last}
								// The reply's newest row keeps shimmering after it finishes
								// while the model works out its next step, so the thread
								// never looks stuck between tool calls.
								waiting={
									streaming && last && partIndex === block.parts.length - 1
								}
							/>
						))}
					</Trace>
				);
		}
	});
}

type Block =
	| { kind: "text"; key: string; text: string }
	| { kind: "tools"; key: string; parts: ToolPart[] }
	| { kind: "screen"; key: string; part: ShowScreenPart }
	| { kind: "steer"; key: string; messages: InjectedMessage[] };

type ShowScreenPart = Extract<ToolPart, { type: "tool-showScreen" }>;

type InjectedMessage = { id: string; text: string };

// The part Trigger.dev writes when messages sent mid-reply were injected into
// the agent's context. Its shape is documented; it isn't in our message type
// because the SDK adds it, not our tools.
const INJECTED_TYPE = "data-pending-message-injected";

function injectedMessages(part: { type: string }): InjectedMessage[] | null {
	if (part.type !== INJECTED_TYPE) return null;
	const messages = (part as { data?: { messages?: unknown } }).data?.messages;
	return Array.isArray(messages) ? (messages as InjectedMessage[]) : [];
}

function groupParts(parts: Part[]) {
	const blocks: Block[] = [];

	parts.forEach((part, index) => {
		const injected = injectedMessages(part);
		if (injected) {
			if (injected.length > 0) {
				blocks.push({
					kind: "steer",
					key: `steer-${index}`,
					messages: injected,
				});
			}
			return;
		}
		if (part.type === "text") {
			if (part.text) {
				blocks.push({ kind: "text", key: `text-${index}`, text: part.text });
			}
			return;
		}
		if (!isToolPart(part)) return;

		// A shown screenshot sits in the thread, not in the activity list.
		if (part.type === "tool-showScreen" && part.state === "output-available") {
			blocks.push({ kind: "screen", key: part.toolCallId, part });
			return;
		}

		const previous = blocks.at(-1);
		if (previous?.kind === "tools") {
			previous.parts.push(part);
		} else {
			blocks.push({ kind: "tools", key: part.toolCallId, parts: [part] });
		}
	});

	return blocks;
}

function isToolPart(part: Part): part is ToolPart {
	return part.type.startsWith("tool-");
}

// Whether a message has anything to render yet. The assistant message exists
// before its first token or tool call.
export function hasVisibleParts(message: ChatUIMessage | undefined) {
	return Boolean(
		message?.parts.some(
			(part) =>
				(part.type === "text" && part.text) ||
				isToolPart(part) ||
				Boolean(injectedMessages(part)?.length),
		),
	);
}

function ScreenImage({ part }: { part: ShowScreenPart }) {
	if (part.state !== "output-available") return null;
	const { image, width, height } = part.output;

	return (
		<Image
			src={`data:image/jpeg;base64,${image}`}
			alt="Screenshot of the bot's screen"
			width={width || 1280}
			height={height || 720}
			unoptimized
			className="h-auto w-full rounded-lg border"
		/>
	);
}

type Phase = "running" | "done" | "failed";

function phaseOf(part: ToolPart, streaming: boolean): Phase {
	switch (part.state) {
		case "output-available":
			return "done";
		case "output-error":
		case "output-denied":
			return "failed";
		default:
			// No result and the reply has ended: the call was cut off.
			return streaming ? "running" : "failed";
	}
}

type RowContent = {
	icon: React.ComponentType;
	// Verbs per phase: running, done, failed.
	verbs: [string, string, string];
	subject?: string;
	description?: string;
	detail?: React.ReactNode;
};

function ToolRow({
	part,
	streaming,
	waiting,
}: {
	part: ToolPart;
	streaming: boolean;
	waiting: boolean;
}) {
	const phase = phaseOf(part, streaming);
	const row = describe(part);
	const verb = row.verbs[phase === "running" ? 0 : phase === "done" ? 1 : 2];
	const title = row.subject ? `${verb} ${row.subject}` : verb;

	const Icon =
		phase === "running"
			? LoaderCircleIcon
			: phase === "failed"
				? CircleAlertIcon
				: row.icon;
	const line = (
		<TraceLine
			status={
				phase === "running"
					? "running"
					: phase === "failed"
						? "error"
						: undefined
			}
		>
			<TraceIcon>
				<Icon className={phase === "running" ? "animate-spin" : undefined} />
			</TraceIcon>
			{/* A running row already shimmers through its status. */}
			<TraceTitle className={cn(waiting && phase !== "running" && "shimmer")}>
				{title}
			</TraceTitle>
			{row.description && (
				<TraceDescription>{row.description}</TraceDescription>
			)}
		</TraceLine>
	);

	const detail =
		part.state === "output-error" ? (
			<Output variant="destructive">{part.errorText}</Output>
		) : phase === "done" ? (
			row.detail
		) : null;

	// A row only expands once there is something to show.
	if (!detail) return line;

	return (
		<TraceCollapsible>
			<TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
			<TraceCollapsibleContent>{detail}</TraceCollapsibleContent>
		</TraceCollapsible>
	);
}

// Input fields stream in, so every field may still be missing.
function describe(part: ToolPart): RowContent {
	switch (part.type) {
		case "tool-bash": {
			const command = part.input?.command ?? "";
			const output = part.state === "output-available" ? part.output : null;
			return {
				icon: TerminalIcon,
				verbs: ["Running", "Ran", "Failed to run"],
				subject: firstLine(command) || "a command",
				description:
					output && output.exitCode !== 0
						? `exit ${output.exitCode}`
						: undefined,
				detail: output && (
					<Output title={command}>
						{`$ ${command}\n${output.output}`.trimEnd()}
					</Output>
				),
			};
		}
		case "tool-readFile": {
			const output = part.state === "output-available" ? part.output : null;
			return {
				icon: FileTextIcon,
				verbs: ["Reading", "Read", "Failed to read"],
				subject: part.input?.path ?? "a file",
				detail: output && (
					<Output title={part.input?.path}>{output.content}</Output>
				),
			};
		}
		case "tool-writeFile": {
			const output = part.state === "output-available" ? part.output : null;
			return {
				icon: FilePenIcon,
				verbs: ["Writing", "Wrote", "Failed to write"],
				subject: part.input?.path ?? "a file",
				description: output ? formatBytes(output.bytes) : undefined,
				detail: output && (
					<Output title={part.input?.path}>{part.input?.content ?? ""}</Output>
				),
			};
		}
		case "tool-listFiles": {
			const output = part.state === "output-available" ? part.output : null;
			return {
				icon: FolderOpenIcon,
				verbs: ["Listing", "Listed", "Failed to list"],
				subject: part.input?.path ?? "a directory",
				description: output ? plural(output.entries.length, "item") : undefined,
				detail: output && output.entries.length > 0 && (
					<Output title={part.input?.path}>
						{output.entries
							.map((entry) => (entry.isDir ? `${entry.name}/` : entry.name))
							.join("\n")}
					</Output>
				),
			};
		}
		case "tool-mouseClick": {
			const kind =
				part.input?.button === "right"
					? "Right-click"
					: part.input?.button === "middle"
						? "Middle-click"
						: part.input?.double
							? "Double-click"
							: "Click";
			return {
				icon: MousePointerClickIcon,
				verbs: [`${kind}ing`, `${kind}ed`, `Failed to ${kind.toLowerCase()}`],
				subject: at(part.input),
			};
		}
		case "tool-mouseMove":
			return {
				icon: MousePointer2Icon,
				verbs: [
					"Moving the pointer",
					"Moved the pointer",
					"Failed to move the pointer",
				],
				subject: at(part.input, "to"),
			};
		case "tool-mouseScroll": {
			const direction = part.input?.direction ?? "";
			return {
				icon: MouseIcon,
				verbs: ["Scrolling", "Scrolled", "Failed to scroll"],
				subject: [direction, at(part.input)].filter(Boolean).join(" "),
			};
		}
		case "tool-keyboardType":
			return {
				icon: TypeIcon,
				verbs: ["Typing", "Typed", "Failed to type"],
				subject: part.input?.text ? `“${firstLine(part.input.text)}”` : "",
			};
		case "tool-keyboardPress":
			return {
				icon: KeyboardIcon,
				verbs: ["Pressing", "Pressed", "Failed to press"],
				subject: [...(part.input?.modifiers ?? []), part.input?.key]
					.filter(Boolean)
					.join("+"),
			};
		case "tool-viewScreen":
			// The screenshot is the bot's own; only the fact that it looked shows.
			return {
				icon: EyeIcon,
				verbs: [
					"Looking at the screen",
					"Looked at the screen",
					"Failed to look at the screen",
				],
			};
		case "tool-showScreen":
			return {
				icon: MonitorIcon,
				verbs: [
					"Capturing the screen",
					"Captured the screen",
					"Failed to capture the screen",
				],
			};
		case "tool-handoff": {
			// The target's name only arrives with the output.
			const output = part.state === "output-available" ? part.output : null;
			return {
				icon: ForwardIcon,
				verbs: ["Handing off", "Handed off", "Failed to hand off"],
				subject: output ? `to ${output.name}` : "",
				detail: output?.note && (
					<p className="whitespace-pre-wrap text-muted-foreground text-sm">
						{output.note}
					</p>
				),
			};
		}
	}
}

function Output({
	title,
	variant,
	children,
}: {
	title?: string;
	variant?: "destructive";
	children: string;
}) {
	return (
		<CodeBlock size="sm" variant={variant}>
			{title && (
				<CodeBlockHeader>
					<CodeBlockTitle className="truncate">
						{firstLine(title)}
					</CodeBlockTitle>
					<CodeBlockCopyButton value={children} className="ml-auto" />
				</CodeBlockHeader>
			)}
			<CodeBlockContent wrap className="max-h-64">
				{children}
			</CodeBlockContent>
		</CodeBlock>
	);
}

function at(input: { x?: number; y?: number } | undefined, preposition = "at") {
	if (input?.x === undefined || input.y === undefined) return "";
	return `${preposition} (${input.x}, ${input.y})`;
}

function firstLine(text: string) {
	const [line = "", ...rest] = text.trim().split("\n");
	return rest.length > 0 ? `${line} …` : line;
}

function plural(count: number, noun: string) {
	return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function formatBytes(bytes: number) {
	if (bytes < 1024) return plural(bytes, "byte");
	return `${(bytes / 1024).toFixed(1)} KB`;
}
