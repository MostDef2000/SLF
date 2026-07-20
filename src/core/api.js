    // 2. VPS API Layer
    // ============================================================

    const API_REQUEST_TIMEOUT_MS = 15000;

    function buildApiAuthorizationHeader() {
        const token = getApiToken();
        if (!token) warnMissingApiTokenOnce();
        return "Bearer " + token;
    }

    function redactApiText(value) {
        const text = String(value || '');
        const token = String(getApiToken() || '');
        return token ? text.split(token).join('[redacted]') : text;
    }

    function safeApiResponseMetadata(response) {
        const numericStatus = Number(response?.status || 0);
        return {
            status: Number.isFinite(numericStatus) ? numericStatus : 0,
            statusText: redactApiText(response?.statusText),
            finalUrl: redactApiText(response?.finalUrl || response?.responseURL)
        };
    }

    function createApiError(kind, context, response) {
        const metadata = safeApiResponseMetadata(response);
        const operation = redactApiText(context.operation || context.collection);
        const statusSuffix = metadata.status ? ` (HTTP ${metadata.status})` : '';
        const error = new Error(`SLF API ${kind} error during ${operation}${statusSuffix}`);

        error.name = 'SLFApiError';
        error.kind = kind;
        error.method = context.method;
        error.collection = redactApiText(context.collection);
        error.operation = operation;
        error.status = metadata.status;
        error.statusText = metadata.statusText;
        error.response = metadata;

        return error;
    }

    function requestApi({ method, collection, data, label, parseJson }) {
        const context = {
            method,
            collection: String(collection || ''),
            operation: String(label || `${method} ${collection || ''}`)
        };

        return new Promise((resolve, reject) => {
            const request = {
                method,
                url: `${CONFIG.SERVER_URL}/api/${collection}`,
                headers: {
                    "Authorization": buildApiAuthorizationHeader()
                },
                timeout: API_REQUEST_TIMEOUT_MS,
                onload: response => {
                    const metadata = safeApiResponseMetadata(response);

                    if (metadata.status < 200 || metadata.status >= 300) {
                        reject(createApiError('http', context, response));
                        return;
                    }

                    if (!parseJson) {
                        resolve({ response: metadata, status: metadata.status, data });
                        return;
                    }

                    try {
                        resolve({
                            data: JSON.parse(response.responseText),
                            response: metadata,
                            status: metadata.status
                        });
                    } catch (_) {
                        reject(createApiError('parse', context, response));
                    }
                },
                onerror: response => reject(createApiError('network', context, response)),
                ontimeout: response => reject(createApiError('timeout', context, response)),
                onabort: response => reject(createApiError('abort', context, response))
            };

            if (method === 'POST') {
                request.headers["Content-Type"] = "application/json";
                request.data = JSON.stringify(data);
            }

            GM_xmlhttpRequest(request);
        });
    }

    const Api = {
        postPromise(collection, data, label) {
            return requestApi({
                method: 'POST',
                collection,
                data,
                label: label || collection,
                parseJson: false
            });
        },

        post(collection, data, label) {
            return this.postPromise(collection, data, label)
                .then(result => {
                    debugLog(`[SLF] ${label || collection} saved:`, result.status);
                    return result;
                })
                .catch(error => {
                    debugWarn(`[SLF] ${label || collection} save error:`, error);
                    throw error;
                });
        },

        postAppend(collection, data, label) {
            const payload = Array.isArray(data) ? data : [data];
            return this.post(`${collection}?mode=append`, payload, label || `${collection} append`);
        },

        clearCollection(collection, label) {
            return this.post(collection, [], label || `${collection} clear`);
        },

        getPromise(collection, label) {
            return requestApi({
                method: 'GET',
                collection,
                label: label || collection,
                parseJson: true
            });
        },

        get(collection, onSuccess, onError) {
            return this.getPromise(collection)
                .then(({ data, response }) => {
                    if (onSuccess) onSuccess(data, response);
                    return data;
                })
                .catch(error => {
                    if (onError) onError(error, error.response);
                    throw error;
                });
        },

        getAnalysis(onSuccess, onError) {
            return this.get("analysis", onSuccess, onError);
        }
    };

    function normalizeServerRows(data) {
        if (Array.isArray(data)) return data;
        if (!data || typeof data !== 'object') return [];
        if (Array.isArray(data.data)) return data.data;
        if (Array.isArray(data.items)) return data.items;
        if (Object.keys(data).length === 0) return [];
        return [data];
    }

    function payloadType(data) {
        if (Array.isArray(data)) return 'array';
        if (!data) return String(data);
        if (typeof data === 'object' && Object.keys(data).length === 0) return 'empty_object';
        return typeof data;
    }

    function fetchCanonicalApiStatus() {
        const specs = [
            { key: 'snapshots', label: 'Snapshots v2', collection: CONFIG.COLLECTIONS.MATCH_SNAPSHOTS },
            { key: 'results', label: 'Match results v2', collection: CONFIG.COLLECTIONS.MATCH_RESULTS },
            { key: 'events', label: 'Preset events v2', collection: CONFIG.COLLECTIONS.PRESET_EVENTS },
            { key: 'effects', label: 'Preset effects v2', collection: CONFIG.COLLECTIONS.PRESET_EFFECTS },
            { key: 'players', label: 'Player observations', collection: CONFIG.COLLECTIONS.PLAYER_OBSERVATIONS },
            { key: 'transfers', label: 'Transfer history', collection: CONFIG.COLLECTIONS.TRANSFER_HISTORY },
            { key: 'tactics', label: 'Tactics', collection: CONFIG.COLLECTIONS.TACTICS }
        ];

        return Promise.all(specs.map(spec => {
            return Api.getPromise(spec.collection)
                .then(({ data }) => {
                    const rows = normalizeServerRows(data);
                    return Object.assign({}, spec, {
                        ok: true,
                        count: rows.length,
                        rows,
                        payloadType: payloadType(data)
                    });
                })
                .catch(error => Object.assign({}, spec, {
                    ok: false,
                    count: 0,
                    rows: [],
                    error
                }));
        })).then(items => {
            const collections = {};
            const gameIds = new Set();

            items.forEach(item => {
                collections[item.key] = item;
                if (['snapshots', 'results', 'events', 'effects'].includes(item.key)) {
                    item.rows.forEach(row => {
                        if (row && row.gameId) gameIds.add(String(row.gameId));
                    });
                }
            });

            return {
                generatedAt: new Date().toISOString(),
                schema: 'slf_canonical_api_status_v1',
                games: gameIds.size,
                collections
            };
        });
    }

    function legacyCollectionNames() {
        return [
            CONFIG.LEGACY_COLLECTIONS.MATCH_SNAPSHOTS,
            CONFIG.LEGACY_COLLECTIONS.MATCH_RESULTS,
            CONFIG.LEGACY_COLLECTIONS.PRESET_EVENTS,
            CONFIG.LEGACY_COLLECTIONS.PRESET_EFFECTS
        ];
    }

    // ============================================================
