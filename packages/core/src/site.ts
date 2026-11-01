// Site config types. Each site declares its config with defineSite() in site.config.ts; packages only read it.

export interface Price {
  /** Smallest currency unit, e.g. cents. */
  amount: number;
  currency: string;
}

interface ProductBase {
  id: string;
  name: string;
  price: Price;
  /**
   * Product IDs for providers that need pre-created products. Stripe uses inline prices and needs none; PayPal subscriptions need a Plan ID (refs.paypal);
   * Creem needs a product ID for every product (refs.creem), with the same price and currency as here.
   */
  refs?: Record<string, string>;
}

export interface CreditPackProduct extends ProductBase {
  kind: 'credits';
  credits: number;
  /** Days until purchased credits expire; null means never. */
  expiresDays: number | null;
}

export interface SubscriptionProduct extends ProductBase {
  kind: 'subscription';
  interval: 'month' | 'year';
  /** Credits granted per paid period, expiring at the end of that period. */
  creditsPerPeriod: number;
}

export type Product = CreditPackProduct | SubscriptionProduct;

export interface GuestQuota {
  /** Free generations per device per day. */
  dailyPerDevice: number;
  /** Free generations per IP (IPv6 by /64) per day. */
  dailyPerIp: number;
  /** Total free guest generations per day across the site; beyond that, sign-in is required. */
  dailySiteBudget: number;
  /** Require sign-in when the reCAPTCHA v3 score is below this value. */
  minRecaptchaScore: number;
}

export interface SiteConfig {
  /** Short site name used in metadata, logs and idempotency keys. Don't change it after launch. */
  id: string;
  name: string;
  /** Canonical production URL, without a trailing slash. */
  url: string;
  locales: readonly string[];
  defaultLocale: string;
  products: readonly Product[];
  signup: {
    bonusCredits: number;
    bonusExpiresDays: number | null;
    /** Max new accounts per IP per day that receive the sign-up bonus. */
    bonusPerIpDaily: number;
    /** Max new accounts per UTC day, site-wide, that receive the sign-up bonus; caps the daily cost of bonus farming. */
    bonusSiteDaily: number;
  };
  guest: GuestQuota;
  billing:
    | {
        provider: 'stripe';
        /** Enable Stripe Tax automatic tax calculation; configure it in the Stripe dashboard first. */
        automaticTax: boolean;
      }
    | { provider: 'paypal' }
    /** Creem is the merchant of record and handles tax itself. */
    | { provider: 'creem' };
  analytics?: {
    ga4?: string;
    clarity?: string;
    /** The collector URL isn't set here (it would end up in the client bundle); see CoreEnv.RYBBIT_UPSTREAM. */
    rybbit?: { siteId: string };
  };
}

export function defineSite<const T extends SiteConfig>(config: T): T {
  const ids = new Set<string>();
  const creemRefs = new Set<string>();
  for (const product of config.products) {
    if (ids.has(product.id)) throw new Error(`duplicate product id: ${product.id}`);
    ids.add(product.id);
    if (!Number.isSafeInteger(product.price.amount) || product.price.amount <= 0) {
      throw new Error(`product ${product.id}: price.amount must be a positive integer in minor units`);
    }
    if (config.billing.provider === 'paypal' && product.kind === 'subscription' && !product.refs?.paypal) {
      throw new Error(`product ${product.id}: paypal subscriptions need refs.paypal (plan id)`);
    }
    if (config.billing.provider === 'creem') {
      const ref = product.refs?.creem;
      if (!ref) throw new Error(`product ${product.id}: creem products need refs.creem (product id)`);
      // Payments are mapped back to our product by this ID, so two products can't share one.
      if (creemRefs.has(ref)) throw new Error(`product ${product.id}: refs.creem ${ref} is used twice`);
      creemRefs.add(ref);
    }
  }
  return config;
}

export function findProduct(site: SiteConfig, productId: string): Product | undefined {
  return site.products.find((product) => product.id === productId);
}
