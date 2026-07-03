#!/usr/bin/env python3
"""
osim_to_bvh.py
==============
Convertit un resultat OpenSim (.osim + .mot) en BVH propre, pret pour le
retargeting Auto-Rig Pro (convention de noms Mixamo).

Difference avec pose2sim_to_bvh.py
----------------------------------
L'ancien convertisseur partait du .trc (positions de marqueurs bruitees) et
RECONSTRUISAIT les rotations (swing/DCM). Il heritait donc du jitter et du
foot-sliding, et avait deux fragilites (unwrap Euler axe-par-axe, somme de
directions DCM degenerable).

Ici on prend le resultat EN AVAL de l'IK : on rejoue la forward kinematics
exacte du modele OpenSim via la lib `opensim`. On lit les transforms MONDE de
chaque body (identiques au viewport Blender via le plugin Pose2Sim), puis on
les reparente vers un squelette BVH. Les rotations ne sont plus reconstruites :
- pas de jitter (la trajectoire articulaire est deja lisse),
- pas de foot-sliding (l'IK a deja resolu le contact au sol),
- plus d'unwrap axe-par-axe (continuite assuree par quaternions).

Principe FK -> BVH
------------------
Pour chaque body on a sa rotation monde R_os(f) et sa position t_os(f).
On definit la rotation monde BVH comme le DELTA depuis la pose de repos:
    W[j](f) = R_os[j](f) . R_os_rest[j]^-1     (=> identite au repos)
La rotation locale BVH (canaux) :
    L[j](f) = W[parent](f)^-1 . W[j](f)         (=> identite au repos)
Les offsets BVH viennent de la pose de repos (pose par defaut du .osim) :
    offset[j] = t_rest[j] - t_rest[parent]
La racine porte en plus la position monde du pelvis.

On verifie facilement que la direction de chaque os BVH reproduit exactement la
direction body->enfant d'OpenSim (pour les joints a offset rigide). Les bodies
non mappes (sacrum, lumbar intermediaires, talus, patella, Abdomen) sont
"fusionnes" automatiquement par le reparentage : le delta cumule se retrouve
dans la rotation locale du joint conserve.

Usage
-----
    python osim_to_bvh.py
    python osim_to_bvh.py model.osim motion.mot out.bvh --scale 100

Import Blender : File > Import > Motion Capture (.bvh), reglages par defaut
(Forward -Z, Up Y), Scale 0.01 si BVH en cm.
"""

import argparse
import glob
import os
import sys

import numpy as np

try:
    import opensim as osim
except ImportError:
    osim = None

try:
    from scipy.spatial.transform import Rotation as R_SCIPY
except ImportError:
    R_SCIPY = None


