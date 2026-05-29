// dependencies.jsx — onglet Dépendances : scan + sélection du Python avec pose2sim

const { useState: useStateDep, useEffect: useEffectDep } = React;

function Dependencies() {
  const [info,        setInfo]        = useStateDep(null);
  const [candidates,  setCandidates]  = useStateDep([]);
  const [scanning,    setScanning]    = useStateDep(false);
  const [manualPath,  setManualPath]  = useStateDep('');
  const [busy,        setBusy]        = useStateDep(false);
  const [msg,         setMsg]         = useStateDep(null);   // {type:'ok'|'err'|'info', text}
  const [autoTrying,  setAutoTrying]  = useStateDep(false);

  function refresh() {
    fetch('/api/setup/info').then(r => r.json()).then(setInfo).catch(() => {});
  }

  useEffectDep(() => {
    refresh();
    // Si un autre composant déclenche setup_done, on rafraîchit
    const h = () => refresh();
    if (typeof socket !== 'undefined' && socket.on) {
      socket.on('setup_done', h);
      return () => socket.off && socket.off('setup_done', h);
    }
  }, []);

  async function scan() {
    setScanning(true);
    setMsg(null);
    try {
      const r = await fetch('/api/setup/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ check_pose2sim: true }),
      });
      const d = await r.json();
      setCandidates(d.candidates || []);
      const okCount = (d.candidates || []).filter(c => c.has_pose2sim).length;
      setMsg({
        type: okCount > 0 ? 'ok' : 'info',
        text: `${(d.candidates || []).length} Python détecté(s) · ${okCount} avec pose2sim`,
      });
    } catch (e) {
      setMsg({ type: 'err', text: `Erreur scan : ${e.message}` });
    } finally {
      setScanning(false);
    }
  }

  async function autoDetect() {
    setAutoTrying(true);
    setMsg(null);
    try {
      const r = await fetch('/api/setup/auto-detect', { method: 'POST' });
      const d = await r.json();
      if (d.ok) {
        setMsg({ type: 'ok', text: `Auto-détecté : ${d.path}` });
        refresh();
      } else {
        setMsg({ type: 'info', text: 'Aucun Python avec pose2sim trouvé automatiquement. Lancez un scan complet ou entrez le chemin manuellement.' });
      }
    } catch (e) {
      setMsg({ type: 'err', text: e.message });
    } finally {
      setAutoTrying(false);
    }
  }

  async function applyPath(path) {
    if (!path) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch('/api/setup/use-existing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      const d = await r.json();
      if (d.ok) {
        setMsg({ type: 'ok', text: 'Python appliqué — Oxymore Vision utilisera ce chemin.' });
        refresh();
      } else {
        setMsg({ type: 'err', text: d.error || 'Échec de validation' });
      }
    } catch (e) {
      setMsg({ type: 'err', text: e.message });
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!window.confirm('Réinitialiser la configuration des dépendances ?\nLe venv local n\'est pas supprimé.')) return;
    setBusy(true);
    try {
      await fetch('/api/setup/reset', { method: 'POST' });
      setMsg({ type: 'info', text: 'Configuration effacée. Lance un scan ou saisis un chemin pour reconfigurer.' });
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function browse() {
    try {
      const r = await fetch('/api/browse-folder', { method: 'POST' });
      const d = await r.json();
      if (d.path) setManualPath(d.path + (d.path.endsWith('.exe') ? '' : '\\python.exe'));
    } catch (_) {}
  }

  const sourceColor = {
    'custom':   '#fff',
    'app-venv': '#6ee7a7',
    'conda':    '#93c5fd',
    'PATH':     'var(--fg-2)',
    'system':   'var(--fg-2)',
    'venv':     '#c4b5fd',
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dépendances</h1>
          <div className="sub">Configuration du Python avec pose2sim utilisé par le runner</div>
        </div>
        <div className="head-actions">
          <button className="btn" onClick={refresh} disabled={busy || scanning} title="Recharger l'état">
            ↻ <span>Rafraîchir</span>
          </button>
          <button className="btn" onClick={autoDetect} disabled={autoTrying || scanning || busy}>
            {autoTrying ? '⏳ Détection…' : '⚡ Auto-détecter'}
          </button>
          <button className="btn primary" onClick={scan} disabled={scanning || busy}>
            {scanning ? '🔍 Scan en cours…' : '🔍 Scanner le système'}
          </button>
        </div>
      </div>

      <div className="page-body" style={{ display:'flex', flexDirection:'column', gap:16 }}>
        {/* État actuel */}
        <div className="card" style={{ padding:20 }}>
          <div style={{ fontSize:10.5, color:'var(--fg-4)', textTransform:'uppercase',
                        letterSpacing:'0.1em', marginBottom:12 }}>État actuel</div>
          {!info ? (
            <div style={{ color:'var(--fg-3)', fontSize:12 }}>Chargement…</div>
          ) : (
            <>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                <span style={{
                  width:8, height:8, borderRadius:'50%',
                  background: info.done ? 'var(--success)' : 'var(--error)',
                  boxShadow: info.done ? '0 0 6px rgba(110,231,167,0.6)' : '0 0 6px rgba(239,68,68,0.5)',
                }}/>
                <span style={{ fontSize:14, fontWeight:500, color:'var(--fg-0)' }}>
                  {info.done ? 'Configuré' : 'Non configuré'}
                </span>
                {info.mode && (
                  <span style={{ fontSize:11, color:'var(--fg-3)', marginLeft:6,
                                 padding:'2px 8px', background:'rgba(255,255,255,0.05)',
                                 borderRadius:4, border:'1px solid var(--line)' }}>
                    mode : {info.mode}
                  </span>
                )}
              </div>
              {info.python_path && (
                <div className="mono" style={{ fontSize:11, color:'var(--fg-2)',
                                              wordBreak:'break-all', padding:'8px 12px',
                                              background:'rgba(0,0,0,0.3)', borderRadius:6,
                                              border:'1px solid var(--line)' }}>
                  {info.python_path}
                </div>
              )}
              {info.done && (
                <div style={{ marginTop:12, display:'flex', gap:8 }}>
                  <button className="btn sm ghost" onClick={reset} disabled={busy}>
                    Réinitialiser
                  </button>
                  <span style={{ fontSize:10.5, color:'var(--fg-4)', alignSelf:'center' }}>
                    (le venv local sera conservé)
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Message */}
        {msg && (
          <div style={{
            padding:'10px 16px', borderRadius:8, fontSize:12, lineHeight:1.6,
            background: msg.type === 'ok'  ? 'rgba(110,231,167,0.08)'
                      : msg.type === 'err' ? 'rgba(239,68,68,0.08)'
                      :                      'rgba(255,255,255,0.04)',
            border: `1px solid ${msg.type === 'ok'  ? 'rgba(110,231,167,0.3)'
                              :  msg.type === 'err' ? 'rgba(239,68,68,0.3)'
                              :                       'var(--line-2)'}`,
            color: msg.type === 'ok'  ? 'var(--success)'
                 : msg.type === 'err' ? 'var(--error)'
                 :                      'var(--fg-2)',
          }}>
            {msg.type === 'ok'  ? '✓ ' : msg.type === 'err' ? '✗ ' : 'ℹ '}{msg.text}
          </div>
        )}

        {/* Liste des candidats */}
        {candidates.length > 0 && (
          <div className="card">
            <div className="card-head">
              <h3>Python détectés</h3>
              <div className="meta">{candidates.length} résultat{candidates.length>1?'s':''}</div>
            </div>
            <div style={{ padding:12, display:'flex', flexDirection:'column', gap:8 }}>
              {candidates.map((c, i) => {
                const ok = c.has_pose2sim;
                const isCurrent = info?.python_path === c.path;
                return (
                  <div key={i} style={{
                    display:'flex', alignItems:'center', gap:12,
                    padding:'10px 14px', borderRadius:8,
                    background: isCurrent ? 'rgba(110,231,167,0.05)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${isCurrent ? 'rgba(110,231,167,0.3)' : 'var(--line)'}`,
                  }}>
                    <span style={{
                      width:8, height:8, borderRadius:'50%',
                      background: ok ? 'var(--success)' : 'var(--fg-4)',
                      boxShadow: ok ? '0 0 4px rgba(110,231,167,0.5)' : 'none',
                      flex:'0 0 8px',
                    }}/>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', gap:10, alignItems:'center',
                                    fontSize:12.5, color:'var(--fg-1)' }}>
                        <span className="mono">{c.version}</span>
                        <span style={{
                          fontSize:10, padding:'1px 6px', borderRadius:4,
                          background:'rgba(255,255,255,0.05)',
                          color: sourceColor[c.source] || 'var(--fg-3)',
                          border:'1px solid var(--line)',
                        }}>
                          {c.source}
                        </span>
                        {ok && (
                          <span style={{ fontSize:10.5, color:'var(--success)' }}>
                            ✓ pose2sim
                          </span>
                        )}
                        {isCurrent && (
                          <span style={{ fontSize:10.5, color:'var(--success)', marginLeft:'auto' }}>
                            ● actuel
                          </span>
                        )}
                      </div>
                      <div className="mono" style={{
                        fontSize:10.5, color:'var(--fg-3)', marginTop:3,
                        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                      }}>{c.path}</div>
                    </div>
                    <button className="btn sm"
                            disabled={!ok || busy || isCurrent}
                            title={!ok ? 'pose2sim non installé dans ce Python'
                                  : isCurrent ? 'Déjà sélectionné'
                                  : 'Utiliser ce Python'}
                            onClick={() => applyPath(c.path)}>
                      {isCurrent ? '✓' : 'Utiliser'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Saisie manuelle */}
        <div className="card">
          <div className="card-head"><h3>Chemin manuel</h3></div>
          <div style={{ padding:14, display:'flex', flexDirection:'column', gap:10 }}>
            <div style={{ display:'flex', gap:8 }}>
              <input
                value={manualPath}
                onChange={e => setManualPath(e.target.value)}
                placeholder="C:\...\python.exe"
                style={{
                  flex:1, background:'rgba(255,255,255,0.04)',
                  border:'1px solid var(--line-2)', borderRadius:8,
                  padding:'8px 12px', color:'var(--fg-1)',
                  fontFamily:'var(--font-mono)', fontSize:11.5, outline:'none',
                }}
              />
              <button className="btn sm" onClick={browse} disabled={busy}>Parcourir</button>
              <button className="btn sm primary"
                      onClick={() => applyPath(manualPath.trim())}
                      disabled={busy || !manualPath.trim()}>
                {busy ? '⏳' : 'Valider'}
              </button>
            </div>
            <div style={{ fontSize:10.5, color:'var(--fg-4)', lineHeight:1.7 }}>
              Doit pointer vers un <code>python.exe</code> contenant <code>pose2sim</code> et <code>toml</code>. Exemples :<br/>
              <span className="mono" style={{ fontSize:10.5 }}>
                C:\Users\Moi\anaconda3\envs\pose2sim\python.exe<br/>
                C:\Users\Moi\AppData\Local\Programs\Python\Python312\python.exe
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

window.Dependencies = Dependencies;
