#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Oxymore Vision — Backend Flask + WebSocket
"""

import os, sys, json, subprocess, threading, webbrowser, socket, tempfile
from pathlib import Path

# ─── Charge .env si présent (stdlib pure, pas de python-dotenv requis) ───────
# Frozen (exe) → .env à côté de l'exe ; dev → .env à côté de server.py
if getattr(sys, 'frozen', False):
    _env_file = Path(sys.executable).parent / ".env"
else:
    _env_file = Path(__file__).parent / ".env"
if _env_file.exists():
    for _line in _env_file.read_text(encoding="utf-8").splitlines():
        _line = _line.strip()
        if _line and not _line.startswith("#") and "=" in _line:
            _k, _, _v = _line.partition("=")
            os.environ.setdefault(_k.strip(), _v.strip())

from flask import Flask, request, jsonify, send_from_directory
from flask_socketio import SocketIO, emit
from flask_cors import CORS

# ─── Silence les lignes TLS-sur-HTTP (port 5173 reçoit des ClientHello) ──────
# Werkzeug émet DEUX types de logs pour ces requêtes invalides :
#   1. access log  : '192.168.x.x - - [...] "\x16\x03\x01..." 400 -'
#   2. error log   : 'code 400, message Bad request version (...)'
# On filtre les deux en détectant \x16\x03 (header TLS universel) ou les
# messages d'erreur connus.
import logging as _logging
class _SuppressTlsNoise(_logging.Filter):
    def filter(self, record):
        msg = record.getMessage()
        return not (
            '\x16\x03' in msg                        or   # access log TLS
            'Bad request version' in msg             or   # error log variante 1
            'Bad HTTP/0.9'        in msg             or   # error log variante 2
            'Bad request syntax'  in msg             or   # error log variante 3
            'write() before start_response' in msg   or   # WebSocket upgrade noise (benign, fallback vers polling)
            'AssertionError' in msg                       # même traceback
        )
_logging.getLogger("werkzeug").addFilter(_SuppressTlsNoise())

# ─── Fix DLL PyInstaller (appelé UNE FOIS au démarrage) ──────────────────────
# PyInstaller onefile appelle SetDllDirectoryW(_MEIPASS) au boot, ce qui
# injecte son dossier temp dans l'ordre de recherche DLL Windows.
# Tous les subprocesses héritent de ça → python312.dll conflict.
# NULL = restaure l'ordre standard avant de lancer quoi que ce soit.
if sys.platform == "win32" and getattr(sys, 'frozen', False):
    try:
        import ctypes
        ctypes.windll.kernel32.SetDllDirectoryW(None)
    except Exception:
        pass

# ─── Chemins ─────────────────────────────────────────────────────────────────
if getattr(sys, 'frozen', False):
    # PyInstaller onefile : fichiers extraits dans sys._MEIPASS
    BASE_DIR = Path(sys._MEIPASS)
else:
    BASE_DIR = Path(__file__).parent

UI_DIR      = BASE_DIR / "App"
RUNNER_PATH    = BASE_DIR / "pose2sim_runner.py"
BVH_SCRIPT_PATH = BASE_DIR / "pose2sim_to_bvh.py"

# ── Copie du runner hors de _MEIPASS ─────────────────────────────────────────
# PROBLÈME : quand le subprocess venv Python exécute un script situé dans
# _MEIPASS, Python met automatiquement _MEIPASS dans sys.path[0].
# _MEIPASS contient les .pyd du build (compilés pour le Python DEV) →
# Python les charge en priorité sur ceux du venv → python312.dll du DEV vs
# python312.dll du CLIENT → "Module use of python312.dll conflicts…"
#
# FIX : copier le runner dans %TEMP%\OxymoreVision\ → sys.path[0] = %TEMP%
# → seuls les .pyd du venv (compilés pour le Python CLIENT) sont chargés.
if getattr(sys, 'frozen', False):
    try:
        import shutil   as _shutil
        import tempfile as _tempfile
        _tmp_runner_dir = Path(_tempfile.gettempdir()) / "OxymoreVision"
        _tmp_runner_dir.mkdir(exist_ok=True)
        _runner_copy = _tmp_runner_dir / "pose2sim_runner.py"
        _shutil.copy2(str(RUNNER_PATH), str(_runner_copy))
        RUNNER_PATH = _runner_copy
        _bvh_copy = _tmp_runner_dir / "pose2sim_to_bvh.py"
        _shutil.copy2(str(BVH_SCRIPT_PATH), str(_bvh_copy))
        BVH_SCRIPT_PATH = _bvh_copy
    except Exception:
        pass  # fall back to _MEIPASS path si la copie échoue

# ─── Setup manager ───────────────────────────────────────────────────────────
sys.path.insert(0, str(BASE_DIR))
from setup_manager import (is_setup_done, run_setup_async, get_venv_python,
                           validate_python, use_existing_python,
                           get_setup_info, scan_python_candidates,
                           reset_setup, try_auto_setup)
from license_manager import (check_license, check_license_cached, activate_license,
                             get_machine_id, deactivate_license,
                             LICENSE_SERVER_URL)
import threading as _threading

import secrets as _sec
from datetime import datetime as _dt, timedelta as _td, timezone as _tz

# ── Credentials admin in-app (Key Manager) ────────────────────────────────────
_ADMIN_ID            = os.environ.get("OXYMORE_ADMIN_ID",           "admin")
_ADMIN_PASSWORD      = os.environ.get("OXYMORE_ADMIN_PASSWORD",     "Oxymore2026Admin")
_ADMIN_TOKEN         = os.environ.get("OXYMORE_ADMIN_TOKEN", os.environ.get("OXYMORE_LICENSE_RENDER_TOKEN", "Oxymore2026"))  # ADMIN_TOKEN Supabase
_admin_sessions: dict = {}   # token -> expiry datetime

# ─── Flask ───────────────────────────────────────────────────────────────────
app = Flask(__name__, static_folder=str(UI_DIR), static_url_path="")
app.config["SECRET_KEY"] = "oxymore-vision-2026"
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

state = {
    "project_dir": "",
    "current_proc": None,
    "running": False,
}
_run_lock = threading.Lock()   # bug #8 : évite le double-démarrage par race condition

# ─── UI ──────────────────────────────────────────────────────────────────────
@app.route("/")
def index():
    return send_from_directory(UI_DIR, "Oxymore Vision.html")

@app.route("/<path:filename>")
def static_files(filename):
    return send_from_directory(UI_DIR, filename)


# ─── REC mode (capture vidéo multi-appareils sur LAN) ────────────────────────
import uuid as _uuid

REC_DIR = Path(tempfile.gettempdir() if False else os.path.expanduser("~")) / "OxymoreVision" / "rec_uploads"
try:
    REC_DIR.mkdir(parents=True, exist_ok=True)
except Exception:
    REC_DIR = Path(tempfile.gettempdir()) / "OxymoreVision_rec"
    REC_DIR.mkdir(parents=True, exist_ok=True)

# Session REC en cours : devices, fichiers uploadés, état
_rec_state = {
    "session_id": None,
    "devices":    {},   # sid -> {name, ua, status, joined_at}
    "files":      [],   # [{device, filename, path, size, ts}]
    "recording":  False,
}

def _get_lan_ip() -> str:
    """Retourne l'IP locale utilisée pour sortir vers le réseau (pour QR code)."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 53))
        ip = s.getsockname()[0]
    except Exception:
        ip = "127.0.0.1"
    finally:
        s.close()
    return ip


