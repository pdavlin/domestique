#!/usr/bin/env tsx
/**
 * Test script to verify API client integrations
 * Run with: npm run test:clients
 */

import { IntervalsClient } from '../clients/intervals.js';
import { TrainerRoadClient } from '../clients/trainerroad.js';

async function testIntervals() {
  console.log('\n🚴 Testing Intervals.icu API...\n');

  const apiKey = process.env.INTERVALS_API_KEY;
  const athleteId = process.env.INTERVALS_ATHLETE_ID;

  if (!apiKey || !athleteId) {
    console.log('   ⏭️  Skipped: INTERVALS_API_KEY or INTERVALS_ATHLETE_ID not set');
    return;
  }

  try {
    const client = new IntervalsClient({ apiKey, athleteId });

    // Test recent activities
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    console.log('   Fetching recent activities...');
    const activities = await client.getActivities(weekAgo, today);
    console.log(`   ✅ Found ${activities.length} activities`);
    if (activities.length > 0) {
      const latest = activities[0];
      console.log(`      Latest: ${latest.name || latest.activity_type}`);
      console.log(`      Duration: ${latest.duration}`);
      if (latest.tss) console.log(`      TSS: ${latest.tss}`);
    }

    // Test fitness data
    console.log('\n   Fetching fitness metrics...');
    const fitness = await client.getFitnessMetrics(weekAgo, today);
    console.log(`   ✅ Found ${fitness.length} days of fitness data`);
    if (fitness.length > 0) {
      const latest = fitness[fitness.length - 1];
      console.log(`      CTL (Fitness): ${latest.ctl.toFixed(1)}`);
      console.log(`      ATL (Fatigue): ${latest.atl.toFixed(1)}`);
      console.log(`      TSB (Form): ${latest.tsb.toFixed(1)}`);
    }

  } catch (error) {
    console.error('   ❌ Intervals.icu error:', error instanceof Error ? error.message : error);
  }
}

async function testTrainerRoad() {
  console.log('\n📅 Testing TrainerRoad Calendar...\n');

  const calendarUrl = process.env.TRAINERROAD_CALENDAR_URL;

  if (!calendarUrl) {
    console.log('   ⏭️  Skipped: TRAINERROAD_CALENDAR_URL not set');
    return;
  }

  try {
    const client = new TrainerRoadClient({ calendarUrl });

    // Test upcoming workouts
    console.log('   Fetching upcoming workouts...');
    const workouts = await client.getUpcomingWorkouts(7);
    console.log(`   ✅ Found ${workouts.length} workouts in next 7 days`);

    for (const workout of workouts.slice(0, 3)) {
      const date = new Date(workout.scheduled_for).toLocaleDateString();
      console.log(`      ${date}: ${workout.name}`);
      if (workout.sport) console.log(`         Sport: ${workout.sport}`);
      if (workout.expected_duration) console.log(`         Duration: ${workout.expected_duration}`);
      if (workout.expected_tss) console.log(`         TSS: ${workout.expected_tss}`);
    }

  } catch (error) {
    console.error('   ❌ TrainerRoad error:', error instanceof Error ? error.message : error);
  }
}

async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║     Domestique Client Integration      ║');
  console.log('╚════════════════════════════════════════╝');

  await testIntervals();
  await testTrainerRoad();

  console.log('\n✨ Done!\n');
  process.exit(0);
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