# =============================================================================
# SQUELETTE BVH CIBLE (convention Mixamo / Auto-Rig Pro)
# =============================================================================
# Chaque entree : (nom_bvh, parent, rot_body, pos_spec)
#   rot_body : body OpenSim dont on prend la rotation monde (canaux du joint).
#              None => connecteur rigide (rotation locale = identite, suit le
#              parent). Sert a inserer une clavicule/un cou la ou OpenSim n'a
#              pas de body dedie.
#   pos_spec : position de repos du joint (uniquement pour les offsets ; la
#              rotation reste donnee par rot_body). Decouple position et
#              rotation, ce qui permet de placer un joint a un endroit
#              anatomique tout en lui donnant la rotation d'un autre body.
#              - str                 : origine du body
#              - [(body, poids), ...]: barycentre pondere d'origines de bodies
#
# Fusions volontaires (Rajagopal full-spine -> squelette anime standard):
#   sacrum (weld)                 -> absorbe dans Hips
#   lumbar5..lumbar1 + torso      -> Spine (bas) / Spine1 (haut, place au thorax)
#   talus                         -> cheville = position talus, rotation calcn
#   patella_r/l, Abdomen          -> ignores
#
# Note proportions : Rajagopal tasse les origines lombaires sur ~10 cm et le
# body "torso" est unique (origine basse, ~L1). On positionne donc Spine1, le
# cou et les clavicules a hauteur d'epaules (barycentre des humerus) pour un
# rest-pose exploitable par ARP, sans changer les rotations (fideles a l'IK).
SKELETON_FULL = [
    # nom            parent          rot_body     pos_spec
    ("Hips",         None,           "pelvis",    "pelvis"),

    # jambe gauche
    ("LeftUpLeg",    "Hips",         "femur_l",   "femur_l"),
    ("LeftLeg",      "LeftUpLeg",    "tibia_l",   "tibia_l"),
    ("LeftFoot",     "LeftLeg",      "calcn_l",   "talus_l"),   # pos=cheville
    ("LeftToeBase",  "LeftFoot",     "toes_l",    "toes_l"),

    # jambe droite
    ("RightUpLeg",   "Hips",         "femur_r",   "femur_r"),
    ("RightLeg",     "RightUpLeg",   "tibia_r",   "tibia_r"),
    ("RightFoot",    "RightLeg",     "calcn_r",   "talus_r"),   # pos=cheville
    ("RightToeBase", "RightFoot",    "toes_r",    "toes_r"),

    # colonne (5 lombaires + torso fusionnes en 2 segments)
    ("Spine",        "Hips",         "lumbar3",   "lumbar3"),
    ("Spine1",       "Spine",        "torso",     [("humerus_l", 0.5),
                                                   ("humerus_r", 0.5)]),

    # cou + tete (OpenSim n'a qu'un joint head_torso : Neck le porte, Head rigide)
    ("Neck",         "Spine1",       "head",      [("humerus_l", 0.25),
                                                   ("humerus_r", 0.25),
                                                   ("head",      0.5)]),
    ("Head",         "Neck",         "head",      "head"),

    # bras gauche (clavicule rigide synthetique -> l'os demarre a l'epaule)
    ("LeftShoulder", "Spine1",       None,        [("humerus_l", 0.75),
                                                   ("humerus_r", 0.25)]),
    ("LeftArm",      "LeftShoulder", "humerus_l", "humerus_l"),
    ("LeftForeArm",  "LeftArm",      "ulna_l",    "ulna_l"),
    ("LeftHand",     "LeftForeArm",  "hand_l",    "hand_l"),

    # bras droit
    ("RightShoulder","Spine1",       None,        [("humerus_r", 0.75),
                                                   ("humerus_l", 0.25)]),
    ("RightArm",     "RightShoulder","humerus_r", "humerus_r"),
    ("RightForeArm", "RightArm",     "ulna_r",    "ulna_r"),
    ("RightHand",    "RightForeArm", "hand_r",    "hand_r"),
]


def _make_simple_skeleton(full):
    """Variante pour les modeles Pose2Sim par defaut (pas de bodies lombaires
    lumbar1..5 : un seul joint dorsal pelvis -> torso, sacrum soude au pelvis).
    Supprime "Spine" (lumbar3) et rattache "Spine1" directement a "Hips"."""
    out = []
    for name, parent, rb, ps in full:
        if name == "Spine":
            continue
        if name == "Spine1":
            parent = "Hips"
        out.append((name, parent, rb, ps))
    return out


SKELETON_SIMPLE = _make_simple_skeleton(SKELETON_FULL)


def _activate_skeleton(skeleton):
    """Bascule les structures globales (ROOT/PARENT/ROT_BODY/POS_SPEC/CHILDREN)
    sur la variante de squelette donnee."""
    global SKELETON, ROOT, PARENT, ROT_BODY, POS_SPEC, CHILDREN
    SKELETON = skeleton
    ROOT     = SKELETON[0][0]
    PARENT   = {name: parent for name, parent, _, _ in SKELETON}
    ROT_BODY = {name: rb     for name, _, rb, _ in SKELETON}
    POS_SPEC = {name: ps     for name, _, _, ps in SKELETON}

    CHILDREN = {name: [] for name, *_ in SKELETON}
    for _name, _parent, _, _ in SKELETON:
        if _parent is not None:
            CHILDREN[_parent].append(_name)


_activate_skeleton(SKELETON_FULL)


