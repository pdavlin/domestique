# Domestique

A TypeScript MCP (Model Context Protocol) server that integrates with [Intervals.icu](https://intervals.icu) and [TrainerRoad](https://www.trainerroad.com) to provide unified access to fitness data across all activities and sports.

## Features

- Query completed workouts from Intervals.icu
- View planned workouts from TrainerRoad and Intervals.icu
- Sync TrainerRoad running workouts to Intervals.icu as structured workouts for Zwift/Garmin
- Analyze fitness trends (CTL/ATL/TSB)
- Comprehensive workout analysis with intervals, notes, and weather data
- Incorporates heat strain data recorded from a [CORE Body Temperature](https://corebodytemp.com/) sensor for analysis

**Note:** Due to Strava API restrictions, workouts imported from Strava to Intervals.icu cannot be analyzed. To work around this, ensure that workouts are synced to Intervals.icu from other sources (Zwift, Garmin Connect, Dropbox, etc.)

## Available Tools

### Today's Data
- `get_todays_summary` - Complete snapshot of today including fitness metrics (CTL/ATL/TSB), wellness, completed workouts, planned workouts (from TrainerRoad and Intervals.icu), and today's race, if any.

### Profile & Settings
- `get_athlete_profile` - Athlete's profile including unit preferences (metric/imperial), age, and location
- `get_sports_settings` - Sport-specific settings (FTP, zones, thresholds) for cycling, running, or swimming

### Historical/Trends
- `get_workout_history` - Historical workouts for a date range
- `get_wellness_trends` - Wellness data trends (weight) over a date range
- `get_activity_totals` - Aggregated activity totals over a date range, including duration, distance, training load, and zone distributions by sport

### Planning
- `get_upcoming_workouts` - Planned workouts for a future date range from both TrainerRoad and Intervals.icu calendars
- `get_upcoming_races` - Upcoming races from the TrainerRoad calendar (only triathlons for now)

### Workout Management
- `get_run_workout_syntax` - Returns the Intervals.icu workout syntax documentation for creating structured running workouts
- `create_run_workout` - Creates a structured running workout in Intervals.icu from a plain English description
- `get_cycling_workout_syntax` - Returns the Intervals.icu workout syntax documentation for creating structured cycling workouts
- `create_cycling_workout` - Creates a structured cycling workout in Intervals.icu from a plain English description
- `update_workout` - Updates a Domestique-created workout in Intervals.icu
- `delete_workout` - Deletes a Domestique-created workout from Intervals.icu
- `sync_trainerroad_runs` - Syncs running workouts from TrainerRoad to Intervals.icu, creating new workouts, detecting changes, and cleaning up orphans
- `set_workout_intervals` - Sets intervals on a completed activity

### Analysis
- `get_training_load_trends` - Training load trends including CTL (fitness), ATL (fatigue), TSB (form), ramp rate, and ACWR
- `get_workout_details` - Get all the details for a single workout, including intervals, notes, weather, and zones
- `get_workout_intervals` - Detailed interval breakdown for a specific workout including power, HR, cadence, and timing data
- `get_workout_notes` - Notes and comments written by the athlete about a specific workout in Intervals.icu
- `get_workout_weather` - Weather conditions during a specific outdoor workout
- `get_workout_heat_zones` - Heat zone analysis for a specific workout showing time spent in each heat strain zone

### Performance Curves
- `get_power_curve` - Cycling power curve analysis showing best watts at various durations with W/kg, estimated FTP, and period comparison
- `get_pace_curve` - Running/swimming pace curve analysis showing best times at key distances
- `get_hr_curve` - Heart rate curve analysis showing max sustained HR at various durations

## Setup

### Prerequisites

- Node.js 20+
- Intervals.icu account with API key
- TrainerRoad account with calendar feed URL

### Environment Variables

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Required variables:
- `MCP_AUTH_TOKEN` - Secret token for MCP authentication. You can quickly generate one with:

```bash
openssl rand -hex 32
```

For Intervals.icu integration:
- `INTERVALS_API_KEY` - Your Intervals.icu API key
- `INTERVALS_ATHLETE_ID` - Your Intervals.icu athlete ID

For TrainerRoad integration:
- `TRAINERROAD_CALENDAR_URL` - Private iCal feed URL

## Common Commands

### Docker Commands

All commands should be run in the Docker container:

```bash
# Start development server with hot reload
docker compose up

# Start in background
docker compose up -d

# View logs
docker compose logs domestique -f

# Restart container
docker compose restart domestique

# Stop containers
docker compose down

# Rebuild containers after dependency changes
docker compose build

# Run commands in container
docker compose exec domestique <command>

# Examples:
docker compose exec domestique npm run typecheck
```

### Testing with MCP Inspector

The [MCP Inspector](https://github.com/modelcontextprotocol/inspector) is a useful tool for testing and debugging your MCP server:

```bash
# Install MCP Inspector globally (if not already installed)
npm install -g @modelcontextprotocol/inspector

# Run inspector pointing to your local server
npx @modelcontextprotocol/inspector --server-url "http://localhost:3000/mcp?token=YOUR_SECRET_TOKEN"

# Or with Authorization header
npx @modelcontextprotocol/inspector --server-url "http://localhost:3000/mcp" \
  --header "{ \"Authorization\": \"Bearer YOUR_SECRET_TOKEN\" }"
```

The inspector will open a web interface where you can:
- Browse available tools
- Test tool calls with different parameters
- View request/response payloads
- Debug connection issues

### Debug Token Counting

In development mode, tool responses include a `_debug` object with token count information. This helps you understand how many tokens each tool response would consume when passed to Claude.

To enable this feature:

1. Add your Anthropic API key to `.env`:
   ```bash
   ANTHROPIC_API_KEY=your-anthropic-api-key
   ```

2. Restart the development server:
   ```bash
   docker compose restart domestique
   ```

Tool responses will now include:
```json
{
  "response": { ... },
  "field_descriptions": { ... },
  "_debug": {
    "token_count": 1234
  }
}
```

This feature is automatically disabled in production (when `NODE_ENV` is not `development`) or when `ANTHROPIC_API_KEY` is not set.

## Local Development

### Using Docker Compose (recommended)

```bash
# Start development server with hot reload
docker compose up

# Server runs at http://localhost:3000
```

### Using Node.js directly

```bash
# Install dependencies
npm install

# Run in development mode with hot reload
npm run dev

# Or build and run production
npm run build
npm start
```

## Deployment to Fly.io

### 1. Install Fly CLI and Login

```bash
curl -L https://fly.io/install.sh | sh
fly auth login
```

### 2. Deploy Domestique

```bash
# Create the app (first time only)
fly apps create domestique

# Set secrets
fly secrets set MCP_AUTH_TOKEN=your-secret-token
fly secrets set INTERVALS_API_KEY=your-api-key
fly secrets set INTERVALS_ATHLETE_ID=your-athlete-id

# Deploy
fly deploy

# View logs
fly logs
```

## Connecting to Claude

Add this MCP server as a connector to your Claude configuration using this URL:

```
https://{FLY_APP_NAME}.fly.dev/mcp?token=YOUR_SECRET_TOKEN
```

**Note:** Replace `YOUR_SECRET_TOKEN` with your actual `MCP_AUTH_TOKEN` value and `FLY_APP_NAME` with the name of the Fly.io app (or the URL wherever you have it hosted). 

## Example Queries

Once connected, you can ask Claude:

- "How did my workout go today?"
- "Show me my fitness trends for the last month"
- "What workouts do I have planned this week?"
- "What workout do I have scheduled for next Wednesday?"
- "Show me my workouts from last Friday"
- "How many workouts did I complete in the last 2 weeks?"
- "What was my training load in the last 42 days?"
- "What's my power curve for the last 90 days?"
- "How has my 5-minute power improved compared to last quarter?"
- "Show me my running pace curve—what's my best 5km time?"
- "Compare my cycling power from the last 3 months vs the previous 3 months"
- "What's my FTP?"
- "What are my running zones?"
- "How has my weight changed over the last 30 days?"
- "What are my swimming, cycling and running totals for the past month?"
- "How much time did I spend in each power zone this month?"
- "Sync my TrainerRoad runs to Intervals.icu so they sync to Zwift"

## MCP Client Compatibility Notes

This server has been tested with Claude and ChatGPT. However, there are some compatibility differences to be aware of:

- **Tool responses**: ChatGPT uses `structuredContent` for JSON data and [expects](https://developers.openai.com/apps-sdk/build/mcp-server#step-3--return-structured-data-and-metadata) plain text or Markdown `content` for narration in tools responses. Claude only uses `content`. This server's tool responses return the same JSON payload in both fields for compatibility.

- **MCP prompts**: ChatGPT doesn't support [prompts](https://modelcontextprotocol.io/specification/2025-11-25/server/prompts), and Claude inserts them as .txt files rather than as regular prompts. The `daily_summary` prompt is provided but may not work as expected on all clients.

- **MCP resources**: ChatGPT does not support [resources](https://modelcontextprotocol.io/specification/2025-11-25/server/resources); Claude does but doesn't seem to reliably use them while invoking tools. As an alternative, this server provides tools like `get_run_workout_syntax` and `get_cycling_workout_syntax` that return the resource contents directly.

- **`_meta` fields**: ChatGPT [provides](https://developers.openai.com/apps-sdk/reference#_meta-fields-the-client-provides) `_meta` fields in tool inputs, which could be used to identify that the request is coming from ChatGPT, and provides things like the location and locale of the user. Claude doesn't provide any hints.
