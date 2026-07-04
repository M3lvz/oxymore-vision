// dashboard.jsx — Tableau de bord connecté au backend réel

const { useState: useStateDash, useEffect: useEffectDash, useRef: useRefDash } = React;

// ─── Statut projet basé sur les dossiers existants ───────────────────────────
function detectStatus(folders) {
  if (!folders) return 'idle';
  if (folders.includes('kinematics')) return 'done';
  if (folders.includes('pose-3d'))    return 'partial';
  if (folders.includes('pose'))       return 'partial';
  return 'idle';
}

function detectProgress(folders) {
  if (!folders) return 0;
  const steps = ['pose','pose-associated','pose-3d','kinematics'];
  const done = steps.filter(s => folders.includes(s)).length;
  return Math.round((done / steps.length) * 100);
}

// ─── Actions inline projet ────────────────────────────────────────────────────
function ProjectMenu({ project, onRefresh, onSetProject, onNav }) {
  const [open,    setOpen]    = useStateDash(false);
  const [confirm, setConfirm] = useStateDash(null);

  async function doClean(e) {
    e.stopPropagation();
    const res  = await fetch('/api/clean', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ path: project.path }) });
    const data = await res.json();
    setConfirm(null); setOpen(false);
    if (data.ok) onRefresh?.();
    else alert('Erreur nettoyage : ' + (data.error || 'inconnue'));
  }

  async function doDelete(e) {
    e.stopPropagation();
    const res  = await fetch('/api/files/delete', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ path: project.path }) });
    const data = await res.json();
    setConfirm(null); setOpen(false);
    if (data.ok) onRefresh?.();
    else alert('Erreur suppression : ' + (data.error || 'inconnue'));
  }

  const S = { // styles boutons
    wrap:    { display:'flex', gap:4, justifyContent:'flex-end', alignItems:'center' },
    label:   { fontSize:10, whiteSpace:'nowrap', alignSelf:'center' },
    btn:     { padding:'3px 8px' },
  };

  if (confirm === 'clean') return (
    <div style={S.wrap} onClick={e=>e.stopPropagation()}>
      <span style={{...S.label, color:'var(--warn)'}}>Nettoyer ?</span>
      <button className="btn sm" style={{...S.btn,color:'var(--warn)',borderColor:'rgba(245,198,108,0.4)'}}
              onClick={doClean}>Oui</button>
      <button className="btn sm ghost" style={S.btn}
              onClick={e=>{e.stopPropagation();setConfirm(null);setOpen(false);}}>Non</button>
    </div>
  );

  if (confirm === 'delete') return (
    <div style={S.wrap} onClick={e=>e.stopPropagation()}>
      <span style={{...S.label, color:'var(--error)'}}>Supprimer ?</span>
      <button className="btn sm" style={{...S.btn,color:'var(--error)',borderColor:'rgba(255,122,122,0.4)'}}
              onClick={doDelete}>Oui</button>
      <button className="btn sm ghost" style={S.btn}
              onClick={e=>{e.stopPropagation();setConfirm(null);setOpen(false);}}>Non</button>
    </div>
  );

  if (open) return (
    <div style={S.wrap} onClick={e=>e.stopPropagation()}>
      <button className="btn sm icon ghost" title="Pipeline"
              onClick={e=>{e.stopPropagation();onSetProject?.(project.path);onNav?.('pipeline');}}>
        {Icon.play}
      </button>
      <button className="btn sm icon ghost" title="Explorateur"
              onClick={e=>{e.stopPropagation();onSetProject?.(project.path);onNav?.('explorer');}}>
        {Icon.folder}
      </button>
      <button className="btn sm icon ghost" title="Nettoyer les résultats"
              onClick={e=>{e.stopPropagation();setConfirm('clean');}}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" style={{width:13,height:13}}>
          <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"/>
        </svg>
      </button>
      <button className="btn sm icon ghost" title="Supprimer le projet"
              onClick={e=>{e.stopPropagation();setConfirm('delete');}}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" style={{width:13,height:13}}>
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
        </svg>
      </button>
      <button className="btn sm icon ghost"
              onClick={e=>{e.stopPropagation();setOpen(false);}}>✕</button>
    </div>
  );

  return (
    <div style={{textAlign:'right'}} onClick={e=>e.stopPropagation()}>
      <button className="btn sm icon ghost"
              onClick={e=>{e.stopPropagation();setOpen(true);}}>
        {Icon.more}
      </button>
    </div>
  );
}

