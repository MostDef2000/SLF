# Lean match runtime evidence

The `/game.php` UI observer is scoped to the FM content root and filters mutations to SLF panels and tactical controls. Canvas frame churn, player rendering, score updates, and unrelated DOM changes do not schedule `mountUI()`.

The existing route guards remain authoritative for transfer, training, loan, and team-management modules. This change does not modify match logic, telemetry, tactics, API, storage, release, or VPS behavior.
