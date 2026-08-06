# DOM XSS sink review policy

## Source of truth

`data/quality/dom-sink-inventory-v1.json` is the reviewed registry for HTML-producing browser sinks.

`tools/inventory-dom-sinks.mjs` discovers:

- `innerHTML` assignments;
- `outerHTML` assignments;
- `insertAdjacentHTML` calls;
- `document.write` calls;
- contextual-fragment creation;
- `DOMParser.parseFromString(..., "text/html")` calls.

`tools/test-dom-sink-inventory.mjs` requires exact equality between source discovery and the committed registry. The check is imported by `tools/test-security-boundaries.mjs`, so it runs both in the dedicated Security workflow and the always-running aggregate Quality integration gate.

A new, removed, moved, duplicated, or reclassified sink requires an explicit registry review.

## Classifications

### `clear-only`

The assignment contains only an empty string and removes existing child nodes. Replacement content must be created through DOM APIs.

### `static-template`

The assigned markup is repository-owned and has no untrusted runtime interpolation.

### `constrained-values-template`

Every interpolated value is restricted before rendering to numbers, booleans, enumerated classes, fixed labels, or a strict regex such as a numeric date.

### `escaped-template`

Runtime text is escaped before it reaches the HTML string. The inventory entry records the responsible builder or helper.

### `normalized-storage-template`

Persistent/imported labels are canonicalized before storage and UI rendering. This classification currently covers custom tactic preset names.

### `detached-html-parser`

Remote or same-origin HTML is parsed into a detached `Document`. The source document is never attached to the live page; only normalized text, numeric values, or reviewed attributes are extracted.

## Preset-name boundary

Custom preset names can originate from:

- existing `localStorage`;
- local import;
- VPS tactics data;
- new user saves.

`PresetStorage.normalizePresets()` applies the same boundary to every source:

- Unicode NFKC normalization;
- control characters become spaces;
- `&`, `<`, `>`, double quote, single quote, and backtick become non-markup full-width characters;
- whitespace is collapsed;
- names are trimmed and limited to 120 characters;
- normalization collisions are deterministic: the first valid entry wins;
- existing local data is rewritten to the canonical form during load.

The tactic object data and built-in preset labels remain unchanged.

## Executable evidence

`tools/test-preset-name-xss-boundary.mjs` verifies normalization, collisions, existing-storage rewrite and outbound merge payloads.

`tests/browser/test_dom_xss_preset_names.py` places closing tags, an image event handler, SVG event handler and script element in a stored custom preset name. It executes the exact userscript and verifies that neither the tactic dropdown nor save dialog creates executable nodes or event attributes.

`tests/browser/test_dom_xss_page_text.py` injects the same classes of malicious content, quotes and a `javascript:` string into match-page text consumed by the parsers and recommendation renderer. It verifies that the exact userscript creates no executable node or handler.

## Review requirements

A change that adds or modifies an HTML-producing sink must include:

1. an updated registry entry with exact provenance;
2. the control that makes the sink safe;
3. static or executable evidence appropriate to that provenance;
4. exact-artifact browser evidence for any new untrusted live-DOM path;
5. a rollback description.

A broad sanitizer claim without per-sink provenance is insufficient.

## Deployment and rollback

This policy and its source changes do not publish the userscript. Publication remains a separate approved release action.

Rollback is a direct revert of the sink-hardening PR. The registry gate must not be removed independently from the rendering/storage changes it protects.
