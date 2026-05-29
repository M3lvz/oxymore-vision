// app_connected.jsx — App avec backend réel (Flask + WebSocket)

const { useState: useStateA, useReducer: useReducerA, useEffect: useEffectA, useRef: useRefA } = React;

// ─── WebSocket ───────────────────────────────────────────────────────────────
const socket = io();   // se connecte au serveur Flask local

// ─── Config par défaut ───────────────────────────────────────────────────────
const DEFAULT_CFG = {
  project: { name:'', path:'', multi_person:false, participant_height:'auto',
             participant_mass:'70.0', frame_rate:'auto', frame_range:'[0, 144]', exclude_from_batch:'[]' },
  pose: { pose_model:'Body_with_feet', mode:'balanced', det_frequency:'4', device:'CUDA',
          backend:'auto', display_detection:false, overwrite_pose:false, save_video:'to_video',
          output_format:'openpose', average_likelihood_threshold_pose:'0.5',
          tracking_mode:'sports2d', max_distance_px:'100' },
  synchronization: { synchronization_gui:false, display_sync_plots:false, save_sync_plots:true,
                     keypoints_to_consider:'all', approx_time_maxspeed:'auto',
                     time_range_around_maxspeed:'2.0',
                     likelihood_threshold_synchronization:'0.4', filter_cutoff:'6', filter_order:'4' },
  personAssociation: {
    single_person: { likelihood_threshold_association:'0.3', reproj_error_threshold_association:'20', tracked_keypoint:'Neck' },
    multi_person:  { reconstruction_error_threshold:'0.1', min_affinity:'0.2' },
  },
  calibration: {
    calibration_type: 'convert',
    convert: {
      convert_from: 'easymocap',
      qualisys: { binning_factor: '1' },
    },
    calculate: {
      save_debug_images: true,
      intrinsics: {
        overwrite_intrinsics: false,
        intrinsics_extension: 'jpg',
        extract_every_N_sec: '1',
        intrinsics_corners_nb: '[4, 7]',
        intrinsics_square_size: '60',
        show_detection_intrinsics: true,
      },
      extrinsics: {
        calculate_extrinsics: true,
        extrinsics_method: 'scene',
        extrinsics_extension: 'png',
        show_reprojection_error: true,
        moving_cameras: false,
        board: { board_position:'vertical', extrinsics_corners_nb:'[4,7]', extrinsics_square_size:'60' },
        scene: { object_coords_3d:'[[-2.0, 0.3, 0.0],\n[-2.0, 0.0, 0.0]]' },
      },
    },
  },
  triangulation: { reproj_error_threshold_triangulation:'10', likelihood_threshold_triangulation:'0.4',
                   min_cameras_for_triangulation:'2', interp_if_gap_smaller_than:'50',
                   interpolation:'cubic', make_c3d:true },
  filtering: { reject_outliers:true, filter:true, type:'butterworth', display_figures:true,
               save_filt_plots:true, make_c3d:true,
               butterworth:{ cut_off_frequency:'6', order:'4' },
               butterworth_on_speed:{ cut_off_frequency:'10', order:'4' } },
  markerAugmentation: { feet_on_floor:false, make_c3d:true },
  kinematics: { use_augmentation:true, use_simple_model:true, filter_ik:false,
                ik_filter_type:'acc_minimizing', right_left_symmetry:false,
                default_height:'1.75', large_hip_knee_angles:'90',
                trimmed_extrema_percent:'50',
                remove_individual_scaling_setup:true, remove_individual_ik_setup:true,
                parallel_workers_kinematics:'auto' },
  logging: { use_custom_logging:false },
};

// ─── Run reducer ─────────────────────────────────────────────────────────────
const INITIAL_RUN = {
  enabled:  Array(STEPS.length).fill(true),
  statuses: {},
  progress: {},
  current:  null,
  startedAt: null,
};

