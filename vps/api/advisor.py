"""LLM second-opinion advisor (specs/434-llm-tactical-advisor, phase F1).

Advisory-only endpoint backing POST /api/advisor. The rules engine in the
userscript stays the primary decision maker; this module adds a validated
second opinion from an OpenRouter chat model.

Fail-closed contract:
- No OPENROUTER_API_KEY -> HTTP 503 {"available": false,
  "errorKind": "advisor_not_configured"}; the feature is dormant, nothing
  else on the API changes.
- The model must answer with a JSON object selecting a preset id from the
  client-sent catalog. Anything else gets one corrective retry, then an
  honest HTTP 502 — a hallucinated preset never reaches the client.
- The advisor never returns apply instructions and never mutates tactical
  state; it is rendered as advice next to the rules hint.
- Egress is direct by default. Setting SLF_ADVISOR_PROXY=socks5h://host:port
  (or socks5://host:port) routes the OpenRouter call through a SOCKS5 relay
  instead; a malformed value fails loudly, it never falls back to direct.

Every consultation (success or failure) appends one record to the
advisor_log_v1 collection — the seed dataset for the feedback loop (Ф3).
"""

import copy
import datetime
import http.client
import json
import logging
import math
import os
import socket
import ssl
import struct
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
DEFAULT_MODEL = "particle-ai/particle-1:free"
REQUEST_TIMEOUT_S = 15.0
MAX_ATTEMPTS = 2
RETRY_AFTER_CAP_S = 5.0
MAX_TOKENS = 700
TEMPERATURE = 0.4

MAX_CATALOG_ENTRIES = 40
MAX_HINTS = 20
MAX_HINT_CHARS = 300
MAX_SIGNAL_KEYS = 40
MAX_REASON_CHARS = 400
MAX_CONTEXT_BYTES = 64 * 1024
LOG_COLLECTION = "advisor_log_v1"
LOG_MAX_RECORDS = 5000

# Ф2b (#441): bounded server-side prompt enrichment. Knowledge comes from the
# tactical knowledge pack file (daily exporter artifact), not the retired
# `tactics` collection. The whole block never exceeds the char budget; entries
# are added whole or not at all.
ENRICHMENT_BUDGET_CHARS = 6000
ENRICHMENT_HISTORY_SAME_GAME = 8
ENRICHMENT_HISTORY_PAD = 4
ENRICHMENT_KNOWLEDGE_ENTRY_CHARS = 400
# Ф2c (#441): per-line cap for history rows — the knowledge cap above applies
# to knowledge entries only. A history row carries the preset summary, the
# apply status and (when materialized) the positional result evaluation.
ENRICHMENT_HISTORY_ENTRY_CHARS = 400
ENRICHMENT_TRUNCATION_MARKER = "(усечено по бюджету)"
KNOWLEDGE_LABEL = (
    "Гипотезы из тактической базы "
    "(сеяные гипотезы, не проверенные законы движка)"
)

# Serializes every read-modify-write cycle on the advisor log (append_log and
# the apply-event update) within one server process.
_LOG_LOCK = threading.Lock()

logger = logging.getLogger(__name__)

CONFIDENCE_LEVELS = ("low", "medium", "high")

SYSTEM_PROMPT = (
    "Ты — футбольный тренер-аналитик в онлайн-менеджере SLF. Встроенный "
    "правилый движок уже дал рекомендацию; твоя роль — второе мнение.\n"
    "Жёсткие правила:\n"
    "1. Выбери ОДИН пресет строго из каталога (поле id). Запрещено "
    "выдумывать id или брать пресет вне каталога.\n"
    "2. Ответ — ТОЛЬКО валидный JSON без markdown-обёртки, вида "
    '{"preset":"<id>","confidence":"low|medium|high","reason":"<1-2 предложения по-русски>"}.\n'
    "3. В reason объясни, почему этот пресет подходит именно сейчас. Если "
    "ты согласен с правилым движком — скажи это коротко; если нет — "
    "объясни, чем оправдано расхождение.\n"
    "4. Учитывай подсказки тренеров (если даны) и поле риск у пресета."
)


class AdvisorError(Exception):
    """Transport- or provider-level failure with a machine-readable kind."""

    def __init__(self, kind, detail="", retry_after=None, status=None):
        super().__init__(detail or kind)
        self.kind = kind
        self.detail = detail
        self.retry_after = retry_after
        self.status = status


class AdvisorValidationError(Exception):
    """Request context failed validation (client error, no retry)."""


def get_config():
    api_key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    model = os.environ.get("SLF_ADVISOR_MODEL", "").strip() or DEFAULT_MODEL
    return api_key, model


def _clean_str(value, limit):
    if not isinstance(value, str):
        return ""
    return value.strip()[:limit]


