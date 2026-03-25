import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CurrentTools } from '../../src/tools/current.js';
import { IntervalsClient } from '../../src/clients/intervals.js';
import { TrainerRoadClient } from '../../src/clients/trainerroad.js';
import type { PlannedWorkout, NormalizedWorkout, FitnessMetrics, WellnessData, Race } from '../../src/types/index.js';

// Mock the clients
vi.mock('../../src/clients/intervals.js');
vi.mock('../../src/clients/trainerroad.js');

describe('CurrentTools', () => {
  let tools: CurrentTools;
  let mockIntervalsClient: IntervalsClient;
  let mockTrainerRoadClient: TrainerRoadClient;

  beforeEach(() => {
    vi.clearAllMocks();

    mockIntervalsClient = new IntervalsClient({ apiKey: 'test', athleteId: 'test' });
    mockTrainerRoadClient = new TrainerRoadClient({ calendarUrl: 'https://test.com' });

    tools = new CurrentTools(mockIntervalsClient, mockTrainerRoadClient);
  });

  describe('getTodaysCompletedWorkouts', () => {
    beforeEach(() => {
      vi.mocked(mockIntervalsClient.getAthleteTimezone).mockResolvedValue('UTC');
    });

    const mockWorkouts: NormalizedWorkout[] = [
      {
        id: '1',
        start_time: '2024-12-15T10:00:00+00:00',
        activity_type: 'Cycling',
        duration: '1:00:00',
        tss: 85,
        source: 'intervals.icu',
      },
    ];

    it('should return completed workouts from Intervals.icu with current_time', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-12-15T10:30:45Z'));

      vi.mocked(mockIntervalsClient.getActivities).mockResolvedValue(mockWorkouts);

      const result = await tools.getTodaysCompletedWorkouts();

      expect(result.workouts).toHaveLength(1);
      expect(result.current_time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
      expect(mockIntervalsClient.getActivities).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('should include current_time in user timezone', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-12-15T10:30:45Z'));

      vi.mocked(mockIntervalsClient.getAthleteTimezone).mockResolvedValue('Europe/London');
      vi.mocked(mockIntervalsClient.getActivities).mockResolvedValue([]);

      const result = await tools.getTodaysCompletedWorkouts();

      // 10:30:45 UTC = 10:30:45 Europe/London (UTC+0 in winter)
      expect(result.current_time).toMatch(/^2024-12-15T10:30:45(Z|\+00:00)$/);
      expect(result.workouts).toEqual([]);

      vi.useRealTimers();
    });

    it('should return empty workouts array when no workouts today', async () => {
      vi.mocked(mockIntervalsClient.getActivities).mockResolvedValue([]);

      const result = await tools.getTodaysCompletedWorkouts();

      expect(result.workouts).toEqual([]);
      expect(result.current_time).toBeTruthy();
    });
  });

  describe('getTodaysPlannedWorkouts', () => {
    beforeEach(() => {
      vi.mocked(mockIntervalsClient.getAthleteTimezone).mockResolvedValue('UTC');
    });

    const trainerroadWorkouts: PlannedWorkout[] = [
      {
        id: 'tr-1',
        scheduled_for: '2024-12-15T09:00:00Z',
        name: 'Sweet Spot Base',
        expected_tss: 88,
        source: 'trainerroad',
      },
    ];

    const intervalsWorkouts: PlannedWorkout[] = [
      {
        id: 'int-1',
        scheduled_for: '2024-12-15T17:00:00Z',
        name: 'Easy Run',
        expected_tss: 35,
        source: 'intervals.icu',
      },
    ];

    it('should return workouts from both sources with current_time', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-12-15T10:30:45Z'));

      vi.mocked(mockTrainerRoadClient.getPlannedWorkouts).mockResolvedValue(trainerroadWorkouts);
      vi.mocked(mockIntervalsClient.getPlannedEvents).mockResolvedValue(intervalsWorkouts);

      const result = await tools.getTodaysPlannedWorkouts();

      expect(result.workouts).toHaveLength(2);
      expect(result.workouts).toContainEqual(trainerroadWorkouts[0]);
      expect(result.workouts).toContainEqual(intervalsWorkouts[0]);
      expect(result.current_time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);

      vi.useRealTimers();
    });

    it('should include current_time in user timezone', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-12-15T10:30:45Z'));

      vi.mocked(mockIntervalsClient.getAthleteTimezone).mockResolvedValue('Asia/Tokyo');
      vi.mocked(mockTrainerRoadClient.getPlannedWorkouts).mockResolvedValue([]);
      vi.mocked(mockIntervalsClient.getPlannedEvents).mockResolvedValue([]);

      const result = await tools.getTodaysPlannedWorkouts();

      // 10:30:45 UTC = 19:30:45 Asia/Tokyo (UTC+9)
      expect(result.current_time).toBe('2024-12-15T19:30:45+09:00');
      expect(result.workouts).toEqual([]);

      vi.useRealTimers();
    });

    it('should deduplicate similar workouts', async () => {
      const duplicateWorkout: PlannedWorkout = {
        id: 'int-1',
        scheduled_for: '2024-12-15T09:00:00Z',
        name: 'Sweet Spot Base', // Same name
        expected_tss: 88, // Same TSS
        source: 'intervals.icu',
      };

      vi.mocked(mockTrainerRoadClient.getPlannedWorkouts).mockResolvedValue(trainerroadWorkouts);
      vi.mocked(mockIntervalsClient.getPlannedEvents).mockResolvedValue([duplicateWorkout]);

      const result = await tools.getTodaysPlannedWorkouts();

      // Should only have TrainerRoad version (preferred)
      expect(result.workouts).toHaveLength(1);
      expect(result.workouts[0].source).toBe('trainerroad');
    });

    it('should handle TrainerRoad client not configured', async () => {
      const toolsWithoutTr = new CurrentTools(mockIntervalsClient, null);
      vi.mocked(mockIntervalsClient.getPlannedEvents).mockResolvedValue(intervalsWorkouts);

      const result = await toolsWithoutTr.getTodaysPlannedWorkouts();

      expect(result.workouts).toHaveLength(1);
      expect(result.workouts[0]).toEqual(intervalsWorkouts[0]);
      expect(result.current_time).toBeTruthy();
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(mockTrainerRoadClient.getPlannedWorkouts).mockRejectedValue(new Error('Failed'));
      vi.mocked(mockIntervalsClient.getPlannedEvents).mockResolvedValue(intervalsWorkouts);

      const result = await tools.getTodaysPlannedWorkouts();

      expect(result.workouts).toHaveLength(1);
      expect(result.workouts[0]).toEqual(intervalsWorkouts[0]);
    });
  });

  describe('getTodaysSummary', () => {
    const mockFitness: FitnessMetrics = {
      date: '2024-12-15',
      ctl: 65,
      atl: 72,
      tsb: -7,
      ramp_rate: 4.5,
      ctl_load: 1.8,
      atl_load: 10.2,
    };

    const mockWellness: WellnessData = {
      weight: '74.5 kg',
      resting_hr: 51,
      hrv: 35.47,
      sleep_duration: '8h 10m',
      sleep_score: 87,
      sleep_quality: 1,
      soreness: 1,
      fatigue: 2,
      stress: 1,
      mood: 2,
      motivation: 2,
      injury: 1,
      hydration: 2,
      readiness: 60,
      vo2max: 54,
      steps: 22,
      respiration: 16.73,
      comments: 'Test wellness entry',
    };

    const mockWorkouts: NormalizedWorkout[] = [
      {
        id: '1',
        start_time: '2024-12-15T10:00:00+00:00',
        activity_type: 'Cycling',
        duration: '1:00:00',
        tss: 85,
        source: 'intervals.icu',
      },
    ];

    const mockPlannedWorkouts: PlannedWorkout[] = [
      {
        id: 'tr-1',
        scheduled_for: '2024-12-15T09:00:00Z',
        name: 'Sweet Spot Base',
        expected_tss: 88,
        source: 'trainerroad',
      },
    ];

    beforeEach(() => {
      vi.mocked(mockIntervalsClient.getAthleteTimezone).mockResolvedValue('UTC');
      vi.mocked(mockTrainerRoadClient.getUpcomingRaces).mockResolvedValue([]);
    });

    it('should return complete daily summary with all data', async () => {
      vi.mocked(mockIntervalsClient.getTodayFitness).mockResolvedValue(mockFitness);
      vi.mocked(mockIntervalsClient.getTodayWellness).mockResolvedValue(mockWellness);
      vi.mocked(mockIntervalsClient.getActivities).mockResolvedValue(mockWorkouts);
      vi.mocked(mockTrainerRoadClient.getPlannedWorkouts).mockResolvedValue(mockPlannedWorkouts);
      vi.mocked(mockIntervalsClient.getPlannedEvents).mockResolvedValue([]);

      const result = await tools.getTodaysSummary();

      expect(result.fitness).toEqual(mockFitness);
      expect(result.wellness).toEqual(mockWellness);
      expect(result.completed_workouts).toHaveLength(1);
      expect(result.planned_workouts).toHaveLength(1);
      expect(result.workouts_completed).toBe(1);
      expect(result.workouts_planned).toBe(1);
      expect(result.tss_completed).toBe(85);
      expect(result.tss_planned).toBe(88);
    });

    it('should include current_time with full datetime in user timezone', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-12-15T10:30:45Z'));

      vi.mocked(mockIntervalsClient.getAthleteTimezone).mockResolvedValue('America/New_York');
      vi.mocked(mockIntervalsClient.getTodayFitness).mockResolvedValue(null);
      vi.mocked(mockIntervalsClient.getTodayWellness).mockResolvedValue(null);
      vi.mocked(mockIntervalsClient.getActivities).mockResolvedValue([]);
      vi.mocked(mockTrainerRoadClient.getPlannedWorkouts).mockResolvedValue([]);
      vi.mocked(mockIntervalsClient.getPlannedEvents).mockResolvedValue([]);

      const result = await tools.getTodaysSummary();

      // 10:30:45 UTC = 05:30:45 America/New_York (UTC-5)
      expect(result.current_time).toBe('2024-12-15T05:30:45-05:00');

      vi.useRealTimers();
    });

    it('should include fitness metrics with ctl_load and atl_load', async () => {
      vi.mocked(mockIntervalsClient.getTodayFitness).mockResolvedValue(mockFitness);
      vi.mocked(mockIntervalsClient.getTodayWellness).mockResolvedValue(null);
      vi.mocked(mockIntervalsClient.getActivities).mockResolvedValue([]);
      vi.mocked(mockTrainerRoadClient.getPlannedWorkouts).mockResolvedValue([]);
      vi.mocked(mockIntervalsClient.getPlannedEvents).mockResolvedValue([]);

      const result = await tools.getTodaysSummary();

      expect(result.fitness).not.toBeNull();
      expect(result.fitness?.ctl).toBe(65);
      expect(result.fitness?.atl).toBe(72);
      expect(result.fitness?.tsb).toBe(-7);
      expect(result.fitness?.ctl_load).toBe(1.8);
      expect(result.fitness?.atl_load).toBe(10.2);
    });

    it('should handle null fitness when fetch fails', async () => {
      vi.mocked(mockIntervalsClient.getTodayFitness).mockRejectedValue(new Error('Failed'));
      vi.mocked(mockIntervalsClient.getTodayWellness).mockResolvedValue(null);
      vi.mocked(mockIntervalsClient.getActivities).mockResolvedValue([]);
      vi.mocked(mockTrainerRoadClient.getPlannedWorkouts).mockResolvedValue([]);
      vi.mocked(mockIntervalsClient.getPlannedEvents).mockResolvedValue([]);

      const result = await tools.getTodaysSummary();

      expect(result.fitness).toBeNull();
    });

    it('should return wellness data as-is', async () => {
      vi.mocked(mockIntervalsClient.getTodayFitness).mockResolvedValue(mockFitness);
      vi.mocked(mockIntervalsClient.getTodayWellness).mockResolvedValue(mockWellness);
      vi.mocked(mockIntervalsClient.getActivities).mockResolvedValue([]);
      vi.mocked(mockTrainerRoadClient.getPlannedWorkouts).mockResolvedValue([]);
      vi.mocked(mockIntervalsClient.getPlannedEvents).mockResolvedValue([]);

      const result = await tools.getTodaysSummary();

      expect(result.wellness).toEqual(mockWellness);
      expect(result.wellness?.resting_hr).toBe(51);
      expect(result.wellness?.hrv).toBe(35.47);
      expect(result.wellness?.sleep_duration).toBe('8h 10m');
    });

    it('should handle null wellness when no data', async () => {
      vi.mocked(mockIntervalsClient.getTodayFitness).mockResolvedValue(null);
      vi.mocked(mockIntervalsClient.getTodayWellness).mockResolvedValue(null);
      vi.mocked(mockIntervalsClient.getActivities).mockResolvedValue([]);
      vi.mocked(mockTrainerRoadClient.getPlannedWorkouts).mockResolvedValue([]);
      vi.mocked(mockIntervalsClient.getPlannedEvents).mockResolvedValue([]);

      const result = await tools.getTodaysSummary();

      expect(result.wellness).toBeNull();
    });

    it('should handle wellness fetch failure gracefully', async () => {
      vi.mocked(mockIntervalsClient.getTodayFitness).mockResolvedValue(null);
      vi.mocked(mockIntervalsClient.getTodayWellness).mockRejectedValue(new Error('Failed'));
      vi.mocked(mockIntervalsClient.getActivities).mockResolvedValue([]);
      vi.mocked(mockTrainerRoadClient.getPlannedWorkouts).mockResolvedValue([]);
      vi.mocked(mockIntervalsClient.getPlannedEvents).mockResolvedValue([]);

      const result = await tools.getTodaysSummary();

      expect(result.wellness).toBeNull();
    });

    it('should return scheduled_race when a race is scheduled for today', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-12-15T10:00:00Z'));

      const todaysRace: Race = {
        scheduled_for: '2024-12-15T07:00:00Z',
        name: 'Winter Triathlon',
        sport: 'Triathlon',
      };

      const futureRace: Race = {
        scheduled_for: '2024-12-25T08:00:00Z',
        name: 'Christmas Race',
        sport: 'Triathlon',
      };

      vi.mocked(mockIntervalsClient.getTodayFitness).mockResolvedValue(null);
      vi.mocked(mockIntervalsClient.getTodayWellness).mockResolvedValue(null);
      vi.mocked(mockIntervalsClient.getActivities).mockResolvedValue([]);
      vi.mocked(mockTrainerRoadClient.getPlannedWorkouts).mockResolvedValue([]);
      vi.mocked(mockIntervalsClient.getPlannedEvents).mockResolvedValue([]);
      vi.mocked(mockTrainerRoadClient.getUpcomingRaces).mockResolvedValue([todaysRace, futureRace]);

      const result = await tools.getTodaysSummary();

      expect(result.scheduled_race).toEqual(todaysRace);

      vi.useRealTimers();
    });

    it('should return null scheduled_race when no races are scheduled', async () => {
      vi.mocked(mockIntervalsClient.getTodayFitness).mockResolvedValue(null);
      vi.mocked(mockIntervalsClient.getTodayWellness).mockResolvedValue(null);
      vi.mocked(mockIntervalsClient.getActivities).mockResolvedValue([]);
      vi.mocked(mockTrainerRoadClient.getPlannedWorkouts).mockResolvedValue([]);
      vi.mocked(mockIntervalsClient.getPlannedEvents).mockResolvedValue([]);
      vi.mocked(mockTrainerRoadClient.getUpcomingRaces).mockResolvedValue([]);

      const result = await tools.getTodaysSummary();

      expect(result.scheduled_race).toBeNull();
    });

    it('should return null scheduled_race when races exist but none for today', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-12-15T10:00:00Z'));

      const futureRace: Race = {
        scheduled_for: '2024-12-25T08:00:00Z',
        name: 'Christmas Race',
        sport: 'Triathlon',
      };

      vi.mocked(mockIntervalsClient.getTodayFitness).mockResolvedValue(null);
      vi.mocked(mockIntervalsClient.getTodayWellness).mockResolvedValue(null);
      vi.mocked(mockIntervalsClient.getActivities).mockResolvedValue([]);
      vi.mocked(mockTrainerRoadClient.getPlannedWorkouts).mockResolvedValue([]);
      vi.mocked(mockIntervalsClient.getPlannedEvents).mockResolvedValue([]);
      vi.mocked(mockTrainerRoadClient.getUpcomingRaces).mockResolvedValue([futureRace]);

      const result = await tools.getTodaysSummary();

      expect(result.scheduled_race).toBeNull();

      vi.useRealTimers();
    });

    it('should handle race fetch failure gracefully', async () => {
      vi.mocked(mockIntervalsClient.getTodayFitness).mockResolvedValue(null);
      vi.mocked(mockIntervalsClient.getTodayWellness).mockResolvedValue(null);
      vi.mocked(mockIntervalsClient.getActivities).mockResolvedValue([]);
      vi.mocked(mockTrainerRoadClient.getPlannedWorkouts).mockResolvedValue([]);
      vi.mocked(mockIntervalsClient.getPlannedEvents).mockResolvedValue([]);
      vi.mocked(mockTrainerRoadClient.getUpcomingRaces).mockRejectedValue(new Error('Failed'));

      const result = await tools.getTodaysSummary();

      expect(result.scheduled_race).toBeNull();
    });

    it('should return null scheduled_race when TrainerRoad client is not configured', async () => {
      const toolsWithoutTr = new CurrentTools(mockIntervalsClient, null);

      vi.mocked(mockIntervalsClient.getTodayFitness).mockResolvedValue(null);
      vi.mocked(mockIntervalsClient.getTodayWellness).mockResolvedValue(null);
      vi.mocked(mockIntervalsClient.getActivities).mockResolvedValue([]);
      vi.mocked(mockIntervalsClient.getPlannedEvents).mockResolvedValue([]);

      const result = await toolsWithoutTr.getTodaysSummary();

      expect(result.scheduled_race).toBeNull();
    });
  });
});
