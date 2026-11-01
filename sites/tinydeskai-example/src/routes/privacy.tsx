import { pageHead } from '@shipwords/core/seo';
import { createFileRoute } from '@tanstack/react-router';
import { m } from '~/paraglide/messages.js';
import { LegalPage } from '~/site/legal';
import site from '../../site.config';

export const Route = createFileRoute('/privacy')({
  head: () =>
    pageHead(site, {
      title: m.legal_privacy_meta_title({ siteName: site.name }),
      description: m.legal_privacy_meta_description({ siteName: site.name }),
      path: '/privacy',
    }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage
      title={m.legal_privacy_title()}
      intro={m.legal_privacy_intro({ siteName: site.name, host: site.url.replace('https://', '') })}
    >
      <h2>{m.legal_privacy_collect_heading()}</h2>
      <ul>
        <li>
          <strong>{m.legal_privacy_collect_account_label()}</strong> {m.legal_privacy_collect_account()}
        </li>
        <li>
          <strong>{m.legal_privacy_collect_photos_label()}</strong> {m.legal_privacy_collect_photos()}
        </li>
        <li>
          <strong>{m.legal_privacy_collect_videos_label()}</strong> {m.legal_privacy_collect_videos()}
        </li>
        <li>
          <strong>{m.legal_privacy_collect_payments_label()}</strong> {m.legal_privacy_collect_payments()}
        </li>
        <li>
          <strong>{m.legal_privacy_collect_technical_label()}</strong> {m.legal_privacy_collect_technical()}
        </li>
      </ul>

      <h2>{m.legal_privacy_processors_heading()}</h2>
      <ul>
        <li>{m.legal_privacy_processors_cloudflare()}</li>
        <li>{m.legal_privacy_processors_creem()}</li>
        <li>{m.legal_privacy_processors_google()}</li>
        <li>{m.legal_privacy_processors_ai()}</li>
      </ul>
      <p>{m.legal_privacy_processors_no_sale()}</p>

      <h2>{m.legal_privacy_retention_heading()}</h2>
      <ul>
        <li>{m.legal_privacy_retention_photos()}</li>
        <li>{m.legal_privacy_retention_videos()}</li>
        <li>{m.legal_privacy_retention_records()}</li>
      </ul>

      <h2>{m.legal_privacy_cookies_heading()}</h2>
      <p>{m.legal_privacy_cookies_body()}</p>

      <h2>{m.legal_privacy_choices_heading()}</h2>
      <p>{m.legal_privacy_choices_body({ siteName: site.name })}</p>

      <h2>{m.legal_privacy_changes_heading()}</h2>
      <p>{m.legal_privacy_changes_body()}</p>
    </LegalPage>
  );
}
