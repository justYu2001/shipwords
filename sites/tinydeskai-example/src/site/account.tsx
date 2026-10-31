import { useAccount } from '@shipwords/core/react/account';
import { type PublicJob, useGeneration } from '@shipwords/jobs/react';
import { getRouteApi, Link } from '@tanstack/react-router';
import { type MouseEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { authClient } from '~/lib/auth';
import { m } from '~/paraglide/messages.js';
import { openPricing, packName } from '~/site/pricing';
import site from '../../site.config';

// Account uses a dialog like pricing: it only holds credits, my videos, orders and sign out, not worth leaving the page.
// The /account page stays for no-JS visitors and direct links; both share AccountPanel.

const OPEN_EVENT = 'tinydesk:account';

export function openAccount() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/** Link to the account: a dialog with JS, /account without. */
export function AccountLink({
  className,
  title,
  children,
}: {
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <a
      href="/account"
      className={className}
      aria-label={m.common_account_label()}
      title={title}
      onClick={(e: MouseEvent) => {
        e.preventDefault();
        openAccount();
      }}
    >
      {children}
    </a>
  );
}

const root = getRouteApi('__root__');
const date = (ms: number) => new Date(ms).toLocaleDateString();
const orderName = (productId: string) => {
  const product = site.products.find((p) => p.id === productId);
  return product ? packName(product) : productId;
};
const money = (amount: number, currency: string) => `${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`;

type Order = NonNullable<ReturnType<typeof useAccount>['data']>['orders'][number];

/** Status of a paid order: dispute first, then refund; a won dispute shows as paid. */
function orderStatus(order: Order) {
  if (order.dispute === 'open') return m.common_account_status_disputed();
  if (order.dispute === 'lost') return m.common_account_status_charged_back();
  if (order.amountRefunded >= order.amountPaid) return m.common_account_status_refunded();
  if (order.amountRefunded > 0) {
    return m.common_account_status_partly_refunded({ amount: money(order.amountRefunded, order.currency) });
  }
  return m.common_account_status_paid();
}

// Output order: with original audio, then silent (composeOutputs in packages/jobs).
const DOWNLOADS = [m.common_job_download_song, m.common_job_download_silent];
const VERSIONS = ['song', 'silent'];

function videoStatus(job: PublicJob) {
  if (job.status === 'queued' || job.status === 'submitted') return m.common_videos_rendering();
  if (job.status === 'failed') return m.common_videos_failed();
  if (job.status === 'canceled') return m.common_videos_canceled();
  return null;
}

/** My videos: the latest 30 jobs (the /api/jobs limit). Running ones keep polling and become links when done. */
function MyVideos() {
  const { jobs } = useGeneration({ recaptchaSiteKey: null });
  return (
    <div className="account-card">
      <h3>{m.common_videos_title()}</h3>
      {jobs.length > 0 ? (
        <ul className="orders">
          {jobs.map((job) => (
            <li key={job.id}>
              {date(job.createdAt)} ·{' '}
              {job.outputs[0] ? (
                <a href={job.outputs[0].url} target="_blank" rel="noopener">
                  {m.common_videos_watch()}
                </a>
              ) : (
                videoStatus(job)
              )}
              {job.outputs.map((output, i) => (
                <span key={output.url}>
                  {' · '}
                  <a href={output.url} download={`tiny-desk-ai-${job.id.slice(-6)}-${VERSIONS[i] ?? i}.mp4`}>
                    {(DOWNLOADS[i] ?? m.common_job_download)()}
                  </a>
                </span>
              ))}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{m.common_videos_none()}</p>
      )}
    </div>
  );
}

/** Account content; in the dialog, onLeave closes the dialog before opening the pricing dialog. */
export function AccountPanel({
  heading: Heading = 'h1',
  onLeave,
}: {
  heading?: 'h1' | 'h2';
  onLeave?: () => void;
}) {
  const config = root.useLoaderData();
  const { data, loading } = useAccount();

  if (loading) return <p className="muted">{m.common_account_loading()}</p>;
  if (!data) {
    return (
      <p>
        <Link to="/login" search={{ next: '/account' }}>
          {m.common_account_sign_in()}
        </Link>{' '}
        {m.common_account_sign_in_after()}
      </p>
    );
  }
  return (
    <>
      <Heading id="account-title">{m.common_account_heading()}</Heading>
      <p className="muted sign-in-note">{m.common_account_signed_in_as({ email: data.user.email })}</p>

      <div className="account-card">
        <h3>{m.common_account_credits()}</h3>
        <p className="balance">{Math.max(0, data.balance.available).toLocaleString()}</p>
        {data.balance.debt > 0 && (
          <p className="muted">{m.common_account_debt({ debt: data.balance.debt })}</p>
        )}
        {data.balance.nextExpiry && (
          <p className="muted">
            {m.common_account_expiry({
              amount: data.balance.nextExpiry.amount,
              date: date(data.balance.nextExpiry.at),
            })}
          </p>
        )}
        <button
          type="button"
          className="primary"
          onClick={() => {
            onLeave?.();
            openPricing('account');
          }}
        >
          {m.common_account_get_more()}
        </button>
      </div>

      <MyVideos />

      <div className="account-card">
        <h3>{m.common_account_orders()}</h3>
        {data.orders.length > 0 ? (
          <ul className="orders">
            {data.orders.map((order) => (
              <li key={order.id}>
                {date(order.createdAt)} · {orderName(order.productId)} ·{' '}
                {money(order.amountPaid, order.currency)} · {orderStatus(order)}
                {/* Creem emails receipts and has no receipt page to link to. */}
                {site.billing.provider !== 'creem' && (
                  <>
                    {' · '}
                    <a
                      href={`/api/billing/receipt?order=${encodeURIComponent(order.id)}`}
                      target="_blank"
                      rel="noopener"
                    >
                      {m.common_account_receipt()}
                    </a>
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{m.common_account_no_orders()}</p>
        )}
      </div>

      <button
        type="button"
        className="link-button"
        onClick={() =>
          void authClient(config.googleClientId)
            .signOut()
            .then(() => window.location.assign('/'))
        }
      >
        {m.common_account_sign_out()}
      </button>
    </>
  );
}

export function AccountDialog() {
  const dialog = useRef<HTMLDialogElement>(null);
  // Mount content only while open: each open refetches the balance, so it is current after generating or buying.
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => {
      setOpen(true);
      dialog.current?.showModal();
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  function close() {
    dialog.current?.close();
  }

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: clicking the backdrop is a mouse shortcut; keyboard users close with native Esc.
    <dialog
      ref={dialog}
      className="sign-in-dialog account-dialog"
      aria-labelledby="account-title"
      onClose={() => setOpen(false)}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <button type="button" className="dialog-close" aria-label={m.common_close()} onClick={close}>
        ×
      </button>
      {open && <AccountPanel heading="h2" onLeave={close} />}
    </dialog>
  );
}
