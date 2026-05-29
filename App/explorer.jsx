// explorer.jsx — Explorateur de fichiers du projet

const { useState: useStateEx, useEffect: useEffectEx, useCallback: useCallbackEx } = React;

// ─── Icônes fichiers ─────────────────────────────────────────────────────────
const FILE_ICONS = {
  '.trc':  { color: '#93c5fd', label: 'TRC' },
  '.mot':  { color: '#6ee7a7', label: 'MOT' },
  '.osim': { color: '#f5c66c', label: 'OSIM' },
  '.c3d':  { color: '#c4b5fd', label: 'C3D' },
  '.mp4':  { color: '#fb923c', label: 'MP4' },
  '.toml': { color: '#f472b6', label: 'TOML' },
  '.json': { color: '#facc15', label: 'JSON' },
  '.yml':  { color: '#34d399', label: 'YML' },
  '.csv':  { color: '#a3e635', label: 'CSV' },
  '.png':  { color: '#e879f9', label: 'PNG' },
  '.jpg':  { color: '#e879f9', label: 'JPG' },
  '.txt':  { color: 'var(--fg-3)', label: 'TXT' },
  '.sto':  { color: '#93c5fd', label: 'STO' },
  '.log':  { color: 'var(--fg-4)', label: 'LOG' },
};

function fileIcon(ext) {
  return FILE_ICONS[ext] || { color: 'var(--fg-3)', label: ext.replace('.','').toUpperCase() || 'FILE' };
}

