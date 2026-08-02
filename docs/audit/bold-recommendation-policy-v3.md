# Bold recommendation policy v3

## Scope

This stage changes recommendation timing and candidate scoring after the 11 active presets were retuned into more distinct profiles.

Tactic application remains manual. The policy only selects and explains a recommendation.

## Risk appetite

Supported values:

- `conservative`
- `standard`
- `bold` (default)
- `experimental`

An explicit `riskAppetite` in match context wins. Otherwise the policy reads `localStorage['slf:tactics:risk-appetite']`, then falls back to `bold`.

## Earlier attack windows

| Appetite | Klopp from | Bielsa from | Exploration |
|---|---:|---:|---:|
| conservative | 78 | 86 | 0% |
| standard | 74 | 84 | 0% |
| bold | 66 | 80 | 10% |
| experimental | 60 | 76 | 15% |

The minute threshold alone is insufficient. High press still requires acceptable power loss, low bad-action risk, no own red card, and no unresolved transition threat outside the late emergency window.

## Scoring changes

More aggressive appetites add explicit score bonuses to:

- Pep Controlled Push;
- Pep Positional Attack;
- Conte Wingback Width;
- Klopp Gegenpress;
- Bielsa Chaos Press.

Compact Counter also receives a smaller bonus when the team is weaker and needs attacking output. Box Control loses a small default bonus outside conservative mode unless high bad actions justify a reset.

## Controlled exploration

`bold` and `experimental` use a deterministic game/window bucket. Exploration can select a safe attacking alternative only when:

- no emergency override is active;
- there is no own red card;
- bad actions and pressing fatigue are not high;
- data completeness is at least 0.55;
- the alternative is not vetoed;
- its score is within the configured gap of the selected candidate.

The decision payload records eligibility, bucket, threshold, source preset and selected alternative.

## Signature synchronization

The recommendation engine's tactic fingerprints are replaced with the retuned v2 values. This restores correct current-preset detection and hysteresis after the preset-value change.

## Safety boundary

The policy preserves hard vetoes for:

- own red card plus all-in pressing;
- power loss of 5% or more;
- high bad-action rate;
- unsafe transition exposure;
- Low Block outside a real late lead-protection state;
- width without confirmed safe flank opportunity.

No VPS schema, telemetry collection name, automatic application behavior, generated release artifact, or version manifest is edited manually.