def validate_context(data):
    """Return a cleaned context dict or raise AdvisorValidationError."""
    if not isinstance(data, dict):
        raise AdvisorValidationError("body must be a JSON object")

    catalog_raw = data.get("presetCatalog")
    if not isinstance(catalog_raw, list) or not (1 <= len(catalog_raw) <= MAX_CATALOG_ENTRIES):
        raise AdvisorValidationError(
            f"presetCatalog must be a list of 1..{MAX_CATALOG_ENTRIES} entries"
        )
    catalog = []
    catalog_ids = set()
    for entry in catalog_raw:
        if not isinstance(entry, dict):
            raise AdvisorValidationError("presetCatalog entries must be objects")
        preset_id = _clean_str(entry.get("id"), 64)
        if not preset_id or preset_id in catalog_ids:
            raise AdvisorValidationError("presetCatalog entries need unique non-empty ids")
        catalog_ids.add(preset_id)
        catalog.append({
            "id": preset_id,
            "label": _clean_str(entry.get("label"), 120) or preset_id,
            "idea": _clean_str(entry.get("idea"), 300),
            "use": _clean_str(entry.get("use"), 300),
            "risk": _clean_str(entry.get("risk"), 300),
        })

    decision_raw = data.get("ruleDecision")
    if not isinstance(decision_raw, dict):
        raise AdvisorValidationError("ruleDecision must be an object")
    top_candidates = []
    candidates_raw = decision_raw.get("topCandidates")
    if candidates_raw is not None:
        if not isinstance(candidates_raw, list) or len(candidates_raw) > 5:
            raise AdvisorValidationError("topCandidates must be a list of at most 5 entries")
        for item in candidates_raw:
            if not isinstance(item, dict):
                raise AdvisorValidationError("topCandidates entries must be objects")
            cid = _clean_str(item.get("id"), 64)
            score = item.get("score")
            if not cid or not isinstance(score, (int, float)) or isinstance(score, bool):
                raise AdvisorValidationError("topCandidates entries need id and numeric score")
            top_candidates.append({"id": cid, "score": round(float(score), 2)})

    signals_raw = data.get("signals")
    signals = {}
    if signals_raw is not None:
        if not isinstance(signals_raw, dict):
            raise AdvisorValidationError("signals must be an object")
        for key, value in list(signals_raw.items())[:MAX_SIGNAL_KEYS]:
            clean_key = _clean_str(key, 40)
            if not clean_key:
                continue
            if isinstance(value, bool) or isinstance(value, (int, float)):
                signals[clean_key] = value
            elif isinstance(value, str):
                signals[clean_key] = value.strip()[:120]

    hints_raw = data.get("developerHints")
    hints = []
    if hints_raw is not None:
        if not isinstance(hints_raw, list) or len(hints_raw) > MAX_HINTS:
            raise AdvisorValidationError(f"developerHints must be a list of at most {MAX_HINTS} strings")
        for hint in hints_raw:
            text = _clean_str(hint, MAX_HINT_CHARS)
            if text:
                hints.append(text)

    minute = data.get("minute")
    if minute is not None and (not isinstance(minute, int) or isinstance(minute, bool) or not 0 <= minute <= 200):
        raise AdvisorValidationError("minute must be an integer 0..200 or null")

    score = data.get("score")
    if score is not None:
        if not isinstance(score, dict):
            raise AdvisorValidationError("score must be an object or null")
        cleaned_score = {}
        for side in ("home", "away"):
            value = score.get(side)
            if value is None:
                continue
            if not isinstance(value, int) or isinstance(value, bool) or not 0 <= value <= 99:
                raise AdvisorValidationError("score.home/away must be integers 0..99 or null")
            cleaned_score[side] = value
        score = cleaned_score or None

    # Ф2c (#441): the truncated `gameId` above is a prompt/history key. The
    # finished-match join needs the client's raw identifier byte-for-byte
    # (result records store it unbounded), so keep it separately. It rides
    # along in the 64KiB context accounting but never enters the prompt's
    # `situation` JSON (that is built from an explicit key list).
    raw_game_id = data.get("gameId")
    if isinstance(raw_game_id, str) and raw_game_id.strip():
        evaluation_game_id = raw_game_id
    else:
        evaluation_game_id = None

    context = {
        "schema": "slf_llm_advisor_request_v1",
        "gameId": _clean_str(str(data.get("gameId") or ""), 40) or None,
        "evaluationGameId": evaluation_game_id,
        "minute": minute,
        "bucket": _clean_str(data.get("bucket"), 20) or None,
        "score": score,
        "currentPreset": _clean_str(data.get("currentPreset"), 64) or None,
        "developerHints": hints,
        "ruleDecision": {
            "preset": _clean_str(decision_raw.get("preset"), 64) or None,
            "gameMode": _clean_str(decision_raw.get("gameMode"), 40) or None,
            "confidence": _clean_str(decision_raw.get("confidence"), 20) or None,
            "topCandidates": top_candidates,
        },
        "signals": signals,
        "presetCatalog": catalog,
    }
    if len(json.dumps(context, ensure_ascii=False).encode("utf-8")) > MAX_CONTEXT_BYTES:
        raise AdvisorValidationError("context exceeds the 64KiB budget")
    return context


def _record_ts(record):
    """Sort key for log records: integer ms timestamp, 0 when absent."""
    ts = record.get("ts") if isinstance(record, dict) else None
    if isinstance(ts, (int, float)) and not isinstance(ts, bool):
        return ts
    return 0


def _read_log_snapshot(data_dir):
    """Deep-copy the advisor log under _LOG_LOCK; read-only, never raises.

    The lock is released before the caller does any rendering or I/O-free
    work, and it is never held across the OpenRouter call.
    """
    try:
        with _LOG_LOCK:
            path = os.path.join(data_dir, f"{LOG_COLLECTION}.json")
            if not os.path.exists(path):
                return []
            try:
                with open(path, "r", encoding="utf-8") as handle:
                    loaded = json.load(handle)
            except (json.JSONDecodeError, UnicodeDecodeError, OSError):
                return []
            return copy.deepcopy(loaded) if isinstance(loaded, list) else []
    except OSError:
        return []


def _select_history(records, exact_game_id):
    """Most recent same-game advice first, padded with recent other-game rows.

    "Same game" means an exact byte-equal `evaluationGameId`: the truncated
    prompt `gameId` is a display key and would merge distinct matches sharing
    a 40-char prefix. Every other row — a different exact id, a legacy record
    with no exact id, or any row when the request carries none — is padding
    and is flagged cross_game, so it renders with a provenance label.

    Returns (record, cross_game) pairs.
    """
    if not records:
        return []
    ordered = sorted(
        (record for record in records if isinstance(record, dict)),
        key=_record_ts,
        reverse=True,
    )
    exact = exact_game_id if isinstance(exact_game_id, str) and exact_game_id else None
    same_game = []
    others = []
    for record in ordered:
        if exact is not None and record.get("evaluationGameId") == exact:
            if len(same_game) < ENRICHMENT_HISTORY_SAME_GAME:
                same_game.append((record, False))
        else:
            others.append((record, True))
    if len(same_game) < ENRICHMENT_HISTORY_SAME_GAME:
        pad = min(ENRICHMENT_HISTORY_PAD, ENRICHMENT_HISTORY_SAME_GAME - len(same_game))
        same_game = same_game + others[:pad]
    return same_game


