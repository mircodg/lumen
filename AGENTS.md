<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:github-agent-rules -->

## Github rules

Never create branches, worktrees, or commits automatically. Only do so when the user explicitly asks for that specific action in the current request. Leave changes uncomitted in the working tree on the current branch and let the user decide when and how to commit

<!-- END:github-agent-rules -->

<!-- BEGIN:database-agent-rules -->

## Database rules

Apply schema changes only with `bun db:push` (`drizzle-kit push`). Never generate, write, or run migrations (no `drizzle-kit generate`, `drizzle-kit migrate`, or hand-written SQL migration files). The schema in `db/schema.ts` is the single source of truth.

This is a development project. There is no backward compatibility and the data is worthless. Prefer data loss: never backfill, migrate, or preserve existing rows, and never spend effort on keeping old data working. Every schema change means a clean state.

<!-- END:database-agent-rules -->

<!-- BEGIN:forms-agent-rules -->

## Form rules

Reference implementations: `components/bot-dialog.tsx` (dialog form + server action) and `components/auth/auth-form.tsx` (card form + auth client).

### Validation schemas

- Derive insert schemas from the Drizzle table with `drizzle-zod` (`createInsertSchema`) in `db/schema.ts`, next to the table. Never hand-write a zod object that duplicates table columns.
- Add field rules (trim, min, max, messages) through the `createInsertSchema` refine callbacks, e.g. `name: (s) => s.trim().min(1, "Give your bot a name.")`.
- Export a separate per-form schema (e.g. `createBotSchema`) that contains only the fields the user fills in. Never accept ids, owner ids (`userId`), or timestamps from the client.
- The form schema's input type must match the form's `defaultValues` exactly, or TanStack Form rejects it as a validator. Columns with `$defaultFn` come out optional and nullable columns come out nullable, so `.unwrap()` them with `.extend()` when the form always sends a value.
- Export the input type with `z.input<typeof schema>` and use it as the server action's parameter type.

### Server actions

- Put server actions in `actions/<entity>.ts` with `"use server"` at the top. These files may export only async functions, so schemas and types live in `db/schema.ts`.
- Every action: check the session with `auth.getSession()` from `@/lib/auth/server`, then validate again with the same schema via `safeParse` (never trust client validation), then set server-owned fields (`userId: session.user.id`).
- Return a discriminated result, `{ ok: true, ... } | { ok: false, error: string }`. Don't throw for expected failures. Format validation errors with `z.prettifyError`.
- Wrap DB writes in try/catch, log the real error with `console.error`, and return a user-safe message.
- Normalize empty optional strings to `null` before inserting.
- Call `refresh()` from `next/cache` after a mutation so the page shows the new data.

### Client forms (TanStack Form + zod)

- Use `useForm` from `@tanstack/react-form` with `validators: { onSubmit: schema }`. Pass the zod schema directly (Standard Schema), not a custom adapter.
- `<form noValidate onSubmit={(e) => { e.preventDefault(); form.handleSubmit(); }}>`.
- Call the server action from `onSubmit` and show results with `toast.add({ type: "success" | "error", title, description })` from `@/components/ui/toast`. Catch thrown errors and show a network error toast.
- Read pending state with `<form.Subscribe selector={(s) => s.isSubmitting}>` and disable every control and button while pending.
- Render each field with `<form.Field name="...">`. Compute `isInvalid = field.state.meta.isTouched && !field.state.meta.isValid` and render errors with `<FieldError errors={field.state.meta.errors} />`.
- Use programmatic updates (`form.setFieldValue`, `field.handleChange`) for presets, shuffles, and similar helper buttons. Give every non-submit button `type="button"`.

### Layout (shadcn)

- Compose forms with `FieldGroup` > `Field` > `FieldLabel` + control + `FieldError`. No raw `div`/`Label` stacks and no `space-y-*`.
- Validation state goes on both sides: `data-invalid={isInvalid}` on `Field`, `aria-invalid={isInvalid}` on the control. Disabled state: `data-disabled` on `Field`, `disabled` on the control.
- Link labels and controls with `htmlFor={field.name}` / `id={field.name}`, and set `autoComplete` deliberately.
- Submit buttons show `<Spinner data-icon="inline-start" />` while pending. Button has no loading prop.
- Use `Item` (`ItemMedia`, `ItemContent`, `ItemActions`) for a row with media, text, and an action, e.g. an avatar picker.

### Forms in dialogs

- Make the dialog controlled (`open` / `onOpenChange`) so the form can close it on success.
- Render the form as its own component inside `DialogContent`. It mounts only while the dialog is open, so each open starts with fresh defaults (including random values like `nanoid()`) without a manual `form.reset()`.
- Put actions in `DialogFooter` inside the `<form>`: Cancel as `<DialogClose render={<Button type="button" variant="outline" />}>`, then the submit `Button`.
- Accept the trigger as a `trigger: React.ReactElement` prop and render `<DialogTrigger render={trigger} />`, so server component pages can pass their own button without becoming client components.

