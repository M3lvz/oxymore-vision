#!/usr/bin/env python3
"""
pose2sim_to_bvh.py
==================
Convertit un TRC Pose2Sim en BVH Y-up importable directement dans Blender.

Algorithme:
  - Detection/conversion automatique des axes vers Y-up (conforme a Blender).
  - Joints du tronc (Hips, Spine, Thorax, Neck, Ankles): DCM construite a partir
    d'axes anatomiques (methode KevinLTT/video2bvh).
  - Joints des membres (epaules, coudes, hanches, genoux): rotation de swing
    (shortest-arc), robuste meme quand le membre est tendu (cas ou video2bvh
    devient singulier car cross-product nul).
  - Sortie: position racine + ZXY Euler par joint, comme un BVH standard.

Usage:
    python pose2sim_to_bvh.py
    python pose2sim_to_bvh.py pose-3d/Orange.trc out.bvh --scale 100
"""

import argparse
import glob
import os
import sys

import numpy as np

try:
    from scipy.spatial.transform import Rotation as R_SCIPY
except ImportError:
    R_SCIPY = None


# =============================================================================
# MATH 3D (matrices de rotation)
# =============================================================================
def _normalize(v):
    n = float(np.linalg.norm(v))
    return np.asarray(v, float) / n if n > 1e-12 else np.zeros(3)


def axis_angle_matrix(axis, angle):
    """Rodrigues' rotation formula."""
    x, y, z = axis
    c = np.cos(angle)
    s = np.sin(angle)
    C = 1.0 - c
    return np.array([
        [c + x * x * C,     x * y * C - z * s, x * z * C + y * s],
        [y * x * C + z * s, c + y * y * C,     y * z * C - x * s],
        [z * x * C - y * s, z * y * C + x * s, c + z * z * C],
    ])


def swing_matrix(rest_dir, current_dir):
    """Shortest-arc rotation matrix mapping rest_dir onto current_dir."""
    a = _normalize(rest_dir)
    b = _normalize(current_dir)
    if not (np.any(a) and np.any(b)):
        return np.eye(3)
    dot = float(np.clip(np.dot(a, b), -1.0, 1.0))
    if dot > 0.999999:
        return np.eye(3)
    if dot < -0.999999:
        axis = np.cross(a, np.array([1.0, 0.0, 0.0]))
        if np.linalg.norm(axis) < 1e-6:
            axis = np.cross(a, np.array([0.0, 1.0, 0.0]))
        return axis_angle_matrix(_normalize(axis), np.pi)
    axis = _normalize(np.cross(a, b))
    return axis_angle_matrix(axis, np.arccos(dot))


def _fallback_perpendicular(primary, preferred=None):
    """Return a stable unit vector perpendicular to primary."""
    primary = _normalize(primary)
    if preferred is not None:
        preferred = np.asarray(preferred, float)
        preferred = preferred - np.dot(preferred, primary) * primary
        preferred = _normalize(preferred)
        if np.any(preferred):
            return preferred

    candidates = np.eye(3)
    seed = candidates[int(np.argmin(np.abs(candidates @ primary)))]
    return _normalize(seed - np.dot(seed, primary) * primary)


def axes_to_matrix(x_dir, y_dir, z_dir, order, fallback=None):
    """Construit une matrice de rotation R (colonnes = axes locaux dans le monde).

    Deux des trois directions sont fournies; la troisieme est derivee par
    produit vectoriel. `order` indique l'ordre d'orthogonalisation:
    order[0] est l'axe primaire pris tel quel (normalise), puis order[1] et
    order[2] sont reorthogonalises.

    Convention identique a KevinLTT/video2bvh `dcm_from_axis`, mais la matrice
    de sortie a les axes en COLONNES (R = local->world), ce qui correspond aux
    conventions standards en CG.
    """
    assert order in ('xyz', 'xzy', 'yxz', 'yzx', 'zxy', 'zyx')
    axis = {'x': x_dir, 'y': y_dir, 'z': z_dir}
    name = ['x', 'y', 'z']
    i1 = name.index(order[1])
    i2 = name.index(order[2])
    fallback_axis = {}
    if fallback is not None:
        fallback_axis = {'x': fallback[:, 0], 'y': fallback[:, 1], 'z': fallback[:, 2]}

    primary_name = order[0]
    axis[primary_name] = _normalize(np.asarray(axis[primary_name], float))
    if not np.any(axis[primary_name]):
        axis[primary_name] = _normalize(fallback_axis.get(primary_name, [0, 1, 0]))

    c1 = np.cross(axis[name[(i1 + 1) % 3]], axis[name[(i1 + 2) % 3]])
    if np.linalg.norm(c1) < 1e-4 and fallback is not None:
        return fallback.copy()
    axis[order[1]] = _normalize(c1)
    if not np.any(axis[order[1]]):
        axis[order[1]] = _fallback_perpendicular(
            axis[primary_name], fallback_axis.get(order[1])
        )

    c2 = np.cross(axis[name[(i2 + 1) % 3]], axis[name[(i2 + 2) % 3]])
    if np.linalg.norm(c2) < 1e-4 and fallback is not None:
        return fallback.copy()
    axis[order[2]] = _normalize(c2)
    if not np.any(axis[order[2]]):
        axis[order[2]] = _fallback_perpendicular(
            axis[primary_name], fallback_axis.get(order[2])
        )

    return _proper(np.column_stack([axis['x'], axis['y'], axis['z']]))


