#!/usr/bin/env node
// SLF #342 phase 4 — client-side acceptance-contract fixtures (test-only).
//
// Encodes as executable fixtures:
//   - specs/slf-342-game-acceptance/spec.md §3: the evidence-status contract
//     (apply_attempted, ui_readback_confirmed, game_confirmed, rejected,
//     unverified, UNOBSERVABLE) and its promotion boundaries.
//   - specs/slf-342-game-acceptance/spec.md §5: the client-side cases of the
//     negative-case matrix.
//
// Investigation-only issue: there is no production code to test yet (plan
// phase 4: "pure client logic, no game mutation needed"). This file carries a
// small self-contained REFERENCE implementation of the contract's promotion
// logic (pure functions, no I/O) and asserts the matrix pass conditions
// against it. A future implementation task (own scope check, plan phase 5)
// must satisfy the same assertions against the real modules.
//
// Matrix cases covered here (client-side only; server rejection, delayed
// response and reload/retry live probes are owner-gated, spec §5):
//   1. stale cached state      — the authoritative read path must bypass the
//                                warm cache; a cached vector never feeds the
//                                promotion decision.
//   2. unchanged native values — applying a vector identical to server state
//                                produces no spurious transition event.
//   3. same-minute A→B→A       — stable idempotent event ids, correct phase
//                                attribution, byte-identical baseline return.
//   4. promotion boundaries    — ui_readback / snapshot currentTactic never
//                                promote to game_confirmed; UNOBSERVABLE,
//                                rejected and unverified all stay fail-closed.
//   5. network failure         — unreachable refetch stays unverified; event
//                                id stable for retry, no duplicate event ids.
//
// Standalone: node tests/test-tactic-acceptance-contract.mjs
// (exit 0 + one PASS line on success; any assertion failure exits non-zero).
// Not wired into CI — tests/*.mjs run standalone by repo convention.
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Reference implementation (pure, no I/O). Semantics are taken from spec §3
// wording; nothing stricter or looser is encoded.
// ---------------------------------------------------------------------------

// The 14 tactic groups the game server persists as hidden radio groups
// (spec §2); the authoritative read parses exactly these `checked` pairs.
const CANONICAL_GROUPS = [
    'def_line', 'press_line', 'def_width', 'press_intense',
    'build_type', 'build_temp', 'build_long', 'build_fast',
    'style', 'pass_risk', 'dribble', 'cross', 'corner', 'shot'
];

// Builds a full 14-group vector; observed baseline is def_line=2, style=3,
// corner=1, remaining groups at defaults (spec §2, §2.1, §2.2).
function buildVector(overrides = {}) {
    const vector = {};
    for (const group of CANONICAL_GROUPS) {
        vector[group] = overrides[group] !== undefined ? String(overrides[group]) : '1';
    }
    return vector;
}
const BASELINE = buildVector({ def_line: '2', style: '3', corner: '1' });

// Canonical serialization of a 14-group vector. Spec §2.1 requires the revert
// readback to return the baseline vector "byte-identical" — fingerprint
// equality is that check.
function fingerprint(vector) {
    return CANONICAL_GROUPS.map(group => `${group}=${vector[group]}`).join(';');
}

function vectorsEqual(a, b) {
    return fingerprint(a) === fingerprint(b);
}

const STATUS = {
    APPLY_ATTEMPTED: 'apply_attempted',
    UI_READBACK_CONFIRMED: 'ui_readback_confirmed',
    GAME_CONFIRMED: 'game_confirmed',
    REJECTED: 'rejected',
    UNVERIFIED: 'unverified',
    UNOBSERVABLE: 'UNOBSERVABLE'
};

// §3 acceptance status of one application. Only a raw-HTML authoritative read
// (fresh GET /team4.php?action=tactic, parsed `checked` vector) promotes to
// game_confirmed. uiReadback (DOM readback) and snapshotCurrentTactic (match
// snapshot field, UI-readback provenance) are deliberately unused: per §3
// boundaries they never promote, so they cannot influence the verdict. A
// missing or failed authoritative read leaves the default `unverified`
// (§3 default row; §5 network-failure row).
function classifyApply({ intent, authoritativeRead, uiReadback, snapshotCurrentTactic }) {
    if (authoritativeRead == null) return STATUS.UNVERIFIED;
    return vectorsEqual(authoritativeRead, intent) ? STATUS.GAME_CONFIRMED : STATUS.REJECTED;
}

// Ranking gate: fail-closed for every status except game_confirmed (§3 rows,
// §6). Whether a cohort enables ranking at game_confirmed is a separate
// future decision (§2.1) — this encodes only the contract boundary.
function rankingEligible(status) {
    return status === STATUS.GAME_CONFIRMED;
}

