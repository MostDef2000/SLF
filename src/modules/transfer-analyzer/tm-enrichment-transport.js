// Tm Enrichment Transport
// Extracted verbatim from tm-enrichment-layer.js (stage 3 refactor).
// Assigned onto the TMEnrichmentLayer facade; behaviour unchanged.

if (typeof TMEnrichmentLayer !== 'undefined' && TMEnrichmentLayer) {
    TMEnrichmentLayer.stage3TmEnrichmentTransportApplied = true;

    Object.assign(TMEnrichmentLayer, {
    async throttle() {
        const diff = Date.now() - this._lastRequestAt;
        const wait = Math.max(0, this.requestDelayMs - diff);

        if (wait > 0) {
            await new Promise(resolve => setTimeout(resolve, wait));
        }

        this._lastRequestAt = Date.now();
    },

    fetchUrl(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9,ru;q=0.8'
                },
                timeout: 30000,
                onload: r => resolve(r.responseText || ''),
                onerror: reject,
                ontimeout: reject
            });
        });
    },

    parseHtml(html) {
        return new DOMParser().parseFromString(html || '', 'text/html');
    },

    });
}