// ─── Composants UI ───────────────────────────────────────────────────────────
function StatusDot({ status }) {
  const map = {
    done:    { c: 'var(--success)', l: 'Terminé' },
    running: { c: '#fff',           l: 'En cours' },
    partial: { c: 'var(--warn)',    l: 'Partiel' },
    idle:    { c: 'var(--fg-4)',    l: 'Inactif' },
    error:   { c: 'var(--error)',   l: 'Erreur' },
  };
  const m = map[status] || map.idle;
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:11, color:'var(--fg-2)' }}>
      <span style={{
        width:6, height:6, borderRadius:'50%', background:m.c,
        boxShadow: (status==='running'||status==='done') ? `0 0 8px ${m.c}` : 'none',
        animation: status==='running' ? 'pulse-soft 1.2s ease-in-out infinite' : 'none',
      }}/>
      {m.l}
    </span>
  );
}

function MiniProgress({ value }) {
  return (
    <div style={{ width:110, height:4, borderRadius:2, background:'rgba(255,255,255,0.06)', overflow:'hidden' }}>
      <div style={{
        width:`${value}%`, height:'100%', background:'#fff',
        boxShadow:'0 0 6px rgba(255,255,255,0.4)', transition:'width .4s ease',
      }}/>
    </div>
  );
}