// §3 provenance ladder recorded by telemetry (§1: applications are recorded
// as ui_readback_confirmed today). Provenance only — never a promotion.
function recordProvenance({ intent, uiReadback }) {
    if (uiReadback != null && vectorsEqual(uiReadback, intent)) {
        return STATUS.UI_READBACK_CONFIRMED;
    }
    return STATUS.APPLY_ATTEMPTED;
}

// Deterministic event id: intent fingerprint + applicationSequence — never
// timestamps — so retries and reloads map to the same id (§5: "event id
// stable for retry", "single confirmed application, no duplicates").
function transitionEventId(vector, applicationSequence) {
    return `evt:${applicationSequence}:${fingerprint(vector)}`;
}

function createEntityState(entityId, initialVector, phase) {
    return { entityId, vector: initialVector, phase, events: [] };
}

// Records one apply transition. next: { vector, applicationSequence, phase?, uiReadback? }.
// - next.vector identical to current state (unchanged native values, §5):
//   no spurious transition event, no phase change.
// - retry of an already-recorded application (same vector + sequence):
//   same event id, no duplicate (§5 network failure / reload-retry rows).
function recordTransition(state, next) {
    if (vectorsEqual(state.vector, next.vector)) return state;
    const id = transitionEventId(next.vector, next.applicationSequence);
    if (state.events.some(event => event.id === id)) return state;
    const phase = next.phase !== undefined ? next.phase : state.phase;
    const event = {
        id,
        entityId: state.entityId,
        applicationSequence: next.applicationSequence,
        from: fingerprint(state.vector),
        to: fingerprint(next.vector),
        phase,
        provenance: recordProvenance({ intent: next.vector, uiReadback: next.uiReadback })
    };
    return { ...state, vector: next.vector, phase, events: [...state.events, event] };
}

// §5 "stale cached state": the authoritative read is a fresh raw-HTML fetch
// with cache disabled. It never consults the warm cache, so the parsed
// `checked` vector always reflects server state.
function authoritativeRefetch(serverVector, warmCache) {
    // warmCache deliberately unused: cache bypass is the contract (§5).
    return { vector: serverVector, cacheBypassed: true };
}

// ---------------------------------------------------------------------------
// Fixtures — one block per matrix case.
// ---------------------------------------------------------------------------

// 1. Stale cached state (§5): warm read vs cache-disabled refetch; the
// authoritative read path must bypass cache and reflect server state.
{
    const serverTruth = buildVector({ def_line: '3', style: '3', corner: '1' }); // server persisted the apply
    const staleVector = BASELINE;                                                // warm cache predates the apply
    const cache = {
        hits: 0,
        get() {
            this.hits += 1;
            return staleVector;
        }
    };

    const warm = cache.get();
    assert.equal(cache.hits, 1, 'warm read consults the cache');
    assert.ok(!vectorsEqual(warm, serverTruth), 'fixture precondition: warm cache is stale');

    const read = authoritativeRefetch(serverTruth, cache);
    assert.equal(cache.hits, 1, 'authoritative refetch must bypass the warm cache');
    assert.ok(vectorsEqual(read.vector, serverTruth), 'authoritative read must reflect server state, not the cache');

    const intent = serverTruth;
    assert.equal(
        classifyApply({ intent, authoritativeRead: read.vector }),
        STATUS.GAME_CONFIRMED,
        'fresh authoritative read equal to intent promotes to game_confirmed'
    );
    // Fail-closed consequence if a stale read were (wrongly) fed as
    // authoritative: divergence records rejected, never a false confirmation.
    assert.equal(
        classifyApply({ intent, authoritativeRead: warm }),
        STATUS.REJECTED,
        'a stale read diverging from intent must record rejected, not game_confirmed'
    );

    // Mirrored edge: warm cache coincidentally equals intent while the server
    // diverged — the fresh read bypasses the cache, so the cached vector can
    // never synthesize game_confirmed.
    const lyingCache = {
        hits: 0,
        get() {
            this.hits += 1;
            return intent;
        }
    };
    const freshRead = authoritativeRefetch(BASELINE, lyingCache);
    assert.equal(lyingCache.hits, 0, 'warm cache must not be consulted even when it matches intent');
    assert.equal(
        classifyApply({ intent, authoritativeRead: freshRead.vector }),
        STATUS.REJECTED,
        'a cached vector matching intent must never synthesize game_confirmed'
    );
}