def _get_cert_path():
    """Trouve le fichier .crt généré (à côté de l'exe ou dans LOCALAPPDATA)."""
    candidates = [
        BASE_DIR / "oxymore_rec.crt",
        Path(os.environ.get("LOCALAPPDATA", "")) / "OxymoreVision" / "oxymore_rec.crt",
        Path(tempfile.gettempdir()) / "OxymoreVision" / "oxymore_rec.crt",
    ]
    for p in candidates:
        if p.exists():
            return p
    return None


# ── Serveur REC HTTPS (lancé à la demande depuis l'onglet REC) ────────────────
REC_HTTPS_PORT = 5174   # Port FIXE pour le serveur HTTPS REC (téléphones)
_rec_https_state = {"port": None, "thread": None, "ready": False}

def _start_rec_https_server():
    """Démarre un serveur HTTPS sur 0.0.0.0 dédié aux connexions téléphone."""
    import ssl as _ssl
    try:
        import app_desktop as _ad
        cert_path, key_path = _ad.ensure_https_cert()
    except Exception as e:
        print(f"[rec-https] Cert impossible : {e}", flush=True)
        return

    if not cert_path or not key_path:
        print("[rec-https] Cert non disponible", flush=True)
        return

    # Port FIXE : 5174 (évite les règles pare-feu aléatoires)
    port = REC_HTTPS_PORT
    _rec_https_state["port"] = port

    ctx = _ssl.SSLContext(_ssl.PROTOCOL_TLS_SERVER)
    ctx.minimum_version = _ssl.TLSVersion.TLSv1_2
    ctx.load_cert_chain(str(cert_path), str(key_path))
    try:
        ctx.set_alpn_protocols(["http/1.1"])
    except Exception:
        pass

    # Installe le cert dans le store Windows si pas encore fait (silencieux)
    if sys.platform == "win32":
        try:
            subprocess.run(
                ["certutil", "-addstore", "-user", "-f", "Root", str(cert_path)],
                capture_output=True, timeout=10,
            )
        except Exception:
            pass

    # Vérifie que le port est libre avant de démarrer
    try:
        _test = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        _test.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        _test.bind(('0.0.0.0', port))
        _test.close()
    except OSError:
        print(f"[rec-https] Port {port} deja occupe — serveur HTTPS deja actif ?", flush=True)
        _rec_https_state["ready"] = True   # port pris = une autre instance tourne deja
        return

    _rec_https_state["ready"] = True
    print(f"[rec-https] Demarrage HTTPS sur port {port}", flush=True)
    try:
        socketio.run(app, host="0.0.0.0", port=port,
                     ssl_context=ctx, debug=False, allow_unsafe_werkzeug=True,
                     use_reloader=False)
    except Exception as e:
        print(f"[rec-https] Erreur serveur HTTPS : {e}", flush=True)
        _rec_https_state["ready"] = False
        _rec_https_state["port"]  = None


@app.route("/api/rec/start-https", methods=["POST"])
def rec_start_https():
    """Lance le serveur REC HTTPS si pas déjà actif. Renvoie l'URL HTTPS."""
    # En prod (exe) le serveur tourne déjà en HTTPS — pas besoin d'un 2e serveur
    if request.is_secure:
        host = request.host
        port = host.split(':')[-1] if ':' in host else '443'
        url = f"https://{_get_lan_ip()}:{port}/rec"
        return jsonify({"ok": True, "url": url, "already_https": True})

    # Dev mode : lance le serveur HTTPS séparé
    if not _rec_https_state["thread"] or not _rec_https_state["thread"].is_alive():
        t = threading.Thread(target=_start_rec_https_server, daemon=True)
        t.start()
        _rec_https_state["thread"] = t
        # Attend max 5s que le port soit assigné
        import time as _t
        for _ in range(50):
            if _rec_https_state["port"]:
                break
            _t.sleep(0.1)

    port = _rec_https_state["port"]
    if not port:
        return jsonify({"ok": False, "error": "Serveur HTTPS non démarré"}), 500

    url = f"https://{_get_lan_ip()}:{port}/rec"
    return jsonify({"ok": True, "url": url, "port": port, "already_https": False})


@app.route("/rec")
def rec_page():
    """Page mobile : capture vidéo via getUserMedia + sync WebSocket."""
    return send_from_directory(UI_DIR, "rec.html")


@app.route("/api/rec/cert")
def rec_cert_download():
    """Sert le fichier .crt pour installation sur téléphone."""
    cert = _get_cert_path()
    if not cert:
        return jsonify({"error": "Cert introuvable"}), 404
    from flask import send_file
    return send_file(str(cert), mimetype="application/x-x509-ca-cert",
                     as_attachment=True, download_name="oxymore_vision.crt")


@app.route("/api/rec/trust-cert", methods=["POST"])
def rec_trust_cert():
    """Installe le cert dans le store Windows (Current User → Trusted Root).
    Pas besoin d'admin. Chrome/Edge font ensuite confiance au cert sans warning."""
    if sys.platform != "win32":
        return jsonify({"ok": False, "error": "Windows uniquement"})
    cert = _get_cert_path()
    if not cert:
        return jsonify({"ok": False, "error": "Cert introuvable — relance l'app"})
    try:
        r = subprocess.run(
            ["certutil", "-addstore", "-user", "-f", "Root", str(cert)],
            capture_output=True, text=True, timeout=15,
            encoding="utf-8", errors="replace",
        )
        if r.returncode == 0:
            return jsonify({"ok": True, "msg": "Cert installé — recharge la page du navigateur"})
        else:
            return jsonify({"ok": False, "error": r.stdout + r.stderr})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)})


@app.route("/api/rec/cert-qr")
def rec_cert_qr():
    """QR code PNG pointant vers le téléchargement du .crt (pour installation sur téléphone)."""
    try:
        import qrcode
        from io import BytesIO
        from flask import Response
        host = request.host
        port = host.split(':')[-1] if ':' in host else ('443' if request.is_secure else '80')
        scheme = request.scheme
        url = f"{scheme}://{_get_lan_ip()}:{port}/api/rec/cert"
        img = qrcode.make(url, box_size=8, border=2)
        buf = BytesIO()
        img.save(buf, format='PNG')
        buf.seek(0)
        return Response(buf.getvalue(), mimetype='image/png')
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/rec/info")
def rec_info():
    """Infos session : URL LAN à scanner + liste devices."""
    lan_ip = _get_lan_ip()
    # Si serveur HTTPS REC actif → URL HTTPS sur port fixe 5174
    if _rec_https_state["port"]:
        scheme = "https"
        port   = str(_rec_https_state["port"])
    else:
        host   = request.host  # ex. "192.168.1.10:5173"
        port   = host.split(':')[-1] if ':' in host else ('443' if request.is_secure else '5050')
        scheme = request.scheme
    url = f"{scheme}://{lan_ip}:{port}/rec"
    return jsonify({
        "lan_url":    url,
        "lan_ip":     lan_ip,
        "port":       port,
        "session_id": _rec_state["session_id"],
        "devices":    list(_rec_state["devices"].values()),
        "files":      _rec_state["files"],
        "recording":  _rec_state["recording"],
    })


