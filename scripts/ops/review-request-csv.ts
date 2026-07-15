#!/usr/bin/env ts-node
const { createHmac } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('csv-parse/sync');
const { PrismaClient } = require('@prisma/client');

type Status = 'PASS' | 'WARN' | 'FAIL';

type CsvRecord = Record<string, string>;

type CandidateRow = {
  sourceFile: string;
  rowNum: number;
  email: string;
  firstName: string | null;
};

type SelectedRow = CandidateRow & {
  recipientFingerprint: string;
};

type ParsedCsvFile = {
  sourceFile: string;
  headers: string[];
  totalRows: number;
  validRows: CandidateRow[];
  duplicateRows: number;
  invalidRows: number;
};

type SuppressionInfo = {
  reason: string;
  source: 'suppression_entry' | 'customer_suppression';
};

type SendPathCounts = {
  customer: number;
  campaign: number;
  campaignRun: number;
  campaignMessage: number;
  draftMessage: number;
  approvalItem: number;
  linkCode: number;
  sendEvent: number;
};

type RenderedMessage = {
  firstNameMasked: string;
  subject: string;
  textBody: string;
  htmlBody: string;
};

type Options = {
  csvPaths: string[];
  tenantId: string;
  googleReviewLink: string;
  fromEmail: string;
  businessAddress: string;
  triggerType: string;
  live: boolean;
  confirmLive: string | null;
  batchKey: string | null;
  limit: number | null;
};

const DEFAULT_TRIGGER_TYPE = 'manual_replay_last_3_reviews';

function fail(message: string): never {
  throw new Error(message);
}

function readArgs(argv: string[]): Options {
  const csvPaths: string[] = [];
  const out: Partial<Options> = {
    live: false,
    confirmLive: null,
    batchKey: null,
    limit: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }

    const [flag, inlineValue] = token.split('=', 2);
    const readValue = (): string => {
      if (inlineValue !== undefined) {
        return inlineValue;
      }

      const next = argv[index + 1];
      if (!next || next.startsWith('--')) {
        fail(`Missing value for ${flag}`);
      }
      index += 1;
      return next;
    };

    switch (flag) {
      case '--csv':
        csvPaths.push(readValue());
        break;
      case '--tenant-id':
        out.tenantId = readValue();
        break;
      case '--google-review-link':
        out.googleReviewLink = readValue();
        break;
      case '--from-email':
        out.fromEmail = readValue();
        break;
      case '--business-address':
        out.businessAddress = readValue();
        break;
      case '--trigger-type':
        out.triggerType = readValue();
        break;
      case '--live':
        out.live = true;
        break;
      case '--confirm-live':
        out.confirmLive = readValue();
        break;
      case '--batch-key':
        out.batchKey = readValue();
        break;
      case '--limit': {
        const parsed = Number.parseInt(readValue(), 10);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          fail(`Invalid --limit value: ${inlineValue ?? argv[index]}`);
        }
        out.limit = parsed;
        break;
      }
      default:
        fail(`Unknown flag: ${flag}`);
    }
  }

  if (csvPaths.length === 0) {
    fail('At least one --csv path is required');
  }

  const tenantId = out.tenantId?.trim();
  const googleReviewLink = out.googleReviewLink?.trim();
  const fromEmail = out.fromEmail?.trim();
  const businessAddress = out.businessAddress?.trim();
  const triggerType = out.triggerType?.trim() ?? DEFAULT_TRIGGER_TYPE;

  if (!tenantId) {
    fail('--tenant-id is required');
  }
  if (!googleReviewLink) {
    fail('--google-review-link is required');
  }
  if (!fromEmail) {
    fail('--from-email is required');
  }
  if (!businessAddress) {
    fail('--business-address is required');
  }
  if (triggerType !== DEFAULT_TRIGGER_TYPE) {
    fail(`--trigger-type must be ${DEFAULT_TRIGGER_TYPE}`);
  }

  if (out.live) {
    if (out.confirmLive !== 'SOS-R11B') {
      fail('--confirm-live SOS-R11B is required for live mode');
    }
    if (!out.batchKey) {
      fail('--batch-key is required for live mode');
    }
    if (!out.limit) {
      fail('--limit is required for live mode');
    }
    if (out.limit > 25) {
      fail('--limit must be <= 25 for live mode');
    }
  }

  validateEmail(fromEmail, 'from-email');
  validateUrl(googleReviewLink, 'google-review-link');

  return {
    csvPaths,
    tenantId,
    googleReviewLink,
    fromEmail,
    businessAddress,
    triggerType,
    live: Boolean(out.live),
    confirmLive: out.confirmLive ?? null,
    batchKey: out.batchKey ?? null,
    limit: out.limit ?? null
  };
}

