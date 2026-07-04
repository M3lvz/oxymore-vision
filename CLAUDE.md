# CLAUDE.md — OxymoreVision

## Avant toute chose — lire l'Obsidian

Le vault Obsidian du projet est dans `E:\Claude\MOCAP\`.
**Lire ces fichiers au début de chaque session avant de toucher au code :**

1. `E:\Claude\MOCAP\MOC - MoCap.md` — vue d'ensemble du projet
2. `E:\Claude\MOCAP\OxymoreVision - App Desktop.md` — architecture, fichiers clés, bugs résolus
3. `E:\Claude\MOCAP\Pipeline Pose2Sim.md` — les 9 étapes du pipeline
4. `C:\Users\melvi\.claude\projects\c--Users-melvi-Desktop-Oxym-Build\memory\MEMORY.md` — mémoire persistante (préférences user, décisions techniques)

---

## Fin de session

Quand le user dit **"fin de session"** :
1. Mettre à jour les fichiers Obsidian concernés par ce qui a été fait
2. Corriger tout ce qui n'est plus d'actualité
3. Mettre à jour `MEMORY.md` si nouvelles préférences ou décisions importantes

---

## Stack technique

| Couche | Techno |
|---|---|
| Backend | Flask + Flask-SocketIO (eventlet) |
| Frontend | React (chargé via `<script>` dans le HTML, pas de bundler) |
| Desktop | PyWebView |
| Distribution | PyInstaller onefile |
| Pipeline | Pose2Sim (subprocess Python séparé dans venv client) |
| Quest HTS | TCP ADB port 8000 / UDP WiFi port 9000 |

**Dossier projet :** `C:\Users\melvi\Desktop\Oxym_Build\`
**Dossier App React :** `C:\Users\melvi\Desktop\Oxym_Build\App\`

---

## Ce qui est en cours / à faire

- [ ] **Phase 4** — `hand_to_bvh.py` : fusion hand_tracking.json (70 Hz) + cinématique corps (25 Hz) → BVH avec 20 os corps + 30 os doigts
- [ ] **Phase 5** — Rendu 3D des doigts dans `views.jsx` (actuellement juste un badge)
- [ ] **Phase 6** — Export BVH/FBX avec doigts quand Fusion active
- [ ] **Quest head fusion** — utiliser pose 6DoF casque au lieu keypoints tête Pose2Sim, calibration spatiale

---

## Conventions importantes

- Les fichiers JSX sont chargés comme scripts dans le HTML — pas de JSX transpilé, pas de bundler
- `useEffect`, `useState` etc. sont aliasés par composant : `useStateP` dans pipeline.jsx, `useStateDash` dans dashboard.jsx, etc.
- `window.STEPS` expose le tableau des étapes depuis pipeline.jsx
- `runState` vit dans `app_connected.jsx` et persiste entre les vues (les sous-composants remontent/démontent mais runState reste)
- localStorage key `handFusion_disabled_${project.path}` = user a explicitement désactivé la fusion pour ce projet
- Images statiques servies depuis `App/` (Flask static_folder)