@app.route("/api/rec/qr")
def rec_qr():
    """Génère un QR code PNG pointant vers l'URL LAN /rec (HTTPS si prêt)."""
    try:
        import qrcode
        from io import BytesIO
        from flask import Response
        # Si le serveur HTTPS REC tourne → QR pointe vers HTTPS:5174
        if _rec_https_state["port"]:
            url = f"https://{_get_lan_ip()}:{_rec_https_state['port']}/rec"
        else:
            host = request.host
            port = host.split(':')[-1] if ':' in host else ('443' if request.is_secure else '5050')
            scheme = request.scheme
            url = f"{scheme}://{_get_lan_ip()}:{port}/rec"
        img = qrcode.make(url, box_size=10, border=2)
        buf = BytesIO()
        img.save(buf, format='PNG')
        buf.seek(0)
        return Response(buf.getvalue(), mimetype='image/png')
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/rec/upload", methods=["POST"])
def rec_upload():
    """Réception d'un fichier vidéo depuis un téléphone."""
    f = request.files.get("file")
    if not f:
        return jsonify({"ok": False, "error": "Aucun fichier"}), 400
    device_name = request.form.get("device", "unknown")
    safe_dev = "".join(c if c.isalnum() or c in "._-" else "_" for c in device_name)[:50]
    ts = _dt.now().strftime("%Y%m%d_%H%M%S")
    ext = os.path.splitext(f.filename or "video.webm")[1] or ".webm"
    fname = f"{safe_dev}_{ts}{ext}"
    fpath = REC_DIR / fname
    f.save(str(fpath))
    info = {
        "device":   device_name,
        "filename": fname,
        "path":     str(fpath),
        "size":     fpath.stat().st_size,
        "ts":       ts,
    }
    _rec_state["files"].append(info)
    socketio.emit("rec_uploaded", info)
    return jsonify({"ok": True, **info})


@app.route("/api/rec/import", methods=["POST"])
def rec_import():
    """Copie les fichiers uploadés vers le dossier videos/ du projet actif."""
    proj = (request.json or {}).get("project") or state.get("project_dir")
    if not proj or not os.path.isdir(proj):
        return jsonify({"ok": False, "error": "Aucun projet actif"}), 400
    videos_dir = os.path.join(proj, "videos")
    os.makedirs(videos_dir, exist_ok=True)
    imported = []
    for f in _rec_state["files"]:
        src = f["path"]
        if not os.path.exists(src):
            continue
        dst = os.path.join(videos_dir, f["filename"])
        try:
            import shutil as _sh
            _sh.move(src, dst)
            imported.append({"src": src, "dst": dst})
        except Exception as e:
            imported.append({"src": src, "error": str(e)})
    # Vide la liste après import réussi
    _rec_state["files"] = [x for x in _rec_state["files"]
                           if any(i.get("error") and i["src"] == x["path"] for i in imported)]
    return jsonify({"ok": True, "imported": imported, "videos_dir": videos_dir})


@app.route("/api/rec/firewall-status")
def rec_firewall_status():
    """Vérifie le profil réseau actuel (Private/Domain = OK, Public = à corriger).
    On ne crée plus de règles manuelles — Windows gère sa propre dialog 'Autoriser l'accès'
    automatiquement dès qu'un exe écoute sur un port sur un réseau Privé."""
    if sys.platform != "win32":
        return jsonify({"applicable": False})
    try:
        ps = (
            'Get-NetConnectionProfile '
            '| Where-Object {$_.IPv4Connectivity -eq "Internet" -or $_.IPv6Connectivity -eq "Internet"} '
            '| Select-Object -First 1 -ExpandProperty NetworkCategory'
        )
        r = subprocess.run(
            ["powershell", "-NonInteractive", "-Command", ps],
            capture_output=True, text=True, timeout=5,
            encoding="utf-8", errors="replace",
        )
        profile = (r.stdout or "").strip() or "Unknown"
        # Private ou Domain = Windows autorisera la connexion (sa propre dialog si 1ère fois)
        ok = profile in ("Private", "DomainAuthenticated", "Domain")
        return jsonify({
            "applicable": True,
            "has_rule":   ok,      # réutilise le champ pour ne pas changer le frontend
            "profile":    profile,
        })
    except Exception as e:
        return jsonify({"applicable": True, "has_rule": True, "error": str(e)})


@app.route("/api/rec/fix-firewall", methods=["POST"])
def rec_fix_firewall():
    """Bascule le profil réseau en Privé via UAC.
    On ne touche PAS aux règles pare-feu — Windows les gère lui-même avec sa
    dialog native 'Autoriser l'accès' au premier démarrage du serveur HTTPS."""
    if sys.platform != "win32":
        return jsonify({"ok": False, "error": "Windows uniquement"})

    script = (
        'Add-Type -AssemblyName System.Windows.Forms\n'
        'try {\n'
        '  $p = Get-NetConnectionProfile '
        '| Where-Object {$_.IPv4Connectivity -eq "Internet" -or $_.IPv6Connectivity -eq "Internet"} '
        '| Select-Object -First 1\n'
        '  if ($p -and $p.NetworkCategory -eq "Public") {\n'
        '    $p | Set-NetConnectionProfile -NetworkCategory Private -ErrorAction Stop\n'
        '  }\n'
        '  [System.Windows.Forms.MessageBox]::Show(\n'
        '    "Reseau passe en Prive.`n`nWindows te demandera d''autoriser Oxymore Vision`nla premiere fois qu''un telephone se connecte.",\n'
        '    "Oxymore Vision", "OK", "Information") | Out-Null\n'
        '} catch {\n'
        '  [System.Windows.Forms.MessageBox]::Show(\n'
        '    "Erreur : " + $_.Exception.Message,\n'
        '    "Oxymore Vision", "OK", "Error") | Out-Null\n'
        '}\n'
    )

    try:
        script_path = Path(tempfile.gettempdir()) / "oxymore_fix_network.ps1"
        script_path.write_text(script, encoding="utf-8")
        launcher = (
            'Start-Process powershell -Verb RunAs -WindowStyle Hidden '
            f'-ArgumentList "-NonInteractive","-WindowStyle","Hidden","-ExecutionPolicy","Bypass","-File","{script_path}"'
        )
        subprocess.Popen(
            ["powershell", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", launcher],
            creationflags=0x08000000,
        )
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)})


@app.route("/api/rec/clear", methods=["POST"])
def rec_clear():
    """Efface les fichiers uploadés (sans les importer)."""
    for f in _rec_state["files"]:
        try:
            if os.path.exists(f["path"]):
                os.unlink(f["path"])
        except Exception: pass
    _rec_state["files"] = []
    socketio.emit("rec_files_cleared", {})
    return jsonify({"ok": True})


# ─── Setup ───────────────────────────────────────────────────────────────────
@app.route("/api/setup/status")
def setup_status():
    return jsonify({"done": is_setup_done()})

@app.route("/api/setup/install", methods=["POST"])
def setup_install():
    if is_setup_done():
        return jsonify({"ok": True, "already_done": True})
    body        = request.get_json(silent=True) or {}
    install_dir = body.get("install_dir", "").strip() or None   # None = dossier par défaut
    run_setup_async(socketio, install_dir=install_dir)
    return jsonify({"ok": True, "started": True})

@app.route("/api/setup/validate-python", methods=["POST"])
def setup_validate_python():
    """Vérifie qu'un Python existant a pose2sim installé."""
    path = (request.json or {}).get("path", "").strip()
    if not path or not os.path.exists(path):
        return jsonify({"ok": False, "error": "Chemin introuvable"})
    ok = validate_python(path)
    return jsonify({"ok": ok, "error": None if ok else "pose2sim non trouvé dans ce Python"})

@app.route("/api/setup/use-existing", methods=["POST"])
def setup_use_existing():
    """Enregistre un Python existant et marque le setup comme terminé."""
    path = (request.json or {}).get("path", "").strip()
    if not path or not os.path.exists(path):
        return jsonify({"ok": False, "error": "Chemin introuvable"})
    if not validate_python(path):
        return jsonify({"ok": False, "error": "pose2sim / toml non trouvés dans ce Python"})
    use_existing_python(path)
    socketio.emit("setup_done", {"ok": True})
    return jsonify({"ok": True})


# ─── Dépendances (onglet dédié) ──────────────────────────────────────────────
@app.route("/api/setup/info")
def setup_info():
    """État courant des dépendances (mode + chemin Python actif)."""
    return jsonify(get_setup_info())


