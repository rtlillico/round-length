-- Round Length database schema
-- Run once: psql -d roundlength -f schema.sql

-- ─── FARMS ────────────────────────────────────────────────────────────────────
-- One row per farm. The lat/lon is used for all SILO data fetches.

CREATE TABLE IF NOT EXISTS farms (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  lat         DECIMAL(8,5) NOT NULL,
  lon         DECIMAL(8,5) NOT NULL,
  silo_email  VARCHAR(200) NOT NULL,     -- email used for SILO API calls
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);

-- ─── SILO DAILY ───────────────────────────────────────────────────────────────
-- Raw climate data from SILO. One row per day per farm.
-- This is the permanent record — never deleted, appended nightly.
-- All future analysis is derived from this table.
-- Variables fetched with comment=RXNJVW

CREATE TABLE IF NOT EXISTS silo_daily (
  id              SERIAL PRIMARY KEY,
  farm_id         INTEGER NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  date            DATE NOT NULL,

  -- Temperature — used in v1 (Temp LAR)
  max_temp        DECIMAL(5,1),          -- °C
  min_temp        DECIMAL(5,1),          -- °C

  -- Solar radiation — used in v2 (Solar factor)
  radiation       DECIMAL(5,1),          -- MJ/m²/day

  -- Rainfall — used in v2 (Soil water balance)
  daily_rain      DECIMAL(6,1),          -- mm

  -- Vapour pressure — used with Morton's ET
  vp              DECIMAL(5,2),          -- hPa

  -- Morton's wet environment ET — used in v2 (replaces Hargreaves-Samani)
  -- Accounts for humidity without needing wind speed data
  et_morton_wet   DECIMAL(5,2),          -- mm/day

  UNIQUE(farm_id, date)
);

-- ─── SCENARIOS ────────────────────────────────────────────────────────────────
-- One scenario per soil/pasture/leaf combination the farmer wants to track.
-- Each scenario is fully independent.
-- Examples: "Sandy paddock", "Irrigated river flat", "Clay hill block"

CREATE TABLE IF NOT EXISTS scenarios (
  id              SERIAL PRIMARY KEY,
  farm_id         INTEGER NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  name            VARCHAR(100) NOT NULL,
  pasture_key     VARCHAR(50) NOT NULL,  -- e.g. 'perennialRyegrass'
  target_leaves   DECIMAL(3,1) NOT NULL  -- 1.5, 2.0, 2.5, or 3.0
    CHECK (target_leaves IN (1.5, 2.0, 2.5, 3.0)),
  created_at      TIMESTAMP DEFAULT NOW()
);

-- ─── SCENARIO PERCENTILES ─────────────────────────────────────────────────────
-- Precomputed historical statistics for the chart.
-- One row per day-of-year per scenario.
-- Computed once when scenario is created, minor update each night.
-- day_of_year: 1 = 1 Jan, 365 = 31 Dec (leap days averaged into day 59).

CREATE TABLE IF NOT EXISTS scenario_percentiles (
  id              SERIAL PRIMARY KEY,
  scenario_id     INTEGER NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  day_of_year     SMALLINT NOT NULL CHECK (day_of_year BETWEEN 1 AND 365),

  -- Temp LAR percentiles (leaves/day)
  lar_p10         DECIMAL(8,6),
  lar_p25         DECIMAL(8,6),
  lar_p50         DECIMAL(8,6),
  lar_p75         DECIMAL(8,6),
  lar_p90         DECIMAL(8,6),

  -- True round length percentiles (days)
  -- "True" = cumulative backwards LAR sum to reach target leaves
  round_p10       DECIMAL(6,1),
  round_p25       DECIMAL(6,1),
  round_p50       DECIMAL(6,1),
  round_p75       DECIMAL(6,1),
  round_p90       DECIMAL(6,1),

  -- Average temperature percentiles (°C) — for planning table
  temp_p10        DECIMAL(5,1),
  temp_p25        DECIMAL(5,1),
  temp_p50        DECIMAL(5,1),
  temp_p75        DECIMAL(5,1),
  temp_p90        DECIMAL(5,1),

  -- How many years of data went into this calculation
  -- Used to flag low-confidence early years
  years_counted   SMALLINT,

  UNIQUE(scenario_id, day_of_year)
);

