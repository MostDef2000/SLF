#!/usr/bin/env node
// SLF issue #405 — Tactics 2026 revision: R2 semantic fixes (work order R2).
// Regression layer over the REAL modules (vm sandbox, no mocks of the code
// under test — mirrors tests/test-tactic-suite-v12-lead-press-hold.mjs).
//
// Covered behavior (fix sites F1–F7, claim citations in comments):
//   F1  cross control label = «навесы верхом» (C323: настройка влияет только
//       на верховые кроссы; низовые driven by острота/центр/диагонали).
//   F2  re-plan cross advice qualifies aerial vs ground (C323); the
//       crosses_bad_total branch keeps its semantics.
//   F3  user-facing «хаос» phrasing replaced by risk wording (C335: no
//       controllable chaos mechanism exists).
//   F4  aerial-cross fit penalty applies only to explicit cross traits;
//       width-only traits are no longer penalized as aerial-cross conflicts
//       (C323) — ranking changes are asserted.
//   F5  19×5-minute segment model (C1: матч — 19 отрезков по 5 минут, каждый
//       генерируется прямо перед показом; смена тактики сдвигает ближайший
//       отрезок) alongside the legacy analytical GENERATION_WINDOWS; legacy
//       window fields keep their values (persisted telemetry compatibility).
//   F6  generationWindowIndex fallback derives from the 5-minute segment
//       model instead of the retired 10-minute bucket implication.
//   F7  high-press presets (press_intense>=3) carry a user-facing ПИ-role
//       note (C324, C379) — a note, not a veto; entry conditions unchanged.
//   R1  tripwire: all 13×15 PRESETS numeric vectors stay byte-identical.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

// --- F1: cross control label is aerial-only (C323) ----------------------------
// strategy-data-task-a-ui-extension.js is a load-time UI IIFE (DOM-bound), so
// the label map is asserted against the source (established source-text
// convention, see test-tactic-suite-v12-lead-press-hold.mjs §2).
{
    const source = read('src/modules/strategy-data-recommendations/strategy-data-task-a-ui-extension.js');
    assert.ok(source.includes("cross: 'навесы верхом'"), "F1: FINAL_CONTROL_LABELS.cross reads «навесы верхом» (C323)");
    assert.ok(!source.includes("cross: 'кроссы'"), 'F1: old ambiguous «кроссы» label removed');
}

// --- F2/F3: re-plan advice wording (C323, C335) -------------------------------
{
    const source = read('src/modules/strategy-data-recommendations/re-plan-engine.js');
    assert.ok(
        source.includes('проверьте отдельно верховые и низовые; настройка навесов влияет только на верховые (C323)'),
        'F2: developer advice qualifies aerial vs ground crosses (C323)'
    );
    assert.ok(
        source.includes('не повышать навесы верхом; низовой вход — острота передач, атаки по центру, диагонали (C323)'),
        'F2: control advice targets aerial crosses only; ground entry via острота/центр/диагонали'
    );
    assert.ok(
        source.includes('Кроссы в целом слабые'),
        'F2: crosses_bad_total branch semantics preserved'
    );
    assert.ok(!source.includes('убрать хаос'), 'F3: «убрать хаос» phrasing removed (C335)');
    assert.ok(!source.includes('снижение хаоса'), 'F3: «снижение хаоса» phrasing removed (C335)');
    assert.ok(source.includes('снижение риска'), 'F3: risk phrasing present');
}

// --- F4: aerial-cross vs width fit scoring (C323) ------------------------------
const scoringSandbox = {
    console, Date, Math, JSON, Number, String, Object, Array, Set, Map, Promise,
    setTimeout: () => 0, clearTimeout: () => {}
};
scoringSandbox.window = scoringSandbox;
scoringSandbox.globalThis = scoringSandbox;
scoringSandbox.RecommendationEngine = {};
vm.createContext(scoringSandbox);
vm.runInContext(read('src/modules/strategy-data-recommendations/preset-fit-scoring.js'), scoringSandbox, { filename: 'preset-fit-scoring.js' });
const Fit = scoringSandbox.RecommendationEngine;

