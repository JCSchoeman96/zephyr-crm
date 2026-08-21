# Transactional email authentication readiness

Zephyr sends one-to-one quote messages through the project-owned SendPulse transactional adapter. It does not implement campaigns, bulk mail, or an email-template builder.

Before a client deployment is considered ready for the post-build pilot, the client-owned sender domain must have:

- a verified sender identity in SendPulse;
- the exact SPF record supplied for that SendPulse account, published at the domain apex without replacing unrelated SPF mechanisms;
- the exact DKIM selector and public key supplied by SendPulse, published at `<selector>._domainkey.<sender-domain>`;
- a DMARC record at `_dmarc.<sender-domain>` with an explicitly chosen policy, reporting destination, and alignment reviewed by the client;
- a verified branded tracking domain if tracking links are enabled.

The values are deployment inputs, not universal constants. Store the reviewed values in the ignored trusted environment file using `SENDPULSE_SENDER_EMAIL`, `SENDPULSE_SENDER_DOMAIN`, `SENDPULSE_DKIM_SELECTOR`, `SENDPULSE_SPF_RECORD`, `SENDPULSE_DKIM_RECORD`, and `SENDPULSE_DMARC_RECORD`. Set `SENDPULSE_DOMAIN_AUTHENTICATED=true` only after the pilot/deployment operator has checked DNS and SendPulse sender verification. Local tests deliberately fail this readiness check when these values are absent; they do not query or claim live DNS proof.

Pilot verification procedure:

1. Confirm the sender address and domain are owned by the client.
2. Copy the current SPF/DKIM instructions from the client’s SendPulse account and publish them with the DNS owner.
3. Publish a reviewed DMARC policy and reporting address.
4. Wait for DNS propagation, then verify records from an independent resolver and in SendPulse.
5. Record the verification time, resolver evidence, sender identity, and operator in the post-build pilot record.
6. Run a single approved test send and compare provider submission, delivery, bounce, open, and click observations without treating open/click as proof of reading.

Live DNS mutation, provider-account changes, and pilot observation are outside this local implementation loop.