-- ─── SCENARIO DAILY STATE ─────────────────────────────────────────────────────
-- Today's live calculated values for each scenario.
-- Updated nightly by cron job.
-- Keeping historical rows enables future "actual vs estimated" tracking.

CREATE TABLE IF NOT EXISTS scenario_daily_state (
  id              SERIAL PRIMARY KEY,
  scenario_id     INTEGER NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  t_mean          DECIMAL(5,1),          -- °C mean temperature
  temp_lar        DECIMAL(8,6),          -- leaves/day
  true_round      DECIMAL(6,1),          -- days (cumulative backwards sum)
  data_source     VARCHAR(20) DEFAULT 'silo'  -- 'silo' or 'manual'
    CHECK (data_source IN ('silo', 'manual')),
  UNIQUE(scenario_id, date)
);

-- ─── MIGRATIONS ───────────────────────────────────────────────────────────────

-- p25/p75 percentile columns (added after initial release)
ALTER TABLE scenario_percentiles ADD COLUMN IF NOT EXISTS lar_p25   DECIMAL(8,6);
ALTER TABLE scenario_percentiles ADD COLUMN IF NOT EXISTS lar_p75   DECIMAL(8,6);
ALTER TABLE scenario_percentiles ADD COLUMN IF NOT EXISTS round_p25 DECIMAL(6,1);
ALTER TABLE scenario_percentiles ADD COLUMN IF NOT EXISTS round_p75 DECIMAL(6,1);
ALTER TABLE scenario_percentiles ADD COLUMN IF NOT EXISTS temp_p25  DECIMAL(5,1);
ALTER TABLE scenario_percentiles ADD COLUMN IF NOT EXISTS temp_p75  DECIMAL(5,1);

-- Solar factor columns — scenario_daily_state
ALTER TABLE scenario_daily_state ADD COLUMN IF NOT EXISTS actual_lar   DECIMAL(8,6);
ALTER TABLE scenario_daily_state ADD COLUMN IF NOT EXISTS solar_factor DECIMAL(5,4);
ALTER TABLE scenario_daily_state ADD COLUMN IF NOT EXISTS radiation    DECIMAL(5,1);

-- Solar factor columns — scenario_percentiles
ALTER TABLE scenario_percentiles ADD COLUMN IF NOT EXISTS solar_p10          DECIMAL(5,4);
ALTER TABLE scenario_percentiles ADD COLUMN IF NOT EXISTS solar_p25          DECIMAL(5,4);
ALTER TABLE scenario_percentiles ADD COLUMN IF NOT EXISTS solar_p50          DECIMAL(5,4);
ALTER TABLE scenario_percentiles ADD COLUMN IF NOT EXISTS solar_p75          DECIMAL(5,4);
ALTER TABLE scenario_percentiles ADD COLUMN IF NOT EXISTS solar_p90          DECIMAL(5,4);
ALTER TABLE scenario_percentiles ADD COLUMN IF NOT EXISTS solar_historical_max DECIMAL(5,4);
ALTER TABLE scenario_percentiles ADD COLUMN IF NOT EXISTS solar_historical_min DECIMAL(5,4);

-- Short code for scenario — e.g. S1, S2, S3 — assigned at creation time
ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS short_code VARCHAR(10);

-- ─── INDEXES ──────────────────────────────────────────────────────────────────
-- Optimise the queries the app runs most frequently.

-- SILO fetch: get recent rows for a farm
CREATE INDEX IF NOT EXISTS idx_silo_farm_date
  ON silo_daily(farm_id, date DESC);

-- Chart query: get all rows for a farm in date range
CREATE INDEX IF NOT EXISTS idx_silo_farm_date_range
  ON silo_daily(farm_id, date);

-- Percentile chart: get all days for a scenario
CREATE INDEX IF NOT EXISTS idx_percentiles_scenario
  ON scenario_percentiles(scenario_id, day_of_year);

-- Daily state: get today's row for a scenario
CREATE INDEX IF NOT EXISTS idx_daily_state_scenario_date
  ON scenario_daily_state(scenario_id, date DESC);

-- Scenarios: get all scenarios for a farm
CREATE INDEX IF NOT EXISTS idx_scenarios_farm
  ON scenarios(farm_id);
