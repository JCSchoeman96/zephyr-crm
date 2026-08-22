# Zephyr CRM privacy operations contract

The client is the Responsible Party for its customer information. The operator
acts only under the client's documented instructions and records the named
privacy owner, operations administrator, subprocessors, cross-border review,
retention decision, and incident contacts in the client handoff.

Operational controls:

- collect only fields required for enquiry, quoting, delivery, audit and support;
- restrict access through invitation-only Auth, profile status, RLS and current
  Owner/Admin AAL2 for privileged actions;
- process data-subject access, correction, export and approved deletion requests
  through a named operator with an evidence record;
- preserve legally required audit evidence without using ordinary history edits
  as a deletion shortcut;
- define retention for live data, Activity, provider events, documents and
  encrypted backup sets, including how deletion/anonymisation ages out of
  retained backups;
- escalate suspected incidents, contain and rotate secrets, preserve redacted
  evidence, assess cross-border/subprocessor impact, and apply the client's
  POPIA/legal notification procedure;
- keep private documents and provider credentials out of browser bundles,
  client configuration and logs.

This local release candidate documents the operational contract but does not
claim a hosted legal assessment, client appointment, live sender verification,
or production incident readiness.
