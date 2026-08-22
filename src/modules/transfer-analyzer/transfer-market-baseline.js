// Transfer Market Baseline
// Extracted verbatim from transfer-market-analyzer.js (stage 1 refactor).
// Assigned onto the TransferMarketAnalyzer facade; behaviour unchanged.

if (typeof TransferMarketAnalyzer !== 'undefined' && TransferMarketAnalyzer) {
    TransferMarketAnalyzer.stage1MarketBaselineApplied = true;

    Object.assign(TransferMarketAnalyzer, {
    loadMarketBaseline() {
        if (this.marketBaseline) return Promise.resolve(this.marketBaseline);
        if (this.marketBaselinePromise) return this.marketBaselinePromise;

        this.marketBaselinePromise = Api.getPromise(CONFIG.COLLECTIONS.TRANSFER_HISTORY)
            .then(({ data }) => {
                const rows = normalizeServerRows(data);
                this.marketBaseline = this.buildMarketBaseline(rows);
                return this.marketBaseline;
            })
            .catch(error => {
                this.marketBaseline = { ready: false, error, byKey: {}, generatedAt: Date.now() };
                return this.marketBaseline;
            });

        return this.marketBaselinePromise;
    },

    buildMarketBaseline(rows) {
        const buckets = {};
        const add = (key, value) => {
            if (!key || !value || !Number.isFinite(value)) return;
            if (!buckets[key]) buckets[key] = [];
            buckets[key].push(value);
        };

        (rows || []).forEach(event => {
            if (!event || event.recordType !== 'completed_transfer') return;

            const price = Number(event.transfer?.price || 0);
            if (!price || price < 1) return;

            const player = event.player || {};
            const pos = this.normalizeMarketPosition(player.primaryPosition || (Array.isArray(player.positions) ? player.positions[0] : ''));
            const ageBucket = this.getMarketAgeBucket(player.age);
            const talentBucket = this.getMarketTalentBucket(player.talent);
            const alterSummary = event.enrichment?.slfAlterSummary || {};
            const finalSkill = player.finalSkill ?? alterSummary.finalSkill ?? null;
            const skillBucket = this.getMarketSkillBucket(finalSkill ?? player.skill ?? player.scoutSkill ?? player.currentSkill);

            add('all', price);
            if (pos) add(`pos:${pos}`, price);
            if (ageBucket) add(`age:${ageBucket}`, price);
            if (skillBucket) add(`skill:${skillBucket}`, price);
            if (pos && ageBucket) add(`pos:${pos}|age:${ageBucket}`, price);
            if (pos && talentBucket) add(`pos:${pos}|talent:${talentBucket}`, price);
            if (pos && skillBucket) add(`pos:${pos}|skill:${skillBucket}`, price);
            if (pos && ageBucket && talentBucket && skillBucket) add(`pos:${pos}|age:${ageBucket}|talent:${talentBucket}|skill:${skillBucket}`, price);
        });

        const byKey = {};
        Object.entries(buckets).forEach(([key, values]) => {
            const sorted = values.slice().sort((a, b) => a - b);
            byKey[key] = this.summarizeMarketValues(sorted);
        });

        return {
            ready: true,
            generatedAt: Date.now(),
            byKey
        };
    },

    summarizeMarketValues(values) {
        const n = values.length;
        const at = pct => values[Math.min(n - 1, Math.max(0, Math.floor((n - 1) * pct)))] || null;
        const sum = values.reduce((acc, value) => acc + Number(value || 0), 0);

        return {
            count: n,
            min: values[0] || null,
            p25: at(0.25),
            median: at(0.50),
            p75: at(0.75),
            max: values[n - 1] || null,
            avg: n ? Math.round(sum / n) : null,
            confidence: n >= 20 ? 'high' : n >= 8 ? 'medium' : n >= 3 ? 'low' : 'weak'
        };
    },

    normalizeMarketPosition(value) {
        const raw = String(value || '').toUpperCase().trim();
        if (!raw) return '';
        if (raw === 'GK') return 'GK';
        if (raw === 'LD' || raw === 'DL' || raw === 'LB') return 'DL';
        if (raw === 'RD' || raw === 'DR' || raw === 'RB') return 'DR';
        if (/^CD|^DC|CB/.test(raw)) return 'DC';
        if (/^DM/.test(raw)) return 'DM';
        if (/^CM/.test(raw)) return 'CM';
        if (/^AM/.test(raw)) return 'AM';
        if (raw === 'LM' || raw === 'LW' || raw === 'ML') return 'ML';
        if (raw === 'RM' || raw === 'RW' || raw === 'MR') return 'MR';
        if (/^ST|CF/.test(raw)) return 'ST';
        return raw;
    },

    getMarketAgeBucket(age) {
        const n = Number(age || 0);
        if (!n) return '';
        if (n <= 18) return 'u18';
        if (n <= 21) return 'u21';
        if (n <= 24) return 'u24';
        if (n <= 29) return 'prime';
        if (n <= 32) return 'short';
        return 'vet';
    },

    getMarketTalentBucket(talent) {
        const n = Number(talent || 0);
        if (!n) return '';
        if (n <= 2) return 't1_2';
        if (n <= 4) return 't3_4';
        if (n <= 6) return 't5_6';
        if (n <= 8) return 't7_8';
        return 't9p';
    },

    getMarketSkillBucket(skill) {
        const n = Number(skill || 0);
        if (!n) return '';
        if (n < 20) return 's00_19';
        if (n < 30) return 's20_29';
        if (n < 40) return 's30_39';
        if (n < 50) return 's40_49';
        if (n < 60) return 's50_59';
        if (n < 70) return 's60_69';
        return 's70p';
    },

    getMarketSkillBasis(row, slfAlter) {
        const finalSkill = slfAlter?.finalSkill != null ? Number(slfAlter.finalSkill) : null;
        const currentSkill = slfAlter?.currentSkill != null ? Number(slfAlter.currentSkill) : null;
        const pageSkill = row?.scoutSkill != null ? Number(row.scoutSkill) : null;

        if (Number.isFinite(finalSkill) && finalSkill > 0) {
            return {
                skill: finalSkill,
                source: 'alter_final_skill',
                label: `ИТОГ alter.php ${SLFAlterLayer.formatSkill(finalSkill)}`,
                currentSkill: Number.isFinite(currentSkill) ? currentSkill : null,
                pageSkill: Number.isFinite(pageSkill) ? pageSkill : null,
                lowConfidence: false,
                missing: false
            };
        }

        return {
            skill: null,
            source: slfAlter ? 'alter_without_final_skill' : 'alter_missing',
            label: slfAlter ? 'ИТОГ alter.php не распознан' : 'alter.php не загружен',
            currentSkill: Number.isFinite(currentSkill) ? currentSkill : null,
            pageSkill: Number.isFinite(pageSkill) ? pageSkill : null,
            lowConfidence: true,
            missing: true
        };
    },

    findMarketBaseline(row, slfAlter) {
        const baseline = this.marketBaseline;
        if (!baseline?.ready) return null;

        const skillBasis = this.getMarketSkillBasis(row, slfAlter);
        const pos = this.normalizeMarketPosition((row.positions || [])[0]);
        const ageBucket = this.getMarketAgeBucket(row.age);
        const talentBucket = this.getMarketTalentBucket(row.talent);
        const skillBucket = this.getMarketSkillBucket(skillBasis.skill);
        const keys = [
            pos && ageBucket && talentBucket && skillBucket ? `pos:${pos}|age:${ageBucket}|talent:${talentBucket}|skill:${skillBucket}` : '',
            pos && skillBucket ? `pos:${pos}|skill:${skillBucket}` : '',
            pos && ageBucket ? `pos:${pos}|age:${ageBucket}` : '',
            pos && talentBucket ? `pos:${pos}|talent:${talentBucket}` : '',
            pos ? `pos:${pos}` : '',
            skillBucket ? `skill:${skillBucket}` : '',
            ageBucket ? `age:${ageBucket}` : '',
            'all'
        ].filter(Boolean);

        for (const key of keys) {
            const item = baseline.byKey?.[key];
            if (item && item.count >= 3) {
                return Object.assign({ key }, item);
            }
        }

        return null;
    },

    });
}
