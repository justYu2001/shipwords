import { describe, expect, it } from 'vitest';
import {
  CreemApiError,
  CreemProvider,
  type CreemSubscription,
  type CreemTransaction,
  mapDispute,
  paymentFactFromTransaction,
  readMetadata,
  subscriptionFact,
  verifyCreemSignature,
  webhookTarget,
} from '../src/billing/creem';
import { WebhookSignatureError } from '../src/billing/provider';
import { defineSite, type Product } from '../src/site';

const products: Product[] = [
  {
    id: 'pack_100',
    kind: 'credits',
    name: '100 credits',
    price: { amount: 1000, currency: 'usd' },
    credits: 100,
    expiresDays: null,
    refs: { creem: 'prod_pack' },
  },
  {
    id: 'pro_month',
    kind: 'subscription',
    name: 'Pro',
    price: { amount: 2000, currency: 'usd' },
    interval: 'month',
    creditsPerPeriod: 500,
    refs: { creem: 'prod_pro' },
  },
];

const owner = { userId: 'u1', productId: 'pack_100', orderId: 'ord_1' };

function transaction(overrides: Partial<CreemTransaction> = {}): CreemTransaction {
  return {
    id: 'tran_1',
    amount: 1000,
    amount_paid: 1210,
    currency: 'USD',
    status: 'paid',
    refunded_amount: 0,
    order: 'ord_creem',
    subscription: null,
    customer: 'cust_1',
    created_at: 1_728_734_327_109,
    ...overrides,
  };
}

