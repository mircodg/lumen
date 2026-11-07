"use client";

import { useForm } from "@tanstack/react-form";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { authClient } from "@/lib/auth/client";

type Mode = "sign-in" | "sign-up";

const email = z.email("Enter a valid email address.");

const signInSchema = z.object({
	name: z.string(),
	email,
	password: z.string().min(1, "Enter your password."),
});

const signUpSchema = z.object({
	name: z.string().trim().min(1, "Enter your name."),
	email,
	password: z.string().min(8, "Password must be at least 8 characters."),
});

const copy = {
	"sign-in": {
		title: "Sign in",
		description: "Enter your email and password to continue.",
		submit: "Sign in",
		failed: "Sign in failed",
		altPrompt: "Don't have an account?",
		altLabel: "Sign up",
		altHref: "/sign-up",
	},
	"sign-up": {
		title: "Create an account",
		description: "Sign up with your email and a password.",
		submit: "Create account",
		failed: "Sign up failed",
		altPrompt: "Already have an account?",
		altLabel: "Sign in",
		altHref: "/sign-in",
	},
} as const;

export function AuthForm({ mode }: { mode: Mode }) {
	const router = useRouter();
	const text = copy[mode];

	function showError(description: string) {
		toast.add({ type: "error", title: text.failed, description });
	}

	const form = useForm({
		defaultValues: { name: "", email: "", password: "" },
		validators: {
			onSubmit: mode === "sign-up" ? signUpSchema : signInSchema,
		},
		onSubmit: async ({ value }) => {
			try {
				const { error } =
					mode === "sign-up"
						? await authClient.signUp.email({
								name: value.name.trim(),
								email: value.email,
								password: value.password,
							})
						: await authClient.signIn.email({
								email: value.email,
								password: value.password,
							});

				if (error) {
					showError(error.message ?? "Something went wrong. Please try again.");
					return;
				}

				router.replace("/");
				router.refresh();
			} catch {
				showError("Network error. Please try again.");
			}
		},
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle>{text.title}</CardTitle>
				<CardDescription>{text.description}</CardDescription>
			</CardHeader>
			<form
				noValidate
				onSubmit={(e) => {
					e.preventDefault();
					form.handleSubmit();
				}}
			>
				<form.Subscribe selector={(state) => state.isSubmitting}>
					{(pending) => (
						<>
							<CardContent>
								<FieldGroup>
									{mode === "sign-up" && (
										<form.Field name="name">
											{(field) => {
												const isInvalid =
													field.state.meta.isTouched &&
													!field.state.meta.isValid;
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
															autoComplete="name"
															disabled={pending}
														/>
														{isInvalid && (
															<FieldError errors={field.state.meta.errors} />
														)}
													</Field>
												);
											}}
										</form.Field>
									)}
									<form.Field name="email">
										{(field) => {
											const isInvalid =
												field.state.meta.isTouched && !field.state.meta.isValid;
											return (
												<Field
													data-invalid={isInvalid}
													data-disabled={pending || undefined}
												>
													<FieldLabel htmlFor={field.name}>Email</FieldLabel>
													<Input
														id={field.name}
														name={field.name}
														type="email"
														value={field.state.value}
														onBlur={field.handleBlur}
														onChange={(e) => field.handleChange(e.target.value)}
														aria-invalid={isInvalid}
														autoComplete="email"
														placeholder="you@example.com"
														disabled={pending}
													/>
													{isInvalid && (
														<FieldError errors={field.state.meta.errors} />
													)}
												</Field>
											);
										}}
									</form.Field>
									<form.Field name="password">
										{(field) => {
											const isInvalid =
												field.state.meta.isTouched && !field.state.meta.isValid;
											return (
												<Field
													data-invalid={isInvalid}
													data-disabled={pending || undefined}
												>
													<FieldLabel htmlFor={field.name}>Password</FieldLabel>
													<Input
														id={field.name}
														name={field.name}
														type="password"
														value={field.state.value}
														onBlur={field.handleBlur}
														onChange={(e) => field.handleChange(e.target.value)}
														aria-invalid={isInvalid}
														autoComplete={
															mode === "sign-up"
																? "new-password"
																: "current-password"
														}
														disabled={pending}
													/>
													{mode === "sign-up" && !isInvalid && (
														<FieldDescription>
															At least 8 characters.
														</FieldDescription>
													)}
													{isInvalid && (
														<FieldError errors={field.state.meta.errors} />
													)}
												</Field>
											);
										}}
									</form.Field>
								</FieldGroup>
							</CardContent>
							<CardFooter className="mt-6 flex flex-col gap-4">
								<Button type="submit" className="w-full" disabled={pending}>
									{pending && <Spinner data-icon="inline-start" />}
									{text.submit}
								</Button>
								<p className="text-sm text-muted-foreground">
									{text.altPrompt}{" "}
									<Link
										href={text.altHref}
										className="text-foreground underline underline-offset-4"
									>
										{text.altLabel}
									</Link>
								</p>
							</CardFooter>
						</>
					)}
				</form.Subscribe>
			</form>
		</Card>
	);
}