{
    const ownCrossBad = { tags: ['own_open_play_crosses_bad'] };

    // (a) explicit cross trait still takes the aerial-cross conflict penalty
    const crossFit = Fit.scorePresetCrossFit(
        { strengths: ['aerial_crosses'], avoids: [], build: 'patient_progression' },
        ownCrossBad
    );
    assert.equal(crossFit.score, -3, 'F4: explicit cross strength keeps the -3 aerial-cross conflict penalty');
    assert.ok(crossFit.reasons.some(r => r.delta === -3), 'F4: penalty reason recorded');

    // (b) width-only trait is NOT penalized as an aerial-cross conflict
    const wideOnlyFit = Fit.scorePresetCrossFit(
        { strengths: ['wide_channels'], avoids: [], build: 'fixed_lineup_wide_channels' },
        ownCrossBad
    );
    assert.equal(wideOnlyFit.score, 0, 'F4: width-only traits no longer take the aerial-cross penalty (C323: ground crosses ≠ width)');

    // (c) mixed: wide + explicit cross still penalized
    const wideAndCross = Fit.scorePresetCrossFit(
        { strengths: ['wide_channels', 'crosses'], avoids: [], build: 'wide' },
        ownCrossBad
    );
    assert.equal(wideAndCross.score, -3, 'F4: explicit cross alongside width still penalized');

    // (d) avoid-bonus path unchanged: +2 for the explicit avoid, and the
    // avoid path must not also apply the aerial-cross penalty.
    const avoidFit = Fit.scorePresetCrossFit(
        { strengths: ['aerial_crosses'], avoids: ['own_crosses_bad'], build: 'patient_progression' },
        ownCrossBad
    );
    assert.equal(avoidFit.score, 2, 'F4: own_crosses_bad avoid-bonus unchanged (+2)');
    assert.ok(avoidFit.reasons.some(reason => reason.delta === 2), 'F4: avoid-bonus reason recorded');
    assert.ok(!avoidFit.reasons.some(reason => reason.delta === -3), 'F4: avoid-bonus path does not also apply the penalty');

    // (e) ranking impact through the real fusion scorer: a width-only preset
    // no longer loses to the -3 aerial-cross penalty under bad own crosses.
    const library = {
        getTraits(name) {
            return name === 'preset_cross'
                ? { strengths: ['crosses'], avoids: [], build: 'aerial_loading', tempo: 'medium', press: 'medium', risk: 'medium' }
                : { strengths: ['wide_channels'], avoids: [], build: 'fixed_lineup_wide_channels', tempo: 'medium', press: 'medium', risk: 'medium' };
        }
    };
    const rankSandbox = {
        console, Date, Math, JSON, Number, String, Object, Array, Set, Map, Promise,
        setTimeout: () => 0, clearTimeout: () => {}
    };
    rankSandbox.window = rankSandbox;
    rankSandbox.globalThis = rankSandbox;
    rankSandbox.RecommendationEngine = {};
    rankSandbox.TacticPresetLibrary = library;
    vm.createContext(rankSandbox);
    vm.runInContext(read('src/modules/strategy-data-recommendations/preset-fit-scoring.js'), rankSandbox, { filename: 'preset-fit-scoring.js' });
    const rankState = { tags: ['own_open_play_crosses_bad'], minute: 30, score: { state: 'draw', diff: 0 } };
    const crossRanked = rankSandbox.RecommendationEngine.scorePresetFit('preset_cross', rankState);
    const wideRanked = rankSandbox.RecommendationEngine.scorePresetFit('preset_wide', rankState);
    assert.equal(crossRanked.parts.cross.score, -3, 'F4: cross-trait preset fit score carries the -3 penalty');
    assert.ok(!wideRanked.reasons.some(reason => reason.delta === -3), 'F4: wide-only preset is not aerial-cross penalized');
    assert.ok(wideRanked.score > crossRanked.score, 'F4: ranking changes — wide-only preset now outranks cross-trait preset under bad own crosses');
}

// --- F5: 19×5-minute segment model + legacy windows (C1, C234) -----------------
const timingSandbox = {
    console, Date, Math, JSON, Number, String, Object, Array, Set, Map, Promise,
    setTimeout: () => 0, clearTimeout: () => {},
    document: { readyState: 'complete', querySelector: () => null, body: { innerText: '' } },
    location: { search: '' }, URLSearchParams, URL
};
timingSandbox.window = timingSandbox;
timingSandbox.globalThis = timingSandbox;
vm.createContext(timingSandbox);
vm.runInContext(read('src/modules/match-reading/match-state-parser.js'), timingSandbox, { filename: 'match-state-parser.js' });
vm.runInContext('this.__slf405Timing = { MatchTimingModel, MatchStateParser };', timingSandbox, { filename: 'timing-bridge.js' });
const Timing = timingSandbox.window.__slf405Timing.MatchTimingModel;