describe('Creem field mapping', () => {
  it('metadata reads our three fields; anything else reads as empty', () => {
    expect(readMetadata({ userId: 'u1', productId: 'p', orderId: 'o', extra: 1 })).toEqual({
      userId: 'u1',
      productId: 'p',
      orderId: 'o',
    });
    expect(readMetadata(null)).toEqual({ userId: null, productId: null, orderId: null });
    expect(readMetadata({ userId: 42, productId: '' })).toEqual({
      userId: null,
      productId: null,
      orderId: null,
    });
  });

  it('a one-time transaction: amount paid incl. tax, lower-case currency, no period', () => {
    const fact = paymentFactFromTransaction(transaction({ period_start: 1, period_end: 2 }), owner);
    expect(fact).toMatchObject({
      provider: 'creem',
      paymentRef: 'tran_1',
      chargeRef: 'tran_1',
      paid: true,
      amount: 1210,
      currency: 'usd',
      amountRefunded: 0,
      dispute: null,
      metadataTrusted: true,
      userId: 'u1',
      productId: 'pack_100',
      orderId: 'ord_1',
      subscriptionRef: null,
      periodStart: null,
      periodEnd: null,
      paidAt: 1_728_734_327_109,
    });
  });

  it('refunds and chargebacks come from the transaction state, whatever the status spelling', () => {
    const partial = paymentFactFromTransaction(
      transaction({ status: 'partialRefund', refunded_amount: 605 }),
      owner,
    );
    expect(partial).toMatchObject({ paid: true, amountRefunded: 605, dispute: null });
    expect(
      paymentFactFromTransaction(transaction({ status: 'refunded', refunded_amount: 1210 }), owner).paid,
    ).toBe(true);
    expect(mapDispute('chargedBack')).toBe('lost');
    expect(mapDispute('chargeback')).toBe('lost');
    expect(mapDispute('paid')).toBeNull();
    expect(paymentFactFromTransaction(transaction({ status: 'chargeback' }), owner)).toMatchObject({
      paid: true,
      dispute: 'lost',
    });
  });

  it('pending, declined and void transactions are not paid', () => {
    for (const status of ['pending', 'declined', 'void', 'canceled', 'uncollectible']) {
      expect(paymentFactFromTransaction(transaction({ status }), owner).paid).toBe(false);
    }
  });

  it('a subscription transaction carries its subscription and service period (already in ms)', () => {
    const fact = paymentFactFromTransaction(
      transaction({ subscription: 'sub_1', period_start: 1_728_734_318_000, period_end: 1_731_412_718_000 }),
      { ...owner, productId: 'pro_month' },
    );
    expect(fact).toMatchObject({
      subscriptionRef: 'sub_1',
      periodStart: 1_728_734_318_000,
      periodEnd: 1_731_412_718_000,
    });
  });

  it('subscriptions: dates parsed; scheduled_cancel is active until period end', () => {
    const subscription: CreemSubscription = {
      id: 'sub_1',
      product: 'prod_pro',
      customer: 'cust_1',
      status: 'scheduled_cancel',
      current_period_start_date: '2024-10-12T11:58:38.000Z',
      current_period_end_date: '2024-11-12T11:58:38.000Z',
    };
    expect(subscriptionFact(subscription, { ...owner, productId: 'pro_month' }, 5)).toEqual({
      provider: 'creem',
      subscriptionRef: 'sub_1',
      userId: 'u1',
      productId: 'pro_month',
      status: 'active',
      currentPeriodStart: Date.parse('2024-10-12T11:58:38.000Z'),
      currentPeriodEnd: Date.parse('2024-11-12T11:58:38.000Z'),
      cancelAtPeriodEnd: true,
      fetchedAt: 5,
    });
    expect(subscriptionFact({ ...subscription, status: 'past_due' }, owner, 5)).toMatchObject({
      status: 'past_due',
      cancelAtPeriodEnd: false,
    });
  });

  it('maps webhook events to the object to fetch, reading only IDs', () => {
    expect(webhookTarget('checkout.completed', { id: 'ch_1' })).toEqual({ kind: 'checkout', ref: 'ch_1' });
    expect(webhookTarget('subscription.paid', { id: 'sub_1', last_transaction: { id: 'tran_2' } })).toEqual({
      kind: 'subscription_payment',
      ref: 'tran_2',
      subscriptionRef: 'sub_1',
    });
    expect(webhookTarget('subscription.paid', { id: 'sub_1', last_transaction_id: 'tran_3' })).toEqual({
      kind: 'subscription_payment',
      ref: 'tran_3',
      subscriptionRef: 'sub_1',
    });
    expect(webhookTarget('subscription.paid', { id: 'sub_1' })).toEqual({
      kind: 'subscription',
      ref: 'sub_1',
    });
    expect(webhookTarget('subscription.canceled', { id: 'sub_1' })).toEqual({
      kind: 'subscription',
      ref: 'sub_1',
    });
    // Refund of a subscription period: the transaction (its subscription names the owner).
    expect(
      webhookTarget('refund.created', {
        id: 'ref_1',
        transaction: { id: 'tran_2' },
        subscription: { id: 'sub_1' },
        checkout: { id: 'ch_1' },
      }),
    ).toEqual({ kind: 'payment', ref: 'tran_2' });
    // One-time refund or dispute: the checkout, the only object carrying our metadata.
    expect(
      webhookTarget('dispute.created', {
        id: 'dsp_1',
        transaction: { id: 'tran_1' },
        checkout: { id: 'ch_1' },
      }),
    ).toEqual({
      kind: 'checkout',
      ref: 'ch_1',
    });
    expect(webhookTarget('refund.created', { id: 'ref_1', transaction: 'tran_1', checkout: 'ch_1' })).toEqual(
      {
        kind: 'checkout',
        ref: 'ch_1',
      },
    );
    expect(webhookTarget('refund.created', { id: 'ref_1', transaction: { id: 'tran_1' } })).toBeNull();
    expect(webhookTarget('credits.granted', { id: 'x' })).toBeNull();
    expect(webhookTarget('checkout.completed', null)).toBeNull();
  });

  it('Creem sites must give every product a distinct refs.creem', () => {
    const base = {
      id: 's',
      name: 'S',
      url: 'https://s.example',
      locales: ['en'],
      defaultLocale: 'en',
      signup: { bonusCredits: 0, bonusExpiresDays: null, bonusPerIpDaily: 0, bonusSiteDaily: 0 },
      guest: { dailyPerDevice: 0, dailyPerIp: 0, dailySiteBudget: 0, minRecaptchaScore: 0.5 },
      billing: { provider: 'creem' },
    } as const;
    expect(() => defineSite({ ...base, products })).not.toThrow();
    const [pack, pro] = products;
    if (!pack || !pro) throw new Error('fixture');
    expect(() => defineSite({ ...base, products: [{ ...pack, refs: {} }] })).toThrow(/refs\.creem/);
    expect(() => defineSite({ ...base, products: [pack, { ...pro, refs: { creem: 'prod_pack' } }] })).toThrow(
      /used twice/,
    );
  });
});

const encoder = new TextEncoder();
async function hmac(key: Uint8Array<ArrayBuffer>, message: string) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, encoder.encode(message)));
}
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));