def _proper(R):
    """Project to nearest proper rotation (det=+1)."""
    U, _, Vt = np.linalg.svd(R)
    d = np.sign(np.linalg.det(U @ Vt))
    if d == 0:
        d = 1.0
    return U @ np.diag([1.0, 1.0, d]) @ Vt


def matrix_to_euler_zxy(R):
    """Extract intrinsic Z-X-Y Euler angles (degrees) from R = Rz Rx Ry."""
    R = _proper(R)
    if R_SCIPY is not None:
        return R_SCIPY.from_matrix(R).as_euler("zxy", degrees=True)

    sx = float(np.clip(R[2, 1], -1.0 + 1e-7, 1.0 - 1e-7))
    x = np.arcsin(sx)
    if abs(np.cos(x)) > 1e-6:
        z = np.arctan2(-R[0, 1], R[1, 1])
        y = np.arctan2(-R[2, 0], R[2, 2])
    else:
        z = np.arctan2(R[1, 0], R[0, 0])
        y = 0.0
    return np.degrees([z, x, y])


def unwrap_eulers(eulers):
    """Keep Euler channels temporally continuous across +/-180 degree cuts."""
    out = {}
    for joint, angles in eulers.items():
        out[joint] = np.degrees(np.unwrap(np.radians(angles), axis=0))
    return out


# =============================================================================
# SKELETON  (Y-up, +X = cote droit du sujet en T-pose, +Z = avant)
# =============================================================================
ROOT = "Hips"

CHILDREN = {
    "Hips":          ["RightUpLeg", "LeftUpLeg", "Spine"],
    "RightUpLeg":    ["RightLeg"],
    "RightLeg":      ["RightFoot"],
    "RightFoot":     ["RightToeBase"],
    "RightToeBase":  [],
    "LeftUpLeg":     ["LeftLeg"],
    "LeftLeg":       ["LeftFoot"],
    "LeftFoot":      ["LeftToeBase"],
    "LeftToeBase":   [],
    "Spine":         ["Spine1"],
    "Spine1":        ["Neck", "RightShoulder", "LeftShoulder"],
    "Neck":          ["Head"],
    "Head":          [],
    "RightShoulder": ["RightForeArm"],
    "RightForeArm":  ["RightHand"],
    "RightHand":     [],
    "LeftShoulder":  ["LeftForeArm"],
    "LeftForeArm":   ["LeftHand"],
    "LeftHand":      [],
}
PARENT = {ROOT: None}
for _p, _ch in CHILDREN.items():
    for _c in _ch:
        PARENT[_c] = _p


# Marker source pour la position de chaque joint (rempli dans build_joint_positions).
# T-pose direction (parent -> joint) en Y-up. Sera normalise puis multiplie par
# la longueur de l'os pour donner l'OFFSET BVH.
TPOSE_DIR = {
    "Hips":          [0, 0, 0],
    "RightUpLeg":    [1, 0, 0],
    "RightLeg":      [0, -1, 0],
    "RightFoot":     [0, -1, 0],
    "RightToeBase":  [0, -0.15, 1.0],
    "LeftUpLeg":     [-1, 0, 0],
    "LeftLeg":       [0, -1, 0],
    "LeftFoot":      [0, -1, 0],
    "LeftToeBase":   [0, -0.15, 1.0],
    "Spine":         [0, 1, 0],
    "Spine1":        [0, 1, 0],
    "Neck":          [0, 1, 0],
    "Head":          [0, 1, 0],
    "RightShoulder": [1, 0, 0],
    "RightForeArm":  [1, 0, 0],
    "RightHand":     [1, 0, 0],
    "LeftShoulder":  [-1, 0, 0],
    "LeftForeArm":   [-1, 0, 0],
    "LeftHand":      [-1, 0, 0],
}

# Direction de l'End Site pour chaque feuille.
LEAF_END_DIR = {
    "RightToeBase":  [0, 0, 1],
    "LeftToeBase":   [0, 0, 1],
    "Head":          [0, 1, 0],
    "RightHand":     [1, 0, 0],
    "LeftHand":      [-1, 0, 0],
}


