// configuration2.jsx — Onglets Triangulation, Filtrage, Marker Aug, Cinématique, TOML brut + wrapper

const { useState: useStateC2 } = React;

function TabTri({ cfg, set }) {
  return (
    <>
      <SectionHeading>Qualité</SectionHeading>
      <div className="grid-3">
        <Field label="Erreur de reproj. max (px)" help="Au-delà, le point est rejeté">
          <Input value={cfg.triangulation.reproj_error_threshold_triangulation}
                 onChange={v => set('triangulation.reproj_error_threshold_triangulation', v)} />
        </Field>
        <Field label="Seuil vraisemblance 2D">
          <Input value={cfg.triangulation.likelihood_threshold_triangulation}
                 onChange={v => set('triangulation.likelihood_threshold_triangulation', v)} />
        </Field>
        <Field label="Caméras minimum">
          <Input value={cfg.triangulation.min_cameras_for_triangulation}
                 onChange={v => set('triangulation.min_cameras_for_triangulation', v)} />
        </Field>
        <Field label="Distance max (m)" help="Seuil de cohérence inter-caméra">
          <Input value={cfg.triangulation.max_distance_m}
                 onChange={v => set('triangulation.max_distance_m', v)} />
        </Field>
        <Field label="Frames invisibles max">
          <Input value={cfg.triangulation.max_unseen_frames}
                 onChange={v => set('triangulation.max_unseen_frames', v)} />
        </Field>
        <Field label="Taille de chunk min">
          <Input value={cfg.triangulation.min_chunk_size}
                 onChange={v => set('triangulation.min_chunk_size', v)} />
        </Field>
      </div>

      <SectionHeading>Interpolation</SectionHeading>
      <div className="grid-2">
        <Field label="Interpoler si gap < N frames">
          <Input value={cfg.triangulation.interp_if_gap_smaller_than}
                 onChange={v => set('triangulation.interp_if_gap_smaller_than', v)} />
        </Field>
        <Field label="Méthode d'interpolation">
          <Select
            value={cfg.triangulation.interpolation}
            onChange={v => set('triangulation.interpolation', v)}
            options={['linear','slinear','quadratic','cubic','none']}
          />
        </Field>
        <Field label="Remplir grands gaps">
          <Select
            value={cfg.triangulation.fill_large_gaps_with}
            onChange={v => set('triangulation.fill_large_gaps_with', v)}
            options={['last_value','nan','zero']}
          />
        </Field>
        <Field label="Sections à conserver">
          <Select
            value={cfg.triangulation.sections_to_keep}
            onChange={v => set('triangulation.sections_to_keep', v)}
            options={['all','largest','first','last']}
          />
        </Field>
      </div>

      <SectionHeading>Nettoyage & export</SectionHeading>
      <ToggleRow name="Supprimer les frames incomplètes"
        desc="Toute frame avec marqueur manquant est rejetée"
        value={cfg.triangulation.remove_incomplete_frames}
        onChange={v => set('triangulation.remove_incomplete_frames', v)} />
      <ToggleRow name="Afficher les indices interpolés"
        desc="Surligne les frames interpolées dans le rapport"
        value={cfg.triangulation.show_interp_indices}
        onChange={v => set('triangulation.show_interp_indices', v)} />
      <ToggleRow name="Exporter aussi en .c3d"
        desc="Format standard biomécanique"
        value={cfg.triangulation.make_c3d}
        onChange={v => set('triangulation.make_c3d', v)} />
    </>
  );
}