function runReducer(state, action) {
  switch (action.type) {
    case 'TOGGLE_STEP': {
      const i = STEPS.findIndex(s => s.id === action.id);
      const enabled = [...state.enabled];
      enabled[i] = !enabled[i];
      return { ...state, enabled };
    }
    case 'STEP_START': {
      const i = STEPS.findIndex(s => s.id === action.step);
      const statuses = { ...state.statuses, [action.step]: 'running' };
      const progress = { ...state.progress, [action.step]: 0 };
      return { ...state, statuses, progress, current: i, startedAt: state.startedAt || Date.now() };
    }
    case 'STEP_PROGRESS': {
      const progress = { ...state.progress, [action.step]: Math.min(99, action.pct) };
      return { ...state, progress };
    }
    case 'STEP_DONE': {
      const statuses = { ...state.statuses, [action.step]: action.status };
      return { ...state, statuses, progress: { ...state.progress, [action.step]: 100 } };
    }
    case 'PIPELINE_DONE':
      return { ...state, current: null };
    case 'PIPELINE_START':
      return { ...state, statuses:{}, progress:{}, startedAt: Date.now() };
    case 'STOP':
      return { ...state, current: null };
    case 'RESET':
      return { ...INITIAL_RUN, enabled: state.enabled };
    default: return state;
  }
}

// ─── Navigation ──────────────────────────────────────────────────────────────
const NAV = [
  { id:'dashboard',   label:'Tableau de bord', icon: Icon.home },
  { id:'pipeline',    label:'Pipeline',         icon: Icon.pipeline },
  { id:'configuration',label:'Configuration',   icon: Icon.sliders },
  { id:'console',     label:'Console',          icon: Icon.terminal },
  { id:'viewer',      label:'Visualisation 3D', icon: Icon.cube },
  { id:'results',     label:'Résultats',        icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  )},
  { id:'explorer',    label:'Explorateur',      icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
  )},
];

