import { createHash } from 'node:crypto';

export type ReactivationSegmentMode = 'default' | 'volume' | 'gentle';
export type ReactivationSegmentLabel = 'last_seen_90_365' | 'volume' | 'gentle';
export type CustomerSegmentValue = 'SEGMENT_0_90' | 'SEGMENT_90_365' | 'SEGMENT_365_PLUS';

const APPROVED_SUBJECT_VARIANTS = [
  'A quick thank-you from our team',
  'We appreciated your 5-star review',
  'Thanks for sharing your experience'
];
const TRUST_SIGNAL_VARIANTS = [
  'Thank you for sharing thoughtful feedback about your experience with our team.',
  'Your recent review highlighted what patients value most about our care.',
  'We appreciate your 5-star feedback and the trust it reflects.'
];
const CTA_VARIANTS = ['Book your next visit', 'Schedule your follow-up', 'Plan your next appointment'];

const DISALLOWED_PATTERNS: Array<[string, RegExp]> = [
  ['hype_sales_claim', /\b(amazing deal|limited time|buy now|best ever|guaranteed result|miracle)\b/i],
  ['emoji', /\p{Extended_Pictographic}/u],
  ['unsafe_compliance', /\b(hipaa|fda approved|medical guarantee|cure all)\b/i]
];

export function segmentLabelToMode(value: string | null | undefined): ReactivationSegmentMode {
  if (value === 'volume' || value === 'gentle') {
    return value;
  }
  return 'default';
}

export function segmentModeToLabel(mode: ReactivationSegmentMode): ReactivationSegmentLabel {
  if (mode === 'volume' || mode === 'gentle') {
    return mode;
  }
  return 'last_seen_90_365';
}

export function segmentsForMode(mode: ReactivationSegmentMode): CustomerSegmentValue[] {
  if (mode === 'gentle') {
    return ['SEGMENT_0_90'];
  }
  if (mode === 'volume') {
    return ['SEGMENT_90_365', 'SEGMENT_365_PLUS'];
  }
  return ['SEGMENT_90_365'];
}

export function parseDraftBody(bodyText: string): { subject: string | null; body: string } {
  const normalized = bodyText.replace(/\r\n/g, '\n');
  const subjectMatch = normalized.match(/^Subject:\s*(.+)$/m);
  const subject = subjectMatch ? subjectMatch[1].trim() : null;
  const withoutSubject = normalized.replace(/^Subject:\s*.+\n?/m, '').trim();
  return { subject, body: withoutSubject };
}

export function enforceDraftPolicy(input: { subject: string; body: string }) {
  const rawSubject = input.subject.trim();
  const rawBody = input.body.trim();
  const subject = rawSubject.length > 0 ? rawSubject.slice(0, 120) : APPROVED_SUBJECT_VARIANTS[0];
  const body = rawBody.length > 0 ? rawBody.slice(0, 1500) : 'We would be glad to support your next visit.';
  const merged = `${subject}\n${body}`;
  const blocked = DISALLOWED_PATTERNS.filter(([, pattern]) => pattern.test(merged)).map(([code]) => code);
  return {
    subject,
    body,
    blocked
  };
}

export function composeConstrainedDraft(input: {
  reviewId: string;
  serviceMentioned: string | null;
  keyBenefit: string;
}): {
  subject: string;
  body: string;
  slotSource: 'deterministic_fallback';
  blocked: string[];
} {
  const hash = Number.parseInt(createHash('sha256').update(input.reviewId).digest('hex').slice(0, 8), 16);
  const subject = APPROVED_SUBJECT_VARIANTS[hash % APPROVED_SUBJECT_VARIANTS.length];
  const trustSignal = TRUST_SIGNAL_VARIANTS[hash % TRUST_SIGNAL_VARIANTS.length];
  const cta = CTA_VARIANTS[hash % CTA_VARIANTS.length];

  const serviceLine = `Service relevance: ${input.serviceMentioned ?? 'general care'}.`;
  const softReactivation = `Soft reactivation: ${input.keyBenefit}.`;
  const singleCta = `Single CTA: ${cta}.`;
  const warmClose = 'Warm close: We are here when you are ready.';

  const baseBody = [trustSignal, serviceLine, softReactivation, singleCta, warmClose].join('\n');
  const policy = enforceDraftPolicy({ subject, body: baseBody });

  return {
    subject: policy.blocked.length > 0 ? APPROVED_SUBJECT_VARIANTS[0] : policy.subject,
    body: policy.blocked.length > 0 ? [TRUST_SIGNAL_VARIANTS[0], serviceLine, softReactivation, singleCta, warmClose].join('\n') : policy.body,
    slotSource: 'deterministic_fallback',
    blocked: policy.blocked
  };
}

