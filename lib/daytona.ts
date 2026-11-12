import { Daytona, type Sandbox } from "@daytona/sdk";

// Reads DAYTONA_API_KEY and DAYTONA_API_URL from the environment. Created on
// first use: the constructor throws without a key, and importing this module
// (e.g. when Trigger.dev indexes tasks at build time) shouldn't need one.
let client: Daytona | undefined;
function daytona() {
	client ??= new Daytona();
	return client;
}

// Creates the sandbox a bot works in. Labels tie it back to the bot in the
// Daytona dashboard.
export async function createBotSandbox(labels: {
	botId: string;
	userId: string;
}): Promise<string> {
	const sandbox = await daytona().create({
		labels: { app: "lumen", ...labels },
		// Minutes idle before Daytona stops it. A running sandbox bills
		// vCPU and RAM; a stopped one bills disk only.
		autoStopInterval: 5,
	});
	return sandbox.id;
}

export async function deleteBotSandbox(sandboxId: string): Promise<void> {
	const sandbox = await daytona().get(sandboxId);
	await daytona().delete(sandbox);
}

// Returns the bot's sandbox ready for work. Idle sandboxes stop (and later
// archive) on their own, so wake it first. start() also restores an
// archived one, which takes longer.
export async function connectBotSandbox(sandboxId: string): Promise<Sandbox> {
	const sandbox = await daytona().get(sandboxId);
	if (sandbox.state !== "started") await sandbox.start();
	return sandbox;
}

// Starts the desktop (Xvfb, xfce4, VNC) that mouse, keyboard, and screenshot
// calls drive. It doesn't survive a sandbox stop, so check every time.
export async function ensureDesktop(sandbox: Sandbox): Promise<void> {
	// The display server, the desktop on it, and the VNC server and web client
	// that stream it. computerUse.start() starts all four together.
	const processes = await Promise.all(
		["xvfb", "xfce4", "x11vnc", "novnc"].map((name) =>
			sandbox.computerUse.getProcessStatus(name).catch(() => null),
		),
	);
	if (processes.every((process) => process?.running)) return;

	await sandbox.computerUse.start();
	// The window manager needs a moment before the first screenshot shows it.
	await new Promise((resolve) => setTimeout(resolve, 2000));
}

// noVNC's websockify bridge, served by the sandbox's default snapshot.
const NOVNC_PORT = 6080;

// A WebSocket URL for the sandbox's VNC server, for the app's own noVNC
// client. Daytona shows a warning page on browser page loads of preview
// URLs, but not on WebSocket connections, so connecting directly skips it.
// Signed, so the sandbox-wide preview token never reaches the browser. The
// token only gates connecting; an open connection outlives its expiry.
// Also returns the desktop's size, so the browser can lay out the preview
// before the first frame arrives. It's fixed when the sandbox is created.
export async function getDesktopConnection(sandbox: Sandbox): Promise<{
	url: string;
	width: number;
	height: number;
}> {
	await ensureDesktop(sandbox);
	const [preview, info] = await Promise.all([
		sandbox.getSignedPreviewUrl(NOVNC_PORT, 60 * 60),
		sandbox.computerUse.display.getInfo().catch(() => null),
	]);

	const url = new URL("/websockify", preview.url);
	url.protocol = url.protocol === "http:" ? "ws:" : "wss:";

	// Daytona's default resolution, if the display can't be read.
	const display = info?.displays?.[0];
	return {
		url: url.toString(),
		width: display?.width || 1024,
		height: display?.height || 768,
	};
}