{
    // Segment model constants (C1: 19 отрезков по 5 минут)
    assert.equal(Timing.SEGMENT_COUNT, 19, '19 segments in the 2026 generation model');
    assert.equal(Timing.SEGMENT_MINUTES, 5, 'segments are 5 official minutes');

    // Boundaries: segment N covers minutes (N-1)*5+1 .. N*5; segment 19 = 91-95 stoppage.
    assert.deepEqual(
        [1, 5, 6, 11, 45, 46, 85, 86, 90, 91, 95].map(m => {
            const s = Timing.getSegment(m);
            return [s.index, s.from, s.to];
        }),
        [
            [1, 1, 5], [1, 1, 5], [2, 6, 10], [3, 11, 15], [9, 41, 45], [10, 46, 50],
            [17, 81, 85], [18, 86, 90], [18, 86, 90], [19, 91, 95], [19, 91, 95]
        ],
        'segment boundaries: 19×5 minutes, segment 19 covers stoppage 91-95'
    );
    assert.equal(Timing.getSegment(97).index, 19, 'stoppage beyond 95 clamps to segment 19');
    assert.equal(Timing.getSegment(0).index, 0, 'unknown minute → segment 0');
    assert.equal(Timing.getSegment(null).index, 0, 'missing minute → segment 0');
    assert.equal(Timing.getSegmentIndex(12), 3, 'segment index helper: minute 12 → 3');
    assert.equal(Timing.getSegmentIndex(91), 19, 'segment index helper: stoppage 91 → 19');

    // Contiguity: 19 segments tile 1..95 without gaps.
    for (let index = 1; index <= 19; index++) {
        const segment = Timing.getSegment(index * 5);
        assert.equal(segment.index, index, `minute ${index * 5} → segment ${index}`);
        assert.equal(segment.to - segment.from + 1, 5, `segment ${index} spans 5 minutes`);
        if (index > 1) assert.equal(segment.from, Timing.getSegment((index - 1) * 5).to + 1, 'segments are contiguous');
    }

    // getTargetWindowAfterChange targets the NEXT 5-minute segment (C1: a
    // tactics change shifts the nearest segment), legacy fields unchanged.
    const target = Timing.getTargetWindowAfterChange(12);
    assert.equal(target.segmentIndex, 4, 'target segment after a change at minute 12 is segment 4');
    assert.equal(target.segmentFrom, 16, 'target segment starts at the next 5-minute boundary');
    assert.equal(target.segmentTo, 20, 'target segment ends at minute 20');
    assert.equal(target.segmentLabel, '16-20', 'target segment label');
    // Legacy analytical fields keep their pre-#405 values (telemetry compat):
    assert.equal(target.index, 2, 'legacy analytical window index unchanged (16-30 window)');
    assert.equal(target.label, '16-30', 'legacy analytical window label unchanged');
    assert.equal(target.generationMinutes, 15, 'legacy generationMinutes unchanged');

    // Legacy analytical windows intact (persisted telemetry compatibility).
    assert.equal(Timing.GENERATION_WINDOWS.length, 7, '7 analytical GENERATION_WINDOWS kept');
    assert.equal(Timing.getWindow(12).index, 1, 'getWindow(12) → analytical window 1');
    assert.equal(Timing.getWindow(12).label, '01-15', 'analytical window label unchanged');
    assert.equal(Timing.getWindow(80).index, 6, 'analytical window 76-84 unchanged');
    assert.equal(Timing.getWindow(88).isFinal, true, 'analytical window fields untouched (window 7 stays final)');
    assert.equal(Timing.getLegacyTenMinuteBucket(25), '21-30', 'legacy 10-minute bucket kept as-is');
    assert.equal(Timing.getLegacyTenMinuteBucket(5), '1-10', 'legacy 10-minute bucket start boundary unchanged');
}

