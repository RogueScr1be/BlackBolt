import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const specPath = resolve(process.cwd(), 'contracts/openapi/blackbolt.v1.yaml');
const spec = readFileSync(specPath, 'utf8');

function fail(message) {
  console.error(`[check-postmark-invariants-contract] ERROR: ${message}`);
  process.exit(1);
}

if (!/PostmarkOperatorSummaryResponse:[\s\S]*?invariants:[\s\S]*?required:\s*\[\s*breaches\s*\]/m.test(spec)) {
  fail('invariants.breaches must remain required.');
}

if (/invariants:[\s\S]*?required:\s*\[[^\]]*sendStateBreach[^\]]*\]/m.test(spec)) {
  fail('sendStateBreach must not be required.');
}

if (!/sendStateBreach:[\s\S]*?deprecated:\s*true/m.test(spec)) {
  fail('sendStateBreach must remain deprecated: true.');
}

if (!/PostmarkInvariantBreach:[\s\S]*?code:[\s\S]*?enum:\s*[\s\S]*?POSTMARK_SEND_SENT_WITHOUT_PROVIDER_ID[\s\S]*?POSTMARK_SEND_STUCK_SENDING_WITHOUT_PROVIDER_ID/m.test(spec)) {
  fail('PostmarkInvariantBreach.code must remain enum-backed with required invariant codes.');
}

console.log('[check-postmark-invariants-contract] OK');
