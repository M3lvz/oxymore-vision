// results.jsx — Onglet Résultats : fichiers de sortie utilisables

const { useState: useStateR, useEffect: useEffectR } = React;

// ─── Icônes ───────────────────────────────────────────────────────────────────
const IcoFile = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
       strokeLinecap="round" strokeLinejoin="round" style={{width:14,height:14}}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
  </svg>
);
const IcoOpen = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
       strokeLinecap="round" strokeLinejoin="round" style={{width:12,height:12}}>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
    <polyline points="15 3 21 3 21 9"/>
    <line x1="10" y1="14" x2="21" y2="3"/>
  </svg>
);
const IcoCopy = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
       strokeLinecap="round" strokeLinejoin="round" style={{width:12,height:12}}>
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>
);
const IcoFolder = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
       strokeLinecap="round" strokeLinejoin="round" style={{width:12,height:12}}>
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
  </svg>
);
const IcoRefresh = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
       strokeLinecap="round" strokeLinejoin="round" style={{width:13,height:13}}>
    <path d="M1 4v6h6M23 20v-6h-6"/>
    <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/>
  </svg>
);

// ─── Formatage taille ─────────────────────────────────────────────────────────
function fmtSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024)       return `${bytes} o`;
  if (bytes < 1024*1024)  return `${(bytes/1024).toFixed(1)} Ko`;
  return `${(bytes/(1024*1024)).toFixed(2)} Mo`;
}

