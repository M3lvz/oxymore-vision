// shared.jsx — Icons + small UI primitives shared across screens

const Icon = {
  // navigation
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9"/>
    </svg>
  ),
  pipeline: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="12" r="2"/>
      <path d="M5 8v8M7 6h10M17 12h0"/><path d="M5 8c0 6 4 4 12 4"/>
    </svg>
  ),
  sliders: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h14M18 18h2"/>
      <circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="18" r="2"/>
    </svg>
  ),
  terminal: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2"/>
      <path d="m7 9 3 3-3 3M13 15h5"/>
    </svg>
  ),
  cube: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3 9 5v8l-9 5-9-5V8z"/>
      <path d="m3 8 9 5 9-5M12 13v10"/>
    </svg>
  ),
  // brand mark
  brand: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="1.6" fill="currentColor"/>
      <path d="M12 7v4M9 11l-2 5M15 11l2 5M9 11h6M9 13l-2 8M15 13l2 8"/>
    </svg>
  ),
  // step icons
  calib: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="6" width="18" height="14" rx="2"/>
      <circle cx="12" cy="13" r="3.5"/><path d="M8 4h8l1 2H7z"/>
    </svg>
  ),
  pose: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="4.5" r="1.6"/>
      <path d="M12 6v6M9 9l3-1 3 1M12 12l-3 5M12 12l3 5M9 17l-1 4M15 17l1 4"/>
    </svg>
  ),
  sync: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 0 1 16-5.5L21 8M21 12a9 9 0 0 1-16 5.5L3 16"/>
      <path d="M21 4v4h-4M3 20v-4h4"/>
    </svg>
  ),
  people: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/>
      <path d="M3 19c0-3.3 2.7-6 6-6s6 2.7 6 6M14 19c0-2.5 2-4.5 4.5-4.5S23 16.5 23 19"/>
    </svg>
  ),
  tri: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 3 19h18zM12 3v16M3 19l9-8M21 19l-9-8"/>
    </svg>
  ),
  filter: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 5h18l-7 9v6l-4-2v-4z"/>
    </svg>
  ),
  sparkle: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v6M12 15v6M3 12h6M15 12h6M5.5 5.5l4 4M14.5 14.5l4 4M18.5 5.5l-4 4M9.5 14.5l-4 4"/>
    </svg>
  ),
  bone: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 4a2 2 0 0 0-2 2 2 2 0 0 0 2 2 2 2 0 0 0-1 1.7c0 .8.5 1.5 1.3 1.8L10 14l4 4 2 2c.3.8 1 1.3 1.8 1.3a2 2 0 0 0 1.7-1A2 2 0 0 0 22 18a2 2 0 0 0-2-2 2 2 0 0 0 1-1.7c0-.8-.5-1.5-1.3-1.8L14 10 10 6 8 4c-.3-.8-1-1.3-1.8-1.3"/>
    </svg>
  ),
  // misc
  folder: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    </svg>
  ),
  plus: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14"/>
    </svg>
  ),
  play: (
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4v16l13-8z"/></svg>
  ),
  stop: (
    <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
  ),
  pause: (
    <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
  ),
  refresh: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/>
    </svg>
  ),
  save: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 5a2 2 0 0 1 2-2h10l4 4v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/>
      <path d="M7 3v6h10V3M7 15h10v6H7z"/>
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m5 12 5 5L20 7"/>
    </svg>
  ),
  alert: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 9v4M12 17h.01M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    </svg>
  ),
  trash: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    </svg>
  ),
  more: (
    <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>
  ),
  download: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v13M6 11l6 6 6-6M4 21h16"/>
    </svg>
  ),
  search: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>
    </svg>
  ),
  arrowRight: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6"/>
    </svg>
  ),
  chevronRight: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 6 6 6-6 6"/>
    </svg>
  ),
  chevronDown: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6"/>
    </svg>
  ),
  camera: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
  ),
  cpu: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="6" width="12" height="12" rx="2"/>
      <rect x="9" y="9" width="6" height="6"/>
      <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>
    </svg>
  ),
  bolt: (
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 3 14h7l-1 8 10-12h-7z"/></svg>
  ),
  clock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
    </svg>
  ),
  doc: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
      <path d="M14 3v6h6M8 13h8M8 17h6"/>
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>
    </svg>
  ),
  upload: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21V8M6 13l6-6 6 6M4 3h16"/>
    </svg>
  ),
  copy: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2"/>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
  ),
};

