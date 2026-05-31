    // 2. VPS API Layer
    // ============================================================

    const Api = {
        postPromise(collection, data, label) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: "POST",
                    url: `${CONFIG.SERVER_URL}/api/${collection}`,
                    headers: {
                        "Authorization": "Bearer " + CONFIG.TOKEN,
                        "Content-Type": "application/json"
                    },
                    data: JSON.stringify(data),
                    onload: r => resolve({ response: r, status: r.status, data }),
                    onerror: e => reject(e)
                });
            });
        },

        post(collection, data, label) {
            return this.postPromise(collection, data, label)
                .then(result => {
                    debugLog(`[SLF] ${label || collection} saved:`, result.status, data);
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

        getPromise(collection) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: "GET",
                    url: `${CONFIG.SERVER_URL}/api/${collection}`,
                    headers: {
                        "Authorization": "Bearer " + CONFIG.TOKEN
                    },
                    onload: r => {
                        try {
                            resolve({ data: JSON.parse(r.responseText), response: r, status: r.status });
                        } catch (e) {
                            reject({ error: e, response: r });
                        }
                    },
                    onerror: e => reject({ error: e })
                });
            });
        },

        get(collection, onSuccess, onError) {
            return this.getPromise(collection)
                .then(({ data, response }) => {
                    if (onSuccess) onSuccess(data, response);
                    return data;
                })
                .catch(payload => {
                    if (onError) onError(payload.error || payload, payload.response);
                    throw payload.error || payload;
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
