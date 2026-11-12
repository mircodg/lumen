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
	// The display server and the desktop on it; screenshots need both.
	const processes = await Promise.all(
		["xvfb", "xfce4"].map((name) =>
			sandbox.computerUse.getProcessStatus(name).catch(() => null),
		),
	);
	if (processes.every((process) => process?.running)) return;

	await sandbox.computerUse.start();
	// The window manager needs a moment before the first screenshot shows it.
	await new Promise((resolve) => setTimeout(resolve, 2000));
}
