    // 2. VPS API Layer
    // ============================================================

    function buildApiAuthorizationHeader() {
        const token = getApiToken();
        if (!token) warnMissingApiTokenOnce();
        return "Bearer " + token;
    }

    const Api = (() => {
        const API_REQUEST_TIMEOUT_MS = 15000;

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

        const api = {
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

        return api;
    })();

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
        const keyToCollection = {
            snapshots: CONFIG.COLLECTIONS.MATCH_SNAPSHOTS,
            results: CONFIG.COLLECTIONS.MATCH_RESULTS,
            events: CONFIG.COLLECTIONS.PRESET_EVENTS,
            effects: CONFIG.COLLECTIONS.PRESET_EFFECTS,
            players: CONFIG.COLLECTIONS.PLAYER_OBSERVATIONS,
            transfers: CONFIG.COLLECTIONS.TRANSFER_HISTORY,
            tactics: CONFIG.COLLECTIONS.TACTICS
        };

        return Api.getPromise('analysis')
            .then(({ data }) => {
                const health = (data && data.collections) || {};
                const collections = {};
                let degraded = false;

                Object.keys(keyToCollection).forEach(key => {
                    const name = keyToCollection[key];
                    const entry = health[name];
                    if (!entry || entry.exists === false) {
                        collections[key] = {
                            ok: false,
                            missing: !entry,
                            exists: entry ? entry.exists : false,
                            valid: entry ? entry.valid : false,
                            count: 0
                        };
                        degraded = true;
                        return;
                    }
                    const ok = entry.valid !== false;
                    if (!ok) degraded = true;
                    collections[key] = {
                        ok,
                        count: Number.isFinite(entry.count) ? entry.count : 0,
                        exists: entry.exists,
                        valid: entry.valid,
                        corrupt: entry.valid === false,
                        type: entry.type,
                        fileSize: entry.fileSize,
                        duplicateKeys: entry.duplicateKeys,
                        missingUniqueKeys: entry.missingUniqueKeys
                    };
                });

                return {
                    generatedAt: new Date().toISOString(),
                    schema: 'slf_canonical_api_status_v2',
                    status: (data && data.status) ? data.status : (degraded ? 'degraded' : 'ok'),
                    games: (data && Number.isFinite(data.games)) ? data.games : 0,
                    collections
                };
            })
            .catch(error => {
                // Surface the failure instead of masking it as zeros.
                const wrapped = new Error(`SLF API analysis request failed: ${error && error.message ? error.message : 'unknown'}`);
                wrapped.name = 'SLFApiStatusError';
                wrapped.kind = error && error.kind ? error.kind : 'network';
                wrapped.cause = error;
                throw wrapped;
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