// 2. Unchanged native values (§5): applying a vector identical to server
// state produces no spurious transition event (no new event id, no phase change).
{
    const state = createEntityState('team4:105995', BASELINE, 'phase:minute-0');
    const eventsBefore = state.events.length;

    const after = recordTransition(state, {
        vector: BASELINE, // identical to server state
        applicationSequence: 7,
        uiReadback: BASELINE
    });

    assert.equal(after.events.length, eventsBefore, 'no spurious transition event for an unchanged vector');
    assert.equal(after.phase, state.phase, 'no phase change for an unchanged vector');
    assert.ok(vectorsEqual(after.vector, state.vector), 'state vector unchanged');
    assert.deepEqual(after.events, state.events, 'event log unchanged (no new event id)');
}

// 3. Same-minute A→B→A (§5, live-verified §2.1): stable idempotent ids,
// correct phase attribution, byte-identical return to baseline.
{
    const B = buildVector({ def_line: '3', style: '3', corner: '1' });
    const phase = 'phase:minute-0'; // all steps inside the same minute

    const run = () => {
        let state = createEntityState('team4:105995', BASELINE, phase);
        state = recordTransition(state, { vector: B, applicationSequence: 1, phase, uiReadback: B });
        state = recordTransition(state, { vector: BASELINE, applicationSequence: 2, phase, uiReadback: BASELINE });
        return state;
    };

    const state = run();
    assert.equal(state.events.length, 2, 'A→B→A records exactly two transitions');
    const [toB, backToA] = state.events;

    assert.equal(toB.id, transitionEventId(B, 1), 'event id derives from intent fingerprint + sequence');
    assert.equal(backToA.id, transitionEventId(BASELINE, 2), 'rollback event id derives the same way');
    assert.notEqual(toB.id, backToA.id, 'two applications are two distinct events');
    assert.equal(toB.from, fingerprint(BASELINE), 'A→B attributed from the baseline fingerprint');
    assert.equal(toB.to, fingerprint(B), 'A→B attributed to the B fingerprint');
    assert.equal(backToA.from, fingerprint(B), 'B→A attributed from the B fingerprint');
    assert.equal(backToA.to, fingerprint(BASELINE), 'B→A returns to the baseline fingerprint');

    // Byte-identical return to baseline (spec §2.1 revert integrity).
    assert.ok(vectorsEqual(state.vector, BASELINE), 'A→B→A ends byte-identical to the baseline vector');
    assert.deepEqual(state.vector, BASELINE, 'final vector deep-equals the baseline vector');

    // Correct phase attribution: same minute → same phase on both events.
    assert.equal(toB.phase, phase, 'A→B attributed to the same-minute phase');
    assert.equal(backToA.phase, phase, 'B→A attributed to the same-minute phase');
    assert.equal(state.phase, phase, 'cycle leaves the phase unchanged');

    // Structural: each id is composed of its application sequence and the
    // intent fingerprint (format-agnostic — the exact prefix format is not
    // pinned). The fingerprint is the distinctive component: an id built from
    // anything else (e.g. a bare timestamp) cannot contain it.
    for (const event of state.events) {
        assert.ok(
            event.id.includes(String(event.applicationSequence)) &&
            event.id.includes(event.to),
            `event id must be composed of the application sequence and the intent fingerprint: ${event.id}`
        );
    }

    // Ids are stable and not timestamp-derived: an independent run of the same
    // cycle produces byte-identical event ids. The >=5 ms timer gap forces the
    // two cycles into different milliseconds, so a timestamp-contaminated id
    // fails deterministically here instead of probabilistically (both runs
    // landing in one and the same Date.now() tick).
    await new Promise(resolve => setTimeout(resolve, 5));
    const rerun = run();
    assert.deepEqual(
        rerun.events.map(event => event.id),
        state.events.map(event => event.id),
        'event ids are deterministic across runs (no timestamp input)'
    );

    // Retrying each application (same vector + sequence) adds no duplicates.
    const retried = recordTransition(state, { vector: B, applicationSequence: 1, phase });
    const retriedAgain = recordTransition(retried, { vector: BASELINE, applicationSequence: 2, phase });
    assert.equal(retriedAgain.events.length, 2, 'retries add no duplicate events');
    assert.deepEqual(
        retriedAgain.events.map(event => event.id),
        state.events.map(event => event.id),
        'retry event ids identical to the originals'
    );
}

