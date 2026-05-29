#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Script exécuté en sous-processus par la GUI.
Tourne dans son propre processus Python → thread principal libre →
matplotlib/OpenCV peuvent afficher des fenêtres normalement.

Usage : python pose2sim_runner.py <project_dir> <step>
"""
import sys
import os

def main():
    if len(sys.argv) < 3:
        print("Usage: pose2sim_runner.py <project_dir> <step>")
        sys.exit(1)

    project_dir = sys.argv[1]
    step        = sys.argv[2]

    # Se placer dans le dossier projet
    os.chdir(project_dir)

    # Import pose2sim
    try:
        from Pose2Sim import Pose2Sim
    except ImportError as e:
        print(f"ERREUR: Impossible d'importer Pose2Sim : {e}", flush=True)
        sys.exit(2)

    # Exécuter l'étape
    fn = getattr(Pose2Sim, step, None)
    if fn is None:
        print(f"ERREUR: Étape inconnue : {step}", flush=True)
        sys.exit(3)

    # Certaines versions de Pose2Sim ne créent pas les dossiers requis automatiquement
    # → StopIteration sur next(os.walk(pose_dir)) si le dossier n'existe pas
    _ensure_pose2sim_dirs(project_dir, step)

    # Normalise Config.toml : frame_range doit être des INT (sinon tqdm/range plante)
    _normalize_config_toml(project_dir)

    # ── Patch get_screen_size pour éviter le conflit Tcl de PyInstaller ─────
    # Pose2Sim appelle ctk.CTk() pour obtenir la taille d'écran, ce qui plante
    # quand l'app est packagée (Tcl 8.6.13 embarqué vs 8.6.15 système).
    # On remplace par ctypes (Windows) ou une valeur par défaut.
    _patch_get_screen_size()
    # ─────────────────────────────────────────────────────────────────────────

    print(f"[RUNNER] Démarrage : {step}", flush=True)
    try:
        fn()
        # ── Fix automatique fichier .mot double suffixe ───────────────────
        # filter_ik=true génère *_LSTM_filt_butterworth.mot illisible par Blender
        # → on le renomme en remplaçant le double suffixe
        if step == "kinematics":
            _fix_double_mot(project_dir)
        # ─────────────────────────────────────────────────────────────────
        print(f"[RUNNER] Terminé : {step}", flush=True)
        sys.exit(0)
    except Exception as e:
        import traceback
        print(f"[RUNNER] ERREUR dans {step} :", flush=True)
        traceback.print_exc()
        sys.exit(1)

def _patch_get_screen_size():
    """
    Remplace Pose2Sim.common.get_screen_size par une version sans tkinter/customtkinter.
    Nécessaire quand l'app est packagée avec PyInstaller : le Tcl embarqué (8.6.13)
    entre en conflit avec le Tcl système (8.6.15) et lève TclError.
    On utilise ctypes sur Windows, sinon on retourne 1920×1080 par défaut.
    """
    def _get_screen_size_safe():
        try:
            import ctypes
            user32 = ctypes.windll.user32
            user32.SetProcessDPIAware()
            w = user32.GetSystemMetrics(0)
            h = user32.GetSystemMetrics(1)
            return w, h
        except Exception:
            return 1920, 1080

    try:
        import Pose2Sim.common as _common
        _common.get_screen_size = _get_screen_size_safe
    except Exception:
        pass  # si le module n'existe pas encore, tant pis


def _ensure_pose2sim_dirs(project_dir, step):
    """
    Crée les dossiers requis par Pose2Sim avant chaque étape.
    Certaines versions lèvent StopIteration si le dossier n'existe pas encore.
    """
    dirs_by_step = {
        "poseEstimation":  ["pose"],
        "synchronization": ["pose"],
        "associatePersons":["pose", "pose-associated"],
        "triangulation":   ["pose", "pose-associated"],
        "filtering":       ["pose", "pose-associated"],
        "markerAugmentation": ["pose", "pose-associated"],
        "kinematics":      [],
    }
    for d in dirs_by_step.get(step, []):
        target = os.path.join(project_dir, d)
        if not os.path.exists(target):
            os.makedirs(target, exist_ok=True)
            print(f"[RUNNER] Dossier créé : {d}/", flush=True)


def _normalize_config_toml(project_dir):
    """
    Réécrit Config.toml en castant frame_range en INT.
    Pose2Sim fait `range(*frame_range)` qui exige des int — sinon TypeError.
    Le bug se manifestait quand l'UI sauvait Config.toml avec [0.0, 144.0] au lieu de [0, 144].
    """
    cfg_path = os.path.join(project_dir, "Config.toml")
    if not os.path.isfile(cfg_path):
        return
    try:
        import toml
    except ImportError:
        return
    try:
        data = toml.load(cfg_path)
    except Exception as e:
        print(f"[RUNNER] Lecture Config.toml impossible : {e}", flush=True)
        return

    changed = False
    proj = data.get("project", {})
    fr = proj.get("frame_range")
    # Si liste de nombres entiers (potentiellement écrits comme 0.0), on caste
    if isinstance(fr, list) and fr and all(isinstance(x, (int, float)) for x in fr):
        casted = [int(x) for x in fr]
        if casted != fr:
            proj["frame_range"] = casted
            data["project"] = proj
            changed = True

    if changed:
        try:
            with open(cfg_path, "w", encoding="utf-8") as f:
                toml.dump(data, f)
            print(f"[RUNNER] Config.toml normalisé : frame_range → {casted}", flush=True)
        except Exception as e:
            print(f"[RUNNER] Écriture Config.toml échouée : {e}", flush=True)


def _fix_double_mot(project_dir):
    """Renomme *_filt_X_LSTM_filt_X.mot → *_filt_X_LSTM.mot"""
    import glob, re
    kin_dir = os.path.join(project_dir, "kinematics")
    if not os.path.isdir(kin_dir):
        return
    pattern = os.path.join(kin_dir, "*_LSTM_filt_*.mot")
    for f in glob.glob(pattern):
        # Détecte le double suffixe : _filt_butterworth_LSTM_filt_butterworth
        new_name = re.sub(r'(_filt_\w+_LSTM)_filt_\w+\.mot$', r'\1.mot', f)
        if new_name != f and not os.path.exists(new_name):
            os.rename(f, new_name)
            print(f"[RUNNER] .mot renommé : {os.path.basename(new_name)}", flush=True)

if __name__ == "__main__":
    main()
