// Transfer Analyzer: compact PlayerStateStore
// Quota-safe per-player persistence with saveAnalysis API.
(function () {
  if (typeof window === 'undefined') return;

  const PREFIX = 'slf_ps2_';
  const INDEX_KEY = 'slf_ps2_index';
  const LEGACY_KEY = 'slf_player_state_v1';
  const TTL_MS = 7 * 24 * 60 * 60 * 1000;

  const now = () => Date.now();
  const key = id => PREFIX + String(id || '').trim();
  const parse = (v, f) => { try { return JSON.parse(v || '') || f; } catch { return f; } };
  const readIndex = () => {
    const v = parse(localStorage.getItem(INDEX_KEY), []);
    return Array.isArray(v) ? v.map(String) : [];
  };
  const writeIndex = ids => {
    try { localStorage.setItem(INDEX_KEY, JSON.stringify([...new Set((ids || []).map(String).filter(Boolean))].slice(-1000))); } catch (e) { console.warn(e); }
  };
  const addIndex = id => {
    const ids = readIndex();
    if (!ids.includes(String(id))) { ids.push(String(id)); writeIndex(ids); }
  };
  const expired = item => !item || !item.t || now() - Number(item.t || 0) > TTL_MS;
  const prune = () => {
    const items = readIndex().map(id => ({ id, item: get(id, true) })).filter(x => x.item?.t).sort((a, b) => a.item.t - b.item.t);
    const n = Math.max(10, Math.ceil(items.length * 0.15));
    items.slice(0, n).forEach(x => localStorage.removeItem(key(x.id)));
    writeIndex(items.slice(n).map(x => x.id));
  };

  function get(id, raw = false) {
    id = String(id || '').trim();
    if (!id) return null;
    const item = parse(localStorage.getItem(key(id)), null);
    if (raw) return item;
    if (item && !expired(item)) return item;
    if (item) localStorage.removeItem(key(id));
    const legacy = parse(localStorage.getItem(LEGACY_KEY), {})?.[id] || null;
    return legacy && !expired(legacy) ? legacy : null;
  }

  function set(id, item) {
    id = String(id || '').trim();
    if (!id || !item) return false;
    const payload = JSON.stringify({ ...item, id, v: 2, t: now() });
    try {
      localStorage.setItem(key(id), payload);
      addIndex(id);
      return true;
    } catch (e) {
      prune();
      try { localStorage.setItem(key(id), payload); addIndex(id); return true; } catch (e2) { console.warn('[SLF PlayerStateStore] write failed', id, e2); return false; }
    }
  }

  function compactProfile(p) {
    if (!p) return null;
    return {
      tmUrl: p.tmUrl || '',
      marketValueEur: Number(p.marketValueEur || 0),
      lastKnownMarketValueEur: Number(p.lastKnownMarketValueEur || 0),
      marketValueText: p.marketValueText || '',
      highestMarketValueEur: Number(p.highestMarketValueEur || 0),
      highestMarketValueDate: p.highestMarketValueDate || '',
      valuePeakRatio: Number(p.valuePeakRatio || 0),
      currentClub: p.currentClub || '',
      playerAgent: p.playerAgent || '',
      contractExpires: p.contractExpires || '',
      age: p.age ?? null,
      isRetired: p.isRetired === true,
      isFreeAgent: p.isFreeAgent === true,
      transferHistory: (p.transferHistory || []).slice(0, 6).map(x => ({ text: String(x?.text || '').slice(0, 160) })),
      youthClubs: (p.youthClubs || []).slice(0, 6).map(x => String(x || '').slice(0, 80)),
      rumors: (p.rumors || []).slice(0, 4).map(x => ({ text: String(x?.text || '').slice(0, 140), dateTs: Number(x?.dateTs || 0) }))
    };
  }

  function compactAlter(a) {
    if (!a) return null;
    const row = r => r ? { season: r.season || '', seasonLabel: r.seasonLabel || '', leagueLevel: r.leagueLevel ?? null, leagueSkill: r.leagueSkill ?? null, minutesPct: r.minutesPct ?? null, minutes: r.minutes ?? null } : null;
    return {
      currentSkill: a.currentSkill ?? null,
      finalSkill: a.finalSkill ?? null,
      skillDelta: a.skillDelta ?? null,
      age: a.age ?? null,
      talent: a.talent ?? null,
      hasCurrentSeason: a.hasCurrentSeason === true,
      staleActivity: a.staleActivity === true,
      currentRow: row(a.currentRow),
      talentUpgradeEligible: a.talentUpgradeEligible === true,
      talentUpgradeRow: row(a.talentUpgradeRow),
      leagueAboveSkill: a.leagueAboveSkill === true
    };
  }

  function compactRow(r) {
    return r ? {
      playerId: String(r.playerId || ''), playerUrl: r.playerUrl || '', name: r.name || '', positions: Array.isArray(r.positions) ? r.positions.slice(0, 4) : [],
      age: r.age ?? null, talent: r.talent ?? null, scoutSkill: r.scoutSkill ?? null, potentialText: r.potentialText || '',
      slfPrice: r.slfPrice ?? null, slfPriceText: r.slfPriceText || '', slfPriceCellText: r.slfPriceCellText || '',
      slfSecondaryPrice: r.slfSecondaryPrice ?? null, slfSecondaryPriceText: r.slfSecondaryPriceText || '', nominalRatio: r.nominalRatio ?? null, nominalBase: r.nominalBase ?? null
    } : null;
  }

  function saveAnalysis(row, enriched, slfAlter) {
    const id = String(row?.playerId || enriched?.playerId || '').trim();
    if (!id) return false;
    const p = enriched?.tmProfile || row?.tmProfile || null;
    const a = slfAlter || row?.slfAlter || null;
    return set(id, { row: compactRow(row), tmUrl: enriched?.tmUrl || p?.tmUrl || row?.tmUrl || '', tmValueEur: Number(p?.marketValueEur || p?.lastKnownMarketValueEur || row?.tmValueEur || 0), tmProfile: compactProfile(p), slfAlter: compactAlter(a) });
  }

  function upsert(id, patch) {
    return set(id, { ...(get(id) || {}), ...(patch || {}) });
  }

  function batchUpsert(arr) {
    (arr || []).forEach(x => x?.playerId && upsert(x.playerId, x.patch || x));
  }

  function clear() {
    readIndex().forEach(id => localStorage.removeItem(key(id)));
    localStorage.removeItem(INDEX_KEY);
    localStorage.removeItem(LEGACY_KEY);
  }

  window.SLF = window.SLF || {};
  window.SLF.PlayerStateStore = { KEY: INDEX_KEY, PREFIX, TTL_MS, get, upsert, batchUpsert, saveAnalysis, load: () => Object.fromEntries(readIndex().map(id => [id, get(id)]).filter(([, v]) => !!v)), clear, stats: () => ({ index: readIndex().length, key: INDEX_KEY, prefix: PREFIX }) };
})();