<!-- END:forms-agent-rules -->

<!-- VERCEL BEST PRACTICES START -->
## Best practices for developing on Vercel

These defaults are optimized for AI coding agents (and humans) working on apps that deploy to Vercel.

- Treat Vercel Functions as stateless + ephemeral (no durable RAM/FS, no background daemons), use Blob or marketplace integrations for preserving state
- Edge Functions (standalone) are deprecated; prefer Vercel Functions
- Don't start new projects on Vercel KV/Postgres (both discontinued); use Marketplace Redis/Postgres instead
- Store secrets in Vercel Env Variables; not in git or `NEXT_PUBLIC_*`
- Provision Marketplace native integrations with `vercel integration add` (CI/agent-friendly)
- Sync env + project settings with `vercel env pull` / `vercel pull` when you need local/offline parity
- Use `waitUntil` for post-response work; avoid the deprecated Function `context` parameter
- Set Function regions near your primary data source; avoid cross-region DB/service roundtrips
- Tune Fluid Compute knobs (e.g., `maxDuration`, memory/CPU) for long I/O-heavy calls (LLMs, APIs)
- Use Runtime Cache for fast **regional** caching + tag invalidation (don't treat it as global KV)
- Use Cron Jobs for schedules; cron runs in UTC and triggers your production URL via HTTP GET
- Use Vercel Blob for uploads/media; Use Edge Config for small, globally-read config
- If a deployment URL returns a Vercel Deployment Protection 401/403, retry the same URL with `vercel curl <url>`; don't disable protection or manage bypass secrets manually
- Add OpenTelemetry via `@vercel/otel` on Node; don't expect OTEL support on the Edge runtime
- Enable Web Analytics + Speed Insights early
- Use AI Gateway for model routing, set AI_GATEWAY_API_KEY, using a model string (e.g. 'anthropic/claude-sonnet-4.6'), Gateway is already default in AI SDK
  needed. Always curl https://ai-gateway.vercel.sh/v1/models first; never trust model IDs from memory
- For durable agent loops or untrusted code: use Workflow (pause/resume/state) + Sandbox; use Vercel MCP for secure infra access
<!-- VERCEL BEST PRACTICES END -->

<!-- DICEBEAR BEST PRACTICES START -->
## DiceBear

Use DiceBear 10. Documentation: https://www.dicebear.com/llms.txt

There are seven native cores with identical output, not one library with
wrappers. Use the one matching this project's language. Do not reach for the
JavaScript core when the project is written in something else:

    JavaScript  @dicebear/core + @dicebear/styles
    PHP         dicebear/core + dicebear/styles
    Python      dicebear-core + dicebear-styles
    Rust        dicebear-core + dicebear-styles
    Go          github.com/dicebear/dicebear-go/v10 + github.com/dicebear/styles/v10
    Dart        dicebear_core + dicebear_styles
    C#          DiceBear.Core + DiceBear.Styles

Every style page carries a loading snippet for all seven, for example
https://www.dicebear.com/styles/lorelei/index.md

HTTP API: https://api.dicebear.com/10.x/<style>/svg?seed=<seed> The seed is a
query parameter, not a path segment. Options are query parameters too; array
values are separated by commas.

Options named after a component end in Variant: eyesVariant, not eyes. This
holds in all seven cores and in the HTTP API. Look up the options of a style at
https://api.dicebear.com/10.x/<style>/options.json

Write these forms, not the ones on the left. The left column is pre-10 and the
API does not reject it, so an outdated call runs and silently does the wrong
thing:

    avatars.dicebear.com/api/<style>/<seed>.svg  ->  api.dicebear.com/10.x/<style>/svg?seed=<seed>
    api.dicebear.com/9.x/<style>/svg             ->  api.dicebear.com/10.x/<style>/svg
    npm install @dicebear/collection             ->  npm install @dicebear/styles
    npm install @dicebear/lorelei                ->  npm install @dicebear/styles
    createAvatar(lorelei, { seed })              ->  new Avatar(new Style(definition), { seed })
    { eyes: ['variant01'] }                      ->  { eyesVariant: ['variant01'] }
    ?radius=50                                   ->  ?borderRadius=50

Only JavaScript and the HTTP API have a pre-10 form. The other six cores were
released in 2026 and never had one, so any older-looking PHP, Python, Rust, Go,
Dart or C# API attributed to DiceBear is invented rather than outdated.
<!-- DICEBEAR BEST PRACTICES END -->

<!-- TRIGGER.DEV SKILLS START -->
## Trigger.dev agent skills

This project has Trigger.dev agent skills installed in `.claude/skills/` and `.agents/skills/`. Before writing or changing Trigger.dev code (background tasks, scheduled tasks, realtime, or chat.agent AI agents), load the most relevant skill: `trigger-authoring-chat-agent`, `trigger-authoring-tasks`, `trigger-chat-agent-advanced`, `trigger-cost-savings`, `trigger-getting-started`, `trigger-realtime-and-frontend`.
<!-- TRIGGER.DEV SKILLS END -->
