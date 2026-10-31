import type { Product } from '../site';
import type {
  CheckoutFact,
  CheckoutRequest,
  PaymentFact,
  PaymentProvider,
  SubscriptionFact,
  WebhookTarget,
  WebhookTrigger,
} from './provider';
import { WebhookSignatureError } from './provider';

// Creem adapter (merchant of record, REST API, no SDK). Conventions:
// - Products are pre-created in the Creem dashboard; the product ID lives in the product's refs.creem, and its price must match site.config.ts;
// - Our userId, productId and orderId go into checkout metadata (Creem copies it onto the subscription); request_id is the order ID;
// - paymentRef and chargeRef are both the Creem transaction, for one-time payments and every subscription period;
// - A one-time transaction carries no metadata, so one-time payments are always read through their checkout;
// - Each Creem customer is created with external_id `<site id>:<user id>`, the fallback owner when a subscription lacks our metadata.

export interface CreemOptions {
  apiKey: string;
  webhookSecret: string;
  siteId: string;
  products: readonly Product[];
}

const PROVIDER = 'creem';
const LIVE_API = 'https://api.creem.io';
const TEST_API = 'https://test-api.creem.io';
/** Standard Webhooks timestamp tolerance, matching Creem's SDK. */
const SIGNATURE_TOLERANCE_SECONDS = 300;

export class CreemApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'CreemApiError';
  }
}

export interface CreemTransaction {
  id: string;
  amount: number;
  amount_paid?: number | null;
  currency: string;
  status: string;
  refunded_amount?: number | null;
  order?: string | null;
  subscription?: string | null;
  customer?: string | null;
  period_start?: number;
  period_end?: number;
  created_at: number;
}

export interface CreemCustomer {
  id: string;
  email?: string;
  external_id?: string | null;
}

export interface CreemSubscription {
  id: string;
  product: string | { id: string };
  customer: string | CreemCustomer;
  status: string;
  last_transaction_id?: string;
  current_period_start_date?: string;
  current_period_end_date?: string;
  metadata?: Record<string, unknown> | null;
}

export interface CreemCheckout {
  id: string;
  status: string;
  request_id?: string;
  product: string | { id: string };
  order?: { id: string; transaction?: string | null } | null;
  subscription?: string | { id: string } | null;
  checkout_url?: string;
  metadata?: Record<string, unknown> | null;
}

interface OurMetadata {
  userId: string | null;
  productId: string | null;
  orderId: string | null;
}

const str = (value: unknown) => (typeof value === 'string' && value ? value : null);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const idOf = (value: unknown) => str(value) ?? (isRecord(value) ? str(value.id) : null);
const time = (value: string | null | undefined) => {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(parsed) ? null : parsed;
};
/** Creem spells statuses in camelCase, snake_case and plain words across endpoints and samples ("chargedBack", "chargeback"). */
const normalize = (status: string) => status.toLowerCase().replace(/[_\- ]/g, '');

export function readMetadata(metadata: unknown): OurMetadata {
  const meta = isRecord(metadata) ? metadata : {};
  return { userId: str(meta.userId), productId: str(meta.productId), orderId: str(meta.orderId) };
}

const PAID_STATUSES = new Set(['paid', 'refunded', 'partialrefund', 'chargedback', 'chargeback']);
const CHARGEBACK_STATUSES = new Set(['chargedback', 'chargeback']);

/** Creem has no dispute object: a transaction marked charged back is a lost dispute, anything else is no dispute. */
export function mapDispute(status: string): PaymentFact['dispute'] {
  return CHARGEBACK_STATUSES.has(normalize(status)) ? 'lost' : null;
}

