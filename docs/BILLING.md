# Billing (CAMPUSOS-020)

CampusOS starts with **manual invoicing**:

- There is no payment gateway.
- Operators record payments by hand when they arrive (bank transfer, UPI or cheque).

## Who does what

| Actor | Can |
|---|---|
| **Platform operator** (active `SUPER_ADMIN` listed in `PLATFORM_OPERATOR_EMAILS`) | Set a college's plan, seats, price and period. Issue invoices. Mark them paid or void. Page: `/admin/institutions` → **Billing**. |
| **College administrator** (`institution:manage`) | Read their own plan and invoices, and download the PDFs. Page: Settings → **Plan & invoices**. |
| **Everyone else** | Nothing. Another college's invoice returns 404. |

The demo college and personal workspaces are never billable.

## Plans and prices

The plans are Pilot, Starter, Professional and Enterprise/Group.

- **Prices are set per college.** CampusOS has no list price.
- **The suggested ranges on the form are hypotheses:**
  - Starter: ₹150–300 per student per year;
  - Professional: ₹300–600 per student per year.

  They are from the strategy audit (§26) and have not been validated with customers. Do not present them as market prices.
- **Saving a plan also sets the college's tier.** A pilot counts as Professional, so the modules on that tier work during the pilot.

## Invoices

- **Numbering:** `CO/<financial year>/<sequence>`, for example `CO/2026-27/0001`. It is sequential and gap-free per Indian financial year (April to March), even when invoices are issued at the same time (advisory lock plus a unique index). Set the prefix with `BILLING_INVOICE_PREFIX`.
- **Amounts:**
  - Money is stored in paise.
  - `total = subtotal + tax`, enforced by a database CHECK.
- **Snapshots:** the seller and buyer details are stored as they were at issue.
- **Status:** `ISSUED` → `PAID` (with an optional payment reference) or `VOID` (with a required reason). Each invoice changes status once. Every step is audited (`INVOICE_ISSUED`, `INVOICE_STATUS_CHANGED`).
- **PDF:** A4, generated with `pdf-lib`. It is titled **"Tax Invoice" only when `BILLING_SELLER_GSTIN` is configured**; otherwise it is titled "Invoice".

## Tax: needs an accountant

CampusOS does **not** decide GST treatment.

- The operator enters the GST rate and SAC code for each invoice. The default rate comes from `BILLING_DEFAULT_GST_PERCENT`, or 0 if that isn't set.
- Before charging GST, confirm with a chartered accountant:
  - whether you must register;
  - the correct rate and SAC code for this service;
  - the place-of-supply rules (IGST or CGST+SGST);
  - whether any education-sector exemption applies.
- The PDF does not split CGST/SGST/IGST yet. Add that once the treatment is confirmed.

**Status: BLOCKED on professional advice.** This blocks tax claims, not invoicing.

## Configuration

| Variable | Purpose |
|---|---|
| `BILLING_SELLER_NAME`, `BILLING_SELLER_ADDRESS`, `BILLING_SELLER_EMAIL`, `BILLING_SELLER_STATE` | Seller block on invoices |
| `BILLING_SELLER_GSTIN` | Your GSTIN. Its presence turns invoices into "Tax Invoice". |
| `BILLING_DEFAULT_GST_PERCENT` | Default rate on the invoice form (0 if not set) |
| `BILLING_INVOICE_PREFIX` | Invoice number prefix (default `CO`) |
