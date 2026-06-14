import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';
import { PostmarkWebhookLimiterService } from './postmark-webhook-limiter.service';
import { POSTMARK_PROVIDER, REVIEW_ALERT_SOURCE } from './postmark.constants';
import { isIpAllowed, verifyBasicAuthHeader } from './postmark.auth';
import { verifyPostmarkSignature } from './postmark.signature';
import type {
  PostmarkGoogleReviewAlertPayload,
  ReviewAlertInboundResponse,
  ReviewAlertParseStatus
} from './postmark.types';

const SOS_TENANT_ID = 'cmoybzkon0000tm3wj7ofru4n';
const DEFAULT_ALLOWED_FROM = ['google.com', 'googlebusinessprofile-noreply@google.com'];
const PHI_RISK_PATTERNS = [
  /\bdiagnos(?:is|ed|es|ing)?\b/i,
  /\btreatment\b/i,
  /\binsur(?:ance|ed|er|ers)\b/i,
  /\bprocedure(?:s)?\b/i,
  /\bmedical record(?: number| no\.?| #)?\b/i,
  /\bmrn\b/i,
  /\bmedication(?:s)?\b/i,
  /\bclinical notes?\b/i,
  /\bconsultation notes?\b/i,
  /\bfeeding\b/i,
  /\blactation\b/i,
  /\bprescription\b/i
];

type ParsedAlert = {
  status: ReviewAlertParseStatus;
  confidence: number;
  failureReason: string | null;
  rating: number | null;
  reviewerName: string | null;
  businessName: string | null;
  reviewSnippet: string | null;
  reviewUrl: string | null;
  sourceMailbox: string | null;
  fromEmail: string | null;
  subject: string | null;
  receivedAt: Date;
};

@Injectable()
export class PostmarkReviewAlertService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limiter: PostmarkWebhookLimiterService
  ) {}

  async receiveGoogleReviewAlert(input: {
    authorizationHeader: string | undefined;
    rawBody: Buffer | undefined;
    signatureHeader: string | undefined;
    sourceIp: string | null;
    payload: PostmarkGoogleReviewAlertPayload;
  }): Promise<ReviewAlertInboundResponse> {
    if (!this.isEnabled()) {
      return { accepted: true, disabled: true };
    }

    if (
      !isIpAllowed({
        sourceIp: input.sourceIp,
        allowlistCsv: process.env.POSTMARK_WEBHOOK_IP_ALLOWLIST
      })
    ) {
      throw new UnauthorizedException('Postmark webhook source IP not allowed');
    }

    const authMatch = verifyBasicAuthHeader({
      authorizationHeader: input.authorizationHeader,
      expectedCredential: process.env.POSTMARK_WEBHOOK_BASIC_AUTH ?? process.env.POSTMARK_WEBHOOK_BASIC_AUTH_CURRENT,
      previousCredential: process.env.POSTMARK_WEBHOOK_BASIC_AUTH_PREVIOUS
    });
    if (!authMatch) {
      throw new UnauthorizedException('Invalid Postmark webhook credentials');
    }

    const signatureProvided = Boolean(input.signatureHeader && process.env.POSTMARK_WEBHOOK_SECRET);
    if (signatureProvided) {
      const signatureOk = verifyPostmarkSignature({
        rawBody: input.rawBody ?? Buffer.alloc(0),
        signatureHeader: input.signatureHeader,
        secret: process.env.POSTMARK_WEBHOOK_SECRET
      });

      if (!signatureOk) {
        throw new UnauthorizedException('Invalid Postmark webhook signature');
      }
    }

    const tenantId = this.resolveTenantId();
    await this.assertRateLimit(input.sourceIp, tenantId);

    const parsed = this.parseInboundAlert(input.payload);
    const rawHash = this.hashRawBody(input.rawBody ?? Buffer.from(JSON.stringify(input.payload)));
    const providerMessageId = this.resolveMessageId(input.payload);

    const duplicate = await this.prisma.reviewAlertEmail.findFirst({
      where: {
        tenantId,
        provider: POSTMARK_PROVIDER,
        OR: [...(providerMessageId ? [{ providerMessageId }] : []), { rawHash }]
      },
      select: { id: true }
    });

    if (duplicate) {
      return {
        accepted: true,
        duplicate: true,
        reviewAlertEmailId: duplicate.id,
        parsedStatus: parsed.status
      };
    }

    const record = await this.prisma.$transaction(async (tx) => {
      const row = await tx.reviewAlertEmail.create({
        data: {
          tenantId,
          provider: POSTMARK_PROVIDER,
          providerMessageId,
          source: REVIEW_ALERT_SOURCE,
          sourceMailbox: parsed.sourceMailbox,
          fromEmail: parsed.fromEmail,
          subject: parsed.subject,
          receivedAt: parsed.receivedAt,
          rawHash,
          parsedStatus: parsed.status,
          parsedRating: parsed.rating,
          parsedReviewerName: parsed.reviewerName,
          parsedBusinessName: parsed.businessName,
          parsedReviewSnippet: parsed.reviewSnippet,
          parsedReviewUrl: parsed.reviewUrl,
          parseConfidence: new Prisma.Decimal(parsed.confidence),
          failureReason: parsed.failureReason
        }
      });

      const alert = await tx.integrationAlert.create({
        data: {
          tenantId,
          integration: 'REVIEW_ALERT_EMAIL',
          code: this.alertCodeForStatus(parsed.status),
          severity: parsed.status === 'parsed' ? 'low' : 'medium',
          message: this.alertMessageForStatus(parsed),
          metadataJson: {
            reviewAlertEmailId: row.id,
            source: REVIEW_ALERT_SOURCE,
            provider: POSTMARK_PROVIDER,
            providerMessageId,
            parsedStatus: parsed.status,
            parsedRating: parsed.rating,
            parsedReviewerName: parsed.reviewerName,
            parsedBusinessName: parsed.businessName,
            parsedReviewSnippet: parsed.reviewSnippet,
            parsedReviewUrl: parsed.reviewUrl,
            parseConfidence: parsed.confidence,
            failureReason: parsed.failureReason,
            sourceMailbox: parsed.sourceMailbox,
            fromEmail: parsed.fromEmail,
            subject: parsed.subject,
            receivedAt: parsed.receivedAt.toISOString()
          } as Prisma.InputJsonValue
        }
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: null,
          action: 'REVIEW_ALERT_EMAIL_INGESTED',
          entityType: 'review_alert_email',
          entityId: row.id,
          metadataJson: {
            alertId: alert.id,
            parsedStatus: parsed.status,
            source: REVIEW_ALERT_SOURCE,
            provider: POSTMARK_PROVIDER
          } as Prisma.InputJsonValue
        }
      });

      return { row, alert };
    });

    return {
      accepted: true,
      duplicate: false,
      reviewAlertEmailId: record.row.id,
      alertId: record.alert.id,
      parsedStatus: parsed.status
    };
  }

  private isEnabled(): boolean {
    return process.env.REVIEW_ALERT_INBOUND_ENABLED === '1';
  }

  private resolveTenantId(): string {
    const configured = process.env.REVIEW_ALERT_INBOUND_TENANT_ID?.trim();
    if (!configured) {
      throw new ForbiddenException('Review alert inbound tenant is not configured');
    }

    if (configured !== SOS_TENANT_ID) {
      throw new ForbiddenException('Review alert inbound tenant is not allowed');
    }

    return configured;
  }

  private async assertRateLimit(sourceIp: string | null, tenantId: string) {
    const ipPerMinuteLimit = Number.parseInt(process.env.POSTMARK_WEBHOOK_IP_PER_MINUTE ?? '240', 10);
    const tenantPerMinuteLimit = Number.parseInt(process.env.POSTMARK_WEBHOOK_TENANT_PER_MINUTE ?? '180', 10);
    const since = new Date(Date.now() - 60_000);
    const windowMs = 60_000;

    if (sourceIp) {
      const ipAllowedByMemory = this.limiter.consume(`ip:${sourceIp}`, ipPerMinuteLimit, windowMs);
      if (!ipAllowedByMemory) {
        throw new UnauthorizedException('Postmark webhook IP rate limit exceeded');
      }
    }

    const tenantAllowedByMemory = this.limiter.consume(`tenant:${tenantId}`, tenantPerMinuteLimit, windowMs);
    if (!tenantAllowedByMemory) {
      throw new UnauthorizedException('Postmark webhook tenant rate limit exceeded');
    }

    const tenantCount = await this.prisma.reviewAlertEmail.count({
      where: {
        tenantId,
        createdAt: { gte: since }
      }
    });
    if (tenantCount >= tenantPerMinuteLimit) {
      throw new UnauthorizedException('Postmark webhook tenant rate limit exceeded');
    }
  }

  private parseInboundAlert(payload: PostmarkGoogleReviewAlertPayload): ParsedAlert {
    const fromEmail = this.extractEmail(this.trimToNull(this.resolveAddress(payload.FromFull) ?? payload.From));
    const sourceMailbox = this.extractEmail(this.trimToNull(this.resolveAddress(payload.ToFull) ?? payload.To));
    const subject = this.trimToNull(payload.Subject);
    const body = this.trimToNull(payload.TextBody) ?? this.stripHtml(this.trimToNull(payload.HtmlBody));
    const receivedAt = this.parseDate(payload.ReceivedAt);
    const allowedSender = this.isAllowedSender(fromEmail);
    const allowedRecipient = this.isAllowedRecipient(sourceMailbox);
    const riskText = `${subject ?? ''}\n${body ?? ''}`;
    const phiRisk = this.containsPhiRisk(riskText);
    const ratingMatches = this.findAllRatings(riskText);
    const reviewerName = this.extractReviewerName(riskText);
    const businessName = this.extractBusinessName(riskText);
    const reviewSnippet = this.extractSnippet(body);
    const reviewUrl = this.extractReviewUrl(riskText);

    if (!allowedSender || !allowedRecipient || phiRisk) {
      return {
        status: 'quarantined',
        confidence: 0.05,
        failureReason: !allowedSender
          ? 'Sender domain not allowed'
          : !allowedRecipient
            ? 'Recipient address not allowed'
            : 'PHI-adjacent text detected',
        rating: ratingMatches.length === 1 ? ratingMatches[0] : null,
        reviewerName,
        businessName,
        reviewSnippet,
        reviewUrl,
        sourceMailbox,
        fromEmail,
        subject,
        receivedAt
      };
    }

    if (ratingMatches.length > 1) {
      return {
        status: 'needs_review',
        confidence: 0.35,
        failureReason: 'Multiple ratings detected',
        rating: null,
        reviewerName,
        businessName,
        reviewSnippet,
        reviewUrl,
        sourceMailbox,
        fromEmail,
        subject,
        receivedAt
      };
    }

    const rating = ratingMatches[0] ?? null;
    let confidence = 0.2;
    if (allowedSender) {
      confidence += 0.25;
    }
    if (allowedRecipient) {
      confidence += 0.15;
    }
    if (rating !== null) {
      confidence += 0.2;
    }
    if (reviewerName) {
      confidence += 0.1;
    }
    if (reviewSnippet) {
      confidence += 0.1;
    }
    if (reviewUrl) {
      confidence += 0.1;
    }
    if (businessName) {
      confidence += 0.05;
    }
    confidence = Math.min(0.99, confidence);

    const missingSignals = !rating || !reviewSnippet || !reviewUrl;
    const status: ReviewAlertParseStatus = confidence >= 0.8 && !missingSignals ? 'parsed' : 'needs_review';
    const failureReason =
      status === 'parsed'
        ? null
        : !rating
          ? 'Missing explicit rating'
          : !reviewSnippet
            ? 'Missing explicit review snippet'
            : !reviewUrl
              ? 'Missing explicit review link'
              : 'Low confidence parse';

    return {
      status,
      confidence,
      failureReason,
      rating,
      reviewerName,
      businessName,
      reviewSnippet,
      reviewUrl,
      sourceMailbox,
      fromEmail,
      subject,
      receivedAt
    };
  }

  private alertCodeForStatus(status: ReviewAlertParseStatus): string {
    switch (status) {
      case 'parsed':
        return 'REVIEW_ALERT_EMAIL_PARSED';
      case 'needs_review':
        return 'REVIEW_ALERT_EMAIL_NEEDS_REVIEW';
      case 'quarantined':
        return 'REVIEW_ALERT_EMAIL_QUARANTINED';
    }
  }

  private alertMessageForStatus(parsed: {
    status: ReviewAlertParseStatus;
    failureReason: string | null;
    fromEmail: string | null;
    sourceMailbox: string | null;
  }): string {
    const source = parsed.fromEmail ?? 'unknown sender';
    const mailbox = parsed.sourceMailbox ? ` to ${parsed.sourceMailbox}` : '';
    if (parsed.status === 'parsed') {
      return `Parsed Google review alert from ${source}${mailbox}`;
    }
    if (parsed.status === 'quarantined') {
      return `Quarantined Google review alert from ${source}${mailbox}: ${parsed.failureReason ?? 'unknown reason'}`;
    }
    return `Google review alert needs operator review from ${source}${mailbox}: ${parsed.failureReason ?? 'low confidence'}`;
  }

  private isAllowedSender(fromEmail: string | null): boolean {
    if (!fromEmail) {
      return false;
    }

    const raw = process.env.REVIEW_ALERT_ALLOWED_FROM_DOMAINS ?? DEFAULT_ALLOWED_FROM.join(',');
    const tokens = raw
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    return tokens.some((token) => {
      if (token.includes('@')) {
        return fromEmail.toLowerCase() === token.toLowerCase();
      }

      return fromEmail.toLowerCase().endsWith(`@${token.toLowerCase()}`);
    });
  }

  private isAllowedRecipient(sourceMailbox: string | null): boolean {
    const configured = process.env.REVIEW_ALERT_ALLOWED_RECIPIENT?.trim();
    if (!configured) {
      return true;
    }

    if (!sourceMailbox) {
      return false;
    }

    return sourceMailbox.toLowerCase() === configured.toLowerCase();
  }

  private resolveAddress(
    input: PostmarkGoogleReviewAlertPayload['FromFull'] | PostmarkGoogleReviewAlertPayload['ToFull'] | string | undefined
  ): string | null {
    if (!input) {
      return null;
    }

    if (typeof input === 'string') {
      return input;
    }

    return input.Email ?? null;
  }

  private extractEmail(input: string | null): string | null {
    if (!input) {
      return null;
    }

    const match = input.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return match ? match[0] : null;
  }

  private extractReviewerName(text: string): string | null {
    const match = text.match(/(?:from|by)\s+([A-Z][A-Za-z' -]{1,80})/);
    return this.trimToNull(match?.[1] ?? null);
  }

  private extractBusinessName(text: string): string | null {
    const match = text.match(/(?:for|about)\s+([A-Z][A-Za-z0-9'&., -]{1,100})/);
    return this.trimToNull(match?.[1] ?? null);
  }

  private extractSnippet(body: string | null): string | null {
    if (!body) {
      return null;
    }

    const normalized = body.replace(/\s+/g, ' ').trim();
    if (normalized.length === 0) {
      return null;
    }

    return normalized.slice(0, 240);
  }

  private extractReviewUrl(text: string): string | null {
    const match = text.match(/https?:\/\/[^\s<>"')]+/i);
    if (!match) {
      return null;
    }

    const url = match[0];
    return /google\.(com|[a-z.]+)\/|g\.page\/|goo\.gl\//i.test(url) ? url : null;
  }

  private findAllRatings(text: string): number[] {
    const matches = [...text.matchAll(/(?:rated|gave|star(?:s)?)\D{0,12}([1-5])\s*(?:star(?:s)?)?/gi)];
    const ratings = matches
      .map((match) => Number.parseInt(match[1] ?? '', 10))
      .filter((value) => Number.isInteger(value) && value >= 1 && value <= 5);
    return [...new Set(ratings)];
  }

  private containsPhiRisk(text: string): boolean {
    return PHI_RISK_PATTERNS.some((pattern) => pattern.test(text));
  }

  private stripHtml(input: string | null): string | null {
    if (!input) {
      return null;
    }

    return input.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ');
  }

  private parseDate(input: string | undefined): Date {
    if (!input) {
      return new Date();
    }

    const parsed = new Date(input);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  private trimToNull(input: string | null | undefined): string | null {
    const value = input?.trim();
    return value && value.length > 0 ? value : null;
  }

  private hashRawBody(rawBody: Buffer): string {
    return createHash('sha256').update(rawBody).digest('hex');
  }

  private resolveMessageId(payload: PostmarkGoogleReviewAlertPayload): string | null {
    const id = payload.MessageID?.trim();
    return id && id.length > 0 ? id : null;
  }
}
