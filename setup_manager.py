#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Oxymore Vision — Gestionnaire de setup au 1er lancement

Architecture après installation :
    📁 Dossier choisi (ex: C:\\Users\\Moi\\OxymoreVision\\)
        OxymoreVision.exe    ← exe copié ici
        venv\\               ← environnement Python (~4 Go)
        .setup_done          ← marqueur de fin de setup
        .python_path         ← (mode B) chemin Python existant

    🖥️ Bureau
        Oxymore Vision.lnk   ← raccourci Windows vers l'exe ci-dessus

Si l'utilisateur laisse le dossier vide, tout reste à côté de l'exe courant,
pas de copie, pas de raccourci.
"""

import sys
import os
import shutil
import subprocess
import threading
from pathlib import Path


# ─── Chemins ──────────────────────────────────────────────────────────────────
def _install_dir() -> Path:
    if getattr(sys, 'frozen', False):
        return Path(sys.executable).parent
    return Path(__file__).parent


def _is_writable(p: Path) -> bool:
    """True si on peut écrire dans le dossier (Program Files, USB, Downloads zip = False)."""
    try:
        p.mkdir(parents=True, exist_ok=True)
        test = p / ".oxymore_write_test"
        test.write_text("x", encoding="utf-8")
        test.unlink()
        return True
    except Exception:
        return False


def _data_dir() -> Path:
    """
    Dossier écrivable pour l'état (.setup_done, .python_path).
    Toujours dans %LOCALAPPDATA%\\OxymoreVision — jamais à côté de l'exe.
    Cela évite de créer des fichiers dans Téléchargements, le Bureau, etc.
    Priorité :
      1. %LOCALAPPDATA%\\OxymoreVision  (emplacement standard Windows)
      2. %APPDATA%\\OxymoreVision
      3. ~/OxymoreVision (ultime fallback)
    """
    for base_var in ("LOCALAPPDATA", "APPDATA"):
        base = os.environ.get(base_var, "")
        if base:
            d = Path(base) / "OxymoreVision"
            if _is_writable(d):
                return d
    d = Path(os.path.expanduser("~")) / "OxymoreVision"
    d.mkdir(parents=True, exist_ok=True)
    return d


INSTALL_DIR    = _install_dir()
DATA_DIR       = _data_dir()
VENV_PYTHON    = INSTALL_DIR / "venv" / "Scripts" / "python.exe"
STATUS_FILE    = DATA_DIR / ".setup_done"
CUSTOM_PYTHON  = DATA_DIR / ".python_path"

# ── Migration : déplace les anciens fichiers d'état si INSTALL_DIR ≠ DATA_DIR ──
if INSTALL_DIR != DATA_DIR:
    for legacy_name in (".setup_done", ".python_path"):
        legacy = INSTALL_DIR / legacy_name
        target = DATA_DIR / legacy_name
        if legacy.exists() and not target.exists():
            try:
                target.write_bytes(legacy.read_bytes())
                legacy.unlink()
            except Exception:
                pass

# Suggestion de dossier d'install par défaut
DEFAULT_INSTALL = Path(os.environ.get("LOCALAPPDATA", "~")) / "OxymoreVision"


# ─── Paquets à installer ───────────────────────────────────────────────────────
PACKAGES = [
    ("torch",           "https://download.pytorch.org/whl/cu128"),
    ("onnxruntime-gpu", None),
    ("pose2sim==0.10.45", None),
    ("toml",            None),
    ("tomli-w",         None),
]


# ─── État ─────────────────────────────────────────────────────────────────────
def is_setup_done() -> bool:
    if not STATUS_FILE.exists():
        return False
    if CUSTOM_PYTHON.exists():
        p = CUSTOM_PYTHON.read_text(encoding="utf-8").strip()
        return bool(p) and Path(p).exists()
    return VENV_PYTHON.exists()


def get_setup_info() -> dict:
    """État courant de la configuration des dépendances."""
    info = {
        "done": is_setup_done(),
        "mode": None,          # 'custom' | 'venv' | None
        "python_path": None,
        "venv_path": str(VENV_PYTHON) if VENV_PYTHON.exists() else None,
        "has_custom": CUSTOM_PYTHON.exists(),
        "install_dir": str(INSTALL_DIR),
    }
    if CUSTOM_PYTHON.exists():
        p = CUSTOM_PYTHON.read_text(encoding="utf-8").strip()
        if p and Path(p).exists():
            info["mode"] = "custom"
            info["python_path"] = p
    elif VENV_PYTHON.exists():
        info["mode"] = "venv"
        info["python_path"] = str(VENV_PYTHON)
    return info


def reset_setup() -> None:
    """Efface .python_path et .setup_done (le venv local n'est pas touché)."""
    try:
        if CUSTOM_PYTHON.exists():
            CUSTOM_PYTHON.unlink()
    except Exception:
        pass
    try:
        if STATUS_FILE.exists():
            STATUS_FILE.unlink()
    except Exception:
        pass


def get_venv_python() -> str | None:
    """
    Retourne le Python pose2sim à utiliser pour le runner.
    Retourne None si introuvable — ne retourne JAMAIS sys.executable quand frozen
    (= l'exe lui-même), ce qui relancerait l'application.
    """
    if CUSTOM_PYTHON.exists():
        p = CUSTOM_PYTHON.read_text(encoding="utf-8").strip()
        if p and Path(p).exists():
            return p
    if VENV_PYTHON.exists():
        return str(VENV_PYTHON)
    # En dev (non-frozen) : Python courant OK
    if not getattr(sys, 'frozen', False):
        return sys.executable
    # Frozen + pas de venv : on refuse de retourner l'exe
    return None


# ─── Environnement propre (retire variables PyInstaller) ─────────────────────
def _clean_env() -> dict:
    """
    Retire PYTHONHOME, PYTHONPATH, _MEIPASS du PATH et les vars _PYI_*
    pour éviter le conflit 'python312.dll conflicts with this version of Python'
    quand on lance un subprocess Python depuis un exe PyInstaller.
    """
    env = os.environ.copy()
    if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
        meipass = os.path.abspath(sys._MEIPASS)
        env.pop("PYTHONHOME", None)
        env.pop("PYTHONPATH", None)
        clean = [p for p in env.get("PATH", "").split(os.pathsep)
                 if not os.path.abspath(p).startswith(meipass)]
        env["PATH"] = os.pathsep.join(clean)
        for key in list(env.keys()):
            if key.startswith("_PYI_"):
                del env[key]
        env.pop("_MEIPASS2", None)
    return env


# Le module pose2sim s'importe en "Pose2Sim" (PascalCase) depuis la v0.10+
# mais certaines anciennes versions exposent "pose2sim". On teste les deux.
_POSE2SIM_PROBE = (
    "import importlib, sys;\n"
    "ok = False\n"
    "for n in ('Pose2Sim','pose2sim'):\n"
    "    try:\n"
    "        importlib.import_module(n); ok = True; break\n"
    "    except Exception: pass\n"
    "import toml\n"
    "print('ok' if ok else 'no')"
)


# ─── Option B : Python existant ───────────────────────────────────────────────
def validate_python(python_path: str) -> bool:
    try:
        r = subprocess.run(
            [python_path, "-c", _POSE2SIM_PROBE],
            capture_output=True, text=True, timeout=30,
            env=_clean_env(),
            encoding="utf-8", errors="replace",
        )
        return r.returncode == 0 and "ok" in (r.stdout or "")
    except Exception:
        return False


def use_existing_python(python_path: str):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    CUSTOM_PYTHON.write_text(python_path.strip(), encoding="utf-8")
    STATUS_FILE.write_text("done", encoding="utf-8")


# ─── Raccourci Windows ────────────────────────────────────────────────────────
def _get_desktop() -> Path:
    """Retourne le chemin du Bureau Windows (FR ou EN)."""
    try:
        r = subprocess.run(
            ["powershell", "-NonInteractive", "-Command",
             "[Environment]::GetFolderPath('Desktop')"],
            capture_output=True, text=True, timeout=5,
        )
        p = r.stdout.strip()
        if p and Path(p).is_dir():
            return Path(p)
    except Exception:
        pass
    # Fallback
    userprofile = Path(os.environ.get("USERPROFILE", "~"))
    for name in ("Desktop", "Bureau"):
        d = userprofile / name
        if d.is_dir():
            return d
    return userprofile


def create_shortcut(target_exe: Path) -> str | None:
    """Crée un raccourci .lnk sur le Bureau vers target_exe. Retourne le chemin ou None."""
    desktop = _get_desktop()
    lnk = desktop / "Oxymore Vision.lnk"
    ps = (
        f'$s=(New-Object -ComObject WScript.Shell).CreateShortcut("{lnk}");'
        f'$s.TargetPath="{target_exe}";'
        f'$s.WorkingDirectory="{target_exe.parent}";'
        f'$s.IconLocation="{target_exe}";'
        f'$s.Description="Oxymore Vision";'
        f'$s.Save()'
    )
    try:
        subprocess.run(
            ["powershell", "-NonInteractive", "-Command", ps],
            capture_output=True, timeout=10,
        )
        return str(lnk) if lnk.exists() else None
    except Exception:
        return None


# ─── Scan complet des Pythons (pour l'onglet Dépendances) ─────────────────────
def _candidate_paths() -> list[tuple[str, str]]:
    """
    Retourne [(path, source), ...] de tous les candidats à essayer.
    source ∈ {'PATH', 'system', 'conda', 'venv', 'custom', 'app-venv'}
    """
    import glob
    out: list[tuple[str, str]] = []

    # 1) Le venv local de l'app (s'il existe)
    if VENV_PYTHON.exists():
        out.append((str(VENV_PYTHON), "app-venv"))

    # 2) Custom path enregistré
    if CUSTOM_PYTHON.exists():
        p = CUSTOM_PYTHON.read_text(encoding="utf-8").strip()
        if p and Path(p).exists():
            out.append((p, "custom"))

    # 3) PATH
    for name in ("python3.exe", "python.exe", "python3", "python"):
        p = shutil.which(name)
        if p:
            out.append((p, "PATH"))

    localappdata = os.environ.get("LOCALAPPDATA", "")
    userprofile  = os.environ.get("USERPROFILE", "")
    programfiles = os.environ.get("PROGRAMFILES", "")
    programdata  = os.environ.get("PROGRAMDATA", "")

    # 4) Installations système classiques
    system_patterns = [
        fr"{localappdata}\Programs\Python\Python3*\python.exe",
        fr"{localappdata}\Programs\Python\Python*\python.exe",
        fr"{userprofile}\AppData\Local\Programs\Python\Python3*\python.exe",
        fr"{programfiles}\Python3*\python.exe",
        fr"{programfiles}\Python*\python.exe",
        r"C:\Python3*\python.exe",
        r"C:\Python*\python.exe",
    ]
    for pat in system_patterns:
        for p in glob.glob(pat):
            out.append((p, "system"))

    # 5) Conda / Miniconda / Anaconda : racine + tous les envs/*
    conda_roots = [
        fr"{userprofile}\anaconda3",
        fr"{userprofile}\miniconda3",
        fr"{userprofile}\AppData\Local\anaconda3",
        fr"{userprofile}\AppData\Local\miniconda3",
        fr"{userprofile}\AppData\Local\Continuum\anaconda3",
        fr"{programdata}\anaconda3",
        fr"{programdata}\miniconda3",
        r"C:\anaconda3",
        r"C:\miniconda3",
        r"C:\ProgramData\anaconda3",
        r"C:\ProgramData\miniconda3",
    ]
    for root in conda_roots:
        if not root:
            continue
        base = Path(root) / "python.exe"
        if base.exists():
            out.append((str(base), "conda"))
        envs = Path(root) / "envs"
        if envs.is_dir():
            for env in envs.iterdir():
                cand = env / "python.exe"
                if cand.exists():
                    out.append((str(cand), "conda"))

    # 6) Venvs dans le profil + dossiers de projets courants (best effort)
    project_roots: list[Path] = []
    if userprofile:
        up = Path(userprofile)
        project_roots += [
            up,
            up / "Desktop",
            up / "Documents",
            up / "Bureau",
            up / "OneDrive",
            up / "OneDrive" / "Desktop",
            up / "OneDrive" / "Documents",
            up / "OneDrive" / "Bureau",
            up / "Projects", up / "Projets", up / "projects",
            up / "dev", up / "Dev", up / "code", up / "Code",
            up / "source", up / "src",
        ]
    # Racine du dossier install (utile en mode dev / packaged side-by-side)
    project_roots.append(INSTALL_DIR.parent)
    # Drives non-C: si présents
    for drive in ("D:\\", "E:\\", "F:\\"):
        if Path(drive).exists():
            project_roots.append(Path(drive))

    venv_subdirs = ("venv", "venvs", ".venv", "env", "envs", ".env")
    seen_roots: set[str] = set()
    for root in project_roots:
        try:
            root = Path(root).resolve()
        except Exception:
            continue
        key = str(root)
        if key in seen_roots or not root.is_dir():
            continue
        seen_roots.add(key)

        # a) venv direct à la racine : root/venv/Scripts/python.exe
        for sub in venv_subdirs:
            cand = root / sub / "Scripts" / "python.exe"
            if cand.exists():
                out.append((str(cand), "venv"))

        # b) venvs nichés dans les sous-projets : root/*/venv/Scripts/python.exe
        # Limité aux 80 premiers sous-dossiers pour ne pas exploser le temps de scan.
        try:
            children = sorted(
                [c for c in root.iterdir() if c.is_dir() and not c.name.startswith('.')],
                key=lambda p: p.name.lower()
            )[:80]
        except Exception:
            children = []
        for child in children:
            for sub in venv_subdirs:
                cand = child / sub / "Scripts" / "python.exe"
                if cand.exists():
                    out.append((str(cand), "venv"))

    # Déduplication en gardant le 1er source pour chaque chemin résolu
    self_exe = Path(sys.executable).resolve() if getattr(sys, "frozen", False) else None
    seen: set[str] = set()
    deduped: list[tuple[str, str]] = []
    for p, src in out:
        try:
            key = str(Path(p).resolve())
        except Exception:
            continue
        if key in seen:
            continue
        if self_exe and Path(key) == self_exe:
            continue  # jamais retourner l'exe PyInstaller lui-même
        seen.add(key)
        deduped.append((key, src))
    return deduped


def _python_version(path: str) -> str | None:
    try:
        r = subprocess.run(
            [path, "--version"],
            capture_output=True, text=True, timeout=5,
            env=_clean_env(),
            encoding="utf-8", errors="replace",
        )
        if r.returncode != 0:
            return None
        return ((r.stdout or "").strip() or (r.stderr or "").strip()) or None
    except Exception:
        return None


def _has_pose2sim(path: str) -> bool:
    try:
        r = subprocess.run(
            [path, "-c", _POSE2SIM_PROBE],
            capture_output=True, text=True, timeout=30,
            env=_clean_env(),
            encoding="utf-8", errors="replace",
        )
        return r.returncode == 0 and "ok" in (r.stdout or "")
    except Exception:
        return False


def scan_python_candidates(check_pose2sim: bool = True) -> list[dict]:
    """
    Scan complet : retourne une liste de candidats avec leur statut.
    [{'path', 'version', 'has_pose2sim', 'source'}, ...]
    Triée : pose2sim ok en premier, puis par source.

    Parallélisé via ThreadPool pour rester rapide (~3-8s même avec 50 candidats).
    """
    from concurrent.futures import ThreadPoolExecutor

    order = {"custom": 0, "app-venv": 1, "conda": 2, "PATH": 3, "system": 4, "venv": 5}
    paths = _candidate_paths()

    def _check(item):
        path, src = item
        version = _python_version(path)
        if not version:
            return None
        has = _has_pose2sim(path) if check_pose2sim else None
        return {"path": path, "version": version, "has_pose2sim": has, "source": src}

    # Max 8 workers (CPU subprocess overhead, pas un goulot d'étranglement disque)
    with ThreadPoolExecutor(max_workers=min(8, max(1, len(paths)))) as ex:
        results = [r for r in ex.map(_check, paths) if r is not None]

    results.sort(key=lambda c: (not c.get("has_pose2sim"), order.get(c["source"], 99)))
    return results


def auto_detect_pose2sim() -> str | None:
    """Première détection silencieuse — retourne le chemin du premier Python avec pose2sim, ou None."""
    for path, _src in _candidate_paths():
        if _has_pose2sim(path):
            return path
    return None


def try_auto_setup() -> str | None:
    """
    À appeler au démarrage du serveur. Si setup non terminé mais qu'un Python
    avec pose2sim existe sur la machine, on l'enregistre automatiquement.
    Retourne le chemin sélectionné, ou None.
    """
    if is_setup_done():
        return None
    found = auto_detect_pose2sim()
    if found:
        try:
            use_existing_python(found)
            return found
        except Exception:
            return None
    return None


# ─── Détection Python système ─────────────────────────────────────────────────
def _find_system_python() -> str | None:
    """
    Trouve un Python réel sur le système.
    Crucial quand frozen : sys.executable = l'exe PyInstaller, pas Python.
    """
    import glob

    candidates = []
    for name in ("python3.exe", "python.exe", "python3", "python"):
        p = shutil.which(name)
        if p:
            candidates.append(p)

    localappdata = os.environ.get("LOCALAPPDATA", "")
    userprofile  = os.environ.get("USERPROFILE", "")
    for pattern in [
        fr"{localappdata}\Programs\Python\Python3*\python.exe",
        fr"{localappdata}\Programs\Python\Python*\python.exe",
        fr"{userprofile}\AppData\Local\Programs\Python\Python3*\python.exe",
        fr"{userprofile}\anaconda3\python.exe",
        fr"{userprofile}\miniconda3\python.exe",
        fr"{userprofile}\AppData\Local\anaconda3\python.exe",
        r"C:\Python3*\python.exe",
        r"C:\Python*\python.exe",
    ]:
        candidates.extend(glob.glob(pattern))

    self_exe = Path(sys.executable).resolve() if getattr(sys, 'frozen', False) else None
    seen = set()
    for p in candidates:
        try:
            p_abs = Path(p).resolve()
        except Exception:
            continue
        key = str(p_abs)
        if key in seen:
            continue
        seen.add(key)
        if self_exe and p_abs == self_exe:
            continue
        if not p_abs.exists():
            continue
        try:
            r = subprocess.run([str(p_abs), "--version"], capture_output=True, timeout=5)
            if r.returncode == 0:
                return str(p_abs)
        except Exception:
            pass
    return None


# ─── Option A : Installer dans un venv ────────────────────────────────────────
def create_venv(socketio=None, install_dir: str | None = None):
    """
    install_dir : dossier cible choisi par l'utilisateur (None = à côté de l'exe).

    Si install_dir est donné (et app frozen) :
      1. Copie l'exe dans install_dir
      2. Crée le venv dans install_dir/venv/
      3. Crée un raccourci Windows sur le Bureau
    Sinon : installe le venv à côté de l'exe courant.
    """
    # ── Dossier cible ─────────────────────────────────────────────────────────
    if install_dir:
        home = Path(install_dir)
        try:
            home.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            _emit(socketio, f"Impossible de creer {home} : {e}", "error")
            if socketio: socketio.emit("setup_done", {"ok": False})
            return
    else:
        home = INSTALL_DIR

    venv_path = home / "venv"
    venv_py   = venv_path / "Scripts" / "python.exe"
    venv_pip  = venv_path / "Scripts" / "pip.exe"

    def emit(msg, lvl="info"):
        print(msg)
        if socketio:
            socketio.emit("setup_log", {"lvl": lvl, "msg": msg})

    # ── Copie l'exe dans le dossier cible ─────────────────────────────────────
    installed_exe = home / "OxymoreVision.exe"
    if install_dir and getattr(sys, 'frozen', False):
        src = Path(sys.executable)
        if src.resolve() != installed_exe.resolve():
            emit(f"Copie de l'application vers {home}...")
            try:
                shutil.copy2(src, installed_exe)
                emit("Application copiee !", "ok")
            except Exception as e:
                emit(f"Impossible de copier l'exe : {e}", "error")
                if socketio: socketio.emit("setup_done", {"ok": False})
                return
        else:
            emit("Application deja en place.", "ok")
    else:
        installed_exe = Path(sys.executable)

    # ── Python hôte pour créer le venv ────────────────────────────────────────
    if getattr(sys, 'frozen', False):
        host_python = _find_system_python()
        if not host_python:
            emit("Aucun Python trouve sur le systeme.", "error")
            emit("Installez Python 3.10+ depuis python.org puis relancez,", "error")
            emit("ou utilisez 'J'ai deja pose2sim installe'.", "error")
            if socketio:
                socketio.emit("setup_done", {"ok": False, "error": "no_python"})
            return
        emit(f"Python systeme : {host_python}", "ok")
    else:
        host_python = sys.executable

    # ── Création du venv ──────────────────────────────────────────────────────
    emit(f"Creation du venv dans {venv_path}...")
    try:
        subprocess.run(
            [host_python, "-m", "venv", str(venv_path)],
            check=True, capture_output=True,
        )
    except subprocess.CalledProcessError as e:
        err = e.stderr.decode(errors="replace")[:300]
        emit(f"Impossible de creer le venv : {err}", "error")
        if socketio: socketio.emit("setup_done", {"ok": False})
        return
    emit("Venv cree !", "ok")

    # ── pip ──────────────────────────────────────────────────────────────────
    emit("Mise a jour pip...")
    subprocess.run(
        [str(venv_py), "-m", "pip", "install", "--upgrade", "pip", "-q"],
        capture_output=True,
    )

    # ── Paquets ──────────────────────────────────────────────────────────────
    total = len(PACKAGES)
    for i, (pkg, index_url) in enumerate(PACKAGES):
        emit(f"[{i+1}/{total}] Installation de {pkg}...")
        cmd = [str(venv_pip), "install", pkg, "-q"]
        if index_url:
            cmd += ["--index-url", index_url,
                    "--extra-index-url", "https://pypi.org/simple"]
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
            if result.returncode == 0:
                emit(f"{pkg} installe !", "ok")
            else:
                emit(f"{pkg} : {result.stderr[:200]}", "warn")
        except subprocess.TimeoutExpired:
            emit(f"Timeout pour {pkg}", "error")
        except Exception as e:
            emit(f"Erreur {pkg} : {e}", "error")

    # ── .setup_done dans home (à côté de l'exe installé) ─────────────────────
    (home / ".setup_done").write_text("done", encoding="utf-8")

    # ── Raccourci Bureau ──────────────────────────────────────────────────────
    if install_dir and getattr(sys, 'frozen', False):
        lnk = create_shortcut(installed_exe)
        if lnk:
            emit(f"Raccourci cree sur le Bureau : {lnk}", "ok")
        else:
            emit("Raccourci non cree (bureau introuvable).", "warn")

        # ── Suppression différée de l'exe d'origine ───────────────────────────
        src = Path(sys.executable).resolve()
        if src.resolve() != installed_exe.resolve():
            _schedule_self_delete(src)
            emit(f"L'exe d'origine sera supprime automatiquement.", "ok")

    emit("Installation terminee !", "ok")
    restart = bool(install_dir and getattr(sys, 'frozen', False))
    if socketio:
        socketio.emit("setup_done", {"ok": True, "restart": restart})


def _schedule_self_delete(exe_path: Path):
    """
    Supprime l'exe d'origine ~5s après la fermeture de l'app.
    On ne peut pas supprimer un exe en cours d'exécution sous Windows,
    donc on lance un processus PowerShell détaché qui attend la sortie du process.
    """
    ps = (
        f'$pid_target = {os.getpid()};'
        f'try {{ Wait-Process -Id $pid_target -Timeout 30 -ErrorAction SilentlyContinue }} catch {{}};'
        f'Start-Sleep -Seconds 2;'
        f'Remove-Item -Force "{exe_path}" -ErrorAction SilentlyContinue'
    )
    try:
        subprocess.Popen(
            ["powershell", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", ps],
            creationflags=0x00000008 | 0x08000000,  # DETACHED_PROCESS | CREATE_NO_WINDOW
            close_fds=True,
        )
    except Exception:
        pass


def _emit(socketio, msg, lvl="info"):
    print(msg)
    if socketio:
        socketio.emit("setup_log", {"lvl": lvl, "msg": msg})


def run_setup_async(socketio, install_dir=None):
    threading.Thread(
        target=create_venv,
        args=(socketio,),
        kwargs={"install_dir": install_dir},
        daemon=True,
    ).start()