describe('webhook signatures', () => {
  const body = JSON.stringify({ id: 'evt_1', eventType: 'checkout.completed', object: { id: 'ch_1' } });

  it('legacy creem-signature: hex HMAC-SHA256 of the raw body', async () => {
    const signature = hex(await hmac(encoder.encode('secret'), body));
    await expect(
      verifyCreemSignature(body, new Headers({ 'creem-signature': signature }), 'secret'),
    ).resolves.toEqual({ deliveryId: null });
    await expect(
      verifyCreemSignature(
        body,
        new Headers({ 'creem-signature': `sha256=${signature.toUpperCase()}` }),
        'secret',
      ),
    ).resolves.toEqual({ deliveryId: null });
    await expect(
      verifyCreemSignature(`${body} `, new Headers({ 'creem-signature': signature }), 'secret'),
    ).rejects.toBeInstanceOf(WebhookSignatureError);
    await expect(verifyCreemSignature(body, new Headers(), 'secret')).rejects.toBeInstanceOf(
      WebhookSignatureError,
    );
  });

  it('an unconfigured secret rejects every request with a signature error', async () => {
    const signature = hex(await hmac(encoder.encode('secret'), body));
    await expect(
      verifyCreemSignature(body, new Headers({ 'creem-signature': signature }), ''),
    ).rejects.toThrow(/not configured/);
  });

  it('Standard Webhooks: base64 HMAC of id.timestamp.body with the whsec_ key, within tolerance', async () => {
    const key = crypto.getRandomValues(new Uint8Array(24));
    const secret = `whsec_${b64(key)}`;
    const now = 1_800_000_000_000;
    const ts = String(now / 1000);
    const signature = b64(await hmac(key, `msg_1.${ts}.${body}`));
    const headers = (sig: string, at = ts) =>
      new Headers({ 'webhook-id': 'msg_1', 'webhook-timestamp': at, 'webhook-signature': sig });
    await expect(verifyCreemSignature(body, headers(`v1,bad v1,${signature}`), secret, now)).resolves.toEqual(
      {
        deliveryId: 'msg_1',
      },
    );
    await expect(verifyCreemSignature(body, headers('v1,bad'), secret, now)).rejects.toBeInstanceOf(
      WebhookSignatureError,
    );
    await expect(
      verifyCreemSignature(body, headers(`v1,${signature}`, String(now / 1000 - 301)), secret, now),
    ).rejects.toThrow(/tolerance/);
  });
});

interface Call {
  method: string;
  url: URL;
  body: unknown;
  apiKey: string | null;
}

function fakeCreem(routes: Record<string, (url: URL, body: unknown) => { status?: number; json: unknown }>) {
  const calls: Call[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ method, url, body, apiKey: new Headers(init?.headers).get('x-api-key') });
    const route = routes[`${method} ${url.pathname}`];
    if (!route) return new Response('not found', { status: 404 });
    const { status = 200, json } = route(url, body);
    return new Response(JSON.stringify(json), { status });
  }) as typeof fetch;
  return { calls, fetcher };
}

const options = { apiKey: 'creem_test_abc', webhookSecret: 'secret', siteId: 'site1', products };

