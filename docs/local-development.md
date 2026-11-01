# Local development

## First-time setup

1. Node 24 (see `.nvmrc`) and pnpm 10 (`corepack enable`). Keep the pnpm store on the same disk as the repo so hard links work.
2. `pnpm install`
3. Keep each site's local secrets outside the repo: `~/.config/shipwords/<site-dir>.dev.vars` (set `SHIPWORDS_SECRETS` to use another directory). Fill it from the site's `.dev.vars.example`, using test keys only (`creem_test_`, `sk_test_`, PayPal sandbox, a test reCAPTCHA key).
4. `pnpm setup:worktree`: copies the secrets into each site as `.dev.vars` and sets `APP_URL` to this worktree's dev port.

A [Yir API key](https://yir.ai/?utm_source=shipwords&utm_medium=docs) (`YIR_API_KEY`) is only needed for real generations; see the mock upstream below.

## Running a site

```bash
cd sites/<site>
pnpm db:generate        # after schema changes in packages or in this site
pnpm db:migrate:local   # apply to the local D1 (.wrangler/state, one per worktree)
pnpm dev                # the site's devPort from package.json; a worktree adds 1-9
```

- Sign-in code emails are not actually sent locally; the Cloudflare plugin prints the message and where it was saved in the terminal.
- Workflows, D1 and R2 are simulated locally. Inspect state at `http://localhost:<port>/cdn-cgi/local/explorer/api`.
- Generation uses the mock upstream by default (`UPSTREAM_MOCK=1` in `.dev.vars`, see `packages/jobs/src/mock.ts`): no Yir calls, no compose container, outputs replaced with reference assets (text-only image jobs get `public/mock-output.png`). Use it to test upload, charging, polling, delivery and refunds; set `UPSTREAM_MOCK=fail` to test refunds. The mock only activates when `APP_URL` is a local host or every payment credential is in test mode.
  - For real generations, remove `UPSTREAM_MOCK` and set `YIR_API_KEY`.
  - Sites that rely on reference assets need them in local R2 first: `pnpm wrangler r2 object put <bucket>/assets/... --local --file ...`.
  - The Vite plugin does not let process environment variables override `.dev.vars`; set switches in `.dev.vars`.
  - The compose container (ffmpeg on Cloudflare Containers) needs Docker on a Linux or macOS host. Test compose-based generation there or on a preview deployment.
- If `localhost` resolves to `::1` and is blocked in a sandbox, run `pnpm dev --host 127.0.0.1` and send `Origin: http://localhost:<port>` (Better Auth checks the origin).
- Google sign-in locally must use `localhost`, not `127.0.0.1`, and the origin and callback must be registered on your OAuth client.

## Creem webhooks locally

- In the Creem dashboard switch to test mode and copy a test API key (`creem_test_…`) into `CREEM_API_KEY`.
- Creem has no CLI forwarder; open a Cloudflare quick tunnel and allow its host, as in the PayPal section below.
- Add a test-mode webhook at `<tunnel URL>/api/webhooks/creem` with the events listed in the [launch handbook](site-launch.md), and put its signing secret into `CREEM_WEBHOOK_SECRET`. Quick tunnel URLs change on every run, so update the webhook each time.
- Without webhooks the return page still syncs the order once, so credit packs work; refunds and subscription renewals need the webhook.

## Stripe webhooks locally

From the site directory:

```bash
node ../../tools/stripe-listen.mjs
```

It starts `stripe listen` with the test key from `.dev.vars`, forwards events to `<APP_URL>/api/webhooks/stripe`, and writes the current `whsec_` signing secret back into `.dev.vars` (the dev server reloads). It refuses live keys. Requires the [Stripe CLI](https://docs.stripe.com/stripe-cli).

## PayPal sandbox

- On developer.paypal.com, switch to Sandbox and use a sandbox REST app. Put its Client ID and Secret into the site's `.dev.vars` with `PAYPAL_ENV=sandbox`.
- Under Testing Tools, Sandbox Accounts, use a personal (buyer) account to pay. The browser may autofill your real email on sandbox.paypal.com; switch to the sandbox buyer.
- Webhooks need a public URL. Use a temporary Cloudflare quick tunnel:

  ```bash
  : > /tmp/cf-empty.yml
  cloudflared tunnel --config /tmp/cf-empty.yml --protocol http2 --url http://127.0.0.1:<port>
  ```

  The empty `--config` matters if you have a named tunnel in `~/.cloudflared/config.yml`: without it, cloudflared may connect as that tunnel and send its production traffic to your dev server. If the log mentions `cred-file`, stop it.
- Allow the tunnel host in the dev server: `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=.trycloudflare.com pnpm dev --host 127.0.0.1`.
- In the sandbox app, set the webhook URL to `<tunnel URL>/api/webhooks/paypal` with the events listed in the [launch handbook](site-launch.md), and put the webhook ID into `PAYPAL_WEBHOOK_ID`. Quick tunnel URLs change on every run, so re-register each time.

## Worktrees

- After `git worktree add`, run `pnpm install && pnpm setup:worktree` inside it.
- Tools that copy ignored files into new worktrees (for example Claude Code's `.worktreeinclude`) can bring `.dev.vars` along; still run `pnpm setup:worktree` to fix the ports.
- Each worktree has its own local database in `.wrangler/state`; run `pnpm db:migrate:local` in a new worktree.
