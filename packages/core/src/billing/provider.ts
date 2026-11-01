import type { Product } from '../site';

// Payment provider adapters only "translate": start checkout, verify and identify webhooks, and fetch current state by reference.
// They don't touch the database; orders, credits and subscription state are handled by reconcile.ts, shared by all providers.

export interface CheckoutRequest {
  orderId: string;
  siteId: string;
  product: Product;
  userId: string;
  customerRef: string;
  successUrl: string;
  cancelUrl: string;
}

/** Current state of a payment at the provider. */
export interface PaymentFact {
  provider: string;
  paymentRef: string;
  /** Reference used by refund and chargeback events to find this payment. */
  chargeRef: string | null;
  paid: boolean;
  amount: number;
  currency: string;
  amountRefunded: number;
  /** open and lost are both clawed back in full; won means the dispute was decided in our favor. */
  dispute: 'open' | 'won' | 'lost' | null;
  /**
   * Whether only our server could have written the metadata below (Stripe: secret key only). When false (PayPal: client IDs are public,
   * so anyone can create an order or subscription with any custom_id), credits are granted only if the payment covers the list price.
   */
  metadataTrusted: boolean;
  /** The following come from metadata written to the provider at checkout. */
  userId: string | null;
  productId: string | null;
  orderId: string | null;
  subscriptionRef: string | null;
  /** Service period of this subscription period, millisecond timestamps. */
  periodStart: number | null;
  periodEnd: number | null;
  paidAt: number | null;
  /** When this state was fetched (ms); used to drop stale snapshots from concurrent webhooks. */
  fetchedAt: number;
}

export interface SubscriptionFact {
  provider: string;
  subscriptionRef: string;
  userId: string | null;
  productId: string | null;
  status: string;
  currentPeriodStart: number | null;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  fetchedAt: number;
}

export interface CheckoutFact {
  orderId: string | null;
  payment: PaymentFact | null;
  subscription: SubscriptionFact | null;
}

/** A webhook is only a trigger: it tells us which object to fetch the latest state for. */
export type WebhookTarget =
  | { kind: 'checkout'; ref: string }
  | { kind: 'payment'; ref: string }
  | { kind: 'charge'; ref: string }
  | { kind: 'subscription'; ref: string }
  /** A renewal: store the period's payment and refresh the subscription (its period end decides whether it's live). */
  | { kind: 'subscription_payment'; ref: string; subscriptionRef: string };

export interface WebhookTrigger {
  eventId: string;
  type: string;
  /** null means the signature is valid but we don't handle this event; reply 200. */
  target: WebhookTarget | null;
}

export class WebhookSignatureError extends Error {
  constructor(message = 'invalid webhook signature') {
    super(message);
    this.name = 'WebhookSignatureError';
  }
}

export interface PaymentProvider {
  readonly name: string;
  createCustomer(user: { id: string; email: string; name: string; siteId: string }): Promise<string>;
  createCheckout(request: CheckoutRequest): Promise<{ url: string; checkoutRef: string }>;
  /** Throws WebhookSignatureError on an invalid signature. */
  parseWebhook(request: Request): Promise<WebhookTrigger>;
  fetchCheckout(checkoutRef: string): Promise<CheckoutFact>;
  fetchPayment(paymentRef: string): Promise<PaymentFact | null>;
  fetchPaymentByCharge(chargeRef: string): Promise<PaymentFact | null>;
  fetchSubscription(subscriptionRef: string): Promise<SubscriptionFact | null>;
  portalUrl(customerRef: string, returnUrl: string): Promise<string>;
  /** The provider's receipt page (https) for this payment; omit if the provider has none. */
  receiptUrl?(paymentRef: string): Promise<string | null>;
}