// --- F6: generationWindowIndex fallback derives from the segment model --------
const cahSandbox = {
    console, Date, Math, JSON, Number, String, Object, Array, Set, Map, Promise,
    setTimeout: () => 0, clearTimeout: () => {},
    document: { readyState: 'complete', querySelector: () => null, body: { innerText: '' } },
    location: { search: '' }, URLSearchParams
};
cahSandbox.window = cahSandbox;
cahSandbox.globalThis = cahSandbox;
vm.createContext(cahSandbox);
vm.runInContext(read('src/modules/match-reading/match-state-parser.js'), cahSandbox, { filename: 'match-state-parser.js' });
vm.runInContext(read('src/modules/strategy-data-recommendations/current-action-hint-engine.js'), cahSandbox, { filename: 'current-action-hint-engine.js' });
vm.runInContext(read('src/modules/strategy-data-recommendations/cah-value-utils.js'), cahSandbox, { filename: 'cah-value-utils.js' });
vm.runInContext(read('src/modules/strategy-data-recommendations/cah-runtime-context.js'), cahSandbox, { filename: 'cah-runtime-context.js' });
const Cah = cahSandbox.window.SLFCurrentActionHintEngine;

{
    // Fallback (no snapshot.generationWindow): 5-minute segment index (C1).
    assert.equal(
        Cah.MatchDecisionSignals.build(Cah, { minute: 12 }, {}, null).generationWindowIndex,
        3,
        'F6: fallback window index = 5-minute segment (minute 12 → segment 3, not the legacy 10-minute bucket 1)'
    );
    assert.equal(
        Cah.MatchDecisionSignals.build(Cah, { minute: 91 }, {}, null).generationWindowIndex,
        19,
        'F6: stoppage minute 91 → segment 19'
    );
    // Snapshot value stays preferred (fallback only).
    assert.equal(
        Cah.MatchDecisionSignals.build(Cah, { minute: 12, generationWindow: { index: 2 } }, {}, null).generationWindowIndex,
        2,
        'F6: snapshot generationWindow.index preferred over the derived fallback'
    );
    // Unknown minute → explicit unknown (0), not a fabricated bucket.
    assert.equal(
        Cah.MatchDecisionSignals.build(Cah, {}, {}, null).generationWindowIndex,
        0,
        'F6: unknown minute → 0 (unknown), never a fabricated index'
    );
}

// --- F7: high-press ПИ-role note (C324, C379) ----------------------------------
const policySandbox = {
    console, Date, Math, JSON, Number, String, Object, Array, Set, Map, Promise,
    setTimeout: () => 0, clearTimeout: () => {},
    localStorage: { getItem: () => null },
    document: { readyState: 'complete', querySelector: () => null, defaultView: null }
};
policySandbox.window = policySandbox;
policySandbox.globalThis = policySandbox;
policySandbox.window.SLFCurrentActionHintEngine = { schema: 'slf_rule_decision_v11_tactical_suite', run: () => ({}) };
policySandbox.RecommendationEngine = {
    getPresetLadder() { return []; },
    applyProgressionGuard(candidate) { return candidate; }
};
vm.createContext(policySandbox);
vm.runInContext(read('src/modules/tactics-presets/active-preset-registry.js'), policySandbox, { filename: 'active-preset-registry.js' });
vm.runInContext(read('src/modules/tactics-presets/tactic-preset-direction-policy.js'), policySandbox, { filename: 'tactic-preset-direction-policy.js' });
const Registry = policySandbox.window.SLFActivePresetRegistry;
const Policy = policySandbox.window.SLFTacticDirectionPolicy;
const HintEngine = policySandbox.window.SLFCurrentActionHintEngine;
assert.ok(Registry && Policy, 'registry and direction policy installed');

const HIGH_PRESS_NOTE = 'Для высокого прессинга назначьте 1–3 ПИ; при паре CD роль ПИ у CD не работает';