def get_joint_order():
    """Ordre DFS du squelette (= ordre des canaux dans le BVH)."""
    order = []

    def _dfs(joint):
        order.append(joint)
        for child in CHILDREN[joint]:
            _dfs(child)

    _dfs(ROOT)
    return order


# Direction de continuation des End Site pour les feuilles (en repere local du
# dernier os, fallback si l'offset est nul).
LEAF_FALLBACK_DIR = {
    "LeftToeBase":  [0.0, 0.0, 1.0],
    "RightToeBase": [0.0, 0.0, 1.0],
    "Head":         [0.0, 1.0, 0.0],
    "LeftHand":     [0.0, 0.0, -1.0],
    "RightHand":    [0.0, 0.0, 1.0],
}


# =============================================================================
# MATH
# =============================================================================
def _normalize(v):
    v = np.asarray(v, float)
    n = float(np.linalg.norm(v))
    return v / n if n > 1e-12 else np.zeros(3)


def matrix_to_euler_zxy_single(R):
    """Z-X-Y Euler intrinseque (degres) d'une matrice unique : R = Rz.Rx.Ry.

    C'est la convention BVH standard pour des canaux "Zrotation Xrotation
    Yrotation" (et celle de l'import Blender). Fallback sans scipy.
    """
    sx = float(np.clip(R[2, 1], -1.0 + 1e-7, 1.0 - 1e-7))
    x = np.arcsin(sx)
    if abs(np.cos(x)) > 1e-6:
        z = np.arctan2(-R[0, 1], R[1, 1])
        y = np.arctan2(-R[2, 0], R[2, 2])
    else:  # gimbal lock
        z = np.arctan2(R[1, 0], R[0, 0])
        y = 0.0
    return np.degrees([z, x, y])


def matrices_to_euler_zxy_continuous(mats):
    """Convertit une serie (n,3,3) de rotations locales en Euler ZXY continu.

    Continuite via quaternions (on supprime les sauts de double-couverture
    +q/-q AVANT la conversion Euler), puis unwrap doux. Remplace l'unwrap
    axe-par-axe de l'ancien script, source de jitter pres du gimbal lock.
    """
    mats = np.asarray(mats, float)
    n = len(mats)
    if R_SCIPY is not None:
        rot = R_SCIPY.from_matrix(mats)
        q = rot.as_quat()                      # (n,4) [x,y,z,w]
        for i in range(1, n):                  # signe continu
            if float(np.dot(q[i], q[i - 1])) < 0.0:
                q[i] = -q[i]
        # 'ZXY' majuscule = intrinseque (R = Rz.Rx.Ry), convention BVH/Blender
        eul = R_SCIPY.from_quat(q).as_euler("ZXY", degrees=True)
    else:
        eul = np.array([matrix_to_euler_zxy_single(m) for m in mats])
    # filet de securite contre les coupures +/-360
    return np.degrees(np.unwrap(np.radians(eul), axis=0))


# =============================================================================
# OPENSIM : CHARGEMENT + FORWARD KINEMATICS
# =============================================================================
def _transform_to_np(T):
    """opensim.Transform -> (R 3x3, t 3)."""
    Rm = T.R()
    tm = T.p()
    R = np.array([[Rm.get(i, j) for j in range(3)] for i in range(3)], float)
    t = np.array([tm.get(0), tm.get(1), tm.get(2)], float)
    return R, t


def load_model(osim_path):
    model = osim.Model(osim_path)
    model.initSystem()
    return model


TRANSLATIONAL_COORDS = {"pelvis_tx", "pelvis_ty", "pelvis_tz"}


