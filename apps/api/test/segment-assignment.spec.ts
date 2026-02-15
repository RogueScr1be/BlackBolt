import { segmentFromLastServiceDate } from '../src/modules/common/segment';

describe('segment assignment', () => {
  it('maps <=90 days to 0_90', () => {
    const dt = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
    expect(segmentFromLastServiceDate(dt)).toBe('0_90');
  });

  it('maps <=365 days to 90_365', () => {
    const dt = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000);
    expect(segmentFromLastServiceDate(dt)).toBe('90_365');
  });

  it('maps missing date to 365_plus', () => {
    expect(segmentFromLastServiceDate(null)).toBe('365_plus');
  });
});
