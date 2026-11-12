"use client";

import type RFB from "@novnc/novnc";
import { MonitorIcon, MonitorOffIcon, RefreshCwIcon } from "lucide-react";
import {
	createContext,
	use,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { usePanelRef } from "react-resizable-panels";
import { openChatDesktop } from "@/actions/desktop";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { ResizableHandle, ResizablePanel } from "@/components/ui/resizable";
import { Spinner } from "@/components/ui/spinner";

type Connection = { url: string; width: number; height: number };

type Desktop =
	| { status: "idle" }
	| { status: "starting" }
	| ({ status: "connecting" } & Connection)
	| ({ status: "connected" } & Connection)
	| { status: "error"; error: string };

// Daytona's default resolution, for the placeholder before the real size is in.
const DEFAULT_ASPECT_RATIO = "1024 / 768";

type DesktopPanelContextValue = {
	panelRef: ReturnType<typeof usePanelRef>;
	setOpen: (open: boolean) => void;
	open: boolean;
	desktop: Desktop;
	load: () => void;
	fullscreen: boolean;
	setFullscreen: (fullscreen: boolean) => void;
	setPanelSlot: (element: HTMLElement | null) => void;
	setDialogSlot: (element: HTMLElement | null) => void;
};

const DesktopPanelContext = createContext<DesktopPanelContextValue | null>(
	null,
);

function useDesktopPanel() {
	const context = use(DesktopPanelContext);
	if (!context) {
		throw new Error(
			"useDesktopPanel must be used within DesktopPanelProvider.",
		);
	}
	return context;
}

// Shares the panel handle and the desktop session, so the toggle in the header
// can drive the panel beside it, and the panel and the fullscreen dialog show
// the same VNC connection. Lives in the page, so each chat gets its own.
export function DesktopPanelProvider({
	params,
	children,
}: {
	// The page's params, unawaited. The chat id is only needed once the panel
	// opens, so reading it then keeps it out of the prerendered shell.
	params: Promise<{ chatId: string }>;
	children: React.ReactNode;
}) {
	const panelRef = usePanelRef();
	const [open, setOpen] = useState(false);
	const [fullscreen, setFullscreen] = useState(false);
	const [desktop, setDesktop] = useState<Desktop>({ status: "idle" });
	const [panelSlot, setPanelSlot] = useState<HTMLElement | null>(null);
	const [dialogSlot, setDialogSlot] = useState<HTMLElement | null>(null);
	const rfbRef = useRef<RFB | null>(null);

	// The element noVNC draws into. Created outside React and moved between the
	// panel and the dialog, so the connection survives the move. (An iframe
	// would reload when moved.) Null on the server, where nothing renders it.
	const [screen] = useState(() => {
		if (typeof document === "undefined") return null;
		const element = document.createElement("div");
		element.style.width = "100%";
		element.style.height = "100%";
		return element;
	});

	const load = useCallback(() => {
		setDesktop({ status: "starting" });
		// A promise passed from a server component arrives as React's thenable,
		// whose then() doesn't return a new promise. Promise.resolve adopts it,
		// so the chain below works.
		Promise.resolve(params)
			.then(({ chatId }) => openChatDesktop(chatId))
			.then((result) =>
				setDesktop(
					result.ok
						? {
								status: "connecting",
								url: result.url,
								width: result.width,
								height: result.height,
							}
						: { status: "error", error: result.error },
				),
			)
			.catch(() =>
				setDesktop({
					status: "error",
					error: "Check your connection and try again.",
				}),
			);
	}, [params]);

	// Waking the sandbox bills it, so wait until the panel is first opened.
	// After that the session stays connected, even while the panel is closed.
	useEffect(() => {
		if (open && desktop.status === "idle") load();
	}, [open, desktop.status, load]);

	// One connection per URL. noVNC touches the DOM on import, so it's loaded
	// here, in the browser only. The URL carries over from connecting to
	// connected, so connecting doesn't tear down the session it just opened.
	const url =
		desktop.status === "connecting" || desktop.status === "connected"
			? desktop.url
			: null;
	useEffect(() => {
		if (!url || !screen) return;

		let rfb: RFB | null = null;
		let cancelled = false;

		import("@novnc/novnc").then(({ default: RFB }) => {
			if (cancelled) return;
			rfb = new RFB(screen, url);
			// Fit the remote screen to whichever slot shows it. The resolution is
			// fixed when the sandbox is created, so don't ask it to change.
			rfb.scaleViewport = true;
			rfb.resizeSession = false;
			rfb.background = "transparent";
			rfb.viewOnly = true;
			rfb.addEventListener("connect", () =>
				setDesktop((current) =>
					current.status === "connecting"
						? { ...current, status: "connected" }
						: current,
				),
			);
			rfb.addEventListener("disconnect", () => {
				rfbRef.current = null;
				if (cancelled) return;
				setFullscreen(false);
				setDesktop({
					status: "error",
					error: "Lost the connection to the desktop.",
				});
			});
			rfbRef.current = rfb;
		});

		return () => {
			cancelled = true;
			rfb?.disconnect();
			rfbRef.current = null;
		};
	}, [url, screen]);

	// Show the screen in the dialog while it's mounted, and in the panel
	// otherwise. The dialog's slot unmounts after its exit animation, so the
	// screen stays in the dialog until it has faded out.
	const slot = dialogSlot ?? panelSlot;
	useEffect(() => {
		if (screen && slot && screen.parentElement !== slot) {
			slot.appendChild(screen);
		}
	}, [screen, slot]);

	// Input only goes to the desktop in the dialog. In the panel, clicks open
	// the dialog instead.
	const connected = desktop.status === "connected";
	useEffect(() => {
		const rfb = rfbRef.current;
		if (!rfb || !connected) return;
		rfb.viewOnly = !fullscreen;
		if (fullscreen && dialogSlot) rfb.focus();
	}, [connected, fullscreen, dialogSlot]);

	return (
		<DesktopPanelContext
			value={{
				panelRef,
				open,
				setOpen,
				desktop,
				load,
				fullscreen,
				setFullscreen,
				setPanelSlot,
				setDialogSlot,
			}}
		>
			{children}
		</DesktopPanelContext>
	);
}

// The right-hand panel. Starts collapsed; dragging the handle past its minimum
// size opens it too, so the open state follows the panel rather than the button.
export function DesktopPanel({
	label,
}: {
	// Names whose screen this is. Passed from the page, which reads the chat.
	label: React.ReactNode;
}) {
	const {
		panelRef,
		setOpen,
		desktop,
		load,
		fullscreen,
		setFullscreen,
		setPanelSlot,
	} = useDesktopPanel();

	// The preview is as wide as the panel and as tall as the desktop's aspect
	// ratio allows, pinned to the top.
	const aspectRatio =
		"width" in desktop
			? `${desktop.width} / ${desktop.height}`
			: DEFAULT_ASPECT_RATIO;

	return (
		<>
			<ResizableHandle />
			<ResizablePanel
				panelRef={panelRef}
				collapsible
				defaultSize="0%"
				minSize="30%"
				onResize={(size) => setOpen(size.asPercentage > 0)}
				// The library makes panels scroll containers; nothing here scrolls.
				style={{ overflow: "hidden" }}
			>
				<Dialog
					open={fullscreen}
					// Outside presses don't close it.
					disablePointerDismissal
					onOpenChange={(next, details) => {
						// Only the close button closes it, so Escape or a stray click
						// can't throw someone out of the desktop mid-task.
						if (!next && details.reason !== "close-press") return;
						setFullscreen(next);
					}}
				>
					{/* Same height as the chat header, so the two line up. */}
					<div className="flex h-12 shrink-0 items-center justify-end px-4">
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							aria-label="Reconnect"
							// Starting over mid-start would only race the first attempt.
							disabled={
								desktop.status === "idle" || desktop.status === "starting"
							}
							onClick={load}
						>
							<RefreshCwIcon />
						</Button>
					</div>
					<figure className="flex flex-col gap-3 px-4 pt-4">
						<div className="rounded-xl border bg-muted p-1.5">
							<div
								className="relative w-full overflow-hidden rounded-md"
								style={{ aspectRatio }}
							>
								{/* The screen is appended here, outside React's children. */}
								<div ref={setPanelSlot} className="size-full" />
								<DesktopOverlay trigger />
							</div>
						</div>
						<figcaption className="text-center text-sm text-muted-foreground">
							{label}
						</figcaption>
					</figure>
					<DesktopDialog />
				</Dialog>
			</ResizablePanel>
		</>
	);
}

// Covers the screen while it starts, connects, or has failed. Once connected,
// the panel's copy becomes the trigger that opens the dialog.
function DesktopOverlay({ trigger = false }: { trigger?: boolean }) {
	const { desktop, load } = useDesktopPanel();

	if (desktop.status === "connected") {
		if (!trigger) return null;
		return (
			<DialogTrigger
				render={
					<button
						type="button"
						aria-label="Open desktop fullscreen"
						className="absolute inset-0 cursor-zoom-in outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
					/>
				}
			/>
		);
	}

	if (desktop.status === "error") {
		return (
			<Empty className="absolute inset-0 bg-muted p-4">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<MonitorOffIcon />
					</EmptyMedia>
					<EmptyTitle>Desktop unavailable</EmptyTitle>
					<EmptyDescription>{desktop.error}</EmptyDescription>
				</EmptyHeader>
				<EmptyContent>
					<Button type="button" variant="outline" size="sm" onClick={load}>
						Try again
					</Button>
				</EmptyContent>
			</Empty>
		);
	}

	return (
		<Empty className="absolute inset-0 bg-muted p-4">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<Spinner />
				</EmptyMedia>
				<EmptyTitle>
					{desktop.status === "connecting"
						? "Connecting to the desktop"
						: "Starting the desktop"}
				</EmptyTitle>
				<EmptyDescription>
					This takes longer if the sandbox was asleep.
				</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}

// Fullscreen view. The shared screen is moved into its body while it's open.
function DesktopDialog() {
	const { setDialogSlot } = useDesktopPanel();

	return (
		<DialogContent
			// The screen takes focus itself once it's moved in.
			initialFocus={false}
			className="flex h-[calc(100svh-2rem)] flex-col gap-0 p-0 sm:max-w-[calc(100%-2rem)]"
		>
			<DialogHeader className="p-4">
				<DialogTitle>Desktop</DialogTitle>
			</DialogHeader>
			<div className="relative min-h-0 flex-1 overflow-hidden rounded-b-xl">
				<div ref={setDialogSlot} className="size-full" />
				<DesktopOverlay />
			</div>
		</DialogContent>
	);
}

export function DesktopPanelToggle() {
	const { panelRef, open } = useDesktopPanel();

	return (
		<Button
			type="button"
			variant="ghost"
			size="icon-sm"
			aria-label="Desktop"
			aria-pressed={open}
			className="ml-auto"
			onClick={() => {
				const panel = panelRef.current;
				if (!panel) return;
				if (panel.isCollapsed()) panel.expand();
				else panel.collapse();
			}}
		>
			<MonitorIcon />
		</Button>
	);
}
