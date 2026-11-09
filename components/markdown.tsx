"use client";

import { cn } from "cn";
import { type Components, defaultComponents, Streamdown } from "streamdown";
import {
	CodeBlock,
	CodeBlockActions,
	CodeBlockContent,
	CodeBlockCopyButton,
	CodeBlockHeader,
	CodeBlockLine,
	CodeBlockTitle,
} from "@/components/ui/code-block";
import { useHighlightedCode } from "@/hooks/use-highlighted-code";

// Model output as Markdown. Streamdown closes half-written syntax while the
// reply streams and sanitizes HTML and links. Fenced code renders with the
// project's CodeBlock and Shiki setup, so it matches code everywhere else.
export function Markdown({
	children,
	streaming = false,
	className,
}: {
	children: string;
	streaming?: boolean;
	className?: string;
}) {
	return (
		<Streamdown
			mode={streaming ? "streaming" : "static"}
			isAnimating={streaming}
			components={components}
			className={cn("min-w-0 text-sm leading-relaxed", className)}
		>
			{children}
		</Streamdown>
	);
}

const components: Components = {
	code: ({ node, className, children, ...props }) => {
		// Streamdown marks fenced blocks with data-block. Inline code keeps its
		// default styling.
		if (!("data-block" in props)) {
			return (
				<defaultComponents.code node={node} className={className} {...props}>
					{children}
				</defaultComponents.code>
			);
		}

		const language = className?.match(/language-(\S+)/)?.[1] ?? "";
		return <FencedCode code={String(children ?? "")} language={language} />;
	},
};

function FencedCode({ code, language }: { code: string; language: string }) {
	const lines = useHighlightedCode(code, language);
	const value = code.replace(/\n$/, "");

	return (
		<CodeBlock className="my-3">
			<CodeBlockHeader>
				<CodeBlockTitle>{language || "text"}</CodeBlockTitle>
				<CodeBlockActions>
					<CodeBlockCopyButton value={value} />
				</CodeBlockActions>
			</CodeBlockHeader>
			<CodeBlockContent className="max-h-96">
				{lines.map((line, index) => (
					<CodeBlockLine key={index}>{line}</CodeBlockLine>
				))}
			</CodeBlockContent>
		</CodeBlock>
	);
}
