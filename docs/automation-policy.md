# Automation Policy (BlackBolt 1.0 Locked)

## Trigger Scope
- Trigger only on newly ingested review where:
  - rating is `5`
  - classification is `genuine_positive`

## Deterministic Confidence Formula
- `+0.4` rating is 5
- `+0.2` review length > 20 words
- `+0.2` no risk flags
- `+0.2` service mentioned present

## Approval Gate
- Default auto-send threshold: `>= 0.8`
- Strict vertical threshold: `>= 0.9`
- Any risk flag forces manual lane

## Segment Policy
- Default mode: `last_seen_90_365`
- Volume mode: includes `365_plus`
- Gentle mode: uses `0_90`

## Send Window + Template Constraints
- Default send window: next business day at `10:00` local policy time
- Template selection is deterministic by hash rotation (`reviewId % N`)
- Use constrained template structure only (no freeform drift)

## Safety Constraints
- No PHI storage
- No medical claims in generated copy
- `POSTMARK_SEND_DISABLED=1` remains active until final go-live gate