JOINT_ORDER = []


def _dfs(joint):
    JOINT_ORDER.append(joint)
    for child in CHILDREN[joint]:
        _dfs(child)


_dfs(ROOT)


# =============================================================================
# REGLES DE ROTATION PAR JOINT
# Mode "dcm": construit une matrice de rotation a partir de directions anatomiques
#   reliables (Hips, Spine, Spine1/Thorax, Neck, Ankles).
# Mode "swing": rotation shortest-arc qui aligne la direction de l'os au repos
#   sur sa direction actuelle. Pas de twist. Utilise pour les membres car
#   robuste meme quand le membre est tendu.
# Mode "copy_parent": le joint herite de la rotation monde du parent (pieds
#   sans os enfants utiles, mains, tete: End Site).
#
# La paire (a, b) signifie "vecteur p[a] - p[b]".
JOINT_RULES = {
    "Hips":          {"mode": "dcm",
                       "x_pair": ("RightUpLeg", "LeftUpLeg"),
                       "y_pair": ("Spine", "Hips"),
                       "order": "yzx"},
    "Spine":         {"mode": "dcm",
                       "x_pairs": [(("RightUpLeg", "LeftUpLeg"), 0.5),
                                   (("RightShoulder", "LeftShoulder"), 0.5)],
                       "y_pair": ("Spine1", "Spine"),
                       "order": "yzx"},
    "Spine1":        {"mode": "dcm",
                       "x_pair": ("RightShoulder", "LeftShoulder"),
                       "y_pair": ("Neck", "Spine1"),
                       "order": "yzx"},
    "Neck":          {"mode": "dcm",
                       "x_pair": ("RightShoulder", "LeftShoulder"),
                       "y_pair": ("Head", "Neck"),
                       "order": "yzx"},
    "Head":          {"mode": "dcm",
                       "y_pair": ("Head", "Neck"),
                       "z_pair": ("Nose", "Head"),
                       "order": "yxz"},

    "RightUpLeg":    {"mode": "swing", "child": "RightLeg"},
    "RightLeg":      {"mode": "swing", "child": "RightFoot"},
    "RightFoot":     {"mode": "swing", "child": "RightToeBase"},
    "RightToeBase":  {"mode": "copy_parent"},

    "LeftUpLeg":     {"mode": "swing", "child": "LeftLeg"},
    "LeftLeg":       {"mode": "swing", "child": "LeftFoot"},
    "LeftFoot":      {"mode": "swing", "child": "LeftToeBase"},
    "LeftToeBase":   {"mode": "copy_parent"},

    "RightShoulder": {"mode": "swing", "child": "RightForeArm"},
    "RightForeArm":  {"mode": "swing", "child": "RightHand"},
    "RightHand":     {"mode": "copy_parent"},

    "LeftShoulder":  {"mode": "swing", "child": "LeftForeArm"},
    "LeftForeArm":   {"mode": "swing", "child": "LeftHand"},
    "LeftHand":      {"mode": "copy_parent"},
}


# =============================================================================
# LECTURE TRC
# =============================================================================
def ensure_bvh_yup(positions):
    """Return positions in BVH Y-up coordinates.

    Depending on the Pose2Sim/OpenSim pipeline, the vertical coordinate can be
    either Y or Z. Detect it from the marker spread: the body is much taller
    vertically than it is wide or deep. If the file is already Y-up, keep it.
    If it is Z-up, map:
      TRC X -> BVH X
      TRC Z -> BVH Y
      TRC Y -> BVH -Z
    The minus sign keeps a right-handed frame: right x up = forward.
    """
    finite = np.where(np.isfinite(positions), positions, np.nan)
    spans = np.nanpercentile(finite, 95, axis=(0, 1)) - np.nanpercentile(
        finite, 5, axis=(0, 1)
    )
    up_axis = int(np.nanargmax(spans))
    if up_axis == 1:
        return positions, "Y-up"
    if up_axis != 2:
        return positions, f"axe vertical incertain ({'XYZ'[up_axis]}), conserve"

    converted = positions.copy()
    converted[..., 0] = positions[..., 0]
    converted[..., 1] = positions[..., 2]
    converted[..., 2] = -positions[..., 1]
    return converted, "Z-up -> Y-up"