function TabFilt({ cfg, set }) {
  const type = cfg.filtering.type;
  return (
    <>
      <SectionHeading>Réglages généraux</SectionHeading>
      <ToggleRow name="Rejeter les outliers (Hampel)"
        desc="Détection statistique des valeurs aberrantes"
        value={cfg.filtering.reject_outliers}
        onChange={v => set('filtering.reject_outliers', v)} />
      <ToggleRow name="Activer le filtrage"
        value={cfg.filtering.filter}
        onChange={v => set('filtering.filter', v)} />
      <ToggleRow name="Afficher les graphiques"
        value={cfg.filtering.display_figures}
        onChange={v => set('filtering.display_figures', v)} />
      <ToggleRow name="Sauvegarder les graphiques"
        value={cfg.filtering.save_filt_plots}
        onChange={v => set('filtering.save_filt_plots', v)} />
      <ToggleRow name="Exporter .c3d filtré"
        value={cfg.filtering.make_c3d}
        onChange={v => set('filtering.make_c3d', v)} />

      <SectionHeading>Type de filtre</SectionHeading>
      <Field label="Algorithme" help="Butterworth pour mouvements humains classiques · Kalman pour bruit important">
        <Select
          value={type}
          onChange={v => set('filtering.type', v)}
          options={[
            'butterworth','butterworth_on_speed',
            'kalman','one_euro','gcv_spline',
            'acc_minimizing','loess','gaussian','median',
          ]}
        />
      </Field>

      {(type === 'butterworth' || type === 'butterworth_on_speed') && (
        <>
          <SectionHeading>Butterworth</SectionHeading>
          <div className="grid-2">
            <Field label="Fréquence de coupure (Hz)" help="3-6 Hz : marche · 6-15 Hz : course · 15+ : mouvements vifs">
              <Input value={cfg.filtering.butterworth.cut_off_frequency}
                     onChange={v => set('filtering.butterworth.cut_off_frequency', v)} />
            </Field>
            <Field label="Ordre" help="4 par défaut">
              <Input value={cfg.filtering.butterworth.order}
                     onChange={v => set('filtering.butterworth.order', v)} />
            </Field>
          </div>
        </>
      )}

      {type === 'kalman' && (
        <>
          <SectionHeading>Kalman</SectionHeading>
          <ToggleRow name="Lissage (smooth)"
            desc="Passe arrière pour réduire le retard"
            value={cfg.filtering.kalman.smooth}
            onChange={v => set('filtering.kalman.smooth', v)} />
          <div className="grid-2" style={{ marginTop: 14 }}>
            <Field label="Trust ratio" help="Confiance mesure / processus — 500 par défaut">
              <Input value={cfg.filtering.kalman.trust_ratio}
                     onChange={v => set('filtering.kalman.trust_ratio', v)} />
            </Field>
          </div>
        </>
      )}

      {type === 'one_euro' && (
        <>
          <SectionHeading>One Euro</SectionHeading>
          <div className="grid-3">
            <Field label="Fréquence coupure (Hz)">
              <Input value={cfg.filtering.one_euro.cut_off_frequency}
                     onChange={v => set('filtering.one_euro.cut_off_frequency', v)} />
            </Field>
            <Field label="Beta" help="Adaptation vitesse">
              <Input value={cfg.filtering.one_euro.beta}
                     onChange={v => set('filtering.one_euro.beta', v)} />
            </Field>
            <Field label="D-cutoff (Hz)" help="Filtre sur la dérivée">
              <Input value={cfg.filtering.one_euro.d_cut_off_frequency}
                     onChange={v => set('filtering.one_euro.d_cut_off_frequency', v)} />
            </Field>
          </div>
        </>
      )}

      {type === 'gcv_spline' && (
        <>
          <SectionHeading>GCV Spline</SectionHeading>
          <div className="grid-2">
            <Field label="Fréquence coupure">
              <Input value={cfg.filtering.gcv_spline.cut_off_frequency}
                     onChange={v => set('filtering.gcv_spline.cut_off_frequency', v)} />
            </Field>
            <Field label="Facteur de lissage">
              <Input value={cfg.filtering.gcv_spline.smoothing_factor}
                     onChange={v => set('filtering.gcv_spline.smoothing_factor', v)} />
            </Field>
          </div>
        </>
      )}
    </>
  );
}

function TabMarker({ cfg, set }) {
  return (
    <>
      <SectionHeading>Marker augmentation</SectionHeading>
      <div style={{
        padding: '14px 16px', borderRadius: 12,
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid var(--line)',
        marginBottom: 18,
        fontSize: 12.5, color: 'var(--fg-3)', lineHeight: 1.5,
      }}>
        <div style={{ color: 'var(--fg-1)', marginBottom: 4, fontWeight: 500 }}>Estimation de marqueurs virtuels</div>
        Le réseau LSTM ajoute des marqueurs anatomiques (hanches, genoux, chevilles internes) pour améliorer le scaling OpenSim. Requiert un squelette <span className="mono">Body_with_feet</span> ou compatible.
      </div>

      <ToggleRow name="Pieds posés au sol"
        desc="Force le contact au sol pour stabiliser la prédiction"
        value={cfg.markerAugmentation.feet_on_floor}
        onChange={v => set('markerAugmentation.feet_on_floor', v)} />
      <ToggleRow name="Exporter .c3d augmenté"
        value={cfg.markerAugmentation.make_c3d}
        onChange={v => set('markerAugmentation.make_c3d', v)} />
    </>
  );
}

