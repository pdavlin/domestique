import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseDateRangeInTimezone } from '../../src/utils/date-parser.js';

describe('parseDateRangeInTimezone', () => {
  const mockDate = new Date('2024-12-15T12:00:00Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(mockDate);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should parse oldest and newest dates', () => {
    const result = parseDateRangeInTimezone('2024-12-01', '2024-12-15', 'UTC');
    expect(result).toEqual({ startDate: '2024-12-01', endDate: '2024-12-15' });
  });

  it('should default endDate to today in timezone when newest is undefined', () => {
    const result = parseDateRangeInTimezone('2024-12-01', undefined, 'UTC');
    expect(result).toEqual({ startDate: '2024-12-01', endDate: '2024-12-15' });
  });

  it('should parse natural language dates', () => {
    const result = parseDateRangeInTimezone('yesterday', 'today', 'UTC');
    expect(result).toEqual({ startDate: '2024-12-14', endDate: '2024-12-15' });
  });

  it('should respect timezone for relative dates', () => {
    // At 12:00 UTC, in America/Denver (UTC-7) it's 05:00 on Dec 15
    const result = parseDateRangeInTimezone('today', undefined, 'UTC');
    expect(result.endDate).toBe('2024-12-15');
  });

  it('should respect timezone when UTC is early morning', () => {
    vi.setSystemTime(new Date('2024-12-15T02:00:00Z'));
    // At 02:00 UTC, in America/Denver (UTC-7) it's 19:00 on Dec 14
    const result = parseDateRangeInTimezone('today', undefined, 'America/Denver');
    expect(result.startDate).toBe('2024-12-14');
    expect(result.endDate).toBe('2024-12-14');
  });

  it('should pass through ISO dates without timezone conversion', () => {
    const result = parseDateRangeInTimezone('2024-01-01', '2024-06-30', 'America/New_York');
    expect(result).toEqual({ startDate: '2024-01-01', endDate: '2024-06-30' });
  });
});
