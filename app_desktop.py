#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Oxymore Vision — App Desktop
Flask sur 127.0.0.1 + port aléatoire → PyWebView.
Zéro conflit de port, zéro firewall.
"""

import sys
import os
import socket
import threading
import time
import tempfile
from pathlib import Path

if getattr(sys, 'frozen', False):
    BASE_DIR = Path(sys.executable).parent
else:
    BASE_DIR = Path(__file__).parent


# ─── Cert HTTPS auto-signé pour le mode REC ──────────────────────────────────
def _cert_dir() -> Path:
    """
    Dossier écrivable pour les certs.
    Toujours dans %LOCALAPPDATA%\\OxymoreVision — jamais à côté de l'exe,
    quelle que soit la position de celui-ci (Téléchargements, Bureau, USB…).
    """
    for base in [
        Path(os.environ.get("LOCALAPPDATA", "")) / "OxymoreVision",
        Path(os.environ.get("APPDATA",       "")) / "OxymoreVision",
        Path(tempfile.gettempdir())               / "OxymoreVision",
    ]:
        try:
            base = Path(base)
            base.mkdir(parents=True, exist_ok=True)
            test = base / ".write_test"
            test.write_text("x"); test.unlink()
            return base
        except Exception:
            continue
    return Path(tempfile.gettempdir()) / "OxymoreVision"


def _get_lan_ip() -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 53))
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()


def ensure_https_cert():
    """Génère (ou récupère) un cert auto-signé pour HTTPS local + LAN.
    Retourne (cert_path, key_path) ou (None, None) si erreur."""
    cdir = _cert_dir()
    cert_path = cdir / "oxymore_rec.crt"
    key_path  = cdir / "oxymore_rec.key"

    # Régénère si l'IP LAN a changé depuis la création du cert
    lan_ip = _get_lan_ip()
    marker = cdir / "oxymore_rec.ip"
    if cert_path.exists() and key_path.exists() and marker.exists():
        if marker.read_text(encoding="utf-8").strip() == lan_ip:
            return cert_path, key_path

    try:
        from cryptography import x509
        from cryptography.x509.oid import NameOID
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
        import datetime as _datetime
        import ipaddress as _ipaddress
    except ImportError as e:
        print(f"[https] cryptography indisponible : {e}", flush=True)
        return None, None

    print(f"[https] Génération cert auto-signé pour {lan_ip}…", flush=True)
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, "Oxymore Vision"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Oxymore"),
    ])
    sans = [
        x509.DNSName("localhost"),
        x509.IPAddress(_ipaddress.IPv4Address("127.0.0.1")),
    ]
    try:
        sans.append(x509.IPAddress(_ipaddress.IPv4Address(lan_ip)))
    except Exception:
        pass

    cert = (x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(_datetime.datetime.utcnow() - _datetime.timedelta(days=1))
        .not_valid_after(_datetime.datetime.utcnow()  + _datetime.timedelta(days=365 * 5))
        .add_extension(x509.SubjectAlternativeName(sans), critical=False)
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .add_extension(
            x509.ExtendedKeyUsage([x509.oid.ExtendedKeyUsageOID.SERVER_AUTH]),
            critical=False,
        )
        .add_extension(
            x509.KeyUsage(
                digital_signature=True, content_commitment=False,
                key_encipherment=True, data_encipherment=False,
                key_agreement=False, key_cert_sign=False,
                crl_sign=False, encipher_only=False, decipher_only=False,
            ),
            critical=True,
        )
        .sign(key, hashes.SHA256())
    )

    cert_path.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    key_path.write_bytes(key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ))
    marker.write_text(lan_ip, encoding="utf-8")
    print(f"[https] Cert généré : {cert_path}", flush=True)
    return cert_path, key_path


# ─── Single-instance lock ─────────────────────────────────────────────────────
# Fichier verrouillé exclusivement → si une autre instance le détient, on quitte.
_SINGLE_LOCK_FH = None  # garde ouvert pendant toute la vie du process

def _acquire_single_instance() -> bool:
    """
    Retourne True si on est la 1ère instance (à continuer), False si une autre tourne déjà.
    Utilise un fichier dans %TEMP% qu'on verrouille en exclusif via msvcrt (Windows).
    """
    global _SINGLE_LOCK_FH
    lock_path = Path(tempfile.gettempdir()) / "OxymoreVision.lock"
    try:
        _SINGLE_LOCK_FH = open(lock_path, "w")
        # Sur Windows : msvcrt.locking lève IOError si déjà verrouillé
        try:
            import msvcrt
            msvcrt.locking(_SINGLE_LOCK_FH.fileno(), msvcrt.LK_NBLCK, 1)
            return True
        except OSError:
            return False
        except Exception:
            # POSIX ou autre : on ne bloque pas
            return True
    except Exception:
        # Si on ne peut pas créer le fichier, on laisse passer (mieux vaut 2 instances qu'une qui plante)
        return True


def _get_work_area():
    """
    Retourne (x, y, w, h) de la zone de travail du moniteur principal
    en pixels SYSTÈME (cohérents avec le contexte DPI_SYSTEM_AWARE).
    Utilise SetThreadDpiAwarenessContext pour forcer un contexte fiable
    même si SetProcessDpiAwareness a échoué silencieusement.
    Fallback : (0, 0, 1280, 720).
    """
    import ctypes

    class _RECT(ctypes.Structure):
        _fields_ = [("left", ctypes.c_int), ("top", ctypes.c_int),
                    ("right", ctypes.c_int), ("bottom", ctypes.c_int)]

    def _query_work_area():
        r = _RECT()
        ctypes.windll.user32.SystemParametersInfoW(0x0030, 0, ctypes.byref(r), 0)
        w = r.right - r.left
        h = r.bottom - r.top
        if w > 0 and h > 0:
            return r.left, r.top, w, h
        return None

    # Tente d'abord avec le contexte SYSTEM_AWARE forcé sur ce thread
    # (DPI_AWARENESS_CONTEXT_SYSTEM_AWARE = -2, disponible depuis Windows 10 1607)
    # Cela garantit des coords cohérentes même si SetProcessDpiAwareness a échoué.
    old_ctx = None
    try:
        set_fn = ctypes.windll.user32.SetThreadDpiAwarenessContext
        set_fn.restype = ctypes.c_void_p
        # -2 = DPI_AWARENESS_CONTEXT_SYSTEM_AWARE
        old_ctx = set_fn(ctypes.c_void_p(-2))
    except Exception:
        pass

    try:
        result = _query_work_area()
    except Exception:
        result = None
    finally:
        if old_ctx:
            try:
                ctypes.windll.user32.SetThreadDpiAwarenessContext(ctypes.c_void_p(old_ctx))
            except Exception:
                pass

    if result:
        print(f"[work_area] {result[2]}×{result[3]} @ ({result[0]},{result[1]})", flush=True)
        return result

    return 0, 0, 1280, 720


def get_free_port():
    """Trouve un port libre sur 127.0.0.1."""
    s = socket.socket()
    s.bind(('127.0.0.1', 0))
    port = s.getsockname()[1]
    s.close()
    return port


_flask_error = []

_ssl_cert = [None, None]  # (cert_path, key_path), rempli avant start_flask

def start_flask(port):
    try:
        os.chdir(BASE_DIR)
        import server
        cert_path, key_path = _ssl_cert
        has_ssl = (cert_path and key_path
                   and Path(cert_path).exists() and Path(key_path).exists())

        kwargs = dict(
            host="0.0.0.0",
            port=port,
            debug=False,
            use_reloader=False,
            allow_unsafe_werkzeug=True,
        )

        if has_ssl:
            # SSLContext explicite avec config moderne — évite les RST côté phones
            # (le tuple cert/key implicite a un bug avec Werkzeug+Python 3.12)
            import ssl as _ssl
            ctx = _ssl.SSLContext(_ssl.PROTOCOL_TLS_SERVER)
            ctx.minimum_version = _ssl.TLSVersion.TLSv1_2
            ctx.load_cert_chain(str(cert_path), str(key_path))
            # Pas d'ALPN HTTP/2 (Werkzeug ne le parle pas → reset)
            try:
                ctx.set_alpn_protocols(["http/1.1"])
            except Exception:
                pass
            kwargs["ssl_context"] = ctx
            print(f"[flask] HTTPS activé (cert={cert_path}, TLS 1.2+, ALPN=http/1.1)", flush=True)
        else:
            print("[flask] HTTPS désactivé (cert introuvable)", flush=True)

        server.socketio.run(server.app, **kwargs)
    except Exception as e:
        import traceback
        _flask_error.append(str(e))
        print(f"[ERREUR Flask] {e}")
        traceback.print_exc()


def wait_for_server(port, timeout=30):
    """Attend que Flask réponde — accepte n'importe quel code HTTP, en HTTPS."""
    import urllib.request, urllib.error, ssl
    # Contexte SSL qui ignore les certs auto-signés (on s'en fout pour le ping)
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    start = time.time()
    while time.time() - start < timeout:
        try:
            urllib.request.urlopen(f"https://127.0.0.1:{port}/", timeout=1, context=ctx)
            return True
        except urllib.error.HTTPError:
            return True   # 404/500 = Flask tourne ✅
        except Exception:
            time.sleep(0.3)
    return False


