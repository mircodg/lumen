import type { Sandbox } from "@daytona/sdk";
import { tool } from "ai";
import * as z from "zod";
import { ensureDesktop } from "@/lib/daytona";

// Tool output is stored in the transcript and re-sent to the model every
// turn, so long text is cut down to this many characters.
const MAX_OUTPUT = 20_000;

const BASH_TIMEOUT_SECONDS = 120;

// The tools a bot uses to work in its sandbox. `getSandbox` connects lazily,
// so a turn that calls no tools never wakes the sandbox.
export function createSandboxTools(getSandbox: () => Promise<Sandbox>) {
	async function getDesktop() {
		const sandbox = await getSandbox();
		await ensureDesktop(sandbox);
		return sandbox.computerUse;
	}

	return {
		bash: tool({
			description:
				"Run a shell command in your sandbox with bash and return its combined output and exit code. Each call is a fresh shell: state such as `cd` or exported variables does not carry over, so chain steps with && or pass `cwd`. Commands time out after 2 minutes; start long-running servers in the background with nohup and `&`.",
			inputSchema: z.object({
				command: z.string().describe("The bash command to run."),
				cwd: z
					.string()
					.optional()
					.describe("Working directory. Defaults to the home directory."),
			}),
			execute: async ({ command, cwd }) => {
				const sandbox = await getSandbox();
				const response = await sandbox.process.executeCommand(
					command,
					cwd,
					undefined,
					BASH_TIMEOUT_SECONDS,
				);
				return {
					exitCode: response.exitCode,
					output: truncate(response.result),
				};
			},
		}),

		readFile: tool({
			description: "Read a text file from your sandbox.",
			inputSchema: z.object({
				path: z
					.string()
					.describe("Absolute path, or relative to the home directory."),
			}),
			execute: async ({ path }) => {
				const sandbox = await getSandbox();
				const content = await sandbox.fs.downloadFile(path);
				return { content: truncate(content.toString("utf8")) };
			},
		}),

		writeFile: tool({
			description:
				"Write a text file in your sandbox, replacing it if it exists. Parent directories must already exist.",
			inputSchema: z.object({
				path: z
					.string()
					.describe("Absolute path, or relative to the home directory."),
				content: z.string().describe("The full contents of the file."),
			}),
			execute: async ({ path, content }) => {
				const sandbox = await getSandbox();
				const file = Buffer.from(content, "utf8");
				await sandbox.fs.uploadFile(file, path);
				return { bytes: file.byteLength };
			},
		}),

		listFiles: tool({
			description: "List the files and directories in a directory.",
			inputSchema: z.object({
				path: z
					.string()
					.describe("Absolute path, or relative to the home directory."),
			}),
			execute: async ({ path }) => {
				const sandbox = await getSandbox();
				const files = await sandbox.fs.listFiles(path);
				return {
					entries: files.map((file) => ({
						name: file.name,
						isDir: file.isDir,
						size: file.size,
					})),
				};
			},
		}),

		mouseClick: tool({
			description:
				"Click the mouse at a point on the screen, in screen pixels. Look at the screen first to find the point.",
			inputSchema: z.object({
				x: z.number().int(),
				y: z.number().int(),
				button: z.enum(["left", "right", "middle"]).default("left"),
				double: z.boolean().default(false).describe("Double-click."),
			}),
			execute: async ({ x, y, button, double }) => {
				const desktop = await getDesktop();
				await desktop.mouse.click(x, y, button, double);
				return { x, y };
			},
		}),

		mouseMove: tool({
			description:
				"Move the mouse pointer to a point on the screen, in screen pixels, for example to hover.",
			inputSchema: z.object({ x: z.number().int(), y: z.number().int() }),
			execute: async ({ x, y }) => {
				const desktop = await getDesktop();
				const position = await desktop.mouse.move(x, y);
				return { x: position.x ?? x, y: position.y ?? y };
			},
		}),

		mouseScroll: tool({
			description:
				"Scroll the mouse wheel at a point on the screen, in screen pixels.",
			inputSchema: z.object({
				x: z.number().int(),
				y: z.number().int(),
				direction: z.enum(["up", "down"]),
				amount: z
					.number()
					.int()
					.min(1)
					.max(20)
					.default(3)
					.describe("Wheel ticks. One tick moves a few lines."),
			}),
			execute: async ({ x, y, direction, amount }) => {
				const desktop = await getDesktop();
				await desktop.mouse.scroll(x, y, direction, amount);
				return { x, y };
			},
		}),

		keyboardType: tool({
			description:
				"Type text with the keyboard into whatever has focus. Newlines press Enter. For single keys or shortcuts, use keyboardPress.",
			inputSchema: z.object({ text: z.string() }),
			execute: async ({ text }) => {
				const desktop = await getDesktop();
				await desktop.keyboard.type(text);
				return { characters: text.length };
			},
		}),

		keyboardPress: tool({
			description:
				"Press a key, optionally with modifiers, e.g. key `enter`, or key `c` with modifiers [`ctrl`].",
			inputSchema: z.object({
				key: z
					.string()
					.describe(
						"A key name: a letter or digit, enter, escape, tab, backspace, delete, space, up, down, left, right, home, end, pageup, pagedown, or f1 to f24.",
					),
				modifiers: z.array(z.enum(["ctrl", "alt", "shift", "cmd"])).default([]),
			}),
			execute: async ({ key, modifiers }) => {
				const desktop = await getDesktop();
				await desktop.keyboard.press(key, modifiers);
				return { key, modifiers };
			},
		}),

		viewScreen: tool({
			description:
				"Take a screenshot to see the screen yourself, for example before clicking or to check what an action did. Your owner does not see it. When your owner asks to see the screen, use showScreen instead.",
			inputSchema: z.object({}),
			execute: async () => takeScreenshot(await getDesktop()),
			toModelOutput: ({ output }) => screenshotModelOutput(output),
		}),

		showScreen: tool({
			description:
				"Take a screenshot and show it to your owner in the chat. Use it when your owner asks what is on the screen or wants to see it. You see it too.",
			inputSchema: z.object({}),
			execute: async () => takeScreenshot(await getDesktop()),
			toModelOutput: ({ output }) => screenshotModelOutput(output),
		}),
	};
}

