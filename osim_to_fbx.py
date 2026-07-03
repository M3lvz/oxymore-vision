#!/usr/bin/env python3
"""
osim_to_fbx.py
==============
Convertit un resultat OpenSim (.osim + .mot) en FBX, pret a importer dans
Unity / Unreal / Maya / 3ds Max / MotionBuilder.

Principe
--------
Reutilise exactement la meme forward kinematics que osim_to_bvh.py (FK
exacte rejouee via la lib `opensim`, voir ce fichier pour le detail du
mapping squelette). Le resultat est d'abord ecrit dans un .bvh temporaire
(`convert_osim_to_bvh`), puis converti en .fbx via Blender en mode headless
(`bpy.ops.import_anim.bvh` + `bpy.ops.export_scene.fbx`).

Pourquoi passer par Blender plutot qu'ecrire le FBX a la main : le format
FBX binaire est complexe (structures internes versionnees, flags
d'animation peu documentes) ; Blender expose un export FBX robuste et deja
valide par l'ecosysteme.

Prerequis
---------
Blender doit etre installe. Le script le detecte automatiquement (PATH,
variable d'environnement BLENDER_PATH, ou installation standard dans
"C:\\Program Files\\Blender Foundation\\Blender *\\blender.exe"). Sinon,
indiquer le chemin via --blender.

Usage
-----
    python osim_to_fbx.py
    python osim_to_fbx.py model.osim motion.mot out.fbx --scale 100
    python osim_to_fbx.py --blender "C:\\chemin\\vers\\blender.exe" ...
"""

import argparse
import glob
import os
import shutil
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from osim_to_bvh import convert_osim_to_bvh, _auto_find, osim  # noqa: E402


# =============================================================================
# Detection de Blender
# =============================================================================
def find_blender(blender_arg=None):
    """Cherche blender.exe : argument explicite, variable d'environnement
    BLENDER_PATH, PATH, puis installations standard sous Program Files.
    Retourne le chemin trouve ou None."""
    candidates = []
    if blender_arg:
        candidates.append(blender_arg)
    env = os.environ.get("BLENDER_PATH")
    if env:
        candidates.append(env)
    which = shutil.which("blender")
    if which:
        candidates.append(which)
    candidates += sorted(
        glob.glob(r"C:\Program Files\Blender Foundation\Blender */blender.exe"),
        reverse=True,
    )
    for c in candidates:
        if c and os.path.isfile(c):
            return c
    return None


# =============================================================================
# Script Blender (execute en headless via --python)
# =============================================================================
_BLENDER_SCRIPT = r"""
import sys
import bpy

argv = sys.argv[sys.argv.index("--") + 1:]
bvh_path, fbx_path = argv[0], argv[1]

bpy.ops.wm.read_factory_settings(use_empty=True)

bpy.ops.import_anim.bvh(
    filepath=bvh_path,
    axis_forward='-Z', axis_up='Y',
    target='ARMATURE', global_scale=1.0,
    use_fps_scale=False, update_scene_fps=True,
    use_cyclic=False, rotate_mode='NATIVE',
)

# Aligne la plage de frames de la scene sur l'animation importee : par
# defaut Blender va de 1 a 250, ce qui bakerait ~107 frames de pose figee
# en trop a la fin de l'export FBX.
armature = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
frame_start, frame_end = armature.animation_data.action.frame_range
bpy.context.scene.frame_start = int(frame_start)
bpy.context.scene.frame_end = int(frame_end)

bpy.ops.export_scene.fbx(
    filepath=fbx_path,
    use_selection=False,
    object_types={'ARMATURE'},
    bake_anim=True,
    bake_anim_use_all_bones=True,
    bake_anim_use_nla_strips=False,
    bake_anim_use_all_actions=False,
    bake_anim_force_startend_keying=True,
    add_leaf_bones=False,
    primary_bone_axis='Y',
    secondary_bone_axis='X',
    armature_nodetype='NULL',
    apply_scale_options='FBX_SCALE_ALL',
    axis_forward='-Z', axis_up='Y',
)

print(f"[blender] FBX ecrit : {fbx_path}")
"""