// ─── App ─────────────────────────────────────────────────────────────────────
function App() {
  const [view,      setView]     = useStateA('dashboard');
  const [cfg,       setCfg]      = useStateA(DEFAULT_CFG);
  const [runState,  dispatch]    = useReducerA(runReducer, INITIAL_RUN);
  const [logs,      setLogs]     = useStateA([]);
  const [projectDir,setProjectDir] = useStateA('');
  const [connected,      setConnected]     = useStateA(false);
  const [gpuInfo,        setGpuInfo]       = useStateA('Connexion…');
  const [gpuName,        setGpuName]       = useStateA('');
  const [cpuName,        setCpuName]       = useStateA('CPU');
  const [showSetup,      setShowSetup]     = useStateA(false);
  const [recentProjects, setRecentProjects]= useStateA(
    () => JSON.parse(localStorage.getItem('recentProjects') || '[]')
  );
  // ── Licence ──────────────────────────────────────────────────────────────
  // null = vérification en cours, true = ok, false = gate requise
  const [licenseOk, setLicenseOk] = useStateA(null);
  const _currentStep  = useRefA('');   // step en cours (pour parsing logs)
  const _simTimer     = useRefA(null); // timer simulation progression

  // ── Vérification licence au démarrage ────────────────────────────────────
  useEffectA(() => {
    // Réponse immédiate depuis le cache local (pas de délai réseau)
    // Le thread de fond pingera Render et émettra 'license_updated' si besoin
    fetch('/api/license/status')
      .then(r => r.json())
      .then(d => setLicenseOk(d.valid || d.reason === 'dev_mode'))
      .catch(() => setLicenseOk(true)); // fail open
  }, []);

  // ── WebSocket events ──────────────────────────────────────────────────────
  useEffectA(() => {
    socket.on('connect', () => {
      setConnected(true);
      fetch('/api/system').then(r => r.json()).then(d => {
        const gpu = d.gpu      || '';
        const cpu = d.cpu_name || 'CPU';
        setGpuName(gpu);
        setCpuName(cpu);
        setGpuInfo(d.cuda_ok && gpu ? `CUDA · ${gpu}` : `CPU · ${cpu}`);
      }).catch(() => {});
    });
    socket.on('setup_required',()  => setShowSetup(true));
    socket.on('disconnect',    ()  => { setConnected(false); setGpuInfo('Déconnecté'); });
    socket.on('project_set',   (d) => setProjectDir(d.path));

    socket.on('log', (d) => {
      setLogs(prev => [...prev, { t: hhmmss(), lvl: d.lvl || 'info', msg: d.msg }]);
      // Parse progress depuis les logs pose2sim
      const msg = d.msg || '';
      const tqdmMatch  = msg.match(/(\d+)%\|/);            // tqdm "50%|████"
      const frameMatch = msg.match(/\[info\]\s*Frame\s+(\d+)/i); // IK "[info] Frame 450"
      if (tqdmMatch) {
        dispatch({ type:'STEP_PROGRESS', step: _currentStep.current, pct: parseInt(tqdmMatch[1]) });
      } else if (frameMatch) {
        // Estime le % sur la base des frames vues (on accumule)
        dispatch({ type:'STEP_PROGRESS', step: _currentStep.current,
                   pct: Math.min(95, (parseInt(frameMatch[1]) / 10)) });
      }
    });

    socket.on('step_start', (d) => {
      _currentStep.current = d.step;
      dispatch({ type:'STEP_START', step: d.step });
      // Simulation : incrémente lentement jusqu'à 90% max
      clearInterval(_simTimer.current);
      let pct = 0;
      _simTimer.current = setInterval(() => {
        pct = Math.min(90, pct + 0.8 + Math.random() * 0.5);
        dispatch({ type:'STEP_PROGRESS', step: d.step, pct: Math.round(pct) });
      }, 600);
    });
    socket.on('step_done', (d) => {
      clearInterval(_simTimer.current);
      _currentStep.current = '';
      dispatch({ type:'STEP_DONE', step: d.step, status: d.status });
    });
    socket.on('pipeline_start',(d) => dispatch({ type:'PIPELINE_START' }));
    socket.on('pipeline_done', ()  => dispatch({ type:'PIPELINE_DONE' }));

    // Mise à jour licence depuis le thread de fond (recheck Render async)
    socket.on('license_updated', d => {
      setLicenseOk(d.valid || d.reason === 'dev_mode');
    });

    return () => socket.removeAllListeners();
  }, []);

  // ── Actions pipeline ──────────────────────────────────────────────────────
  function dispatchRun(action) {
    if (action.type === 'CLEAR_LOGS') { setLogs([]); return; }
    if (action.type === 'STOP') {
      fetch('/api/stop', { method:'POST' });
      dispatch({ type:'STOP' });
      return;
    }
    if (action.type === 'RUN_ALL' || action.type === 'RUN_ONE') {
      const steps = action.type === 'RUN_ALL'
        ? STEPS.filter((_, i) => runState.enabled[i]).map(s => s.id)
        : [action.id];

      fetch('/api/run', {
        method:  'POST',
        headers: { 'Content-Type':'application/json' },
        body:    JSON.stringify({ steps }),
      }).catch(e => setLogs(prev => [...prev,
        { t: hhmmss(), lvl:'error', msg:`Erreur réseau : ${e.message}` }]));
      return;
    }
    dispatch(action);
  }

  // ── Chargement config ─────────────────────────────────────────────────────
  async function loadConfig(path) {
    try {
      const res = await fetch(`/api/config`);
      if (!res.ok) return;
      const data = await res.json();
      // Deep merge : fusionne récursivement sans écraser les sous-objets
      setCfg(prev => deepMerge(prev, data));
    } catch(e) {}
  }

  function deepMerge(base, override) {
    const result = { ...base };
    for (const key of Object.keys(override)) {
      if (override[key] && typeof override[key] === 'object' && !Array.isArray(override[key])
          && base[key] && typeof base[key] === 'object') {
        result[key] = deepMerge(base[key], override[key]);
      } else {
        result[key] = override[key];
      }
    }
    return result;
  }

  // ── Sélection projet ──────────────────────────────────────────────────────
  async function handleSetProject(path) {
    await fetch('/api/project', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ path }),
    });
    setProjectDir(path);
    socket.emit('set_project', { path });
    loadConfig(path);
    // Mémorise dans les récents
    setRecentProjects(prev => {
      const list = [path, ...prev.filter(p => p !== path)].slice(0, 8);
      localStorage.setItem('recentProjects', JSON.stringify(list));
      return list;
    });
    setLogs(prev => [...prev, { t:hhmmss(), lvl:'ok', msg:`✓ Projet : ${path}` }]);
  }

  const project = { name: projectDir.split(/[/\\]/).pop() || 'Aucun', path: projectDir };

  // Pill dynamique basée sur le device configuré
  const deviceLabel = (() => {
    if (!connected) return 'Connexion…';
    const d = cfg?.pose?.device || 'auto';
    if (d === 'CUDA')      return gpuName ? `CUDA · ${gpuName}` : 'CUDA · GPU';
    if (d === 'CPU')       return `CPU · ${cpuName}`;
    if (d === 'DirectML')  return `DirectML · ${gpuName || 'GPU'}`;
    if (d === 'MPS')       return 'MPS · Apple GPU';
    if (d === 'ROCM')      return `ROCm · ${gpuName || 'AMD GPU'}`;
    // auto → meilleur dispo
    return gpuInfo || 'auto';
  })();

  // ── Mode REK — layout dédié (titlebar minimal + RecMode plein écran) ────────
  if (view === 'rec') {
    return (
      <>
        {showSetup && <SetupScreen onDone={() => setShowSetup(false)}/>}
        <div className="window">
          <div className="titlebar">
            <div className="title" style={{ cursor:'pointer', WebkitAppRegion:'no-drag' }}
                 onClick={() => setView('dashboard')} title="Retour au tableau de bord">
              <div className="title-app">
                <img src="assets/oxymore-logo.png" alt="Oxymore Vision"/>
                <span style={{ fontWeight:600, color:'var(--fg-0)', letterSpacing:'0.04em' }}>OXYMORE VISION</span>
              </div>
            </div>
            <div className="win-controls">
              <button className="win-ctrl" title="Réduire"
                      onClick={() => window.pywebview?.api?.minimize()}>
                <svg viewBox="0 0 10 10"><path d="M0 5h10" stroke="currentColor" strokeWidth="1" fill="none"/></svg>
              </button>
              <button className="win-ctrl" title="Agrandir"
                      onClick={() => window.pywebview?.api?.toggle_maximize()}>
                <svg viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" strokeWidth="1" fill="none"/></svg>
              </button>
              <button className="win-ctrl close" title="Fermer"
                      onClick={() => window.pywebview?.api?.close()}>
                <svg viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1" fill="none"/></svg>
              </button>
            </div>
          </div>
          <div style={{ flex:1, minHeight:0, display:'flex', overflow:'hidden' }}>
            <RecMode project={project} onExit={() => setView('dashboard')}/>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
    {showSetup && <SetupScreen onDone={() => setShowSetup(false)}/>}
    <div className="window">
      {/* Title bar */}
      <div className="titlebar">
        <div className="title">
          <div className="title-app">
            <img src="assets/oxymore-logo.png" alt="Oxymore Vision"/>
            <span style={{fontWeight:600,color:'var(--fg-0)',letterSpacing:'0.04em'}}>OXYMORE VISION</span>
          </div>
          <span style={{color:'var(--fg-4)',marginLeft:4}}>·</span>
          <span style={{color:'var(--fg-2)',fontWeight:500}}>{project.name || 'Aucun projet'}</span>
        </div>

        <MenuBar
          onNav={setView}
          onNewProject={() => setView('dashboard')}
          onOpenProject={async () => {
            const res = await fetch('/api/browse-folder', { method:'POST' });
            const d   = await res.json();
            if (d.path) handleSetProject(d.path);
          }}
          onSave={() => {
            fetch('/api/config', { method:'POST',
              headers:{'Content-Type':'application/json'},
              body: JSON.stringify(cfg) });
          }}
          onRunAll={() => dispatchRun({ type:'RUN_ALL' })}
          onStop={()  => dispatchRun({ type:'STOP' })}
          onSetProject={handleSetProject}
          projectDir={projectDir}
          recentProjects={recentProjects}
        />

        <div className="right">
          {/* Bouton REK : ouvre le mode REK */}
          <button
            onClick={() => setView('rec')}
            title="Mode REK — capture vidéo multi-appareils"
            style={{
              display:'flex', alignItems:'center', gap:6,
              padding:'5px 12px', borderRadius:999,
              background: view === 'rec' ? '#ff4444' : 'rgba(255,68,68,0.1)',
              border: `1px solid ${view === 'rec' ? '#ff4444' : 'rgba(255,68,68,0.3)'}`,
              color: view === 'rec' ? '#fff' : '#ff6b6b',
              fontSize:11, fontWeight:600, letterSpacing:'0.08em',
              cursor:'pointer', transition:'all 0.15s ease',
            }}>
            <span style={{
              width:6, height:6, borderRadius:'50%',
              background: view === 'rec' ? '#fff' : '#ff4444',
              boxShadow: view === 'rec' ? '0 0 6px rgba(255,255,255,0.6)' : 'none',
            }}/>
            REK
          </button>
          <div className="status-pill">
            <span className="led" style={{background: connected ? 'var(--success)' : 'var(--error)'}}/>
            {deviceLabel}
          </div>
          <span style={{color:'var(--fg-4)'}}>v2.0.0</span>
        </div>

        <div className="win-controls">
          <button className="win-ctrl" title="Réduire"
                  onClick={() => window.pywebview?.api?.minimize()}>
            <svg viewBox="0 0 10 10"><path d="M0 5h10" stroke="currentColor" strokeWidth="1" fill="none"/></svg>
          </button>
          <button className="win-ctrl" title="Agrandir"
                  onClick={() => window.pywebview?.api?.toggle_maximize()}>
            <svg viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" strokeWidth="1" fill="none"/></svg>
          </button>
          <button className="win-ctrl close" title="Fermer"
                  onClick={() => window.pywebview?.api?.close()}>
            <svg viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1" fill="none"/></svg>
          </button>
        </div>
      </div>

      <div className="body">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="brand">
            <img src="assets/oxymore-logo.png" alt="Oxymore Vision" className="brand-wordmark"/>
            <div className="brand-tag">Markerless MoCap</div>
          </div>

          {/* Projet selector inline */}
          <div style={{padding:'8px 12px'}}>
            <div style={{fontSize:10,color:'var(--fg-4)',letterSpacing:'0.08em',
                         textTransform:'uppercase',marginBottom:6}}>Projet actif</div>
            <input
              value={projectDir}
              onChange={e => setProjectDir(e.target.value)}
              onBlur={e => { if(e.target.value) handleSetProject(e.target.value); }}
              onKeyDown={e => { if(e.key==='Enter' && projectDir) handleSetProject(projectDir); }}
              placeholder="C:\MoCap\MonProjet"
              style={{
                width:'100%', background:'rgba(255,255,255,0.04)',
                border:'1px solid var(--line)', borderRadius:6,
                padding:'6px 8px', color:'var(--fg-1)',
                fontFamily:'var(--font-mono)', fontSize:10,
                outline:'none',
              }}
            />
          </div>

          <div className="nav-label">Navigation</div>
          {NAV.map(n => (
            <div key={n.id}
                 className={`nav-item ${view === n.id ? 'active' : ''}`}
                 onClick={() => setView(n.id)}>
              <div style={{width:16,height:16}}>{n.icon}</div>
              <span>{n.label}</span>
              {n.id === 'console' && logs.length > 0 && (
                <span className="badge">{logs.length}</span>
              )}
              {n.id === 'pipeline' && runState.current != null && (
                <span className="badge pulse">●</span>
              )}
            </div>
          ))}

          <div className="nav-label">Étapes</div>
          {STEPS.map((s, i) => {
            const status = runState.statuses[s.id];
            return (
              <div key={s.id} className="nav-item" style={{paddingLeft:12}}
                   onClick={() => setView('pipeline')}>
                <span style={{fontFamily:'var(--font-mono)',fontSize:10,color:'var(--fg-4)',
                               width:16,flex:'0 0 16px',textAlign:'right'}}>
                  {String(i+1).padStart(2,'0')}
                </span>
                <span style={{fontSize:12.5}}>{s.label}</span>
                <span style={{
                  marginLeft:'auto', width:6, height:6, borderRadius:'50%',
                  background: status==='done'    ? 'var(--success)'
                            : status==='running' ? '#fff'
                            : status==='error'   ? 'var(--error)'
                            : 'var(--fg-4)',
                  boxShadow: status==='running' ? '0 0 6px rgba(255,255,255,0.8)' : 'none',
                  animation: status==='running' ? 'pulse-soft 1s infinite' : 'none',
                  opacity: runState.enabled[i] ? 1 : 0.3,
                }}/>
              </div>
            );
          })}

          <div className="sidebar-footer">
            <div className="project-card">
              <div className="pl">Projet actif</div>
              <div className="pn"><span className="dot"/> {project.name || '—'}</div>
              <div className="pp">{project.path || 'Aucun projet sélectionné'}</div>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="content">
          {/* Banner licence invalide */}
          {licenseOk === false && view !== 'key_manager' && (
            <div style={{
              display:'flex', alignItems:'center', justifyContent:'space-between',
              padding:'9px 20px', flexShrink:0,
              background:'rgba(246,196,78,0.10)',
              borderBottom:'1px solid rgba(246,196,78,0.25)',
            }}>
              <span style={{ fontSize:12, color:'var(--warn)' }}>
                ⚠  Licence invalide — certaines fonctions sont désactivées
              </span>
              <button className="btn sm" onClick={() => setView('key_manager')}
                      style={{ color:'var(--warn)', borderColor:'rgba(246,196,78,0.4)' }}>
                🔑 Gérer la licence
              </button>
            </div>
          )}
          {view === 'dashboard'     && <Dashboard onNav={setView} onOpen={() => setView('pipeline')} projectDir={projectDir} onSetProject={handleSetProject}/>}
          {view === 'pipeline'      && <Pipeline runState={runState} dispatchRun={dispatchRun} project={project} licenseValid={licenseOk}/>}
          {view === 'results'       && <Results project={project}/>}
          {view === 'configuration' && <Configuration cfg={cfg} setCfg={setCfg} project={project} onReloadConfig={() => loadConfig(projectDir)}/>}
          {view === 'console'       && <ConsoleView logs={logs} runState={runState} dispatchRun={dispatchRun}/>}
          {view === 'viewer'        && <Viewer3D project={project}/>}
          {view === 'explorer'      && <Explorer projectDir={projectDir}/>}
          {view === 'dependencies'  && <Dependencies/>}
          {view === 'key_manager'   && <KeyManager onLicenseActivated={v => setLicenseOk(v === false ? false : true)}/>}
        </main>
      </div>
    </div>
    </>
  );
}

function hhmmss() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
}

function Mount() {
  return <div className="scaler"><App/></div>;
}

const root = ReactDOM.createRoot(document.getElementById('app'));
root.render(<Mount/>);