export function paymentFactFromTransaction(transaction: CreemTransaction, owner: OurMetadata): PaymentFact {
  // Creem amounts and transaction timestamps are already in minor units and milliseconds.
  return {
    provider: PROVIDER,
    paymentRef: transaction.id,
    chargeRef: transaction.id,
    paid: PAID_STATUSES.has(normalize(transaction.status)),
    amount: transaction.amount_paid ?? transaction.amount,
    currency: transaction.currency.toLowerCase(),
    amountRefunded: transaction.refunded_amount ?? 0,
    dispute: mapDispute(transaction.status),
    metadataTrusted: true,
    ...owner,
    subscriptionRef: transaction.subscription ?? null,
    periodStart: transaction.subscription ? (transaction.period_start ?? null) : null,
    periodEnd: transaction.subscription ? (transaction.period_end ?? null) : null,
    paidAt: transaction.created_at,
    fetchedAt: Date.now(),
  };
}

export function subscriptionFact(
  subscription: CreemSubscription,
  owner: OurMetadata,
  fetchedAt: number,
): SubscriptionFact {
  // scheduled_cancel is still paid up until the period ends: report it as active with cancelAtPeriodEnd, like the other providers.
  const scheduled = normalize(subscription.status) === 'scheduledcancel';
  return {
    provider: PROVIDER,
    subscriptionRef: subscription.id,
    userId: owner.userId,
    productId: owner.productId,
    status: scheduled ? 'active' : subscription.status.toLowerCase(),
    currentPeriodStart: time(subscription.current_period_start_date),
    currentPeriodEnd: time(subscription.current_period_end_date),
    cancelAtPeriodEnd: scheduled,
    fetchedAt,
  };
}

const SUBSCRIPTION_EVENTS = new Set([
  'subscription.active',
  'subscription.trialing',
  'subscription.canceled',
  'subscription.scheduled_cancel',
  'subscription.expired',
  'subscription.unpaid',
  'subscription.update',
  'subscription.past_due',
  'subscription.paused',
]);

/** Only reads IDs from the event to decide what to fetch; nothing in the body is trusted as state. */
export function webhookTarget(type: string, object: unknown): WebhookTarget | null {
  if (!isRecord(object)) return null;
  const id = str(object.id);
  if (type === 'checkout.completed') return id ? { kind: 'checkout', ref: id } : null;
  if (type === 'subscription.paid') {
    const paymentRef = idOf(object.last_transaction) ?? str(object.last_transaction_id);
    if (id && paymentRef) return { kind: 'subscription_payment', ref: paymentRef, subscriptionRef: id };
    return id ? { kind: 'subscription', ref: id } : null;
  }
  if (SUBSCRIPTION_EVENTS.has(type)) return id ? { kind: 'subscription', ref: id } : null;
  if (type === 'refund.created' || type === 'dispute.created') {
    // A subscription transaction can be read on its own (the subscription carries the owner); a one-time one only through its checkout.
    const transaction = idOf(object.transaction);
    if (transaction && idOf(object.subscription)) return { kind: 'payment', ref: transaction };
    const checkout = idOf(object.checkout);
    return checkout ? { kind: 'checkout', ref: checkout } : null;
  }
  return null;
}

async function hmacSha256(key: Uint8Array<ArrayBuffer>, message: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message)));
}