export function renderDraftBody(input: { subject: string; body: string; linkCode: string }) {
  return `Subject: ${input.subject}\n\n${input.body}\n\nContinue: /v1/links/${input.linkCode}`;
}

export function detectRiskFlags(body: string): string[] {
  const text = body.toLowerCase();
  const rules: Array<[string, RegExp]> = [
    ['medical_claim', /\b(cure|guarantee|always works)\b/],
    ['phi_hint', /\b(ssn|social security|dob|date of birth|mrn)\b/],
    ['legal_risk', /\b(lawsuit|malpractice)\b/]
  ];
  return rules.filter(([, regex]) => regex.test(text)).map(([code]) => code);
}

export function extractServiceMention(body: string): string | null {
  const text = body.toLowerCase();
  const candidates = ['cleaning', 'whitening', 'implant', 'checkup', 'consultation', 'follow-up'];
  for (const candidate of candidates) {
    if (text.includes(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function extractKeyBenefit(body: string): string {
  const text = body.trim();
  if (!text) {
    return 'positive patient feedback';
  }
  const sentence = text
    .split(/[.!?]/)
    .map((item) => item.trim())
    .find((item) => item.length > 0);
  if (!sentence) {
    return 'positive patient feedback';
  }
  return sentence.length > 120 ? `${sentence.slice(0, 117)}...` : sentence;
}

export function calculateConfidence(input: {
  rating: number | null;
  wordCount: number;
  hasRiskFlags: boolean;
  serviceMentioned: string | null;
}): number {
  let confidence = 0;
  if (input.rating === 5) {
    confidence += 0.4;
  }
  if (input.wordCount > 20) {
    confidence += 0.2;
  }
  if (!input.hasRiskFlags) {
    confidence += 0.2;
  }
  if (input.serviceMentioned) {
    confidence += 0.2;
  }
  return Number(confidence.toFixed(4));
}

export function classifyReview(input: { rating: number | null; reviewBody: string | null }) {
  const body = input.reviewBody ?? '';
  const words = body.trim().split(/\s+/).filter(Boolean);
  const riskFlags = detectRiskFlags(body);
  const serviceMentioned = extractServiceMention(body);
  const keyBenefit = extractKeyBenefit(body);
  const confidence = calculateConfidence({
    rating: input.rating,
    wordCount: words.length,
    hasRiskFlags: riskFlags.length > 0,
    serviceMentioned
  });
  const isGenuinePositive = (input.rating ?? 0) === 5 && riskFlags.length === 0;

  return {
    isGenuinePositive,
    riskFlags,
    serviceMentioned,
    keyBenefit,
    confidence
  };
}

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: string;
};

function safeTimeZone(timeZone: string | null | undefined): string {
  const fallback = 'UTC';
  if (!timeZone) {
    return fallback;
  }
  try {
    Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return fallback;
  }
}

function zonedParts(date: Date, timeZone: string): DateParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short'
  });
  const parts = formatter.formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number.parseInt(lookup.year ?? '1970', 10),
    month: Number.parseInt(lookup.month ?? '01', 10),
    day: Number.parseInt(lookup.day ?? '01', 10),
    hour: Number.parseInt(lookup.hour ?? '00', 10),
    minute: Number.parseInt(lookup.minute ?? '00', 10),
    second: Number.parseInt(lookup.second ?? '00', 10),
    weekday: lookup.weekday ?? 'Mon'
  };
}

function localDateTimeToUtc(timeZone: string, year: number, month: number, day: number, hour: number, minute: number): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const guessDate = new Date(guess);
  const local = zonedParts(guessDate, timeZone);
  const localAsUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
  const offset = localAsUtc - guess;
  return new Date(guess - offset);
}

function localWeekday(timeZone: string, year: number, month: number, day: number): string {
  const utc = localDateTimeToUtc(timeZone, year, month, day, 12, 0);
  return zonedParts(utc, timeZone).weekday;
}

export function nextBusinessDayAt10Local(input: { timeZone?: string | null; from?: Date }): Date {
  const timeZone = safeTimeZone(input.timeZone);
  const now = input.from ?? new Date();
  const nowParts = zonedParts(now, timeZone);
  const cursor = new Date(Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day, 0, 0, 0));
  cursor.setUTCDate(cursor.getUTCDate() + 1);

  while (true) {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth() + 1;
    const day = cursor.getUTCDate();
    const weekday = localWeekday(timeZone, year, month, day);
    if (weekday !== 'Sat' && weekday !== 'Sun') {
      return localDateTimeToUtc(timeZone, year, month, day, 10, 0);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
}