def _despike_columns(Q, names, thr_rad, win, isolation=3.0, merge_gap=30):
    """Corrige les pops non-physiques de l'IK dans les colonnes rotationnelles
    de la matrice de coordonnees Q (in-place).

    Detection d'un flip ISOLE :
      |Delta| > thr  ET  |Delta| > isolation * max(|Delta voisins|)
    Le test d'isolation distingue un vrai glitch (vitesse enorme entouree de
    vitesses quasi-nulles) d'un geste rapide soutenu (moulinet) a NE PAS toucher.

    Deux cas de reparation :
      - flip isole seul        -> etale par lissage gaussien local (la marche
                                  devient une rampe continue).
      - >=2 flips rapproches   -> la coordonnee erre dans une zone non-fiable
        (<= merge_gap)            (DOF non-observable, ex. rotation axiale
                                  d'epaule bras tendu au-dessus de la tete) :
                                  on PONTE la zone par interpolation lineaire
                                  entre les valeurs stables d'avant/apres, puis
                                  on arrondit. Evite que l'os "tourne sur
                                  lui-meme" pendant le passage singulier.
    Le reste du mouvement n'est pas touche (fidelite preservee).
    """
    try:
        from scipy.ndimage import gaussian_filter1d

        def _smooth(v):
            return gaussian_filter1d(v, sigma=max(1.0, win / 2.0), mode="nearest")
    except ImportError:
        kernel = np.ones(2 * win + 1) / float(2 * win + 1)

        def _smooth(v):
            return np.convolve(np.pad(v, (win, win), mode="edge"), kernel, "valid")

    repaired = []
    for j, nm in enumerate(names):
        if nm in TRANSLATIONAL_COORDS:
            continue
        v = Q[:, j]
        ad = np.abs(np.diff(v))
        edges = []
        for e in np.where(ad > thr_rad)[0]:
            left  = ad[e - 1] if e - 1 >= 0 else 0.0
            right = ad[e + 1] if e + 1 < len(ad) else 0.0
            if ad[e] > isolation * max(left, right, 1e-9):
                edges.append(int(e))
        if not edges:
            continue

        clusters = [[edges[0]]]
        for e in edges[1:]:
            if e - clusters[-1][-1] <= merge_gap:
                clusters[-1].append(e)
            else:
                clusters.append([e])

        touched = np.zeros(len(v), bool)
        mode = "lisse"
        for cl in clusters:
            if len(cl) >= 2:                      # zone non-fiable -> pontage
                i0 = cl[0]
                i1 = min(cl[-1] + 1, len(v) - 1)
                idx = np.arange(i0 + 1, i1)
                if len(idx):
                    v[idx] = np.interp(idx, [i0, i1], [v[i0], v[i1]])
                touched[i0: i1 + 1] = True
                mode = "pontage"
            else:                                 # flip isole -> lissage local
                e = cl[0]
                touched[max(0, e - win + 1): min(len(v), e + win + 1)] = True

        sm = _smooth(v)                           # arrondit pontages + lisse flips
        v[touched] = sm[touched]
        repaired.append((nm, int(touched.sum()),
                         float(np.degrees(max(ad[e] for cl in clusters for e in cl))),
                         mode))
    return repaired