function validateEmail(value: string, fieldName: string): void {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fail(`Invalid ${fieldName}: ${value}`);
  }
}

function validateUrl(value: string, fieldName: string): void {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      fail(`Invalid ${fieldName}: ${value}`);
    }
  } catch {
    fail(`Invalid ${fieldName}: ${value}`);
  }
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function cleanValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase();
}

function maskName(value: string | null): string {
  if (!value) {
    return 'there';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return 'there';
  }

  return `${trimmed.slice(0, 1)}***`;
}

function maskEmail(value: string): string {
  const [localPart, domainPart = ''] = value.split('@');
  const localMasked = localPart.length <= 2 ? `${localPart[0] ?? '*'}***` : `${localPart.slice(0, 2)}***`;
  const [domainHead = '', ...domainTail] = domainPart.split('.');
  const domainMasked = domainHead.length <= 1 ? `${domainHead || '*'}***` : `${domainHead.slice(0, 1)}***`;
  const suffix = domainTail.length > 0 ? `.${domainTail.join('.')}` : '';
  return `${localMasked}@${domainMasked}${suffix}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderMessage(input: {
  firstName: string | null;
  googleReviewLink: string;
  businessAddress: string;
}): RenderedMessage {
  const firstName = input.firstName?.trim().length ? input.firstName.trim() : 'there';
  const subject = 'Would you share your SOS Lactation experience?';
  const textBody = [
    `Hi ${firstName},`,
    '',
    'Thank you for trusting SOS Lactation.',
    '',
    'If SOS Lactation helped you, would you be willing to leave a quick Google review?',
    '',
    input.googleReviewLink,
    '',
    'If there is anything we could have done better, you can reply directly to this email.',
    '',
    'Thank you,',
    'SOS Lactation',
    input.businessAddress,
    '',
    'To stop receiving these messages, reply with “unsubscribe”.'
  ].join('\n');

  const htmlBody = [
    `<p>Hi ${escapeHtml(firstName)},</p>`,
    '<p>Thank you for trusting SOS Lactation.</p>',
    '<p>If SOS Lactation helped you, would you be willing to leave a quick Google review?</p>',
    `<p><a href="${escapeHtml(input.googleReviewLink)}">${escapeHtml(input.googleReviewLink)}</a></p>`,
    '<p>If there is anything we could have done better, you can reply directly to this email.</p>',
    '<p>Thank you,<br>SOS Lactation</p>',
    `<p>${escapeHtml(input.businessAddress).replace(/\n/g, '<br>')}</p>`,
    '<p>To stop receiving these messages, reply with “unsubscribe”.</p>'
  ].join('');

  return {
    firstNameMasked: maskName(firstName),
    subject,
    textBody,
    htmlBody
  };
}

function extractEmailAddress(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/<([^>]+)>/);
  return normalizeEmail(match?.[1] ?? trimmed);
}

function buildRecipientFingerprint(input: {
  tenantId: string;
  recipientEmail: string;
}): string {
  const secret = process.env.REVIEW_REQUEST_FINGERPRINT_SECRET?.trim();
  if (!secret) {
    fail('REVIEW_REQUEST_FINGERPRINT_SECRET is required for live mode');
  }

  return createHmac('sha256', secret).update(`${input.tenantId}:${normalizeEmail(input.recipientEmail)}`).digest('hex');
}

function requireEnvValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    fail(`${name} is required`);
  }
  return value;
}

async function getSendPathCounts(prisma: any, tenantId: string): Promise<SendPathCounts> {
  const [
    customer,
    campaign,
    campaignRun,
    campaignMessage,
    draftMessage,
    approvalItem,
    linkCode,
    sendEvent
  ] = await Promise.all([
    prisma.customer.count({ where: { tenantId } }),
    prisma.campaign.count({ where: { tenantId } }),
    prisma.campaignRun.count({ where: { tenantId } }),
    prisma.campaignMessage.count({ where: { tenantId } }),
    prisma.draftMessage.count({ where: { tenantId } }),
    prisma.approvalItem.count({ where: { tenantId } }),
    prisma.linkCode.count({ where: { tenantId } }),
    prisma.sendEvent.count({ where: { tenantId } })
  ]);

  return {
    customer,
    campaign,
    campaignRun,
    campaignMessage,
    draftMessage,
    approvalItem,
    linkCode,
    sendEvent
  };
}

function sendPathCountsAreZero(counts: SendPathCounts): boolean {
  return Object.values(counts).every((count) => count === 0);
}

async function sendReviewRequestEmail(input: {
  tenantId: string;
  batchKey: string;
  recipientFingerprint: string;
  toEmail: string;
  firstName: string | null;
  googleReviewLink: string;
  businessAddress: string;
}): Promise<{ providerMessageId: string }> {
  const token = requireEnvValue('POSTMARK_SERVER_TOKEN');
  const from = requireEnvValue('POSTMARK_FROM');
  const body = renderMessage({
    firstName: input.firstName,
    googleReviewLink: input.googleReviewLink,
    businessAddress: input.businessAddress
  });

  const response = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Postmark-Server-Token': token
    },
    body: JSON.stringify({
      From: from,
      To: input.toEmail,
      Subject: body.subject,
      TextBody: body.textBody,
      HtmlBody: body.htmlBody,
      Metadata: {
        tenantId: input.tenantId,
        batchKey: input.batchKey,
        recipientFingerprint: input.recipientFingerprint,
        triggerType: DEFAULT_TRIGGER_TYPE,
        sourceReviewCount: '3'
      }
    })
  });

  const responseText = await response.text();
  let responseJson: { MessageID?: string; Message?: string } = {};
  if (responseText.trim().length > 0) {
    try {
      responseJson = JSON.parse(responseText) as { MessageID?: string; Message?: string };
    } catch {
      responseJson = {};
    }
  }

  if (response.status >= 500) {
    throw new Error(`Postmark provider error (${response.status})`);
  }

  if (!response.ok) {
    const errorMessage = responseJson.Message?.trim() || `Postmark send failed (${response.status})`;
    throw new Error(errorMessage);
  }

  const providerMessageId = responseJson.MessageID?.trim() || `postmark-missing-message-id-${Date.now()}`;
  return { providerMessageId };
}

function formatColumns(headers: string[]): string {
  return headers.length > 0 ? headers.join(', ') : 'n/a';
}

function parseCsvFile(sourceFile: string): ParsedCsvFile {
  const fileBuffer = fs.readFileSync(sourceFile);
  const csvText = fileBuffer.toString('utf8');
  const rows = parse(csvText, {
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true
  }) as string[][];

  if (rows.length === 0) {
    fail(`CSV file is empty: ${sourceFile}`);
  }

  const headers = rows[0].map((value) => cleanValue(value));
  const normalizedHeaders = headers.map(normalizeHeader);
  if (!normalizedHeaders.includes('email')) {
    fail(`CSV missing required column: email (${sourceFile})`);
  }

  const validRows: CandidateRow[] = [];
  const seenEmails = new Set<string>();
  let duplicateRows = 0;
  let invalidRows = 0;

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const record: CsvRecord = {};
    headers.forEach((header, columnIndex) => {
      record[normalizeHeader(header)] = cleanValue(row[columnIndex] ?? '');
    });

    const rowNum = rowIndex + 1;
    const email = normalizeEmail(record.email ?? '');
    const firstName =
      cleanValue(record.first_name) ||
      cleanValue(record.mothers_name_first) ||
      cleanValue(record.mother_name) ||
      null;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      invalidRows += 1;
      continue;
    }

    if (seenEmails.has(email)) {
      duplicateRows += 1;
      continue;
    }

    seenEmails.add(email);
    validRows.push({
      sourceFile,
      rowNum,
      email,
      firstName
    });
  }

  return {
    sourceFile,
    headers,
    totalRows: Math.max(0, rows.length - 1),
    validRows,
    duplicateRows,
    invalidRows
  };
}

async function loadSuppressions(tenantId: string, emails: string[], requireAvailable: boolean) {
  if (!process.env.DATABASE_URL?.trim()) {
    if (requireAvailable) {
      fail('DATABASE_URL is required for live mode');
    }
    return {
      available: false,
      suppressed: new Map<string, SuppressionInfo>()
    };
  }

  const prisma = new PrismaClient();
  try {
    const [customers, suppressionEntries] = await Promise.all([
      prisma.customer.findMany({
        where: {
          tenantId,
          email: { in: emails }
        },
        select: {
          email: true,
          suppressions: {
            where: { isActive: true },
            select: {
              kind: true,
              reason: true
            }
          }
        }
      }),
      prisma.suppressionEntry.findMany({
        where: {
          tenantId,
          email: { in: emails },
          active: true
        },
        select: {
          email: true,
          reason: true
        }
      })
    ]);

    const suppressed = new Map<string, SuppressionInfo>();
    for (const row of customers) {
      if (row.suppressions.length > 0) {
        suppressed.set(row.email, {
          reason: row.suppressions
            .map((suppression: { kind: string; reason: string | null }) => suppression.kind)
            .join(', '),
          source: 'customer_suppression'
        });
      }
    }

    for (const row of suppressionEntries) {
      suppressed.set(row.email, {
        reason: row.reason?.trim() || 'active suppression entry',
        source: 'suppression_entry'
      });
    }

    return {
      available: true,
      suppressed
    };
  } catch {
    if (requireAvailable) {
      fail('Suppression lookup failed in live mode');
    }
    return {
      available: false,
      suppressed: new Map<string, SuppressionInfo>()
    };
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

async function main() {
  const options = readArgs(process.argv.slice(2));
  const parsedFiles = options.csvPaths.map((filePath) => {
    const absolute = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(absolute)) {
      fail(`CSV file not found: ${filePath}`);
    }
    return parseCsvFile(absolute);
  });

  const totalRows = parsedFiles.reduce((sum, file) => sum + file.totalRows, 0);
  const duplicateRows = parsedFiles.reduce((sum, file) => sum + file.duplicateRows, 0);
  const invalidRows = parsedFiles.reduce((sum, file) => sum + file.invalidRows, 0);

  const candidateRows: CandidateRow[] = [];
  for (const file of parsedFiles) {
    candidateRows.push(...file.validRows);
  }

  const dedupedRows: CandidateRow[] = [];
  const globalSeenEmails = new Set<string>();
  let crossFileDuplicateRows = 0;
  for (const row of candidateRows) {
    if (globalSeenEmails.has(row.email)) {
      crossFileDuplicateRows += 1;
      continue;
    }
    globalSeenEmails.add(row.email);
    dedupedRows.push(row);
  }

  const suppressionLookup = await loadSuppressions(options.tenantId, dedupedRows.map((row) => row.email), options.live);

  const sendableRows: CandidateRow[] = [];
  let suppressedRows = 0;

  for (const row of dedupedRows) {
    const suppression = suppressionLookup.suppressed.get(row.email);
    if (suppression) {
      suppressedRows += 1;
      continue;
    }
    sendableRows.push(row);
  }

  const renderedSamples = sendableRows.slice(0, options.live ? 10 : 3).map((row) => {
    const rendered = renderMessage({
      firstName: options.live ? row.firstName : maskName(row.firstName),
      googleReviewLink: options.googleReviewLink,
      businessAddress: options.businessAddress
    });
    return {
      emailMasked: maskEmail(row.email),
      firstNameMasked: rendered.firstNameMasked,
      subject: rendered.subject,
      textBody: rendered.textBody,
      htmlBody: rendered.htmlBody
    };
  });

  if (!options.live) {
    const status: Status =
      candidateRows.length > 0 && sendableRows.length > 0
        ? suppressionLookup.available && duplicateRows === 0 && crossFileDuplicateRows === 0 && invalidRows === 0 && suppressedRows === 0
          ? 'PASS'
          : 'WARN'
        : 'WARN';

    const reason =
      status === 'PASS'
        ? 'dry-run completed with sendable recipients and no skips'
        : sendableRows.length === 0
          ? 'dry-run completed but no sendable recipients remained after validation'
          : suppressionLookup.available
            ? 'dry-run completed with duplicates, invalid rows, suppressed rows, or review needed'
            : 'dry-run completed without database suppression lookup';

    const nextAction =
      sendableRows.length >= 10
        ? 'Choose a 10-25 recipient live-send slice for R11B and confirm the footer/copy manually before enabling sends.'
        : 'Select the first 10-25 compliant recipients for R11B, then re-check suppression, footer, and copy before any live send.';

    console.log(`[review-request] status=${status}`);
    console.log(`[review-request] reason=${reason}`);
    console.log(`[review-request] next_action=${nextAction}`);
    console.log(`[review-request] tenant_id=${options.tenantId}`);
    console.log(`[review-request] trigger_type=${options.triggerType}`);
    console.log(`[review-request] csv_files=${options.csvPaths.join(' | ')}`);
    for (const file of parsedFiles) {
      console.log(`[review-request] csv_file=${file.sourceFile}`);
      console.log(`[review-request] csv_rows=${file.totalRows}`);
      console.log(`[review-request] csv_columns=${formatColumns(file.headers)}`);
    }
    console.log(`[review-request] rows_total=${totalRows}`);
    console.log(`[review-request] valid_recipient_count=${sendableRows.length}`);
    console.log(`[review-request] skipped_duplicate_count=${duplicateRows + crossFileDuplicateRows}`);
    console.log(`[review-request] skipped_duplicate_cross_file_count=${crossFileDuplicateRows}`);
    console.log(`[review-request] skipped_invalid_count=${invalidRows}`);
    console.log(`[review-request] skipped_suppressed_count=${suppressedRows}`);
    console.log(`[review-request] suppression_lookup=${suppressionLookup.available ? 'available' : 'skipped'}`);
    console.log(`[review-request] from_email=${maskEmail(options.fromEmail)}`);
    console.log(`[review-request] google_review_link=${options.googleReviewLink}`);
    console.log(`[review-request] business_address=${options.businessAddress}`);

    if (renderedSamples.length === 0) {
      console.log('[review-request] sample[none]=no sendable recipients after validation');
    } else {
      renderedSamples.forEach((sample, index) => {
        const sampleNumber = index + 1;
        console.log(`[review-request] sample[${sampleNumber}].email=${sample.emailMasked}`);
        console.log(`[review-request] sample[${sampleNumber}].first_name=${sample.firstNameMasked}`);
        console.log(`[review-request] sample[${sampleNumber}].subject=${sample.subject}`);
        console.log(`[review-request] sample[${sampleNumber}].text=${sample.textBody}`);
        console.log(`[review-request] sample[${sampleNumber}].html=${sample.htmlBody}`);
      });
    }

    console.log('[review-request] live_send=false');
    console.log('[review-request] send_path_mutation=false');

    process.exitCode = 0;
    return;
  }

  if (process.env.REVIEW_REQUEST_SEND_ENABLED !== '1') {
    fail('REVIEW_REQUEST_SEND_ENABLED=1 is required for live mode');
  }
  if (process.env.POSTMARK_SEND_DISABLED?.trim() !== '1') {
    fail('POSTMARK_SEND_DISABLED must remain 1 for live mode');
  }
  if (process.env.REVIEW_ALERT_INBOUND_ENABLED?.trim() !== '0') {
    fail('REVIEW_ALERT_INBOUND_ENABLED must remain 0 for live mode');
  }
  if (!suppressionLookup.available) {
    fail('Live mode requires database suppression lookup');
  }

  const fromEmailApproved = extractEmailAddress(requireEnvValue('POSTMARK_FROM'));
  if (fromEmailApproved !== normalizeEmail(options.fromEmail)) {
    fail('POSTMARK_FROM must match --from-email for live mode');
  }

  const prisma = new PrismaClient();
  const sendPathCounts = await getSendPathCounts(prisma, options.tenantId);
  if (!sendPathCountsAreZero(sendPathCounts)) {
    await prisma.$disconnect().catch(() => undefined);
    fail('Send-path tables must remain zero before live review-request sends');
  }

  if (sendableRows.length < options.limit!) {
    fail(`Only ${sendableRows.length} eligible recipients available; live mode requires at least ${options.limit}`);
  }

  const selectedRows = sendableRows.slice(0, options.limit!);
  const selectedManifest = selectedRows.map((row) => ({
    ...row,
    recipientFingerprint: buildRecipientFingerprint({
      tenantId: options.tenantId,
      recipientEmail: row.email
    })
  }));

  console.log('[review-request] status=PASS');
  console.log('[review-request] reason=live canary manifest prepared');
  console.log('[review-request] next_action=Pause for operator approval before sending, then run the same command with the approved batch key');
  console.log(`[review-request] tenant_id=${options.tenantId}`);
  console.log(`[review-request] trigger_type=${options.triggerType}`);
  console.log(`[review-request] batch_key=${options.batchKey}`);
  console.log(`[review-request] live_limit=${options.limit}`);
  console.log(`[review-request] csv_files=${options.csvPaths.join(' | ')}`);
  for (const file of parsedFiles) {
    console.log(`[review-request] csv_file=${file.sourceFile}`);
    console.log(`[review-request] csv_rows=${file.totalRows}`);
    console.log(`[review-request] csv_columns=${formatColumns(file.headers)}`);
  }
  console.log(`[review-request] rows_total=${totalRows}`);
  console.log(`[review-request] valid_recipient_count=${sendableRows.length}`);
  console.log(`[review-request] selected_recipient_count=${selectedManifest.length}`);
  console.log(`[review-request] skipped_duplicate_count=${duplicateRows + crossFileDuplicateRows}`);
  console.log(`[review-request] skipped_duplicate_cross_file_count=${crossFileDuplicateRows}`);
  console.log(`[review-request] skipped_invalid_count=${invalidRows}`);
  console.log(`[review-request] skipped_suppressed_count=${suppressedRows}`);
  console.log('[review-request] suppression_lookup=available');
  console.log(`[review-request] from_email=${maskEmail(options.fromEmail)}`);
  console.log(`[review-request] google_review_link=${options.googleReviewLink}`);
  console.log(`[review-request] business_address=${options.businessAddress}`);

  selectedManifest.forEach((row, index) => {
    const number = index + 1;
    console.log(`[review-request] manifest[${number}].email=${maskEmail(row.email)}`);
    console.log(`[review-request] manifest[${number}].first_name=${maskName(row.firstName)}`);
    console.log(`[review-request] manifest[${number}].source=${path.basename(row.sourceFile)}:${row.rowNum}`);
  });

  let sentCount = 0;
  let failedCount = 0;
  let duplicateDeliveryCount = 0;
  const providerMessageIds: string[] = [];

  try {
    for (const row of selectedManifest) {
      try {
        await prisma.reviewRequestDelivery.create({
          data: {
            tenantId: options.tenantId,
            batchKey: options.batchKey!,
            recipientFingerprint: row.recipientFingerprint,
            status: 'queued'
          }
        });
      } catch (error) {
        if (typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002') {
          duplicateDeliveryCount += 1;
          continue;
        }
        throw error;
      }

      try {
        const sent = await sendReviewRequestEmail({
          tenantId: options.tenantId,
          batchKey: options.batchKey!,
          recipientFingerprint: row.recipientFingerprint,
          toEmail: row.email,
          firstName: row.firstName,
          googleReviewLink: options.googleReviewLink,
          businessAddress: options.businessAddress
        });

        providerMessageIds.push(sent.providerMessageId);
        sentCount += 1;
        await prisma.reviewRequestDelivery.update({
          where: {
            tenantId_batchKey_recipientFingerprint: {
              tenantId: options.tenantId,
              batchKey: options.batchKey!,
              recipientFingerprint: row.recipientFingerprint
            }
          },
          data: {
            status: 'sent',
            providerMessageId: sent.providerMessageId,
            errorCode: null,
            sentAt: new Date()
          }
        });
      } catch (error) {
        failedCount += 1;
        const errorMessage = error instanceof Error ? error.message : 'unknown error';
        try {
          await prisma.reviewRequestDelivery.update({
            where: {
              tenantId_batchKey_recipientFingerprint: {
                tenantId: options.tenantId,
                batchKey: options.batchKey!,
                recipientFingerprint: row.recipientFingerprint
              }
            },
            data: {
              status: 'failed',
              errorCode: errorMessage.slice(0, 120),
              sentAt: null
            }
          });
        } catch {
          // Preserve the provider failure above; the ledger update should not hide it.
        }
      }
    }

    const liveStatus: Status = failedCount > 0 ? 'FAIL' : duplicateDeliveryCount > 0 ? 'WARN' : 'PASS';
    const liveReason =
      liveStatus === 'PASS'
        ? `live canary sent ${sentCount} recipients successfully`
        : liveStatus === 'WARN'
          ? `live canary sent ${sentCount} recipients with duplicate ledger skips`
          : `live canary encountered ${failedCount} send failure(s)`;

    console.log(`[review-request] live_status=${liveStatus}`);
    console.log(`[review-request] live_reason=${liveReason}`);
    console.log(`[review-request] live_send=true`);
    console.log(`[review-request] send_path_mutation=false`);
    console.log('[review-request] delivery_ledger_mutation=true');
    console.log(`[review-request] sent_count=${sentCount}`);
    console.log(`[review-request] failed_count=${failedCount}`);
    console.log(`[review-request] duplicate_delivery_count=${duplicateDeliveryCount}`);
    console.log(`[review-request] provider_message_ids=${providerMessageIds.length > 0 ? providerMessageIds.join(' | ') : 'none'}`);

    const sendPathCountsAfter = await getSendPathCounts(prisma as any, options.tenantId);
    console.log(
      [
        `customer=${sendPathCountsAfter.customer}`,
        `campaign=${sendPathCountsAfter.campaign}`,
        `campaign_run=${sendPathCountsAfter.campaignRun}`,
        `campaign_message=${sendPathCountsAfter.campaignMessage}`,
        `draft_message=${sendPathCountsAfter.draftMessage}`,
        `approval_item=${sendPathCountsAfter.approvalItem}`,
        `link_code=${sendPathCountsAfter.linkCode}`,
        `send_event=${sendPathCountsAfter.sendEvent}`
      ].join(' ')
    );

    process.exitCode = liveStatus === 'FAIL' ? 1 : 0;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'unknown';
  console.error(`[review-request] status=FAIL reason=${message}`);
  console.error('[review-request] next_action=Fix the reported issue and rerun the dry-run command.');
  process.exitCode = 1;
});
