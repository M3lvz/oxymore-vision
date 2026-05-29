// configuration.jsx — Onglets de configuration TOML complets

const { useState: useStateC, useMemo: useMemoC } = React;

const CONFIG_TABS = [
  { id: 'project',    label: 'Projet',         icon: Icon.folder,   count: 6 },
  { id: 'pose',       label: 'Pose',           icon: Icon.pose,     count: 16 },
  { id: 'calibration',label: 'Calibration',    icon: Icon.calib,    count: 18 },
  { id: 'sync',       label: 'Synchronisation',icon: Icon.sync,     count: 9 },
  { id: 'assoc',      label: 'Association',    icon: Icon.people,   count: 5 },
  { id: 'tri',        label: 'Triangulation',  icon: Icon.tri,      count: 13 },
  { id: 'filt',       label: 'Filtrage',       icon: Icon.filter,   count: 16 },
  { id: 'marker',     label: 'Augmentation',   icon: Icon.sparkle,  count: 2 },
  { id: 'kine',       label: 'Cinématique',    icon: Icon.bone,     count: 10 },
  { id: 'raw',        label: 'TOML brut',      icon: Icon.doc,      count: '*' },
];

function ConfigSidebar({ value, onChange }) {
  return (
    <div style={{
      width: 220, flex: '0 0 220px',
      borderRight: '1px solid var(--line)',
      padding: '18px 12px',
      background: 'rgba(255,255,255,0.01)',
      overflow: 'auto',
    }}>
      <div style={{
        fontSize: 10, fontWeight: 500, letterSpacing: '0.1em',
        textTransform: 'uppercase', color: 'var(--fg-4)',
        padding: '4px 10px 8px',
      }}>Sections</div>
      {CONFIG_TABS.map(t => (
        <div
          key={t.id}
          className={`nav-item ${value === t.id ? 'active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          <div style={{ width: 16, height: 16 }}>{t.icon}</div>
          <span>{t.label}</span>
          <span className="badge">{t.count}</span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Tab content components
// ─────────────────────────────────────────────────────────────

function TabProject({ cfg, set }) {
  return (
    <>
      <SectionHeading>Identité du projet</SectionHeading>
      <div className="grid-2">
        <Field label="Nom du projet">
          <Input value={cfg.project.name} onChange={v => set('project.name', v)} />
        </Field>
        <Field label="Dossier" hint="path">
          <div style={{ display: 'flex', gap: 6 }}>
            <Input value={cfg.project.path} onChange={v => set('project.path', v)} />
            <button className="btn" style={{ flex: '0 0 auto' }}>{Icon.folder}</button>
          </div>
        </Field>
      </div>

      <SectionHeading>Sujet & capture</SectionHeading>
      <ToggleRow
        name="Multi-personne"
        desc="Plusieurs participants détectés simultanément sur la scène"
        value={cfg.project.multi_person}
        onChange={v => set('project.multi_person', v)}
      />

      <div className="grid-2" style={{ marginTop: 14 }}>
        <Field label="Taille (m)" help="'auto', float ou liste ex: [1.72, 1.65]">
          <Input value={cfg.project.participant_height} onChange={v => set('project.participant_height', v)} placeholder="auto"/>
        </Field>
        <Field label="Masse (kg)" help="float ou liste ex: [70.0, 63.5]">
          <Input value={cfg.project.participant_mass} onChange={v => set('project.participant_mass', v)} placeholder="70.0"/>
        </Field>
        <Field label="Frame rate" help="'auto' ou int (fps)">
          <Input value={cfg.project.frame_rate} onChange={v => set('project.frame_rate', v)} placeholder="auto"/>
        </Field>
        <Field label="Plage de frames" help="'auto', 'all' ou [début, fin] ex: [0, 144]">
          <Input value={cfg.project.frame_range} onChange={v => set('project.frame_range', v)} placeholder="auto"/>
        </Field>
        <Field label="Exclure du batch" hint="liste" span help="Noms de sous-dossiers à ignorer dans Demo_Batch">
          <Input value={cfg.project.exclude_from_batch} onChange={v => set('project.exclude_from_batch', v)} placeholder="[]"/>
        </Field>
      </div>
    </>
  );
}

function TabPose({ cfg, set }) {
  return (
    <>
      <SectionHeading>Modèle squelette</SectionHeading>
      <div className="grid-2">
        <Field label="Modèle de pose" help="HALPE_26 par défaut (Body_with_feet)">
          <Select
            value={cfg.pose.pose_model}
            onChange={v => set('pose.pose_model', v)}
            options={['Body_with_feet','Whole_body','Whole_body_wrist','Lower_body','Body','Hand','Face','Animal','CUSTOM']}
          />
        </Field>
        <Field label="Mode" help="lightweight = rapide, performance = précis">
          <Segmented
            value={cfg.pose.mode}
            onChange={v => set('pose.mode', v)}
            options={['lightweight','balanced','performance']}
          />
        </Field>
        <Field label="Fréquence de détection" hint="frames" help="Détecte la personne tous les N frames">
          <Input value={cfg.pose.det_frequency} onChange={v => set('pose.det_frequency', v)} />
        </Field>
        <Field label="Format de sortie">
          <Select
            value={cfg.pose.output_format}
            onChange={v => set('pose.output_format', v)}
            options={['openpose','mmpose','deeplabcut','none']}
          />
        </Field>
      </div>

      <SectionHeading>Matériel</SectionHeading>
      <div className="grid-3">
        <Field label="Périphérique" help="CUDA = GPU NVIDIA · DirectML = GPU Windows sans toolkit">
          <Select
            value={cfg.pose.device}
            onChange={v => set('pose.device', v)}
            options={['auto','CPU','CUDA','DirectML','MPS','ROCM']}
          />
        </Field>
        <Field label="Backend">
          <Select
            value={cfg.pose.backend}
            onChange={v => set('pose.backend', v)}
            options={['auto','openvino','onnxruntime','opencv']}
          />
        </Field>
        <Field label="Workers parallèles" help="Nombre de processus pose">
          <Input value={cfg.pose.parallel_workers_pose} onChange={v => set('pose.parallel_workers_pose', v)} placeholder="auto"/>
        </Field>
      </div>

      <SectionHeading>Seuils & tracking</SectionHeading>
      <div className="grid-2">
        <Field label="Seuil de vraisemblance" help="Rejette si moyenne keypoints < seuil">
          <Input value={cfg.pose.average_likelihood_threshold_pose} onChange={v => set('pose.average_likelihood_threshold_pose', v)} />
        </Field>
        <Field label="Distance max (px)" help="Saut maximal entre deux frames">
          <Input value={cfg.pose.max_distance_px} onChange={v => set('pose.max_distance_px', v)} />
        </Field>
        <Field label="Tracking">
          <Select
            value={cfg.pose.tracking_mode}
            onChange={v => set('pose.tracking_mode', v)}
            options={['sports2d','deepsort','none']}
          />
        </Field>
        <Field label="Sauvegarde vidéo">
          <Select
            value={cfg.pose.save_video}
            onChange={v => set('pose.save_video', v)}
            options={[
              { value: 'to_video',  label: 'Vidéo (.mp4)' },
              { value: 'to_images', label: 'Images (.png)' },
              { value: 'none',      label: 'Ne pas sauvegarder' },
            ]}
          />
        </Field>
        <Field label="Paramètres DeepSORT" hint="dict" span help="max_age, n_init, nms_max_overlap, max_cosine_distance, nn_budget, max_iou_distance">
          <Input value={cfg.pose.deepsort_params} onChange={v => set('pose.deepsort_params', v)} />
        </Field>
      </div>

      <SectionHeading>Options</SectionHeading>
      <div>
        <ToggleRow name="Afficher la détection en direct"
          desc="Désactiver pour gagner ~30% en vitesse en traitement parallèle"
          value={cfg.pose.display_detection} onChange={v => set('pose.display_detection', v)} />
        <ToggleRow name="Écraser estimation existante"
          desc="Force le re-calcul même si pose 2D déjà présente"
          value={cfg.pose.overwrite_pose} onChange={v => set('pose.overwrite_pose', v)} />
        <ToggleRow name="Gérer les swaps gauche/droite"
          desc="Corrige automatiquement les inversions L/R fréquentes"
          value={cfg.pose.handle_LR_swap} onChange={v => set('pose.handle_LR_swap', v)} />
        <ToggleRow name="Dé-distordre les points 2D"
          desc="Applique les paramètres de distorsion avant triangulation"
          value={cfg.pose.undistort_points} onChange={v => set('pose.undistort_points', v)} />
      </div>
    </>
  );
}

function TabCalibration({ cfg, set }) {
  const isConvert = cfg.calibration.calibration_type === 'convert';
  return (
    <>
      <SectionHeading>Méthode</SectionHeading>
      <Field label="Type de calibration" help="convert : importer depuis un logiciel existant · calculate : calculer depuis un damier">
        <Segmented
          value={cfg.calibration.calibration_type}
          onChange={v => set('calibration.calibration_type', v)}
          options={[
            { value: 'convert',   label: 'Convertir' },
            { value: 'calculate', label: 'Calculer' },
          ]}
        />
      </Field>

      {isConvert && (
        <>
          <SectionHeading>Conversion</SectionHeading>
          <div className="grid-2">
            <Field label="Convertir depuis">
              <Select
                value={cfg.calibration.convert.convert_from}
                onChange={v => set('calibration.convert.convert_from', v)}
                options={['qualisys','vicon','optitrack','opencap','easymocap','biocv','anipose','freemocap','caliscope']}
              />
            </Field>
            <Field label="Facteur de binning" help="1 normalement · 2 si vidéo 540p Qualisys">
              <Input value={cfg.calibration.convert.qualisys.binning_factor}
                     onChange={v => set('calibration.convert.qualisys.binning_factor', v)} />
            </Field>
          </div>
        </>
      )}

      {!isConvert && (
        <>
          <SectionHeading>Damier — intrinsèques</SectionHeading>
          <ToggleRow name="Écraser les intrinsèques existants"
            value={cfg.calibration.calculate.intrinsics.overwrite_intrinsics}
            onChange={v => set('calibration.calculate.intrinsics.overwrite_intrinsics', v)} />
          <ToggleRow name="Sauvegarder images de debug"
            value={cfg.calibration.calculate.save_debug_images}
            onChange={v => set('calibration.calculate.save_debug_images', v)} />
          <ToggleRow name="Afficher la détection des coins"
            value={cfg.calibration.calculate.intrinsics.show_detection_intrinsics}
            onChange={v => set('calibration.calculate.intrinsics.show_detection_intrinsics', v)} />

          <div className="grid-3" style={{ marginTop: 14 }}>
            <Field label="Extension fichiers" help="jpg, png, mp4…">
              <Input value={cfg.calibration.calculate.intrinsics.intrinsics_extension}
                     onChange={v => set('calibration.calculate.intrinsics.intrinsics_extension', v)} />
            </Field>
            <Field label="Extraire toutes les N s">
              <Input value={cfg.calibration.calculate.intrinsics.extract_every_N_sec}
                     onChange={v => set('calibration.calculate.intrinsics.extract_every_N_sec', v)} />
            </Field>
            <Field label="Taille case (mm)">
              <Input value={cfg.calibration.calculate.intrinsics.intrinsics_square_size}
                     onChange={v => set('calibration.calculate.intrinsics.intrinsics_square_size', v)} />
            </Field>
            <Field label="Coins damier [H, W]" help="ex: [4, 7]" span>
              <Input value={cfg.calibration.calculate.intrinsics.intrinsics_corners_nb}
                     onChange={v => set('calibration.calculate.intrinsics.intrinsics_corners_nb', v)} />
            </Field>
          </div>

          <SectionHeading>Extrinsèques</SectionHeading>
          <ToggleRow name="Calculer les extrinsèques"
            value={cfg.calibration.calculate.extrinsics.calculate_extrinsics}
            onChange={v => set('calibration.calculate.extrinsics.calculate_extrinsics', v)} />
          <ToggleRow name="Afficher l'erreur de reprojection"
            value={cfg.calibration.calculate.extrinsics.show_reprojection_error}
            onChange={v => set('calibration.calculate.extrinsics.show_reprojection_error', v)} />
          <ToggleRow name="Caméras mobiles"
            desc="À activer si les caméras bougent durant l'enregistrement"
            value={cfg.calibration.calculate.extrinsics.moving_cameras}
            onChange={v => set('calibration.calculate.extrinsics.moving_cameras', v)} />

          <div className="grid-2" style={{ marginTop: 14 }}>
            <Field label="Méthode" help="scene = clic sur points connus · plus précis">
              <Select
                value={cfg.calibration.calculate.extrinsics.extrinsics_method}
                onChange={v => set('calibration.calculate.extrinsics.extrinsics_method', v)}
                options={['scene','board','keypoints']}
              />
            </Field>
            <Field label="Extension images ext.">
              <Input value={cfg.calibration.calculate.extrinsics.extrinsics_extension}
                     onChange={v => set('calibration.calculate.extrinsics.extrinsics_extension', v)} />
            </Field>
            <Field label="Position damier (board)">
              <Select
                value={cfg.calibration.calculate.extrinsics.board.board_position}
                onChange={v => set('calibration.calculate.extrinsics.board.board_position', v)}
                options={['vertical','horizontal']}
              />
            </Field>
            <Field label="Taille case ext. (mm)">
              <Input value={cfg.calibration.calculate.extrinsics.board.extrinsics_square_size}
                     onChange={v => set('calibration.calculate.extrinsics.board.extrinsics_square_size', v)} />
            </Field>
            <Field label="Coordonnées 3D scène" hint="liste [x,y,z]" span
                   help="Points connus du repère monde — clic dans l'image lors de la calibration">
              <textarea
                value={cfg.calibration.calculate.extrinsics.scene.object_coords_3d}
                onChange={e => set('calibration.calculate.extrinsics.scene.object_coords_3d', e.target.value)}
                rows={5}
              />
            </Field>
          </div>
        </>
      )}
    </>
  );
}

function TabSync({ cfg, set }) {
  return (
    <>
      <SectionHeading>Mode</SectionHeading>
      <ToggleRow name="Interface graphique de synchronisation"
        desc="Un lecteur vidéo interactif s'ouvre pour ajuster manuellement"
        value={cfg.synchronization.synchronization_gui}
        onChange={v => set('synchronization.synchronization_gui', v)} />
      <ToggleRow name="Afficher les graphiques de synchronisation"
        value={cfg.synchronization.display_sync_plots}
        onChange={v => set('synchronization.display_sync_plots', v)} />
      <ToggleRow name="Sauvegarder les graphiques"
        value={cfg.synchronization.save_sync_plots}
        onChange={v => set('synchronization.save_sync_plots', v)} />

      <SectionHeading>Détection du mouvement</SectionHeading>
      <div className="grid-2">
        <Field label="Keypoints à considérer" help="'all' ou liste ex: ['RWrist','RElbow']" span>
          <Input value={cfg.synchronization.keypoints_to_consider}
                 onChange={v => set('synchronization.keypoints_to_consider', v)} />
        </Field>
        <Field label="Temps approx. vitesse max" help="'auto' ou seconde">
          <Input value={cfg.synchronization.approx_time_maxspeed}
                 onChange={v => set('synchronization.approx_time_maxspeed', v)} />
        </Field>
        <Field label="Fenêtre autour du pic (s)" help="Fenêtre de recherche autour du mouvement">
          <Input value={cfg.synchronization.time_range_around_maxspeed}
                 onChange={v => set('synchronization.time_range_around_maxspeed', v)} />
        </Field>
        <Field label="Seuil vraisemblance">
          <Input value={cfg.synchronization.likelihood_threshold_synchronization}
                 onChange={v => set('synchronization.likelihood_threshold_synchronization', v)} />
        </Field>
        <Field label="Fréquence de coupure (Hz)">
          <Input value={cfg.synchronization.filter_cutoff}
                 onChange={v => set('synchronization.filter_cutoff', v)} />
        </Field>
        <Field label="Ordre du filtre">
          <Input value={cfg.synchronization.filter_order}
                 onChange={v => set('synchronization.filter_order', v)} />
        </Field>
      </div>
    </>
  );
}

function TabAssoc({ cfg, set }) {
  const multi = cfg.project.multi_person;
  return (
    <>
      <SectionHeading>Association de personnes</SectionHeading>
      <div style={{
        padding: '10px 14px', borderRadius: 8,
        background: 'rgba(255,255,255,0.025)',
        border: '1px solid var(--line)',
        fontSize: 12, color: 'var(--fg-3)', marginBottom: 18,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ color: 'var(--fg-1)' }}>{Icon.alert}</span>
        Mode actuel : <span style={{ color: 'var(--fg-0)' }}>{multi ? 'Multi-personne' : 'Personne unique'}</span>
        — modifiable dans l'onglet Projet.
      </div>

      {!multi && (
        <>
          <SectionHeading>Personne unique</SectionHeading>
          <div className="grid-2">
            <Field label="Seuil vraisemblance" help="Seuil minimal pour valider l'association">
              <Input value={cfg.personAssociation.single_person.likelihood_threshold_association}
                     onChange={v => set('personAssociation.single_person.likelihood_threshold_association', v)} />
            </Field>
            <Field label="Erreur reproj. (px)">
              <Input value={cfg.personAssociation.single_person.reproj_error_threshold_association}
                     onChange={v => set('personAssociation.single_person.reproj_error_threshold_association', v)} />
            </Field>
            <Field label="Keypoint de suivi" help="Point utilisé pour l'identification" span>
              <Select
                value={cfg.personAssociation.single_person.tracked_keypoint}
                onChange={v => set('personAssociation.single_person.tracked_keypoint', v)}
                options={['Neck','Hip','RShoulder','LShoulder','Nose','Head']}
              />
            </Field>
          </div>
        </>
      )}

      {multi && (
        <>
          <SectionHeading>Multi-personne</SectionHeading>
          <div className="grid-2">
            <Field label="Seuil erreur reconstruction" help="Tolérance pour considérer deux détections comme la même personne">
              <Input value={cfg.personAssociation.multi_person.reconstruction_error_threshold}
                     onChange={v => set('personAssociation.multi_person.reconstruction_error_threshold', v)} />
            </Field>
            <Field label="Affinité minimum">
              <Input value={cfg.personAssociation.multi_person.min_affinity}
                     onChange={v => set('personAssociation.multi_person.min_affinity', v)} />
            </Field>
          </div>
        </>
      )}
    </>
  );
}

Object.assign(window, {
  ConfigSidebar, CONFIG_TABS,
  TabProject, TabPose, TabCalibration, TabSync, TabAssoc,
});