function TabKine({ cfg, set }) {
  return (
    <>
      <SectionHeading>Modèle OpenSim</SectionHeading>
      <ToggleRow name="Utiliser l'augmentation de marqueurs"
        desc="Requiert hanches, genoux et chevilles correctement triangulés"
        value={cfg.kinematics.use_augmentation}
        onChange={v => set('kinematics.use_augmentation', v)} />
      <ToggleRow name="Modèle simplifié"
        desc="≈ 10× plus rapide · pas de muscles, moins de contraintes"
        value={cfg.kinematics.use_simple_model}
        onChange={v => set('kinematics.use_simple_model', v)} />
      <ToggleRow name="Symétrie gauche/droite"
        desc="Force le scaling symétrique du squelette"
        value={cfg.kinematics.right_left_symmetry}
        onChange={v => set('kinematics.right_left_symmetry', v)} />
      <ToggleRow name="Filtrer la cinématique inverse"
        value={cfg.kinematics.filter_ik}
        onChange={v => set('kinematics.filter_ik', v)} />
      <ToggleRow name="Nettoyer setup de scaling individuel"
        desc="Supprime le fichier setup après utilisation"
        value={cfg.kinematics.remove_individual_scaling_setup}
        onChange={v => set('kinematics.remove_individual_scaling_setup', v)} />
      <ToggleRow name="Nettoyer setup d'IK individuel"
        value={cfg.kinematics.remove_individual_ik_setup}
        onChange={v => set('kinematics.remove_individual_ik_setup', v)} />

      <SectionHeading>Paramètres IK</SectionHeading>
      <div className="grid-2">
        <Field label="Type de filtre IK" help="Si filter_ik est activé">
          <Select
            value={cfg.kinematics.ik_filter_type}
            onChange={v => set('kinematics.ik_filter_type', v)}
            options={['acc_minimizing','butterworth','kalman','median']}
          />
        </Field>
        <Field label="Taille par défaut (m)" help="Si calcul auto échoue">
          <Input value={cfg.kinematics.default_height}
                 onChange={v => set('kinematics.default_height', v)} />
        </Field>
        <Field label="Angles hanche/genou max (°)" help="Au-delà, considéré comme imprécis">
          <Input value={cfg.kinematics.large_hip_knee_angles}
                 onChange={v => set('kinematics.large_hip_knee_angles', v)} />
        </Field>
        <Field label="% extrêmes à trimmer">
          <Input value={cfg.kinematics.trimmed_extrema_percent}
                 onChange={v => set('kinematics.trimmed_extrema_percent', v)} />
        </Field>
      </div>

      <SectionHeading>Journalisation</SectionHeading>
      <ToggleRow name="Logging personnalisé"
        desc="Active des messages de log avancés (debug)"
        value={cfg.logging.use_custom_logging}
        onChange={v => set('logging.use_custom_logging', v)} />
    </>
  );
}

