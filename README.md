<div align="center">

<a href="https://shipwords.dev/"><img src="apps/www/public/img/og.jpg" alt="shipwords: One keyword. One site." width="100%"></a>

**An open-source framework for new-keyword site fleets: a new site in an afternoon, taking payments the day it launches.**

[![CI](https://github.com/shipwords-dev/shipwords/actions/workflows/ci.yml/badge.svg)](https://github.com/shipwords-dev/shipwords/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![TanStack Start](https://img.shields.io/badge/TanStack-Start-FF4154?logo=reactquery&logoColor=white)](https://tanstack.com/start)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![GitHub stars](https://img.shields.io/github/stars/shipwords-dev/shipwords?style=flat&logo=github)](https://github.com/shipwords-dev/shipwords/stargazers)

**English** · [中文](README.zh-CN.md)

</div>

shipwords is a free, MIT-licensed framework for running a fleet of new-keyword AI image and video sites on Cloudflare, one site per keyword. What stays the same is shared: accounts, payments, credits and AI generation are written once. What changes is each site's own: pages, look and domain. Website: [shipwords.dev](https://shipwords.dev/).

## Why shipwords

**Built for a fleet of new-keyword sites.** Put up a site for every new keyword, keep improving the ones that take off, and leave the rest alone. Fix a bug in the shared core once, and every site can take the update on its next deploy. Each site deploys on its own, with its own database, storage and payment account, so launching or retiring one never touches the others.

**Proven AI, built in.** [tinydeskai.io](https://tinydeskai.io/) is built on shipwords, and its full source is in [`sites/tinydeskai-example`](sites/tinydeskai-example), ready to fork.

- **Video templates**: turn a viral clip into a template; visitors upload photos and get the same video back. That's how Tiny Desk AI works.
- **Face swap that holds up**: the whole clip in one pass. Each uploaded photo replaces a performer, face, hair and clothes, with mouths still on the beat. If an original face is still there, the job fails and the credits come back.
- **The popular models, built in**: GPT Image, Nano Banana, Seedream, FLUX, Seedance, Veo, Kling, Wan and more, behind one Yir API key, paid per generation.

**Takes money out of the box.** Every site comes with:

- Google and email sign-in, account page
- Creem (merchant of record), Stripe or PayPal; credit packs and subscriptions, orders and refunds
- Email notifications
- Free guest tries with abuse limits (reCAPTCHA v3)
- Privacy, terms, refund and DMCA pages
- SEO, `sitemap.xml`, `robots.txt`, `llms.txt`, analytics

The money code is shared and tested: double charges, repeated or out-of-order payment events and refunds for failed jobs are all covered.

## Build a site with your coding agent

No keyword yet? [new-term-radar](https://github.com/zhuyansen/new-term-radar), a separate open-source project, catches new AI terms on X, Hugging Face, GitHub and sitemaps every day, before keyword tools list them.

Paste this into Claude Code, Codex or Cursor, with your own keyword:

```text
Read shipwords.dev/llms.txt and build a site for "<your keyword>"
```

The agent clones the repo, creates the site and runs it locally. The rules it follows are in [AGENTS.md](AGENTS.md).

## Quick start

Requirements: Node 24 (see `.nvmrc`), pnpm 10 (`corepack enable`), and Git Bash or WSL on Windows. To go live you will also need a Cloudflare account and a Creem account (or Stripe or PayPal).

1. Fork or clone this repo, then install:

   ```bash
   pnpm install
   ```

2. Create your first site from the template, then install again so the new site gets its dependencies:

   ```bash
   pnpm new-site my-tool --domain my-tool.com
   pnpm install
   ```

3. Put local secrets outside the repo and link them in:

   ```bash
   mkdir -p ~/.config/shipwords
   cp sites/my-tool/.dev.vars.example ~/.config/shipwords/my-tool.dev.vars   # fill in test keys
   pnpm setup:worktree
   ```

   The example file runs as-is: email sign-in works (the code is printed in the dev server's terminal), new accounts get sign-up credits, and generations use the mock upstream (`UPSTREAM_MOCK=1`), so no model key is needed. Fill in more as you need it:
   - **Real generations**: a [Yir API key](https://yir.ai/?utm_source=shipwords&utm_medium=readme), with `UPSTREAM_MOCK` turned off.
   - **Buying credits**: a Creem test key (`creem_test_…`) and test products in `refs.creem`; webhooks need a tunnel, see [local development](docs/local-development.md).
   - **Guest free tries**: reCAPTCHA keys. Without them, visitors sign in before their first generation.
   - **Google sign-in**: a Google OAuth client with `http://localhost:<port>` as an origin. Optional; email sign-in works without it.

4. Run it:

   ```bash
   cd sites/my-tool
   pnpm db:generate && pnpm db:migrate:local
   pnpm dev
   ```

When you are ready to go live, follow [docs/site-launch.md](docs/site-launch.md).

## What it costs

The code is free under MIT, including commercial use. What you pay for:

- Domains (Cloudflare Registrar sells them at cost).
- Cloudflare usage. Sites that stitch video clips together use Cloudflare Containers and need the Workers Paid plan.
- Payment provider fees on each order (Creem, Stripe or PayPal).
- Model calls on Yir, billed per request. Each job's maximum cost is set in `src/models.server.ts`.

## Repository layout

| Directory                  | What it holds                                                                                                                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core`            | D1 + Drizzle, credit ledger with idempotent writes, Creem, Stripe and PayPal billing (packs, subscriptions, refunds, disputes), Better Auth, guest quota + reCAPTCHA v3, SEO/GEO helpers, analytics proxy, headless React hooks |
| `packages/jobs`            | Workflow-based generation runtime with a one-way job state machine and automatic refunds, upstream adapter interface, Yir adapter (`@yir-ai/sdk`), mock upstream for local dev, optional ffmpeg compose container               |
| `templates/ai-site`        | A complete, working AI image site copied by `pnpm new-site`: home, pricing, account, login, policy pages, `sitemap.xml`, `robots.txt`, `llms.txt`                                                                               |
| `sites/<site>`             | Your sites, one per keyword, each deployed on its own                                                                                                                                                                           |
| `sites/tinydeskai-example` | The full source of tinydeskai.io (video effect: photo slots, one-pass video edit, output check, ffmpeg compose, content pages)                                                                                                  |
| `apps/<sidecar>`           | Optional small Workers that belong to no single site                                                                                                                                                                            |
| `tools/`                   | `new-site` scaffolder, `check-site` launch checks, `list-sites`, worktree setup, dev-port, Stripe webhook forwarding (Node built-ins only, with tests)                                                                          |
| `docs/`                    | Architecture, local development, launch handbook                                                                                                                                                                                |

Each site is a TanStack Start + React 19 app on its own Cloudflare Worker, with D1, R2 and Workflows.

## Common commands

```bash
pnpm new-site <dir> --domain <domain>   # scaffold sites/<dir> from the template
pnpm list-sites                         # site list generated from each site's code and README
pnpm setup:worktree                     # copy local secrets into a new worktree, fix dev ports
pnpm --filter "./sites/<site>" dev
pnpm --filter "./sites/<site>" check    # typecheck + build + launch checks
pnpm check:packages                     # core + jobs: typecheck + tests
pnpm check:template
pnpm lint && pnpm test:tools
```

## Docs

- [Architecture and design choices](docs/architecture.md)
- [Local development](docs/local-development.md)
- [Site launch handbook](docs/site-launch.md)
- [Rules for AI coding agents](AGENTS.md)
- [Contributing](CONTRIBUTING.md) and [security policy](SECURITY.md)

## Community

Questions, ideas and sites you shipped go in [GitHub Discussions](https://github.com/shipwords-dev/shipwords/discussions): [Q&A](https://github.com/shipwords-dev/shipwords/discussions/categories/q-a), [Show and tell](https://github.com/shipwords-dev/shipwords/discussions/categories/show-and-tell), [Ideas](https://github.com/shipwords-dev/shipwords/discussions/categories/ideas). Bugs go in [Issues](https://github.com/shipwords-dev/shipwords/issues).

## License

[MIT](LICENSE)