def run_forward_kinematics(model, mot_path, despike_thr_deg=0.0, despike_win=4,
                           despike_gap=30, progress=True):
    """Rejoue la FK frame par frame.

    despike_thr_deg : si > 0, corrige les sauts de coordonnees > ce seuil
                      (deg/frame) avant la FK (voir _despike_columns).

    Retourne:
      times      : (n,) temps
      R_all,t_all: dict body -> (n,3,3) / (n,3) transforms monde
      R_rest,t_rest: dict body -> (3,3)/(3,) transforms monde pose de repos
    """
    state = model.initSystem()

    # Pose de repos = pose par defaut du modele (coords par defaut, ~ neutre).
    model.realizePosition(state)
    body_set = model.getBodySet()
    bodies = [body_set.get(i).getName() for i in range(body_set.getSize())]
    R_rest, t_rest = {}, {}
    for b in bodies:
        R_rest[b], t_rest[b] = _transform_to_np(
            body_set.get(b).getTransformInGround(state)
        )

    # Lecture du .mot ; conversion degres -> radians (laisse les translations).
    sto = osim.Storage(mot_path)
    if sto.isInDegrees():
        model.getSimbodyEngine().convertDegreesToRadians(sto)
    labels = sto.getColumnLabels()
    label_names = [labels.get(i) for i in range(labels.getSize())]  # [0]="time"

    coord_set = model.updCoordinateSet()
    # coordonnees presentes dans le .mot (index modele + colonne data sans temps)
    present_idx, present_names, present_cols = [], [], []
    for i in range(coord_set.getSize()):
        name = coord_set.get(i).getName()
        if name in label_names:
            present_idx.append(i)
            present_names.append(name)
            present_cols.append(label_names.index(name) - 1)

    n = sto.getSize()
    times = np.zeros(n)

    # Matrice [frames x coords] (radians/metres tels que stockes).
    Q = np.zeros((n, len(present_idx)))
    for fi in range(n):
        sv = sto.getStateVector(fi)
        data = sv.getData()
        times[fi] = sv.getTime()
        for k, col in enumerate(present_cols):
            Q[fi, k] = data.get(col)

    if despike_thr_deg > 0:
        repaired = _despike_columns(Q, present_names, np.radians(despike_thr_deg),
                                    despike_win, merge_gap=despike_gap)
        if repaired:
            print(f"[DESPIKE] seuil {despike_thr_deg:g} deg/frame, "
                  f"{len(repaired)} coordonnee(s) corrigee(s):")
            for nm, cnt, mx, mode in repaired:
                print(f"  {nm:18s} {mode:8s} {cnt} frame(s) (saut max {mx:.0f} deg)")
        else:
            print(f"[DESPIKE] seuil {despike_thr_deg:g} deg/frame : aucun pop detecte")

    R_all = {b: np.zeros((n, 3, 3)) for b in bodies}
    t_all = {b: np.zeros((n, 3)) for b in bodies}
    for fi in range(n):
        for k, i in enumerate(present_idx):
            coord_set.get(i).setValue(state, float(Q[fi, k]), False)
        model.assemble(state)        # satisfait les contraintes (coupler genou...)
        model.realizePosition(state)
        for b in bodies:
            R, t = _transform_to_np(body_set.get(b).getTransformInGround(state))
            R_all[b][fi] = R
            t_all[b][fi] = t
        if progress and (fi % 100 == 0 or fi == n - 1):
            print(f"\r[FK] frame {fi + 1}/{n}", end="", flush=True)
    if progress:
        print()

    return times, R_all, t_all, R_rest, t_rest


# =============================================================================
# CONSTRUCTION BVH
# =============================================================================
def _pos_spec_bodies(spec):
    """Bodies references par un pos_spec (pour la verification du modele)."""
    if isinstance(spec, str):
        return {spec}
    return {body for body, _ in spec}


def _rest_pos(spec, t_rest):
    if isinstance(spec, str):
        return t_rest[spec]
    return sum(w * t_rest[body] for body, w in spec)


def apply_apose(R_rest, t_rest, angle_deg):
    """Bascule la pose de repos des bras de la T-pose vers une A-pose.

    Fait pivoter les chaines de bras (humerus->ulna->radius->hand) autour de
    l'epaule, de `angle_deg` vers le bas, dans le plan frontal (axe X = avant).
    Ne change QUE la reference de repos : l'animation monde reste identique
    (W[j] = R_os[j].R_rest[j]^-1 et les offsets compensent exactement). Sert a
    faire matcher la source a un perso cible en A-pose (retarget ARP plus propre).
    """
    if not angle_deg:
        return R_rest, t_rest

    def _Rx(a):
        c, s = np.cos(a), np.sin(a)
        return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])

    th = np.radians(angle_deg)
    R_rest, t_rest = dict(R_rest), dict(t_rest)
    # bras gauche pointe vers -Z (descend avec -th), droit vers +Z (avec +th)
    chains = [(["humerus_l", "ulna_l", "radius_l", "hand_l"], "humerus_l", _Rx(-th)),
              (["humerus_r", "ulna_r", "radius_r", "hand_r"], "humerus_r", _Rx(+th))]
    for bodies, pivot_name, C in chains:
        if pivot_name not in t_rest:
            continue
        pivot = t_rest[pivot_name]
        for b in bodies:
            if b not in t_rest:
                continue
            t_rest[b] = pivot + C @ (t_rest[b] - pivot)
            R_rest[b] = C @ R_rest[b]
    return R_rest, t_rest


