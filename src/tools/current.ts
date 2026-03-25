import { IntervalsClient } from '../clients/intervals.js';
import { TrainerRoadClient } from '../clients/trainerroad.js';
import { getTodayInTimezone } from '../utils/date-parser.js';
import { getCurrentTimeInTimezone } from '../utils/date-formatting.js';
import { fetchAndMergePlannedWorkouts } from '../utils/workout-utils.js';
import type {
  AthleteProfile,
  DailySummary,
  SportSettingsResponse,
  TodaysCompletedWorkoutsResponse,
  TodaysPlannedWorkoutsResponse,
  Race,
} from '../types/index.js';

export class CurrentTools {
  constructor(
    private intervals: IntervalsClient,
    private trainerroad: TrainerRoadClient | null
  ) {}

  /**
   * Get today's completed workouts from Intervals.icu
   * with current date/time in user's timezone
   */
  async getTodaysCompletedWorkouts(): Promise<TodaysCompletedWorkoutsResponse> {
    // Use athlete's timezone to determine "today" and get current date/time
    const timezone = await this.intervals.getAthleteTimezone();
    const today = getTodayInTimezone(timezone);
    const currentDateTime = getCurrentTimeInTimezone(timezone);

    // Fetch Intervals.icu activities
    const workouts = await this.intervals.getActivities(today, today);

    return {
      current_time: currentDateTime,
      workouts,
    };
  }

  /**
   * Get today's planned workouts from both TrainerRoad and Intervals.icu
   * with current date/time in user's timezone.
   * Returns a single merged array, preferring TrainerRoad for duplicates (has more detail).
   */
  async getTodaysPlannedWorkouts(): Promise<TodaysPlannedWorkoutsResponse> {
    // Use athlete's timezone to determine "today" and get current date/time
    const timezone = await this.intervals.getAthleteTimezone();
    const today = getTodayInTimezone(timezone);
    const currentDateTime = getCurrentTimeInTimezone(timezone);

    // Fetch, merge, and deduplicate from both sources
    const merged = await fetchAndMergePlannedWorkouts(
      this.intervals,
      this.trainerroad,
      today,
      today,
      timezone
    );

    return {
      current_time: currentDateTime,
      workouts: merged,
    };
  }

  /**
   * Get athlete profile including unit preferences, age, and location.
   * Note: Sport-specific settings are now retrieved via getSportSettings().
   */
  async getAthleteProfile(): Promise<AthleteProfile> {
    return await this.intervals.getAthleteProfile();
  }

  /**
   * Get sport-specific settings (FTP, zones, etc.) for a specific sport.
   * @param sport - "cycling", "running", or "swimming"
   */
  async getSportSettings(sport: 'cycling' | 'running' | 'swimming'): Promise<SportSettingsResponse | null> {
    return await this.intervals.getSportSettingsForSport(sport);
  }

  /**
   * Get a complete summary of today's data including fitness metrics and workouts.
   * This is the single tool for all "today's" data: fitness metrics,
   * completed workouts, and planned workouts.
   */
  async getTodaysSummary(): Promise<DailySummary> {
    // Use athlete's timezone to determine "today"
    const timezone = await this.intervals.getAthleteTimezone();
    const today = getTodayInTimezone(timezone);

    // Fetch all data in parallel for efficiency
    const [fitness, wellness, completedWorkoutsResponse, plannedWorkoutsResponse, todaysRace] = await Promise.all([
      this.intervals.getTodayFitness().catch((e) => {
        console.error('Error fetching fitness for daily summary:', e);
        return null;
      }),
      this.intervals.getTodayWellness().catch((e) => {
        console.error('Error fetching wellness for daily summary:', e);
        return null;
      }),
      this.getTodaysCompletedWorkouts().catch((e) => {
        console.error('Error fetching completed workouts for daily summary:', e);
        return { current_time: getCurrentTimeInTimezone(timezone), workouts: [] };
      }),
      this.getTodaysPlannedWorkouts().catch((e) => {
        console.error('Error fetching planned workouts for daily summary:', e);
        return { current_time: getCurrentTimeInTimezone(timezone), workouts: [] };
      }),
      this.trainerroad
        ? this.trainerroad.getUpcomingRaces(timezone).then((races) => {
            // Filter for today's race only
            const todaysRace = races.find((race) => race.scheduled_for.startsWith(today));
            return todaysRace ?? null;
          }).catch((e) => {
            console.error('Error fetching races for daily summary:', e);
            return null as Race | null;
          })
        : Promise.resolve(null as Race | null),
    ]);

    const completedWorkouts = completedWorkoutsResponse.workouts;
    const plannedWorkouts = plannedWorkoutsResponse.workouts;

    // Calculate TSS totals
    const tssCompleted = completedWorkouts.reduce(
      (sum, w) => sum + (w.tss || 0),
      0
    );
    const tssPlanned = plannedWorkouts.reduce(
      (sum, w) => sum + (w.expected_tss || 0),
      0
    );

    // Get current datetime in user's timezone for context
    const currentDateTime = getCurrentTimeInTimezone(timezone);

    return {
      current_time: currentDateTime,
      fitness,
      wellness,
      planned_workouts: plannedWorkouts,
      completed_workouts: completedWorkouts,
      scheduled_race: todaysRace,
      workouts_planned: plannedWorkouts.length,
      workouts_completed: completedWorkouts.length,
      tss_planned: Math.round(tssPlanned),
      tss_completed: Math.round(tssCompleted),
    };
  }
}
