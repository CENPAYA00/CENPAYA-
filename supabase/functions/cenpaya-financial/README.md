# Cenpaya Financial Edge Function

New, isolated financial event ingress. The legacy `initiate-service-payment-` and
`Payment-Webhook-` functions are not imported, modified, or called.

## Route

- `POST /functions/v1/cenpaya-financial/v1/internal/order-events`
  - Accepts signed, timestamped financial order events.
  - Verifies HMAC-SHA256 over `<timestamp>.<raw-request-body>`.
  - Rejects timestamps outside a five-minute window.
  - Forwards the validated event to the D1 Worker internal event endpoint.
  - Returns 503 on forwarding failure so the sender can retry.

## Required function secrets

- `FINANCIAL_WEBHOOK_SECRET`: random high-entropy secret shared with the trusted financial event producer.
- `D1_WORKER_URL`: base URL of the D1 Worker.
- `D1_INTERNAL_CALL_SECRET`: same high-entropy secret configured on the D1 Worker.
- `FINANCIAL_ALLOWED_ORIGIN`: exact frontend origin, if browser access is later added.

## Signature

Headers:
- `x-cenpaya-timestamp`: Unix seconds (or milliseconds).
- `x-cenpaya-signature`: `sha256=<hex HMAC>`.

The signed message is `<timestamp>.<exact raw JSON body>`.

## Event contract

The event body must match the D1 Worker's `/internal/v1/marketplace/order-events`
contract: `event_id`, `event_type`, `order_id`, `buyer_id`, `seller_id`,
`order_type`, and `financial_status`, with optional `listing_id`.

## Important scope

This first function establishes the new authenticated event boundary and D1
synchronization. It does not initiate charges, select a payment provider, settle
escrow, or refund funds. Those provider-specific operations must be implemented
against the chosen payment rails and the current financial SQL/RPC contract before
this function is deployed for live transactions.
