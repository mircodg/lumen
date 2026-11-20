"use client";

import githubDark from "@pierre/highlights/themes/github-dark";
import githubLight from "@pierre/highlights/themes/github-light";
import { createHighlightsPlugin } from "@pierre/words/highlights";
import { type Components, Markdown as Words } from "@pierre/words/react";
import { cn } from "cn";

// Model output as Markdown. Words repairs half-written syntax while the reply
// streams, drops raw HTML, and checks link and image URLs. Keep the component
// mounted for the same message and pass the full text on each update. Fenced
// code uses the same GitHub light and dark colors as code elsewhere in the app;
// globals.css picks the theme.
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
		<Words
			isAnimating={streaming}
			plugins={plugins}
			components={components}
			controls={controls}
			lineNumbers={false}
			className={cn("min-w-0 text-sm leading-relaxed", className)}
		>
			{children}
		</Words>
	);
}

// Created once so the options stay the same between renders.
const plugins = {
	code: createHighlightsPlugin({
		themes: { light: githubLight, dark: githubDark },
		defaultColor: false,
	}),
};

const controls = { code: { copy: true, download: false } };

// Links from model output open in a new tab.
const components: Components = {
	a: (html) =>
		html.replace("<a ", '<a target="_blank" rel="noopener noreferrer" '),
};