// ─────────────────────────────────────────────────────────────
// Form primitives
// ─────────────────────────────────────────────────────────────

function Field({ label, hint, help, children, span }) {
  return (
    <div className="field" style={span ? { gridColumn: `1 / -1` } : null}>
      {label && (
        <label>
          {label}
          {hint && <span className="hint">— {hint}</span>}
        </label>
      )}
      {children}
      {help && <div className="field-help">{help}</div>}
    </div>
  );
}

function Toggle({ on, onClick }) {
  return (
    <div
      className={`toggle ${on ? 'on' : ''}`}
      onClick={onClick}
      role="switch"
      aria-checked={on}
    />
  );
}

function ToggleRow({ name, desc, value, onChange }) {
  return (
    <div className="toggle-row" onClick={() => onChange(!value)}>
      <div className="info">
        <div className="name">{name}</div>
        {desc && <div className="desc">{desc}</div>}
      </div>
      <Toggle on={value} />
    </div>
  );
}

function Segmented({ value, onChange, options }) {
  return (
    <div className="segmented">
      {options.map((o) => {
        const v = typeof o === 'string' ? o : o.value;
        const l = typeof o === 'string' ? o : o.label;
        return (
          <button key={v} className={v === value ? 'on' : ''} onClick={() => onChange(v)}>
            {l}
          </button>
        );
      })}
    </div>
  );
}

function Select({ value, onChange, options, ...rest }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} {...rest}>
      {options.map((o) => {
        const v = typeof o === 'string' ? o : o.value;
        const l = typeof o === 'string' ? o : o.label;
        return <option key={v} value={v}>{l}</option>;
      })}
    </select>
  );
}

function Input({ value, onChange, ...rest }) {
  return <input type="text" value={value} onChange={(e) => onChange(e.target.value)} {...rest} />;
}

function SectionHeading({ children, right }) {
  return (
    <div className="section-heading">
      <span>{children}</span>
      {right}
    </div>
  );
}

// background ring decoration
function DecoRing({ size = 600, x = '50%', y = '50%', opacity = 0.6 }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: x, top: y,
        transform: 'translate(-50%, -50%)',
        width: size, height: size,
        borderRadius: '50%',
        border: '1px solid rgba(255,255,255,0.05)',
        opacity,
        pointerEvents: 'none',
      }}
    >
      <div style={{
        position: 'absolute', inset: '8%', borderRadius: '50%',
        border: '1px solid rgba(255,255,255,0.04)'
      }}/>
      <div style={{
        position: 'absolute', inset: '20%', borderRadius: '50%',
        border: '1px solid rgba(255,255,255,0.035)'
      }}/>
      <div style={{
        position: 'absolute', inset: '34%', borderRadius: '50%',
        border: '1px solid rgba(255,255,255,0.03)'
      }}/>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// BvhExportModal — popup export OpenSim (.osim + .mot) → BVH partagé
