# OPEX Cloud Requirements

Standalone requirements gathering and pro-forma invoicing portal for signed OPEX Cloud clients.
Split out of `OPEX-Consulting/opex-cloud` on 2026-11-12, with its history kept. The marketing site stays in that repo.

- Client portal: `/requirements/<token>` (private, noindex)
- Admin: `/admin` (client links, pricing, invoices, Zoho Books)
- Full guide, env vars and API: [docs/requirements-portal.md](docs/requirements-portal.md)

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # pricing, invoice and Zoho tests
```
