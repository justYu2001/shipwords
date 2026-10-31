import { defineSite } from '@shipwords/core/site';

// All config for this site. Prices are in the smallest currency unit (cents). Do not change id after launch.
export default defineSite({
  id: 'aisite',
  name: 'AI Site',
  url: 'https://example.com',
  locales: ['en'],
  defaultLocale: 'en',
  products: [
    {
      id: 'pack_200',
      kind: 'credits',
      name: '200 credits',
      price: { amount: 499, currency: 'usd' },
      credits: 200,
      expiresDays: null,
      refs: { creem: 'prod_replace_pack_200' },
    },
    {
      id: 'pack_1000',
      kind: 'credits',
      name: '1,000 credits',
      price: { amount: 1999, currency: 'usd' },
      credits: 1000,
      expiresDays: null,
      refs: { creem: 'prod_replace_pack_1000' },
    },
    {
      id: 'pro_month',
      kind: 'subscription',
      name: 'Pro monthly',
      price: { amount: 999, currency: 'usd' },
      interval: 'month',
      creditsPerPeriod: 600,
      refs: { creem: 'prod_replace_pro_month' },
    },
  ],
  signup: { bonusCredits: 20, bonusExpiresDays: 30, bonusPerIpDaily: 3, bonusSiteDaily: 100 },
  guest: { dailyPerDevice: 2, dailyPerIp: 4, dailySiteBudget: 200, minRecaptchaScore: 0.5 },
  // Creem product IDs (refs.creem) come from the Creem dashboard; each product there must have the same price and currency.
  billing: { provider: 'creem' },
  analytics: {},
});
