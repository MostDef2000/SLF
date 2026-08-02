# Tactic evaluation contract v1

## Purpose

This contract defines how completed matches and tactical phases must be compared after the telemetry-envelope stage. It prevents the VPS from ranking tactics by raw wins alone.

## Evaluation units

Evaluation is performed at three levels:

1. completed match;
2. tactical phase between two tactic transitions;
3. individual preset switch.

The primary identity is the exact `tacticFingerprint`, not only the display name. This protects historical analysis when a named preset is retuned.

## Required context

Every comparable row must retain:

- game and preset identity;
- tactic fingerprint and library version;
- recommendation schema and risk appetite;
- home/away state;
- strength-gap bucket;
- score state at the beginning of the phase;
- minute bucket;
- opponent style when available;
- controlled-exploration marker.

## Outcome model

The primary metric is `risk_adjusted_effect_score`. It combines:

- result versus expected result;
- goal and xG difference;
- shot and xT advantage;
- lead protection and comeback outcomes;
- bad-action and transition-exposure changes;
- physical, card and injury costs.

Raw points remain visible but are not sufficient for ranking.

## Eligibility

A tactical phase normally needs at least five match minutes and telemetry completeness of at least 0.55. An early red card before minute 20 excludes the row from the main comparison. Injuries, later red cards, manual overrides and missing expected-performance data remain stored but receive explicit quality flags.

## Confidence policy

- fewer than 8 samples: observation only;
- 8–19 samples: provisional ranking;
- 20–39 samples: eligible for a human-reviewed promotion or demotion;
- 40 or more samples: eligible to propose recommendation-policy changes, still requiring approval.

Historical matches use a 60-day half-life. Reports must expose sample size and Wilson confidence intervals where the metric is a rate.

## Required VPS aggregates

The VPS should expose at minimum:

- result versus expected;
- xG difference per 30 minutes;
- lead-hold rate;
- comeback and equalizer rates;
- power cost per 30 minutes;
- switch effect before and after application;
- separate normal and controlled-exploration cohorts.

Aggregates must be grouped by preset, exact fingerprint, risk appetite, strength context, score state and minute bucket.

## Safety boundary

The browser client does not train, promote or apply tactics automatically. It collects deterministic context and outcomes. Aggregation occurs on the VPS, and any change to the active library or recommendation policy requires human approval.