@app.route("/api/setup/scan", methods=["POST"])
def setup_scan():
    """Scan toutes les installations Python sur la machine + check pose2sim."""
    try:
        body = request.get_json(silent=True) or {}
        check = bool(body.get("check_pose2sim", True))
        cands = scan_python_candidates(check_pose2sim=check)
        return jsonify({"ok": True, "candidates": cands})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e), "candidates": []})


@app.route("/api/setup/reset", methods=["POST"])
def setup_reset():
    """Efface la config dépendances (sans toucher au venv)."""
    reset_setup()
    return jsonify({"ok": True})


@app.route("/api/setup/auto-detect", methods=["POST"])
def setup_auto_detect():
    """Tente une auto-détection et l'applique si un Python avec pose2sim est trouvé."""
    found = try_auto_setup()
    return jsonify({"ok": bool(found), "path": found})


# ─── Export console (fallback si JS download bloqué) ─────────────────────────
@app.route("/api/console/export", methods=["POST"])
def console_export():
    """
    Reçoit { content, filename } et renvoie le contenu en text/plain
    avec Content-Disposition: attachment pour forcer le download navigateur.
    """
    from flask import Response
    body     = request.get_json(silent=True) or {}
    content  = body.get("content", "")
    filename = (body.get("filename") or "oxymore-console.txt").replace('"', '')
    return Response(
        content,
        mimetype="text/plain; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

# ─── Projet ──────────────────────────────────────────────────────────────────
@app.route("/api/project", methods=["GET", "POST"])
def project():
    if request.method == "POST":
        state["project_dir"] = request.json.get("path", "")
        return jsonify({"ok": True, "path": state["project_dir"]})
    return jsonify({"path": state["project_dir"]})

@app.route("/api/projects/scan", methods=["POST"])
def scan_projects():
    import time
    parent = request.json.get("parent", "")
    if not os.path.isdir(parent):
        return jsonify({"projects": []})
    projects = []
    for d in Path(parent).iterdir():
        if not d.is_dir() or not (d / "Config.toml").exists():
            continue

        # Dossiers générés existants
        folders = [f.name for f in d.iterdir() if f.is_dir()]

        # Nb caméras depuis Calib.toml
        nb_cameras = 0
        calib = d / "calibration" / "Calib.toml"
        if calib.exists():
            try:
                import toml
                c = toml.load(calib)
                nb_cameras = len([k for k in c if k.startswith('cam_')])
            except: pass

        # Nb vidéos
        nb_videos = 0
        vid_dir = d / "videos"
        if vid_dir.exists():
            nb_videos = len([f for f in vid_dir.iterdir()
                             if f.suffix.lower() in ('.mp4','.avi','.mov','.mkv')])

        # Dernier run (date modif du dossier kinematics ou pose)
        last_run = None
        for folder in ['kinematics','pose-3d','pose']:
            p = d / folder
            if p.exists():
                ts = p.stat().st_mtime
                import datetime
                dt = datetime.datetime.fromtimestamp(ts)
                diff = datetime.datetime.now() - dt
                if diff.days == 0:
                    h = int(diff.seconds / 3600)
                    last_run = f"Il y a {h}h" if h > 0 else "Aujourd'hui"
                elif diff.days == 1:
                    last_run = "Hier"
                elif diff.days < 30:
                    last_run = f"Il y a {diff.days} j"
                else:
                    last_run = dt.strftime("%d/%m/%Y")
                break

        # Statut — bug #7 : pose-sync et pose-associated manquaient
        if 'kinematics' in folders:
            status, progress = 'done',    100
        elif 'pose-3d' in folders:
            status, progress = 'partial',  75
        elif 'pose-associated' in folders:
            status, progress = 'partial',  50
        elif 'pose-sync' in folders:
            status, progress = 'partial',  38
        elif 'pose' in folders:
            status, progress = 'partial',  25
        else:
            status, progress = 'idle',      0

        projects.append({
            "name":       d.name,
            "path":       str(d),
            "nb_cameras": nb_cameras,
            "nb_videos":  nb_videos,
            "last_run":   last_run,
            "status":     status,
            "progress":   progress,
            "folders":    folders,
        })

    projects.sort(key=lambda x: (x['status']!='running', x['status']!='partial',
                                  x['status']!='done', x['name']))
    return jsonify({"projects": projects})


@app.route("/api/browse-folder", methods=["POST"])
def browse_folder():
    """Ouvre un sélecteur de dossier natif Windows et retourne le chemin choisi."""
    import threading
    result = [None]
    def pick():
        import tkinter as tk
        from tkinter import filedialog
        root = tk.Tk()
        root.withdraw()
        root.attributes('-topmost', True)
        folder = filedialog.askdirectory(title="Choisir le dossier parent")
        root.destroy()
        result[0] = folder
    t = threading.Thread(target=pick)
    t.start(); t.join(timeout=30)   # bug #9 : réduit de 60s à 30s
    if result[0]:
        return jsonify({"path": result[0]})
    return jsonify({"path": None})

@app.route("/api/projects/create", methods=["POST"])
def create_project():
    import shutil
    name   = request.json.get("name", "").strip()
    parent = request.json.get("parent", "")
    if not name:
        return jsonify({"error": "Nom requis"}), 400
    proj_dir = Path(parent) / name
    if proj_dir.exists():
        return jsonify({"error": "Ce dossier existe déjà"}), 409
    try:
        for sub in ["videos","calibration","pose","pose-3d","kinematics"]:
            (proj_dir / sub).mkdir(parents=True, exist_ok=True)
        # Config.toml depuis démo
        demo = BASE_DIR / "Config_template.toml"
        dst  = proj_dir / "Config.toml"
        if demo.exists():
            shutil.copy(demo, dst)
        else:
            dst.write_text('[project]\nproject_dir = "."\n', encoding='utf-8')
        return jsonify({"ok": True, "path": str(proj_dir)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/system/stats")
def system_stats():
    """Stats temps réel : CPU, RAM, GPU, VRAM."""
    import subprocess
    stats = {}

    # CPU + RAM via psutil
    try:
        import psutil
        stats["cpu_pct"]  = psutil.cpu_percent(interval=0.2)
        # Nom CPU depuis le registre Windows
        try:
            import winreg
            key  = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE,
                                  r"HARDWARE\DESCRIPTION\System\CentralProcessor\0")
            name = winreg.QueryValueEx(key, "ProcessorNameString")[0].strip()
            winreg.CloseKey(key)
            # Raccourcit le nom si trop long
            stats["cpu_name"] = name.replace("(R)","").replace("(TM)","").strip()
        except:
            stats["cpu_name"] = "CPU"
        vm = psutil.virtual_memory()
        stats["ram_used"] = round(vm.used  / 1e9, 1)
        stats["ram_total"]= round(vm.total / 1e9, 1)
        stats["ram_pct"]  = vm.percent
    except ImportError:
        stats["cpu_pct"] = 0; stats["ram_used"] = 0; stats["ram_total"] = 0; stats["ram_pct"] = 0

    # GPU via nvidia-smi
    try:
        r = subprocess.run([
            "nvidia-smi",
            "--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu",
            "--format=csv,noheader,nounits"
        ], capture_output=True, text=True, timeout=2)
        if r.returncode == 0 and r.stdout.strip():
            parts = [p.strip() for p in r.stdout.strip().split(",")]
            stats["gpu_name"]  = parts[0]
            stats["gpu_pct"]   = int(parts[1]) if parts[1].isdigit() else 0
            stats["vram_used"] = round(int(parts[2]) / 1024, 1)
            stats["vram_total"]= round(int(parts[3]) / 1024, 1)
            stats["gpu_temp"]  = int(parts[4]) if len(parts) > 4 and parts[4].isdigit() else 0
    except:
        stats["gpu_pct"] = 0; stats["vram_used"] = 0; stats["vram_total"] = 0; stats["gpu_temp"] = 0

    return jsonify(stats)


_SYSINFO_CACHE = {"data": None, "ts": 0}

def _probe_runner_python():
    """
    Interroge le Python runner (venv ou custom) via subprocess pour récupérer :
      - version pose2sim (Pose2Sim ou pose2sim, peu importe la casse)
      - providers onnxruntime (CUDAExecutionProvider ou pas)
      - version torch + torch.cuda.is_available()
    Retourne un dict {pose2sim, cuda_ok, cuda, torch} ou des fallbacks vides.
    """
    out = {"pose2sim": None, "cuda_ok": False, "cuda": "—", "torch": None}
    py = get_venv_python()
    if not py or not os.path.exists(py):
        return out
    probe = (
        "import json, sys\n"
        "info = {}\n"
        "try:\n"
        "    from importlib.metadata import version as _v\n"
        "    for n in ('Pose2Sim','pose2sim'):\n"
        "        try: info['pose2sim'] = _v(n); break\n"
        "        except Exception: pass\n"
        "except Exception: pass\n"
        "try:\n"
        "    import onnxruntime as ort\n"
        "    info['providers'] = list(ort.get_available_providers())\n"
        "except Exception: info['providers'] = []\n"
        "try:\n"
        "    import torch\n"
        "    info['torch']      = torch.__version__\n"
        "    info['torch_cuda'] = bool(torch.cuda.is_available())\n"
        "except Exception:\n"
        "    info['torch'] = None; info['torch_cuda'] = False\n"
        "print(json.dumps(info))\n"
    )
    try:
        env = _get_clean_env() if '_get_clean_env' in globals() else os.environ.copy()
        r = subprocess.run(
            [py, "-c", probe],
            capture_output=True, timeout=15, env=env,
            encoding="utf-8", errors="replace",
        )
        if r.returncode == 0 and r.stdout.strip():
            import json as _json
            data = _json.loads(r.stdout.strip().splitlines()[-1])
            if data.get("pose2sim"):
                out["pose2sim"] = f"v{data['pose2sim']}"
            providers = data.get("providers", [])
            out["cuda_ok"] = "CUDAExecutionProvider" in providers
            out["cuda"]    = "CUDA ✓" if out["cuda_ok"] else "CPU only"
            if data.get("torch"):
                out["torch"] = data["torch"]
                # Si onnx pas CUDA mais torch oui, on remonte quand même cuda_ok
                if data.get("torch_cuda"):
                    out["cuda_ok"] = True
                    if "CUDA" not in out["cuda"]:
                        out["cuda"] = "CUDA ✓ (torch)"
    except Exception:
        pass
    return out


@app.route("/api/system")
def system_info():
    # Cache 10s : éviter de spawn un subprocess à chaque ouverture du dashboard
    import time as _t
    now = _t.time()
    if _SYSINFO_CACHE["data"] is not None and (now - _SYSINFO_CACHE["ts"]) < 10:
        return jsonify(_SYSINFO_CACHE["data"])

    info = {}
    info.update(_probe_runner_python())

    # GPU via nvidia-smi
    try:
        r = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader"],
            capture_output=True, text=True, timeout=3,
            encoding="utf-8", errors="replace",
        )
        if r.returncode == 0 and (r.stdout or "").strip():
            parts = r.stdout.strip().split(",")
            info["gpu"]  = parts[0].strip()
            info["vram"] = parts[1].strip() if len(parts) > 1 else "—"
        else:
            info["gpu"] = None; info["vram"] = "—"
    except Exception:
        info["gpu"] = None; info["vram"] = "—"

    # CPU
    try:
        import winreg
        key  = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE,
                              r"HARDWARE\DESCRIPTION\System\CentralProcessor\0")
        name = winreg.QueryValueEx(key, "ProcessorNameString")[0].strip()
        winreg.CloseKey(key)
        info["cpu_name"] = name.replace("(R)", "").replace("(TM)", "").strip()
    except Exception:
        info["cpu_name"] = "CPU"

    _SYSINFO_CACHE["data"] = info
    _SYSINFO_CACHE["ts"]   = now
    return jsonify(info)

