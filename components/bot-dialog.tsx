"use client";

import { useForm } from "@tanstack/react-form";
import { ShuffleIcon, Trash2Icon } from "lucide-react";
import { nanoid } from "nanoid";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createBot, deleteBot, updateBot } from "@/actions/bot";
import { ChatAvatar } from "@/components/chat-avatar";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemMedia,
	ItemTitle,
} from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import {
	createBotSchema,
	type EditableBot,
	updateBotSchema,
} from "@/db/schema";

const presets = [
	{
		name: "Researcher",
		job: "Research assistant",
		instructions: "Answer briefly, cite sources, and say when you are unsure.",
	},
	{
		name: "Reviewer",
		job: "Code reviewer",
		instructions:
			"Point out bugs first, then readability. Suggest concrete fixes with code.",
	},
	{
		name: "Editor",
		job: "Writing editor",
		instructions:
			"Tighten prose, keep my voice, and explain the bigger changes you make.",
	},
	{
		name: "Tutor",
		job: "Tutor",
		instructions:
			"Teach step by step, check my understanding, and don't just give answers.",
	},
] as const;

type BotDialogProps = {
	// Edits this bot instead of creating a new one.
	bot?: EditableBot;
} & (
	| {
			// The element that opens the dialog, e.g. a Button.
			trigger: React.ReactElement;
			open?: never;
			onOpenChange?: never;
	  }
	| {
			// Controlled from outside, e.g. opened by a dropdown menu item that
			// unmounts when the menu closes and so can't be the trigger itself.
			trigger?: never;
			open: boolean;
			onOpenChange: (open: boolean) => void;
	  }
);

export function BotDialog({
	bot,
	trigger,
	open: controlledOpen,
	onOpenChange,
}: BotDialogProps) {
	const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
	const open = controlledOpen ?? uncontrolledOpen;
	const setOpen = onOpenChange ?? setUncontrolledOpen;

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			{trigger && <DialogTrigger render={trigger} />}
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{bot ? `Edit ${bot.name}` : "New bot"}</DialogTitle>
					<DialogDescription>
						{bot
							? "Change its face, name, or job."
							: "Give it a face, a name, and a job to do."}
					</DialogDescription>
				</DialogHeader>
				{/* Mounted only while open, so every open starts with a fresh form. */}
				<BotForm bot={bot} onSaved={() => setOpen(false)} />
			</DialogContent>
		</Dialog>
	);
}