describe('CreemProvider', () => {
  it('uses the test API for creem_test_ keys and live otherwise', async () => {
    const routes = {
      'POST /v1/customers/billing': () => ({ json: { customer_portal_link: 'https://portal' } }),
    };
    const test = fakeCreem(routes);
    await new CreemProvider(options, test.fetcher).portalUrl('cust_1');
    expect(test.calls[0]?.url.origin).toBe('https://test-api.creem.io');
    expect(test.calls[0]?.apiKey).toBe('creem_test_abc');
    expect(test.calls[0]?.body).toEqual({ customer_id: 'cust_1' });
    const live = fakeCreem(routes);
    await new CreemProvider({ ...options, apiKey: 'creem_live' }, live.fetcher).portalUrl('cust_1');
    expect(live.calls[0]?.url.origin).toBe('https://api.creem.io');
  });

  it('creates a customer with a site-scoped external_id, reusing an existing one on conflict', async () => {
    const user = { id: 'u1', email: 'a@b.c', name: '', siteId: 'site1' };
    const created = fakeCreem({ 'POST /v1/customers': () => ({ json: { id: 'cust_new' } }) });
    expect(await new CreemProvider(options, created.fetcher).createCustomer(user)).toBe('cust_new');
    expect(created.calls[0]?.body).toMatchObject({ email: 'a@b.c', name: 'a', external_id: 'site1:u1' });

    const conflict = fakeCreem({
      'POST /v1/customers': () => ({ status: 409, json: { message: 'exists' } }),
      'GET /v1/customers': (url) => ({ json: { id: `cust_for_${url.searchParams.get('email')}` } }),
    });
    expect(await new CreemProvider(options, conflict.fetcher).createCustomer(user)).toBe('cust_for_a@b.c');

    const down = fakeCreem({ 'POST /v1/customers': () => ({ status: 503, json: {} }) });
    await expect(new CreemProvider(options, down.fetcher).createCustomer(user)).rejects.toBeInstanceOf(
      CreemApiError,
    );
  });

  it('checkout: Creem product from refs, our metadata, order ID as request_id', async () => {
    const { calls, fetcher } = fakeCreem({
      'POST /v1/checkouts': () => ({ json: { id: 'ch_1', checkout_url: 'https://creem.io/pay/ch_1' } }),
    });
    const product = products[1];
    if (!product) throw new Error('fixture');
    const result = await new CreemProvider(options, fetcher).createCheckout({
      orderId: 'ord_1',
      siteId: 'site1',
      product,
      userId: 'u1',
      customerRef: 'cust_1',
      successUrl: 'https://s.example/ok',
      cancelUrl: 'https://s.example/no',
    });
    expect(result).toEqual({ url: 'https://creem.io/pay/ch_1', checkoutRef: 'ch_1' });
    expect(calls[0]?.body).toEqual({
      request_id: 'ord_1',
      product_id: 'prod_pro',
      customer: { id: 'cust_1' },
      success_url: 'https://s.example/ok',
      metadata: { site: 'site1', userId: 'u1', productId: 'pro_month', orderId: 'ord_1' },
    });
  });

  const meta = { userId: 'u1', productId: 'pack_100', orderId: 'ord_1' };

  it('completed one-time checkout: payment from the order transaction with checkout metadata', async () => {
    const { fetcher } = fakeCreem({
      'GET /v1/checkouts': () => ({
        json: {
          id: 'ch_1',
          status: 'completed',
          product: 'prod_pack',
          order: { id: 'ord_c', transaction: 'tran_1' },
          metadata: meta,
        },
      }),
      'GET /v1/transactions': (url) => ({
        json: transaction({
          id: url.searchParams.get('transaction_id') ?? '',
          status: 'partialRefund',
          refunded_amount: 100,
        }),
      }),
    });
    const fact = await new CreemProvider(options, fetcher).fetchCheckout('ch_1');
    expect(fact.orderId).toBe('ord_1');
    expect(fact.subscription).toBeNull();
    expect(fact.payment).toMatchObject({
      paymentRef: 'tran_1',
      userId: 'u1',
      productId: 'pack_100',
      amountRefunded: 100,
    });
  });

  it('a checkout whose sold product does not match the metadata is not mapped to a product', async () => {
    const { fetcher } = fakeCreem({
      'GET /v1/checkouts': () => ({
        json: {
          id: 'ch_1',
          status: 'completed',
          product: 'prod_pro',
          order: { id: 'o', transaction: 'tran_1' },
          metadata: meta,
        },
      }),
      'GET /v1/transactions': () => ({ json: transaction() }),
    });
    const fact = await new CreemProvider(options, fetcher).fetchCheckout('ch_1');
    expect(fact.payment?.productId).toBeNull();
  });

  it('an unfinished checkout has no payment or subscription yet', async () => {
    const { calls, fetcher } = fakeCreem({
      'GET /v1/checkouts': () => ({
        json: { id: 'ch_1', status: 'pending', product: 'prod_pack', request_id: 'ord_9' },
      }),
    });
    expect(await new CreemProvider(options, fetcher).fetchCheckout('ch_1')).toEqual({
      orderId: 'ord_9',
      payment: null,
      subscription: null,
    });
    expect(calls).toHaveLength(1);
  });

  it('subscription checkout returns both the subscription and its first payment', async () => {
    const { fetcher } = fakeCreem({
      'GET /v1/checkouts': () => ({
        json: {
          id: 'ch_2',
          status: 'completed',
          product: { id: 'prod_pro' },
          order: { id: 'o', transaction: 'tran_s1' },
          subscription: { id: 'sub_1' },
          metadata: { ...meta, productId: 'pro_month' },
        },
      }),
      'GET /v1/subscriptions': () => ({
        json: {
          id: 'sub_1',
          product: 'prod_pro',
          customer: 'cust_1',
          status: 'active',
          current_period_end_date: '2030-01-01T00:00:00Z',
          metadata: { ...meta, productId: 'pro_month' },
        },
      }),
      'GET /v1/transactions': () => ({
        json: transaction({ id: 'tran_s1', subscription: 'sub_1', period_end: 9 }),
      }),
    });
    const fact = await new CreemProvider(options, fetcher).fetchCheckout('ch_2');
    expect(fact.subscription).toMatchObject({
      subscriptionRef: 'sub_1',
      userId: 'u1',
      productId: 'pro_month',
    });
    expect(fact.payment).toMatchObject({ paymentRef: 'tran_s1', subscriptionRef: 'sub_1', periodEnd: 9 });
  });

  it('a renewal payment takes its owner from subscription metadata', async () => {
    const { fetcher } = fakeCreem({
      'GET /v1/transactions': () => ({ json: transaction({ id: 'tran_2', subscription: 'sub_1' }) }),
      'GET /v1/subscriptions': () => ({
        json: { id: 'sub_1', product: 'prod_pro', customer: 'cust_1', status: 'active', metadata: meta },
      }),
    });
    // The metadata still names the product bought at checkout; the product Creem bills now wins (a plan change keeps old metadata).
    expect(await new CreemProvider(options, fetcher).fetchPayment('tran_2')).toMatchObject({
      userId: 'u1',
      productId: 'pro_month',
    });
  });

  it('a subscription billed for a Creem product missing from refs.creem maps to no product', async () => {
    const { fetcher } = fakeCreem({
      'GET /v1/transactions': () => ({ json: transaction({ id: 'tran_2', subscription: 'sub_1' }) }),
      'GET /v1/subscriptions': () => ({
        json: {
          id: 'sub_1',
          product: 'prod_unknown',
          customer: 'cust_1',
          status: 'active',
          metadata: { ...meta, productId: 'pro_month' },
        },
      }),
    });
    expect((await new CreemProvider(options, fetcher).fetchPayment('tran_2'))?.productId).toBeNull();
  });

  it('without subscription metadata: owner from this site’s customer external_id, product from refs.creem', async () => {
    const routes = (externalId: string | null) => ({
      'GET /v1/transactions': () => ({ json: transaction({ id: 'tran_2', subscription: 'sub_1' }) }),
      'GET /v1/subscriptions': () => ({
        json: { id: 'sub_1', product: 'prod_pro', customer: 'cust_1', status: 'active' },
      }),
      'GET /v1/customers': () => ({ json: { id: 'cust_1', external_id: externalId } }),
    });
    const ours = fakeCreem(routes('site1:u7'));
    expect(await new CreemProvider(options, ours.fetcher).fetchPayment('tran_2')).toMatchObject({
      userId: 'u7',
      productId: 'pro_month',
    });
    const otherSite = fakeCreem(routes('site2:u7'));
    expect((await new CreemProvider(options, otherSite.fetcher).fetchPayment('tran_2'))?.userId).toBeNull();
  });

  it('a one-time transaction cannot be read on its own', async () => {
    const { fetcher } = fakeCreem({ 'GET /v1/transactions': () => ({ json: transaction() }) });
    expect(await new CreemProvider(options, fetcher).fetchPayment('tran_1')).toBeNull();
  });

  it('parseWebhook verifies the signature and returns the event ID and target', async () => {
    const body = JSON.stringify({ id: 'evt_9', eventType: 'checkout.completed', object: { id: 'ch_1' } });
    const signature = hex(await hmac(encoder.encode('secret'), body));
    const provider = new CreemProvider(options, fakeCreem({}).fetcher);
    const request = (sig: string) =>
      new Request('https://s.example/api/webhooks/creem', {
        method: 'POST',
        headers: { 'creem-signature': sig },
        body,
      });
    expect(await provider.parseWebhook(request(signature))).toEqual({
      eventId: 'evt_9',
      type: 'checkout.completed',
      target: { kind: 'checkout', ref: 'ch_1' },
    });
    await expect(provider.parseWebhook(request('00'))).rejects.toBeInstanceOf(WebhookSignatureError);
  });
});
