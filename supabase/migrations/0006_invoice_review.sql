-- Human review gate: every invoice version is reviewed by OPEX before the client receives it.
-- Clients can no longer download invoices; approval creates the Zoho invoice and emails it to the client.
alter table public.invoices add column if not exists review_status text not null default 'pending_review';
alter table public.invoices drop constraint if exists invoices_review_status_check;
alter table public.invoices add constraint invoices_review_status_check
  check (review_status in ('pending_review', 'rejected', 'approved', 'sent', 'send_failed'));
alter table public.invoices add column if not exists revision         int not null default 1;       -- bumped on every re-price
alter table public.invoices add column if not exists review_overrides jsonb not null default '{}'::jsonb; -- {partner?, margin?}
alter table public.invoices add column if not exists reviewed_by      text;
alter table public.invoices add column if not exists reviewed_at      timestamptz;
alter table public.invoices add column if not exists review_note      text;
alter table public.invoices add column if not exists send_started_at  timestamptz;
alter table public.invoices add column if not exists sent_at          timestamptz;
alter table public.invoices add column if not exists sent_to          text;
alter table public.invoices add column if not exists send_error       text;
create index if not exists invoices_review_queue_idx on public.invoices (review_status) where status = 'current';
-- Old rows were "issued" by a client submit/download. Issuing now means approval, so clear it where nothing
-- was created in Zoho (rows with a Zoho invoice stay frozen and get a new version on change).
update public.invoices set issued_at = null where zoho_invoice_id is null and review_status = 'pending_review';
