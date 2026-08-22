# Zephyr CRM money contract

This is the v1.3.1 money authority. PostgreSQL `numeric` values and decimal
strings are authoritative; JavaScript floating point and browser totals are not.

| Value | Scale | v1 rule |
| --- | ---: | --- |
| quantity | 4 | non-negative; line multiplication retains exact decimal input before rounding |
| unit price | 4 | non-negative; currency boundary is the configured ISO currency |
| tax rate | 6 | non-negative and no greater than 100 |
| line subtotal | 2 | `ROUND_HALF_UP(quantity × unit_price)` |
| quote subtotal | 2 | sum of already-rounded line subtotals |
| tax amount | 2 | `ROUND_HALF_UP(taxable subtotal × tax rate / 100)` |
| total | 2 | subtotal plus rounded tax amount |

The database validates scale, sign, currency, item presence and server-owned
totals. A quote cannot become `ready` or `sent` from client-supplied totals.
Negative v1 quantities, prices, tax rates and amounts are rejected. Zero is
valid where the contract permits it. Sent quote values are immutable and all
later documents use the stored commercial snapshot.

The document generator renders quantities at four places and tax rates at six
places, while monetary amounts are rendered at two places. Quote revisions are
new drafts and never overwrite a sent commercial record.
