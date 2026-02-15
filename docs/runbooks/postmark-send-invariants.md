# Postmark Send Invariant Breach Runbook

## Trigger
- Operator summary shows invariant code `POSTMARK_SEND_SENT_WITHOUT_PROVIDER_ID`.
- This indicates `campaign_messages.delivery_state = 'SENT'` while `provider_message_id IS NULL`.

## Severity
- High. Treat as data integrity incident.

## Immediate Actions
1. Pause tenant send path (`/v1/tenants/{tenantId}/integrations/postmark/resume` must remain disabled until resolved).
2. Stop any manual retries for affected campaign messages.
3. Capture latest worker logs around claim/send transitions.

## Verify Scope
Run read-only query:

```sql
SELECT id, tenant_id, status, delivery_state, provider_message_id, claimed_at, send_attempt, created_at
FROM campaign_messages
WHERE delivery_state = 'SENT' AND provider_message_id IS NULL
ORDER BY created_at DESC;
```

## What Not To Do
- Do **not** manually mark rows as `SENT` or `DELIVERED` without provider evidence.
- Do **not** replay sends until root cause is fixed and state is corrected.
- Do **not** clear integration alerts before incident notes are recorded.

## Recovery
1. Root-cause worker/order issue and patch.
2. Reconcile affected rows via provider evidence.
3. Resolve alert with incident reference.
4. Re-enable sends only after smoke tests pass.