const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
function fromBase64(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Creem signs either with Standard Webhooks headers (webhook-id/-timestamp/-signature, base64 HMAC of `id.timestamp.body`
 * with a whsec_ base64 secret) or with the legacy creem-signature header (hex HMAC of the body with the secret as text).
 * Returns the delivery ID when the Standard Webhooks scheme was used.
 */
export async function verifyCreemSignature(
  body: string,
  headers: Headers,
  secret: string,
  now = Date.now(),
): Promise<{ deliveryId: string | null }> {
  // An empty secret would let anyone sign: an HMAC with an empty key is computable by everyone.
  if (!secret) throw new WebhookSignatureError('CREEM_WEBHOOK_SECRET is not configured');
  const id = headers.get('webhook-id');
  const timestamp = headers.get('webhook-timestamp');
  const signatures = headers.get('webhook-signature');
  if (id && timestamp && signatures) {
    const seconds = Number.parseInt(timestamp, 10);
    if (Number.isNaN(seconds) || Math.abs(now / 1000 - seconds) > SIGNATURE_TOLERANCE_SECONDS) {
      throw new WebhookSignatureError('webhook timestamp outside tolerance');
    }
    const key = fromBase64(secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret);
    if (!key) throw new WebhookSignatureError('webhook secret is not base64');
    const expected = toBase64(await hmacSha256(key, `${id}.${seconds}.${body}`));
    const match = signatures.split(' ').some((entry) => {
      const [version, signature] = entry.split(',');
      return version === 'v1' && !!signature && timingSafeEqual(signature, expected);
    });
    if (!match) throw new WebhookSignatureError();
    return { deliveryId: id };
  }
  const legacy = headers.get('creem-signature');
  if (!legacy) throw new WebhookSignatureError('missing creem signature header');
  const expected = toHex(await hmacSha256(new TextEncoder().encode(secret), body));
  const given = legacy
    .trim()
    .toLowerCase()
    .replace(/^sha256=/, '');
  if (!timingSafeEqual(given, expected)) throw new WebhookSignatureError();
  return { deliveryId: null };
}

export class CreemProvider implements PaymentProvider {
  readonly name = PROVIDER;
  private readonly base: string;

  constructor(
    private readonly options: CreemOptions,
    private readonly fetcher: typeof fetch = (input, init) => fetch(input, init),
  ) {
    this.base = options.apiKey.startsWith('creem_test_') ? TEST_API : LIVE_API;
  }

  async createCustomer(user: { id: string; email: string; name: string; siteId: string }): Promise<string> {
    try {
      const customer = await this.call<CreemCustomer>('POST', '/v1/customers', {
        body: {
          email: user.email,
          name: user.name || user.email.split('@')[0],
          external_id: `${user.siteId}:${user.id}`,
          metadata: { userId: user.id, site: user.siteId },
        },
      });
      return customer.id;
    } catch (error) {
      // A customer with this email may already exist (an earlier checkout, or a concurrent request): reuse it.
      // Ownership never depends on it: checkout metadata names the user.
      if (!(error instanceof CreemApiError) || error.status >= 500 || error.status === 429) throw error;
      const existing = await this.call<CreemCustomer>('GET', '/v1/customers', {
        query: { email: user.email },
      });
      if (!existing.id) throw error;
      return existing.id;
    }
  }

  async createCheckout(request: CheckoutRequest): Promise<{ url: string; checkoutRef: string }> {
    const { product } = request;
    const creemProduct = product.refs?.creem;
    if (!creemProduct) throw new Error(`product ${product.id} has no refs.creem`);
    // Creem's checkout has no cancel URL; the buyer simply leaves the page.
    const checkout = await this.call<CreemCheckout>('POST', '/v1/checkouts', {
      body: {
        request_id: request.orderId,
        product_id: creemProduct,
        customer: { id: request.customerRef },
        success_url: request.successUrl,
        metadata: {
          site: request.siteId,
          userId: request.userId,
          productId: product.id,
          orderId: request.orderId,
        },
      },
    });
    if (!checkout.checkout_url) throw new Error('creem checkout has no checkout_url');
    return { url: checkout.checkout_url, checkoutRef: checkout.id };
  }

  async parseWebhook(request: Request): Promise<WebhookTrigger> {
    const body = await request.text();
    const { deliveryId } = await verifyCreemSignature(body, request.headers, this.options.webhookSecret);
    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      throw new WebhookSignatureError('webhook body is not JSON');
    }
    const event = isRecord(payload) ? payload : {};
    const type = str(event.eventType) ?? str(event.type) ?? 'unknown';
    // Automatic retries keep the event id; fall back to the delivery id only if the body has none.
    const eventId = str(event.id) ?? deliveryId;
    if (!eventId) return { eventId: 'unknown', type, target: null };
    return { eventId, type, target: webhookTarget(type, event.object ?? event.data) };
  }

  async fetchCheckout(checkoutRef: string): Promise<CheckoutFact> {
    const checkout = await this.call<CreemCheckout>('GET', '/v1/checkouts', {
      query: { checkout_id: checkoutRef },
    });
    const meta = readMetadata(checkout.metadata);
    const orderId = meta.orderId ?? str(checkout.request_id);
    if (normalize(checkout.status) !== 'completed') return { orderId, payment: null, subscription: null };
    // The product actually sold must be the one the metadata names; otherwise refuse to map it rather than grant the wrong credits.
    const sold = this.productIdFor(idOf(checkout.product));
    const owner: OurMetadata = {
      userId: meta.userId,
      productId: sold && sold === meta.productId ? sold : null,
      orderId,
    };
    const subscriptionRef = idOf(checkout.subscription);
    const transactionRef = str(checkout.order?.transaction);
    const [subscription, transaction] = await Promise.all([
      subscriptionRef ? this.getSubscription(subscriptionRef) : null,
      transactionRef ? this.getTransaction(transactionRef) : null,
    ]);
    return {
      orderId,
      subscription: subscription ? subscriptionFact(subscription, owner, Date.now()) : null,
      payment: transaction ? paymentFactFromTransaction(transaction, owner) : null,
    };
  }

  /** Subscription transactions only: a one-time transaction has no owner of its own and is read through its checkout. */
  async fetchPayment(paymentRef: string): Promise<PaymentFact | null> {
    const transaction = await this.getTransaction(paymentRef);
    if (!transaction.subscription) return null;
    const subscription = await this.getSubscription(transaction.subscription);
    return paymentFactFromTransaction(transaction, await this.subscriptionOwner(subscription));
  }

  fetchPaymentByCharge(chargeRef: string): Promise<PaymentFact | null> {
    return this.fetchPayment(chargeRef);
  }

  async fetchSubscription(subscriptionRef: string): Promise<SubscriptionFact | null> {
    const subscription = await this.getSubscription(subscriptionRef);
    return subscriptionFact(subscription, await this.subscriptionOwner(subscription), Date.now());
  }

  async portalUrl(customerRef: string): Promise<string> {
    const links = await this.call<{ customer_portal_link?: string }>('POST', '/v1/customers/billing', {
      body: { customer_id: customerRef },
    });
    if (!links.customer_portal_link) throw new Error('creem returned no customer portal link');
    return links.customer_portal_link;
  }

  /** Our product for a Creem product ID, via refs.creem. */
  productIdFor(creemProductId: string | null): string | null {
    if (!creemProductId) return null;
    return this.options.products.find((p) => p.refs?.creem === creemProductId)?.id ?? null;
  }

  /** external_id is `<site id>:<user id>`; only this site's prefix is accepted. */
  userIdFromExternalId(externalId: string | null | undefined): string | null {
    const prefix = `${this.options.siteId}:`;
    return externalId?.startsWith(prefix) ? str(externalId.slice(prefix.length)) : null;
  }

  private async subscriptionOwner(subscription: CreemSubscription): Promise<OurMetadata> {
    const meta = readMetadata(subscription.metadata);
    const productId = meta.productId ?? this.productIdFor(idOf(subscription.product));
    if (meta.userId) return { ...meta, productId };
    const customer =
      typeof subscription.customer === 'string'
        ? await this.call<CreemCustomer>('GET', '/v1/customers', {
            query: { customer_id: subscription.customer },
          })
        : subscription.customer;
    return { userId: this.userIdFromExternalId(customer.external_id), productId, orderId: meta.orderId };
  }

  private getTransaction(id: string) {
    return this.call<CreemTransaction>('GET', '/v1/transactions', { query: { transaction_id: id } });
  }

  private getSubscription(id: string) {
    return this.call<CreemSubscription>('GET', '/v1/subscriptions', { query: { subscription_id: id } });
  }

  private async call<T>(
    method: 'GET' | 'POST',
    path: string,
    options: { query?: Record<string, string>; body?: unknown } = {},
  ): Promise<T> {
    const query = options.query ? `?${new URLSearchParams(options.query)}` : '';
    const response = await this.fetcher(`${this.base}${path}${query}`, {
      method,
      headers: { 'x-api-key': this.options.apiKey, 'content-type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const text = await response.text();
    if (!response.ok)
      throw new CreemApiError(response.status, `creem ${method} ${path} failed: ${response.status}`);
    // Creem's response shapes are declared above, the same trust level as an SDK's types; mappers read every field defensively.
    return (text ? JSON.parse(text) : {}) as T;
  }
}