// ─── Ligne fichier ────────────────────────────────────────────────────────────
function FileRow({ file, copied, onOpen, onCopy, onOpenFolder }) {
  const ext = file.name.split('.').pop().toLowerCase();
  const extColor = {
    toml: 'var(--warn)',
    trc:  '#7eb8f7',
    osim: '#a78bfa',
    mot:  '#6ee7a0',
  }[ext] || 'var(--fg-3)';

  return (
    <div style={{
      display:'flex', alignItems:'center', gap:12,
      padding:'10px 20px',
      borderBottom:'1px solid var(--line)',
      transition:'background .12s',
    }}
    onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.025)'}
    onMouseLeave={e => e.currentTarget.style.background=''}>

      {/* Icône + ext */}
      <div style={{
        width:36, height:36, borderRadius:8, flexShrink:0,
        background:'rgba(255,255,255,0.04)',
        border:`1px solid ${extColor}30`,
        display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
        gap:1,
      }}>
        <span style={{color:extColor, opacity:.8}}>{IcoFile}</span>
        <span style={{fontSize:8, fontFamily:'var(--font-mono)', color:extColor, letterSpacing:'.04em'}}>
          .{ext}
        </span>
      </div>

      {/* Nom + chemin */}
      <div style={{flex:1, minWidth:0}}>
        <div style={{fontSize:13, fontWeight:500, color:'var(--fg-0)', whiteSpace:'nowrap',
                     overflow:'hidden', textOverflow:'ellipsis'}}>
          {file.name}
        </div>
        <div style={{fontSize:10.5, color:'var(--fg-4)', fontFamily:'var(--font-mono)',
                     whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', marginTop:1}}>
          {file.path}
        </div>
      </div>

      {/* Taille */}
      <div style={{fontSize:11, color:'var(--fg-3)', fontFamily:'var(--font-mono)',
                   flexShrink:0, textAlign:'right', minWidth:56}}>
        {fmtSize(file.size)}
      </div>

      {/* Actions */}
      <div style={{display:'flex', gap:4, flexShrink:0}}>
        <button className="btn sm icon ghost" title="Ouvrir le dossier"
                onClick={() => onOpenFolder(file.dir)}>
          {IcoFolder}
        </button>
        <button className="btn sm icon ghost" title="Copier le chemin"
                onClick={() => onCopy(file.path)}
                style={{color: copied===file.path ? 'var(--success)' : ''}}>
          {IcoCopy}
        </button>
        <button className="btn sm ghost" title="Ouvrir le fichier"
                onClick={() => onOpen(file.path)}
                style={{gap:5, fontSize:11, padding:'3px 10px'}}>
          {IcoOpen}
          <span>Ouvrir</span>
        </button>
      </div>
    </div>
  );
}

// ─── Section (groupe de fichiers) ─────────────────────────────────────────────
function FileSection({ title, color, files, emptyMsg, copied, onOpen, onCopy, onOpenFolder }) {
  const [collapsed, setCollapsed] = useStateR(false);

  return (
    <div className="card" style={{overflow:'hidden'}}>
      {/* Header */}
      <div className="card-head" style={{cursor:'pointer'}} onClick={() => setCollapsed(c => !c)}>
        <div style={{display:'flex', alignItems:'center', gap:10}}>
          <div style={{width:3, height:16, borderRadius:2, background:color, flexShrink:0}}/>
          <h3 style={{margin:0}}>{title}</h3>
          {files.length > 0 && (
            <span style={{
              fontSize:10, fontFamily:'var(--font-mono)', padding:'1px 7px', borderRadius:999,
              background:`${color}18`, color:color, border:`1px solid ${color}30`,
            }}>{files.length}</span>
          )}
        </div>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
             style={{width:14,height:14,color:'var(--fg-4)',
                     transform:collapsed?'rotate(-90deg)':'rotate(0deg)',
                     transition:'transform .2s'}}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>

      {!collapsed && (
        files.length === 0
          ? <div style={{padding:'18px 20px', fontSize:12, color:'var(--fg-4)'}}>
              {emptyMsg}
            </div>
          : files.map(f => (
              <FileRow key={f.path} file={f} copied={copied}
                       onOpen={onOpen} onCopy={onCopy} onOpenFolder={onOpenFolder}/>
            ))
      )}
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────
function Results({ project }) {
  const [files,   setFiles]   = useStateR({ calib:[], trc:[], osim:[], mot:[] });
  const [loading, setLoading] = useStateR(false);
  const [copied,  setCopied]  = useStateR('');
  const [bvhOpen, setBvhOpen] = useStateR(false);

  const projPath = project?.path || '';

  // ── Scan des fichiers résultats ─────────────────────────────────────────────
  async function scan() {
    if (!projPath) return;
    setLoading(true);
    try {
      const dirs = {
        calib:  projPath + '\\calibration',
        pose3d: projPath + '\\pose-3d',
        kin:    projPath + '\\kinematics',
      };

      async function listDir(dir) {
        try {
          const r = await fetch(`/api/files?path=${encodeURIComponent(dir)}`);
          const d = await r.json();
          return (d.items || []).filter(i => i.type === 'file').map(i => ({...i, dir}));
        } catch { return []; }
      }

      const [calibItems, pose3dItems, kinItems] = await Promise.all([
        listDir(dirs.calib),
        listDir(dirs.pose3d),
        listDir(dirs.kin),
      ]);

      setFiles({
        calib: calibItems.filter(f => f.name.toLowerCase() === 'calib.toml'),
        trc:   pose3dItems.filter(f => f.ext === '.trc'),
        osim:  kinItems.filter(f => f.ext === '.osim'),
        mot:   kinItems.filter(f => f.ext === '.mot'),
      });
    } finally {
      setLoading(false);
    }
  }

  useEffectR(() => { scan(); }, [projPath]);

  // Écoute l'événement global depuis menubar
  useEffectR(() => {
    const h = () => setBvhOpen(true);
    window.addEventListener('oxymore:open-bvh', h);
    return () => window.removeEventListener('oxymore:open-bvh', h);
  }, []);

  // ── Actions ─────────────────────────────────────────────────────────────────
  async function openFile(path) {
    await fetch('/api/files/open', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ path }),
    });
  }

  async function openFolder(dir) {
    await fetch('/api/files/open', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ path: dir }),
    });
  }

  function copyPath(path) {
    navigator.clipboard.writeText(path).catch(() => {});
    setCopied(path);
    setTimeout(() => setCopied(''), 2000);
  }

  const totalFiles = files.calib.length + files.trc.length + files.osim.length + files.mot.length;

  const IcoBvhCard = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
         strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}>
      <path d="M6 4a2 2 0 0 0-2 2 2 2 0 0 0 2 2 2 2 0 0 0-1 1.7c0 .8.5 1.5 1.3 1.8L10 14l4 4 2 2c.3.8 1 1.3 1.8 1.3a2 2 0 0 0 1.7-1A2 2 0 0 0 22 18a2 2 0 0 0-2-2 2 2 0 0 0 1-1.7c0-.8-.5-1.5-1.3-1.8L14 10 10 6 8 4c-.3-.8-1-1.3-1.8-1.3"/>
    </svg>
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Résultats</h1>
          <div className="sub">
            {projPath
              ? `${totalFiles} fichier${totalFiles > 1 ? 's' : ''} exportable${totalFiles > 1 ? 's' : ''} · ${project.name}`
              : 'Sélectionnez un projet'}
          </div>
        </div>
        <div className="head-actions">
          <button className="btn"
                  disabled={!projPath || files.trc.length === 0}
                  onClick={() => setBvhOpen(true)}
                  style={{background:'rgba(126,184,247,0.1)',
                          borderColor:'#7eb8f7', color:'#7eb8f7'}}>
            {Icon.download}
            <span>Exporter en BVH</span>
          </button>
          <button className="btn" onClick={scan} disabled={loading || !projPath}>
            {IcoRefresh}
            <span>{loading ? 'Scan…' : 'Actualiser'}</span>
          </button>
        </div>
      </div>

      <div className="page-body">
        <div style={{display:'grid', gridTemplateColumns:'210px 1fr', gap:16, alignItems:'start'}}>

          {/* ── Panneau gauche : export BVH ── */}
          <div className="card" style={{padding:20, display:'flex', flexDirection:'column', gap:0}}>
            {/* Icône */}
            <div style={{
              width:46, height:46, borderRadius:12, marginBottom:14,
              background:'rgba(126,184,247,0.08)', border:'1px solid rgba(126,184,247,0.22)',
              display:'flex', alignItems:'center', justifyContent:'center', color:'#7eb8f7',
            }}>
              {IcoBvhCard}
            </div>

            {/* Titre */}
            <div style={{fontSize:13, fontWeight:600, color:'var(--fg-0)', marginBottom:6}}>
              Exporter en BVH
            </div>

            {/* Description */}
            <div style={{fontSize:11, color:'var(--fg-4)', lineHeight:1.55, marginBottom:14}}>
              Convertit le .trc en Biovision Hierarchy importable dans Blender ou tout moteur 3D.
            </div>

            {/* Badges */}
            <div style={{display:'flex', gap:5, flexWrap:'wrap', marginBottom:16}}>
              {['Y-up', 'ZXY Euler', 'Blender'].map(t => (
                <span key={t} style={{
                  fontSize:9, fontFamily:'var(--font-mono)', padding:'2px 7px',
                  borderRadius:999, background:'rgba(126,184,247,0.08)',
                  color:'#7eb8f7', border:'1px solid rgba(126,184,247,0.18)',
                  letterSpacing:'0.04em',
                }}>{t}</span>
              ))}
            </div>

            {/* Bouton principal */}
            <button
              className="btn"
              disabled={!projPath || files.trc.length === 0}
              onClick={() => setBvhOpen(true)}
              style={{
                width:'100%', justifyContent:'center',
                background:'rgba(126,184,247,0.1)',
                borderColor:'#7eb8f7', color:'#7eb8f7',
              }}>
              {IcoRefresh && Icon.download}
              <span>Exporter en BVH</span>
            </button>

            {projPath && files.trc.length === 0 && (
              <div style={{fontSize:10, color:'var(--fg-4)', textAlign:'center', marginTop:8,
                           lineHeight:1.4}}>
                Aucun .trc · lancez<br/>le pipeline d'abord
              </div>
            )}
            {!projPath && (
              <div style={{fontSize:10, color:'var(--fg-4)', textAlign:'center', marginTop:8}}>
                Aucun projet sélectionné
              </div>
            )}
          </div>

          {/* ── Colonne droite : fichiers ── */}
          <div>
            {!projPath ? (
              <div className="card" style={{padding:40, textAlign:'center', color:'var(--fg-4)', fontSize:13}}>
                Aucun projet sélectionné. Ouvrez un projet depuis le tableau de bord.
              </div>
            ) : (
              <div style={{display:'flex', flexDirection:'column', gap:14}}>

                <FileSection
                  title="Calibration"
                  color="var(--warn)"
                  files={files.calib}
                  emptyMsg="Aucun Calib.toml trouvé dans calibration/"
                  copied={copied} onOpen={openFile} onCopy={copyPath} onOpenFolder={openFolder}
                />

                <FileSection
                  title="Pose 3D  —  .trc"
                  color="#7eb8f7"
                  files={files.trc}
                  emptyMsg="Aucun fichier .trc — lancez triangulation + filtering d'abord."
                  copied={copied} onOpen={openFile} onCopy={copyPath} onOpenFolder={openFolder}
                />

                <FileSection
                  title="Modèle OpenSim  —  .osim"
                  color="#a78bfa"
                  files={files.osim}
                  emptyMsg="Aucun fichier .osim — lancez kinematics d'abord."
                  copied={copied} onOpen={openFile} onCopy={copyPath} onOpenFolder={openFolder}
                />

                <FileSection
                  title="Angles articulaires  —  .mot"
                  color="#6ee7a0"
                  files={files.mot}
                  emptyMsg="Aucun fichier .mot — lancez kinematics d'abord."
                  copied={copied} onOpen={openFile} onCopy={copyPath} onOpenFolder={openFolder}
                />

              </div>
            )}
          </div>
        </div>
      </div>

      <BvhExportModal
        open={bvhOpen}
        onClose={() => setBvhOpen(false)}
        trcFiles={files.trc}
      />
    </>
  );
}

window.Results = Results;
