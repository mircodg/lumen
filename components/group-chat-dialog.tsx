"use client";

import { useForm } from "@tanstack/react-form";
import { useRouter } from "next/navigation";
import { createGroupChat } from "@/actions/chat";
import { ChatAvatar } from "@/components/chat-avatar";
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
import { createGroupChatSchema } from "@/db/schema";
import type { PickableBot } from "@/queries/bot";

// Controlled, because it's opened from a dropdown menu item that unmounts when
// the menu closes.
export function GroupChatDialog({
	bots,
	open,
	onOpenChange,
}: {
	bots: PickableBot[];
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>New group chat</DialogTitle>
					<DialogDescription>
						Name the group and pick which bots are in it.
					</DialogDescription>
				</DialogHeader>
				{/* Mounted only while open, so every open starts with a fresh form. */}
				<GroupChatForm bots={bots} onCreated={() => onOpenChange(false)} />
			</DialogContent>
		</Dialog>
	);
}

function GroupChatForm({
	bots,
	onCreated,
}: {
	bots: PickableBot[];
	onCreated: () => void;
}) {
	const router = useRouter();

	const form = useForm({
		defaultValues: { name: "", botIds: [] as string[] },
		validators: { onSubmit: createGroupChatSchema },
		onSubmit: async ({ value }) => {
			try {
				const result = await createGroupChat(value);
				if (!result.ok) {
					toast.add({
						type: "error",
						title: "Could not create group",
						description: result.error,
					});
					return;
				}
				toast.add({ type: "success", title: `${value.name.trim()} is ready` });
				onCreated();
				router.push(`/chats/${result.chatId}`);
			} catch {
				toast.add({
					type: "error",
					title: "Could not create group",
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
							<DialogClose
								render={<Button type="button" variant="outline" />}
								disabled={pending}
							>
								Cancel
							</DialogClose>
							<Button type="submit" disabled={pending}>
								{pending && <Spinner data-icon="inline-start" />}
								Create group
							</Button>
						</DialogFooter>
					</>
				)}
			</form.Subscribe>
		</form>
	);
}
