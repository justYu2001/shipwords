import { defineSite } from '@shipwords/core/site';

// The source of tinydeskai.io, open-sourced as a complete shipwords example. url is a placeholder: set your own domain.
// All config for this site. Price amounts are in the smallest currency unit (cents). Never change ids after launch.
// Same flow as competing sites: sign in, then buy, then generate. No guest trial and no sign-up bonus.
export default defineSite({
  id: 'tinydeskaiex',
  name: 'Tiny Desk AI',
  url: 'https://tinydeskai.example.com',
  locales: ['en'],
  defaultLocale: 'en',
  // Same price for 1–5 people; one video = 10 credits. Each video costs about $3.06 upstream (Kling 4.0, 720p, one run).
  products: [
    {
      id: 'video_1',
      kind: 'credits',
      name: '1 video',
      price: { amount: 998, currency: 'usd' },
      credits: 10,
      expiresDays: null,
      refs: { creem: 'prod_replace_video_1' },
    },
    {
      id: 'video_3',
      kind: 'credits',
      name: '3 videos',
      price: { amount: 2499, currency: 'usd' },
      credits: 30,
      expiresDays: null,
      refs: { creem: 'prod_replace_video_3' },
    },
    {
      id: 'video_10',
      kind: 'credits',
      name: '10 videos',
      price: { amount: 5999, currency: 'usd' },
      credits: 100,
      expiresDays: null,
      refs: { creem: 'prod_replace_video_10' },
    },
  ],
  signup: { bonusCredits: 0, bonusExpiresDays: null, bonusPerIpDaily: 0, bonusSiteDaily: 0 },
  guest: { dailyPerDevice: 0, dailyPerIp: 0, dailySiteBudget: 0, minRecaptchaScore: 0.5 },
  // Creem product IDs (refs.creem) come from the Creem dashboard; each product there must have the same price and currency.
  billing: { provider: 'creem' },
  analytics: {},
});
