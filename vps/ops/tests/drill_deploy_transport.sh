#!/usr/bin/env bash
# =============================================================================
# drill_deploy_transport.sh — end-to-end drill for deploy/vps/slf-deploy-launcher
#
# Builds a throwaway git repository containing stub engines (vps/ops/deploy-
# code.sh / rollback-code.sh) and a sudo shim, then drives the real launcher
# through its refusal paths, byte-exact markers, provenance-restore chain,
# status drift reporting and lock contention. Everything runs under drill-only
# SLF_DEPLOY_* overrides; production defaults are never touched.
#
# Self-verifying: prints PASS/FAIL per case and exits non-zero on any real
# failure. Note: under `set -e` an unexpected intermediate assertion aborts
# the drill immediately (non-zero, no summary) — the last printed PASS line
# identifies the failing case. Skips cleanly (exit 0) when prerequisites
# are missing, so it can be wired into CI without breaking stripped runners.
#
# Usage: bash vps/ops/tests/drill_deploy_transport.sh
# =============================================================================
set -euo pipefail

for t in git flock sha256sum mktemp; do
    if ! command -v "$t" >/dev/null 2>&1; then
        echo "SKIP: drill_deploy_transport requires git/flock/sha256sum/mktemp (missing: $t)"
        exit 0
    fi
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
LAUNCHER="$REPO_ROOT/deploy/vps/slf-deploy-launcher"
[ -f "$LAUNCHER" ] || { echo "FAIL: launcher not found at $LAUNCHER" >&2; exit 1; }

DRILL_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/slf-drill.XXXXXX")"
trap 'rm -rf "$DRILL_ROOT"' EXIT
mkdir -p "$DRILL_ROOT/bin" "$DRILL_ROOT/backups" "$DRILL_ROOT/tmp"

PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "PASS: $1"; }
bad()  { FAIL=$((FAIL+1)); echo "FAIL: $1"; }
check(){ if [ "$1" = "0" ]; then ok "$2"; else bad "$2"; fi; }
fixture(){ for p in "$@"; do [ -e "$p" ] || { echo "FIXTURE MISSING: $p" >&2; exit 90; }; done; }

# --- throwaway repo with stub engines committed ------------------------------
REPO="$DRILL_ROOT/repo"
git init -q "$REPO"
git -C "$REPO" config user.email drill@local
git -C "$REPO" config user.name drill
mkdir -p "$REPO/vps/ops" "$REPO/deploy/vps"
cp "$LAUNCHER" "$REPO/deploy/vps/slf-deploy-launcher"
cat > "$REPO/vps/ops/deploy-code.sh" <<'EOF'
#!/usr/bin/env bash
set -u
repo=""; commit=""; component=""
while [ $# -gt 0 ]; do case "$1" in
  --repo) repo="$2"; shift 2;; --commit) commit="$2"; shift 2;;
  --component) component="$2"; shift 2;; *) shift;; esac; done
[ -f "$repo/deploy-state/stub-fail" ] && exit 7
printf '%s %s\n' "$commit" "$component" > "$repo/deploy-state/last-deploy"
exit 0
EOF
cat > "$REPO/vps/ops/rollback-code.sh" <<'EOF'
#!/usr/bin/env bash
set -u
backup=""
while [ $# -gt 0 ]; do case "$1" in
  --backup) backup="$2"; shift 2;; *) shift;; esac; done