def _history_summary(rules_text, llm_text):
    if rules_text and llm_text:
        return f"правила {rules_text} → LLM {llm_text}"
    if llm_text:
        return f"LLM пресет {llm_text}"
    if rules_text:
        return f"правила {rules_text}"
    return "совет без пресета"


def _int_pair(value):
    """{"home": int, "away": int} -> (home, away); bool/other -> None."""
    if not isinstance(value, dict):
        return None
    home = value.get("home")
    away = value.get("away")
    if type(home) is not int or type(away) is not int:
        return None
    return home, away


def _shorten_ident(text, limit=24):
    if not isinstance(text, str) or len(text) <= limit:
        return text
    return text[:limit - 1] + "…"


def _evaluation_fact_units(evaluation):
    """Positional score facts from a materialized evaluation, never a claim.

    The score is positional (home:away as the scoreboard reported it); the
    server cannot verify which side the user coaches, so only the positional
    arithmetic is stated, always together with its qualification. The score
    claim and its qualification form one unit: dropping one drops both.
    """
    if not isinstance(evaluation, dict):
        return []
    final = _int_pair(evaluation.get("finalScore"))
    if final is None:
        return []
    units = []
    delta = _int_pair(evaluation.get("scoreDelta"))
    if delta is not None:
        # The stored baseline is authoritative; the arithmetic fallback keeps
        # records written before baselineScore was added renderable.
        baseline = _int_pair(evaluation.get("baselineScore"))
        if baseline is None:
            baseline = (final[0] - delta[0], final[1] - delta[1])
        score_unit = [f"счёт {baseline[0]}:{baseline[1]} → {final[0]}:{final[1]}"]
        score_unit.append(f"Δ позиций {delta[0]:+d}:{delta[1]:+d}")
        if evaluation.get("deltaStatus") == "score_regressed":
            score_unit.append("счёт пересмотрен")
        score_unit.append("не оценка эффекта пресета")
        units.append(score_unit)
    else:
        units.append([f"итог {final[0]}:{final[1]}", "Δ неизвестна: нет исходного счёта"])
    if evaluation.get("orientation") not in ("home", "away"):
        units.append(["своя сторона неизвестна"])
    return units


def _render_history_record(record, cross_game=False):
    """One compact Russian history line per logged consultation."""
    minute = record.get("minute")
    prefix = ""
    if isinstance(minute, int) and not isinstance(minute, bool):
        prefix = f"мин {minute}: "
    label = "[опыт другого матча] " if cross_game else ""

    if record.get("outcome") == "error":
        error_kind = record.get("errorKind")
        detail = f" ({error_kind})" if isinstance(error_kind, str) and error_kind else ""
        return f"- {label}{prefix}консультация с ошибкой{detail}"

    rules_preset = record.get("rulesPreset")
    llm_preset = record.get("llmPreset")
    rules_text = rules_preset if isinstance(rules_preset, str) and rules_preset else None
    llm_text = llm_preset if isinstance(llm_preset, str) and llm_preset else None

    units = []
    confidence = record.get("confidence")
    if isinstance(confidence, str) and confidence:
        units.append([f"уверенность {confidence}"])
    apply_fact = record.get("apply")
    if isinstance(apply_fact, dict) and "ok" in apply_fact:
        units.append(["применён успешно" if bool(apply_fact.get("ok")) else "применение не удалось"])
    else:
        units.append(["применение не отмечено"])
    units.extend(_evaluation_fact_units(record.get("evaluation")))

    def build(rules_ident, llm_ident, fact_units):
        facts = [fact for unit in fact_units for fact in unit]
        summary = _history_summary(rules_ident, llm_ident)
        return f"- {label}{prefix}{summary} ({'; '.join(facts)})"

    line = build(rules_text, llm_text, units)
    if len(line) <= ENRICHMENT_HISTORY_ENTRY_CHARS:
        return line
    # Over budget: shorten the display identifiers first, drop whole optional
    # facts second (a claim and its qualification are one unit, so trimming
    # never leaves an unqualified claim behind).
    short_rules, short_llm = _shorten_ident(rules_text), _shorten_ident(llm_text)
    while len(units) > 1 and len(build(short_rules, short_llm, units)) > ENRICHMENT_HISTORY_ENTRY_CHARS:
        units = units[:-1]
    line = build(short_rules, short_llm, units)
    if len(line) > ENRICHMENT_HISTORY_ENTRY_CHARS:
        line = line[:ENRICHMENT_HISTORY_ENTRY_CHARS - 1] + "…"
    return line


def _knowledge_entries(data):
    """Extract the knowledge-pack rule list; preserve the generator's order."""
    if isinstance(data, dict):
        rules = data.get("rules")
        return rules if isinstance(rules, list) else []
    if isinstance(data, list):
        return data
    return []