function BotForm({ bot, onSaved }: { bot?: EditableBot; onSaved: () => void }) {
	const errorTitle = bot ? "Could not save bot" : "Could not create bot";

	const form = useForm({
		defaultValues: {
			name: bot?.name ?? "",
			avatar: bot?.avatar ?? nanoid(),
			job: bot?.job ?? "",
			instructions: bot?.instructions ?? "",
		},
		validators: { onSubmit: bot ? updateBotSchema : createBotSchema },
		onSubmit: async ({ value }) => {
			try {
				const result = bot
					? await updateBot(bot.id, value)
					: await createBot(value);
				if (!result.ok) {
					toast.add({
						type: "error",
						title: errorTitle,
						description: result.error,
					});
					return;
				}
				toast.add({
					type: "success",
					title: bot
						? `${result.bot.name} is updated`
						: `${result.bot.name} is ready`,
				});
				onSaved();
			} catch {
				toast.add({
					type: "error",
					title: errorTitle,
					description: "Network error. Please try again.",
				});
			}
		},
	});

	return (
		<form
			noValidate
			className="flex flex-col gap-4"
			onSubmit={(e) => {
				e.preventDefault();
				form.handleSubmit();
			}}
		>
			<form.Subscribe selector={(state) => state.isSubmitting}>
				{(pending) => (
					<>
						{/* Presets would overwrite an existing bot, so only offer them on create. */}
						{!bot && (
							<div className="flex flex-wrap gap-2">
								{presets.map((preset) => (
									<Button
										key={preset.job}
										type="button"
										variant="outline"
										size="sm"
										className="rounded-full"
										disabled={pending}
										onClick={() => {
											form.setFieldValue("name", preset.name);
											form.setFieldValue("job", preset.job);
											form.setFieldValue("instructions", preset.instructions);
										}}
									>
										{preset.name}
									</Button>
								))}
							</div>
						)}

						<form.Field name="avatar">
							{(field) => (
								<Item className="px-0">
									<ItemMedia>
										<ChatAvatar seed={field.state.value} className="size-12" />
									</ItemMedia>
									<ItemContent>
										<ItemTitle>Face</ItemTitle>
										<ItemDescription>
											Shuffle until you find one you like.
										</ItemDescription>
									</ItemContent>
									<ItemActions>
										<Button
											type="button"
											variant="outline"
											size="sm"
											disabled={pending}
											onClick={() => field.handleChange(nanoid())}
										>
											<ShuffleIcon data-icon="inline-start" />
											Shuffle
										</Button>
									</ItemActions>
								</Item>
							)}
						</form.Field>

						<FieldGroup>
							<form.Field name="name">
								{(field) => {
									const isInvalid =
										field.state.meta.isTouched && !field.state.meta.isValid;
									return (
										<Field
											data-invalid={isInvalid}
											data-disabled={pending || undefined}
										>
											<FieldLabel htmlFor={field.name}>Name</FieldLabel>
											<Input
												id={field.name}
												name={field.name}
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												aria-invalid={isInvalid}
												autoComplete="off"
												placeholder="Ada"
												disabled={pending}
											/>
											{isInvalid && (
												<FieldError errors={field.state.meta.errors} />
											)}
										</Field>
									);
								}}
							</form.Field>

							<form.Field name="job">
								{(field) => {
									const isInvalid =
										field.state.meta.isTouched && !field.state.meta.isValid;
									return (
										<Field
											data-invalid={isInvalid}
											data-disabled={pending || undefined}
										>
											<FieldLabel htmlFor={field.name}>Job</FieldLabel>
											<Input
												id={field.name}
												name={field.name}
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												aria-invalid={isInvalid}
												autoComplete="off"
												placeholder="Research assistant"
												disabled={pending}
											/>
											{isInvalid && (
												<FieldError errors={field.state.meta.errors} />
											)}
										</Field>
									);
								}}
							</form.Field>

							<form.Field name="instructions">
								{(field) => {
									const isInvalid =
										field.state.meta.isTouched && !field.state.meta.isValid;
									return (
										<Field
											data-invalid={isInvalid}
											data-disabled={pending || undefined}
										>
											<FieldLabel htmlFor={field.name}>
												How it should work
											</FieldLabel>
											<Textarea
												id={field.name}
												name={field.name}
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												aria-invalid={isInvalid}
												placeholder="Answer briefly, cite sources, and ask before running anything destructive."
												className="min-h-24"
												disabled={pending}
											/>
											{isInvalid && (
												<FieldError errors={field.state.meta.errors} />
											)}
										</Field>
									);
								}}
							</form.Field>
						</FieldGroup>

						<DialogFooter>
							{bot && (
								<DeleteBotButton
									bot={bot}
									disabled={pending}
									onDeleted={onSaved}
								/>
							)}
							<DialogClose
								render={<Button type="button" variant="outline" />}
								disabled={pending}
							>
								Cancel
							</DialogClose>
							<Button type="submit" disabled={pending}>
								{pending && <Spinner data-icon="inline-start" />}
								{bot ? "Save changes" : "Create bot"}
							</Button>
						</DialogFooter>
					</>
				)}
			</form.Subscribe>
		</form>
	);
}

function DeleteBotButton({
	bot,
	disabled,
	onDeleted,
}: {
	bot: EditableBot;
	disabled: boolean;
	onDeleted: () => void;
}) {
	const router = useRouter();
	// Controlled so the confirmation stays open while the delete is pending.
	const [open, setOpen] = useState(false);
	const [pending, setPending] = useState(false);

	async function handleDelete() {
		setPending(true);
		try {
			const result = await deleteBot(bot.id);
			if (!result.ok) {
				toast.add({
					type: "error",
					title: "Could not delete bot",
					description: result.error,
				});
				return;
			}
			toast.add({ type: "success", title: `${result.bot.name} is deleted` });
			setOpen(false);
			onDeleted();
			// The current chat is gone. Leave it, then refresh so the sidebar
			// in the shared layout drops it too.
			router.replace("/");
			router.refresh();
		} catch {
			toast.add({
				type: "error",
				title: "Could not delete bot",
				description: "Network error. Please try again.",
			});
		} finally {
			setPending(false);
		}
	}

	return (
		<AlertDialog
			open={open}
			onOpenChange={(next) => {
				if (!pending) setOpen(next);
			}}
		>
			<AlertDialogTrigger
				render={
					<Button
						type="button"
						variant="destructive"
						// Sits apart from Cancel and Save on wide screens.
						className="sm:mr-auto"
					/>
				}
				disabled={disabled}
			>
				<Trash2Icon data-icon="inline-start" />
				Delete
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Delete {bot.name}?</AlertDialogTitle>
					<AlertDialogDescription>
						This deletes the bot and its direct chat. It can&apos;t be undone.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
					<AlertDialogAction
						type="button"
						variant="destructive"
						disabled={pending}
						onClick={handleDelete}
					>
						{pending && <Spinner data-icon="inline-start" />}
						Delete
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