function formatSize(bytes) {
  if (bytes === 0) return '';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

// ─── Composant principal ─────────────────────────────────────────────────────
function Explorer({ projectDir }) {
  const [currentPath, setCurrentPath] = useStateEx(projectDir || '');
  const [items,       setItems]       = useStateEx([]);
  const [parent,      setParent]      = useStateEx(null);
  const [loading,     setLoading]     = useStateEx(false);
  const [error,       setError]       = useStateEx('');
  const [selected,    setSelected]    = useStateEx(null);
  const [search,      setSearch]      = useStateEx('');
  const [viewMode,    setViewMode]    = useStateEx('list'); // 'list' | 'grid'
  const [sortBy,      setSortBy]      = useStateEx('name'); // 'name' | 'size' | 'type'
  const [confirm,     setConfirm]     = useStateEx(null); // path à supprimer

  // Navigue vers un chemin
  const navigate = useCallbackEx(async (path) => {
    if (!path) return;
    setLoading(true);
    setError('');
    setSelected(null);
    try {
      const res = await fetch(`/api/files?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setCurrentPath(data.path);
      setParent(data.parent);
      setItems(data.items);
    } catch (e) {
      setError(`Erreur réseau : ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  // Charge le dossier projet au montage ou quand projectDir change
  useEffectEx(() => {
    if (projectDir) navigate(projectDir);
  }, [projectDir]);

  // Filtrage + tri
  const filtered = items
    .filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      if (sortBy === 'size') return b.size - a.size;
      if (sortBy === 'type') return a.ext.localeCompare(b.ext);
      return a.name.localeCompare(b.name);
    });

  async function handleOpen(item) {
    if (item.type === 'dir') {
      navigate(item.path);
    } else {
      try {
        await fetch('/api/files/open', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: item.path }),
        });
      } catch(e) {}
    }
  }

  async function handleDelete() {
    if (!confirm) return;
    try {
      await fetch('/api/files/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: confirm }),
      });
      setConfirm(null);
      setSelected(null);
      navigate(currentPath);
    } catch(e) {}
  }

  async function handleClean() {
    try {
      const res = await fetch('/api/clean', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: projectDir }),
      });
      const data = await res.json();
      navigate(currentPath);
    } catch(e) {}
  }

  // Breadcrumb
  const crumbs = currentPath.replace(/\\/g, '/').split('/').filter(Boolean);

  const selectedItem = items.find(i => i.path === selected);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Explorateur</h1>
          <div className="sub">
            {currentPath || 'Aucun projet sélectionné'}
          </div>
        </div>
        <div className="head-actions">
          <button className="btn" onClick={handleClean} title="Supprime pose/, pose-3d/, kinematics/ etc.">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" style={{width:14,height:14}}>
              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
            </svg>
            <span>Nettoyer projet</span>
          </button>
          <button className="btn" onClick={() => navigate(currentPath)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" style={{width:14,height:14}}>
              <path d="M1 4v6h6M23 20v-6h-6"/>
              <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/>
            </svg>
            <span>Actualiser</span>
          </button>
          <div style={{display:'flex',gap:2}}>
            {['list','grid'].map(m => (
              <button key={m} className={`btn sm icon ${viewMode===m?'':'ghost'}`}
                      onClick={() => setViewMode(m)}
                      style={{background:viewMode===m?'rgba(255,255,255,0.08)':'transparent'}}>
                {m === 'list'
                  ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" style={{width:14,height:14}}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
                  : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" style={{width:14,height:14}}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                }
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="page-body" style={{display:'flex',flexDirection:'column',gap:12}}>

        {/* Breadcrumb + search */}
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          {/* Breadcrumb */}
          <div style={{
            flex:1, display:'flex', alignItems:'center', gap:4,
            background:'rgba(255,255,255,0.03)', border:'1px solid var(--line)',
            borderRadius:8, padding:'6px 12px', overflow:'hidden',
            fontFamily:'var(--font-mono)', fontSize:11,
          }}>
            {parent && (
              <button onClick={() => navigate(parent)}
                      style={{background:'none',border:'none',color:'var(--fg-3)',
                              cursor:'pointer',padding:'0 4px',fontSize:14,lineHeight:1}}>
                ←
              </button>
            )}
            {crumbs.map((c, i) => (
              <span key={i} style={{display:'flex',alignItems:'center',gap:4}}>
                {i > 0 && <span style={{color:'var(--fg-4)'}}>›</span>}
                <span
                  style={{color: i === crumbs.length-1 ? 'var(--fg-0)' : 'var(--fg-3)',
                          cursor: i < crumbs.length-1 ? 'pointer' : 'default',
                          whiteSpace:'nowrap'}}
                  onClick={() => {
                    if (i < crumbs.length - 1) {
                      const p = crumbs.slice(0, i+1).join('/');
                      navigate((currentPath.startsWith('\\') || currentPath[1]===':')
                        ? currentPath.split(/[/\\]/).slice(0, i+1).join('\\')
                        : p);
                    }
                  }}>
                  {c}
                </span>
              </span>
            ))}
          </div>

          {/* Search */}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher…"
            style={{
              background:'rgba(255,255,255,0.03)', border:'1px solid var(--line)',
              borderRadius:8, padding:'6px 12px', color:'var(--fg-1)',
              fontFamily:'var(--font-sans)', fontSize:12, width:180,
              outline:'none',
            }}
          />

          {/* Sort */}
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                  style={{background:'rgba(255,255,255,0.04)', border:'1px solid var(--line)',
                          borderRadius:8, color:'var(--fg-2)', padding:'6px 10px',
                          fontFamily:'var(--font-sans)', fontSize:11, cursor:'pointer'}}>
            <option value="name">Nom</option>
            <option value="type">Type</option>
            <option value="size">Taille</option>
          </select>
        </div>

        {/* Error */}
        {error && (
          <div style={{padding:'10px 14px',borderRadius:8,background:'rgba(255,122,122,0.08)',
                       border:'1px solid rgba(255,122,122,0.2)',color:'var(--error)',fontSize:12}}>
            {error}
          </div>
        )}

        {/* Main area */}
        <div style={{flex:1,display:'grid',gridTemplateColumns: selected ? '1fr 260px' : '1fr',gap:14,minHeight:0}}>

          {/* File list */}
          <div style={{
            background:'rgba(255,255,255,0.02)', border:'1px solid var(--line)',
            borderRadius:12, overflow:'auto', minHeight:0,
          }}>
            {loading && (
              <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:120,
                           color:'var(--fg-4)',fontSize:12}}>Chargement…</div>
            )}

            {!loading && filtered.length === 0 && (
              <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:120,
                           color:'var(--fg-4)',fontSize:12}}>Dossier vide</div>
            )}

            {!loading && viewMode === 'list' && (
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead>
                  <tr style={{borderBottom:'1px solid var(--line)'}}>
                    {['Nom','Type','Taille'].map(h => (
                      <th key={h} style={{padding:'8px 16px',textAlign:'left',
                                         color:'var(--fg-4)',fontWeight:500,fontSize:10,
                                         letterSpacing:'0.08em',textTransform:'uppercase'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(item => {
                    const isDir = item.type === 'dir';
                    const ic = isDir ? null : fileIcon(item.ext);
                    const isSel = selected === item.path;
                    return (
                      <tr key={item.path}
                          onClick={() => setSelected(isSel ? null : item.path)}
                          onDoubleClick={() => handleOpen(item)}
                          style={{
                            background: isSel ? 'rgba(255,255,255,0.06)' : 'transparent',
                            cursor:'pointer', transition:'background 0.1s',
                            borderBottom:'1px solid rgba(255,255,255,0.03)',
                          }}>
                        <td style={{padding:'7px 16px',display:'flex',alignItems:'center',gap:10}}>
                          {isDir ? (
                            <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)"
                                 strokeWidth="1.6" style={{width:16,height:16,flex:'0 0 16px'}}>
                              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                            </svg>
                          ) : (
                            <span style={{
                              flex:'0 0 16px', width:16, height:16, borderRadius:3,
                              background:`${ic.color}22`, border:`1px solid ${ic.color}55`,
                              display:'flex',alignItems:'center',justifyContent:'center',
                              fontSize:6, color:ic.color, fontFamily:'var(--font-mono)',
                              fontWeight:600,
                            }}>{ic.label.slice(0,3)}</span>
                          )}
                          <span style={{color: isSel ? 'var(--fg-0)' : 'var(--fg-1)',whiteSpace:'nowrap',
                                        overflow:'hidden',textOverflow:'ellipsis',maxWidth:320}}>
                            {item.name}
                          </span>
                        </td>
                        <td style={{padding:'7px 16px',color:'var(--fg-4)',fontFamily:'var(--font-mono)',fontSize:10}}>
                          {isDir ? 'Dossier' : (item.ext || '—')}
                        </td>
                        <td style={{padding:'7px 16px',color:'var(--fg-3)',fontFamily:'var(--font-mono)',fontSize:10,textAlign:'right',paddingRight:24}}>
                          {isDir ? '—' : formatSize(item.size)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {!loading && viewMode === 'grid' && (
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(100px,1fr))',
                           gap:8,padding:12}}>
                {filtered.map(item => {
                  const isDir = item.type === 'dir';
                  const ic = isDir ? null : fileIcon(item.ext);
                  const isSel = selected === item.path;
                  return (
                    <div key={item.path}
                         onClick={() => setSelected(isSel ? null : item.path)}
                         onDoubleClick={() => handleOpen(item)}
                         style={{
                           padding:'12px 8px', borderRadius:8, cursor:'pointer',
                           border:`1px solid ${isSel ? 'rgba(255,255,255,0.15)' : 'transparent'}`,
                           background: isSel ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
                           display:'flex',flexDirection:'column',alignItems:'center',gap:8,
                           transition:'all 0.1s',
                         }}>
                      {isDir ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.35)"
                             strokeWidth="1.4" style={{width:32,height:32}}>
                          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                        </svg>
                      ) : (
                        <div style={{
                          width:32,height:40,borderRadius:4,
                          background:`${ic.color}18`,border:`1px solid ${ic.color}44`,
                          display:'flex',alignItems:'center',justifyContent:'center',
                          color:ic.color,fontSize:9,fontFamily:'var(--font-mono)',fontWeight:700,
                        }}>{ic.label}</div>
                      )}
                      <span style={{fontSize:10,color:'var(--fg-2)',textAlign:'center',
                                    wordBreak:'break-all',lineHeight:1.3,maxWidth:'100%',
                                    overflow:'hidden',textOverflow:'ellipsis',
                                    display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>
                        {item.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Detail panel */}
          {selectedItem && (
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              <div className="card" style={{flex:1}}>
                <div className="card-head"><h3>Détails</h3></div>
                <div style={{padding:'14px 16px',display:'flex',flexDirection:'column',gap:14}}>
                  {/* Preview icon */}
                  <div style={{display:'flex',justifyContent:'center',paddingBottom:8,
                               borderBottom:'1px solid var(--line)'}}>
                    {selectedItem.type === 'dir' ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)"
                           strokeWidth="1.2" style={{width:48,height:48}}>
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                      </svg>
                    ) : (() => {
                      const ic = fileIcon(selectedItem.ext);
                      return (
                        <div style={{
                          width:48,height:60,borderRadius:6,
                          background:`${ic.color}18`,border:`1px solid ${ic.color}44`,
                          display:'flex',alignItems:'center',justifyContent:'center',
                          color:ic.color,fontSize:11,fontFamily:'var(--font-mono)',fontWeight:700,
                        }}>{ic.label}</div>
                      );
                    })()}
                  </div>

                  {[
                    ['Nom', selectedItem.name],
                    ['Type', selectedItem.type === 'dir' ? 'Dossier' : selectedItem.ext || 'Fichier'],
                    ['Taille', selectedItem.type === 'file' ? formatSize(selectedItem.size) : '—'],
                    ['Chemin', selectedItem.path],
                  ].map(([l, v]) => (
                    <div key={l}>
                      <div style={{fontSize:9,color:'var(--fg-4)',textTransform:'uppercase',
                                   letterSpacing:'0.1em',marginBottom:3}}>{l}</div>
                      <div style={{fontSize:11,color:'var(--fg-1)',fontFamily:'var(--font-mono)',
                                   wordBreak:'break-all',lineHeight:1.5}}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                <button className="btn" style={{justifyContent:'center'}}
                        onClick={() => handleOpen(selectedItem)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" style={{width:14,height:14}}>
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                    <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                  <span>Ouvrir</span>
                </button>
                {confirm === selectedItem.path ? (
                  <div style={{display:'flex',gap:6}}>
                    <button className="btn" style={{flex:1,justifyContent:'center',
                                                    color:'var(--error)',borderColor:'rgba(255,122,122,0.3)'}}
                            onClick={handleDelete}>Confirmer</button>
                    <button className="btn ghost" style={{flex:1,justifyContent:'center'}}
                            onClick={() => setConfirm(null)}>Annuler</button>
                  </div>
                ) : (
                  <button className="btn ghost" style={{justifyContent:'center',color:'var(--error)'}}
                          onClick={() => setConfirm(selectedItem.path)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" style={{width:14,height:14}}>
                      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
                    </svg>
                    <span>Supprimer</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Status bar */}
        <div style={{
          display:'flex',alignItems:'center',gap:16,
          padding:'6px 12px',borderRadius:8,
          background:'rgba(255,255,255,0.02)',border:'1px solid var(--line)',
          fontFamily:'var(--font-mono)',fontSize:10,color:'var(--fg-4)',
        }}>
          <span>{filtered.length} élément{filtered.length > 1 ? 's' : ''}</span>
          {selected && <span style={{color:'var(--fg-2)'}}>{selectedItem?.name} sélectionné</span>}
          <span style={{marginLeft:'auto'}}>{currentPath}</span>
        </div>

      </div>
    </>
  );
}

window.Explorer = Explorer;