def compute_offsets(t_rest):
    """offset[j] = position de repos du joint - position de repos du parent."""
    offsets = {}
    for joint in get_joint_order():
        parent = PARENT[joint]
        if parent is None:
            offsets[joint] = np.zeros(3)
            continue
        offsets[joint] = _rest_pos(POS_SPEC[joint], t_rest) - _rest_pos(
            POS_SPEC[parent], t_rest
        )
    return offsets


def compute_world_rotations(R_all, R_rest):
    """W[j](f) = R_os[j](f) . R_os_rest[j]^-1, ou suit le parent si rigide."""
    n = len(next(iter(R_all.values())))
    W = {}
    for joint in get_joint_order():  # parents avant enfants (DFS)
        rb = ROT_BODY[joint]
        if rb is None:
            W[joint] = W[PARENT[joint]].copy()
        else:
            W[joint] = R_all[rb] @ R_rest[rb].T   # (n,3,3) @ (3,3)
    return W


def compute_local_eulers(W):
    """L[j](f) = W[parent]^-1 . W[j], puis Euler ZXY continu par joint."""
    eulers = {}
    for joint in get_joint_order():
        parent = PARENT[joint]
        if parent is None:
            L = W[joint]
        else:
            L = W[parent].transpose(0, 2, 1) @ W[joint]
        eulers[joint] = matrices_to_euler_zxy_continuous(L)
    return eulers


# =============================================================================
# ECRITURE BVH  (format identique a pose2sim_to_bvh.py)
# =============================================================================
def end_site_offset(joint, offsets, scale):
    direction = _normalize(offsets[joint])
    if not np.any(direction):
        direction = _normalize(LEAF_FALLBACK_DIR.get(joint, [0, 1, 0]))
    bone_len = float(np.linalg.norm(offsets[joint]))
    end_len = max(0.04, min(0.12, bone_len * 0.5)) * scale
    return direction * end_len


def write_hierarchy(f, joint, offsets, scale, depth=0):
    pad  = "\t" * depth
    pad1 = "\t" * (depth + 1)
    pad2 = "\t" * (depth + 2)
    is_root  = PARENT[joint] is None
    children = CHILDREN[joint]
    off      = offsets[joint] * scale

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


def write_bvh(output_path, offsets, root_positions, eulers, frame_rate, scale):
    joint_order = get_joint_order()
    n_frames    = len(root_positions)
    frame_time  = 1.0 / frame_rate

    print("[BVH] Longueurs des os (cm):")
    for joint in joint_order:
        if joint == ROOT:
            continue
        print(f"  {joint:15s}: {np.linalg.norm(offsets[joint]) * 100:6.1f}")

    motion = []
    for fi in range(n_frames):
        row = [float(v) for v in root_positions[fi] * scale]
        for joint in joint_order:
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

    size_kb  = os.path.getsize(output_path) / 1024
    channels = 6 + 3 * (len(joint_order) - 1)
    print(f"\n[BVH] -> {output_path} "
          f"({size_kb:.0f} KB, {n_frames} frames, {channels} canaux)")


# =============================================================================
# ENTRY POINT
# =============================================================================
def infer_frame_rate(times):
    if len(times) > 1:
        dt = np.diff(times)
        dt = dt[np.isfinite(dt) & (dt > 0)]
        if len(dt):
            return 1.0 / float(np.median(dt))
    return 25.0


def _auto_find(pattern_dirs, ext):
    for d in pattern_dirs:
        hits = sorted(glob.glob(os.path.join(d, f"*{ext}")))
        if hits:
            hits.sort(key=lambda p: 0 if "LSTM" in p else 1)
            return hits[0]
    return None


