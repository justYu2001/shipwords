import { createFileRoute } from '@tanstack/react-router';
import { core } from '~/core.server';

// In the Creem dashboard (Developers → Webhooks) set the URL to https://<domain>/api/webhooks/creem; events are listed in docs/site-launch.md.
export const Route = createFileRoute('/api/webhooks/creem')({
  server: { handlers: { POST: ({ request }) => core.billing.webhook(request) } },
});