def _render_knowledge_entry(entry):
    """Render one knowledge-pack rule; defensive, capped per entry."""
    if isinstance(entry, dict):
        pieces = []
        ident = entry.get("id")
        if isinstance(ident, str) and ident.strip():
            pieces.append(f"[{ident.strip()}]")
        when = entry.get("when")
        if isinstance(when, dict):
            conditions = [
                f"{key}={str(value)}"
                for key, value in when.items()
                if isinstance(value, (str, int, float, bool))
            ]
            if conditions:
                pieces.append("когда " + ", ".join(conditions))
        recommendation = entry.get("recommendation")
        if isinstance(recommendation, dict):
            preset = recommendation.get("preset")
            reason = recommendation.get("reason")
            if isinstance(preset, str) and preset.strip():
                summary = f"→ пресет {preset.strip()}"
                if isinstance(reason, str) and reason.strip():
                    summary += ": " + " ".join(reason.split())
                pieces.append(summary)
            elif isinstance(reason, str) and reason.strip():
                pieces.append("→ " + " ".join(reason.split()))
        confidence = entry.get("confidence")
        if isinstance(confidence, str) and confidence.strip():
            pieces.append(f"(уверенность {confidence.strip()})")
        text = " ".join(pieces) if pieces else json.dumps(entry, ensure_ascii=False)
    elif isinstance(entry, str):
        text = entry
    else:
        text = json.dumps(entry, ensure_ascii=False)
    line = "- " + " ".join(str(text).split())
    if len(line) > ENRICHMENT_KNOWLEDGE_ENTRY_CHARS:
        line = line[:ENRICHMENT_KNOWLEDGE_ENTRY_CHARS - 1] + "…"
    return line


def _assemble_enrichment(sections, budget):
    """Add whole entries under the budget; mark honestly if anything was cut."""

    def assemble(limit):
        parts = []
        used = 0
        dropped = False
        for header, lines in sections:
            header_line = header + "\n"
            if used + len(header_line) > limit:
                dropped = True
                break
            parts.append(header_line)
            used += len(header_line)
            for line in lines:
                line_text = line + "\n"
                if used + len(line_text) > limit:
                    dropped = True
                    break
                parts.append(line_text)
                used += len(line_text)
            if dropped:
                break
        return "".join(parts), dropped

    text, dropped = assemble(budget)
    if not dropped:
        return text
    # Re-run with room reserved for the marker so the result stays within
    # the budget without ever cutting an entry mid-line.
    reserved = len(ENRICHMENT_TRUNCATION_MARKER) + 1
    text, _ = assemble(max(0, budget - reserved))
    return text + ENRICHMENT_TRUNCATION_MARKER + "\n"


def build_enrichment(data_dir, context, read_knowledge=None):
    """Build the bounded server-side enrichment block for the advisor prompt.

    Two optional sections: recent advisor-log history (records of this game
    first, then the latest other-game records) and seed-hypothesis rules from
    the tactical knowledge pack file (the daily exporter artifact), not the
    retired `tactics` collection. The log is read-only and snapshotted under
    _LOG_LOCK; the lock is released before returning. Any failure — missing
    or corrupt log, missing knowledge pack, a raising reader — degrades to an
    absent section: enrichment must never fail a consultation.
    """
    sections = []

    try:
        records = _read_log_snapshot(data_dir)
        history_lines = [
            _render_history_record(record, cross_game)
            for record, cross_game in _select_history(
                records, context.get("evaluationGameId"))
        ]
    except Exception:  # defensive: enrichment is additive, never fatal
        history_lines = []
    if history_lines:
        sections.append(("История советов (сервер):", history_lines))

    if read_knowledge is not None:
        try:
            knowledge = read_knowledge()
        except Exception:  # defensive: a broken reader is an empty section
            knowledge = None
        try:
            knowledge_lines = [
                _render_knowledge_entry(entry)
                for entry in _knowledge_entries(knowledge)
            ]
        except Exception:  # defensive: malformed entries are dropped
            knowledge_lines = []
        if knowledge_lines:
            sections.append((KNOWLEDGE_LABEL + ":", knowledge_lines))

    return _assemble_enrichment(sections, ENRICHMENT_BUDGET_CHARS)


def build_messages(context, enrichment=""):
    catalog_lines = "\n".join(
        f"- {entry['id']} | {entry['label']}"
        + (f" | идея: {entry['idea']}" if entry["idea"] else "")
        + (f" | когда: {entry['use']}" if entry["use"] else "")
        + (f" | риск: {entry['risk']}" if entry["risk"] else "")
        for entry in context["presetCatalog"]
    )
    decision = context["ruleDecision"]
    candidates_text = ", ".join(
        f"{c['id']}={c['score']}" for c in decision["topCandidates"]
    ) or "нет"
    hints_text = "; ".join(context["developerHints"]) or "нет"
    situation = {k: context[k] for k in ("gameId", "minute", "bucket", "score", "currentPreset", "signals")}
    user_payload = (
        "Ситуация (JSON): " + json.dumps(situation, ensure_ascii=False) + "\n"
        "Подсказки тренеров: " + hints_text + "\n"
        "Решение правилого движка: пресет " + str(decision["preset"])
        + ", режим " + str(decision["gameMode"])
        + ", уверенность " + str(decision["confidence"])
        + "; кандидаты: " + candidates_text + "\n"
        "Каталог пресетов:\n" + catalog_lines + "\n"
    )
    if enrichment:
        user_payload += "\nИстория советов и знания (сервер):\n" + enrichment + "\n"
    user_payload += "Дай JSON-ответ."
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_payload},
    ]


PROXY_ENV_VAR = "SLF_ADVISOR_PROXY"


def _recv_exact(sock, count):
    """Receive exactly count bytes; a single recv() may return short reads."""
    chunks = []
    while count > 0:
        chunk = sock.recv(count)
        if not chunk:
            raise OSError("SOCKS5 proxy closed the connection mid-handshake")
        chunks.append(chunk)
        count -= len(chunk)
    return b"".join(chunks)