// 4. Promotion boundaries (§3): only the raw-HTML authoritative read
// promotes; every other status keeps ranking fail-closed.
{
    const B = buildVector({ def_line: '3', style: '3', corner: '1' });

    // ui_readback + snapshot currentTactic (both UI-readback provenance) never promote.
    const uiOnly = classifyApply({
        intent: B,
        authoritativeRead: null,
        uiReadback: B,
        snapshotCurrentTactic: B
    });
    assert.equal(uiOnly, STATUS.UNVERIFIED, 'ui_readback + currentTactic must not promote past unverified');
    assert.equal(rankingEligible(uiOnly), false, 'ui-only evidence keeps ranking fail-closed');

    // The snapshot field alone must not synthesize game_confirmed (§3 boundary).
    assert.equal(
        classifyApply({ intent: B, authoritativeRead: null, snapshotCurrentTactic: B }),
        STATUS.UNVERIFIED,
        'currentTactic snapshot field never promotes'
    );

    // Provenance ladder (§3 rows 1–2): recorded by telemetry, never a promotion.
    assert.equal(recordProvenance({ intent: B, uiReadback: B }), STATUS.UI_READBACK_CONFIRMED);
    assert.equal(recordProvenance({ intent: B, uiReadback: null }), STATUS.APPLY_ATTEMPTED);

    // Only a raw-HTML authoritative read equal to intent promotes.
    assert.equal(
        classifyApply({ intent: B, authoritativeRead: B }),
        STATUS.GAME_CONFIRMED,
        'authoritative read equal to intent promotes to game_confirmed'
    );
    assert.equal(rankingEligible(STATUS.GAME_CONFIRMED), true, 'game_confirmed is the only promotion-grade status');

    // rejected is recorded without ranking promotion (§5 server-rejection row).
    const rejected = classifyApply({ intent: B, authoritativeRead: BASELINE });
    assert.equal(rejected, STATUS.REJECTED, 'diverging authoritative read records rejected');
    assert.equal(rankingEligible(rejected), false, 'rejected keeps ranking untouched');

    // unverified is the default and stays fail-closed (§3).
    assert.equal(classifyApply({ intent: B }), STATUS.UNVERIFIED, 'no authoritative read leaves unverified (default)');
    assert.equal(rankingEligible(STATUS.UNVERIFIED), false, 'unverified keeps ranking fail-closed');

    // UNOBSERVABLE is an explicit entity verdict (issue criterion 6) and keeps
    // the fail-closed contract; it is never derived from apply-side evidence.
    const unobservableEntity = { entityId: 'team4:18280', status: STATUS.UNOBSERVABLE };
    assert.equal(rankingEligible(unobservableEntity.status), false, 'UNOBSERVABLE keeps ranking fail-closed');
}

// 5. Network failure (§5): unreachable refetch stays unverified; the event id
// remains stable for retry; the eventual confirmation joins the same event.
{
    const B = buildVector({ def_line: '3', style: '3', corner: '1' });
    let state = createEntityState('team4:105995', BASELINE, 'phase:minute-0');

    // Apply B (UI readback matches): exactly one transition event, stable id.
    state = recordTransition(state, { vector: B, applicationSequence: 1, uiReadback: B });
    assert.equal(state.events.length, 1, 'apply records exactly one transition event');
    const eventId = state.events[0].id;
    assert.equal(state.events[0].provenance, STATUS.UI_READBACK_CONFIRMED, 'telemetry records ui_readback provenance');

    // Acceptance before any authoritative read: unverified (default).
    assert.equal(classifyApply({ intent: B, authoritativeRead: null }), STATUS.UNVERIFIED);

    // Refetch unreachable → no authoritative read → status stays unverified.
    const refetch = reachable => (reachable ? { vector: B } : null);
    const unreachableRead = refetch(false);
    assert.equal(
        classifyApply({ intent: B, authoritativeRead: unreachableRead === null ? null : unreachableRead.vector }),
        STATUS.UNVERIFIED,
        'unreachable refetch leaves the application unverified'
    );

    // Retry the same application (same vector + applicationSequence): the
    // event id is unchanged and no duplicate event appears.
    state = recordTransition(state, { vector: B, applicationSequence: 1, uiReadback: B });
    assert.equal(state.events.length, 1, 'retry adds no duplicate event');
    assert.equal(state.events[0].id, eventId, 'event id stable for retry');

    // Refetch succeeds on retry: the authoritative read promotes, joined to
    // the SAME event by the §3 join keys (entity + sequence + fingerprint).
    const authoritativeRead = refetch(true).vector;
    assert.equal(
        classifyApply({ intent: B, authoritativeRead }),
        STATUS.GAME_CONFIRMED,
        'successful refetch with equal vector promotes to game_confirmed'
    );
    const joined = state.events.find(event =>
        event.entityId === state.entityId &&
        event.applicationSequence === 1 &&
        event.to === fingerprint(B)
    );
    assert.ok(joined, 'confirmation joins an existing event by the §3 join keys');
    assert.equal(joined.id, eventId, 'single confirmed application — the original event, no duplicates');

    const ids = new Set(state.events.map(event => event.id));
    assert.equal(ids.size, state.events.length, 'no duplicate event ids');
}

console.log('PASS: tactic acceptance contract fixtures — spec §3 statuses/boundaries and §5 client-side matrix (stale cache, unchanged values, A→B→A, promotion boundaries, network failure)');