def convert_bvh_to_fbx(input_bvh, output_fbx, blender_exe=None):
    """Convertit un .bvh en .fbx via Blender headless. Leve RuntimeError si
    Blender est introuvable ou si l'export echoue."""
    blender_exe = blender_exe or find_blender()
    if not blender_exe:
        raise RuntimeError(
            "Blender introuvable. Installez Blender, ou indiquez son chemin "
            "via --blender ou la variable d'environnement BLENDER_PATH."
        )

    fd, script_path = tempfile.mkstemp(suffix=".py")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(_BLENDER_SCRIPT)

        cmd = [
            blender_exe, "--background", "--factory-startup", "--python",
            script_path, "--",
            os.path.abspath(input_bvh), os.path.abspath(output_fbx),
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.stdout:
            print(result.stdout, end="")
        if result.returncode != 0 or not os.path.isfile(output_fbx):
            if result.stderr:
                print(result.stderr, end="")
            raise RuntimeError(
                f"Echec de l'export FBX via Blender (code {result.returncode})."
            )
    finally:
        try:
            os.remove(script_path)
        except OSError:
            pass


def convert_osim_to_fbx(input_osim, input_mot, output_fbx, *,
                         scale=1.0, despike_thr=35.0, despike_win=4,
                         despike_gap=30, apose_deg=0.0,
                         blender_exe=None, keep_bvh=False):
    """Convertit un .osim + .mot en .fbx (FK exacte -> BVH intermediaire ->
    Blender headless). Retourne (frame_rate, n_frames).
    Leve RuntimeError si le modele est incompatible ou si Blender echoue."""
    if keep_bvh:
        bvh_path = os.path.splitext(output_fbx)[0] + ".bvh"
        tmp_fd = None
    else:
        tmp_fd, bvh_path = tempfile.mkstemp(suffix=".bvh")
        os.close(tmp_fd)

    try:
        frame_rate, n_frames = convert_osim_to_bvh(
            input_osim, input_mot, bvh_path,
            scale=scale, despike_thr=despike_thr, despike_win=despike_win,
            despike_gap=despike_gap, apose_deg=apose_deg,
        )
        print(f"[BVH] intermediaire -> {bvh_path}")

        convert_bvh_to_fbx(bvh_path, output_fbx, blender_exe=blender_exe)
        print(f"[FBX] -> {output_fbx}")
    finally:
        if not keep_bvh:
            try:
                os.remove(bvh_path)
            except OSError:
                pass

    return frame_rate, n_frames


def main():
    ap = argparse.ArgumentParser(
        description="OpenSim (.osim + .mot) -> FBX (FK exacte, via BVH + Blender headless)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Echelle:
  --scale 1     metres (DEFAUT)
  --scale 100   metres -> centimetres (convention de nombreux moteurs/FBX)

Blender:
  Detecte automatiquement (PATH, variable BLENDER_PATH, ou installation
  standard sous "Program Files\\Blender Foundation\\"). Sinon utiliser
  --blender "C:\\chemin\\vers\\blender.exe".
""",
    )
    ap.add_argument("input_osim", nargs="?")
    ap.add_argument("input_mot",  nargs="?")
    ap.add_argument("output_fbx", nargs="?")
    ap.add_argument("--scale", type=float, default=1.0)
    ap.add_argument("--despike-thr", type=float, default=35.0,
                    help="seuil deg/frame de correction des pops IK (0 = desactive)")
    ap.add_argument("--despike-win", type=int, default=4,
                    help="demi-fenetre de lissage autour d'un pop detecte")
    ap.add_argument("--despike-gap", type=int, default=30,
                    help="ecart max (frames) pour ponter une zone entre 2 flips")
    ap.add_argument("--apose-deg", type=float, default=0.0,
                    help="incline les bras de N deg vers le bas (A-pose) ; "
                         "0 = T-pose. Pour matcher un perso cible en A-pose.")
    ap.add_argument("--blender", default=None,
                    help="chemin vers blender.exe (sinon auto-detecte)")
    ap.add_argument("--keep-bvh", action="store_true",
                    help="conserve le .bvh intermediaire a cote du .fbx")
    args = ap.parse_args()

    if osim is None:
        print("[ERREUR] La lib 'opensim' est introuvable. Lancez ce script avec "
              "le Python du venv MoCap (ou installez opensim).")
        sys.exit(2)

    search_dirs = ["kinematics", "."]
    if args.input_osim is None:
        args.input_osim = _auto_find(search_dirs, ".osim")
        if args.input_osim is None:
            ap.error("Aucun .osim trouve dans ./kinematics/ ou ./")
        print(f"[Auto] .osim : {args.input_osim}")
    if args.input_mot is None:
        args.input_mot = _auto_find(search_dirs, ".mot")
        if args.input_mot is None:
            ap.error("Aucun .mot trouve dans ./kinematics/ ou ./")
        print(f"[Auto] .mot  : {args.input_mot}")
    for path in (args.input_osim, args.input_mot):
        if not os.path.isfile(path):
            ap.error(f"Fichier introuvable : {path}")
    if args.output_fbx is None:
        args.output_fbx = os.path.splitext(args.input_mot)[0] + ".fbx"

    print("\n" + "=" * 58)
    print("  OpenSim FK -> FBX  (via BVH + Blender headless)")
    print("=" * 58)
    print(f"  .osim   : {args.input_osim}")
    print(f"  .mot    : {args.input_mot}")
    print(f"  Sortie  : {args.output_fbx}")
    print(f"  Echelle : x{args.scale}")
    print("=" * 58 + "\n")

    try:
        convert_osim_to_fbx(
            args.input_osim, args.input_mot, args.output_fbx,
            scale=args.scale, despike_thr=args.despike_thr,
            despike_win=args.despike_win, despike_gap=args.despike_gap,
            apose_deg=args.apose_deg, blender_exe=args.blender,
            keep_bvh=args.keep_bvh,
        )
    except RuntimeError as e:
        print(f"[ERREUR] {e}")
        sys.exit(1)

    print("\nOK Termine.")


if __name__ == "__main__":
    main()
