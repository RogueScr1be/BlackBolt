const DAY_MS = 24 * 60 * 60 * 1000;

export type CustomerSegmentApi = '0_90' | '90_365' | '365_plus';

export function toPrismaSegment(segment: CustomerSegmentApi): 'SEGMENT_0_90' | 'SEGMENT_90_365' | 'SEGMENT_365_PLUS' {
  switch (segment) {
    case '0_90':
      return 'SEGMENT_0_90';
    case '90_365':
      return 'SEGMENT_90_365';
    default:
      return 'SEGMENT_365_PLUS';
  }
}

export function toApiSegment(prismaSegment: string): CustomerSegmentApi {
  if (prismaSegment === 'SEGMENT_0_90') {
    return '0_90';
  }

  if (prismaSegment === 'SEGMENT_90_365') {
    return '90_365';
  }

  return '365_plus';
}

export function segmentFromLastServiceDate(lastServiceDate: Date | null): CustomerSegmentApi {
  if (!lastServiceDate) {
    // Phase 2 decision: missing date is treated as 365_plus.
    return '365_plus';
  }

  const ageDays = Math.floor((Date.now() - lastServiceDate.getTime()) / DAY_MS);
  if (ageDays <= 90) {
    return '0_90';
  }

  if (ageDays <= 365) {
    return '90_365';
  }

  return '365_plus';
}
