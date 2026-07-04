// menubar.jsx — Barre de menus connectée

const { useState: useStateM, useEffect: useEffectM, useRef: useRefM } = React;

// ─── Composant MenuItem ───────────────────────────────────────────────────────
function MenuItem({ item }) {
  if (item.separator) return (
    <div style={{ height:1, background:'rgba(255,255,255,0.08)', margin:'3px 6px' }}/>
  );

  const disabled = item.disabled;
  return (
    <div onClick={disabled ? null : item.action}
         style={{
           display:'flex', alignItems:'center', justifyContent:'space-between',
           gap:24, padding:'7px 14px', borderRadius:5, cursor: disabled ? 'default' : 'pointer',
           color: disabled ? 'var(--fg-4)' : item.danger ? 'var(--error)' : 'var(--fg-1)',
           fontSize:12, userSelect:'none',
           transition:'background 0.1s',
         }}
         onMouseEnter={e => { if (!disabled) e.currentTarget.style.background='rgba(255,255,255,0.07)'; }}
         onMouseLeave={e => e.currentTarget.style.background='transparent'}>
      <div style={{ display:'flex', alignItems:'center', gap:9 }}>
        {item.icon && <span style={{ fontSize:13, opacity: disabled ? 0.4 : 1 }}>{item.icon}</span>}
        <span style={{ opacity: disabled ? 0.4 : 1 }}>{item.label}</span>
      </div>
      {item.shortcut && (
        <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--fg-4)',
                       opacity: disabled ? 0.3 : 1 }}>
          {item.shortcut}
        </span>
      )}
      {item.children && <span style={{ color:'var(--fg-4)', fontSize:10 }}>▶</span>}
    </div>
  );
}

// ─── Dropdown menu ────────────────────────────────────────────────────────────
function Dropdown({ items, style }) {
  return (
    <div style={{
      position:'absolute', top:'100%', left:0, zIndex:9999,
      background:'#0e0e14', border:'1px solid rgba(255,255,255,0.14)',
      borderRadius:8, padding:'4px', minWidth:220,
      boxShadow:'0 8px 32px rgba(0,0,0,0.9)',
      ...style,
    }}>
      {items.map((item, i) => <MenuItem key={i} item={item}/>)}
    </div>
  );
}

