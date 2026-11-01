# Creem billing provider

Adds a third `PaymentProvider`, Creem (merchant of record), and switches the template and the example site to it. The Stripe and PayPal adapters stay in `packages/core` but no site uses them.

## Public interface changes

- `SiteConfig.billing` gains `{ provider: 'creem' }`. Creem is the merchant of record and handles tax, so there is no `automaticTax`.
- With `provider: 'creem'` every product needs `refs.creem`: the Creem product ID (`prod_…`). Creem has no inline prices; the product's price and currency in the Creem dashboard must match `site.config.ts`. `defineSite` rejects a missing or duplicate `refs.creem`.
- `CoreEnv` gains `CREEM_API_KEY` and `CREEM_WEBHOOK_SECRET`. A key starting `creem_test_` uses `https://test-api.creem.io`; any other key uses live.
- Webhook route: `/api/webhooks/creem`.

## Mapping

- `customerRef`: a Creem customer created with `external_id = <site id>:<user id>`; checkout passes it as `customer.id`, and the portal uses it.
- `paymentRef` and `chargeRef`: the Creem transaction (`tran_…`). One-time and subscription periods alike.
- Our `userId`, `productId` and `orderId` go into checkout `metadata`; `request_id` is the order ID. Only our API key can create checkouts, so metadata is trusted.
- Refunds and chargebacks are read back from `GET /v1/transactions` (`refunded_amount`, `status`), never from the webhook body.
- Webhook → object to fetch:
  - `checkout.completed` → the checkout;
  - `subscription.paid` → that period's transaction;
  - other `subscription.*` → the subscription;
  - `refund.created` / `dispute.created` → the transaction when the payment belongs to a subscription, else the checkout (one-time transactions carry no metadata, the checkout does).
- Subscription transactions and subscriptions:
  - User: from subscription `metadata`, falling back to the customer's `external_id` (only if it carries this site's ID).
  - Product: always the Creem product currently billed, mapped through `refs.creem`. A plan change in the portal keeps the old metadata, so metadata never names the product.

## Known gaps

- Disputes: Creem exposes no dispute object or status, only the transaction moving to `chargedBack`. A chargeback claws credits back in full (`lost`); there is no "open" or "won" state, so credits are clawed back only once Creem marks the transaction.
- Creem may deliver Standard Webhooks headers (`webhook-id`/`webhook-timestamp`/`webhook-signature`) or the legacy `creem-signature`; both are verified.
- Local webhooks: Creem has no CLI forwarder; use a tunnel (e.g. `cloudflared tunnel --url http://localhost:5173`) and point a test-mode webhook at it.