# ─── Config ──────────────────────────────────────────────────────────────────
@app.route("/api/config", methods=["GET"])
def get_config():
    proj = state["project_dir"]
    if not proj:
        return jsonify({"error": "Aucun projet"}), 400
    cfg_path = os.path.join(proj, "Config.toml")
    if not os.path.exists(cfg_path):
        return jsonify({"error": "Config.toml introuvable"}), 404
    try:
        import toml
        return jsonify(toml.load(cfg_path))
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/config", methods=["POST"])
def set_config():
    proj = state["project_dir"]
    if not proj:
        return jsonify({"error": "Aucun projet"}), 400
    try:
        import toml
        data = _homogenize_arrays(request.json)
        with open(os.path.join(proj, "Config.toml"), "w", encoding="utf-8") as f:
            toml.dump(data, f)
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

def _homogenize_arrays(obj):
    """
    Homogénéise les tableaux numériques pour le TOML :
      - Liste tout-int (ex: [0, 144])       → reste [0, 144]            (essentiel pour frame_range)
      - Liste tout-float (ex: [0.5, 1.0])   → reste [0.5, 1.0]
      - Liste mixte (ex: [0, 1.5])          → tout en float [0.0, 1.5]  (Pose2Sim refuse les types mixtes)
      - Liste de listes (matrice)           → récurse
    """
    if isinstance(obj, dict):
        return {k: _homogenize_arrays(v) for k, v in obj.items()}
    if isinstance(obj, list):
        items = [_homogenize_arrays(i) for i in obj]
        is_num = lambda x: isinstance(x, (int, float)) and not isinstance(x, bool)
        if items and all(is_num(i) for i in items):
            has_float = any(isinstance(i, float) for i in items)
            # Tout int (ou tout float déjà) → on ne touche pas
            # Mixte (au moins un float ET au moins un int pur) → on harmonise en float
            if has_float and any(isinstance(i, int) and not isinstance(i, bool) for i in items):
                return [float(i) for i in items]
            return items
        if items and all(isinstance(i, list) for i in items):
            return [_homogenize_arrays(i) for i in items]
        return items
    return obj

# ─── Environnement propre pour subprocesses ──────────────────────────────────
def _get_clean_env() -> dict:
    """
    Retourne un environnement sans les variables PyInstaller qui provoquent
    le conflit 'Module use of python312.dll conflicts with this version of Python'.

    PyInstaller injecte dans l'environnement :
      • PYTHONHOME  → _MEIPASS  (cause principale : le venv Python hérite un
                                  PYTHONHOME cassé et charge la mauvaise DLL)
      • PYTHONPATH  → _MEIPASS  (pollue sys.path du subprocess)
      • PATH        → _MEIPASS prepend (recherche DLL erronée)
      • _PYI_*      → variables internes bootloader

    Sans cette purge, tout subprocess Python externe échoue à importer des
    extensions C (numpy, scipy, pose2sim…) avec une erreur DLL conflict.
    """
    env = os.environ.copy()
    if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
        meipass = os.path.abspath(sys._MEIPASS)

        # 1. PYTHONHOME — cause principale du conflit
        env.pop("PYTHONHOME", None)

        # 2. PYTHONPATH — pollue le sys.path du venv
        env.pop("PYTHONPATH", None)

        # 3. PATH — retire toute entrée sous _MEIPASS
        clean = [p for p in env.get("PATH", "").split(os.pathsep)
                 if not os.path.abspath(p).startswith(meipass)]
        env["PATH"] = os.pathsep.join(clean)

        # 4. Variables internes PyInstaller bootloader
        for key in list(env.keys()):
            if key.startswith("_PYI_"):
                del env[key]
        env.pop("_MEIPASS2", None)

    return env