def convert_osim_to_bvh(input_osim, input_mot, output_bvh, *,
                         scale=1.0, despike_thr=35.0, despike_win=4,
                         despike_gap=30, apose_deg=0.0):
    """Convertit un .osim + .mot en .bvh (FK exacte). Reutilisable depuis
    d'autres scripts (ex. osim_to_fbx.py). Leve RuntimeError si le modele
    n'est pas compatible avec le squelette cible.
    Retourne (frame_rate, n_frames)."""
    if osim is None:
        raise RuntimeError("La lib 'opensim' est introuvable. Lancez ce "
                            "script avec le Python du venv MoCap.")

    model = load_model(input_osim)

    # Choisit la variante de squelette adaptee au modele (avec ou sans
    # bodies lombaires lumbar1..5), puis verifie que tous les bodies
    # references existent bien dans le modele.
    body_set = model.getBodySet()
    available = {body_set.get(i).getName() for i in range(body_set.getSize())}

    if "lumbar3" in available:
        _activate_skeleton(SKELETON_FULL)
    else:
        _activate_skeleton(SKELETON_SIMPLE)
        print("[INFO] Modele sans bodies lombaires intermediaires "
              "(lumbar1..5) -> colonne fusionnee en un seul segment "
              "(Hips -> Spine1 = torso).")

    needed = set()
    for name, _, rb, ps in SKELETON:
        if rb is not None:
            needed.add(rb)
        needed.update(_pos_spec_bodies(ps))
    missing = needed - available
    if missing:
        raise RuntimeError(
            f"Bodies absents du modele : {sorted(missing)}\n"
            f"Bodies disponibles : {sorted(available)}"
        )

    times, R_all, t_all, R_rest, t_rest = run_forward_kinematics(
        model, input_mot,
        despike_thr_deg=despike_thr, despike_win=despike_win,
        despike_gap=despike_gap,
    )
    frame_rate = infer_frame_rate(times)
    print(f"[MOT] {len(times)} frames | {frame_rate:g} fps")

    if apose_deg:
        R_rest, t_rest = apply_apose(R_rest, t_rest, apose_deg)
        print(f"[APOSE] bras inclines de {apose_deg:g} deg (pose de repos)")

    offsets        = compute_offsets(t_rest)
    W              = compute_world_rotations(R_all, R_rest)
    eulers         = compute_local_eulers(W)
    root_positions = t_all[POS_SPEC[ROOT]]   # pelvis monde

    write_bvh(output_bvh, offsets, root_positions, eulers, frame_rate, scale)
    return frame_rate, len(times)


def main():
    ap = argparse.ArgumentParser(
        description="OpenSim (.osim + .mot) -> BVH (FK exacte, noms Mixamo/ARP)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Echelle:
  --scale 1     metres (DEFAUT) -> import Blender reglages par defaut (Scale 1.0),
                un humain fait ~1.8 unite et tient debout sur la grille.
  --scale 100   metres -> centimetres (si tu veux du BVH en cm ; importer Scale 0.01)

Retargeting Auto-Rig Pro:
  - Le BVH est en Y-up (repere ground OpenSim natif).
  - Garder la meme echelle (metres) que le rig cible pour eviter les glitchs ARP.
  - Pose de repos = pose par defaut du .osim ; aligner via ARP si besoin.
  - Foot-lock final : option "IK Foot" d'ARP.
""",
    )
    ap.add_argument("input_osim", nargs="?")
    ap.add_argument("input_mot",  nargs="?")
    ap.add_argument("output_bvh", nargs="?")
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
    if args.output_bvh is None:
        args.output_bvh = os.path.splitext(args.input_mot)[0] + ".bvh"

    print("\n" + "=" * 58)
    print("  OpenSim FK -> BVH  (Y-up, noms Mixamo/ARP)")
    print("=" * 58)
    print(f"  .osim   : {args.input_osim}")
    print(f"  .mot    : {args.input_mot}")
    print(f"  Sortie  : {args.output_bvh}")
    print(f"  Echelle : x{args.scale}")
    print("=" * 58 + "\n")

    try:
        convert_osim_to_bvh(
            args.input_osim, args.input_mot, args.output_bvh,
            scale=args.scale, despike_thr=args.despike_thr,
            despike_win=args.despike_win, despike_gap=args.despike_gap,
            apose_deg=args.apose_deg,
        )
    except RuntimeError as e:
        print(f"[ERREUR] {e}")
        sys.exit(1)

    print("\nOK Termine. Importez dans Blender avec les reglages PAR DEFAUT "
          "(Scale 1.0, Up Y, Forward -Z) puis retargetez avec Auto-Rig Pro.")


if __name__ == "__main__":
    main()
