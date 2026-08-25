# Client Management Contract

Phase 6 makes the distinction between a Lead and a Client durable. A website enquiry remains a Lead until an authenticated Owner, Admin, or Sales user deliberately converts an eligible Decision Lead. The P14 hardening amendment makes the post-conversion lifecycle and maintenance boundary explicit.

## Client identity

The Client schema supports `individual` and `company` records, client numbering, display and company names, contact fields, tax and registration identifiers, split billing-address fields, `active`/`inactive`/`archived` status, source Lead linkage, conversion time, and audit timestamps. Company records require a non-empty company name; individual records do not carry a company name. Optional identity and address fields reject whitespace-only values.

The existing legacy `billing_address` column remains readable for compatibility while its value is copied into `billing_address_line_1` during migration. New code uses the split billing-address fields.

## Contacts

`client_contacts` supports multiple contacts per Client. The partial unique index `client_contacts_one_primary_idx` allows at most one primary contact for a Client. Conversion creates the source Lead contact as the primary contact; additional contacts remain possible without collapsing people into one record.

## Conversion and duplicate strategy

`convert_lead` is the single trusted operation. It locks and validates the Lead, creates one Client and primary contact, links and marks the Lead Won, cancels open Lead tasks, and appends `client_created` and `lead_won` Activity rows in one PostgreSQL transaction. A repeated conversion of the same Won Lead returns the original Client and does not create another contact.

The deterministic duplicate boundary is `source_lead_id`. Email, phone, name, and company are copied as data but are never used alone to merge customers. Two distinct Leads with the same email therefore remain two distinct conversion candidates and Clients.

The source Lead and its existing Activity history are never deleted or rewritten as part of conversion. The Client detail view exposes the source Lead link, contacts, Client-scoped Activity, and conversion evidence.

## Post-conversion lifecycle

There is no generic Client creation, email merge, or implicit conversion. Client
identity/billing edits use `update_client_details` with `lock_version`; status
uses `set_client_status`. `active ↔ inactive` is available to active Sales,
Owner, and Admin staff. Archive requires Owner/Admin, a reason, and no open
Task or non-terminal Quote through the Client or source-Lead lineage. Restore is
`archived → inactive` with a reason; archived Clients are read-only and cannot
be deleted.

ClientContact uses `active ↔ inactive`, retains history, and is maintained by
trusted contact actions. An inactive contact cannot be primary; primary changes
are atomic and concurrency-checked. No ordinary UI or Data API path hard-deletes
a contact.