# ─── Pipeline ────────────────────────────────────────────────────────────────
@app.route("/api/run", methods=["POST"])
def run_steps():
    # bug #8 : vérification + set atomique sous lock pour éviter double-démarrage
    with _run_lock:
        if state["running"]:
            return jsonify({"error": "Pipeline déjà en cours"}), 409
        state["running"] = True
    proj  = state["project_dir"]
    steps = request.json.get("steps", [])
    if not proj or not os.path.isdir(proj):
        with _run_lock:
            state["running"] = False
        return jsonify({"error": "Dossier projet invalide"}), 400
    threading.Thread(target=_run_thread, args=(steps, proj), daemon=True).start()
    return jsonify({"ok": True})

@app.route("/api/stop", methods=["POST"])
def stop_run():
    state["running"] = False
    proc = state.get("current_proc")
    if proc and proc.poll() is None:
        proc.terminate()
    socketio.emit("log", {"lvl": "warn", "msg": "⏹ Arrêté."})
    return jsonify({"ok": True})

def _run_thread(steps, proj):
    # state["running"] déjà mis à True par run_steps (sous lock)
    python = get_venv_python()
    if not python:
        socketio.emit("log", {"lvl": "error",
            "msg": "❌ Python pose2sim introuvable. "
                   "Ouvrez le menu Configuration et complétez l'installation."})
        socketio.emit("pipeline_done", {})
        with _run_lock:
            state["running"] = False
        return
    try:
        socketio.emit("pipeline_start", {"steps": steps})
        for step in steps:
            if not state["running"]:
                break
            socketio.emit("step_start", {"step": step})
            socketio.emit("log", {"lvl": "info", "msg": f"▶ {step}"})
            try:
                proc = subprocess.Popen(
                    [python, str(RUNNER_PATH), proj, step],
                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                    text=True, encoding="utf-8", errors="replace", bufsize=1,
                    env=_get_clean_env(),
                )
                state["current_proc"] = proc
                for line in proc.stdout:
                    line = line.rstrip()
                    if not line: continue
                    ml = line.lower().lstrip()
                    # "error" seul est trop large : "marker error: RMS", "squared error"
                    # sont des métriques de calcul, pas des erreurs.
                    # On ne flagge ERROR que sur des préfixes/mots vraiment critiques.
                    is_err  = (ml.startswith("[error]") or
                               ml.startswith("error:") or
                               any(w in ml for w in ["traceback", "exception:", "raise ", "❌"]))
                    is_warn = (ml.startswith("[warning]") or
                               ml.startswith("warning:") or
                               any(w in ml for w in ["⚠", "warn:"]))
                    is_ok   = any(w in ml for w in ["✅", "terminé", "done", "[runner] terminé"])
                    lvl = "error" if is_err else "warn" if is_warn else "ok" if is_ok else "info"
                    socketio.emit("log", {"lvl": lvl, "msg": line})
                    if not state["running"]:
                        proc.terminate(); break
                proc.wait()
                status = "done" if proc.returncode == 0 else "error"
                socketio.emit("step_done", {"step": step, "status": status})
                if status == "error":
                    socketio.emit("log", {"lvl":"error","msg":f"❌ {step} échoué"})
            except Exception as e:
                socketio.emit("step_done", {"step": step, "status": "error"})
                socketio.emit("log", {"lvl":"error","msg":f"❌ {e}"})
        socketio.emit("pipeline_done", {})
        socketio.emit("log", {"lvl":"ok","msg":"✓ Pipeline terminé."})
    except Exception as e:
        # bug #6 : garantit que running repasse à False même si exception inattendue
        socketio.emit("log", {"lvl":"error","msg":f"❌ Erreur pipeline : {e}"})
        socketio.emit("pipeline_done", {})
    finally:
        # bug #6 : toujours libéré, quoi qu'il arrive
        with _run_lock:
            state["running"] = False
            state["current_proc"] = None

# ─── Explorateur ─────────────────────────────────────────────────────────────
@app.route("/api/files")
def list_files():
    import shutil
    path = request.args.get("path", state["project_dir"])
    if not path or not os.path.exists(path):
        return jsonify({"error": "Chemin invalide", "items": []}), 400
    items = []
    try:
        for entry in sorted(Path(path).iterdir(), key=lambda e: (e.is_file(), e.name.lower())):
            stat = entry.stat()
            items.append({
                "name": entry.name, "path": str(entry),
                "type": "file" if entry.is_file() else "dir",
                "size": stat.st_size if entry.is_file() else 0,
                "ext":  entry.suffix.lower() if entry.is_file() else "",
            })
    except PermissionError:
        return jsonify({"error": "Accès refusé", "items": []}), 403
    parent = str(Path(path).parent)
    if parent == path: parent = None
    return jsonify({"path": path, "parent": parent, "items": items})

@app.route("/api/files/open", methods=["POST"])
def open_file():
    path = request.json.get("path", "")
    if not os.path.exists(path):
        return jsonify({"error": "Introuvable"}), 404
    try:
        os.startfile(path)
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/files/delete", methods=["POST"])
def delete_file():
    import shutil
    path = request.json.get("path", "")
    if not os.path.exists(path):
        return jsonify({"error": "Introuvable"}), 404
    try:
        shutil.rmtree(path) if os.path.isdir(path) else os.remove(path)
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/clean", methods=["POST"])
def clean_project():
    import shutil
    proj = request.json.get("path", state["project_dir"])
    deleted = []
    for item in ["pose","pose-sync","pose-associated","pose-3d",
                 "kinematics","logs.txt","opensim.log"]:
        p = os.path.join(proj, item)
        if os.path.exists(p):
            try:
                shutil.rmtree(p, ignore_errors=True) if os.path.isdir(p) else os.remove(p)
                deleted.append(item)
            except Exception:
                deleted.append(f"{item} (partiel)")
    return jsonify({"ok": True, "deleted": deleted})

# ─── Viewer 3D ───────────────────────────────────────────────────────────────
@app.route("/api/viewer/files")
def viewer_files():
    """Liste les fichiers .trc disponibles dans le projet."""
    proj = request.args.get("path", state["project_dir"])
    if not proj:
        return jsonify({"files": []})

    files = []
    pose3d = Path(proj) / "pose-3d"
    if pose3d.exists():
        for f in sorted(pose3d.glob("*.trc")):
            stat = f.stat()
            # Priorité : LSTM > filt > brut
            priority = 0
            if "LSTM" in f.name:   priority = 3
            elif "filt" in f.name: priority = 2
            else:                  priority = 1
            files.append({
                "name":     f.name,
                "path":     str(f),
                "size":     stat.st_size,
                "priority": priority,
            })
    files.sort(key=lambda x: -x["priority"])
    return jsonify({"files": files})