{
    // R1 tripwire: all 13×15 numeric vectors byte-identical (work order: PRESETS
    // numeric values are FORBIDDEN to change).
    const expectedVectors = {
        Emery_BalancedBase_v11: [2, 2, 2, 2, 2, 2, 2, 2, 3, 2, 2, 2, 1, 2, []],
        Mourinho_CleanCounter_v11: [1, 2, 2, 2, 1, 3, 3, 3, 3, 2, 2, 2, 1, 2, []],
        Guardiola_PressEscape_v11: [2, 2, 2, 2, 2, 1, 1, 2, 3, 2, 1, 1, 1, 2, []],
        Arteta_SafePossession_v11: [2, 2, 2, 2, 2, 2, 1, 2, 3, 2, 2, 2, 1, 2, []],
        Guardiola_PressCooldown_v11: [1, 2, 2, 1, 1, 2, 2, 2, 2, 1, 1, 1, 1, 1, []],
        Guardiola_ControlledPush_v11: [2, 3, 2, 3, 2, 3, 2, 3, 4, 3, 3, 2, 1, 3, []],
        Guardiola_PositionalSiege_v11: [3, 3, 3, 4, 2, 2, 2, 3, 5, 4, 3, 3, 1, 3, []],
        Conte_WideChannels_v11: [2, 2, 3, 3, 3, 2, 2, 3, 4, 3, 3, 3, 1, 2, ['left', 'right']],
        Klopp_LateGegenpress_v11: [3, 3, 2, 4, 3, 3, 2, 3, 4, 3, 3, 3, 1, 3, []],
        Simeone_CompactLead_v11: [1, 2, 1, 2, 1, 2, 2, 2, 2, 2, 1, 2, 1, 1, []],
        Simeone_EmergencyBlock_v11: [1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, []],
        Allegri_LeadOutlet_v11: [2, 2, 2, 1, 2, 2, 2, 2, 2, 1, 1, 2, 1, 1, []],
        Flick_LeadPressHold_v12: [2, 2, 2, 3, 2, 1, 2, 2, 3, 2, 2, 2, 1, 2, []]
    };
    const keys = ['def_line', 'press_line', 'def_width', 'press_intense', 'build_type', 'build_temp', 'build_long', 'build_fast', 'style', 'pass_risk', 'dribble', 'cross', 'corner', 'shot', 'priority'];
    for (const [name, vector] of Object.entries(expectedVectors)) {
        keys.forEach((key, i) => {
            const actual = Registry.presets[name][key];
            const expected = Array.isArray(vector[i]) ? vector[i] : String(vector[i]);
            assert.deepEqual(
                Array.isArray(actual) ? [...actual].sort() : actual,
                Array.isArray(expected) ? [...expected].sort() : expected,
                `R1 tripwire: ${name}.${key} unchanged`
            );
        });
    }

    // High-press presets per the registry (press_intense >= 3).
    const highPress = Registry.active.filter(name => Number(Registry.presets[name].press_intense) >= 3);
    assert.deepEqual(
        [...highPress].sort(),
        ['Conte_WideChannels_v11', 'Flick_LeadPressHold_v12', 'Guardiola_ControlledPush_v11', 'Guardiola_PositionalSiege_v11', 'Klopp_LateGegenpress_v11'].sort(),
        'exactly the five work-order presets carry press_intense >= 3'
    );

    // Note renders for a high-press recommendation (Conte, width_attack)…
    const widthCtx = { centerClosed: true, wideQuality: true };
    const conteRun = HintEngine.run({}, widthCtx);
    assert.equal(conteRun.action.preset, 'Conte_WideChannels_v11', 'Conte selected for width_attack');
    assert.ok(conteRun.action.reason.includes(HIGH_PRESS_NOTE), 'F7: high-press note present in the recommendation reason');
    // …and for the pressing lead option (Flick, lead_press_hold).
    const flickRun = HintEngine.run({}, { scoreState: 'winning', minute: 70, opponentPressVector: 25, score: { state: 'winning', diff: 1 } });
    assert.equal(flickRun.action.preset, 'Flick_LeadPressHold_v12', 'Flick selected for lead_press_hold');
    assert.ok(flickRun.action.reason.includes(HIGH_PRESS_NOTE), 'F7: note present for Flick lead-press-hold');
    // …and NOT for a low-press recommendation (Emery, default_start).
    const emeryRun = HintEngine.run({}, {});
    assert.equal(emeryRun.action.preset, 'Emery_BalancedBase_v11', 'Emery selected for default_start');
    assert.ok(!emeryRun.action.reason.includes(HIGH_PRESS_NOTE), 'F7: no high-press note for press_intense < 3');
    // Note is NOT a veto: Conte remains eligible and selected.
    assert.equal(conteRun.action.decision, 'width_attack', 'F7: note did not change the decision/situation');
    assert.ok(!conteRun.vetoedPresets?.Conte_WideChannels_v11, 'F7: note is not a hard veto');
}

console.log('tests/test-tactics-2026-semantics.mjs: all assertions passed');
