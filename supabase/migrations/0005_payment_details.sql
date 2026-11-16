-- Bank / payment details shown on the portal's Invoice step and the portal PDF, edited at /admin/payment.
-- Empty values mean "not set": the portal then shows a neutral line instead of placeholders.
-- (Zoho Books invoices use the bank details configured in Zoho itself.)
create table if not exists public.payment_settings (
  key         text primary key,
  value       text not null default '',
  label       text not null,
  note        text,
  sort        int not null default 0,
  updated_at  timestamptz not null default now()
);

insert into public.payment_settings (key, value, label, note, sort) values
  ('bank_name',      '', 'Bank name',            'e.g. Zenith Bank Plc', 1),
  ('account_name',   '', 'Account name',         'As it appears on the account', 2),
  ('account_number', '', 'Account number',       '10-digit NUBAN', 3),
  ('sort_code',      '', 'Sort code (optional)', 'Leave blank to hide it', 4),
  ('instructions',   '', 'Payment instructions', 'Shown under the details. Blank = "Please quote the invoice number as the payment reference."', 5)
on conflict (key) do nothing;

alter table public.payment_settings enable row level security;
revoke all on public.payment_settings from anon, authenticated;