@app.route("/api/viewer/trc")
def viewer_trc():
    """Parse un fichier .trc et retourne les données pour le viewer."""
    file_path = request.args.get("file", "")
    max_frames = int(request.args.get("max_frames", 300))  # limite pour perf

    if not file_path or not os.path.exists(file_path):
        return jsonify({"error": "Fichier introuvable"}), 404

    try:
        result = _parse_trc(file_path, max_frames)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def _parse_trc(path, max_frames=300):
    """Parse un fichier .trc et retourne markers + frames."""
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        lines = f.readlines()

    # Header ligne 3 : DataRate CameraRate NumFrames NumMarkers Units ...
    header = lines[2].strip().split("\t")
    fps        = float(header[0]) if header[0] else 25.0
    num_frames = int(header[2])   if len(header) > 2 else 0
    num_markers= int(header[3])   if len(header) > 3 else 0
    units      = header[4]        if len(header) > 4 else "m"

    # Ligne 4 : Frame#  Time  Marker1  ...  MarkerN
    marker_names = lines[3].strip().split("\t")[2:]
    # Les noms sont répétés 3× (X Y Z) — on garde un sur 3
    marker_names = [marker_names[i] for i in range(0, len(marker_names), 3)
                    if i < len(marker_names)]

    # Squelette pose2sim standard (connexions)
    BONES = [
        ["Neck","Head"], ["Head","Nose"],
        ["Neck","RShoulder"], ["RShoulder","RElbow"], ["RElbow","RWrist"],
        ["Neck","LShoulder"], ["LShoulder","LElbow"], ["LElbow","LWrist"],
        ["Neck","Hip"],
        ["Hip","RHip"], ["RHip","RKnee"], ["RKnee","RAnkle"],
        ["RAnkle","RBigToe"], ["RAnkle","RHeel"],
        ["Hip","LHip"], ["LHip","LKnee"], ["LKnee","LAnkle"],
        ["LAnkle","LBigToe"], ["LAnkle","LHeel"],
    ]

    # Parse les frames de données (lignes 6+)
    frames = []
    step = max(1, num_frames // max_frames)  # sous-échantillonnage si trop long

    for line in lines[6::step]:
        cols = line.strip().split("\t")
        if len(cols) < 3:
            continue
        try:
            frame_idx = int(float(cols[0]))
            time_s    = float(cols[1])
        except:
            continue

        markers = {}
        for i, name in enumerate(marker_names):
            base = 2 + i * 3
            if base + 2 < len(cols):
                try:
                    x = float(cols[base])
                    y = float(cols[base+1])
                    z = float(cols[base+2])
                    if x == 0.0 and y == 0.0 and z == 0.0:
                        continue  # marqueur manquant
                    markers[name] = [round(x, 4), round(y, 4), round(z, 4)]
                except:
                    pass

        frames.append({"f": frame_idx, "t": round(time_s, 3), "m": markers})

        if len(frames) >= max_frames:
            break

    return {
        "file":         os.path.basename(path),
        "fps":          fps,
        "num_frames":   num_frames,
        "num_markers":  len(marker_names),
        "units":        units,
        "markers":      marker_names,
        "bones":        BONES,
        "frames":       frames,
    }


# ─── Export BVH ───────────────────────────────────────────────────────────────
@app.route("/api/export/bvh", methods=["POST"])
def export_bvh():
    """Convertit un fichier .trc en .bvh via pose2sim_to_bvh.py et retourne le fichier."""
    import tempfile as _tmpmod, shutil as _sh
    from flask import Response

    body          = request.get_json(silent=True) or {}
    trc_path      = body.get("trc_path", "")
    smooth        = max(1, int(body.get("smooth", 5)))
    smooth_passes = max(1, int(body.get("smooth_passes", 1)))
    scale         = float(body.get("scale", 100.0))

    if not trc_path or not os.path.isfile(trc_path):
        return jsonify({"error": "Fichier TRC introuvable"}), 400

    if not BVH_SCRIPT_PATH.exists():
        return jsonify({"error": "Convertisseur BVH introuvable (pose2sim_to_bvh.py)"}), 500

    python = get_venv_python()
    if not python or not os.path.exists(python):
        return jsonify({"error": "Python venv introuvable — complétez l'installation d'abord"}), 500

    trc_stem = Path(trc_path).stem
    tmp_dir  = Path(_tmpmod.mkdtemp(prefix="oxymore_bvh_"))
    bvh_out  = tmp_dir / f"{trc_stem}.bvh"

    try:
        cmd = [
            python, str(BVH_SCRIPT_PATH),
            trc_path, str(bvh_out),
            "--smooth",       str(smooth),
            "--smooth-passes", str(smooth_passes),
            "--scale",        str(scale),
        ]
        r = subprocess.run(
            cmd, capture_output=True, text=True, timeout=180,
            encoding="utf-8", errors="replace",
            env=_get_clean_env(),
        )
        if r.returncode != 0:
            err = ((r.stdout or "") + (r.stderr or "")).strip()
            return jsonify({"error": f"Conversion échouée :\n{err[-600:]}"}), 500

        if not bvh_out.exists():
            return jsonify({"error": "Fichier BVH non généré"}), 500

        bvh_text = bvh_out.read_text(encoding="ascii", errors="replace")
        return Response(
            bvh_text,
            mimetype="text/plain; charset=ascii",
            headers={"Content-Disposition": f'attachment; filename="{trc_stem}.bvh"'},
        )
    except subprocess.TimeoutExpired:
        return jsonify({"error": "Timeout dépassé (> 3 min) — fichier TRC trop long ?"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        _sh.rmtree(tmp_dir, ignore_errors=True)


# ─── Licence ─────────────────────────────────────────────────────────────────
def _bg_license_check():
    """Ping Supabase en arrière-plan puis notifie le frontend via WebSocket."""
    try:
        result = check_license()
        socketio.emit('license_updated', result)
    except Exception:
        pass

@app.route("/api/license/status")
def license_status():
    """Retourne le cache immédiatement + lance un recheck Supabase en arrière-plan."""
    cached = check_license_cached()
    # Ping en fond uniquement si une licence est présente et serveur configuré
    if cached.get("key") and LICENSE_SERVER_URL:
        _threading.Thread(target=_bg_license_check, daemon=True).start()
    return jsonify(cached)

@app.route("/api/license/machine-id")
def license_machine_id():
    """Retourne l'empreinte matérielle de cette machine."""
    return jsonify({"machine_id": get_machine_id()})

@app.route("/api/license/activate", methods=["POST"])
def license_activate():
    """Active une clé de licence (ping serveur distant si configuré)."""
    key = (request.json or {}).get("key", "").strip()
    if not key:
        return jsonify({"valid": False, "message": "Clé manquante"}), 400
    return jsonify(activate_license(key))

@app.route("/api/license/deactivate", methods=["POST"])
def license_deactivate():
    """Supprime le cache de licence local (réinitialisation / test)."""
    return jsonify(deactivate_license())

@app.route("/api/license/check", methods=["POST"])
def license_check_forced():
    """Force un recheck immédiat auprès du serveur de licences."""
    return jsonify(check_license(force=True))

# ── Proxy admin → serveur distant ────────────────────────────────────────────
def _admin_proxy(endpoint: str, body_override: dict = None):
    """
    Relaie les requêtes admin vers Supabase Edge Function /admin.
    L'action est passée dans le body (action: generate|list|revoke|reset-machine).
    """
    if not LICENSE_SERVER_URL:
        return jsonify({"error": "Aucun serveur de licences configuré (mode développement)"}), 503
    import json as _j, urllib.request as _u, urllib.error as _ue
    url  = LICENSE_SERVER_URL.rstrip("/") + "/admin"
    base_body = body_override if body_override is not None else (request.json or {})
    # Ajoute l'action pour le routing Supabase Edge Function
    full_body = {**base_body, "action": endpoint}
    body = _j.dumps(full_body).encode()
    try:
        req = _u.Request(
            url, data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with _u.urlopen(req, timeout=15) as resp:  # Supabase Edge Functions : pas de cold start
            return jsonify(_j.loads(resp.read())), resp.status
    except _ue.HTTPError as e:
        return jsonify({"error": e.reason}), e.code
    except Exception as e:
        return jsonify({"error": str(e)}), 503

@app.route("/api/license/admin-auth", methods=["POST"])
def license_admin_auth():
    """
    Authentification admin locale pour le Key Manager in-app.
    Vérifie OXYMORE_ADMIN_ID + OXYMORE_ADMIN_PASSWORD côté serveur,
    retourne un token de session valable 4h.
    Les credentials ne transitent jamais vers Supabase.
    """
    data = request.json or {}
    if data.get("id") == _ADMIN_ID and data.get("password") == _ADMIN_PASSWORD:
        token = _sec.token_hex(32)
        _admin_sessions[token] = _dt.now(_tz.utc) + _td(hours=4)
        return jsonify({"ok": True, "token": token})
    return jsonify({"ok": False})

def _is_valid_session(token: str) -> bool:
    """Vérifie un token de session admin in-app."""
    expiry = _admin_sessions.get(token)
    if not expiry:
        return False
    if _dt.now(_tz.utc) > expiry:
        _admin_sessions.pop(token, None)
        return False
    return True

@app.route("/api/license/admin/generate", methods=["POST"])
def license_admin_generate():
    """
    Génère une clé via Supabase Edge Function.
    Accepte :
      - Token de session admin in-app (Key Manager) → utilise OXYMORE_ADMIN_TOKEN
      - Token admin direct (panel.html)
    """
    data  = request.json or {}
    token = data.get("admin_token", "")
    if _is_valid_session(token):
        if not _ADMIN_TOKEN:
            return jsonify({"error": "OXYMORE_ADMIN_TOKEN non configuré sur ce serveur"}), 503
        return _admin_proxy("generate", body_override={**data, "admin_token": _ADMIN_TOKEN})
    return _admin_proxy("generate")

def _session_proxy(endpoint: str):
    """Proxy admin acceptant session token in-app OU token admin direct."""
    data  = request.json or {}
    token = data.get("admin_token", "")
    if _is_valid_session(token):
        if not _ADMIN_TOKEN:
            return jsonify({"error": "OXYMORE_ADMIN_TOKEN non configuré"}), 503
        return _admin_proxy(endpoint, body_override={**data, "admin_token": _ADMIN_TOKEN})
    return _admin_proxy(endpoint)

@app.route("/api/license/admin/list", methods=["GET", "POST"])
def license_admin_list():
    return _session_proxy("list")

@app.route("/api/license/admin/revoke", methods=["POST"])
def license_admin_revoke():
    return _session_proxy("revoke")

@app.route("/api/license/admin/reset-machine", methods=["POST"])
def license_admin_reset_machine():
    return _session_proxy("reset-machine")


# ─── WebSocket : événements REC ──────────────────────────────────────────────
from flask import request as _flask_request

@socketio.on("rec_join")
def on_rec_join(data):
    """Un téléphone rejoint la session REC."""
    sid = _flask_request.sid
    name = (data or {}).get("name") or f"Caméra {len(_rec_state['devices']) + 1}"
    ua = (data or {}).get("ua", "")

    # Si une entrée offline du même nom existe déjà, on la retire avant d'ajouter
    # la nouvelle → évite le doublon quand le user réactive sa caméra
    for old_sid in list(_rec_state["devices"]):
        if (_rec_state["devices"][old_sid].get("name") == name and
                _rec_state["devices"][old_sid].get("status") == "offline"):
            del _rec_state["devices"][old_sid]
            socketio.emit("rec_device_left", {"sid": old_sid, "name": name})
            break

    info = {
        "sid": sid, "name": name, "ua": ua,
        "status": "ready", "joined_at": _dt.now().isoformat(),
    }
    _rec_state["devices"][sid] = info
    emit("rec_join_ack", info)
    socketio.emit("rec_device_joined", info)
    print(f"[rec] device joined : {name} ({sid[:8]})", flush=True)


@socketio.on("rec_status")
def on_rec_status(data):
    """Un téléphone met à jour son statut (ready, recording, uploading, error)."""
    sid = _flask_request.sid
    if sid in _rec_state["devices"]:
        _rec_state["devices"][sid]["status"] = (data or {}).get("status", "ready")
        if "name" in (data or {}):
            _rec_state["devices"][sid]["name"] = data["name"]
        socketio.emit("rec_device_updated", _rec_state["devices"][sid])


@socketio.on("rec_frame")
def on_rec_frame(data):
    """Relaie une thumbnail de preview depuis un téléphone vers les clients PC."""
    if not data or "frame" not in data:
        return
    sid = _flask_request.sid
    # Re-émet avec le SID pour que le PC sache quelle caméra c'est
    socketio.emit("rec_frame", {"sid": sid, "frame": data["frame"]},
                  skip_sid=sid)


@socketio.on("rec_command")
def on_rec_command(data):
    """Commande émise par le PC vers tous les téléphones (start/stop)."""
    cmd = (data or {}).get("cmd")
    if cmd == "start":
        _rec_state["recording"] = True
        # Timestamp côté serveur pour synchro (T+500ms pour laisser le temps de propager)
        import time as _t
        start_at = _t.time() * 1000 + 500  # ms epoch
        socketio.emit("rec_start", {"start_at": start_at})
        print(f"[rec] START broadcast (start_at={start_at})", flush=True)
    elif cmd == "stop":
        _rec_state["recording"] = False
        socketio.emit("rec_stop", {})
        print("[rec] STOP broadcast", flush=True)


@socketio.on("disconnect")
def on_disconnect_rec():
    sid = _flask_request.sid
    if sid in _rec_state["devices"]:
        info = _rec_state["devices"][sid]
        info["status"] = "offline"
        # On garde le device dans la liste (pastille rouge côté PC)
        # Il sera retiré quand le même nom se reconnecte (rec_join)
        socketio.emit("rec_device_updated", info)
        print(f"[rec] device offline : {info['name']}", flush=True)


# ─── WebSocket ───────────────────────────────────────────────────────────────
# Auto-détection en background dès le premier connect (évite de bloquer le boot)
_auto_setup_state = {"tried": False, "running": False}

def _bg_try_auto_setup():
    if _auto_setup_state["tried"] or _auto_setup_state["running"]:
        return
    _auto_setup_state["running"] = True
    try:
        found = try_auto_setup()
        if found:
            print(f"[setup] Auto-détecté : {found}", flush=True)
            socketio.emit("setup_done", {"ok": True, "auto": True, "path": found})
    except Exception as e:
        print(f"[setup] auto-detect failed: {e}", flush=True)
    finally:
        _auto_setup_state["tried"]   = True
        _auto_setup_state["running"] = False

@socketio.on("connect")
def on_connect():
    setup_done = is_setup_done()
    emit("connected", {"status":"ok", "project": state["project_dir"], "setup_done": setup_done})
    if not setup_done:
        # Premier connect après boot : on tente une auto-détection silencieuse
        if not _auto_setup_state["tried"]:
            _threading.Thread(target=_bg_try_auto_setup, daemon=True).start()
        emit("setup_required", {})

@socketio.on("set_project")
def on_set_project(data):
    state["project_dir"] = data.get("path", "")
    emit("project_set", {"path": state["project_dir"]})


# ─── Main ────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import socket as _sock
    port = 5173
    # IP LAN
    _s = _sock.socket(_sock.AF_INET, _sock.SOCK_DGRAM)
    try:
        _s.connect(("8.8.8.8", 53))
        _lan = _s.getsockname()[0]
    except Exception:
        _lan = "127.0.0.1"
    finally:
        _s.close()

    print(f"\nOxymore Vision (dev)")
    print(f"   Local : http://127.0.0.1:{port}")
    print(f"   LAN   : http://{_lan}:{port}")
    print(f"   REC   : HTTPS demarre a la demande depuis l'onglet REC\n")

    threading.Thread(target=lambda: (__import__('time').sleep(1.2),
                     webbrowser.open(f"http://127.0.0.1:{port}")),
                     daemon=True).start()

    socketio.run(app, host="0.0.0.0", port=port, debug=False, allow_unsafe_werkzeug=True)
