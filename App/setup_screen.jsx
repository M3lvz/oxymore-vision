// setup_screen.jsx — Écran de 1er lancement

const { useState: useStateSU, useEffect: useEffectSU } = React;

function SetupScreen({ onDone }) {
  // mode : 'choose' | 'pre-install' | 'install' | 'existing'
  const [mode,       setMode]      = useStateSU('choose');
  const [logs,       setLogs]      = useStateSU([]);
  const [done,       setDone]      = useStateSU(false);
  const [progress,   setProgress]  = useStateSU(0);
  const [existingPy, setExistingPy]= useStateSU('');
  const [validating, setValidating]= useStateSU(false);
  const [validErr,   setValidErr]  = useStateSU('');
  const [installDir, setInstallDir]= useStateSU('');
  const [installErr, setInstallErr]= useStateSU('');
  const [needsRestart, setNeedsRestart] = useStateSU(false);
  // Auto-détection en background : on déclenche le scan dès l'affichage
  const [autoDetecting, setAutoDetecting] = useStateSU(true);

  useEffectSU(() => {
    socket.on('setup_log', (d) => {
      setLogs(prev => [...prev, d]);
      setProgress(prev => Math.min(prev + 5, 95));
    });
    socket.on('setup_done', (d) => {
      setAutoDetecting(false);
      if (d && d.error === 'no_python') {
        setInstallErr(
          'Aucun Python trouvé sur ce système. ' +
          'Installez Python 3.10+ depuis python.org puis relancez, ' +
          'ou utilisez l\'option "J\'ai déjà pose2sim installé".'
        );
        setMode('pre-install');
        return;
      }
      setProgress(100);
      setDone(true);
      if (d && d.restart) {
        // L'exe a été copié ailleurs → on demande de fermer et utiliser le raccourci
        setNeedsRestart(true);
      } else {
        setTimeout(onDone, d && d.auto ? 400 : 2000);
      }
    });

    // Coupe l'indicateur après 8s si rien ne se passe (scan plus long → l'utilisateur reprend la main)
    const timer = setTimeout(() => setAutoDetecting(false), 8000);
    return () => {
      socket.off('setup_log'); socket.off('setup_done');
      clearTimeout(timer);
    };
  }, []);

  function openPythonOrg() {
    const url = 'https://www.python.org/downloads/';
    try {
      if (window.pywebview && window.pywebview.api && window.pywebview.api.open_url) {
        window.pywebview.api.open_url(url);
      } else {
        window.open(url, '_blank');
      }
    } catch(_) {
      window.open(url, '_blank');
    }
  }

  // ── Parcourir dossier d'installation ──────────────────────────────────────
  async function browseInstallDir() {
    try {
      const r = await fetch('/api/browse-folder', { method: 'POST' });
      const d = await r.json();
      if (d.path) setInstallDir(d.path);
    } catch(e) {}
  }

  // ── Lancer l'installation ──────────────────────────────────────────────────
  async function startInstall() {
    setInstallErr('');
    setMode('install');
    setProgress(0);
    setLogs([{ lvl: 'info', msg: 'Demarrage de l\'installation...' }]);
    try {
      const res = await fetch('/api/setup/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ install_dir: installDir.trim() || null }),
      });
      const d = await res.json();
      if (d.already_done) {
        // Setup déjà terminé — on passe directement à l'app
        setProgress(100);
        setDone(true);
        setLogs(prev => [...prev, { lvl:'ok', msg:'Setup deja effectue — pret !' }]);
        setTimeout(onDone, 1500);
      }
    } catch(e) {
      setLogs(prev => [...prev, { lvl:'error', msg:`Erreur reseau : ${e.message}` }]);
    }
  }

  // ── Python existant ───────────────────────────────────────────────────────
  async function browsePython() {
    try {
      const r = await fetch('/api/browse-folder', { method: 'POST' });
      const d = await r.json();
      if (d.path) {
        setExistingPy(
          d.path + '\\python.exe'   // 1er candidat — l'utilisateur peut corriger
        );
      }
    } catch(e) {}
  }

  async function validateExisting() {
    if (!existingPy.trim()) { setValidErr('Chemin requis'); return; }
    setValidating(true);
    setValidErr('');
    try {
      const res = await fetch('/api/setup/use-existing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: existingPy.trim() }),
      });
      const d = await res.json();
      if (!d.ok) setValidErr(d.error || 'Validation échouée');
      // Si ok : setup_done est émis par le serveur → useEffect → onDone
    } catch(e) {
      setValidErr(e.message);
    } finally {
      setValidating(false);
    }
  }

  // ── Header selon le mode ──────────────────────────────────────────────────
  const headerText = {
    choose:      'Oxymore Vision a besoin de pose2sim pour fonctionner. Choisissez comment l\'obtenir :',
    'pre-install': null,
    install:     null,
    existing:    null,
  };

  // ── Rendu ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      position:'fixed', inset:0, zIndex:9999,
      background:'radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.04), transparent 60%), #000',
      display:'flex', alignItems:'center', justifyContent:'center',
      fontFamily:'var(--font-sans)',
    }}>
      <div style={{
        width:580, background:'var(--bg-2)',
        border:'1px solid var(--line-2)', borderRadius:20,
        overflow:'hidden', boxShadow:'0 40px 80px rgba(0,0,0,0.8)',
      }}>

        {/* ── Header ────────────────────────────────────────────────────── */}
        <div style={{
          padding:'28px 32px 20px',
          borderBottom:'1px solid var(--line)',
          background:'linear-gradient(180deg, rgba(255,255,255,0.03), transparent)',
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom: headerText[mode] ? 12 : 0 }}>
            <div style={{
              width:40, height:40, borderRadius:10,
              background:'rgba(255,255,255,0.06)', border:'1px solid var(--line-2)',
              display:'flex', alignItems:'center', justifyContent:'center', fontSize:20,
            }}>⚙️</div>
            <div>
              <div style={{ fontSize:17, fontWeight:600, color:'var(--fg-0)' }}>
                Configuration initiale
              </div>
              <div style={{ fontSize:11, color:'var(--fg-3)', marginTop:1 }}>
                Oxymore Vision — Premier lancement
              </div>
            </div>
          </div>
          {mode === 'choose' && (
            <p style={{ fontSize:13, color:'var(--fg-2)', lineHeight:1.6, margin:0 }}>
              Oxymore Vision a besoin de{' '}
              <strong style={{color:'var(--fg-1)'}}>pose2sim</strong>{' '}
              pour fonctionner. Choisissez comment l'obtenir :
            </p>
          )}
          {mode === 'pre-install' && (
            <p style={{ fontSize:13, color:'var(--fg-2)', lineHeight:1.6, margin:0, marginTop:8 }}>
              Création d'un{' '}
              <strong style={{color:'var(--fg-1)'}}>environnement Python dédié</strong>{' '}
              avec torch CUDA, onnxruntime-gpu et pose2sim.<br/>
              <span style={{fontSize:11, color:'var(--fg-4)'}}>
                ~4 Go · connexion internet requise · Python 3.10+ requis sur la machine
              </span>
            </p>
          )}
          {mode === 'install' && !done && (
            <p style={{ fontSize:13, color:'var(--fg-2)', lineHeight:1.6, margin:0, marginTop:8 }}>
              Installation en cours ·{' '}
              <strong style={{color:'var(--fg-1)'}}>~4 Go · ~10-20 min</strong>{' '}
              · Ne fermez pas la fenêtre.
            </p>
          )}
          {mode === 'existing' && (
            <p style={{ fontSize:13, color:'var(--fg-2)', lineHeight:1.6, margin:0, marginTop:8 }}>
              Entrez le chemin de l'<strong style={{color:'var(--fg-1)'}}>exécutable Python</strong>{' '}
              qui a déjà pose2sim installé.<br/>
              <span style={{fontSize:11, color:'var(--fg-4)'}}>
                Ex : C:\Users\Moi\anaconda3\envs\pose2sim\python.exe
              </span>
            </p>
          )}
        </div>

        {/* ── Corps CHOOSE ──────────────────────────────────────────────── */}
        {mode === 'choose' && (
          <div style={{ padding:'20px 32px', display:'flex', flexDirection:'column', gap:10 }}>
            {/* Indicateur auto-détection */}
            {autoDetecting && (
              <div style={{
                display:'flex', alignItems:'center', gap:10,
                padding:'10px 14px', marginBottom:4, borderRadius:8,
                background:'rgba(255,255,255,0.04)', border:'1px solid var(--line-2)',
              }}>
                <span style={{
                  width:10, height:10, borderRadius:'50%',
                  background:'#fff', boxShadow:'0 0 6px rgba(255,255,255,0.6)',
                  animation:'pulse-soft 1s infinite',
                }}/>
                <span style={{ fontSize:12, color:'var(--fg-2)' }}>
                  Recherche automatique d'une installation pose2sim existante…
                </span>
              </div>
            )}
            {/* Carte A */}
            <div
              onClick={() => setMode('pre-install')}
              style={{
                padding:'14px 18px', borderRadius:12,
                border:'1px solid var(--line-2)', background:'rgba(255,255,255,0.03)',
                cursor:'pointer', display:'flex', gap:14, alignItems:'flex-start',
              }}
            >
              <div style={{ fontSize:22, marginTop:1 }}>📦</div>
              <div>
                <div style={{ fontSize:14, fontWeight:600, color:'var(--fg-0)', marginBottom:3 }}>
                  Installer automatiquement
                </div>
                <div style={{ fontSize:12, color:'var(--fg-3)', lineHeight:1.5 }}>
                  Crée un environnement dédié (torch CUDA 12.8 + pose2sim).<br/>
                  <span style={{color:'var(--fg-4)'}}>~4 Go · internet requis · Python 3.10+ requis</span>
                </div>
              </div>
            </div>

            {/* Carte B */}
            <div
              onClick={() => setMode('existing')}
              style={{
                padding:'14px 18px', borderRadius:12,
                border:'1px solid var(--line-2)', background:'rgba(255,255,255,0.03)',
                cursor:'pointer', display:'flex', gap:14, alignItems:'flex-start',
              }}
            >
              <div style={{ fontSize:22, marginTop:1 }}>🔍</div>
              <div>
                <div style={{ fontSize:14, fontWeight:600, color:'var(--fg-0)', marginBottom:3 }}>
                  J'ai déjà pose2sim installé
                </div>
                <div style={{ fontSize:12, color:'var(--fg-3)', lineHeight:1.5 }}>
                  Pointe vers un Python existant (conda, venv, global).<br/>
                  <span style={{color:'var(--fg-4)'}}>Aucun téléchargement · instantané</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Corps PRE-INSTALL ─────────────────────────────────────────── */}
        {mode === 'pre-install' && (
          <div style={{ padding:'24px 32px', display:'flex', flexDirection:'column', gap:16 }}>

            {/* Erreur no_python */}
            {installErr && (
              <div style={{
                padding:'12px 16px', borderRadius:10,
                background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)',
                fontSize:12, color:'var(--error)', lineHeight:1.6,
              }}>
                <div style={{ marginBottom:10 }}>❌ {installErr}</div>
                <button onClick={openPythonOrg}
                        style={{ padding:'7px 14px', borderRadius:6, fontSize:12, fontWeight:600,
                                 background:'#fff', border:'none', color:'#000', cursor:'pointer' }}>
                  📥 Télécharger Python depuis python.org
                </button>
              </div>
            )}

            {/* Dossier d'installation */}
            <div>
              <div style={{ fontSize:11, color:'var(--fg-4)', textTransform:'uppercase',
                            letterSpacing:'0.08em', marginBottom:8 }}>
                Dossier d'installation
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <input
                  value={installDir}
                  onChange={e => setInstallDir(e.target.value)}
                  placeholder={`Ex : C:\\Users\\${(typeof navigator !== 'undefined' ? '' : '')}...\\OxymoreVision`}
                  style={{
                    flex:1, background:'rgba(255,255,255,0.05)',
                    border:'1px solid var(--line-2)', borderRadius:8,
                    padding:'9px 12px', color:'var(--fg-1)',
                    fontFamily:'var(--font-mono)', fontSize:12, outline:'none',
                  }}
                />
                <button className="btn sm" onClick={browseInstallDir} title="Choisir le dossier">
                  📁 Parcourir
                </button>
              </div>
              <div style={{
                marginTop:10, padding:'10px 14px', borderRadius:8,
                background:'rgba(255,255,255,0.03)', border:'1px solid var(--line)',
                fontSize:11, color:'var(--fg-4)', lineHeight:1.8,
              }}>
                <strong style={{color:'var(--fg-3)'}}>Ce qui sera créé dans ce dossier :</strong><br/>
                · <code>OxymoreVision.exe</code> — l'application (copiée ici)<br/>
                · <code>venv\</code> — l'environnement Python (~4 Go)<br/>
                · <code>.setup_done</code> — marqueur de configuration<br/>
                · 🖥️ Un <strong>raccourci Windows</strong> sera ajouté sur le Bureau.
              </div>
            </div>

            {/* Bouton principal */}
            <button
              onClick={startInstall}
              style={{
                padding:'12px 0', borderRadius:10, fontSize:14, fontWeight:700,
                background:'#fff', border:'none', color:'#000', cursor:'pointer',
                width:'100%', letterSpacing:'0.01em',
              }}
            >
              🚀 Lancer l'installation
            </button>
          </div>
        )}

        {/* ── Corps EXISTING ────────────────────────────────────────────── */}
        {mode === 'existing' && (
          <div style={{ padding:'24px 32px', display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ fontSize:11, color:'var(--fg-4)', textTransform:'uppercase',
                          letterSpacing:'0.08em' }}>
              Exécutable Python (avec pose2sim)
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <input
                value={existingPy}
                onChange={e => { setExistingPy(e.target.value); setValidErr(''); }}
                placeholder="C:\...\python.exe"
                style={{
                  flex:1, background:'rgba(255,255,255,0.04)',
                  border:`1px solid ${validErr ? 'var(--error)' : 'var(--line-2)'}`,
                  borderRadius:8, padding:'8px 12px',
                  color:'var(--fg-1)', fontFamily:'var(--font-mono)', fontSize:12, outline:'none',
                }}
              />
              <button className="btn sm" onClick={browsePython}>Parcourir</button>
            </div>

            {validErr && (
              <div style={{ fontSize:12, color:'var(--error)', padding:'8px 12px',
                            background:'rgba(239,68,68,0.08)', borderRadius:8 }}>
                ❌ {validErr}
              </div>
            )}

            <div style={{ fontSize:11, color:'var(--fg-4)', lineHeight:1.7 }}>
              Exemples de chemins valides :<br/>
              <span style={{fontFamily:'var(--font-mono)'}}>
                C:\Users\Moi\anaconda3\envs\pose2sim\python.exe<br/>
                C:\Users\Moi\AppData\Local\Programs\Python\Python312\python.exe
              </span>
            </div>

            <button
              disabled={validating || !existingPy.trim()}
              onClick={validateExisting}
              style={{
                padding:'10px 0', borderRadius:9, fontSize:13, fontWeight:600,
                background: validating ? 'rgba(255,255,255,0.1)' : '#fff',
                border:'none', color:'#000',
                cursor: validating ? 'default' : 'pointer',
                opacity: !existingPy.trim() ? 0.4 : 1,
                width:'100%',
              }}
            >
              {validating ? '⏳ Vérification en cours…' : 'Valider et continuer →'}
            </button>
          </div>
        )}

        {/* ── Corps INSTALL ─────────────────────────────────────────────── */}
        {mode === 'install' && (
          <div style={{ padding:'20px 32px' }}>
            <div style={{ marginBottom:14 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:11,
                            color:'var(--fg-3)', marginBottom:8 }}>
                <span>{done ? '✅ Installation terminée !' : '📥 Installation en cours…'}</span>
                <span style={{ fontFamily:'var(--font-mono)' }}>{progress}%</span>
              </div>
              <div style={{ height:4, background:'rgba(255,255,255,0.06)', borderRadius:2 }}>
                <div style={{
                  height:'100%', borderRadius:2,
                  background: done ? 'var(--success)' : '#fff',
                  width:`${progress}%`, transition:'width 0.4s ease',
                  boxShadow: done ? '0 0 8px rgba(110,231,167,0.5)' : '0 0 8px rgba(255,255,255,0.4)',
                }}/>
              </div>
            </div>

            {/* Message redémarrage */}
            {needsRestart && (
              <div style={{
                marginBottom:12, padding:'14px 16px', borderRadius:10,
                background:'rgba(110,231,167,0.08)', border:'1px solid rgba(110,231,167,0.3)',
                fontSize:13, color:'var(--success)', lineHeight:1.7,
              }}>
                <strong>🎉 Installation terminée !</strong><br/>
                Un raccourci <strong>Oxymore Vision</strong> a été créé sur le Bureau.<br/>
                <span style={{fontSize:12, color:'var(--fg-3)'}}>
                  Cette fenêtre peut être fermée — l'exe d'origine sera supprimé automatiquement.
                </span>
              </div>
            )}

            <div style={{
              background:'#000', borderRadius:8, padding:12,
              height: needsRestart ? 120 : 200,
              overflow:'auto', fontFamily:'var(--font-mono)', fontSize:11,
              border:'1px solid var(--line)',
              transition:'height 0.3s ease',
            }} ref={el => el && (el.scrollTop = el.scrollHeight)}>
              {logs.map((l, i) => (
                <div key={i} style={{
                  color: l.lvl==='error' ? 'var(--error)'
                       : l.lvl==='warn'  ? 'var(--warn)'
                       : l.lvl==='ok'    ? 'var(--success)'
                       : 'rgba(255,255,255,0.7)',
                  lineHeight:1.6,
                }}>{l.msg}</div>
              ))}
            </div>
          </div>
        )}

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <div style={{
          padding:'14px 32px 22px',
          borderTop:'1px solid var(--line)',
          display:'flex', justifyContent:'space-between', alignItems:'center',
        }}>
          {/* Gauche : retour */}
          <div>
            {(mode === 'pre-install' || mode === 'existing') && !done && (
              <button
                style={{ padding:'8px 16px', borderRadius:8, fontSize:13,
                         background:'transparent', border:'1px solid var(--line-2)',
                         color:'var(--fg-3)', cursor:'pointer' }}
                onClick={() => { setMode('choose'); setValidErr(''); setInstallErr(''); }}
              >← Retour</button>
            )}
            {mode === 'choose' && (
              <button
                style={{ padding:'8px 16px', borderRadius:8, fontSize:13,
                         background:'transparent', border:'none',
                         color:'var(--fg-4)', cursor:'pointer' }}
                onClick={onDone}
              >Ignorer</button>
            )}
          </div>

          {/* Droite : Fermer (restart) ou Commencer (install normal) */}
          <div>
            {done && needsRestart && (
              <button
                onClick={() => {
                  if (window.pywebview && window.pywebview.api) {
                    window.pywebview.api.close();
                  } else {
                    window.close();
                  }
                }}
                style={{ padding:'9px 24px', borderRadius:8, fontSize:13, fontWeight:600,
                         background:'var(--success)', border:'none', color:'#000', cursor:'pointer' }}
              >Fermer et utiliser le raccourci →</button>
            )}
            {done && !needsRestart && (
              <button
                onClick={onDone}
                style={{ padding:'9px 24px', borderRadius:8, fontSize:13, fontWeight:600,
                         background:'var(--success)', border:'none', color:'#000', cursor:'pointer' }}
              >Commencer →</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

window.SetupScreen = SetupScreen;
