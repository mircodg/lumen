"use client";

import { useForm } from "@tanstack/react-form";
import { Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
	createGroupChat,
	deleteGroupChat,
	updateGroupChat,
} from "@/actions/chat";
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
import { Checkbox } from "@/components/ui/checkbox";
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
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
	FieldLegend,
	FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import {
	createGroupChatSchema,
	type EditableGroupChat,
	updateGroupChatSchema,
} from "@/db/schema";
import type { PickableBot } from "@/queries/bot";

type GroupChatDialogProps = {
	// The bots a group can be made from.
	bots: PickableBot[];
	// Edits this group instead of creating a new one.
	chat?: EditableGroupChat;
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

export function GroupChatDialog({
	bots,
	chat,
	trigger,
	open: controlledOpen,
	onOpenChange,
}: GroupChatDialogProps) {
	const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
	const open = controlledOpen ?? uncontrolledOpen;
	const setOpen = onOpenChange ?? setUncontrolledOpen;

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			{trigger && <DialogTrigger render={trigger} />}
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>
						{chat ? `Edit ${chat.name}` : "New group chat"}
					</DialogTitle>
					<DialogDescription>
						{chat
							? "Rename the group or change which bots are in it."
							: "Name the group and pick which bots are in it."}
					</DialogDescription>
				</DialogHeader>
				{/* Mounted only while open, so every open starts with a fresh form. */}
				<GroupChatForm bots={bots} chat={chat} onSaved={() => setOpen(false)} />
			</DialogContent>
		</Dialog>
	);
}

function GroupChatForm({
	bots,
	chat,
	onSaved,
}: {
	bots: PickableBot[];
	chat?: EditableGroupChat;
	onSaved: () => void;
}) {
	const router = useRouter();
	const errorTitle = chat ? "Could not save group" : "Could not create group";

	const form = useForm({
		defaultValues: {
			name: chat?.name ?? "",
			botIds: chat?.botIds ?? ([] as string[]),
		},
		validators: {
			onSubmit: chat ? updateGroupChatSchema : createGroupChatSchema,
		},
		onSubmit: async ({ value }) => {
			try {
				if (chat) {
					const result = await updateGroupChat(chat.id, value);
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
						title: `${result.chat.name} is updated`,
					});
					onSaved();
					return;
				}

				const result = await createGroupChat(value);
				if (!result.ok) {
					toast.add({
						type: "error",
						title: errorTitle,
						description: result.error,
					});
					return;
				}
				toast.add({ type: "success", title: `${value.name.trim()} is ready` });
				onSaved();
				router.push(`/chats/${result.chatId}`);
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
												placeholder="Weekend plans"
												disabled={pending}
											/>
											{isInvalid && (
												<FieldError errors={field.state.meta.errors} />
											)}
										</Field>
									);
								}}
							</form.Field>

							<form.Field name="botIds">
								{(field) => {
									const isInvalid =
										field.state.meta.isTouched && !field.state.meta.isValid;
									return (
										<FieldSet>
											<FieldLegend variant="label">Bots</FieldLegend>
											{bots.length < 2 && (
												<FieldDescription>
													A group needs at least two bots. Create another bot
													first.
												</FieldDescription>
											)}
											<FieldGroup data-slot="checkbox-group">
												{bots.map((bot) => {
													const id = `bot-${bot.id}`;
													const checked = field.state.value.includes(bot.id);
													return (
														<Field
															key={bot.id}
															orientation="horizontal"
															data-invalid={isInvalid}
															data-disabled={pending || undefined}
														>
															<Checkbox
																id={id}
																checked={checked}
																onCheckedChange={(next) =>
																	// Kept in pick order, which becomes the
																	// members' order.
																	field.handleChange(
																		next
																			? [...field.state.value, bot.id]
																			: field.state.value.filter(
																					(botId) => botId !== bot.id,
																				),
																	)
																}
																aria-invalid={isInvalid}
																disabled={pending}
															/>
															<FieldLabel htmlFor={id} className="font-normal">
																<ChatAvatar
																	seed={bot.avatar}
																	className="size-6"
																/>
																{bot.name}
															</FieldLabel>
														</Field>
													);
												})}
											</FieldGroup>
											{isInvalid && (
												<FieldError errors={field.state.meta.errors} />
											)}
										</FieldSet>
									);
								}}
							</form.Field>
						</FieldGroup>

						<DialogFooter>
							{chat && (
								<DeleteGroupChatButton
									chat={chat}
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
								{chat ? "Save changes" : "Create group"}
							</Button>
						</DialogFooter>
					</>
				)}
			</form.Subscribe>
		</form>
	);
}

function DeleteGroupChatButton({
	chat,
	disabled,
	onDeleted,
}: {
	chat: EditableGroupChat;
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
			const result = await deleteGroupChat(chat.id);
			if (!result.ok) {
				toast.add({
					type: "error",
					title: "Could not delete group",
					description: result.error,
				});
				return;
			}
			toast.add({ type: "success", title: `${result.chat.name} is deleted` });
			setOpen(false);
			onDeleted();
			// The current chat is gone. Leave it, then refresh so the sidebar
			// in the shared layout drops it too.
			router.replace("/");
			router.refresh();
		} catch {
			toast.add({
				type: "error",
				title: "Could not delete group",
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
					<AlertDialogTitle>Delete {chat.name}?</AlertDialogTitle>
					<AlertDialogDescription>
						This deletes the group chat and its messages. Its bots stay. It
						can&apos;t be undone.
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