def _socks5_connect(proxy_host, proxy_port, remote_host, remote_port, timeout):
    """TCP-connect to remote_host:remote_port through a SOCKS5 proxy (RFC 1928).

    Stdlib-only CONNECT, no authentication (method 0x00), remote DNS: the
    hostname is sent to the proxy as ATYP=0x03 (socks5h semantics) because
    the relay resolves names on its own side. Closes the socket on any
    handshake failure.
    """
    sock = socket.create_connection((proxy_host, proxy_port), timeout=timeout)
    try:
        # Greeting: one client method, "no authentication".
        sock.sendall(struct.pack("!BBB", 0x05, 0x01, 0x00))
        reply = _recv_exact(sock, 2)
        if reply[0] != 0x05 or reply[1] != 0x00:
            raise OSError(
                "SOCKS5 proxy refused the handshake "
                f"(ver=0x{reply[0]:02x} method=0x{reply[1]:02x})")
        # CONNECT with the hostname as ATYP=0x03: DNS stays on the relay side.
        host_bytes = remote_host.encode("idna")
        if not 0 < len(host_bytes) <= 255:
            raise OSError(f"proxy target hostname has invalid length: {remote_host!r}")
        request = (struct.pack("!BBBBB", 0x05, 0x01, 0x00, 0x03, len(host_bytes))
                   + host_bytes + struct.pack("!H", remote_port))
        sock.sendall(request)
        reply = _recv_exact(sock, 4)
        if reply[0] != 0x05:
            raise OSError(f"SOCKS5 proxy sent invalid reply version 0x{reply[0]:02x}")
        if reply[1] != 0x00:
            raise OSError(f"SOCKS5 CONNECT failed with code 0x{reply[1]:02x}")
        atyp = reply[3]
        if atyp == 0x01:
            _recv_exact(sock, 6)  # bound IPv4 + port
        elif atyp == 0x03:
            bound_len = _recv_exact(sock, 1)[0]
            _recv_exact(sock, bound_len + 2)  # bound name + port
        elif atyp == 0x04:
            _recv_exact(sock, 18)  # bound IPv6 + port
        else:
            raise OSError(f"SOCKS5 proxy sent unknown address type 0x{atyp:02x}")
        return sock
    except BaseException:
        try:
            sock.close()
        except OSError:
            pass
        raise


class _SocksHTTPSConnection(http.client.HTTPSConnection):
    """HTTPSConnection whose TCP socket is a SOCKS5 tunnel to self.host."""

    def __init__(self, *args, proxy_host, proxy_port, **kwargs):
        super().__init__(*args, **kwargs)
        self._proxy_host = proxy_host
        self._proxy_port = proxy_port

    def connect(self):
        self.sock = _socks5_connect(
            self._proxy_host, self._proxy_port, self.host, self.port, self.timeout)
        self.sock = self._context.wrap_socket(self.sock, server_hostname=self.host)


class _SocksHTTPSHandler(urllib.request.HTTPSHandler):
    """HTTPS handler routing every connection through the SOCKS5 relay."""

    def __init__(self, proxy_host, proxy_port, context=None):
        super().__init__(context=context)
        self._proxy_host = proxy_host
        self._proxy_port = proxy_port

    def https_open(self, req):
        return self.do_open(_SocksHTTPSConnection, req, context=self._context,
                            proxy_host=self._proxy_host, proxy_port=self._proxy_port)


def _proxy_config():
    """Parse SLF_ADVISOR_PROXY; None means direct egress.

    Accepted: socks5h://host:port or socks5://host:port — both send the
    target hostname to the relay (ATYP=0x03), because the relay resolves
    DNS on its own side. Anything else raises: a misconfigured proxy must
    be loud, never a silent fallback to direct.
    """
    raw = os.environ.get(PROXY_ENV_VAR, "").strip()
    if not raw:
        return None
    parts = urllib.parse.urlsplit(raw)
    try:
        port = parts.port
    except ValueError:
        port = None
    if parts.scheme not in ("socks5", "socks5h") or not parts.hostname or port is None:
        raise AdvisorError(
            "misconfigured",
            f"invalid {PROXY_ENV_VAR} {raw!r}: expected socks5h://host:port or socks5://host:port")
    return parts.hostname, port


def _build_socks_opener(proxy_host, proxy_port):
    handler = _SocksHTTPSHandler(proxy_host, proxy_port, context=ssl.create_default_context())
    # ProxyHandler({}) neutralizes http(s)_proxy environment variables: the
    # SOCKS relay is the only egress path for this opener.
    return urllib.request.build_opener(urllib.request.ProxyHandler({}), handler)