// ─── Dialogue nouveau projet ──────────────────────────────────────────────────
function NewProjectModal({ onClose, onCreated, initialPath }) {
  const [name, setName] = useStateDash('');
  // Bug #3 fix : utilise le chemin courant du dashboard, pas un chemin hardcodé
  const [path, setPath] = useStateDash(initialPath || '');
  const [loading, setLoading] = useStateDash(false);
  const [err, setErr] = useStateDash('');

  async function create() {
    if (!name.trim()) { setErr('Nom requis'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/projects/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), parent: path }),
      });
      const data = await res.json();
      if (data.error) { setErr(data.error); return; }
      onCreated(data.path);
      onClose();
    } catch(e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:999,
      background:'rgba(0,0,0,0.7)', backdropFilter:'blur(8px)',
      display:'flex', alignItems:'center', justifyContent:'center',
    }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{
        width:440, background:'var(--bg-3)', border:'1px solid var(--line-2)',
        borderRadius:16, overflow:'hidden', boxShadow:'0 30px 60px rgba(0,0,0,0.7)',
      }}>
        <div style={{ padding:'24px 24px 0', borderBottom:'1px solid var(--line)' }}>
          <div style={{ fontSize:16, fontWeight:600, color:'var(--fg-0)', marginBottom:4 }}>
            Nouveau projet
          </div>
          <div style={{ fontSize:12, color:'var(--fg-3)', paddingBottom:16 }}>
            Crée la structure de dossiers pose2sim
          </div>
        </div>
        <div style={{ padding:24, display:'flex', flexDirection:'column', gap:14 }}>
          {/* Nom */}
          <div>
            <div style={{ fontSize:10, color:'var(--fg-4)', letterSpacing:'0.08em',
                          textTransform:'uppercase', marginBottom:6 }}>Nom du projet</div>
            <input value={name} onChange={e=>setName(e.target.value)}
                   placeholder="MonProjet_MoCap"
                   style={{ width:'100%', background:'rgba(255,255,255,0.04)',
                            border:'1px solid var(--line-2)', borderRadius:8,
                            padding:'8px 12px', color:'var(--fg-1)',
                            fontFamily:'var(--font-mono)', fontSize:12, outline:'none' }}/>
          </div>

          {/* Dossier parent + bouton parcourir */}
          <div>
            <div style={{ fontSize:10, color:'var(--fg-4)', letterSpacing:'0.08em',
                          textTransform:'uppercase', marginBottom:6 }}>Dossier parent</div>
            <div style={{ display:'flex', gap:6 }}>
              <input value={path} onChange={e=>setPath(e.target.value)}
                     placeholder="E:\MoCap\Projects"
                     style={{ flex:1, background:'rgba(255,255,255,0.04)',
                              border:'1px solid var(--line-2)', borderRadius:8,
                              padding:'8px 12px', color:'var(--fg-1)',
                              fontFamily:'var(--font-mono)', fontSize:12, outline:'none' }}/>
              <button className="btn" title="Parcourir" style={{padding:'0 14px', alignSelf:'stretch', display:'flex', alignItems:'center'}}
                      onClick={async () => {
                        const res = await fetch('/api/browse-folder', { method:'POST' });
                        const d   = await res.json();
                        if (d.path) setPath(d.path);
                      }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
                     style={{width:14,height:14}}>
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
              </button>
            </div>
          </div>

          {err && <div style={{ fontSize:11, color:'var(--error)' }}>{err}</div>}

          {/* Aperçu chemin — sans overflow */}
          <div style={{ fontSize:11, color:'var(--fg-4)', background:'rgba(255,255,255,0.02)',
                        border:'1px solid var(--line)', borderRadius:8, padding:'10px 12px' }}>
            <div style={{ fontFamily:'var(--font-mono)', color:'var(--fg-2)',
                          wordBreak:'break-all', lineHeight:1.5 }}>
              {path}{'\\' }{name || 'MonProjet'}{'\\'}
            </div>
            <div style={{ marginTop:4, color:'var(--fg-4)' }}>
              avec videos/, calibration/, Config.toml
            </div>
          </div>
        </div>
        <div style={{ padding:'0 24px 24px', display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button className="btn" onClick={onClose}>Annuler</button>
          <button className="btn primary" onClick={create} disabled={loading}>
            {loading ? 'Création…' : 'Créer le projet'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Quest Hand & Head Tracking banner ───────────────────────────────────────
const _HAND_FUSION_IDX = window.STEPS
  ? window.STEPS.findIndex(s => s.id === 'handFusion')
  : 8;

function QuestBanner({ projectDir, onNav, runState, dispatchRun }) {
  const [detected, setDetected] = useStateDash(false);
  const [hasHead,  setHasHead]  = useStateDash(false);

  const fusionIdx = window.STEPS ? window.STEPS.findIndex(s => s.id === 'handFusion') : 8;

  useEffectDash(() => {
    if (!projectDir) { setDetected(false); setHasHead(false); return; }

    function check() {
      fetch(`/api/rec/hand/check?project=${encodeURIComponent(projectDir)}`)
        .then(r => r.json())
        .then(d => {
          setDetected(!!d.exists);
          setHasHead(!!d.has_head);
          if (d.exists && dispatchRun && runState) {
            const key = `handFusion_disabled_${projectDir}`;
            if (localStorage.getItem(key) !== '1' && !runState.enabled[fusionIdx]) {
              dispatchRun({ type: 'TOGGLE_STEP', id: 'handFusion' });
            }
          }
        })
        .catch(() => {});
    }

    check();
    const id = setInterval(check, 5000);
    return () => clearInterval(id);
  }, [projectDir]);

  const enabled = !!(runState?.enabled?.[fusionIdx]);

  function toggle() {
    if (!detected || !dispatchRun) return;
    const key = `handFusion_disabled_${projectDir}`;
    if (enabled) localStorage.setItem(key, '1');
    else localStorage.removeItem(key);
    dispatchRun({ type: 'TOGGLE_STEP', id: 'handFusion' });
  }

  const active = detected && enabled;

  return (
    <div style={{
      marginTop: 18,
      padding: '16px 24px 16px 10px',
      borderRadius: 14,
      background: active
        ? 'linear-gradient(135deg, rgba(109,40,217,0.13) 0%, rgba(139,92,246,0.07) 100%)'
        : 'rgba(255,255,255,0.02)',
      border: `1px solid ${active ? 'rgba(139,92,246,0.35)' : 'var(--line)'}`,
      display: 'flex',
      alignItems: 'center',
      gap: 20,
      overflow: 'visible',
      transition: 'border-color .3s, background .3s',
    }}>
      {/* Image Quest — dépasse légèrement */}
      <img src="/quest.webp" alt="Meta Quest" style={{
        width: 110, height: 110, flexShrink: 0,
        objectFit: 'contain',
        marginTop: -18, marginBottom: -18, marginLeft: 4,
        opacity: active ? 1 : 0.35,
        transition: 'opacity .3s, filter .3s',
        filter: active ? 'drop-shadow(0 4px 16px rgba(139,92,246,0.4))' : 'none',
      }} />

      {/* Texte */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 600, marginBottom: 3,
          color: active ? 'rgba(196,181,253,1)' : 'var(--fg-2)',
          transition: 'color .3s',
        }}>
          Hand & Head Tracking — Meta Quest
          <span style={{
            marginLeft: 7, fontSize: 9, fontWeight: 600, letterSpacing: '0.06em',
            padding: '1px 6px', borderRadius: 999,
            background: 'rgba(245,158,11,0.15)',
            border: '1px solid rgba(245,158,11,0.35)',
            color: 'rgba(251,191,36,0.9)',
            verticalAlign: 'middle', textTransform: 'uppercase',
          }}>beta</span>
          {detected && hasHead && <span style={{
            marginLeft: 8, fontSize: 10, fontWeight: 500,
            padding: '1px 7px', borderRadius: 999,
            background: 'rgba(139,92,246,0.2)',
            border: '1px solid rgba(139,92,246,0.4)',
            color: 'rgba(196,181,253,0.9)',
            verticalAlign: 'middle',
          }}>mains + tête</span>}
        </div>
        <div style={{
          fontSize: 12, lineHeight: 1.45,
          color: active ? 'rgba(167,139,250,0.75)' : 'var(--fg-4)',
          transition: 'color .3s',
        }}>
          {!detected
            ? 'Enregistrez une session Hand Tracking Streamer pour activer la fusion mains + tête dans le pipeline.'
            : active
              ? 'Fusion active — les doigts et la pose tête Quest seront fusionnés avec la cinématique corps.'
              : 'Données Quest disponibles. Activez le toggle pour fusionner avec la cinématique corps.'}
        </div>
      </div>

      {/* Toggle */}
      <div
        title={!detected ? 'Aucune donnée Quest détectée' : enabled ? 'Désactiver la fusion Quest' : 'Activer la fusion Quest'}
        onClick={toggle}
        style={{
          width: 44, height: 24, borderRadius: 12, flexShrink: 0,
          background: active ? 'rgba(139,92,246,0.85)' : 'rgba(255,255,255,0.12)',
          position: 'relative',
          cursor: detected ? 'pointer' : 'not-allowed',
          opacity: detected ? 1 : 0.4,
          transition: 'background .25s, opacity .25s',
          boxShadow: active ? '0 0 10px rgba(139,92,246,0.4)' : 'none',
        }}
      >
        <div style={{
          position: 'absolute',
          width: 18, height: 18, borderRadius: '50%',
          background: '#fff',
          top: 3, left: enabled ? 23 : 3,
          transition: 'left .2s',
          boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
        }} />
      </div>
    </div>
  );
}

// ─── Dashboard principal ──────────────────────────────────────────────────────
function Dashboard({ onOpen, onNav, projectDir, onSetProject, runState, dispatchRun }) {
  const [filter,     setFilter]    = useStateDash('Tous');
  const [projects,   setProjects]  = useStateDash([]);
  const [loading,    setLoading]   = useStateDash(false);
  // Bug #2 fix : localStorage → survit aux rechargements, portable entre machines
  const [parentDir,  setParentDir] = useStateDash(
    () => localStorage.getItem('oxymore_parent_dir') || ''
  );
  const [sysInfo,    setSysInfo]   = useStateDash(null);
  const [showNew,    setShowNew]   = useStateDash(false);

  // Sauvegarde le chemin parent dans localStorage à chaque changement
  function updateParentDir(dir) {
    setParentDir(dir);
    localStorage.setItem('oxymore_parent_dir', dir);
  }

  // ── Charger les projets ────────────────────────────────────────────────────
  async function loadProjects(parent) {
    setLoading(true);
    try {
      const res = await fetch('/api/projects/scan', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ parent }),
      });
      const data = await res.json();
      setProjects(data.projects || []);
    } catch(e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  // ── Charger les infos système ──────────────────────────────────────────────
  async function loadSysInfo() {
    try {
      const res = await fetch('/api/system');
      const data = await res.json();
      setSysInfo(data);
    } catch(e) {}
  }

  useEffectDash(() => {
    loadProjects(parentDir);
    loadSysInfo();
    // Rafraîchit les infos système toutes les 5s
    const id = setInterval(loadSysInfo, 5000);
    return () => clearInterval(id);
  }, []);

  // ── Filtrage ──────────────────────────────────────────────────────────────
  const filtered = projects.filter(p => {
    if (filter === 'Tous')    return true;
    if (filter === 'Actifs')  return p.status === 'partial' || p.status === 'running';
    if (filter === 'Terminés')return p.status === 'done';
    if (filter === 'Archivés')return p.status === 'idle';
    return true;
  });

  const doneCnt    = projects.filter(p => p.status === 'done').length;
  const activeCnt  = projects.filter(p => p.status === 'partial' || p.status === 'running').length;

  function handleOpen(p) {
    onSetProject?.(p.path);
  }

  return (
    <>
      {showNew && (
        <NewProjectModal
          onClose={() => setShowNew(false)}
          onCreated={path => { loadProjects(parentDir); onSetProject?.(path); }}
          initialPath={parentDir}
        />
      )}

      <div className="page-head">
        <div>
          <h1>Tableau de bord</h1>
          <div className="sub">
            {projects.length} projet{projects.length > 1 ? 's' : ''} · {activeCnt} actif{activeCnt > 1 ? 's' : ''} · {new Date().toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' })}
          </div>
        </div>
        <div className="head-actions">
          {/* Dossier parent */}
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            <input
              value={parentDir}
              onChange={e => updateParentDir(e.target.value)}
              onBlur={() => parentDir && loadProjects(parentDir)}
              onKeyDown={e => e.key==='Enter' && parentDir && loadProjects(parentDir)}
              placeholder="Dossier parent des projets…"
              style={{
                background:'rgba(255,255,255,0.04)', border:'1px solid var(--line)',
                borderRadius:8, padding:'6px 10px', color:'var(--fg-2)',
                fontFamily:'var(--font-mono)', fontSize:11, width:320, outline:'none',
              }}
            />
            <button className="btn sm icon" title="Parcourir"
                    onClick={async () => {
                      const res = await fetch('/api/browse-folder', { method:'POST' });
                      const d   = await res.json();
                      if (d.path) { updateParentDir(d.path); loadProjects(d.path); }
                    }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" style={{width:13,height:13}}>
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
            </button>
            <button className="btn sm icon" onClick={() => loadProjects(parentDir)} title="Actualiser">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" style={{width:13,height:13}}>
                <path d="M1 4v6h6M23 20v-6h-6"/>
                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/>
              </svg>
            </button>
          </div>
          <button className="btn primary" onClick={() => setShowNew(true)}>
            {Icon.plus}<span>Nouveau projet</span>
          </button>
        </div>
      </div>

      <div className="page-body">
        {/* Stats */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:28 }}>
          <div className="stat">
            <div className="glow"/>
            <div className="lbl">Projets trouvés</div>
            <div className="val">{projects.length}<span className="unit">projets</span></div>
            <div className="sub">{doneCnt} terminés · {activeCnt} actifs</div>
          </div>
          <div className="stat">
            <div className="lbl">GPU</div>
            <div className="val" style={{fontSize:16,fontWeight:500}}>
              {sysInfo?.gpu || 'Détection…'}
            </div>
            <div className="sub">{sysInfo?.vram || '—'} VRAM</div>
          </div>
          <div className="stat">
            <div className="lbl">pose2sim</div>
            <div className="val" style={{fontSize:16,fontWeight:500}}>
              {sysInfo?.pose2sim || '—'}
            </div>
            <div className="sub">CUDA : {sysInfo?.cuda || '—'}</div>
          </div>
          <div className="stat">
            <div className="lbl">Pipeline</div>
            <div className="val" style={{ display:'flex', alignItems:'baseline', gap:8 }}>
              <span style={{ color: sysInfo?.pose2sim ? 'var(--success)' : 'var(--warn)' }}>●</span>
              <span style={{ fontSize:16, fontWeight:500, color:'var(--fg-2)' }}>
                {sysInfo?.pose2sim ? 'Opérationnel' : 'Vérification…'}
              </span>
            </div>
            <div className="sub">Oxymore Vision v2.0</div>
          </div>
        </div>

        {/* Liste projets */}
        <div className="card" style={{ overflow:'visible' }}>
          <div className="card-head">
            <div style={{ display:'flex', alignItems:'center', gap:14 }}>
              <h3>Projets récents</h3>
              <div className="segmented" style={{ marginLeft:8 }}>
                {['Tous','Actifs','Terminés','Archivés'].map(f => (
                  <button key={f} className={filter===f?'on':''} onClick={() => setFilter(f)}>{f}</button>
                ))}
              </div>
            </div>
            <div className="meta">{loading ? 'Chargement…' : `${filtered.length} projet${filtered.length>1?'s':''}`}</div>
          </div>

          {/* En-tête table */}
          <div style={{
            display:'grid', gridTemplateColumns:'minmax(0,1.6fr) 1fr 1fr 1fr 1.3fr 80px',
            gap:16, padding:'10px 20px', borderBottom:'1px solid var(--line)',
            fontSize:10.5, fontWeight:500, letterSpacing:'0.08em',
            textTransform:'uppercase', color:'var(--fg-4)',
          }}>
            {['Projet','Caméras','Vidéos','Dernier run','Progression',''].map(h => (
              <div key={h}>{h}</div>
            ))}
          </div>

          {/* Lignes */}
          {loading && (
            <div style={{ padding:40, textAlign:'center', color:'var(--fg-4)', fontSize:12 }}>
              Chargement des projets…
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div style={{ padding:40, textAlign:'center', color:'var(--fg-4)', fontSize:12 }}>
              Aucun projet trouvé dans <span style={{fontFamily:'var(--font-mono)'}}>{parentDir}</span>
              <br/><br/>
              <button className="btn primary" onClick={() => setShowNew(true)}>
                {Icon.plus}<span>Créer le premier projet</span>
              </button>
            </div>
          )}

          {!loading && filtered.map((p, i) => (
            <div key={p.path}
                 className="float-up"
                 style={{
                   display:'grid', gridTemplateColumns:'minmax(0,1.6fr) 1fr 1fr 1fr 1.3fr 80px',
                   gap:16, padding:'14px 20px',
                   borderBottom: i < filtered.length-1 ? '1px solid var(--line)' : 'none',
                   alignItems:'center', cursor:'pointer', transition:'background .15s ease',
                   animationDelay:`${i*60}ms`,
                   background: p.path === projectDir ? 'rgba(255,255,255,0.03)' : '',
                 }}
                 onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.025)'}
                 onMouseLeave={e => e.currentTarget.style.background = p.path===projectDir?'rgba(255,255,255,0.03)':''}
                 onClick={() => handleOpen(p)}>

              {/* Nom */}
              <div>
                <div style={{ fontSize:14, fontWeight:500, color:'var(--fg-0)', display:'flex', alignItems:'center', gap:8 }}>
                  {p.name}
                  {p.path === projectDir && (
                    <span style={{ fontSize:9, fontFamily:'var(--font-mono)', padding:'1px 6px',
                                   borderRadius:999, background:'rgba(110,231,167,0.15)',
                                   color:'var(--success)', border:'1px solid rgba(110,231,167,0.3)' }}>actif</span>
                  )}
                </div>
                <div style={{ position:'relative', overflow:'hidden', maxWidth:'100%', marginTop:2 }}>
                  <div className="mono" style={{ fontSize:10.5, color:'var(--fg-4)',
                                                 whiteSpace:'nowrap', overflow:'hidden' }}>
                    {p.path}
                  </div>
                  <div style={{ position:'absolute', right:0, top:0, bottom:0, width:40,
                                background:'linear-gradient(to right, transparent, var(--bg-2))' }}/>
                </div>
              </div>

              {/* Caméras */}
              <div style={{ fontSize:12, color:'var(--fg-2)' }}>
                {p.nb_cameras > 0
                  ? <><span className="mono">{p.nb_cameras}</span> caméras</>
                  : <span style={{ color:'var(--fg-4)' }}>—</span>}
              </div>

              {/* Vidéos */}
              <div style={{ fontSize:12, color:'var(--fg-2)' }}>
                {p.nb_videos > 0
                  ? <><span className="mono">{p.nb_videos}</span> vidéo{p.nb_videos>1?'s':''}</>
                  : <span style={{ color:'var(--fg-4)' }}>Aucune</span>}
              </div>

              {/* Dernier run */}
              <div style={{ fontSize:12, color:'var(--fg-2)' }}>
                {p.last_run || <span style={{ color:'var(--fg-4)' }}>Jamais</span>}
              </div>

              {/* Progression */}
              <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                <StatusDot status={p.status}/>
                <MiniProgress value={p.progress}/>
              </div>

              {/* Menu contextuel */}
              <ProjectMenu
                project={p}
                onRefresh={() => loadProjects(parentDir)}
                onSetProject={onSetProject}
                onNav={onNav}
              />
            </div>
          ))}
        </div>

        {/* Quest Hand & Head Tracking */}
        <QuestBanner projectDir={projectDir} onNav={onNav} runState={runState} dispatchRun={dispatchRun} />

        {/* Quick start + Système */}
        <div style={{ marginTop:28, display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:16 }}>
          <div className="card" style={{ overflow:'hidden', position:'relative' }}>
            <div style={{
              position:'absolute', inset:0, pointerEvents:'none',
              background:'radial-gradient(500px 200px at 80% 50%, rgba(255,255,255,0.04), transparent 70%)',
            }}/>
            <div style={{ padding:'24px 24px 22px', position:'relative' }}>
              <div style={{ fontSize:10.5, fontWeight:500, letterSpacing:'0.1em',
                            textTransform:'uppercase', color:'var(--fg-4)', marginBottom:8 }}>
                Pipeline Oxymore Vision
              </div>
              <div style={{ fontSize:22, fontWeight:500, color:'var(--fg-0)', letterSpacing:'-0.02em', lineHeight:1.2 }}>
                De la vidéo brute aux{' '}
                <span className="serif" style={{ color:'var(--fg-1)' }}>angles articulaires</span>{' '}
                en 8 étapes.
              </div>
              <div style={{ fontSize:13, color:'var(--fg-3)', marginTop:8, maxWidth:460, lineHeight:1.5 }}>
                Markerless motion capture multi-caméras · sortie OpenSim compatible.
              </div>
              <div style={{ display:'flex', gap:8, marginTop:18 }}>
                <button className="btn primary" onClick={() => onNav?.('pipeline')}>
                  {Icon.play}<span>Lancer le pipeline</span>
                </button>
                <button className="btn" onClick={() => onNav?.('configuration')}>
                  {Icon.sliders}<span>Configurer</span>
                </button>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h3>Système</h3><div className="meta">temps réel</div></div>
            <div style={{ padding:'14px 20px 18px' }}>
              {(sysInfo ? [
                { l:'Oxymore Vision', v:'v2.0.0',                   ok:true },
                { l:'pose2sim',       v:sysInfo.pose2sim || '—',    ok:!!sysInfo.pose2sim },
                { l:'CUDA',           v:sysInfo.cuda || '—',        ok:sysInfo.cuda_ok },
                { l:'GPU',            v:sysInfo.gpu || '—',         ok:!!sysInfo.gpu },
                { l:'VRAM',           v:sysInfo.vram || '—',        ok:true },
              ] : [
                { l:'Chargement…',  v:'—', ok:false },
              ]).map(r => (
                <div key={r.l} style={{
                  display:'flex', justifyContent:'space-between', alignItems:'center',
                  padding:'7px 0', borderBottom:'1px solid var(--line)', fontSize:12.5,
                }}>
                  <span style={{ color:'var(--fg-2)' }}>{r.l}</span>
                  <span className="mono" style={{ color:'var(--fg-1)', display:'flex', alignItems:'center', gap:8 }}>
                    {r.v}
                    <span style={{ width:5, height:5, borderRadius:'50%',
                                   background: r.ok ? 'var(--success)' : 'var(--fg-4)',
                                   boxShadow: r.ok ? '0 0 6px rgba(110,231,167,0.6)' : 'none' }}/>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

window.Dashboard = Dashboard;