[ -z "$backup" ] && exit 3
printf '%s\n' "$backup" > "$(cd "$(dirname "$0")/.." && pwd)/.last-rollback"
exit 0
EOF
chmod +x "$REPO"/vps/ops/*.sh
git -C "$REPO" add -A && git -C "$REPO" commit -qm bootstrap
BOOT_SHA="$(git -C "$REPO" rev-parse HEAD)"
mk_target() {
    mkdir -p "$REPO/targets"; echo x > "$REPO/targets/$1"
    git -C "$REPO" add -A; git -C "$REPO" commit -qm "target $1"
    git -C "$REPO" rev-parse HEAD
}
SHA1="$(mk_target one)"; SHA2="$(mk_target two)"; SHA3="$(mk_target three)"
# Deterministic bootstrap state: previous= falls back to HEAD, so park the
# checkout on the bootstrap commit before the first deploy.
git -C "$REPO" checkout -q --detach "$BOOT_SHA"
mk_bundle() {
    git -C "$REPO" update-ref refs/slf-deploy-ship "$1"
    git -C "$REPO" bundle create -q "$DRILL_ROOT/b.bundle" refs/slf-deploy-ship
}
mk_bundle "$SHA1"

# sudo shim (the drill grants no real privileges; engines are plain scripts)
cat > "$DRILL_ROOT/bin/sudo" <<'EOF'
#!/usr/bin/env bash
[ "$1" = "-n" ] && shift
exec "$@"
EOF
chmod +x "$DRILL_ROOT/bin/sudo"

run() { # run <ssh-command> <stdin-file> <stdout-file>  -> sets RC
  RC=0
  if env -i PATH="$DRILL_ROOT/bin:$PATH" HOME="$HOME" TMPDIR="$DRILL_ROOT/tmp" \
      SLF_DEPLOY_REPO_DIR="$REPO" SLF_DEPLOY_BACKUP_ROOT="$DRILL_ROOT/backups" \
      SLF_DEPLOY_LOCK_FILE="$DRILL_ROOT/lock" SLF_DEPLOY_LAUNCHER_PATH="$LAUNCHER" \
      SSH_ORIGINAL_COMMAND="$1" bash "$LAUNCHER" <"$2" >"$3" 2>&1; then :; else RC=$?; fi
}
STATE_JSONL="$REPO/deploy-state/deployment-manifest.jsonl"
fixture "$REPO/.git" "$REPO/vps/ops/deploy-code.sh" "$REPO/vps/ops/rollback-code.sh" "$DRILL_ROOT/bin/sudo" "$LAUNCHER" /dev/null

# C1 unknown verb refused
run "slf-hack-v1 $SHA1 api" /dev/null "$DRILL_ROOT/c1.out"
[ "$RC" -ne 0 ]; check $? "C1 unknown verb refused (rc=$RC)"
# C2 malformed sha refused
run "slf-deploy-v1 deadbeef api" /dev/null "$DRILL_ROOT/c2.out"
[ "$RC" -ne 0 ]; check $? "C2 malformed sha refused (rc=$RC)"
# C3 empty stdin refused
run "slf-deploy-v1 $SHA1 api" /dev/null "$DRILL_ROOT/c3.out"
[ "$RC" -ne 0 ] && ! grep -q DEPLOYMENT_ACCEPTED "$DRILL_ROOT/c3.out"; check $? "C3 empty stdin refused (rc=$RC)"
# C4 bundle head mismatch refused
mk_bundle "$SHA2"
fixture "$DRILL_ROOT/b.bundle"
run "slf-deploy-v1 $SHA1 api" "$DRILL_ROOT/b.bundle" "$DRILL_ROOT/c4.out"
grep -q "bundle HEAD mismatch" "$DRILL_ROOT/c4.out" && [ "$RC" -ne 0 ]; check $? "C4 bundle head mismatch refused (rc=$RC)"
# C5 happy deploy 1: byte-exact marker, previous=bootstrap HEAD
[ "$(git -C "$REPO" rev-parse HEAD)" = "$BOOT_SHA" ] || { echo "FIXTURE MISSING: HEAD != BOOT_SHA pre-C5" >&2; exit 91; }
mk_bundle "$SHA1"
run "slf-deploy-v1 $SHA1 api" "$DRILL_ROOT/b.bundle" "$DRILL_ROOT/c5.out"
grep -Fq "DEPLOYMENT_ACCEPTED sha=$SHA1 previous=$BOOT_SHA" "$DRILL_ROOT/c5.out" && [ "$RC" -eq 0 ]; check $? "C5 deploy1 marker byte-exact (rc=$RC)"
grep -q "SLF-ERR" "$DRILL_ROOT/c5.out" && bad "C5b unexpected SLF-ERR on happy path" || ok "C5b no SLF-ERR on happy path"
fixture "$REPO/deploy-state/last-deploy" "$STATE_JSONL"
grep -q "$SHA1 api" "$REPO/deploy-state/last-deploy"; check $? "C5c stub engine received commit+component"
# C6 happy deploy 2: previous=SHA1
mk_bundle "$SHA2"
run "slf-deploy-v1 $SHA2 api" "$DRILL_ROOT/b.bundle" "$DRILL_ROOT/c6.out"
grep -Fq "DEPLOYMENT_ACCEPTED sha=$SHA2 previous=$SHA1" "$DRILL_ROOT/c6.out" && [ "$RC" -eq 0 ]; check $? "C6 deploy2 previous=SHA1 (rc=$RC)"
# C11 manifest records the accepted deploy (kind-tagged JSONL)
grep -Fq "\"kind\": \"deploy\", \"component\": \"api\", \"sha\": \"$SHA2\", \"previous\": \"$SHA1\"" "$STATE_JSONL"; check $? "C11 manifest deploy record sha=$SHA2 previous=$SHA1"
# C7 lock contention refused with the exact contract string
flock "$DRILL_ROOT/lock" sleep 3 &
HOLD=$!
sleep 0.4
kill -0 "$HOLD" 2>/dev/null || { echo "FIXTURE BROKEN: lock holder died pre-C7" >&2; exit 92; }
mk_bundle "$SHA1"
run "slf-deploy-v1 $SHA1 api" "$DRILL_ROOT/b.bundle" "$DRILL_ROOT/c7.out"
if wait "$HOLD" 2>/dev/null; then :; else true; fi
grep -Fq "another slf deploy is active (lock $DRILL_ROOT/lock)" "$DRILL_ROOT/c7.out" && [ "$RC" -ne 0 ]; check $? "C7 lock contention refused (rc=$RC)"
[ "$(git -C "$REPO" rev-parse HEAD)" = "$SHA2" ] || { echo "FIXTURE BROKEN: C7 must not have moved HEAD" >&2; exit 93; }
# C8 rollback of deploy SHA1: marker byte-exact; provenance restored to BOOT_SHA
mkdir -p "$DRILL_ROOT/backups/20260101T000000Z-api-$SHA1"
fixture "$DRILL_ROOT/backups/20260101T000000Z-api-$SHA1"
run "slf-rollback-v1 $SHA1 api" /dev/null "$DRILL_ROOT/c8.out"
grep -Fq "DEPLOY_ROLLED_BACK sha=$SHA1 previous=$SHA2" "$DRILL_ROOT/c8.out" && [ "$RC" -eq 0 ]; check $? "C8 rollback marker byte-exact (rc=$RC)"
fixture "$REPO/vps/.last-rollback"
grep -q "$DRILL_ROOT/backups/20260101T000000Z-api-$SHA1" "$REPO/vps/.last-rollback"; check $? "C8b rollback engine received the resolved backup dir"
grep -Fq "\"kind\": \"rollback\", \"component\": \"api\", \"sha\": \"$SHA1\", \"previous\": \"$SHA2\", \"restored_to\": \"$BOOT_SHA\"" "$STATE_JSONL"; check $? "C8c rollback record kind=rollback restored_to=$BOOT_SHA"
[ "$(git -C "$REPO" rev-parse HEAD)" = "$BOOT_SHA" ] || { echo "FIXTURE BROKEN: rollback did not check out restored-to sha" >&2; exit 94; }
ok "C8d rollback checked out the restored-to sha"
# C10 status after rollback: no drift (recorded restored_to == checkout HEAD)
run "slf-status-v1" /dev/null "$DRILL_ROOT/c10.out"
grep -q "launcher_sha256=" "$DRILL_ROOT/c10.out" && grep -q "repo_head=" "$DRILL_ROOT/c10.out" \
  && grep -Fq "api_drift=false" "$DRILL_ROOT/c10.out" && grep -Fq "api_deployed_sha=$BOOT_SHA" "$DRILL_ROOT/c10.out" \
  && [ "$RC" -eq 0 ]; check $? "C10 status fields + no drift + exit 0 (rc=$RC)"
# C12 deploy after rollback: previous= is the restored-to sha (provenance chain)
mk_bundle "$SHA3"
run "slf-deploy-v1 $SHA3 api" "$DRILL_ROOT/b.bundle" "$DRILL_ROOT/c12.out"
grep -Fq "DEPLOYMENT_ACCEPTED sha=$SHA3 previous=$BOOT_SHA" "$DRILL_ROOT/c12.out" && [ "$RC" -eq 0 ]; check $? "C12 post-rollback deploy previous=restored-to (rc=$RC)"
grep -Fq "\"kind\": \"deploy\", \"component\": \"api\", \"sha\": \"$SHA3\", \"previous\": \"$BOOT_SHA\"" "$STATE_JSONL"; check $? "C12b deploy record sha=$SHA3 previous=$BOOT_SHA"
# C13 status drift: forged stale record -> per-component drift + exit 1
printf '{"schema": "slf_deployment_manifest_v2", "kind": "deploy", "component": "api", "sha": "%s", "previous": "%s", "deployed_at": "1970-01-01T00:00:00Z", "launcher_sha256": "x"}\n' "$BOOT_SHA" "$SHA1" >> "$STATE_JSONL"
run "slf-status-v1" /dev/null "$DRILL_ROOT/c13.out"
grep -Fq "api_drift=true" "$DRILL_ROOT/c13.out" && grep -Fq "status=drift" "$DRILL_ROOT/c13.out" && [ "$RC" -eq 1 ]; check $? "C13 status drift reported + exit 1 (rc=$RC)"
# C9 verbatim engine exit code 7 (last: its failed deploy leaves a HEAD/state mismatch)
mk_bundle "$SHA1"
touch "$REPO/deploy-state/stub-fail"
run "slf-deploy-v1 $SHA1 api" "$DRILL_ROOT/b.bundle" "$DRILL_ROOT/c9.out"
rm -f "$REPO/deploy-state/stub-fail"
if [ "$RC" -eq 7 ]; then ok "C9 engine rc 7 propagated verbatim (rc=$RC)"; else bad "C9 engine rc 7 propagated verbatim (rc=$RC)"; fi

echo "---- drill summary: PASS=$PASS FAIL=$FAIL ----"
[ "$FAIL" -eq 0 ]
