#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
license_manager.py — Gestion locale de la licence OxymoreVision
-----------------------------------------------------------------
• Machine ID reproductible  : SHA256(hostname|MAC)
• Cache local               : %APPDATA%/OxymoreVision/license.json
• Recheck serveur           : à chaque démarrage (timeout court)
• Période de grâce          : 7 jours si serveur injoignable

URL du serveur configurée via variable d'environnement :
    OXYMORE_LICENSE_SERVER=https://your-server.com/api

Si vide (défaut) → mode DEV : tout est valide, aucun ping.
"""

import hashlib, hmac, json, os, platform, uuid
from datetime import datetime, timedelta
from pathlib import Path

# ─── Config ──────────────────────────────────────────────────────────────────
LICENSE_SERVER_URL: str = os.environ.get(
    "OXYMORE_LICENSE_SERVER",
    "https://ifngdigfyzoreeyddlgy.supabase.co/functions/v1",  # Supabase Edge Functions
)
GRACE_PERIOD_DAYS       = 7
REQUEST_TIMEOUT_S       = 10   # activation
STARTUP_TIMEOUT_S       = 5    # check au démarrage (court pour ne pas bloquer)

_APPDATA     = Path(os.environ.get("APPDATA", os.path.expanduser("~")))
LICENSE_FILE = _APPDATA / "OxymoreVision" / "license.json"

# ─── Signature du cache ───────────────────────────────────────────────────────
# Clé dérivée du machine_id + sel statique → unique par machine, non transférable
_CACHE_SALT = b"OxymoreVision\x2f\x9a\x4c\x11\x87\xe3\x5b\xf0"

def _cache_secret() -> bytes:
    """Clé HMAC dérivée du machine ID — différente sur chaque PC."""
    mid = get_machine_id().encode()
    return hashlib.sha256(_CACHE_SALT + mid).digest()

def _sign(data: dict) -> str:
    """Signature HMAC-SHA256 du contenu JSON (clés triées)."""
    payload = json.dumps(data, sort_keys=True, ensure_ascii=False).encode()
    return hmac.new(_cache_secret(), payload, hashlib.sha256).hexdigest()

def _verify(data: dict) -> bool:
    """Vérifie la signature — False si absent ou falsifié."""
    sig = data.pop("_sig", None)
    if not sig:
        return False
    expected = _sign(data)
    data["_sig"] = sig  # remet la clé en place
    return hmac.compare_digest(sig, expected)


# ─── Machine ID ──────────────────────────────────────────────────────────────
def get_machine_id() -> str:
    """Empreinte matérielle reproductible : SHA256(hostname|MAC)[:32]."""
    raw = f"{platform.node()}|{uuid.getnode()}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


# ─── Persistance locale ───────────────────────────────────────────────────────
def load_license() -> dict:
    """Charge le cache local et vérifie son intégrité HMAC.
    Retourne {} si le fichier est absent, corrompu ou falsifié.
    """
    try:
        if LICENSE_FILE.exists():
            data = json.loads(LICENSE_FILE.read_text(encoding="utf-8"))
            if not _verify(data):
                # Cache falsifié ou venant d'une autre machine → ignoré
                return {}
            # Retire la signature du dict retourné (usage interne uniquement)
            data.pop("_sig", None)
            return data
    except Exception:
        pass
    return {}


def save_license(data: dict) -> None:
    """Sauvegarde le cache local avec signature HMAC."""
    payload = {k: v for k, v in data.items() if k != "_sig"}
    payload["_sig"] = _sign(payload)
    LICENSE_FILE.parent.mkdir(parents=True, exist_ok=True)
    LICENSE_FILE.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def deactivate_license() -> dict:
    """Supprime le cache de licence local (désactivation)."""
    try:
        if LICENSE_FILE.exists():
            LICENSE_FILE.unlink()
        return {"ok": True, "message": "Licence désactivée"}
    except Exception as exc:
        return {"ok": False, "message": str(exc)}


# ─── Helpers de dates ─────────────────────────────────────────────────────────
def _build_result(lic: dict, mid: str) -> dict:
    """Construit le dict de résultat standard depuis le cache."""
    valid, reason = is_valid_local(lic)
    return {
        "valid": valid, "reason": reason,
        "key": lic.get("key"), "expiry": lic.get("expiry"),
        "last_check": lic.get("last_check"), "grace_until": lic.get("grace_until"),
        "machine_id": mid,
    }


def _in_grace(lic: dict) -> bool:
    g = lic.get("grace_until")
    if not g:
        return False
    try:
        return datetime.utcnow() < datetime.fromisoformat(g)
    except Exception:
        return False


def _is_expired(lic: dict) -> bool:
    expiry = lic.get("expiry")
    if not expiry:
        return False
    try:
        return datetime.utcnow() > datetime.fromisoformat(expiry)
    except Exception:
        return False


# ─── Validité locale ──────────────────────────────────────────────────────────
def is_valid_local(lic: dict) -> tuple:
    """Vérifie le cache local sans réseau. Retourne (bool, raison)."""
    if not lic.get("key"):
        return False, "no_license"
    if _is_expired(lic):
        return False, "expired"
    if lic.get("valid"):
        return True, "valid"
    if _in_grace(lic):
        return True, "grace"
    return False, "invalid"


# ─── Ping serveur ─────────────────────────────────────────────────────────────
def _ping_server(key: str, machine_id: str, server_url: str = None, timeout: int = None) -> dict:
    """
    POST /validate sur le serveur distant.
    Utilise requests si dispo, sinon urllib (stdlib).
    Retourne {"valid": bool|None, "offline": bool, "message": str, "expiry": str|None}.
    """
    t    = timeout or REQUEST_TIMEOUT_S
    url  = (server_url or LICENSE_SERVER_URL).rstrip("/") + "/validate"
    body = json.dumps({"key": key, "machine_id": machine_id, "app": "OxymoreVision"}).encode()
    try:
        try:
            import requests
            resp = requests.post(
                url,
                json={"key": key, "machine_id": machine_id, "app": "OxymoreVision"},
                timeout=t,
            )
            return resp.json()
        except ImportError:
            import urllib.request as _url
            req = _url.Request(
                url, data=body,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with _url.urlopen(req, timeout=t) as r:
                return json.loads(r.read())
    except Exception as e:
        return {"valid": None, "offline": True, "error": str(e)}


# ─── Activation ──────────────────────────────────────────────────────────────
def activate_license(key: str, server_url: str = None) -> dict:
    """
    Active une nouvelle clé de licence.
    En mode dev (pas de serveur), accepte toute clé localement.
    Retourne {"valid": bool, "message": str}.
    """
    key = key.strip().upper()
    effective_url = server_url or LICENSE_SERVER_URL

    now = datetime.utcnow().isoformat()
    grace_until = (datetime.utcnow() + timedelta(days=GRACE_PERIOD_DAYS)).isoformat()

    if not effective_url:
        # Mode DEV : accepte sans ping
        save_license({
            "key": key, "machine_id": get_machine_id(),
            "last_check": now, "valid": True,
            "expiry": None, "grace_until": grace_until,
        })
        return {"valid": True, "message": "Mode développement — licence acceptée localement"}

    machine_id = get_machine_id()
    result = _ping_server(key, machine_id, effective_url)

    if result.get("offline"):
        return {"valid": False,
                "message": f"Serveur injoignable ({result.get('error', '')})"}

    lic = {
        "key":        key,
        "machine_id": machine_id,
        "last_check": now,
        "valid":      bool(result.get("valid")),
        "expiry":     result.get("expiry"),
        "grace_until": grace_until,
    }
    save_license(lic)
    return {"valid": lic["valid"], "message": result.get("message", "")}


# ─── Lecture cache uniquement (sans réseau) ───────────────────────────────────
def check_license_cached() -> dict:
    """
    Retourne le statut depuis le cache local, sans aucun ping réseau.
    Utilisé pour la réponse immédiate au démarrage.
    """
    mid = get_machine_id()
    if not LICENSE_SERVER_URL:
        lic = load_license()
        return {
            "valid": True, "reason": "dev_mode",
            "key": lic.get("key", "DEV-MODE"),
            "expiry": lic.get("expiry"), "last_check": lic.get("last_check"),
            "grace_until": lic.get("grace_until"), "machine_id": mid,
        }
    lic = load_license()
    if not lic.get("key"):
        return {"valid": False, "reason": "no_license", "key": None,
                "expiry": None, "last_check": None, "grace_until": None,
                "machine_id": mid}
    return _build_result(lic, mid)


# ─── Vérification complète (ping serveur) ─────────────────────────────────────
def check_license(force: bool = False) -> dict:
    """
    Vérification complète de la licence. Mode DEV si serveur non configuré.

    Retourne :
    {
      "valid"      : bool,
      "reason"     : "dev_mode"|"valid"|"grace"|"no_license"|"expired"|"invalid",
      "key"        : str | None,
      "expiry"     : str | None,
      "last_check" : str | None,
      "grace_until": str | None,
      "machine_id" : str,
    }
    """
    mid = get_machine_id()

    # ── Mode DEV (aucun serveur configuré) ─────────────────────────────────
    if not LICENSE_SERVER_URL:
        lic = load_license()
        return {
            "valid": True, "reason": "dev_mode",
            "key": lic.get("key", "DEV-MODE"),
            "expiry": lic.get("expiry"),
            "last_check": lic.get("last_check"),
            "grace_until": lic.get("grace_until"),
            "machine_id": mid,
        }

    lic = load_license()
    if not lic.get("key"):
        return {"valid": False, "reason": "no_license", "key": None,
                "expiry": None, "last_check": None, "grace_until": None,
                "machine_id": mid}

    # Ping serveur (toujours, appelée depuis le thread de fond)
    result = _ping_server(lic["key"], mid, timeout=STARTUP_TIMEOUT_S)
    now    = datetime.utcnow().isoformat()

    if result.get("offline"):
        # Serveur injoignable → grâce si encore active
        if not _in_grace(lic):
            lic["valid"] = False
            save_license(lic)
    else:
        # Serveur joignable → résultat autoritaire
        lic["last_check"] = now
        lic["valid"]      = bool(result.get("valid"))
        lic["expiry"]     = result.get("expiry")
        lic["grace_until"] = (
            (datetime.utcnow() + timedelta(days=GRACE_PERIOD_DAYS)).isoformat()
            if lic["valid"] else None
        )
        save_license(lic)

    return _build_result(lic, mid)
