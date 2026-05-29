# PyInstaller spec — Oxymore Vision Desktop
from pathlib import Path
from PyInstaller.utils.hooks import collect_all, collect_submodules

ROOT = Path(SPECPATH).parent   # = Oxym_Build/

# ── Collecte complète des packages critiques ──────────────────────────────────
def _collect(*pkgs):
    d, b, h = [], [], []
    for pkg in pkgs:
        dd, bb, hh = collect_all(pkg)
        d += dd; b += bb; h += hh
    return d, b, h

_datas, _binaries, _hidden = _collect(
    'flask', 'flask_socketio', 'flask_cors',
    'engineio', 'socketio',
    'eventlet',
    'simple_websocket', 'wsproto',
    'webview',
    'requests',
    'qrcode',
    'PIL',           # Pillow — requis par qrcode.make() en mode PNG
    'cryptography',
)

a = Analysis(
    [str(ROOT / 'app_desktop.py')],
    pathex=[str(ROOT)],
    binaries=_binaries,
    datas=[
        (str(ROOT / 'App'),                  'App'),
        (str(ROOT / 'server.py'),            '.'),
        (str(ROOT / 'license_manager.py'),   '.'),
        (str(ROOT / 'setup_manager.py'),     '.'),
        (str(ROOT / 'pose2sim_runner.py'),   '.'),
        (str(ROOT / 'pose2sim_to_bvh.py'),   '.'),
        (str(ROOT / 'Config_template.toml'), '.'),
        *_datas,
    ],
    hiddenimports=[
        *_hidden,
        # Flask / SocketIO internals
        'flask', 'flask_socketio', 'flask_cors',
        'engineio', 'engineio.async_drivers',
        'engineio.async_drivers.threading',
        'engineio.async_drivers.eventlet',
        'engineio.async_drivers.gevent',
        'socketio',
        'eventlet', 'eventlet.hubs',
        'eventlet.hubs.epolls', 'eventlet.hubs.kqueue',
        'eventlet.hubs.selects', 'eventlet.hubs.poll',
        'simple_websocket', 'wsproto', 'h11',
        # PyWebView
        'webview', 'webview.platforms',
        'webview.platforms.edgechromium',
        'webview.platforms.mshtml',
        'webview.platforms.winforms',
        # Stdlib explicites
        'hashlib', 'hmac', 'uuid', 'platform',
        'threading', 'subprocess', 'socket',
        'winreg', 'psutil',
        'webbrowser',                  # bouton "Télécharger Python"
        'tkinter', 'tkinter.messagebox',  # fallback dialog erreurs
        'msvcrt',                      # single-instance lock
        'tempfile', 'shutil', 'glob',
        'urllib', 'urllib.request', 'urllib.error',
        'concurrent', 'concurrent.futures',
        'json', 'datetime', 'secrets',
        # QR code + image
        'qrcode', 'qrcode.image', 'qrcode.image.pil', 'qrcode.image.base',
        'PIL', 'PIL.Image', 'PIL.ImageDraw', 'PIL.ImageFont',
        # Formats / config
        'toml', 'tomli_w', 'tomli',
        # Modules locaux
        'setup_manager', 'server', 'license_manager',
        # pkg_resources : utilisé par Flask et nombre de libs
        'pkg_resources',
    ],
    excludes=['torch', 'onnxruntime', 'pose2sim', 'numpy', 'cv2'],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz, a.scripts, a.binaries, a.datas, [],
    name='OxymoreVision',
    debug=False, strip=False, upx=True,
    console=True,   # laisser True pour voir les erreurs pendant les tests
    icon=str(ROOT / 'App' / 'assets' / 'OxymoreVision.ico'),
    onefile=True,
)
