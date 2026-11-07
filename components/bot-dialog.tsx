"use client";

import { useForm } from "@tanstack/react-form";
import { ShuffleIcon } from "lucide-react";
import { nanoid } from "nanoid";
import { useState } from "react";
import { createBot } from "@/actions/bot";
import { ChatAvatar } from "@/components/chat-avatar";
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
import { createBotSchema } from "@/db/schema";

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
	// The element that opens the dialog, e.g. a Button.
	trigger: React.ReactElement;
};

export function BotDialog({ trigger }: BotDialogProps) {
	const [open, setOpen] = useState(false);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger render={trigger} />
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>New bot</DialogTitle>
					<DialogDescription>
						Give it a face, a name, and a job to do.
					</DialogDescription>
				</DialogHeader>
				{/* Mounted only while open, so every open starts with a fresh form. */}
				<BotForm onCreated={() => setOpen(false)} />
			</DialogContent>
		</Dialog>
	);
}

function BotForm({ onCreated }: { onCreated: () => void }) {
	const form = useForm({
		defaultValues: {
			name: "",
			avatar: nanoid(),
			job: "",
			instructions: "",
		},
		validators: { onSubmit: createBotSchema },
		onSubmit: async ({ value }) => {
			try {
				const result = await createBot(value);
				if (!result.ok) {
					toast.add({
						type: "error",
						title: "Could not create bot",
						description: result.error,
					});
					return;
				}
				toast.add({
					type: "success",
					title: `${result.bot.name} is ready`,
				});
				onCreated();
			} catch {
				toast.add({
					type: "error",
					title: "Could not create bot",
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
							<DialogClose
								render={<Button type="button" variant="outline" />}
								disabled={pending}
							>
								Cancel
							</DialogClose>
							<Button type="submit" disabled={pending}>
								{pending && <Spinner data-icon="inline-start" />}
								Create bot
							</Button>
						</DialogFooter>
					</>
				)}
			</form.Subscribe>
		</form>
	);
}