export type SandboxTools = ReturnType<typeof createSandboxTools>;

export type Screenshot = {
	// Base64 JPEG.
	image: string;
	width: number;
	height: number;
};

async function takeScreenshot(
	desktop: Sandbox["computerUse"],
): Promise<Screenshot> {
	const [shot, display] = await Promise.all([
		// Full resolution, so pixels in the image are the pixels to click.
		desktop.screenshot.takeCompressed({ format: "jpeg", quality: 70 }),
		desktop.display.getInfo(),
	]);
	if (!shot.screenshot) throw new Error("The screenshot came back empty.");

	const screen =
		display.displays?.find((d) => d.isActive) ?? display.displays?.[0];
	return {
		image: shot.screenshot,
		width: screen?.width ?? 0,
		height: screen?.height ?? 0,
	};
}

// The model sees the image itself, not a base64 string.
function screenshotModelOutput(output: Screenshot) {
	return {
		type: "content" as const,
		value: [
			{
				type: "text" as const,
				text: `Screenshot of the ${output.width}x${output.height} screen. Coordinates are pixels from the top-left corner.`,
			},
			{
				type: "file" as const,
				mediaType: "image/jpeg",
				data: { type: "data" as const, data: output.image },
			},
		],
	};
}

function truncate(text: string) {
	if (text.length <= MAX_OUTPUT) return text;
	// Keep the end: errors and final results are usually last.
	return `[…${text.length - MAX_OUTPUT} earlier characters cut]\n${text.slice(-MAX_OUTPUT)}`;
}