def _show_error(title: str, msg: str):
    """Boîte de dialogue d'erreur (tkinter en fallback ctypes MessageBox)."""
    print(f"[ERREUR] {msg}", flush=True)
    try:
        import tkinter.messagebox as mb
        mb.showerror(title, msg)
        return
    except Exception:
        pass
    try:
        import ctypes
        ctypes.windll.user32.MessageBoxW(0, msg, title, 0x10)  # MB_ICONERROR
    except Exception:
        pass


def _splash_html_path() -> str:
    """Retourne le chemin du splash.html (mode frozen vs dev)."""
    candidates = [
        BASE_DIR / "App" / "splash.html",                    # dev / next to exe
        BASE_DIR / "splash.html",                            # dist racine
    ]
    if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
        meipass = Path(sys._MEIPASS)
        candidates.insert(0, meipass / "App" / "splash.html")
        candidates.insert(1, meipass / "splash.html")
    # Diagnostic — liste tous les candidats testés
    print(f"[splash] BASE_DIR = {BASE_DIR}", flush=True)
    if getattr(sys, 'frozen', False):
        print(f"[splash] _MEIPASS = {getattr(sys, '_MEIPASS', '?')}", flush=True)
    for p in candidates:
        exists = p.exists()
        size = p.stat().st_size if exists else 0
        print(f"[splash]   {'YES' if exists else 'NO '} {p}  ({size} bytes)", flush=True)
        if exists:
            return p.as_uri()  # file:// pour PyWebView
    return None  # caller affiche un fallback HTML inline