def call_openrouter(messages, api_key, model, timeout_s=REQUEST_TIMEOUT_S):
    body = json.dumps({
        "model": model,
        "messages": messages,
        "max_tokens": MAX_TOKENS,
        "temperature": TEMPERATURE,
    }).encode("utf-8")
    request = urllib.request.Request(
        OPENROUTER_URL,
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    started = time.monotonic()
    proxy = _proxy_config()
    try:
        open_request = urllib.request.urlopen
        if proxy is not None:
            open_request = _build_socks_opener(*proxy).open
        with open_request(request, timeout=timeout_s) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        retry_after = None
        try:
            retry_after = float(exc.headers.get("Retry-After", "")) if exc.headers else None
        except (TypeError, ValueError):
            retry_after = None
        if exc.code == 429:
            raise AdvisorError("rate_limited", "provider rate limited", retry_after=retry_after, status=429)
        if 500 <= exc.code < 600:
            raise AdvisorError("upstream_error", f"provider HTTP {exc.code}", retry_after=retry_after, status=exc.code)
        raise AdvisorError("upstream_rejected", f"provider HTTP {exc.code}", status=exc.code)
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise AdvisorError("network", f"transport failure: {exc}")
    latency_ms = int((time.monotonic() - started) * 1000)

    choices = payload.get("choices") if isinstance(payload, dict) else None
    content = None
    if isinstance(choices, list) and choices:
        message = choices[0].get("message") if isinstance(choices[0], dict) else None
        if isinstance(message, dict):
            content = message.get("content")
    if not isinstance(content, str) or not content.strip():
        raise AdvisorError("empty_answer", "model returned no content", status=200)
    # Ф2c (#441): OpenRouter reports which upstream served the request; the
    # client shows it next to the model name. Absent/blank -> None, never a
    # guessed value.
    provider = payload.get("provider") if isinstance(payload, dict) else None
    if not isinstance(provider, str) or not provider:
        provider = None
    return content, latency_ms, provider


def extract_json_object(text):
    """Extract the first balanced JSON object from free-form model text."""
    start = text.find("{")
    while start != -1:
        depth = 0
        in_string = False
        escaped = False
        for index in range(start, len(text)):
            char = text[index]
            if in_string:
                if escaped:
                    escaped = False
                elif char == "\\":
                    escaped = True
                elif char == '"':
                    in_string = False
                continue
            if char == '"':
                in_string = True
            elif char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    try:
                        obj = json.loads(text[start:index + 1])
                    except json.JSONDecodeError:
                        break
                    return obj if isinstance(obj, dict) else None
        start = text.find("{", start + 1)
    return None


def validate_answer(obj, catalog_ids):
    """Return (preset, confidence, reason) or raise AdvisorValidationError-like feedback."""
    if not isinstance(obj, dict):
        raise ValueError("ответ не является JSON-объектом")
    preset = obj.get("preset")
    if not isinstance(preset, str) or preset not in catalog_ids:
        raise ValueError(f"preset '{preset}' отсутствует в каталоге; выбери id строго из каталога")
    confidence = obj.get("confidence", "medium")
    if confidence not in CONFIDENCE_LEVELS:
        raise ValueError("confidence должен быть low|medium|high")
    reason = obj.get("reason")
    if not isinstance(reason, str) or not reason.strip():
        raise ValueError("reason обязателен")
    return preset, confidence, reason.strip()[:MAX_REASON_CHARS]


def _quarantine_corrupt_log(path):
    """Rename an unusable log aside; False when the rename itself failed.

    The `.corrupt-<UTC-ms>-<uuid4hex>` suffix keeps the backup out of
    collection discovery (which globs `*.json`). Rename, never overwrite:
    the original bytes stay recoverable.
    """
    backup = f"{path}.corrupt-{int(time.time() * 1000)}-{uuid.uuid4().hex}"
    try:
        os.replace(path, backup)
    except OSError:
        logger.warning("advisor log is corrupt and could not be preserved; append aborted")
        return False
    logger.warning("advisor log was corrupt; preserved as %s", os.path.basename(backup))
    return True


def append_log(data_dir, record):
    """Append one consultation record; cap the file; never raise.

    A corrupt log (invalid JSON, invalid UTF-8, or valid JSON that is not an
    array) is renamed aside before a fresh array starts, so a decode failure
    never destroys collected history. A plain read error is not corruption:
    the append aborts without touching the file.
    """
    try:
        with _LOG_LOCK:
            path = os.path.join(data_dir, f"{LOG_COLLECTION}.json")
            existing = []
            if os.path.exists(path):
                try:
                    with open(path, "r", encoding="utf-8") as handle:
                        existing = json.load(handle)
                except (json.JSONDecodeError, UnicodeDecodeError):
                    if not _quarantine_corrupt_log(path):
                        return
                    existing = []
                except OSError:
                    return
            if not isinstance(existing, list):
                if not _quarantine_corrupt_log(path):
                    return
                existing = []
            existing.append(record)
            if len(existing) > LOG_MAX_RECORDS:
                existing = existing[-LOG_MAX_RECORDS:]
            tmp_path = path + ".tmp"
            try:
                with open(tmp_path, "w", encoding="utf-8") as handle:
                    json.dump(existing, handle, ensure_ascii=False)
                os.replace(tmp_path, path)
            except OSError:
                # Best-effort append: a failed write keeps any backup taken
                # above intact and is never fatal to the consultation.
                logger.warning("advisor log append failed; record dropped")
    except OSError:
        pass


def update_log_record_apply(data_dir, record_id, ok):
    """Record an apply event on the advice record with the given id.

    Read-modify-write under the same lock as append_log. Returns one of
    "updated", "not_found", "error" — the caller maps these to honest HTTP
    statuses (200 / 404 / 500). A corrupt or unreadable log is "error":
    the update refuses to blind-write over data it cannot fully read.
    """
    try:
        with _LOG_LOCK:
            path = os.path.join(data_dir, f"{LOG_COLLECTION}.json")
            existing = []
            if os.path.exists(path):
                try:
                    with open(path, "r", encoding="utf-8") as handle:
                        existing = json.load(handle)
                except (json.JSONDecodeError, UnicodeDecodeError, OSError):
                    return "error"
            if not isinstance(existing, list):
                return "error"
            record = None
            for item in existing:
                if isinstance(item, dict) and item.get("id") == record_id:
                    record = item
                    break
            if record is None:
                return "not_found"
            record["apply"] = {
                "ok": bool(ok),
                "at": datetime.datetime.now(datetime.timezone.utc).isoformat()
            }
            tmp_path = path + ".tmp"
            with open(tmp_path, "w", encoding="utf-8") as handle:
                json.dump(existing, handle, ensure_ascii=False)
            os.replace(tmp_path, path)
            return "updated"
    except OSError:
        return "error"


def _valid_finished_score(score):
    """Finished-score predicate; duplicated from server.py on purpose.

    server.py imports this module, so importing back would be a cycle. Ints
    only, bool excluded, 0..99 per side.
    """
    if not isinstance(score, dict):
        return False
    home = score.get("home")
    away = score.get("away")
    if type(home) is not int or type(away) is not int:
        return False
    return 0 <= home <= 99 and 0 <= away <= 99


def _numeric_ts(value):
    """Finite numeric timestamp; bool is not a timestamp."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and math.isfinite(value):
        return value
    return None


def _scalar_id(value):
    """Team identifier: str or int, never bool; anything else -> None."""
    if isinstance(value, bool):
        return None
    if isinstance(value, (str, int)):
        return value
    return None


def select_match_result(results, exact_game_id):
    """Winning finished result for the exact gameId, or None.

    Candidates: status "finished", a valid finished score, and a non-blank
    string gameId byte-equal to exact_game_id. The winner is the latest
    resolvable parsedAt; a resolvable timestamp supersedes an unresolved one,
    equal timestamps keep the first candidate in file order. This is the only
    place the policy lives — the server-side index builder reuses it.
    """
    if not isinstance(results, list) or not isinstance(exact_game_id, str) or not exact_game_id:
        return None
    winner = None
    winner_ts = None
    for row in results:
        if not isinstance(row, dict) or row.get("status") != "finished":
            continue
        if not _valid_finished_score(row.get("score")):
            continue
        game_id = row.get("gameId")
        if not isinstance(game_id, str) or not game_id.strip() or game_id != exact_game_id:
            continue
        parsed_at = _numeric_ts(row.get("parsedAt"))
        if winner is None:
            winner, winner_ts = row, parsed_at
        elif parsed_at is not None and (winner_ts is None or parsed_at > winner_ts):
            winner, winner_ts = row, parsed_at
    return winner


def compute_evaluation(baseline, result):
    """Positional evaluation of a finished result against the advice score.

    The score is positional (the scoreboard's home:away order); the server
    cannot verify which side the user coaches, so only positional deltas are
    reported — never own-team goals, never a causal claim about the preset.
    """
    final = _int_pair(result.get("score")) if isinstance(result, dict) else None
    if final is None:
        raise ValueError("result carries no valid finished score")
    baseline_pair = _int_pair(baseline)

    delta = None
    if baseline_pair is None:
        delta_status = "missing_baseline"
    else:
        delta = {"home": final[0] - baseline_pair[0], "away": final[1] - baseline_pair[1]}
        if delta["home"] < 0 or delta["away"] < 0:
            delta_status = "score_regressed"
        else:
            delta_status = "available"

    teams = []
    teams_raw = result.get("teams")
    if isinstance(teams_raw, list):
        teams = [ident for ident in (_scalar_id(entry) for entry in teams_raw) if ident is not None]
    my_team = _scalar_id(result.get("myTeam"))
    orientation = "unknown"
    # Orientation reads raw positions: filtering an invalid entry would shift
    # the list and turn a wrong side into a confident claim.
    if (
        isinstance(teams_raw, list)
        and len(teams_raw) >= 2
        and all(_scalar_id(entry) is not None for entry in teams_raw)
        and my_team is not None
    ):
        if my_team == teams_raw[0]:
            orientation = "home"
        elif my_team == teams_raw[1]:
            orientation = "away"

    parsed_at = _numeric_ts(result.get("parsedAt"))
    result_key = result.get("resultKey")
    return {
        "version": 1,
        "finalScore": {"home": final[0], "away": final[1]},
        "baselineScore": (
            {"home": baseline_pair[0], "away": baseline_pair[1]}
            if baseline_pair is not None else None
        ),
        "scoreDelta": delta,
        "deltaStatus": delta_status,
        "orientation": orientation,
        "orientationBasis": (
            "result_teams_order_assumption" if orientation != "unknown" else "unknown"
        ),
        "resultTeams": teams,
        "resultMyTeam": my_team,
        "resultKey": result_key if isinstance(result_key, str) else "",
        "resultParsedAt": int(parsed_at) if parsed_at is not None else None,
        "evaluatedAt": int(time.time() * 1000),
    }


def _same_evaluation(left, right):
    """Same evaluation apart from its evaluatedAt stamp."""
    if not isinstance(left, dict):
        return False
    keys = set(right) - {"evaluatedAt"}
    if set(left) - {"evaluatedAt"} != keys:
        return False
    return all(left.get(key) == right.get(key) for key in keys)


def _result_index(results_or_index):
    """{exact gameId: winning result} built once per materialization run.

    Accepts either the raw results list (rows grouped by exact non-blank
    string gameId, one select_match_result call per group) or a prebuilt index
    dict. The winner policy stays in select_match_result either way, so the
    advice loop is a single dict lookup per record.
    """
    if isinstance(results_or_index, dict):
        return results_or_index
    if not isinstance(results_or_index, list):
        return {}
    groups = {}
    for row in results_or_index:
        if not isinstance(row, dict):
            continue
        game_id = row.get("gameId")
        if not isinstance(game_id, str) or not game_id.strip():
            continue
        groups.setdefault(game_id, []).append(row)
    index = {}
    for game_id, group in groups.items():
        winner = select_match_result(group, game_id)
        if winner is not None:
            index[game_id] = winner
    return index


def materialize_evaluations(data_dir, results_or_index):
    """Attach finished-match evaluations to advice records; return how many.

    `results_or_index` is either the raw match_results_v2 list or a prebuilt
    {exact gameId: winner result} dict; either way one index is built/looked
    up, so the run costs O(advice + results), not O(advice × results).

    Runs under _LOG_LOCK and touches only the advisor log file — never a
    collection. Idempotent: an unchanged evaluation keeps its evaluatedAt and
    the file is not rewritten. Records without a matching result are left
    untouched (an evaluation is never fabricated) and consultation-error
    records are skipped. No records are ever added.
    """
    index = _result_index(results_or_index)
    updated = 0
    try:
        with _LOG_LOCK:
            path = os.path.join(data_dir, f"{LOG_COLLECTION}.json")
            if not os.path.exists(path):
                return 0
            try:
                with open(path, "r", encoding="utf-8") as handle:
                    existing = json.load(handle)
            except (json.JSONDecodeError, UnicodeDecodeError, OSError):
                return 0
            if not isinstance(existing, list):
                return 0
            for record in existing:
                if not isinstance(record, dict) or record.get("outcome") == "error":
                    continue
                game_id = record.get("evaluationGameId")
                if not isinstance(game_id, str) or not game_id:
                    continue
                winner = index.get(game_id)
                if winner is None:
                    continue
                try:
                    evaluation = compute_evaluation(record.get("scoreAtAdvice"), winner)
                except ValueError:
                    continue
                if _same_evaluation(record.get("evaluation"), evaluation):
                    continue
                record["evaluation"] = evaluation
                updated += 1
            if not updated:
                return 0
            tmp_path = path + ".tmp"
            try:
                with open(tmp_path, "w", encoding="utf-8") as handle:
                    json.dump(existing, handle, ensure_ascii=False)
                os.replace(tmp_path, path)
            except OSError:
                logger.warning("advisor log evaluation write failed; changes dropped")
                return 0
            return updated
    except OSError:
        return 0


def handle_advisor_request(data, data_dir, read_knowledge=None):
    """Flask-view body: returns a (response, status) tuple."""
    api_key, model = get_config()
    if not api_key:
        return jsonify_available_false("advisor_not_configured", "LLM-советник не настроен на сервере"), 503

    try:
        context = validate_context(data)
    except AdvisorValidationError as exc:
        return jsonify_available_false("invalid_request", str(exc)), 400

    catalog_ids = {entry["id"] for entry in context["presetCatalog"]}
    catalog_labels = {entry["id"]: entry["label"] for entry in context["presetCatalog"]}
    # Ф2b (#441): build the enrichment once per consultation, before the
    # provider call; the log lock is released inside build_enrichment.
    enrichment = build_enrichment(data_dir, context, read_knowledge)
    messages = build_messages(context, enrichment)

    def corrective_message(feedback):
        # Built by concatenation on purpose: str.format would treat the JSON
        # braces in the template as replacement fields.
        return (
            "Твой предыдущий ответ невалиден: " + str(feedback) + ". Ответь строго одним "
            "валидным JSON-объектом без markdown: "
            '{"preset":"<id из каталога>","confidence":"low|medium|high","reason":"..."}'
        )

    started = time.monotonic()
    last_error = None
    attempt_feedback = None

    for attempt in range(MAX_ATTEMPTS):
        attempt_messages = messages
        if attempt_feedback:
            attempt_messages = messages + [{"role": "user", "content": corrective_message(attempt_feedback)}]
        try:
            call_result = call_openrouter(attempt_messages, api_key, model)
        except AdvisorError as exc:
            last_error = exc
            if attempt + 1 < MAX_ATTEMPTS and exc.kind in ("rate_limited", "upstream_error", "network"):
                time.sleep(min(exc.retry_after or 2.0, RETRY_AFTER_CAP_S))
                continue
            break
        # call_openrouter returns (content, latency_ms, provider); the
        # tolerant unpack keeps a two-value stub valid.
        content, latency_ms = call_result[0], call_result[1]
        provider = call_result[2] if len(call_result) > 2 else None
        if not isinstance(provider, str) or not provider:
            provider = None
        try:
            answer = extract_json_object(content)
            preset, confidence, reason = validate_answer(answer, catalog_ids)
        except ValueError as exc:
            attempt_feedback = str(exc)
            last_error = AdvisorError("invalid_answer", str(exc), status=200)
            continue
        advice_id = uuid.uuid4().hex
        record = {
            "id": advice_id,
            "ts": int(time.time() * 1000),
            "gameId": context["gameId"],
            "evaluationGameId": context["evaluationGameId"],
            "scoreAtAdvice": context["score"],
            "minute": context["minute"],
            "rulesPreset": context["ruleDecision"]["preset"],
            "llmPreset": preset,
            "confidence": confidence,
            "latencyMs": latency_ms,
            "outcome": "ok",
            "errorKind": None,
            "model": model,
        }
        append_log(data_dir, record)
        return {
            "available": True,
            "adviceId": advice_id,
            "preset": preset,
            "presetLabel": catalog_labels.get(preset, preset),
            "confidence": confidence,
            "reason": reason,
            "model": model,
            "provider": provider,
            "latencyMs": latency_ms,
        }, 200

    latency_ms = int((time.monotonic() - started) * 1000)
    kind = last_error.kind if last_error else "unknown"
    record = {
        "ts": int(time.time() * 1000),
        "gameId": context["gameId"],
        "evaluationGameId": context["evaluationGameId"],
        "scoreAtAdvice": context["score"],
        "minute": context["minute"],
        "rulesPreset": context["ruleDecision"]["preset"],
        "llmPreset": None,
        "confidence": None,
        "latencyMs": latency_ms,
        "outcome": "error",
        "errorKind": kind,
        "model": model,
    }
    append_log(data_dir, record)
    messages_by_kind = {
        "rate_limited": "LLM перегружен (лимит провайдера), попробуйте позже",
        "network": "LLM-провайдер недоступен (сеть), попробуйте позже",
        "upstream_error": "LLM-провайдер временно ошибается, попробуйте позже",
        "upstream_rejected": "запрос отклонён LLM-провайдером",
        "invalid_answer": "LLM вернул невалидный ответ, попробуйте ещё раз",
        "misconfigured": "advisor сконфигурирован неверно (SLF_ADVISOR_PROXY), обратитесь к администратору",
    }
    return jsonify_available_false(kind, messages_by_kind.get(kind, "LLM недоступен")), 503 if kind in ("rate_limited", "network", "upstream_error") else 502


def jsonify_available_false(error_kind, message):
    return {"available": False, "errorKind": error_kind, "error": message}
