// rec_mode.jsx — Mode REK : design refresh (stepper sidebar + full main panel)

const { useState: useStateREC, useEffect: useEffectREC, useRef: useRefREC } = React;

// ── Steps config ──────────────────────────────────────────────────────────────
const REC_STEPS = [
  { id: 'connexion', name: 'Connexion',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg> },
  { id: 'cameras',   name: 'Caméras',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="4"/></svg> },
  { id: 'export',    name: 'Export',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v13M6 11l6 6 6-6M4 21h16"/></svg> },
];

const STEP_HEAD = {
  connexion: {
    eyebrow: 'Étape 01 · Réseau local',
    title: <>Connecte les <span className="em">téléphones</span></>,
    desc: "Scanne le QR code sur chaque téléphone de capture. Tous doivent être sur le même réseau WiFi que ce PC.",
  },
  cameras: {
    eyebrow: 'Étape 02 · Captation',
    title: <>Gère les <span className="em">caméras</span> & lance le REK</>,
    desc: "Vérifie chaque flux, puis démarre l'enregistrement synchronisé sur tous les appareils simultanément.",
  },
  export: {
    eyebrow: 'Étape 03 · Récupération',
    title: <>Récupère & <span className="em">exporte</span> les rushes</>,
    desc: "Les vidéos uploadées atterrissent ici. Importe-les dans le projet pour lancer le pipeline mocap.",
  },
};

// ── Live recording timer ──────────────────────────────────────────────────────
function useRecTimer(isRecording, paused) {
  const [elapsed, setElapsed] = useStateREC(0);
  const accRef   = useRefREC(0);
  const startRef = useRefREC(null);
  useEffectREC(() => {
    if (!isRecording) { accRef.current = 0; startRef.current = null; setElapsed(0); return; }
    if (paused) {
      if (startRef.current != null) { accRef.current += (Date.now() - startRef.current) / 1000; startRef.current = null; }
      return;
    }
    startRef.current = Date.now();
    const id = setInterval(() => {
      setElapsed(Math.floor(accRef.current + (Date.now() - startRef.current) / 1000));
    }, 200);
    return () => clearInterval(id);
  }, [isRecording, paused]);
  return `${String(Math.floor(elapsed / 60)).padStart(2,'0')}:${String(elapsed % 60).padStart(2,'0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
function RecMode({ project, onExit }) {

  // ── Navigation ───────────────────────────────────────────────────────────────
  const [step,         setStep]         = useStateREC('connexion');

  // ── Backend state ─────────────────────────────────────────────────────────────
  const [devices,      setDevices]      = useStateREC([]);
  const [files,        setFiles]        = useStateREC([]);
  const [recording,    setRecording]    = useStateREC(false);
  const [importing,    setImporting]    = useStateREC(false);
  const [msg,          setMsg]          = useStateREC(null);
  const [qrError,      setQrError]      = useStateREC(false);
  const [fwStatus,     setFwStatus]     = useStateREC(null);
  const [certMsg,      setCertMsg]      = useStateREC(null);
  const [httpsUrl,     setHttpsUrl]     = useStateREC(null);
  const [httpsReady,   setHttpsReady]   = useStateREC(false);
  const [httpsLoading, setHttpsLoading] = useStateREC(false);
  const [previews,     setPreviews]     = useStateREC({});
  const [copied,       setCopied]       = useStateREC(false);

  // ── UI-only transport ─────────────────────────────────────────────────────────
  const [paused, setPaused] = useStateREC(false);
  const [takes,  setTakes]  = useStateREC(1);
  const elapsed = useRecTimer(recording, paused);

  // ── Hand Tracking ─────────────────────────────────────────────────────────────
  const [handEnabled,   setHandEnabled]   = useStateREC(false);
  const [handProto,     setHandProto]     = useStateREC('tcp');
  const [handStatus,    setHandStatus]    = useStateREC(null);
  const [handFrame,     setHandFrame]     = useStateREC(null);
  const [adbInfo,       setAdbInfo]       = useStateREC(null);
  const [adbLoading,    setAdbLoading]    = useStateREC(false);

  // ── API ───────────────────────────────────────────────────────────────────────
  function checkFirewall() {
    fetch('/api/rec/firewall-status').then(r => r.json()).then(setFwStatus).catch(() => {});
  }
  useEffectREC(() => { checkFirewall(); }, []);

  async function refreshAll() {
    setHttpsLoading(true);
    checkFirewall();
    try {
      const r = await fetch('/api/rec/start-https', { method: 'POST' });
      const d = await r.json();
      if (d.ok) { setHttpsUrl(d.url); setHttpsReady(true); setQrError(false); }
      else        { setHttpsReady(false); }
    } catch(_) {}
    setHttpsLoading(false);
    refresh();
  }

  async function trustCertPC() {
    setCertMsg({ type: 'wait', text: 'Installation en cours…' });
    try {
      const r = await fetch('/api/rec/trust-cert', { method: 'POST' });
      const d = await r.json();
      setCertMsg(d.ok
        ? { type: 'ok',  text: d.msg   || 'Cert installé ✓' }
        : { type: 'err', text: d.error || 'Erreur' });
    } catch (e) { setCertMsg({ type: 'err', text: e.message }); }
  }

  async function fixFirewall() {
    setMsg({ type: 'ok', text: 'Accepte le prompt UAC qui va apparaître…' });
    try {
      const r = await fetch('/api/rec/fix-firewall', { method: 'POST' });
      const d = await r.json();
      if (d.ok) { setMsg({ type: 'ok', text: 'Pare-feu configuré. Rafraîchis dans 10 s.' }); setTimeout(checkFirewall, 8000); }
      else       { setMsg({ type: 'err', text: d.error || 'Erreur' }); }
    } catch (e) { setMsg({ type: 'err', text: e.message }); }
  }

  function refresh() {
    fetch('/api/rec/info').then(r => r.json()).then(d => {
      setDevices(d.devices || []);
      setFiles(d.files   || []);
      setRecording(d.recording);
    }).catch(() => {});
  }

  useEffectREC(() => {
    fetch('/api/rec/start-https', { method: 'POST' })
      .then(r => r.json())
      .then(d => { if (d.ok) { setHttpsUrl(d.url); setHttpsReady(true); } })
      .catch(() => {});
  }, []);

  useEffectREC(() => {
    refresh();
    const onJoined   = (d) => setDevices(prev => [...prev.filter(x => x.sid !== d.sid), d]);
    const onLeft     = (d) => { setDevices(prev => prev.filter(x => x.sid !== d.sid)); setPreviews(prev => { const n={...prev}; delete n[d.sid]; return n; }); };
    const onUpdate   = (d) => setDevices(prev => prev.map(x => x.sid === d.sid ? d : x));
    const onUploaded = (f) => setFiles(prev => [...prev, f]);
    const onCleared  = ()  => setFiles([]);
    const onFrame    = (d) => setPreviews(prev => ({...prev, [d.sid]: d.frame}));
    const onHandFrame = (f) => setHandFrame(f);
    if (typeof socket !== 'undefined') {
      socket.on('rec_device_joined',  onJoined);
      socket.on('rec_device_left',    onLeft);
      socket.on('rec_device_updated', onUpdate);
      socket.on('rec_uploaded',       onUploaded);
      socket.on('rec_files_cleared',  onCleared);
      socket.on('rec_frame',          onFrame);
      socket.on('hand_frame',         onHandFrame);
      return () => {
        socket.off?.('rec_device_joined',  onJoined);
        socket.off?.('rec_device_left',    onLeft);
        socket.off?.('rec_device_updated', onUpdate);
        socket.off?.('rec_uploaded',       onUploaded);
        socket.off?.('rec_files_cleared',  onCleared);
        socket.off?.('rec_frame',          onFrame);
        socket.off?.('hand_frame',         onHandFrame);
      };
    }
  }, []);

  // Démarre/stoppe le receiver à la volée si la case est cochée pendant le REK
  useEffectREC(() => {
    if (!recording) return;
    if (handEnabled) {
      fetch('/api/rec/hand/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ protocol: handProto, port: handProto === 'tcp' ? 8000 : 9000, project_dir: project?.path }),
      }).then(r => r.json()).then(setHandStatus).catch(() => {});
    } else {
      fetch('/api/rec/hand/stop', { method: 'POST' }).catch(() => {});
      setHandStatus(null);
      setHandFrame(null);
    }
  }, [handEnabled, recording]);

  // Poll hand status quand activé (pendant et hors REK)
  useEffectREC(() => {
    if (!handEnabled) return;
    const id = setInterval(() => {
      fetch('/api/rec/hand/status').then(r => r.json()).then(setHandStatus).catch(() => {});
    }, 1500);
    return () => clearInterval(id);
  }, [handEnabled]);

  function startRec() {
    if (typeof socket === 'undefined') return;
    const payload = { cmd: 'start' };
    if (handEnabled) {
      payload.hand_tracking = {
        protocol: handProto,
        port: handProto === 'tcp' ? 8000 : 9000,
      };
    }
    socket.emit('rec_command', payload);
    setRecording(true); setPaused(false); setTakes(1);
  }
  function stopRec() {
    if (typeof socket === 'undefined') return;
    socket.emit('rec_command', { cmd: 'stop' });
    setRecording(false); setPaused(false);
  }

  async function setupAdb() {
    setAdbLoading(true);
    try {
      const r = await fetch('/api/rec/hand/adb-setup', { method: 'POST' });
      const d = await r.json();
      setAdbInfo(d);
    } catch (e) {
      setAdbInfo({ ok: false, message: e.message });
    } finally {
      setAdbLoading(false);
    }
  }

  async function importToProject() {
    if (!project?.path) { setMsg({ type: 'err', text: "Aucun projet actif — sélectionne un projet d'abord" }); return; }
    setImporting(true); setMsg(null);
    try {
      const r = await fetch('/api/rec/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: project.path }),
      });
      const d = await r.json();
      if (d.ok) { setMsg({ type: 'ok', text: `${d.imported.length} fichier(s) importé(s) dans ${d.videos_dir}` }); refresh(); }
      else       { setMsg({ type: 'err', text: d.error || "Erreur d'import" }); }
    } finally { setImporting(false); }
  }

  async function clearFiles() {
    if (!window.confirm('Effacer les fichiers uploadés ?')) return;
    await fetch('/api/rec/clear', { method: 'POST' }); refresh();
  }

  function copyUrl() {
    if (!httpsUrl) return;
    navigator.clipboard?.writeText(httpsUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  // ── Derived state ─────────────────────────────────────────────────────────────
  const sessionFinished = !recording && files.length > 0;
  const stepStatus = {
    connexion: devices.length > 0 ? 'done' : 'todo',
    cameras:   recording ? 'live' : sessionFinished ? 'done' : 'todo',
    export:    files.length > 0 ? 'ready' : 'todo',
  };

  function fwBannerType() {
    if (!fwStatus?.applicable) return null;
    if (fwStatus.profile === 'Public') return 'warn';
    if (fwStatus.profile === 'Private') return 'ok';
    if (fwStatus.profile === 'DomainAuthenticated' || fwStatus.profile === 'Domain') return 'info';
    return null;
  }
  const fwBanner = fwBannerType();
  const head     = STEP_HEAD[step];
  const lanIp    = httpsUrl ? httpsUrl.split('//')[1]?.split(':')[0] : null;

  const IcoCheck = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L20 7"/></svg>;

  return (
    <div style={{ flex:1, minHeight:0, display:'flex', flexDirection:'column', background:'#050507', overflow:'hidden' }}>
      <div className="rec-window-body" style={{ flex:1, minHeight:0 }}>

        {/* ────────── Sidebar ────────────────────────────────────────────────── */}
        <aside className="rec-sidebar">
          <div className="rec-sidebar-brand">
            <div className="glyph">
              <svg viewBox="0 0 24 24" fill="currentColor" style={{ width:19, height:19 }}>
                <path d="M13 2 3 14h7l-1 8 10-12h-7z"/>
              </svg>
            </div>
            <div className="tt">
              <div className="mode">
                Mode REK
                {recording && <span className="live"/>}
              </div>
              <div className="sub">Capture LAN</div>
            </div>
          </div>

          <div className="rec-menu-label">Étapes</div>
          <div className="rec-stepper">
            {REC_STEPS.map(s => {
              const st     = stepStatus[s.id];
              const active = step === s.id;
              const live   = st === 'live';
              const done   = st === 'done' || st === 'ready';
              return (
                <button key={s.id}
                  className={['rec-step', active && 'active', done && 'done', live && 'rec-live'].filter(Boolean).join(' ')}
                  onClick={() => setStep(s.id)}>
                  <div className="dot">{done ? IcoCheck : s.icon}</div>
                  <div className="tt">
                    <div className="nm">{s.name}</div>
                    <div className="meta">
                      {s.id === 'connexion' && (devices.length > 0
                        ? `${devices.length} appareil${devices.length > 1 ? 's' : ''} connecté${devices.length > 1 ? 's' : ''}`
                        : 'En attente')}
                      {s.id === 'cameras' && (recording ? 'REK en cours…' : sessionFinished ? 'Session terminée' : `${devices.length} prêt${devices.length !== 1 ? 's' : ''}`)}
                      {s.id === 'export' && (files.length > 0 ? `${files.length} fichier${files.length > 1 ? 's' : ''} reçu${files.length > 1 ? 's' : ''}` : 'Rien à exporter')}
                    </div>
                  </div>
                  {s.id === 'connexion' && devices.length > 0 && <span className="badge-mini">{devices.length}</span>}
                  {live && <span className="badge-mini">●</span>}
                  {s.id === 'export' && files.length > 0 && <span className="badge-mini">{files.length}</span>}
                </button>
              );
            })}
          </div>

          <div className="rec-sidebar-footer">
            <div className="project-card">
              <div className="pl">Projet actif</div>
              <div className="pn">
                <span className="dot"/>
                {project?.name || 'Aucun projet'}
              </div>
              {project?.path && <div className="pp">{project.path}</div>}
            </div>
            <button className="rec-exit-btn" onClick={onExit}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width:14, height:14 }}>
                <path d="M19 12H5M11 18l-6-6 6-6"/>
              </svg>
              <span>Quitter le mode REK</span>
            </button>
          </div>
        </aside>

        {/* ────────── Main panel ─────────────────────────────────────────────── */}
        <main className="rec-main">
          <div className="rec-main-head">
            <div>
              <div className="eyebrow">
                {recording && step === 'cameras' && (
                  <span style={{ width:7, height:7, borderRadius:'50%', background:'#ff5050', boxShadow:'0 0 8px rgba(255,80,80,.7)', display:'inline-block', flexShrink:0 }}/>
                )}
                <span className="n">{head.eyebrow.split(' · ')[0]}</span>
                <span style={{ color:'var(--fg-4)' }}>·</span>
                <span>{head.eyebrow.split(' · ')[1]}</span>
              </div>
              <h1>{head.title}</h1>
              <div className="desc">{head.desc}</div>
            </div>
            <div className="head-actions">
              {step === 'export' && files.length > 0 && (
                <button className="btn sm ghost" onClick={clearFiles}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width:13, height:13 }}>
                    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  </svg>
                  <span>Effacer</span>
                </button>
              )}
              {step === 'connexion' && (
                <button className="btn" onClick={refreshAll} disabled={httpsLoading}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
                    style={{ width:14, height:14, ...(httpsLoading ? { animation:'spin .9s linear infinite' } : {}) }}>
                    <path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/>
                  </svg>
                  <span>Rafraîchir</span>
                </button>
              )}
            </div>
          </div>

          <div className="rec-step-body">
            {step === 'connexion' && (
              <RecConnexionPane
                fwBanner={fwBanner} fwProfile={fwStatus?.profile}
                httpsUrl={httpsUrl} httpsReady={httpsReady} httpsLoading={httpsLoading}
                qrError={qrError} certMsg={certMsg} copied={copied} lanIp={lanIp}
                onRefresh={refreshAll} onFixFirewall={fixFirewall}
                onTrustCert={trustCertPC} onCopy={copyUrl}
                onQrError={() => setQrError(true)}
              />
            )}
            {step === 'cameras' && (
              <RecCamerasPane
                devices={devices} previews={previews}
                recording={recording} paused={paused} takes={takes} elapsed={elapsed}
                onStart={startRec} onStop={stopRec}
                onTogglePause={() => setPaused(p => !p)}
                onMark={() => setTakes(t => t + 1)}
                handEnabled={handEnabled} onHandEnabled={setHandEnabled}
                handProto={handProto}     onHandProto={setHandProto}
                handStatus={handStatus}   handFrame={handFrame}
                adbInfo={adbInfo}         adbLoading={adbLoading}
                onSetupAdb={setupAdb}     project={project}
              />
            )}
            {step === 'export' && (
              <RecExportPane
                files={files} project={project}
                importing={importing} msg={msg}
                onImport={importToProject}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pane: Connexion
// ─────────────────────────────────────────────────────────────────────────────
function RecConnexionPane({ fwBanner, fwProfile, httpsUrl, httpsReady, httpsLoading, qrError, certMsg, copied, lanIp, onRefresh, onFixFirewall, onTrustCert, onCopy, onQrError }) {
  const IcoRefresh = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width:12, height:12 }}>
      <path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/>
    </svg>
  );

  return (
    <div className="rec-step-inner">

      {/* ── Firewall banners ── */}
      {fwBanner === 'warn' && (
        <div className="banner warn">
          <div className="b-ico">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width:14, height:14 }}>
              <path d="M12 9v4M12 17h.01M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            </svg>
          </div>
          <div className="b-body">
            <div className="b-title">Pare-feu Windows en mode « Public »</div>
            Les téléphones ne pourront pas joindre ce PC. Passe le profil WiFi en « Privé ».
            <div className="b-actions">
              <button className="btn sm" onClick={onFixFirewall}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width:12, height:12 }}>
                  <path d="M12 3 4 6v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V6z"/>
                </svg>
                <span>Passer en privé</span>
              </button>
              <button className="btn sm ghost" onClick={onRefresh} disabled={httpsLoading}>{IcoRefresh}<span>Re-vérifier</span></button>
            </div>
          </div>
        </div>
      )}
      {fwBanner === 'info' && (
        <div className="banner info">
          <div className="b-ico">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width:14, height:14 }}>
              <circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="18" cy="18" r="2"/>
              <path d="M8 6h8M6 8v8M18 8v8M8 18h8" strokeDasharray="2 3"/>
            </svg>
          </div>
          <div className="b-body">
            <div className="b-title">Réseau domaine détecté ({fwProfile})</div>
            Des politiques GPO ou l'isolation AP du WiFi scolaire peuvent bloquer les connexions — voir l'aide ci-dessous.
            <div className="b-actions">
              <button className="btn sm ghost" onClick={onRefresh} disabled={httpsLoading}>{IcoRefresh}<span>Rafraîchir l'état</span></button>
            </div>
          </div>
        </div>
      )}
      {fwBanner === 'ok' && (
        <div className="banner ok">
          <div className="b-ico">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width:14, height:14 }}>
              <path d="m5 12 5 5L20 7"/>
            </svg>
          </div>
          <div className="b-body" style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div>
              <span style={{ color:'var(--success)', fontWeight:500 }}>Pare-feu OK</span>
              <span style={{ color:'var(--fg-3)', marginLeft:8 }}>· Réseau « Privé » · Port ouvert</span>
            </div>
            <button className="btn sm ghost" onClick={onRefresh} disabled={httpsLoading}>{IcoRefresh}</button>
          </div>
        </div>
      )}

      {/* ── 2-col layout ── */}
      <div className="conn-layout">

        {/* QR card */}
        <div className="qr-card">
          <div className="qr-frame">
            {!httpsReady ? (
              <div style={{ width:216, height:216, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12, background:'#f5f5f5', borderRadius:6, color:'#888', fontSize:12, padding:20, textAlign:'center' }}>
                <div>{httpsLoading ? 'Démarrage HTTPS…' : 'Serveur HTTPS non prêt'}</div>
                <button className="btn sm" onClick={onRefresh} disabled={httpsLoading}
                  style={{ color:'#444', background:'#e5e5e5', border:'1px solid #ccc' }}>
                  {IcoRefresh}<span>{httpsLoading ? 'Démarrage…' : 'Réessayer'}</span>
                </button>
              </div>
            ) : !qrError ? (
              <img src={`/api/rec/qr?t=${httpsUrl || 'x'}`} alt="QR code" onError={onQrError}
                   style={{ width:216, height:216, display:'block' }}/>
            ) : (
              <div style={{ width:216, height:216, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8, background:'#f5f5f5', borderRadius:6, color:'#888', fontSize:12, textAlign:'center' }}>
                QR indisponible<br/><span style={{ fontSize:10 }}>Utilise l'URL ci-dessous</span>
              </div>
            )}
          </div>

          <div className="qr-url">
            <div className="qr-url-label">URL de la session</div>
            <div className="qr-url-row">
              <span className="url">{httpsUrl || 'Chargement…'}</span>
              <button onClick={onCopy} title="Copier l'URL">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width:12, height:12 }}>
                  <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
                <span>{copied ? 'Copié ✓' : 'Copier'}</span>
              </button>
            </div>
          </div>

          <div className="qr-hint">
            Scanne le QR code depuis ton téléphone ou tape l'URL dans le navigateur. Le téléphone doit être sur le <strong>même WiFi</strong> que ce PC.
          </div>
        </div>

        {/* Right: cert + help */}
        <div className="conn-right">
          <div className="cert-section" style={{ marginTop:0 }}>
            <div className="cert-section-head">
              <div className="ico">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width:14, height:14 }}>
                  <rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>
                </svg>
              </div>
              <div className="ttl">
                Certificat HTTPS
                <span className="sub">Une seule fois — supprime les avertissements de sécurité</span>
              </div>
            </div>
            <div className="cert-grid">
              <div className="cert-pc">
                <span className="col-lbl">Ce PC</span>
                <button onClick={onTrustCert}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width:13, height:13 }}>
                    <rect x="3" y="5" width="18" height="11" rx="1.5"/><path d="M2 20h20"/>
                  </svg>
                  <span>Installer sur ce PC</span>
                </button>
                {certMsg && (
                  <div style={{
                    marginTop:6, fontSize:11, padding:'5px 9px', borderRadius:6,
                    background: certMsg.type==='ok' ? 'rgba(110,231,167,0.1)' : certMsg.type==='wait' ? 'rgba(255,255,255,0.04)' : 'rgba(255,122,122,0.1)',
                    color:      certMsg.type==='ok' ? 'var(--success)'         : certMsg.type==='wait' ? 'var(--fg-3)'              : 'var(--error)',
                    border: `1px solid ${certMsg.type==='ok' ? 'rgba(110,231,167,0.3)' : certMsg.type==='wait' ? 'var(--line)' : 'rgba(255,122,122,0.3)'}`,
                  }}>
                    {certMsg.text}
                  </div>
                )}
              </div>
              <div className="cert-phone">
                <span className="col-lbl">Téléphone</span>
                <div className="mini-qr">
                  <img src={`/api/rec/cert-qr?t=${lanIp || 'x'}`} alt="QR cert" style={{ width:66, height:66, display:'block' }}/>
                </div>
              </div>
            </div>
          </div>

          <details className="help-accordion">
            <summary>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width:16, height:16, flex:'0 0 16px', color:'var(--fg-3)' }}>
                <circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="18" cy="18" r="2"/>
                <path d="M8 6h8M6 8v8M18 8v8M8 18h8" strokeDasharray="2 3"/>
              </svg>
              <span>Réseau scolaire / entreprise — ça ne se connecte pas&nbsp;?</span>
              <span className="chev">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width:16, height:16 }}>
                  <path d="m6 9 6 6 6-6"/>
                </svg>
              </span>
            </summary>
            <div className="help-body">
              {[
                { ico: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width:12, height:12 }}><path d="M2 8.5C5 5.5 8.5 4 12 4s7 1.5 10 4.5"/><path d="M5 12.5C7 10.5 9.5 9.5 12 9.5s5 1 7 3"/><path d="M8 16c1-1 2.5-1.5 4-1.5s3 .5 4 1.5"/><circle cx="12" cy="19" r="1" fill="currentColor"/></svg>,
                  title: 'Isolation AP', body: <>cause n°1 sur WiFi public. Les appareils ne peuvent pas se voir entre eux. Demande à l'admin de la désactiver, ou utilise un hotspot perso.</> },
                { ico: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width:12, height:12 }}><path d="M12 3 4 6v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V6z"/></svg>,
                  title: 'GPO pare-feu domaine', body: <>politique de groupe qui bloque le port <code>5174</code>. Demande une exception ou teste hors-domaine.</> },
                { ico: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width:12, height:12 }}><circle cx="12" cy="12" r="2.5"/><path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.5 5.5a9 9 0 0 0 0 13M18.5 5.5a9 9 0 0 1 0 13"/></svg>,
                  title: 'Solution rapide', body: <>partage de connexion depuis un téléphone perso : connecte PC + téléphones de capture dessus, aucun WiFi tiers impliqué.</> },
              ].map((it, i) => (
                <div key={i} className="item">
                  <div className="ico">{it.ico}</div>
                  <div><strong>{it.title}</strong> — {it.body}</div>
                </div>
              ))}
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pane: Caméras
// ─────────────────────────────────────────────────────────────────────────────
function RecCamerasPane({ devices, previews, recording, paused, takes, elapsed, onStart, onStop, onTogglePause, onMark,
  handEnabled, onHandEnabled, handProto, onHandProto, handStatus, handFrame, adbInfo, adbLoading, onSetupAdb, project }) {
  const ready    = devices.filter(d => d.status !== 'offline').length;
  const canStart = ready > 0 && !recording;

  return (
    <div className="rec-step-inner">
      {devices.length === 0 ? (
        <div className="devices-empty">
          <div className="ico">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width:22, height:22 }}>
              <rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>
            </svg>
          </div>
          <div className="title">En attente d'appareils</div>
          <div className="body">
            Scanne le QR code ou ouvre l'URL depuis l'onglet <strong>Connexion</strong>. Les appareils apparaîtront ici dès leur connexion.
          </div>
        </div>
      ) : (
        <div className="devices-grid">
          {devices.map(d => (
            <RecDeviceCard key={d.sid} device={d} preview={previews[d.sid]} paused={paused}/>
          ))}
          {!recording && devices.length < 6 && (
            <div className="device-slot">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width:22, height:22 }}>
                <rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>
              </svg>
              <span>Slot disponible<br/>Scanne le QR pour ajouter</span>
            </div>
          )}
        </div>
      )}

      {/* Action bar */}
      <div className="step-eyebrow" style={{ marginTop:26 }}>
        <span className="lbl">Capture synchronisée</span>
        <span className="rule"/>
      </div>

      <div className={['rec-action-bar', recording && (paused ? 'is-paused' : 'is-rec')].filter(Boolean).join(' ')}>
        <div className="rec-transport">
          {!recording ? (
            <button className="rec-button start" disabled={!canStart} onClick={onStart}>
              <span className="rec-glyph"/>
              Démarrer le REK
            </button>
          ) : (
            <>
              <button className={`rec-button transport ${paused ? 'resume' : 'pause'}`} onClick={onTogglePause}>
                <span className="t-ico">
                  {paused
                    ? <svg viewBox="0 0 24 24" fill="currentColor" style={{ width:18, height:18, display:'block' }}><path d="M7 4.5v15a1 1 0 0 0 1.5.87l12-7.5a1 1 0 0 0 0-1.74l-12-7.5A1 1 0 0 0 7 4.5z"/></svg>
                    : <svg viewBox="0 0 24 24" fill="currentColor" style={{ width:18, height:18, display:'block' }}><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
                  }
                </span>
                {paused ? 'Reprendre' : 'Pause'}
              </button>
              <button className="rec-button stop" onClick={onStop}>
                <span className="rec-glyph square"/>
                Stop & uploader
              </button>
            </>
          )}
        </div>

        <div className="rec-status">
          <span className="lbl">{recording ? (paused ? 'En pause' : 'Durée') : 'Prêts'}</span>
          {recording
            ? <span className={`val ${paused ? 'paused' : 'live'}`}>{elapsed}</span>
            : <span className="val">{ready}<span style={{ color:'var(--fg-4)', fontSize:16, marginLeft:4 }}>/{devices.length}</span></span>
          }
        </div>

        {recording && (
          <button className="take-btn" onClick={onMark} disabled={paused} title="Marquer une prise">
            <span className="t-ico">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ width:20, height:20, display:'block' }}>
                <path d="M5 21V4M5 4h12l-2 3.5L17 11H5"/>
              </svg>
            </span>
            <span className="take-tt">
              <span className="take-label">Marquer prise</span>
              <span className="take-num">Prise {String(takes).padStart(2,'0')}</span>
            </span>
          </button>
        )}

        <div className="rec-aux">
          <span className="mini-label">Sync</span>
          <span className="mini-val">±500 ms</span>
        </div>
      </div>

      <div className="sync-note">
        {recording
          ? <>Les marqueurs de prise insèrent un <span className="em">timecode partagé</span> sur tous les flux.</>
          : <>Démarrage simultané — <span className="em">flash blanc</span> de synchronisation au lancement.</>
        }
      </div>

      {/* ── Hand Tracking panel ─────────────────────────────────────────────── */}
      <div className="step-eyebrow" style={{ marginTop:28 }}>
        <span className="lbl">Options avancées</span>
        <span className="rule"/>
      </div>

      <div className="hand-panel">
        {/* Toggle row */}
        <div className="hand-toggle-row">
          <label className="hand-toggle-label">
            <div
              className={['hand-checkbox', handEnabled && 'checked'].filter(Boolean).join(' ')}
              onClick={() => onHandEnabled(v => !v)}
              style={{ cursor: 'pointer' }}
            >
              {handEnabled && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width:11, height:11 }}>
                  <path d="m5 12 5 5L20 7"/>
                </svg>
              )}
            </div>
            <div>
              <div className="hand-toggle-title">Hand Tracking <span className="hand-badge">Meta Quest</span></div>
              <div className="hand-toggle-sub">Capture simultanée des doigts via le casque VR</div>
            </div>
          </label>
        </div>

        {handEnabled && (
          <div className="hand-config">
            {/* Protocol */}
            <div className="hand-config-row">
              <span className="hand-config-label">Protocole</span>
              <Segmented
                value={handProto}
                onChange={v => !recording && onHandProto(v)}
                options={[
                  { value: 'tcp', label: 'USB / ADB' },
                  { value: 'udp', label: 'WiFi / UDP' },
                ]}
              />
            </div>

            {/* ADB setup (TCP only) */}
            {handProto === 'tcp' && (
              <div className="hand-adb-row">
                <button
                  className="btn sm"
                  onClick={onSetupAdb}
                  disabled={adbLoading || recording}
                >
                  {adbLoading ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width:12, height:12, animation:'spin .9s linear infinite' }}>
                      <path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/>
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width:12, height:12 }}>
                      <rect x="2" y="4" width="20" height="16" rx="2"/><path d="M8 4v4M16 4v4M2 12h20"/>
                    </svg>
                  )}
                  <span>{adbLoading ? 'Config…' : 'Configurer ADB'}</span>
                </button>
                {adbInfo && (
                  <div className={['hand-adb-msg', adbInfo.ok ? 'ok' : 'err'].join(' ')}>
                    {adbInfo.ok ? '✓ ' : '✗ '}{adbInfo.message}
                  </div>
                )}
                {!adbInfo && (
                  <div className="hand-adb-hint">Branche le Quest en USB puis clique « Configurer ADB »</div>
                )}
              </div>
            )}

            {handProto === 'udp' && (
              <div className="hand-adb-hint">
                Sur le Quest, configure HTS avec l'IP de ce PC et le port <strong>9000</strong>
              </div>
            )}

            {/* Status + preview row */}
            <div className="hand-status-row">
              {/* Status indicator + test button */}
              <div className="hand-status-box">
                <div className="hand-status-head">État Quest</div>
                {handStatus?.connected ? (
                  <div className="hand-status-pill connected">
                    <span className="sdot"/>
                    Connecté · {handStatus.fps} fps · {handStatus.frame_count} frames
                  </div>
                ) : handStatus?.running ? (
                  <div className="hand-status-pill waiting">
                    <span className="sdot waiting"/>
                    En attente du Quest… (lance HTS sur le casque)
                  </div>
                ) : (
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div className="hand-status-pill idle">Receiver arrêté</div>
                    <button className="btn sm" onClick={() =>
                      fetch('/api/rec/hand/start', {
                        method:'POST', headers:{'Content-Type':'application/json'},
                        body: JSON.stringify({ protocol: handProto, port: handProto==='tcp' ? 8000 : 9000, project_dir: project?.path }),
                      }).then(r => r.json()).then(setHandStatus)
                    }>Tester</button>
                  </div>
                )}
              </div>

              {/* Hand preview canvas — visible dès qu'un frame arrive */}
              {handFrame && <HandPreview frame={handFrame}/>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hand Preview — canvas 2D redesigné
// ─────────────────────────────────────────────────────────────────────────────
const HAND_CONNECTIONS = [
  // Doigts
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  // Paume
  [5,9],[9,13],[13,17],[0,17],
];

// Couleurs par doigt pour rendre la lecture plus facile
const FINGER_COLORS_TEAL = [
  'rgba(45,212,191,0.9)',   // Pouce
  'rgba(99,240,210,0.9)',   // Index
  'rgba(45,212,191,0.9)',   // Majeur
  'rgba(30,180,160,0.9)',   // Annulaire
  'rgba(20,150,130,0.9)',   // Auriculaire
];
const FINGER_COLORS_BLUE = [
  'rgba(129,140,248,0.9)',
  'rgba(165,180,252,0.9)',
  'rgba(129,140,248,0.9)',
  'rgba(99,102,241,0.9)',
  'rgba(79,70,229,0.9)',
];

// Applique une quaternion [qx,qy,qz,qw] à un vecteur [vx,vy,vz]
function rotVec(qx, qy, qz, qw, vx, vy, vz) {
  const tx = 2*(qy*vz - qz*vy);
  const ty = 2*(qz*vx - qx*vz);
  const tz = 2*(qx*vy - qy*vx);
  return [vx + qw*tx + qy*tz - qz*ty,
          vy + qw*ty + qz*tx - qx*tz,
          vz + qw*tz + qx*ty - qy*tx];
}

function HandPreview({ frame }) {
  const canvasRef = useRefREC(null);
  const lastLRef  = useRefREC(null);  // {wrist, landmarks}
  const lastRRef  = useRefREC(null);

  useEffectREC(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    if (frame?.left)  lastLRef.current = frame.left;
    if (frame?.right) lastRRef.current = frame.right;

    const drawL = frame?.left  || lastLRef.current;
    const drawR = frame?.right || lastRRef.current;
    const staleL = !frame?.left  && !!drawL;
    const staleR = !frame?.right && !!drawR;

    if (!drawL && !drawR) return;

    const pad = 8;
    const labelH = 14;
    const half = W / 2;

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    ctx.beginPath(); ctx.moveTo(half, pad); ctx.lineTo(half, H - labelH - 2); ctx.stroke();
    ctx.restore();

    function drawInZone(hand, fingerColors, zoneX, zoneW, label, labelColor, stale) {
      const rawLm = hand?.landmarks;
      const wData = hand?.wrist;  // [x,y,z, qx,qy,qz,qw]

      ctx.save();
      if (stale) ctx.globalAlpha = 0.3;

      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      if (!rawLm || rawLm.length < 21) {
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillText(label, zoneX + zoneW / 2, H - 4);
        ctx.restore();
        return;
      }

      // Applique la rotation du poignet aux landmarks (espace local → monde)
      // Les landmarks HTS sont en espace local du poignet — sans ça la main
      // garde toujours la même forme quelle que soit l'orientation du poignet.
      const lm = (wData && wData.length >= 7)
        ? rawLm.map(p => rotVec(wData[3], wData[4], wData[5], wData[6], p[0], p[1], p[2]))
        : rawLm;

      const xs = lm.map(p => p[0]);
      const ys = lm.map(p => p[1]);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      const rX = maxX - minX || 0.001;
      const rY = maxY - minY || 0.001;
      const drawW = zoneW - pad * 2;
      const drawH = H - pad * 2 - labelH;
      const scale = Math.min(drawW / rX, drawH / rY) * 0.85;
      const ox = zoneX + (zoneW - rX * scale) / 2;
      const oy = pad + (drawH - rY * scale) / 2;

      function proj(p) {
        return [
          ox + (p[0] - minX) * scale,
          oy + (maxY - p[1]) * scale,
        ];
      }

      // Paume
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1.5;
      for (const [a, b] of [[5,9],[9,13],[13,17],[0,17],[0,5]]) {
        const [ax,ay] = proj(lm[a]), [bx,by] = proj(lm[b]);
        ctx.beginPath(); ctx.moveTo(ax,ay); ctx.lineTo(bx,by); ctx.stroke();
      }

      // Doigts colorés
      const fingers = [[1,2,3,4],[5,6,7,8],[9,10,11,12],[13,14,15,16],[17,18,19,20]];
      fingers.forEach((chain, fi) => {
        ctx.strokeStyle = fingerColors[fi];
        ctx.lineWidth = 2;
        for (const [a,b] of [[0,chain[0]],[chain[0],chain[1]],[chain[1],chain[2]],[chain[2],chain[3]]]) {
          const [ax,ay] = proj(lm[a]), [bx,by] = proj(lm[b]);
          ctx.beginPath(); ctx.moveTo(ax,ay); ctx.lineTo(bx,by); ctx.stroke();
        }
      });

      // Joints
      for (let i = 0; i < 21; i++) {
        const [px,py] = proj(lm[i]);
        const fi = Math.max(0, Math.floor((i - 1) / 4));
        ctx.fillStyle = i === 0 ? 'rgba(255,255,255,0.9)' : (fingerColors[fi] || fingerColors[0]);
        ctx.beginPath();
        ctx.arc(px, py, i === 0 ? 4 : (i % 4 === 0 ? 2.5 : 2), 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = labelColor;
      ctx.fillText(label, zoneX + zoneW / 2, H - 4);
      ctx.restore();
    }

    drawInZone(drawL, FINGER_COLORS_BLUE, 0,    half, 'G', 'rgba(129,140,248,0.9)', staleL);
    drawInZone(drawR, FINGER_COLORS_TEAL, half, half, 'D', 'rgba(45,212,191,0.9)',  staleR);

  }, [frame]);

  return (
    <canvas ref={canvasRef} width={300} height={180} className="hand-preview-canvas" />
  );
}

// Device card
function RecDeviceCard({ device: d, preview, paused }) {
  const isRec     = d.status === 'recording';
  const isUpload  = d.status === 'uploading';
  const isOffline = d.status === 'offline';
  const isPaused  = isRec && paused;

  return (
    <div className={['device-card', isRec && !isPaused && 'recording', isOffline && 'offline'].filter(Boolean).join(' ')}>
      <div className="device-preview">
        {preview
          ? <img src={preview} alt="" style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }}/>
          : <>
              <div className="placeholder"/>
              <div className="ico-cam">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width:28, height:28 }}>
                  <path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="4"/>
                </svg>
              </div>
            </>
        }
        {isRec && !isPaused && <div className="live-pill"><span className="ldot"/> REK</div>}
        {isPaused            && <div className="live-pill paused"><span className="ldot"/> PAUSE</div>}
        {!isRec && !isOffline && !isUpload && <div className="live-pill ready"><span className="ldot"/> PRÊT</div>}
        {isUpload            && <div className="live-pill uploading"><span className="ldot"/> UPLOAD</div>}
        {isOffline           && <div className="live-pill offline"><span className="ldot"/> OFFLINE</div>}
        {!isOffline && d.battery != null && (
          <div className="battery">
            <div className="bar"><span style={{ width:`${d.battery}%` }}/></div>
            {d.battery}%
          </div>
        )}
      </div>
      <div className="device-info">
        <div style={{ flex:1, minWidth:0 }}>
          <div className="name">{d.name}</div>
          {d.meta && <div className="meta">{d.meta}</div>}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pane: Export
// ─────────────────────────────────────────────────────────────────────────────
function RecExportPane({ files, project, importing, msg, onImport }) {
  const totalMB = files.reduce((s, f) => s + (f.size || 0) / 1024 / 1024, 0);

  return (
    <div className="rec-step-inner">
      {msg && (
        <div style={{
          marginBottom:16, padding:'10px 14px', borderRadius:8, fontSize:12,
          background: msg.type==='ok' ? 'rgba(110,231,167,0.08)' : 'rgba(255,122,122,0.08)',
          border: `1px solid ${msg.type==='ok' ? 'rgba(110,231,167,0.3)' : 'rgba(255,122,122,0.3)'}`,
          color: msg.type==='ok' ? 'var(--success)' : 'var(--error)',
        }}>
          {msg.type === 'ok' ? '✓ ' : '✗ '}{msg.text}
        </div>
      )}

      {files.length === 0 ? (
        <div className="devices-empty">
          <div className="ico">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width:22, height:22 }}>
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            </svg>
          </div>
          <div className="title">Aucun fichier pour l'instant</div>
          <div className="body">
            Les vidéos apparaîtront ici une fois la captation terminée et les uploads reçus.
            Lance une session depuis l'onglet <strong>Caméras</strong>.
          </div>
        </div>
      ) : (
        <div className="files-section" style={{ marginTop:0 }}>
          <div className="files-list">
            {files.map((f, i) => (
              <div key={i} className="file-row">
                <span className="ldot"/>
                <div style={{ minWidth:0 }}>
                  <div className="fname">{f.filename}</div>
                  <div className="fmeta">{f.device}</div>
                </div>
                <span className="fsize">{((f.size || 0) / 1024 / 1024).toFixed(1)} Mo</span>
              </div>
            ))}
          </div>

          <div className="import-bar">
            <div className="left">
              <span className="ttl">Importer dans le projet</span>
              <span className="sub">
                {project?.path ? `${project.path}/videos` : 'Aucun projet sélectionné'}
                {files.length > 0 && ` · ${totalMB.toFixed(1)} Mo`}
              </span>
            </div>
            <button className="btn primary" onClick={onImport} disabled={importing || !project?.path}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width:14, height:14 }}>
                <path d="M12 3v13M6 11l6 6 6-6M4 21h16"/>
              </svg>
              <span>
                {importing ? 'Import…' : project?.path ? `Importer dans ${project.name}/videos` : 'Aucun projet'}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

window.RecMode = RecMode;