def _pos_guard(title: str, w: int, h: int, duration_ms: int = 800) -> None:
    """
    Thread guard : centre la fenêtre et maintient sa position/taille pendant duration_ms.

    ► Le centrage est calculé DANS CE THREAD via SPI_GETWORKAREA + SetWindowPos.
      Les deux API s'appuient sur le même contexte DPI (celui du processus, sans
      aucune manipulation SetThreadDpiAwarenessContext) → cohérence garantie,
      quelle que soit l'échelle d'affichage (100 %, 125 %, 150 %…).

    ► Démarre dès l'appel (avant webview.start()) → attrape la fenêtre Win32 dès
      sa création et écrase les resets de WebView2 toutes les 15 ms.
    """
    import ctypes

    SWP_NOZORDER   = 0x0004
    SWP_NOACTIVATE = 0x0010
    cw, ch = int(w), int(h)

    def _center_pos():
        """
        Retourne (x, y) pour centrer une fenêtre w×h dans la zone de travail.
        Utilise SPI_GETWORKAREA sans forcer de contexte DPI → même référentiel
        que SetWindowPos dans ce thread.
        """
        class _RECT(ctypes.Structure):
            _fields_ = [("left", ctypes.c_int), ("top",  ctypes.c_int),
                        ("right", ctypes.c_int), ("bottom", ctypes.c_int)]
        r = _RECT()
        ctypes.windll.user32.SystemParametersInfoW(0x0030, 0, ctypes.byref(r), 0)
        wa_x = r.left
        wa_y = r.top
        wa_w = r.right  - r.left
        wa_h = r.bottom - r.top
        # Fallback si la query échoue
        if wa_w <= 0:
            wa_w = ctypes.windll.user32.GetSystemMetrics(0)  # SM_CXSCREEN
            wa_h = ctypes.windll.user32.GetSystemMetrics(1)  # SM_CYSCREEN
            wa_x = wa_y = 0
        px = wa_x + max(0, (wa_w - cw) // 2)
        py = wa_y + max(0, (wa_h - ch) // 2)
        print(f"[pos] WorkArea {wa_w}×{wa_h}@({wa_x},{wa_y}) → ({px},{py}) pour {cw}×{ch}", flush=True)
        return px, py

    def _run():
        # Calcul fait dans ce thread (même DPI ctx que SetWindowPos)
        cx, cy = _center_pos()
        flags = SWP_NOZORDER | SWP_NOACTIVATE

        t0 = time.monotonic()
        hwnd_found = False
        while (time.monotonic() - t0) * 1000 < duration_ms:
            hwnd = ctypes.windll.user32.FindWindowW(None, title)
            if hwnd:
                ctypes.windll.user32.SetWindowPos(hwnd, None, cx, cy, cw, ch, flags)
                if not hwnd_found:
                    print(f"[pos] guard → ({cx},{cy}) {cw}×{ch} hwnd={hwnd}", flush=True)
                    hwnd_found = True
            time.sleep(0.015)
        if hwnd_found:
            print(f"[pos] guard terminé ({duration_ms} ms)", flush=True)
        else:
            print(f"[pos] guard : fenêtre '{title}' jamais trouvée", flush=True)

    threading.Thread(target=_run, daemon=True).start()


def main():
    # ── Single instance : empêche les doubles-clics multiples ────────────────
    if not _acquire_single_instance():
        _show_error(
            "Oxymore Vision",
            "Une instance d'Oxymore Vision est déjà en cours d'exécution.\n"
            "Ferme-la d'abord avant d'en relancer une nouvelle."
        )
        sys.exit(0)

    try:
        from ctypes import windll
        # PROCESS_SYSTEM_DPI_AWARE = 1
        # Retourne un HRESULT (S_OK=0, E_ACCESSDENIED=0x80070005 si déjà défini)
        hr = windll.shcore.SetProcessDpiAwareness(1)
        if hr != 0:
            print(f"[DPI] SetProcessDpiAwareness(1) → HRESULT {hr:#010x} (déjà défini ou non supporté)", flush=True)
        else:
            print("[DPI] SetProcessDpiAwareness(1) OK", flush=True)
    except Exception as _e:
        print(f"[DPI] SetProcessDpiAwareness indisponible : {_e}", flush=True)

    # ── HTTPS : génère le cert auto-signé AVANT de lancer webview ───────────
    # Pour que WebView2 accepte le cert local sans warning, on doit positionner
    # WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS AVANT d'importer/lancer pywebview.
    cert_path, key_path = ensure_https_cert()
    if cert_path and key_path:
        _ssl_cert[0] = cert_path
        _ssl_cert[1] = key_path
        # Force WebView2 à ignorer les erreurs de cert pour notre localhost
        existing = os.environ.get("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", "")
        flag = "--ignore-certificate-errors"
        if flag not in existing:
            os.environ["WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS"] = (existing + " " + flag).strip()
        print(f"[webview2] flag : {os.environ['WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS']}", flush=True)

    # ── Démarrage Flask EN PARALLÈLE avec l'ouverture du splash ─────────────
    port = get_free_port()
    print(f"[boot] Port Flask : {port}", flush=True)
    threading.Thread(target=start_flask, args=(port,), daemon=True).start()

    import webview

    # ── Centrage de la fenêtre splash sur l'écran ───────────────────────────
    splash_w, splash_h = 800, 450
    try:
        wa_x, wa_y, wa_w, wa_h = _get_work_area()
        splash_x = wa_x + max(0, (wa_w - splash_w) // 2)
        splash_y = wa_y + max(0, (wa_h - splash_h) // 2)
        print(f"[splash] WorkArea ({wa_x},{wa_y},{wa_w}x{wa_h}) → splash pos ({splash_x},{splash_y})", flush=True)
    except Exception:
        splash_x = splash_y = None

    # ── Crée la fenêtre splash 800x450 centrée ──────────────────────────────
    win_api = _WinAPI()
    splash_url = _splash_html_path()
    print(f"[splash] url = {splash_url}", flush=True)
    splash_html_inline = None
    if not splash_url:
        print("[splash] splash.html introuvable, fallback inline", flush=True)
        splash_html_inline = (
            "<html><body style='background:#faf9f5;color:#333;font-family:sans-serif;"
            "display:flex;align-items:center;justify-content:center;height:100vh;margin:0'>"
            "<div style='text-align:center'>"
            "<div style='font-size:13px;letter-spacing:0.4em;font-weight:600'>OXYMORE VISION</div>"
            "<div style='font-size:11px;color:#888;margin-top:8px'>Démarrage…</div>"
            "</div></body></html>"
        )

    create_kwargs = dict(
        title            = "Oxymore Vision",
        url              = splash_url,
        html             = splash_html_inline,
        width            = splash_w,
        height           = splash_h,
        min_size         = (splash_w, splash_h),
        frameless        = True,
        easy_drag        = False,
        background_color = '#faf9f5',
        text_select      = False,
        js_api           = win_api,
        resizable        = False,
        hidden           = True,   # invisible jusqu'à ce que JS centre + window.show()
    )
    # La fenêtre démarre cachée : on_loaded() la centre via JS bridge (DPI-proof)
    # puis appelle window.show() — élimine tout flash/glitch de positionnement.

    window = webview.create_window(**create_kwargs)
    win_api.set_window(window)

    # ── Événement : le splash est rendu (load complet de la 1re page) ────────
    splash_loaded = threading.Event()
    load_counter  = [0]

    def _on_any_load():
        load_counter[0] += 1
        print(f"[event] page loaded (#{load_counter[0]})", flush=True)
        if load_counter[0] == 1:
            splash_loaded.set()
    window.events.loaded += _on_any_load

    # Durée minimum d'affichage du splash (secondes)
    MIN_SPLASH_TIME = 7.0

    # ── Boot séquence : Flask démarre déjà en parallèle, on attend juste ────
    def _boot_sequence():
        # 1. Attend que la page splash soit effectivement rendue par WebView2
        if not splash_loaded.wait(timeout=4.0):
            print("[boot] WARN : splash 'loaded' event jamais reçu (timeout 4s)", flush=True)
        splash_visible_since = time.time()
        print("[boot] splash rendu, on attend que Flask soit prêt (en parallèle)", flush=True)

        # 2. Flask a démarré au début de main() — on attend qu'il réponde
        if not wait_for_server(port, timeout=30):
            err_detail = f"\n\nDétail : {_flask_error[0]}" if _flask_error else ""
            msg = (f"Le serveur Flask n'a pas démarré sur le port {port}.{err_detail}\n\n"
                   "Causes possibles :\n"
                   "  • Antivirus bloque l'exécutable\n"
                   "  • Dépendances Python manquantes\n"
                   "  • Permissions insuffisantes sur le dossier d'install\n\n"
                   "Essayez de lancer l'exe en tant qu'administrateur, "
                   "ou de l'exclure de votre antivirus.")
            _show_error("Oxymore Vision — Erreur de démarrage", msg)
            try: window.destroy()
            except Exception: pass
            os._exit(1)
            return

        # 3. Garantit que le splash a été visible AU MOINS MIN_SPLASH_TIME
        elapsed = time.time() - splash_visible_since
        if elapsed < MIN_SPLASH_TIME:
            remain = MIN_SPLASH_TIME - elapsed
            print(f"[boot] Flask prêt en {elapsed:.2f}s, on attend encore {remain:.2f}s pour laisser voir le splash", flush=True)
            time.sleep(remain)

        print("[boot] Bascule vers l'app principale", flush=True)

        # 4. Fondu doux du splash vers le noir (CSS transition) AVANT de naviguer
        # → évite le flash blanc de WebView2 et l'effet "cut sec" en noir
        FADE_MS = 350
        try:
            window.evaluate_js(
                "var s = document.createElement('style');"
                "s.textContent = "
                "  'html,body{transition:background %dms ease;}'"
                "  + '.splash-mount,.overlay,.splash-overlay{"
                "       transition:opacity %dms ease !important;"
                "       opacity:0 !important;}';"
                "document.head.appendChild(s);"
                "document.documentElement.style.background='#000';"
                "document.body.style.background='#000';"
                % (FADE_MS, FADE_MS)
            )
        except Exception: pass
        time.sleep(FADE_MS / 1000.0 + 0.05)  # laisse la transition se terminer

        # 5. Navigue vers l'app (encore en 800x450 — on redimensionne APRÈS le load)
        try:
            scheme = "https" if (_ssl_cert[0] and Path(_ssl_cert[0]).exists()) else "http"
            window.load_url(f"{scheme}://127.0.0.1:{port}/")
        except Exception as e:
            _show_error("Oxymore Vision", f"Impossible de charger l'interface : {e}")
            try: window.destroy()
            except: pass
            os._exit(1)
            return

        # 6. Attend que l'app principale soit chargée (page #2) avant d'agrandir
        # → évite la zone blanche pendant que le HTML/CSS de l'app charge
        app_loaded_evt = threading.Event()
        def _on_app_load():
            if load_counter[0] >= 2:
                app_loaded_evt.set()
        # On hooke a posteriori : si déjà arrivé, set immédiatement
        if load_counter[0] >= 2:
            app_loaded_evt.set()
        else:
            window.events.loaded += _on_app_load
        app_loaded_evt.wait(timeout=10)

        # 7. Maintenant que l'app est rendue, on agrandit à la taille finale.
        #    Séquence : hide → resize → JS centre (DPI-proof) → show
        #    → zéro glitch / flash de repositionnement.
        try:
            wa_x, wa_y, wa_w, wa_h = _get_work_area()
            WIN_W = min(1400, wa_w)   # Clamp : petits écrans
            WIN_H = min(860,  wa_h)
            print(f"[boot] resize → {WIN_W}×{WIN_H}", flush=True)

            window.hide()
            window.resize(WIN_W, WIN_H)
            time.sleep(0.12)   # laisse le resize s'appliquer côté WebView2

            # Centrage via JS bridge (même espace CSS-pixels que le drag → DPI-proof)
            window.evaluate_js("""
                (function() {
                    if (!window.pywebview || !window.pywebview.api) return;
                    var tx = Math.max(0, Math.floor((window.screen.availWidth  - window.outerWidth)  / 2));
                    var ty = Math.max(0, Math.floor((window.screen.availHeight - window.outerHeight) / 2));
                    var dx = tx - window.screenX;
                    var dy = ty - window.screenY;
                    console.log('[oxym] app center: avail=' + window.screen.availWidth
                        + 'x' + window.screen.availHeight
                        + ' outer=' + window.outerWidth + 'x' + window.outerHeight
                        + ' pos=' + window.screenX + ',' + window.screenY
                        + ' delta=' + dx + ',' + dy);
                    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
                        window.pywebview.api.move_window(dx, dy);
                    }
                })();
            """)
            time.sleep(0.12)   # laisse move_window s'appliquer
            window.show()
            print("[boot] window.show() après resize+centrage JS", flush=True)

            # Bug connu WebView2 : une fenêtre créée hidden=True puis resize()
            # pendant qu'elle est cachée peut afficher une surface noire après
            # show() (le swap-chain D3D n'est pas (re)peint). Un micro-resize
            # juste après show() force WebView2 à re-render le contenu.
            time.sleep(0.05)
            try:
                window.resize(WIN_W, WIN_H + 1)
                time.sleep(0.03)
                window.resize(WIN_W, WIN_H)
            except Exception:
                pass
        except Exception as _e:
            print(f"[boot] resize/show erreur : {_e}", flush=True)
            try: window.show()
            except Exception: pass

    def on_loaded():
        is_splash = (load_counter[0] == 1)   # premier load = page splash

        window.evaluate_js("""
        (function() {
            // ── Centrage auto du splash via bridge JS→Python (DPI-proof) ────────
            // Seulement pour la page file:// (splash).  Tous les pixels viennent
            // du même référentiel CSS → cohérent avec pywebview.move() et le drag.
            if (window.location.protocol === 'file:') {
                (function _center() {
                    if (!window.pywebview || !window.pywebview.api) {
                        setTimeout(_center, 30); return;
                    }
                    var aw = window.screen.availWidth;
                    var ah = window.screen.availHeight;
                    var ow = window.outerWidth;
                    var oh = window.outerHeight;
                    var sx = window.screenX;
                    var sy = window.screenY;
                    var tx = Math.max(0, Math.floor((aw - ow) / 2));
                    var ty = Math.max(0, Math.floor((ah - oh) / 2));
                    var dx = tx - sx;
                    var dy = ty - sy;
                    console.log('[oxym] center: avail=' + aw + 'x' + ah
                        + ' outer=' + ow + 'x' + oh
                        + ' pos=' + sx + ',' + sy
                        + ' target=' + tx + ',' + ty
                        + ' delta=' + dx + ',' + dy);
                    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
                        window.pywebview.api.move_window(dx, dy);
                    }
                })();
            }

            // ── Guard : évite d'installer les listeners plusieurs fois ──────────
            if (window.__oxymDragSetup) return;

            function setupDrag() {
                const titlebar = document.querySelector('.titlebar');
                if (!titlebar) return false;

                window.__oxymDragSetup = true;

                let dragging = false;
                let startMouseX, startMouseY;

                titlebar.addEventListener('mousedown', function(e) {
                    // Ignore si clic sur bouton / input / menu
                    if (e.target.closest('button, input, select, .menu')) return;
                    dragging = true;
                    startMouseX = e.screenX;
                    startMouseY = e.screenY;
                    e.preventDefault();
                });

                document.addEventListener('mousemove', function(e) {
                    if (!dragging) return;
                    const dx = e.screenX - startMouseX;
                    const dy = e.screenY - startMouseY;
                    startMouseX = e.screenX;
                    startMouseY = e.screenY;
                    // Envoie seulement le DELTA — Python lit self._w.x/.y
                    // pour éviter le drift dû à l'async du bridge JS→Python.
                    if (dx !== 0 || dy !== 0) {
                        if (window.pywebview && window.pywebview.api) {
                            window.pywebview.api.move_window(dx, dy);
                        }
                    }
                });

                document.addEventListener('mouseup', function() {
                    dragging = false;
                });

                console.log('[oxym] drag titlebar OK');
                return true;
            }

            // Essai immédiat (React déjà rendu) ou via MutationObserver
            if (!setupDrag()) {
                const obs = new MutationObserver(function() {
                    if (setupDrag()) obs.disconnect();
                });
                obs.observe(document.documentElement, { childList: true, subtree: true });
                // Sécurité : arrête l'observer après 15 s même si .titlebar n'apparaît jamais
                setTimeout(function() { obs.disconnect(); }, 15000);
            }
        })();
        """)

        # ── Splash (1er load) : affiche la fenêtre après centrage JS ─────────────
        # La fenêtre est créée hidden=True → on attend ~150 ms que move_window()
        # soit exécuté (bridge JS→Python async) puis on la rend visible.
        # L'utilisateur ne voit jamais la fenêtre à une mauvaise position.
        if is_splash:
            time.sleep(0.15)
            try:
                window.show()
                print("[on_loaded] splash → window.show() après centrage JS", flush=True)
            except Exception as e:
                print(f"[on_loaded] window.show() erreur : {e}", flush=True)

    window.events.loaded += on_loaded

    # Pas de _pos_guard pour le splash : la fenêtre est créée hidden=True,
    # on_loaded() la centre via JS puis appelle window.show() → zéro flash.

    try:
        webview.start(_boot_sequence, debug=False)
    except Exception as e:
        _show_error(
            "Oxymore Vision — Erreur WebView",
            f"Impossible de démarrer la fenêtre WebView :\n{e}\n\n"
            "Cause probable : WebView2 Runtime non installé.\n"
            "Téléchargez-le depuis :\n"
            "https://developer.microsoft.com/microsoft-edge/webview2/"
        )
        sys.exit(2)


class _WinAPI:
    def __init__(self):         self._w = None
    def set_window(self, w):    self._w = w
    def minimize(self):         self._w and self._w.minimize()
    def toggle_maximize(self):  self._w and self._w.toggle_fullscreen()
    def close(self):            self._w and self._w.destroy()
    def move_window(self, dx, dy):
        """
        Déplace la fenêtre d'un delta (dx, dy) en pixels CSS/logiques.
        On lit la position courante depuis pywebview (self._w.x / .y) pour
        éviter les glissements dus à l'asynchronicité du bridge JS→Python.
        """
        if self._w:
            try:
                self._w.move(self._w.x + int(dx), self._w.y + int(dy))
            except Exception:
                pass
    def open_url(self, url):
        """Ouvre une URL dans le navigateur système (depuis le webview natif)."""
        try:
            import webbrowser
            webbrowser.open(str(url))
            return True
        except Exception:
            return False

    def save_logs(self, content, default_name=None):
        """
        Affiche un dialog 'Enregistrer sous' natif et écrit `content` dans le fichier choisi.
        Retourne le chemin écrit, ou None si annulé / erreur.
        """
        if not self._w:
            return None
        try:
            import webview
            from datetime import datetime
            if not default_name:
                stamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
                default_name = f"oxymore-console-{stamp}.txt"
            result = self._w.create_file_dialog(
                webview.SAVE_DIALOG,
                save_filename=default_name,
                file_types=('Fichiers texte (*.txt)', 'Tous les fichiers (*.*)'),
            )
            if not result:
                return None
            path = result[0] if isinstance(result, (list, tuple)) else result
            with open(path, 'w', encoding='utf-8', newline='\n') as f:
                f.write(content if isinstance(content, str) else str(content))
            print(f"[save_logs] écrit dans {path}", flush=True)
            return str(path)
        except Exception as e:
            print(f"[save_logs] erreur : {e}", flush=True)
            return None

    def save_bvh(self, content, default_name=None):
        """
        Affiche un dialog 'Enregistrer sous' natif (filtre .bvh) et écrit
        `content` (texte BVH ASCII) dans le fichier choisi.
        Retourne le chemin écrit, ou None si annulé / erreur.
        """
        if not self._w:
            return None
        try:
            import webview
            if not default_name:
                default_name = "export.bvh"
            result = self._w.create_file_dialog(
                webview.SAVE_DIALOG,
                save_filename=default_name,
                file_types=('Fichiers BVH (*.bvh)', 'Tous les fichiers (*.*)'),
            )
            if not result:
                return None
            path = result[0] if isinstance(result, (list, tuple)) else result
            with open(path, 'w', encoding='utf-8', newline='\n') as f:
                f.write(content if isinstance(content, str) else str(content))
            print(f"[save_bvh] écrit dans {path}", flush=True)
            return str(path)
        except Exception as e:
            print(f"[save_bvh] erreur : {e}", flush=True)
            return None


if __name__ == "__main__":
    main()