def read_trc(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        raw = f.readlines()
    meta = raw[2].strip().split("\t")
    frame_rate = float(meta[0])
    n_markers = int(meta[3])
    units = meta[4].strip() if len(meta) > 4 else "m"

    hdr = raw[3].strip().split("\t")
    marker_names = []
    i = 2
    while i < len(hdr):
        name = hdr[i].strip()
        if name:
            marker_names.append(name)
        i += 3

    rows = []
    for line in raw[5:]:
        line = line.strip()
        if not line:
            continue
        cols = line.split("\t")
        if len(cols) < 2 + n_markers * 3:
            continue
        try:
            int(cols[0])
            float(cols[1])
        except ValueError:
            continue
        nums = []
        for value in cols[2: 2 + n_markers * 3]:
            try:
                nums.append(float(value))
            except ValueError:
                nums.append(float("nan"))
        rows.append(nums)

    positions = np.array(rows, float).reshape(len(rows), n_markers, 3)
    positions, axes_note = ensure_bvh_yup(positions)
    print(f"[TRC] {len(marker_names)} marqueurs | {len(rows)} frames | "
          f"{frame_rate:g} fps | {units} | axes {axes_note}")
    return marker_names, positions, frame_rate, units


# =============================================================================
# CONSTRUCTION DES POSITIONS DE JOINTS (Y-up direct)
# =============================================================================
def _marker_key(name):
    return "".join(ch.lower() for ch in name if ch.isalnum())


def _get_marker(marker_names, positions, *names):
    normalized = {_marker_key(name): i for i, name in enumerate(marker_names)}
    for name in names:
        if name in marker_names:
            return positions[:, marker_names.index(name), :]
        key = _marker_key(name)
        if key in normalized:
            return positions[:, normalized[key], :]
    return None


def _avg_markers(marker_names, positions, *names):
    vals = [_get_marker(marker_names, positions, n) for n in names]
    vals = [v for v in vals if v is not None]
    if not vals:
        return None
    return np.nanmean(np.stack(vals, axis=0), axis=0)


def _require(name, value):
    if value is None:
        raise ValueError(f"Marqueur indispensable absent pour {name}")
    return value


def build_joint_positions(marker_names, positions):
    rhip = _get_marker(marker_names, positions, "RHJC_study", "RHip", "R_Hip", "RightHip")
    lhip = _get_marker(marker_names, positions, "LHJC_study", "LHip", "L_Hip", "LeftHip")
    hip_marker = _get_marker(marker_names, positions, "Hip", "MidHip", "Pelvis")
    rknee = _avg_markers(marker_names, positions, "r_knee_study", "r_mknee_study")
    lknee = _avg_markers(marker_names, positions, "L_knee_study", "L_mknee_study")
    rknee = rknee if rknee is not None else _get_marker(marker_names, positions, "RKnee", "R_Knee", "RightKnee")
    lknee = lknee if lknee is not None else _get_marker(marker_names, positions, "LKnee", "L_Knee", "LeftKnee")
    rankle = _avg_markers(marker_names, positions, "r_ankle_study", "r_mankle_study")
    lankle = _avg_markers(marker_names, positions, "L_ankle_study", "L_mankle_study")
    rankle = rankle if rankle is not None else _get_marker(marker_names, positions, "RAnkle", "R_Ankle", "RightAnkle")
    lankle = lankle if lankle is not None else _get_marker(marker_names, positions, "LAnkle", "L_Ankle", "LeftAnkle")
    rtoe = _avg_markers(marker_names, positions, "r_toe_study", "r_5meta_study")
    ltoe = _avg_markers(marker_names, positions, "L_toe_study", "L_5meta_study")
    rtoe = rtoe if rtoe is not None else _avg_markers(marker_names, positions, "RBigToe", "RSmallToe", "R_BigToe", "R_SmallToe", "RightBigToe", "RightSmallToe")
    ltoe = ltoe if ltoe is not None else _avg_markers(marker_names, positions, "LBigToe", "LSmallToe", "L_BigToe", "L_SmallToe", "LeftBigToe", "LeftSmallToe")

    neck = _get_marker(marker_names, positions, "C7_study", "Neck", "C7")
    head = _get_marker(marker_names, positions, "Head", "HeadTop")
    nose = _get_marker(marker_names, positions, "Nose")

    rsh = _get_marker(marker_names, positions, "r_shoulder_study", "RShoulder", "R_Shoulder", "RightShoulder")
    lsh = _get_marker(marker_names, positions, "L_shoulder_study", "LShoulder", "L_Shoulder", "LeftShoulder")
    rel = _avg_markers(marker_names, positions, "r_lelbow_study", "r_melbow_study")
    lel = _avg_markers(marker_names, positions, "L_lelbow_study", "L_melbow_study")
    rel = rel if rel is not None else _get_marker(marker_names, positions, "RElbow", "R_Elbow", "RightElbow")
    lel = lel if lel is not None else _get_marker(marker_names, positions, "LElbow", "L_Elbow", "LeftElbow")
    rwr = _avg_markers(marker_names, positions, "r_lwrist_study", "r_mwrist_study")
    lwr = _avg_markers(marker_names, positions, "L_lwrist_study", "L_mwrist_study")
    rwr = rwr if rwr is not None else _get_marker(marker_names, positions, "RWrist", "R_Wrist", "RightWrist")
    lwr = lwr if lwr is not None else _get_marker(marker_names, positions, "LWrist", "L_Wrist", "LeftWrist")

    rhip = _require("RightUpLeg", rhip)
    lhip = _require("LeftUpLeg", lhip)
    hip = hip_marker if hip_marker is not None else (rhip + lhip) * 0.5
    rankle = _require("RightFoot", rankle)
    lankle = _require("LeftFoot", lankle)
    if rtoe is None:
        rtoe = rankle + np.array([0.0, 0.0, 0.12])
        print("[WARN] Marqueurs d'orteils droits absents: fallback cheville +Z 12 cm")
    if ltoe is None:
        ltoe = lankle + np.array([0.0, 0.0, 0.12])
        print("[WARN] Marqueurs d'orteils gauches absents: fallback cheville +Z 12 cm")
    neck = _require("Neck", neck)
    if head is None and nose is not None:
        head = neck + (nose - neck) * 1.2
    head = _require("Head", head)
    if nose is None:
        nose = head + np.array([0.0, 0.0, 0.12])
        print("[WARN] Marqueur Nose absent: orientation de tete degradee")

    spine = hip + (neck - hip) * 0.45
    spine1 = hip + (neck - hip) * 0.88

    return {
        "Hips": hip,
        "RightUpLeg": rhip,
        "RightLeg": _require("RightLeg", rknee),
        "RightFoot": rankle,
        "RightToeBase": rtoe,
        "LeftUpLeg": lhip,
        "LeftLeg": _require("LeftLeg", lknee),
        "LeftFoot": lankle,
        "LeftToeBase": ltoe,
        "Spine": spine,
        "Spine1": spine1,
        "Neck": neck,
        "Head": head,
        "Nose": nose,
        "RightShoulder": _require("RightShoulder", rsh),
        "RightForeArm": _require("RightForeArm", rel),
        "RightHand": _require("RightHand", rwr),
        "LeftShoulder": _require("LeftShoulder", lsh),
        "LeftForeArm": _require("LeftForeArm", lel),
        "LeftHand": _require("LeftHand", lwr),
    }


def _fill_nan_series(values):
    """Linearly fill NaNs in a 1D series, keeping all-NaN series unchanged."""
    values = np.asarray(values, float).copy()
    idx = np.arange(len(values))
    ok = np.isfinite(values)
    if ok.all() or not ok.any():
        return values
    values[~ok] = np.interp(idx[~ok], idx[ok], values[ok])
    return values


def smooth_joint_positions(joint_pos, window=5, passes=1):
    """Apply a light temporal low-pass filter to reduce BVH jitter.

    Pose2Sim triangulation is accurate, but small marker noise turns into noisy
    Euler angles. Keep this conservative for sharp actions; increase window or
    passes only when the source data visibly jitters.
    """
    window = int(window)
    if window <= 1:
        return joint_pos
    if window % 2 == 0:
        window += 1

    kernel = np.ones(window, dtype=float) / float(window)
    pad = window // 2
    smoothed = {}
    for joint, data in joint_pos.items():
        out = np.asarray(data, float).copy()
        for _ in range(max(1, int(passes))):
            next_out = out.copy()
            for axis in range(3):
                series = _fill_nan_series(out[:, axis])
                if not np.isfinite(series).any():
                    continue
                padded = np.pad(series, (pad, pad), mode="edge")
                next_out[:, axis] = np.convolve(padded, kernel, mode="valid")
            out = next_out
        smoothed[joint] = out
    return smoothed


def align_to_tpose_convention(joint_pos):
    """Aligne la convention du TRC sur la T-pose (right=+X, up=+Y, forward=+Z).

    Pose2Sim peut sortir des coordonnees ou la combinaison
    (right=+X, up=+Y, forward=-Z) viole le right-hand rule attendu par notre
    construction DCM. Sans correction, cela injecte un offset constant ~180 deg
    sur les joints qui s'appuient sur la direction forward (chevilles, pieds),
    et provoque des sauts visibles au playback Blender (gimbal lock / euler
    discontinuities).

    Etape 1 — orientation: on mesure le right (RUL-LUL) et le forward (toe-foot
    moyennes), tous deux projetes horizontalement.
    Etape 2 — handedness: si cross(right, up) != forward, on reflechit l'axe Z
    pour retablir un repere droit.
    Etape 3 — rotation: rotation autour de Y pour ramener right -> +X.
    """
    right = np.nanmean(joint_pos["RightUpLeg"] - joint_pos["LeftUpLeg"], axis=0)
    right[1] = 0.0
    right = _normalize(right)
    if not np.any(right):
        right = np.array([1.0, 0.0, 0.0])

    fwd = np.zeros(3)
    for toe, foot in (("RightToeBase", "RightFoot"), ("LeftToeBase", "LeftFoot")):
        fwd += np.nanmean(joint_pos[toe] - joint_pos[foot], axis=0)
    fwd[1] = 0.0
    fwd = _normalize(fwd)
    if not np.any(fwd):
        fwd = np.cross(right, [0.0, 1.0, 0.0])
        fwd = _normalize(fwd)

    # Re-orthogonaliser fwd par rapport a right.
    fwd -= np.dot(fwd, right) * right
    fwd = _normalize(fwd)

    # Handedness: pour right-hand consistent (right x up = forward).
    rh_forward = np.cross(right, [0.0, 1.0, 0.0])
    handedness = float(np.dot(rh_forward, fwd))
    flipped_z = False
    if handedness < 0.0:
        # Refleter Z: (x, y, z) -> (x, y, -z). Ce flip change le signe de fwd
        # autour de l'axe vertical, retablit la coherence.
        joint_pos = {j: p * np.array([1.0, 1.0, -1.0]) for j, p in joint_pos.items()}
        fwd = fwd * np.array([1.0, 1.0, -1.0])
        right = right * np.array([1.0, 1.0, -1.0])
        flipped_z = True

    # Rotation autour de Y pour amener right sur +X.
    angle = -np.arctan2(right[2], right[0])  # signe pour mettre right en +X
    c, s = np.cos(angle), np.sin(angle)
    R = np.array([[c, 0.0, s], [0.0, 1.0, 0.0], [-s, 0.0, c]])
    aligned = {j: p @ R.T for j, p in joint_pos.items()}
    return aligned, np.degrees(angle), flipped_z


# =============================================================================
# OFFSETS BVH
# =============================================================================
def _bone_length(parent_pos, child_pos):
    d = np.linalg.norm(parent_pos - child_pos, axis=1)
    d = d[np.isfinite(d) & (d > 1e-4)]
    return float(np.median(d)) if len(d) else 0.0


def compute_offsets(joint_pos):
    raw = {}
    for joint in JOINT_ORDER:
        parent = PARENT[joint]
        if parent is None:
            continue
        raw[joint] = _bone_length(joint_pos[parent], joint_pos[joint])

    def sym(name):
        """Moyenne L/R pour eviter les os asymetriques qui font glisser le rig."""
        if name.startswith("Right"):
            other = "Left" + name[5:]
        elif name.startswith("Left"):
            other = "Right" + name[4:]
        else:
            return raw.get(name, 0.0)
        a, b = raw.get(name, 0.0), raw.get(other, 0.0)
        if a > 0 and b > 0:
            return (a + b) * 0.5
        return max(a, b)

    # Estimation de la taille du corps pour fournir un fallback en cas de bone
    # extremement court (par ex. clavicule synthetique).
    feet_low = min(
        np.nanmin(joint_pos["RightFoot"][:, 1]),
        np.nanmin(joint_pos["LeftFoot"][:, 1]),
    )
    head_high = np.nanmax(joint_pos["Head"][:, 1])
    body_height = max(0.5, head_high - feet_low)

    offsets = {ROOT: np.zeros(3)}
    for joint in JOINT_ORDER:
        if joint == ROOT:
            continue
        length = sym(joint)
        if length < 1e-4:
            length = body_height * 0.05
        direction = _normalize(TPOSE_DIR[joint])
        if not np.any(direction):
            direction = np.array([0.0, 1.0, 0.0])
        offsets[joint] = direction * length
    return offsets


# =============================================================================
# CALCUL DES ROTATIONS LOCALES PAR JOINT, FRAME PAR FRAME
# =============================================================================
def world_rotation_dcm(p, rule, fallback=None):
    x_dir = None
    y_dir = None
    z_dir = None
    if "x_pair" in rule:
        a, b = rule["x_pair"]
        x_dir = p[a] - p[b]
    if "x_pairs" in rule:
        x_dir = np.zeros(3)
        total = 0.0
        for pair, weight in rule["x_pairs"]:
            a, b = pair
            v = p[a] - p[b]
            if np.all(np.isfinite(v)) and np.linalg.norm(v) > 1e-6:
                x_dir += float(weight) * _normalize(v)
                total += float(weight)
        x_dir = x_dir / total if total > 0 else None
    if "y_pair" in rule:
        a, b = rule["y_pair"]
        y_dir = p[a] - p[b]
    if "z_pair" in rule:
        a, b = rule["z_pair"]
        z_dir = p[a] - p[b]
    return axes_to_matrix(x_dir, y_dir, z_dir, rule["order"], fallback=fallback)


def reference_bone_lengths(joint_pos):
    lengths = {}
    for joint in JOINT_ORDER:
        child = rule_child(joint)
        if child is None or child not in joint_pos:
            continue
        d = np.linalg.norm(joint_pos[child] - joint_pos[joint], axis=1)
        d = d[np.isfinite(d) & (d > 1e-4)]
        if len(d):
            lengths[joint] = float(np.median(d))
    return lengths


def world_rotation_swing(p, joint, parent_world, reference_lengths=None, fallback=None):
    """Rotation monde du joint, construite par swing depuis sa T-pose direction.

    Au repos, la direction de l'os (joint -> child) en coordonnees monde est
    R_parent @ TPOSE_DIR[child]. La rotation locale du joint est le swing qui,
    en coordonnees du parent, amene TPOSE_DIR[child] sur la direction courante
    de l'os (exprimee dans le repere du parent). La rotation monde du joint est
    alors R_parent @ swing_local.
    """
    child = rule_child(joint)
    if child is None:
        return parent_world.copy()
    delta = p[child] - p[joint]
    current_len = float(np.linalg.norm(delta))
    ref_len = (reference_lengths or {}).get(joint)
    if ref_len and (current_len < ref_len * 0.35 or current_len > ref_len * 1.8):
        return fallback.copy() if fallback is not None else parent_world.copy()
    current_world = _normalize(delta)
    if not np.any(current_world):
        return fallback.copy() if fallback is not None else parent_world.copy()
    rest_local = _normalize(TPOSE_DIR[child])
    current_local = parent_world.T @ current_world
    swing_local = swing_matrix(rest_local, current_local)
    return parent_world @ swing_local


def rule_child(joint):
    rule = JOINT_RULES.get(joint, {})
    if "child" in rule:
        return rule["child"]
    children = CHILDREN[joint]
    return children[0] if children else None


def compute_local_eulers(joint_pos):
    n_frames = len(joint_pos[ROOT])
    eulers = {joint: np.zeros((n_frames, 3)) for joint in JOINT_ORDER}
    previous_world = {}
    ref_lengths = reference_bone_lengths(joint_pos)

    for fi in range(n_frames):
        p = {joint: joint_pos[joint][fi] for joint in joint_pos}
        world = {}
        for joint in JOINT_ORDER:
            rule = JOINT_RULES[joint]
            mode = rule["mode"]
            if mode == "dcm":
                R = world_rotation_dcm(p, rule, fallback=previous_world.get(joint))
            elif mode == "swing":
                parent_world = world[PARENT[joint]]
                R = world_rotation_swing(
                    p, joint, parent_world,
                    reference_lengths=ref_lengths,
                    fallback=previous_world.get(joint),
                )
            elif mode == "copy_parent":
                R = world[PARENT[joint]].copy() if PARENT[joint] else np.eye(3)
            else:
                R = np.eye(3)
            world[joint] = R
        previous_world = {joint: world[joint].copy() for joint in JOINT_ORDER}

        for joint in JOINT_ORDER:
            R_world = world[joint]
            if PARENT[joint] is None:
                R_local = R_world
            else:
                R_local = world[PARENT[joint]].T @ R_world
            eulers[joint][fi] = matrix_to_euler_zxy(R_local)
    return unwrap_eulers(eulers)


# =============================================================================
# ECRITURE BVH
# =============================================================================
def end_site_offset(joint, offsets, scale):
    direction = _normalize(LEAF_END_DIR.get(joint, [0, 1, 0]))
    bone_len = float(np.linalg.norm(offsets[joint]))
    end_len = max(0.04, min(0.10, bone_len * 0.4)) * scale
    return direction * end_len


def write_hierarchy(f, joint, offsets, scale, depth=0):
    pad = "\t" * depth
    pad1 = "\t" * (depth + 1)
    pad2 = "\t" * (depth + 2)
    is_root = PARENT[joint] is None
    children = CHILDREN[joint]
    off = offsets[joint] * scale

    f.write(f"{pad}{'ROOT' if is_root else 'JOINT'} {joint}\n")
    f.write(f"{pad}{{\n")
    f.write(f"{pad1}OFFSET {off[0]:.6f} {off[1]:.6f} {off[2]:.6f}\n")
    if is_root:
        f.write(f"{pad1}CHANNELS 6 Xposition Yposition Zposition "
                "Zrotation Xrotation Yrotation\n")
    else:
        f.write(f"{pad1}CHANNELS 3 Zrotation Xrotation Yrotation\n")
    if children:
        for child in children:
            write_hierarchy(f, child, offsets, scale, depth + 1)
    else:
        es = end_site_offset(joint, offsets, scale)
        f.write(f"{pad1}End Site\n{pad1}{{\n")
        f.write(f"{pad2}OFFSET {es[0]:.6f} {es[1]:.6f} {es[2]:.6f}\n")
        f.write(f"{pad1}}}\n")
    f.write(f"{pad}}}\n")


def write_bvh(output_path, joint_pos, frame_rate, scale=100.0):
    offsets = compute_offsets(joint_pos)
    n_frames = len(joint_pos[ROOT])
    frame_time = 1.0 / frame_rate

    print("[BVH] Longueurs des bones (cm):")
    for joint in JOINT_ORDER:
        if joint == ROOT:
            continue
        print(f"  {joint:15s}: {np.linalg.norm(offsets[joint]) * 100:6.1f}")

    print(f"\n[BVH] Calcul des rotations pour {n_frames} frames...")
    eulers = compute_local_eulers(joint_pos)

    motion = []
    for fi in range(n_frames):
        row = []
        root_pos = joint_pos[ROOT][fi] * scale
        row.extend([float(root_pos[0]), float(root_pos[1]), float(root_pos[2])])
        for joint in JOINT_ORDER:
            z, x, y = eulers[joint][fi]
            row.extend([float(z), float(x), float(y)])
        motion.append(row)

    with open(output_path, "w", encoding="ascii") as f:
        f.write("HIERARCHY\n")
        write_hierarchy(f, ROOT, offsets, scale)
        f.write("MOTION\n")
        f.write(f"Frames: {n_frames}\n")
        f.write(f"Frame Time: {frame_time:.8f}\n")
        for row in motion:
            f.write(" ".join(f"{v:.6f}" for v in row) + "\n")

    size_kb = os.path.getsize(output_path) / 1024
    channels = 6 + 3 * (len(JOINT_ORDER) - 1)
    print(f"\n[BVH] -> {output_path} "
          f"({size_kb:.0f} KB, {n_frames} frames, {channels} canaux)")


# =============================================================================
# ENTRY POINT
# =============================================================================
def main():
    ap = argparse.ArgumentParser(
        description="Pose2Sim TRC -> BVH (Y-up, DCM tronc + swing membres)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Echelle:
  --scale 100  metres -> centimetres (BVH classique)
  --smooth 5   lissage temporel leger pour reduire le gresillement
  --smooth-passes 1  augmenter seulement si le TRC tremble beaucoup

Import Blender:
  File > Import > Motion Capture (.bvh)
  Reglages par defaut (Forward=-Z, Up=Y) avec Scale=0.01 si BVH en cm
""",
    )
    ap.add_argument("input_trc", nargs="?")
    ap.add_argument("output_bvh", nargs="?")
    ap.add_argument("--scale", type=float, default=100.0)
    ap.add_argument("--smooth", type=int, default=5,
                    help="fenetre impaire de lissage des marqueurs; 1 = desactive")
    ap.add_argument("--smooth-passes", type=int, default=1,
                    help="nombre de passes du lissage; garder 1 pour préserver les impacts")
    args = ap.parse_args()

    if args.input_trc is None:
        candidates = glob.glob("pose-3d/*.trc") + glob.glob("*.trc")
        if not candidates:
            ap.error("Aucun TRC trouve dans ./pose-3d/ ou ./")
        candidates.sort(key=lambda p: 0 if "LSTM" in p else (1 if "butterworth" in p else 2))
        args.input_trc = candidates[0]
        print(f"[Auto] TRC : {args.input_trc}")
    if not os.path.isfile(args.input_trc):
        ap.error(f"Fichier introuvable : {args.input_trc}")
    if args.output_bvh is None:
        args.output_bvh = os.path.splitext(args.input_trc)[0] + ".bvh"

    print("\n" + "=" * 58)
    print("  Pose2Sim -> BVH  (Y-up, hybride DCM/swing)")
    print("=" * 58)
    print(f"  Entree  : {args.input_trc}")
    print(f"  Sortie  : {args.output_bvh}")
    print(f"  Echelle : x{args.scale}")
    print("=" * 58 + "\n")

    marker_names, positions, frame_rate, _units = read_trc(args.input_trc)
    try:
        joint_pos = build_joint_positions(marker_names, positions)
    except ValueError as exc:
        print(f"[ERREUR] {exc}")
        sys.exit(1)

    if args.smooth > 1:
        joint_pos = smooth_joint_positions(
            joint_pos, window=args.smooth, passes=args.smooth_passes
        )
        print(f"[SMOOTH] lissage temporel applique: fenetre {args.smooth} "
              f"frames, {args.smooth_passes} passe(s)\n")

    joint_pos, y_angle, flipped_z = align_to_tpose_convention(joint_pos)
    flip_str = " + reflexion Z (handedness)" if flipped_z else ""
    print(f"[ALIGN] rotation Y = {y_angle:+.1f} deg{flip_str}  "
          "(right=+X, up=+Y, forward=+Z)\n")

    write_bvh(args.output_bvh, joint_pos, frame_rate, scale=args.scale)
    print("\nOK Termine. Importez dans Blender avec les reglages par defaut.")


if __name__ == "__main__":
    main()
