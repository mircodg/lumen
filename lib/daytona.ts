import { Daytona } from "@daytona/sdk";

// Reads DAYTONA_API_KEY and DAYTONA_API_URL from the environment.
const daytona = new Daytona();

// Creates the sandbox a bot works in. Labels tie it back to the bot in the
// Daytona dashboard.
export async function createBotSandbox(labels: {
	botId: string;
	userId: string;
}): Promise<string> {
	const sandbox = await daytona.create({
		labels: { app: "lumen", ...labels },
		// Minutes idle before Daytona stops it. A running sandbox bills
		// vCPU and RAM; a stopped one bills disk only.
		autoStopInterval: 5,
	});
	return sandbox.id;
}

export async function deleteBotSandbox(sandboxId: string): Promise<void> {
	const sandbox = await daytona.get(sandboxId);
	await daytona.delete(sandbox);
}
