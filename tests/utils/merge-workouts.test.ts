import { describe, it, expect } from 'vitest';
import { mergeWorkouts } from '../../src/utils/workout-utils.js';
import type { PlannedWorkout } from '../../src/types/index.js';

describe('mergeWorkouts', () => {
  const createWorkout = (overrides: Partial<PlannedWorkout> = {}): PlannedWorkout => ({
    id: 'test-id',
    name: 'Test Workout',
    scheduled_for: '2024-12-15T08:00:00',
    sport: 'Cycling',
    source: 'intervals.icu',
    ...overrides,
  });

  it('should return all TrainerRoad workouts', () => {
    const tr = [createWorkout({ id: 'tr-1', name: 'TR Workout', source: 'trainerroad' })];
    const icu = [createWorkout({ id: 'icu-1', name: 'Different Workout', expected_tss: 100, source: 'intervals.icu' })];
    const result = mergeWorkouts(tr, icu);
    expect(result).toHaveLength(2);
  });

  it('should exclude duplicate Intervals.icu workouts', () => {
    const tr = [createWorkout({ id: 'tr-1', name: 'Tempo Run', source: 'trainerroad' })];
    const icu = [createWorkout({ id: 'icu-1', name: 'Tempo Run', source: 'intervals.icu' })];
    const result = mergeWorkouts(tr, icu);
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('trainerroad');
  });

  it('should handle empty TrainerRoad list', () => {
    const icu = [createWorkout({ id: 'icu-1' }), createWorkout({ id: 'icu-2', name: 'Another' })];
    const result = mergeWorkouts([], icu);
    expect(result).toHaveLength(2);
  });

  it('should handle empty Intervals.icu list', () => {
    const tr = [createWorkout({ id: 'tr-1', source: 'trainerroad' })];
    const result = mergeWorkouts(tr, []);
    expect(result).toHaveLength(1);
  });

  it('should handle both lists empty', () => {
    const result = mergeWorkouts([], []);
    expect(result).toHaveLength(0);
  });

  it('should deduplicate by external_id match', () => {
    const tr = [createWorkout({ id: 'tr-1', name: 'Workout A', source: 'trainerroad' })];
    const icu = [createWorkout({ id: 'icu-1', external_id: 'tr-1', name: 'Workout B', source: 'intervals.icu' })];
    const result = mergeWorkouts(tr, icu);
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('trainerroad');
  });

  it('should not deduplicate workouts on different days', () => {
    const tr = [createWorkout({ id: 'tr-1', name: 'Same Name', scheduled_for: '2024-12-15T08:00:00', source: 'trainerroad' })];
    const icu = [createWorkout({ id: 'icu-1', name: 'Same Name', scheduled_for: '2024-12-16T08:00:00', source: 'intervals.icu' })];
    const result = mergeWorkouts(tr, icu);
    expect(result).toHaveLength(2);
  });
});
