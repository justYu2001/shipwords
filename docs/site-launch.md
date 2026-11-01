# Site launch handbook

From keyword to a live, paid site. Steps marked **(confirm)** create resources, cost money or affect production; an AI agent must get explicit confirmation before running them.

## 1. Domain (confirm)

1. Buy the domain on Cloudflare Registrar (or add an existing domain to Cloudflare and switch its nameservers).
2. Pick a support address such as `support@<domain>`. Every site needs a contact email and a DMCA page.

## 2. Create the site

1. `pnpm new-site <dir> --domain <domain>` copies `templates/ai-site` into `sites/<dir>`, renames the Worker, D1, R2 and Workflow, and sets the site URL and email domains.
2. Fill in `sites/<dir>/README.md`: target keyword and intent, competitors, and what makes this site different. If there is no difference yet, do not launch.
3. Test the upstream before setting prices: run a few real generations through [Yir](https://yir.ai/?utm_source=shipwords&utm_medium=docs), record cost, latency and quality, and set each model's `maxCost` with headroom.
4. Write `DESIGN.md`, then restyle `src/site/styles.css` and the pages to match. Rewrite the home page copy, titles and FAQ for the target keyword.
5. Choose models: names and prices in `site.models.ts`, upstream models and cost caps in `src/models.server.ts`; set products, signup bonus and guest quota in `site.config.ts`.
6. Replace the `TODO` placeholders in the policy texts under `messages/legal/`. `check-site` fails until they are gone.

## 3. Cloudflare resources (confirm)

```bash
cd sites/<dir>
pnpm wrangler d1 create <dir>                    # put database_id into wrangler.jsonc
pnpm wrangler r2 bucket create <dir>-outputs
pnpm wrangler email sending enable <domain>      # sign-in code emails; add the DNS records it asks for
pnpm db:migrate:remote
```

- Add a `routes` entry with `custom_domain` for the domain in `wrangler.jsonc`, and set `vars.EMAIL_FROM` to an address on the domain.
- Add an R2 lifecycle rule on `uploads/` (for example, delete after 2 days) that matches the retention promised in your privacy policy.
- Support inbox: enable Email Routing, forward `support@<domain>` to your inbox (verify the destination), and drop catch-all mail. Use this address on the policy pages and in the footer.
- Sites using the compose container (Cloudflare Containers) need the Workers Paid plan and Docker on the machine that deploys.
- Preview versions from `wrangler versions upload` share the production D1 and R2. Test data from previews lands in the production database.

## 4. Secrets (confirm)

Write each secret with `pnpm wrangler secret put <NAME>`; names are in `.dev.vars.example`.

- `BETTER_AUTH_SECRET`, `GUEST_COOKIE_SECRET`: 32 random bytes each, different for every site.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: a Google Cloud OAuth client. Redirect URI `https://<domain>/api/auth/callback/google`; add the domain as an authorized JavaScript origin (One Tap needs it). Also register `http://localhost:<dev port>` for local testing. A consent screen with only basic scopes and no logo can be published without verification.
- `RECAPTCHA_SITE_KEY` / `RECAPTCHA_PROJECT_ID` / `RECAPTCHA_API_KEY`: a score-based Google Cloud reCAPTCHA key restricted to the domain; restrict the API key to the reCAPTCHA Enterprise API.
- `YIR_API_KEY`: from [yir.ai](https://yir.ai/?utm_source=shipwords&utm_medium=docs). One key per site makes per-site cost easy to see.

## 5. Payments (confirm)

Each site picks one provider in `site.config.ts` under `billing.provider`: `creem` (the template default), `stripe` or `paypal`. Configure only that provider's secrets. Use a separate payment account per site where possible.

### Creem

- Creem is the merchant of record: it collects and remits sales tax and VAT and appears as the seller on receipts. Say so in the privacy and refund pages.
- In the Creem dashboard create one product per entry in `site.config.ts`, with the same price, currency and (for subscriptions) billing period, and put each product ID into `refs: { creem: 'prod_...' }`. Credits are granted from `site.config.ts`, so a dashboard price that differs is sold at the dashboard price. To change a price, create a new product and swap the ID.
- Create a webhook at `https://<domain>/api/webhooks/creem` (Developers → Webhooks) with these events:
  `checkout.completed`, `refund.created`, `dispute.created`.
  With subscription products, also add `subscription.paid`, `subscription.active`, `subscription.update`, `subscription.canceled`, `subscription.scheduled_cancel`, `subscription.past_due`, `subscription.paused`, `subscription.expired`, `subscription.unpaid`, `subscription.trialing`.
- Write `CREEM_API_KEY` and `CREEM_WEBHOOK_SECRET`. A `creem_test_…` key uses test mode; production needs the live key.
- "Manage subscription" opens Creem's customer portal. Creem has no receipt link API, so the account page shows no receipt link; Creem emails receipts.
- Chargebacks claw credits back once Creem marks the transaction charged back; Creem exposes no open or won dispute state (see [the live note](live/creem-billing.md)).

### Stripe

- Create a webhook endpoint at `https://<domain>/api/webhooks/stripe`. For credit packs only, listen to:
  `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
  `charge.refunded`, `charge.refund.updated`, `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`.
  With subscription products, also add `invoice.paid`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.
- With subscriptions, enable the Customer Portal (cancel subscription, update payment method, view invoices). For packs only, the account page links each order to its provider receipt (`/api/billing/receipt`).
- For automatic tax, enable Stripe Tax and set `billing.automaticTax: true` in `site.config.ts`.
- Write `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`.

### PayPal

- Set `billing: { provider: 'paypal' }` in `site.config.ts`.
- On developer.paypal.com, create a REST app (one Live, one Sandbox) with Subscriptions and Disputes enabled. Without Disputes access, payment reconciliation fails.
- Subscription products need a Product and Plan created first (price and interval matching `site.config.ts`); put the Plan ID into the product's `refs: { paypal: 'P-...' }`. To change a price, create a new Plan and swap the ID. Credit packs need nothing pre-created.
- Create a webhook at `https://<domain>/api/webhooks/paypal` with these events:
  `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.CAPTURE.REVERSED`,
  `PAYMENT.SALE.COMPLETED`, `PAYMENT.SALE.REFUNDED`, `PAYMENT.SALE.REVERSED`,
  `CUSTOMER.DISPUTE.CREATED`, `CUSTOMER.DISPUTE.UPDATED`, `CUSTOMER.DISPUTE.RESOLVED`,
  `BILLING.SUBSCRIPTION.ACTIVATED`, `BILLING.SUBSCRIPTION.UPDATED`, `BILLING.SUBSCRIPTION.RE-ACTIVATED`,
  `BILLING.SUBSCRIPTION.SUSPENDED`, `BILLING.SUBSCRIPTION.CANCELLED`, `BILLING.SUBSCRIPTION.EXPIRED`.
- Write `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` and `PAYPAL_WEBHOOK_ID` (the ID on the webhook detail page). Set `PAYPAL_ENV=sandbox` only for local and sandbox testing; leave it unset in production.
- PayPal has no merchant billing portal; "Manage subscription" sends buyers to the automatic payments page in their PayPal account.

## 6. Pre-launch checks

- `pnpm --filter "./sites/<dir>" check` passes (build, required routes, no template placeholders, no cross-site imports).
- Locally in Creem test mode (or Stripe test mode, PayPal sandbox), walk the whole flow: sign in, buy the cheapest pack, generate, receive the output, full and partial refunds claw back credits, a dispute claws back and a won dispute restores.
- `pnpm deploy:preview` and run the main flow once on the preview URL (remember previews share production data).
- Privacy, terms, refunds and DMCA pages exist and the footer shows the contact email. Review the refund terms yourself.
- `robots.txt`, `sitemap.xml` and `llms.txt` load; the home page title, description and canonical are correct.
- Icons: besides `favicon.svg`, add `favicon.ico` (16/32) and a 180x180 `apple-touch-icon.png`, declared in the head of `__root.tsx`. With only an SVG, link previews and many crawlers show a generic globe.
- Have someone (or a second AI reviewer) review the money paths of a site's first launch end to end.

## 7. Deploy (confirm)

```bash
cd sites/<dir>
pnpm run deploy        # "pnpm deploy" without "run" is a different, built-in pnpm command
```

Deploy only from main. Afterwards, check Workers Logs and the provider's webhook delivery log, and confirm the first real order granted its credits.

## 8. Search and analytics

- Run `node tools/check-crawl.mjs https://<domain> "a product fact visible in the page body"` from the engine root after deployment. From a parent repository use its `vendor/shipwords/tools/check-crawl.mjs` path. The read-only smoke check requests home, robots and sitemap with four UAs, checks HTTP status, canonical, indexing directives, SSR text and JSON-LD video dates, and exits nonzero on failures. It does not execute JavaScript. Supply stable product phrases to detect an empty client-only shell. Test fixtures run with `pnpm test:tools`.
- Review the printed robots groups manually (including crawler-specific groups); the smoke check is not a robots policy evaluator or a full XML validator. Check every sitemap URL separately. Inspect HTTPS/www redirects, public DNS via DoH when local DNS is proxied, and repeat from independent networks. A UA string does not impersonate a verified crawler's IP or prove global reachability.
- In GSC, inspect the home URL: record indexed status, last crawl, crawl success, declared and Google-selected canonical, then run a live test. Inspect Bing separately: its index can lag Google. Record the actual reporting dates and distinguish property-level impressions from page totals. Search-result absence alone does not prove exclusion.
- If a fetch fails, inspect Cloudflare AI Crawl Control, WAF, challenge settings, cache rules and failed request paths before changing anything. Errors on scanner paths are not evidence that public pages fail. Do not disable protections to compensate for an unexplained tool error.
- Keep `llms.txt` consistent with the public product, but do not treat it as an indexing or ranking requirement. Google [does not use llms.txt for Search visibility or ranking](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide). Fix concrete markup warnings using recorded publication dates, not invented timestamps, reviews or ratings.

- **Google Search Console:** add the domain property (DNS verification through Cloudflare is quickest) and submit `https://<domain>/sitemap.xml`.
- **Bing Webmaster Tools:** import from GSC or add the site, and submit the same sitemap.
- **IndexNow:** generate a key, put `<key>.txt` containing the key into `public/`, deploy, then submit new URLs to `https://api.indexnow.org/indexnow`. Bing and other IndexNow engines pick them up quickly.
- **GA4:** create a property and web stream, then set `analytics.ga4` in `site.config.ts`.
- **Rybbit:** create a site, set `analytics.rybbit.siteId` in `site.config.ts`, and set `vars.RYBBIT_UPSTREAM` in `wrangler.jsonc` to your Rybbit API URL. Tracking goes through the site's own `/stats/` path. Enable `firstPartyProxy` for the site in Rybbit; otherwise visitor IPs look like Cloudflare egress addresses, many visits are dropped as bots and countries are wrong.
- **Clarity (optional):** set `analytics.clarity`.
- Wire funnel events before launch, for example: upload, click generate, sign in, purchase, credits granted, output delivered, download.

## Tips

- Keep the user on the page: pricing and account as dialogs, Google One Tap for sign-in, and uploads kept in `sessionStorage` so they survive the checkout round trip.
- For pages likely to be cited by AI search, answer one sub-question per page (how-to, pricing, free options, templates), ideally with measured data. Launch with the home page plus a few such pages; add long-tail pages once Search Console shows the queries.
- When generation takes minutes, tell users they can close the page and will get an email, show "in progress" or "ready" on return visits, and keep history in the account page.