// Convertisseur FK exacte (osim_to_bvh.py) : pas de jitter, pas de
// foot-sliding, despike des pops IK + A-pose optionnelle.
// ─────────────────────────────────────────────────────────────
function BvhExportModal({ open, onClose, projectPath }) {
  const [loading,    setLoading]    = React.useState(false);
  const [osimFiles,  setOsimFiles]  = React.useState([]);
  const [motFiles,   setMotFiles]   = React.useState([]);
  const [selOsim,    setSelOsim]    = React.useState('');
  const [selMot,     setSelMot]     = React.useState('');
  const [scale,      setScale]      = React.useState(1);
  const [despikeThr, setDespikeThr] = React.useState(35);
  const [despikeWin, setDespikeWin] = React.useState(4);
  const [despikeGap, setDespikeGap] = React.useState(30);
  const [aposeDeg,   setAposeDeg]   = React.useState(0);
  const [exporting,  setExporting]  = React.useState(false);
  const [error,      setError]      = React.useState('');

  React.useEffect(() => {
    if (!open) return;
    setError('');
    setExporting(false);
    setScale(1);
    setDespikeThr(35);
    setDespikeWin(4);
    setDespikeGap(30);
    setAposeDeg(0);
    setOsimFiles([]);
    setMotFiles([]);
    setSelOsim('');
    setSelMot('');
    if (!projectPath) return;
    setLoading(true);
    fetch(`/api/files?path=${encodeURIComponent(projectPath + '\\kinematics')}`)
      .then(r => r.json())
      .then(d => {
        const items = d.items || [];
        const osims = items.filter(f => f.ext === '.osim');
        const score = f => f.name.includes('LSTM') ? 0 : (f.name.includes('filt') ? 1 : 2);
        const mots  = items.filter(f => f.ext === '.mot').sort((a, b) => score(a) - score(b));
        setOsimFiles(osims);
        setMotFiles(mots);
        setSelOsim(osims[0]?.path || '');
        setSelMot(mots[0]?.path || '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, projectPath]);

  if (!open) return null;

  const ready = !loading && selOsim && selMot;

  async function doExport() {
    if (!ready) return;
    setExporting(true);
    setError('');
    try {
      const r = await fetch('/api/export/bvh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          osim_path: selOsim, mot_path: selMot, scale,
          despike_thr: despikeThr, despike_win: despikeWin, despike_gap: despikeGap,
          apose_deg: aposeDeg,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setError(d.error || `Erreur HTTP ${r.status}`);
        return;
      }
      const text = await r.text();
      const fname = selMot.split(/[/\\]/).pop().replace(/\.mot$/i, '.bvh');

      // PyWebView desktop : dialog natif "Enregistrer sous" (filtre .bvh)
      if (window.pywebview?.api?.save_bvh) {
        try {
          const saved = await window.pywebview.api.save_bvh(text, fname);
          if (saved) { onClose(); return; }
        } catch (_) {}
      }

      // Fallback navigateur : Blob download
      const blob = new Blob([text], { type: 'application/octet-stream' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = fname;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setExporting(false);
    }
  }

  const IcoBvh = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round" style={{width:18,height:18}}>
      <path d="M6 4a2 2 0 0 0-2 2 2 2 0 0 0 2 2 2 2 0 0 0-1 1.7c0 .8.5 1.5 1.3 1.8L10 14l4 4 2 2c.3.8 1 1.3 1.8 1.3a2 2 0 0 0 1.7-1A2 2 0 0 0 22 18a2 2 0 0 0-2-2 2 2 0 0 0 1-1.7c0-.8-.5-1.5-1.3-1.8L14 10 10 6 8 4c-.3-.8-1-1.3-1.8-1.3"/>
    </svg>
  );

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:10000,
      background:'rgba(0,0,0,0.72)', backdropFilter:'blur(6px)',
      display:'flex', alignItems:'center', justifyContent:'center',
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background:'#0e0e14', border:'1px solid rgba(255,255,255,0.12)',
        borderRadius:16, padding:28, width:440, maxWidth:'92vw',
        boxShadow:'0 24px 64px rgba(0,0,0,0.9)',
      }}>

        {/* Header */}
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24}}>
          <div style={{display:'flex', alignItems:'center', gap:12}}>
            <div style={{
              width:38, height:38, borderRadius:10,
              background:'rgba(126,184,247,0.1)', border:'1px solid rgba(126,184,247,0.25)',
              display:'flex', alignItems:'center', justifyContent:'center', color:'#7eb8f7',
            }}>
              {IcoBvh}
            </div>
            <div>
              <div style={{fontSize:14, fontWeight:600, color:'var(--fg-0)'}}>Exporter en BVH</div>
              <div style={{fontSize:11, color:'var(--fg-4)'}}>FK exacte (OpenSim) · Blender ready</div>
            </div>
          </div>
          <button className="btn sm icon ghost" onClick={onClose} disabled={exporting}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                 style={{width:14,height:14}}>
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Chargement */}
        {loading && (
          <div style={{marginBottom:20, padding:'12px 14px', borderRadius:8,
                       background:'rgba(255,255,255,0.03)', border:'1px solid var(--line)',
                       fontSize:12, color:'var(--fg-3)', textAlign:'center'}}>
            Analyse du dossier kinematics…
          </div>
        )}

        {/* Aucun résultat kinematics */}
        {!loading && (osimFiles.length === 0 || motFiles.length === 0) && (
          <div style={{marginBottom:20, padding:'12px 14px', borderRadius:8,
                       background:'rgba(255,120,80,0.08)', border:'1px solid rgba(255,120,80,0.2)',
                       fontSize:12, color:'var(--warn)'}}>
            Aucun résultat .osim/.mot trouvé dans kinematics/ — lancez l'étape Kinematics d'abord.
          </div>
        )}

        {!loading && osimFiles.length > 0 && motFiles.length > 0 && (
          <>
            {/* Sélecteur modèle .osim */}
            {osimFiles.length > 1 ? (
              <div style={{marginBottom:14}}>
                <label style={{fontSize:11, color:'var(--fg-3)', display:'block', marginBottom:6,
                               textTransform:'uppercase', letterSpacing:'0.08em'}}>
                  Modèle (.osim)
                </label>
                <select value={selOsim} onChange={e => setSelOsim(e.target.value)}
                        style={{width:'100%', background:'rgba(255,255,255,0.04)',
                                border:'1px solid var(--line)', borderRadius:8,
                                color:'var(--fg-1)', padding:'8px 10px',
                                fontFamily:'var(--font-mono)', fontSize:11, cursor:'pointer'}}>
                  {osimFiles.map(f => <option key={f.path} value={f.path}>{f.name}</option>)}
                </select>
              </div>
            ) : (
              <div style={{marginBottom:14, padding:'8px 12px', borderRadius:8,
                           background:'rgba(255,255,255,0.03)', border:'1px solid var(--line)',
                           fontSize:11, fontFamily:'var(--font-mono)', color:'var(--fg-2)'}}>
                {osimFiles[0].name}
              </div>
            )}

            {/* Sélecteur mouvement .mot */}
            {motFiles.length > 1 ? (
              <div style={{marginBottom:20}}>
                <label style={{fontSize:11, color:'var(--fg-3)', display:'block', marginBottom:6,
                               textTransform:'uppercase', letterSpacing:'0.08em'}}>
                  Mouvement (.mot)
                </label>
                <select value={selMot} onChange={e => setSelMot(e.target.value)}
                        style={{width:'100%', background:'rgba(255,255,255,0.04)',
                                border:'1px solid var(--line)', borderRadius:8,
                                color:'var(--fg-1)', padding:'8px 10px',
                                fontFamily:'var(--font-mono)', fontSize:11, cursor:'pointer'}}>
                  {motFiles.map(f => <option key={f.path} value={f.path}>{f.name}</option>)}
                </select>
              </div>
            ) : (
              <div style={{marginBottom:20, padding:'8px 12px', borderRadius:8,
                           background:'rgba(255,255,255,0.03)', border:'1px solid var(--line)',
                           fontSize:11, fontFamily:'var(--font-mono)', color:'var(--fg-2)'}}>
                {motFiles[0].name}
              </div>
            )}

            {/* Échelle */}
            <div style={{marginBottom:18, display:'flex', alignItems:'center', justifyContent:'space-between'}}>
              <label style={{fontSize:11, color:'var(--fg-3)', textTransform:'uppercase', letterSpacing:'0.08em'}}>
                Échelle
              </label>
              <Segmented value={scale} onChange={setScale}
                         options={[{value:1, label:'Mètres'}, {value:100, label:'Centimètres'}]}/>
            </div>

            {/* Despike — correction des pops IK */}
            <div style={{marginBottom:18}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:8}}>
                <label style={{fontSize:11, color:'var(--fg-3)', textTransform:'uppercase',
                               letterSpacing:'0.08em'}}>
                  Correction des pops IK
                </label>
                <span style={{fontFamily:'var(--font-mono)', fontSize:13, color:'var(--fg-0)'}}>
                  {despikeThr <= 0 ? 'Désactivée' : `${despikeThr}°/frame`}
                </span>
              </div>
              <input type="range" min={0} max={90} step={5} value={despikeThr}
                     onChange={e => setDespikeThr(Number(e.target.value))}
                     style={{width:'100%', accentColor:'#7eb8f7'}}/>
              <div style={{fontSize:10, color:'var(--fg-4)', marginTop:6, lineHeight:1.5}}>
                Lisse les sauts de coordonnées isolés (artefacts IK), sans toucher aux mouvements rapides volontaires.
              </div>
            </div>

            {despikeThr > 0 && (
              <div style={{marginBottom:18, display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
                <div>
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:8}}>
                    <label style={{fontSize:11, color:'var(--fg-3)', textTransform:'uppercase',
                                   letterSpacing:'0.08em'}}>
                      Lissage
                    </label>
                    <span style={{fontFamily:'var(--font-mono)', fontSize:13, color:'var(--fg-0)'}}>
                      ±{despikeWin}
                    </span>
                  </div>
                  <input type="range" min={1} max={10} step={1} value={despikeWin}
                         onChange={e => setDespikeWin(Number(e.target.value))}
                         style={{width:'100%', accentColor:'#7eb8f7'}}/>
                </div>
                <div>
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:8}}>
                    <label style={{fontSize:11, color:'var(--fg-3)', textTransform:'uppercase',
                                   letterSpacing:'0.08em'}}>
                      Pontage
                    </label>
                    <span style={{fontFamily:'var(--font-mono)', fontSize:13, color:'var(--fg-0)'}}>
                      {despikeGap}f
                    </span>
                  </div>
                  <input type="range" min={5} max={100} step={5} value={despikeGap}
                         onChange={e => setDespikeGap(Number(e.target.value))}
                         style={{width:'100%', accentColor:'#7eb8f7'}}/>
                </div>
              </div>
            )}

            {/* Pose de repos des bras (T-pose / A-pose) */}
            <div style={{marginBottom:24}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:8}}>
                <label style={{fontSize:11, color:'var(--fg-3)', textTransform:'uppercase',
                               letterSpacing:'0.08em'}}>
                  Pose de repos des bras
                </label>
                <span style={{fontFamily:'var(--font-mono)', fontSize:13, color:'var(--fg-0)'}}>
                  {aposeDeg <= 0 ? 'T-pose' : `A-pose ${aposeDeg}°`}
                </span>
              </div>
              <input type="range" min={0} max={45} step={5} value={aposeDeg}
                     onChange={e => setAposeDeg(Number(e.target.value))}
                     style={{width:'100%', accentColor:'#7eb8f7'}}/>
              <div style={{fontSize:10, color:'var(--fg-4)', marginTop:6, lineHeight:1.5}}>
                Incline les bras vers le bas dans la pose de repos — utile pour matcher un personnage cible en A-pose (retarget Auto-Rig Pro).
              </div>
            </div>
          </>
        )}

        {/* Erreur */}
        {error && (
          <div style={{marginBottom:16, padding:'10px 12px', borderRadius:8,
                       background:'rgba(255,80,80,0.08)', border:'1px solid rgba(255,80,80,0.2)',
                       fontSize:11, color:'#ff9a9a', fontFamily:'var(--font-mono)',
                       whiteSpace:'pre-wrap', wordBreak:'break-word'}}>
            {error}
          </div>
        )}

        {/* Actions */}
        <div style={{display:'flex', gap:10, justifyContent:'flex-end'}}>
          <button className="btn ghost" onClick={onClose} disabled={exporting}>
            Annuler
          </button>
          <button className="btn" onClick={doExport}
                  disabled={!ready || exporting}
                  style={{
                    background:'rgba(126,184,247,0.12)',
                    borderColor:'#7eb8f7', color:'#7eb8f7',
                    opacity: !ready ? 0.4 : 1,
                  }}>
            {Icon.download}
            <span>{exporting ? 'Conversion en cours…' : 'Télécharger .bvh'}</span>
          </button>
        </div>

      </div>
    </div>
  );
}

Object.assign(window, {
  Icon, Field, Toggle, ToggleRow, Segmented, Select, Input, SectionHeading, DecoRing,
  BvhExportModal,
});
