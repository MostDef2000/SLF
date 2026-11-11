    // 3a. Native Site Template API (issue #409)
    // ============================================================

    // Native site templates are the canonical preset store (issue #409).
    // Inventory is page-embedded (window.TACTIC_CFG.items on team4.php
    // ?action=tactic and match pages; share.php is readonly and is never
    // ingested). Writes go through same-origin manager POSTs to
    // /ajax/team3.9.php (a=tactic_save / tactic_rename / tactic_delete).
    // Verified live protocol facts (owner-account probe, 2026-11-11):
    // - the endpoint answers JSON with a lying `Content-Type: text/html`;
    //   parsing must ignore the header and validate the body schema;
    // - no CSRF hash is involved for team3.9.php (the hash belongs to
    //   tactic_ajax.php apply only — do not add one here);
    // - same-name save creates a NEW template (no upsert), so an update is
    //   save-new + delete-old;
    // - the server rejects saves above the non-VIP2 template limit; rejections
    //   must surface loudly, never as optimistic success.

    const NativeTemplateMapping = (() => {
        // Site template data: 17 numeric fields. Plugin preset vectors carry
        // the same 14 controls as decimal strings plus a priority array
        // (['left','center','right'] subset); membership maps directly to the
        // priority bits (1 = direction prioritized, [] = 0/0/0 «без
        // приоритета» — never expanded to all-ones, never «disable attacks»).
        const CONTROL_DOMAINS = {
            def_line: [1, 3],
            press_line: [1, 3],
            def_width: [1, 3],
            press_intense: [1, 5],
            build_type: [1, 3],
            build_temp: [1, 3],
            build_long: [1, 3],
            build_fast: [1, 3],
            style: [1, 5],
            pass_risk: [1, 5],
            dribble: [1, 5],
            cross: [1, 3],
            corner: [1, 2],
            shot: [1, 3]
        };
        const CONTROL_KEYS = Object.keys(CONTROL_DOMAINS);
        const PRIORITY_BITS = [
            { key: 'priority_l', direction: 'left' },
            { key: 'priority_c', direction: 'center' },
            { key: 'priority_r', direction: 'right' }
        ];
        const PRIORITY_DIRECTIONS = PRIORITY_BITS.map(bit => bit.direction);
        const SITE_DATA_KEYS = CONTROL_KEYS.concat(PRIORITY_BITS.map(bit => bit.key));

        function invalid(code, message) {
            return { ok: false, code, message };
        }

        function coerceControl(key, raw, domain) {
            const min = domain[0];
            const max = domain[1];
            const expected = `${key}: expected an integer ${min}..${max}`;
            if (raw == null || typeof raw === 'boolean') {
                return invalid('invalid_value', `${expected}, got ${String(raw)}`);
            }
            let value = raw;
            if (typeof value === 'string') {
                const text = value.trim();
                if (!/^[0-9]+$/.test(text)) {
                    return invalid('invalid_value', `${expected}, got ${JSON.stringify(value)}`);
                }
                value = Number(text);
            }
            if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
                return invalid('invalid_value', `${expected}, got ${String(raw)}`);
            }
            if (value < min || value > max) {
                return invalid('out_of_range', `${key}: ${value} is out of range ${min}..${max}`);
            }
            return { ok: true, value };
        }

        function coercePriorityBit(key, raw) {
            let value = raw;
            if (typeof value === 'string') {
                const text = value.trim();
                if (!/^[0-9]+$/.test(text)) {
                    return invalid('invalid_value', `${key}: expected 0 or 1, got ${JSON.stringify(value)}`);
                }
                value = Number(text);
            }
            if (typeof value !== 'number' || !Number.isInteger(value) || (value !== 0 && value !== 1)) {
                return invalid('invalid_value', `${key}: expected 0 or 1, got ${String(raw)}`);
            }
            return { ok: true, value };
        }

        function siteDataToPluginVector(siteData) {
            if (!siteData || typeof siteData !== 'object' || Array.isArray(siteData)) {
                return invalid('malformed_vector', 'template data must be an object of 17 numeric fields');
            }

            const vector = {};

            for (const key of CONTROL_KEYS) {
                if (!Object.prototype.hasOwnProperty.call(siteData, key)) {
                    return invalid('malformed_vector', `template data is missing "${key}"`);
                }
                const coerced = coerceControl(key, siteData[key], CONTROL_DOMAINS[key]);
                if (!coerced.ok) return coerced;
                vector[key] = String(coerced.value);
            }

            // Missing priority bits are malformed, not zero: a native template
            // without all three bits is rejected instead of silently losing
            // its direction semantics.
            vector.priority = [];
            for (const bit of PRIORITY_BITS) {
                if (!Object.prototype.hasOwnProperty.call(siteData, bit.key)) {
                    return invalid('malformed_vector', `template data is missing "${bit.key}"`);
                }
                const coerced = coercePriorityBit(bit.key, siteData[bit.key]);
                if (!coerced.ok) return coerced;
                if (coerced.value === 1) vector.priority.push(bit.direction);
            }

            return { ok: true, data: vector };
        }

        function pluginVectorToSiteData(vector) {
            if (!vector || typeof vector !== 'object' || Array.isArray(vector)) {
                return invalid('malformed_vector', 'preset vector must be an object');
            }

            const siteData = {};

            for (const key of CONTROL_KEYS) {
                if (!Object.prototype.hasOwnProperty.call(vector, key)) {
                    return invalid('incomplete_vector', `preset vector is missing "${key}"`);
                }
                const coerced = coerceControl(key, vector[key], CONTROL_DOMAINS[key]);
                if (!coerced.ok) return coerced;
                siteData[key] = coerced.value;
            }

            if (!Array.isArray(vector.priority)) {
                return invalid('incomplete_vector', 'preset vector is missing the priority array');
            }
            const seen = Object.create(null);
            for (const member of vector.priority) {
                if (PRIORITY_DIRECTIONS.indexOf(member) === -1) {
                    return invalid('invalid_priority', `unknown priority member ${JSON.stringify(member)}`);
                }
                if (seen[member]) {
                    return invalid('invalid_priority', `duplicate priority member "${member}"`);
                }
                seen[member] = true;
            }

            // Membership <-> bit, [] <-> 0/0/0. Empty priority stays empty:
            // attacks go everywhere, it is never expanded to all-ones and
            // never treated as «disable attacks».
            siteData.priority_l = vector.priority.indexOf('left') !== -1 ? 1 : 0;
            siteData.priority_c = vector.priority.indexOf('center') !== -1 ? 1 : 0;
            siteData.priority_r = vector.priority.indexOf('right') !== -1 ? 1 : 0;

            return { ok: true, siteData };
        }

        function pluginVectorsEqual(a, b) {
            if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
            for (const key of CONTROL_KEYS) {
                if (String(a[key]) !== String(b[key])) return false;
            }
            const pa = Array.isArray(a.priority) ? a.priority.slice().sort() : [];
            const pb = Array.isArray(b.priority) ? b.priority.slice().sort() : [];
            return pa.join('|') === pb.join('|');
        }

        function siteItemToInventoryItem(raw) {
            if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
                return invalid('malformed_item', 'native template item is not an object');
            }
            const id = raw.id == null ? '' : String(raw.id);
            if (!id) {
                return invalid('malformed_item', 'native template item is missing id');
            }
            if (typeof raw.name !== 'string' || !raw.name.trim()) {
                return invalid('malformed_item', `native template ${id} has no usable name`);
            }
            const vector = siteDataToPluginVector(raw.data);
            if (!vector.ok) {
                return invalid(vector.code, `native template ${id}: ${vector.message}`);
            }
            return {
                ok: true,
                item: {
                    id,
                    userId: raw.user_id == null ? '' : String(raw.user_id),
                    name: raw.name,
                    data: vector.data,
                    time: raw.time == null ? null : String(raw.time),
                    order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : 0
                }
            };
        }

        return {
            CONTROL_DOMAINS,
            CONTROL_KEYS,
            PRIORITY_BITS,
            PRIORITY_DIRECTIONS,
            SITE_DATA_KEYS,
            siteDataToPluginVector,
            pluginVectorToSiteData,
            pluginVectorsEqual,
            siteItemToInventoryItem
        };
    })();

    const NativeTemplateApi = (() => {
        const MANAGER_URL = '/ajax/team3.9.php';
        const REQUEST_TIMEOUT_MS = 15000;

        function resolvePageWindow() {
            // Userscript runs sandboxed; page globals (TACTIC_CFG, page fetch)
            // live on unsafeWindow. Same fallback pattern as
            // match-rendering-compatibility.js / version-badge.js.
            try {
                if (typeof unsafeWindow !== 'undefined' && unsafeWindow) return unsafeWindow;
            } catch (_) { /* no userscript sandbox */ }
            if (typeof window !== 'undefined' && window) return window;
            return globalThis;
        }

        function isReadonlyTemplatePage() {
            // share.php renders shared templates read-only; it must never be
            // ingested as inventory even if a config object appears there.
            try {
                if (typeof location !== 'undefined' && location && /share\.php/.test(String(location.pathname || ''))) {
                    return true;
                }
            } catch (_) { /* no location in this context */ }
            return false;
        }

        function readTemplateConfig() {
            if (isReadonlyTemplatePage()) {
                return {
                    ok: false,
                    code: 'readonly_page',
                    items: null,
                    message: 'share.php is a readonly template view; it is never ingested as inventory'
                };
            }
            const pageWindow = resolvePageWindow();
            const config = pageWindow ? pageWindow.TACTIC_CFG : null;
            // Validated envelope: a present-but-empty items list is a real
            // (valid-empty) inventory; a missing config is NOT an empty list.
            if (!config || typeof config !== 'object' || !Array.isArray(config.items)) {
                return {
                    ok: false,
                    code: 'config_missing',
                    items: null,
                    message: 'page-embedded template config (window.TACTIC_CFG.items) is not available on this page'
                };
            }
            return { ok: true, code: 'ok', items: config.items, message: '' };
        }

        function parseManagerBody(action, text) {
            if (typeof text !== 'string' || !text.trim()) {
                return { ok: false, code: 'empty_response', message: `native template endpoint returned an empty body for ${action}` };
            }
            let payload;
            try {
                // Content-Type lies (text/html) — parse the body regardless.
                payload = JSON.parse(text);
            } catch (_) {
                return {
                    ok: false,
                    code: 'not_json',
                    message: `native template endpoint returned a non-JSON body for ${action} (expired session or HTML error page?)`
                };
            }
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return { ok: false, code: 'not_json', message: `native template endpoint returned ${typeof payload} instead of a JSON object for ${action}` };
            }
            if (payload.success !== 1) {
                return {
                    ok: false,
                    code: 'server_rejected',
                    serverCode: payload.success,
                    message: `native template endpoint rejected ${action} (success=${JSON.stringify(payload.success)})`
                };
            }
            return { ok: true, payload };
        }

        function validateTacticPayload(tactic) {
            if (!tactic || typeof tactic !== 'object' || Array.isArray(tactic)) {
                return { ok: false, code: 'invalid_payload', message: 'native template response carries no tactic object' };
            }
            const id = tactic.id == null ? '' : String(tactic.id);
            if (!id) {
                return { ok: false, code: 'invalid_payload', message: 'native template response is missing tactic.id' };
            }
            const vector = NativeTemplateMapping.siteDataToPluginVector(tactic.data);
            if (!vector.ok) {
                return { ok: false, code: 'invalid_payload', message: `native template response has invalid tactic.data: ${vector.message}` };
            }
            return {
                ok: true,
                tactic: {
                    id,
                    userId: tactic.user_id == null ? '' : String(tactic.user_id),
                    name: typeof tactic.name === 'string' ? tactic.name : String(tactic.name ?? ''),
                    data: vector.data,
                    time: tactic.time == null ? null : String(tactic.time),
                    order: Number.isFinite(Number(tactic.order)) ? Number(tactic.order) : 0
                }
            };
        }

        function serializeSaveBody(name, siteData) {
            const parts = [`name=${encodeURIComponent(String(name))}`];
            NativeTemplateMapping.SITE_DATA_KEYS.forEach(key => {
                parts.push(`data[${key}]=${encodeURIComponent(String(siteData[key]))}`);
            });
            return parts.join('&');
        }

        function serializeIdBody(fields) {
            const parts = [];
            Object.keys(fields).forEach(key => {
                parts.push(`${key}=${encodeURIComponent(String(fields[key]))}`);
            });
            return parts.join('&');
        }

        function managerRequest(action, body, options) {
            const timeoutMs = options && Number.isFinite(options.timeoutMs)
                ? options.timeoutMs
                : REQUEST_TIMEOUT_MS;

            return new Promise(resolve => {
                const pageWindow = resolvePageWindow();
                const pageFetch = pageWindow && typeof pageWindow.fetch === 'function'
                    ? pageWindow.fetch.bind(pageWindow)
                    : (typeof fetch === 'function' ? fetch : null);

                if (!pageFetch) {
                    resolve({
                        ok: false,
                        code: 'transport_unavailable',
                        message: 'no fetch transport available for native template requests'
                    });
                    return;
                }

                let settled = false;
                const finish = result => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    resolve(result);
                };

                const timer = setTimeout(() => {
                    finish({
                        ok: false,
                        code: 'timeout',
                        message: `native template request ${action} timed out after ${timeoutMs}ms; the server outcome is unknown`
                    });
                }, timeoutMs);

                let request;
                try {
                    request = Promise.resolve(pageFetch(`${MANAGER_URL}?a=${action}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
                        body,
                        credentials: 'same-origin'
                    }));
                } catch (error) {
                    finish({
                        ok: false,
                        code: 'network',
                        message: `native template request ${action} failed: ${error && error.message ? error.message : 'unknown error'}`
                    });
                    return;
                }

                request.then(response => {
                    const status = response && typeof response.status === 'number' ? response.status : 0;
                    if (status && (status < 200 || status >= 300)) {
                        finish({ ok: false, code: `http_${status}`, message: `native template endpoint returned HTTP ${status} for ${action}` });
                        return null;
                    }
                    if (!response || typeof response.text !== 'function') {
                        finish({ ok: false, code: 'unknown_outcome', message: `native template request ${action} returned no readable response; the server outcome is unknown` });
                        return null;
                    }
                    return response.text().then(text => finish(parseManagerBody(action, text)));
                }).catch(error => {
                    finish({
                        ok: false,
                        code: 'network',
                        message: `native template request ${action} failed: ${error && error.message ? error.message : 'unknown error'}`
                    });
                });
            });
        }

        function readInventory() {
            const config = readTemplateConfig();
            if (!config.ok) {
                return { ok: false, code: config.code, items: [], malformed: [], message: config.message };
            }
            const items = [];
            const malformed = [];
            config.items.forEach((raw, index) => {
                const parsed = NativeTemplateMapping.siteItemToInventoryItem(raw);
                if (parsed.ok) items.push(parsed.item);
                else malformed.push({ index, code: parsed.code, message: parsed.message });
            });
            return {
                ok: true,
                code: 'ok',
                items,
                malformed,
                message: malformed.length
                    ? `${malformed.length} malformed native template item(s) skipped`
                    : ''
            };
        }

        async function saveTemplate(name, pluginVector, options) {
            const site = NativeTemplateMapping.pluginVectorToSiteData(pluginVector);
            if (!site.ok) {
                return { ok: false, code: site.code, message: `template "${name}" rejected: ${site.message}` };
            }
            const result = await managerRequest('tactic_save', serializeSaveBody(name, site.siteData), options);
            if (!result.ok) return result;
            const tactic = validateTacticPayload(result.payload.tactic);
            if (!tactic.ok) return tactic;
            return { ok: true, tactic: tactic.tactic };
        }

        async function renameTemplate(id, name, options) {
            const body = serializeIdBody({ id, name });
            const result = await managerRequest('tactic_rename', body, options);
            if (!result.ok) return result;
            const tactic = validateTacticPayload(result.payload.tactic);
            if (!tactic.ok) return tactic;
            return { ok: true, tactic: tactic.tactic };
        }

        async function deleteTemplate(id, options) {
            const result = await managerRequest('tactic_delete', serializeIdBody({ id }), options);
            // {success:1} with no tactic payload is the documented delete ack.
            if (!result.ok) return result;
            return { ok: true };
        }

        const api = {
            MANAGER_URL,
            REQUEST_TIMEOUT_MS,
            mapping: NativeTemplateMapping,
            readTemplateConfig,
            readInventory,
            saveTemplate,
            renameTemplate,
            deleteTemplate
        };

        return api;
    })();

    // ============================================================
