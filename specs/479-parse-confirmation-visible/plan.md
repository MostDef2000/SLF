# Plan — Visible parse confirmation (#479)

Base: `1ff8489a3d8c057a885f30e2660330009b412e78`.

## 1. Recommended design

In `src/app/ui-layer.js`, the parse button handler (`:62-68`) currently calls `addParserLog()` on resolve/reject. Change it to also call `setParserStatus()` (the existing helper at `:6-10` that writes `#slf-parser-status`) with a short, clear message: success «Результат отправлен ✓», failure «Ошибка: <kind>». Keep `addParserLog()` for the timestamped detail.

Make `#slf-parser-status` readable in the new design: the element is created at `:112-115` with `color:#9f9;font-size:12px`. In the flex panel it can be squeezed; add `white-space:nowrap` and a `min-width` sufficient for the message, or allow wrapping with a max width. Check `src/app/version-badge.js:59` (FM2026 accent color rule) — no change expected there, but verify the computed style in the fixture.

Do not touch `SnapshotEngine.sendMatchResult()` or any API logic. Do not change the shared log's behavior for other writers.

## 2. Risk profile and test design

| Priority | Failure mode | Discriminating check |
|---|---|---|
| High | Status still not updated | Browser test asserts `#slf-parser-status` text after a successful send in the finished-match fixture. |
| High | Message clipped/invisible | Assert computed height > 0 and no `overflow:hidden` on the status element in the dark fixture. |
| Medium | Other log writers overwrite confirmation | Test writes to the log after success and re-checks the status text. |
| Medium | Old-design log assertions regress | Run the full `test_exact_userscript.py` suite; existing log-text assertions must still pass. |

## 3. Verification and correct-course check

From `SLF/`:

```sh
node tools/check-bundle-order.mjs
node tools/build-latest-userscript.mjs
python3 tests/browser/test_exact_userscript.py
python3 tests/browser/test_fm2026_design_adapter.py
```

Correct-course: demonstrate the RED test on the base (status stays «ожидание»), then fix. If the browser fixture cannot simulate a resolved send, use the existing API mock in `test_exact_userscript.py` rather than a live POST. Do not weaken assertions to obtain green.

## 4. Release impact

`src/**` runtime change → automatic userscript release expected after exact-green-head CI and merge. No VPS deploy, no game-state mutation. Generated outputs rebuilt only via the canonical builder.