// ─── Menu principal ───────────────────────────────────────────────────────────
function MenuBar({ onNav, onNewProject, onOpenProject, onSave, onClean, onRunAll, onStop,
                   recentProjects, projectDir, onSetProject }) {
  const [open, setOpen] = useStateM(null); // id du menu ouvert
  const barRef = useRefM(null);

  // Ferme au clic extérieur
  useEffectM(() => {
    if (!open) return;
    const h = e => { if (barRef.current && !barRef.current.contains(e.target)) setOpen(null); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  // Raccourcis clavier globaux
  useEffectM(() => {
    const h = e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); onNewProject?.(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') { e.preventDefault(); onOpenProject?.(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); onSave?.(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'r') { e.preventDefault(); onRunAll?.(); }
      if (e.key === 'F11') { e.preventDefault(); toggleFullscreen(); }
      if (e.key === 'Escape') setOpen(null);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  }

  async function handleOpenProject() {
    setOpen(null);
    const res = await fetch('/api/browse-folder', { method:'POST' });
    const d   = await res.json();
    if (d.path) onSetProject?.(d.path);
  }

  function handleExportBvh() {
    setOpen(null);
    onNav?.('results');
    // Petit délai pour laisser le composant Results se monter et enregistrer son listener
    setTimeout(() => window.dispatchEvent(new CustomEvent('oxymore:open-bvh')), 150);
  }

  const MENUS = [
    {
      id: 'fichier', label: 'Fichier',
      items: [
        { label:'Nouveau projet',    shortcut:'Ctrl+N', action:() => { setOpen(null); onNewProject?.(); } },
        { label:'Ouvrir projet…',    shortcut:'Ctrl+O', action:handleOpenProject },
        {
          label:'Projets récents', children: true,
          submenu: recentProjects?.length
            ? recentProjects.slice(0,8).map(p => ({
                label: p.split(/[/\\]/).pop(),
                action: () => { setOpen(null); onSetProject?.(p); }
              }))
            : [{ label:'Aucun projet récent', disabled:true }]
        },
        { separator: true },
        { label:'Sauvegarder Config.toml', shortcut:'Ctrl+S', action:() => { setOpen(null); onSave?.(); } },
        { separator: true },
        { label:'Quitter', shortcut:'Alt+F4', action:() => window.close() },
      ]
    },
    {
      id: 'affichage', label: 'Affichage',
      items: [
        { label:'Tableau de bord',  action:() => { setOpen(null); onNav?.('dashboard'); } },
        { label:'Pipeline',         action:() => { setOpen(null); onNav?.('pipeline'); } },
        { label:'Configuration',    action:() => { setOpen(null); onNav?.('configuration'); } },
        { label:'Console',          action:() => { setOpen(null); onNav?.('console'); } },
        { label:'Visualisation 3D', action:() => { setOpen(null); onNav?.('viewer'); } },
        { label:'Explorateur',      action:() => { setOpen(null); onNav?.('explorer'); } },
        { label:'Dépendances',      action:() => { setOpen(null); onNav?.('dependencies'); } },
        { separator: true },
        { label:'Plein écran', shortcut:'F11', action:() => { setOpen(null); toggleFullscreen(); } },
      ]
    },
    {
      id: 'projet', label: 'Projet',
      items: [
        { label:'▶  Lancer pipeline', shortcut:'Ctrl+R', action:() => { setOpen(null); onRunAll?.(); } },
        { label:'⏹  Arrêter',         action:() => { setOpen(null); onStop?.(); } },
        { separator: true },
        { label:'Nettoyer résultats', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" style={{width:13,height:13}}><path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"/></svg>, action:async () => {
            setOpen(null);
            if (!projectDir) return;
            await fetch('/api/clean', { method:'POST',
              headers:{'Content-Type':'application/json'},
              body: JSON.stringify({ path: projectDir }) });
            onNav?.('dashboard');
          }
        },
        { separator: true },
        { label:'Exporter…', action:handleExportBvh,
          disabled: !projectDir },
      ]
    },
    {
      id: 'aide', label: 'Aide',
      items: [
        { label:'Documentation pose2sim', action:() => {
            setOpen(null);
            window.open('https://github.com/perfanalytics/pose2sim', '_blank');
          }
        },
        { label:'À propos d\'Oxymore Vision', action:() => {
            setOpen(null);
            alert('Oxymore Vision v2.0\nMarkerless MoCap GUI\nPowered by pose2sim');
          }
        },
        { separator: true },
        { label:'🔑  Key Manager',
          action:() => { setOpen(null); onNav?.('key_manager'); } },
      ]
    },
  ];

  return (
    <div ref={barRef} className="menu" style={{ position:'relative' }}>
      {MENUS.map(menu => (
        <div key={menu.id} style={{ position:'relative' }}>
          <button
            className={open === menu.id ? 'active' : ''}
            onClick={() => setOpen(open === menu.id ? null : menu.id)}
            onMouseEnter={() => { if (open && open !== menu.id) setOpen(menu.id); }}
          >
            {menu.label}
          </button>

          {open === menu.id && (
            <DropdownWithSub items={menu.items} onClose={() => setOpen(null)}/>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Dropdown avec support sous-menu ─────────────────────────────────────────
function DropdownWithSub({ items, onClose }) {
  const [subOpen, setSubOpen] = useStateM(null);

  return (
    <div style={{
      position:'absolute', top:'100%', left:0, zIndex:9999,
      background:'#0e0e14', border:'1px solid rgba(255,255,255,0.14)',
      borderRadius:8, padding:'4px', minWidth:230,
      boxShadow:'0 8px 32px rgba(0,0,0,0.9)',
    }}>
      {items.map((item, i) => {
        if (item.separator) return (
          <div key={i} style={{ height:1, background:'rgba(255,255,255,0.08)', margin:'3px 6px' }}/>
        );

        const disabled = item.disabled;
        return (
          <div key={i}
               style={{ position:'relative' }}
               onMouseEnter={() => setSubOpen(item.children ? i : null)}
               onMouseLeave={() => setSubOpen(null)}>
            <div
              onClick={disabled ? null : () => { item.action?.(); onClose?.(); }}
              style={{
                display:'flex', alignItems:'center', justifyContent:'space-between',
                gap:20, padding:'7px 14px', borderRadius:5,
                cursor: disabled ? 'default' : 'pointer',
                color: disabled ? 'var(--fg-4)' : 'var(--fg-1)',
                fontSize:12, userSelect:'none',
                background: subOpen === i ? 'rgba(255,255,255,0.07)' : 'transparent',
                transition:'background 0.1s',
              }}
              onMouseEnter={e => { if (!disabled) e.currentTarget.style.background='rgba(255,255,255,0.07)'; }}
              onMouseLeave={e => { if (subOpen !== i) e.currentTarget.style.background='transparent'; }}>
              <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                {item.icon && <span style={{fontSize:13, opacity:disabled?0.4:1}}>{item.icon}</span>}
                <span style={{opacity:disabled?0.4:1}}>{item.label}</span>
              </div>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                {item.shortcut && (
                  <span style={{ fontFamily:'var(--font-mono)', fontSize:10,
                                 color:'var(--fg-4)', opacity:disabled?0.3:1 }}>
                    {item.shortcut}
                  </span>
                )}
                {item.children && <span style={{color:'var(--fg-4)',fontSize:9}}>▶</span>}
              </div>
            </div>

            {/* Sous-menu */}
            {item.children && subOpen === i && item.submenu && (
              <div style={{
                position:'absolute', left:'100%', top:0, zIndex:10000,
                background:'#0e0e14', border:'1px solid rgba(255,255,255,0.14)',
                borderRadius:8, padding:'4px', minWidth:200,
                boxShadow:'0 8px 32px rgba(0,0,0,0.9)',
              }}>
                {item.submenu.map((sub, j) => (
                  <div key={j}
                       onClick={sub.disabled ? null : () => { sub.action?.(); onClose?.(); }}
                       style={{
                         padding:'7px 14px', borderRadius:5,
                         cursor: sub.disabled ? 'default' : 'pointer',
                         color: sub.disabled ? 'var(--fg-4)' : 'var(--fg-1)',
                         fontSize:12, userSelect:'none',
                         transition:'background 0.1s',
                         whiteSpace:'nowrap', overflow:'hidden',
                         textOverflow:'ellipsis', maxWidth:240,
                       }}
                       onMouseEnter={e => { if (!sub.disabled) e.currentTarget.style.background='rgba(255,255,255,0.07)'; }}
                       onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                    {sub.label}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

window.MenuBar = MenuBar;