function TabRaw({ rawText, setRawText }) {
  return (
    <>
      <SectionHeading right={
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn sm">{Icon.upload}<span>Charger</span></button>
          <button className="btn sm">{Icon.copy}<span>Copier</span></button>
          <button className="btn sm">{Icon.check}<span>Appliquer</span></button>
        </div>
      }>Config.toml — édition brute</SectionHeading>

      <textarea
        value={rawText}
        onChange={(e) => setRawText(e.target.value)}
        style={{
          width: '100%', minHeight: 460,
          fontFamily: 'var(--font-mono)',
          fontSize: 12, lineHeight: 1.6,
          background: '#000', color: '#d8d8d8',
          border: '1px solid var(--line-2)',
        }}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Top-level Configuration wrapper
// ─────────────────────────────────────────────────────────────
function Configuration({ cfg, setCfg, project, onReloadConfig }) {
  const [tab,     setTab]     = useStateC2('project');
  const [dirty,   setDirty]   = useStateC2(false);
  const [saving,  setSaving]  = useStateC2(false);
  const [status,  setStatus]  = useStateC2(null); // 'ok' | 'error' | null
  const [rawText, setRawText] = useStateC2(() => toToml(cfg));

  function set(pathStr, value) {
    setCfg(prev => {
      const next = structuredClone(prev);
      const keys = pathStr.split('.');
      let obj = next;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!obj[keys[i]]) obj[keys[i]] = {};
        obj = obj[keys[i]];
      }
      obj[keys[keys.length - 1]] = value;
      return next;
    });
    setDirty(true);
  }

  React.useEffect(() => {
    if (tab !== 'raw') setRawText(toToml(cfg));
  }, [cfg, tab]);

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      });
      const data = await res.json();
      if (data.ok) {
        setDirty(false);
        setStatus('ok');
        setTimeout(() => setStatus(null), 2500);
      } else {
        setStatus('error:' + (data.error || 'Erreur inconnue'));
      }
    } catch(e) {
      setStatus('error:' + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function cancel() {
    if (!dirty) return;
    onReloadConfig?.();
    setDirty(false);
    setStatus(null);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Configuration</h1>
          <div className="sub">
            {project?.path ? `${project.path}\\Config.toml` : 'Aucun projet'}
            {dirty  && <span style={{ marginLeft:10, color:'var(--warn)' }}>● non sauvegardé</span>}
            {status === 'ok' && <span style={{ marginLeft:10, color:'var(--success)' }}>✓ Sauvegardé</span>}
            {status?.startsWith('error') && (
              <span style={{ marginLeft:10, color:'var(--error)', fontSize:11 }}>
                ❌ {status.replace('error:','')}
              </span>
            )}
          </div>
        </div>
        <div className="head-actions">
          <button className="btn ghost" onClick={cancel} disabled={!dirty}>
            {Icon.refresh}<span>Annuler</span>
          </button>
          <button className="btn primary" onClick={save} disabled={saving || !dirty}>
            {Icon.save}<span>{saving ? 'Sauvegarde…' : 'Sauvegarder'}</span>
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <ConfigSidebar value={tab} onChange={setTab}/>
        <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px 36px', position: 'relative' }}>
          {tab === 'project'     && <TabProject     cfg={cfg} set={set}/>}
          {tab === 'pose'        && <TabPose        cfg={cfg} set={set}/>}
          {tab === 'calibration' && <TabCalibration cfg={cfg} set={set}/>}
          {tab === 'sync'        && <TabSync        cfg={cfg} set={set}/>}
          {tab === 'assoc'       && <TabAssoc       cfg={cfg} set={set}/>}
          {tab === 'tri'         && <TabTri         cfg={cfg} set={set}/>}
          {tab === 'filt'        && <TabFilt        cfg={cfg} set={set}/>}
          {tab === 'marker'      && <TabMarker      cfg={cfg} set={set}/>}
          {tab === 'kine'        && <TabKine        cfg={cfg} set={set}/>}
          {tab === 'raw'         && <TabRaw         rawText={rawText} setRawText={setRawText}/>}
        </div>
      </div>
    </>
  );
}

// rudimentary TOML serializer for display
function toToml(obj, prefix = '') {
  let out = '';
  const scalars = [];
  const tables  = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) tables.push([k, v]);
    else scalars.push([k, v]);
  }
  if (scalars.length) {
    if (prefix) out += `\n[${prefix}]\n`;
    for (const [k, v] of scalars) {
      out += `${k} = ${formatToml(v)}\n`;
    }
  }
  for (const [k, v] of tables) {
    out += toToml(v, prefix ? `${prefix}.${k}` : k);
  }
  return out;
}
function formatToml(v) {
  if (typeof v === 'string') {
    if (v.startsWith('[') || v.startsWith('{')) return v;
    return `"${v}"`;
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return '[' + v.map(formatToml).join(', ') + ']';
  return String(v);
}

window.Configuration = Configuration;
window.toToml = toToml;
