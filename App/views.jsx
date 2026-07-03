// console.jsx + viewer.jsx — Console logs + Visualisation 3D

const { useEffect: useEffectCon, useRef: useRefCon, useState: useStateCon, useCallback: useCallbackCon } = React;

// ─────────────────────────────────────────────────────────────
// Console
// ─────────────────────────────────────────────────────────────
function ConsoleView({ logs, runState, dispatchRun }) {
  const bodyRef = useRefCon(null);
  const [autoScroll, setAutoScroll] = useStateCon(true);
  const [filter,     setFilter]     = useStateCon('all');
  const [sysStats,   setSysStats]   = useStateCon(null);

  // Poll stats toutes les 2s
  useEffectCon(() => {
    const poll = async () => {
      try {
        const r = await fetch('/api/system/stats');
        const d = await r.json();
        setSysStats(d);
      } catch(_) {}
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, []);

  useEffectCon(() => {
    if (autoScroll && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const running = runState.current != null;
  const filtered = filter === 'all' ? logs : logs.filter(l => l.lvl === filter);

  async function exportLogs() {
    if (!logs.length) return;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    const header = `# Oxymore Vision — Console export\n` +
                   `# ${new Date().toLocaleString()}\n` +
                   `# ${logs.length} lignes\n\n`;
    const body = logs.map(l =>
      `[${l.t}] ${String(l.lvl).toUpperCase().padEnd(5)} ${l.msg}`
    ).join('\n');
    const content   = header + body;
    const filename  = `oxymore-console-${stamp}.txt`;

    // 1) PyWebView desktop : dialog natif "Enregistrer sous"
    if (window.pywebview && window.pywebview.api && window.pywebview.api.save_logs) {
      try {
        const saved = await window.pywebview.api.save_logs(content, filename);
        if (saved) {
          console.log('[export] sauvé dans', saved);
        }
        return;
      } catch (e) {
        console.error('[export] pywebview save_logs failed, fallback Blob :', e);
      }
    }

    // 2) Fallback navigateur : téléchargement Blob
    try {
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      // 3) Dernier recours : POST vers le serveur qui renvoie un attachment
      try {
        const r = await fetch('/api/console/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content, filename }),
        });
        if (r.ok) {
          const blob = await r.blob();
          const url  = URL.createObjectURL(blob);
          const a    = document.createElement('a');
          a.href = url; a.download = filename;
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
        }
      } catch (_) {
        alert(`Impossible d'exporter la console : ${e.message}`);
      }
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Console</h1>
          <div className="sub">
            Sortie en temps réel · {logs.length} ligne{logs.length > 1 ? 's' : ''}
            {running && <span style={{ marginLeft: 10, color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', animation: 'pulse-soft 1s infinite' }}/>
              Exécution en cours
            </span>}
          </div>
        </div>
        <div className="head-actions">
          <div className="segmented">
            {[
              { value: 'all',  label: 'Tout' },
              { value: 'info', label: 'Info' },
              { value: 'warn', label: 'Warn' },
              { value: 'err',  label: 'Err.' },
            ].map(o => (
              <button key={o.value} className={filter === o.value ? 'on' : ''} onClick={() => setFilter(o.value)}>{o.label}</button>
            ))}
          </div>
          <button className="btn" onClick={() => dispatchRun({ type: 'CLEAR_LOGS' })}>{Icon.trash}<span>Effacer</span></button>
          <button className="btn" onClick={exportLogs} disabled={!logs.length} title={logs.length ? `Exporter ${logs.length} ligne${logs.length>1?'s':''}` : 'Console vide'}>{Icon.download}<span>Exporter</span></button>
        </div>
      </div>

      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Run state strip */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1fr', gap: 12,
        }}>
          <StatCell label="Étape courante"
                    value={running ? STEPS[runState.current].label : '—'}
                    sub={running ? `Étape ${runState.current + 1} / ${STEPS.length}` : 'En attente'} />
          <StatCell label="CPU"
                    value={sysStats ? `${sysStats.cpu_pct}%` : '—'}
                    sub={sysStats?.cpu_name || 'CPU'}/>
          <StatCell label="GPU"
                    value={sysStats ? `${sysStats.gpu_pct}%` : '—'}
                    sub={sysStats?.gpu_name || 'GPU'}
                    highlight={sysStats?.gpu_pct > 20}/>
          <StatCell label="RAM"
                    value={sysStats ? `${sysStats.ram_used} Go` : '—'}
                    sub={sysStats ? `sur ${sysStats.ram_total} Go` : '—'}/>
          <StatCell label="VRAM"
                    value={sysStats ? `${sysStats.vram_used} Go` : '—'}
                    sub={sysStats ? `sur ${sysStats.vram_total} Go · ${sysStats.gpu_temp}°C` : '—'}/>
        </div>

        {/* Console */}
        <div className="console" style={{ flex: 1, minHeight: 0 }}>
          <div className="console-head">
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: running ? '#fff' : 'var(--success)', boxShadow: '0 0 6px rgba(255,255,255,0.5)' }}/>
            <span>{running ? `oxymore › ${STEPS[runState.current]?.id}` : 'oxymore › ready'}</span>
            <span className="grow"/>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none' }}>
              <Toggle on={autoScroll} onClick={() => setAutoScroll(!autoScroll)}/>
              Auto-scroll
            </label>
          </div>
          <div className="console-body" ref={bodyRef}>
            {filtered.map((l, i) => (
              <div key={i} className={`log-line ${l.lvl}`}>
                <span className="t">{l.t}</span>
                <span className="lvl">{l.lvl}</span>
                <span className="msg">{l.msg}</span>
              </div>
            ))}
            {!filtered.length && (
              <div style={{ color: 'var(--fg-4)', padding: '6px 0' }}>// Console vide. Lance le pipeline pour voir les logs.</div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function StatCell({ label, value, sub, highlight }) {
  return (
    <div style={{
      padding: '12px 16px',
      borderRadius: 10,
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid var(--line)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {highlight && (
        <div style={{
          position: 'absolute', inset: '-30% -30% auto auto',
          width: 140, height: 140,
          background: 'radial-gradient(circle, rgba(255,255,255,0.1), transparent 60%)',
          pointerEvents: 'none',
        }}/>
      )}
      <div style={{ fontSize: 10, color: 'var(--fg-4)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{label}</div>
      <div className="mono" style={{ fontSize: 18, color: 'var(--fg-0)', fontWeight: 500, marginTop: 4, position: 'relative' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 2, position: 'relative' }}>{sub}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 3D Viewer — connecté au backend réel
// ─────────────────────────────────────────────────────────────
function Viewer3D({ project }) {
  const [frame,    setFrame]   = useStateCon(0);
  const [playing,  setPlaying] = useStateCon(false);
  const [trcFiles, setTrcFiles]= useStateCon([]);
  const [selFile,  setSelFile] = useStateCon('');
  const [trcData,  setTrcData] = useStateCon(null);
  const [loading,  setLoading] = useStateCon(false);
  const [azimuth,  setAzimuth] = useStateCon(30);
  const [elevation,setElevation]=useStateCon(-15);
  const [view,     setView]    = useStateCon('persp');
  const [speed,    setSpeed]   = useStateCon(1.0);  // multiplicateur vitesse
  const [bvhOpen,  setBvhOpen] = useStateCon(false);
  const dragRef  = useRefCon(null);
  const playRef  = useRefCon(null);

  const total = trcData ? trcData.frames.length : 1;

  // ── Charge la liste des fichiers .trc ────────────────────────
  useEffectCon(() => {
    if (!project?.path) return;
    fetch(`/api/viewer/files?path=${encodeURIComponent(project.path)}`)
      .then(r => r.json())
      .then(d => {
        setTrcFiles(d.files || []);
        if (d.files?.length) setSelFile(d.files[0].path);
      }).catch(() => {});
  }, [project?.path]);

  // ── Charge le TRC sélectionné ─────────────────────────────────
  useEffectCon(() => {
    if (!selFile) return;
    setLoading(true);
    setFrame(0);
    fetch(`/api/viewer/trc?file=${encodeURIComponent(selFile)}&max_frames=400`)
      .then(r => r.json())
      .then(d => { setTrcData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [selFile]);

  // ── Playback ──────────────────────────────────────────────────
  useEffectCon(() => {
    if (!playing) { clearInterval(playRef.current); return; }
    // Calcule l'intervalle réel :
    // - fps du TRC (ex: 25)
    // - sous-échantillonnage : num_frames / total frames chargées
    const fps      = trcData?.fps || 25;
    const srcFrames= trcData?.num_frames || total;
    const step     = srcFrames / Math.max(1, total); // facteur de sous-éch.
    const interval = Math.round((1000 / fps) * step / speed);
    playRef.current = setInterval(() => {
      setFrame(f => (f + 1) >= total ? 0 : f + 1);
    }, Math.max(16, interval));
    return () => clearInterval(playRef.current);
  }, [playing, total, trcData, speed]);

  // ── Drag pour rotation ────────────────────────────────────────
  function onMouseDown(e) {
    dragRef.current = { x: e.clientX, y: e.clientY, az: azimuth, el: elevation };
  }
  function onMouseMove(e) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    setAzimuth(dragRef.current.az + dx * 0.5);
    setElevation(Math.max(-89, Math.min(89, dragRef.current.el + dy * 0.3)));
  }
  function onMouseUp() { dragRef.current = null; }

  // ── Vue prédéfinie ────────────────────────────────────────────
  function setPresetView(v) {
    setView(v);
    if (v === 'persp') { setAzimuth(30);  setElevation(-15); }
    if (v === 'front') { setAzimuth(0);   setElevation(0);   }
    if (v === 'top')   { setAzimuth(0);   setElevation(-89); }
    if (v === 'side')  { setAzimuth(90);  setElevation(0);   }
  }

  // ── Frame courante ────────────────────────────────────────────
  const currentFrame = trcData?.frames?.[frame];
  const currentTime  = currentFrame?.t ?? 0;

  // ── Fichiers résultats (side panel) ──────────────────────────
  const [outputFiles, setOutputFiles] = useStateCon([]);
  useEffectCon(() => {
    if (!project?.path) return;
    fetch(`/api/files?path=${encodeURIComponent(project.path + '/pose-3d')}`)
      .then(r => r.json())
      .then(d => setOutputFiles((d.items || []).filter(f => f.type === 'file')))
      .catch(() => {});
  }, [project?.path, trcData]);

  useEffectCon(() => {
    if (!playing) return;
    const i = setInterval(() => {
      setFrame(f => (f + 1) % total);
    }, 16);
    return () => clearInterval(i);
  }, [playing]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Visualisation 3D</h1>
          <div className="sub">
            {trcData
              ? `${trcData.file} · ${trcData.num_frames} frames · ${trcData.fps} fps · ${trcData.num_markers} marqueurs`
              : trcFiles.length === 0 ? 'Aucun fichier .trc — lancez le pipeline d\'abord' : 'Chargement…'}
          </div>
        </div>
        <div className="head-actions">
          {/* Sélecteur de fichier TRC */}
          {trcFiles.length > 0 && (
            <select value={selFile} onChange={e => setSelFile(e.target.value)}
                    style={{ background:'rgba(255,255,255,0.04)', border:'1px solid var(--line)',
                             borderRadius:8, color:'var(--fg-1)', padding:'6px 10px',
                             fontFamily:'var(--font-mono)', fontSize:11, cursor:'pointer' }}>
              {trcFiles.map(f => (
                <option key={f.path} value={f.path}>{f.name}</option>
              ))}
            </select>
          )}
          <button className="btn" onClick={() => setBvhOpen(true)}
                  style={{background:'rgba(126,184,247,0.1)',
                          borderColor:'#7eb8f7', color:'#7eb8f7'}}>
            {Icon.download}<span>Exporter en BVH</span>
          </button>
        </div>
      </div>

      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, flex: 1, minHeight: 0 }}>
          {/* Viewer */}
          <div className="viewer" style={{ position:'relative', minHeight:420, cursor:'grab' }}
               onMouseDown={onMouseDown} onMouseMove={onMouseMove}
               onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>
            <div className="viewer-grid"/>

            {/* Squelette réel ou placeholder */}
            {loading && (
              <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center',
                            justifyContent:'center', color:'var(--fg-4)', fontSize:12 }}>
                Chargement du fichier TRC…
              </div>
            )}
            {!loading && !trcData && (
              <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column',
                            alignItems:'center', justifyContent:'center', gap:12,
                            color:'var(--fg-4)', fontSize:12 }}>
                <div style={{ fontSize:32, opacity:0.3 }}>🦴</div>
                <div>Aucune donnée — lancez le pipeline pour générer un .trc</div>
              </div>
            )}
            {!loading && trcData && (
              <RealSkeletonStage
                frameData={currentFrame}
                bones={trcData.bones}
                azimuth={azimuth}
                elevation={elevation}
              />
            )}

            {/* HUD top-left */}
            <div style={{ position:'absolute', top:14, left:14, display:'flex',
                          flexDirection:'column', gap:6, fontFamily:'var(--font-mono)',
                          fontSize:11, color:'var(--fg-2)', pointerEvents:'none' }}>
              <div style={{ display:'flex', gap:8 }}>
                <span style={{ color:'var(--fg-4)' }}>FRAME</span>
                <span style={{ color:'#fff' }}>{String(frame).padStart(4,'0')} / {total}</span>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <span style={{ color:'var(--fg-4)' }}>TIME&nbsp;</span>
                <span>{currentTime.toFixed(2)} s</span>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <span style={{ color:'var(--fg-4)' }}>MARK&nbsp;</span>
                <span>{trcData ? Object.keys(currentFrame?.m || {}).length : '—'} pts visibles</span>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <span style={{ color:'var(--fg-4)' }}>AZ&nbsp;&nbsp;&nbsp;</span>
                <span>{Math.round(azimuth)}°</span>
              </div>
            </div>

            {/* axis gizmo */}
            <div style={{
              position: 'absolute', bottom: 14, left: 14,
              width: 60, height: 60,
              display: 'grid', placeItems: 'center',
              fontFamily: 'var(--font-mono)', fontSize: 10,
            }}>
              <svg width="60" height="60" viewBox="0 0 60 60">
                <line x1="30" y1="30" x2="50" y2="30" stroke="#ff7a7a" strokeWidth="1.4"/>
                <line x1="30" y1="30" x2="30" y2="10" stroke="#6ee7a7" strokeWidth="1.4"/>
                <line x1="30" y1="30" x2="16" y2="44" stroke="#93c5fd" strokeWidth="1.4"/>
                <text x="52" y="33" fill="#ff7a7a" fontSize="9">X</text>
                <text x="33" y="11" fill="#6ee7a7" fontSize="9">Y</text>
                <text x="10" y="48" fill="#93c5fd" fontSize="9">Z</text>
              </svg>
            </div>

            {/* View buttons */}
            <div style={{ position:'absolute', top:14, right:14, display:'flex', gap:4 }}>
              {[['persp','Persp'],['front','Front'],['top','Top'],['side','Side']].map(([id,label]) => (
                <button key={id} className={`btn sm ${view===id?'':'ghost'}`}
                        style={{ background:view===id?'rgba(255,255,255,0.08)':'transparent', height:26 }}
                        onClick={() => setPresetView(id)}>
                  {label}
                </button>
              ))}
            </div>

            {/* playback */}
            <div style={{
              position: 'absolute', bottom: 14, left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'rgba(0,0,0,0.55)',
              backdropFilter: 'blur(20px)',
              border: '1px solid var(--line-2)',
              borderRadius: 999,
              padding: '6px 8px',
            }}>
              <button className="btn sm icon ghost" onClick={() => setFrame(0)}>
                <svg viewBox="0 0 24 24" fill="currentColor" style={{width:12,height:12}}><path d="M6 5h2v14H6zm14 0L8 12l12 7z"/></svg>
              </button>
              <button className="btn sm icon"
                      style={{background:'#fff',color:'#000',borderColor:'#fff',width:30,height:30,borderRadius:999}}
                      onClick={() => setPlaying(!playing)}>
                {playing ? Icon.pause : Icon.play}
              </button>
              <button className="btn sm icon ghost" onClick={() => setFrame(Math.max(0, total-1))}>
                <svg viewBox="0 0 24 24" fill="currentColor" style={{width:12,height:12}}><path d="M16 5h2v14h-2zM4 5v14l12-7z"/></svg>
              </button>
              {/* Vitesse */}
              <select value={speed} onChange={e => setSpeed(parseFloat(e.target.value))}
                      style={{ background:'rgba(0,0,0,0.5)', border:'1px solid var(--line-2)',
                               borderRadius:6, color:'var(--fg-2)', padding:'2px 6px',
                               fontFamily:'var(--font-mono)', fontSize:11, cursor:'pointer',
                               marginLeft:6 }}>
                {[0.1, 0.25, 0.5, 1, 2, 4].map(s => (
                  <option key={s} value={s}>{s}×</option>
                ))}
              </select>
            </div>
          </div>

          {/* Side panel */}
          <div style={{ display:'flex', flexDirection:'column', gap:14, minHeight:0 }}>
            {/* Marqueurs visibles */}
            <div className="card">
              <div className="card-head">
                <h3>Marqueurs</h3>
                <div className="meta">{trcData ? `${trcData.num_markers} total` : '—'}</div>
              </div>
              <div style={{ padding:12, display:'flex', flexDirection:'column', gap:4,
                            maxHeight:200, overflow:'auto' }}>
                {trcData ? (trcData.markers || []).slice(0,20).map((m, i) => {
                  const pos = currentFrame?.m?.[m];
                  const visible = !!pos;
                  return (
                    <div key={m} style={{ display:'flex', alignItems:'center', gap:8,
                                         padding:'4px 6px', borderRadius:6, fontSize:11 }}>
                      <span style={{ width:6, height:6, borderRadius:'50%',
                                     background: visible ? '#6ee7a7' : 'var(--fg-4)' }}/>
                      <span style={{ color: visible ? 'var(--fg-1)' : 'var(--fg-4)' }}>{m}</span>
                      {pos && (
                        <span className="mono" style={{ marginLeft:'auto', fontSize:9, color:'var(--fg-4)' }}>
                          {pos[0].toFixed(2)},{pos[1].toFixed(2)}
                        </span>
                      )}
                    </div>
                  );
                }) : <div style={{ color:'var(--fg-4)', fontSize:11, padding:'8px 6px' }}>Aucune donnée</div>}
              </div>
            </div>

            {/* Fichiers pose-3d */}
            <div className="card" style={{ flex:1 }}>
              <div className="card-head"><h3>Fichiers pose-3d</h3></div>
              <div style={{ padding:12, display:'flex', flexDirection:'column', gap:6, fontSize:12, overflow:'auto' }}>
                {outputFiles.length === 0
                  ? <div style={{ color:'var(--fg-4)', fontSize:11 }}>Aucun fichier généré</div>
                  : outputFiles.map(f => (
                    <div key={f.path} style={{ display:'flex', alignItems:'center', gap:8, padding:'3px 0',
                                               cursor:'pointer' }}
                         onClick={() => fetch('/api/files/open',{method:'POST',
                           headers:{'Content-Type':'application/json'},
                           body:JSON.stringify({path:f.path})})}>
                      <span style={{ color:'var(--fg-3)', fontSize:10 }}>{Icon.doc}</span>
                      <span className="mono" style={{ color:'var(--fg-1)', fontSize:11,
                                                      whiteSpace:'nowrap', overflow:'hidden',
                                                      textOverflow:'ellipsis', maxWidth:160 }}>
                        {f.name}
                      </span>
                      <span className="mono" style={{ marginLeft:'auto', fontSize:10, color:'var(--fg-4)',
                                                       whiteSpace:'nowrap' }}>
                        {f.size > 0 ? `${Math.round(f.size/1024)} Ko` : ''}
                      </span>
                    </div>
                  ))
                }
              </div>
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div style={{ padding:'10px 16px', background:'rgba(255,255,255,0.02)',
                      border:'1px solid var(--line)', borderRadius:12,
                      display:'flex', alignItems:'center', gap:14 }}>
          <span className="mono" style={{ fontSize:11, color:'var(--fg-3)', whiteSpace:'nowrap' }}>
            {currentTime.toFixed(2)}s
          </span>
          <div style={{ position:'relative', flex:1, height:26 }}>
            <div style={{ position:'absolute', left:0, right:0, top:'50%', height:2,
                          transform:'translateY(-50%)', background:'rgba(255,255,255,0.06)', borderRadius:1 }}/>
            <div style={{ position:'absolute', left:0, top:'50%', height:2,
                          transform:'translateY(-50%)', borderRadius:1,
                          width:`${total > 1 ? (frame/(total-1))*100 : 0}%`,
                          background:'#fff', boxShadow:'0 0 8px rgba(255,255,255,0.5)' }}/>
            <div style={{ position:'absolute', left:`${total > 1 ? (frame/(total-1))*100 : 0}%`,
                          top:'50%', transform:'translate(-50%,-50%)',
                          width:12, height:12, borderRadius:'50%', background:'#fff',
                          boxShadow:'0 0 0 3px rgba(255,255,255,0.12), 0 0 14px rgba(255,255,255,0.5)', cursor:'grab' }}/>
            <input type="range" min={0} max={Math.max(0, total-1)} value={frame}
                   onChange={e => { setPlaying(false); setFrame(Number(e.target.value)); }}
                   style={{ position:'absolute', inset:0, width:'100%', height:'100%',
                            opacity:0, cursor:'pointer' }}/>
          </div>
          <span className="mono" style={{ fontSize:11, color:'var(--fg-3)', whiteSpace:'nowrap' }}>
            {trcData ? (trcData.num_frames / trcData.fps).toFixed(2) : '0.00'}s
          </span>
        </div>
      </div>

      <BvhExportModal
        open={bvhOpen}
        onClose={() => setBvhOpen(false)}
        projectPath={project?.path || ''}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Squelette réel — projection 3D → 2D (orthographique)
// ─────────────────────────────────────────────────────────────
function RealSkeletonStage({ frameData, bones, azimuth, elevation }) {
  if (!frameData || !frameData.m) return null;

  const markers = frameData.m;
  const az  = (azimuth  * Math.PI) / 180;
  const el  = (elevation * Math.PI) / 180;

  // Projection orthographique avec rotation Y (azimuth) et X (elevation)
  function project(x, y, z) {
    // Rotation autour de Y (azimuth)
    const rx = x * Math.cos(az) + z * Math.sin(az);
    const ry = y;
    const rz = -x * Math.sin(az) + z * Math.cos(az);
    // Rotation autour de X (elevation)
    const fx = rx;
    const fy = ry * Math.cos(el) - rz * Math.sin(el);
    return [fx, -fy]; // flip Y pour coordonnées écran
  }

  // Calcule le centre et l'échelle
  const pts = Object.values(markers);
  if (pts.length === 0) return null;

  const projPts = pts.map(([x,y,z]) => project(x,y,z));
  const xs = projPts.map(p => p[0]);
  const ys = projPts.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const range  = Math.max(rangeX, rangeY, 0.5);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const scale = 80 / range;

  function toSvg(x, y, z) {
    const [px, py] = project(x, y, z);
    return [(px - cx) * scale + 50, (py - cy) * scale + 50];
  }

  // Bones
  const boneLines = (bones || []).map(([a, b], i) => {
    const pa = markers[a], pb = markers[b];
    if (!pa || !pb) return null;
    const [x1, y1] = toSvg(...pa);
    const [x2, y2] = toSvg(...pb);
    return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                 stroke="rgba(255,255,255,0.75)" strokeWidth="0.7"
                 strokeLinecap="round" filter="url(#glow)"/>;
  }).filter(Boolean);

  // Joints
  const joints = Object.entries(markers).map(([name, [x,y,z]]) => {
    const [sx, sy] = toSvg(x, y, z);
    const isRight = name.startsWith('R');
    const isLeft  = name.startsWith('L');
    const color   = isRight ? '#93c5fd' : isLeft ? '#6ee7a7' : '#fff';
    return <circle key={name} cx={sx} cy={sy} r="0.8" fill={color} filter="url(#glow)"/>;
  });

  // Ombre au sol
  const floorY = toSvg(0, Math.min(...pts.map(p=>p[1])), 0)[1] + 5;

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet"
         style={{ position:'absolute', inset:0, width:'100%', height:'100%' }}>
      <defs>
        <radialGradient id="floor2" cx="50%" cy="100%" r="40%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.05)"/>
          <stop offset="100%" stopColor="transparent"/>
        </radialGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="0.3" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <ellipse cx="50" cy={Math.min(95, floorY)} rx="18" ry="2" fill="url(#floor2)"/>
      {boneLines}
      {joints}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// Skeleton stage fakee (fallback maquette)
// ─────────────────────────────────────────────────────────────
function SkeletonStage({ frame, total }) {
  // animated keypoints — a simple walking pose
  const t = (frame / total) * Math.PI * 2;
  const swing = Math.sin(t * 2) * 0.5;
  const swing2 = Math.cos(t * 2) * 0.5;

  // base pose (x,y in normalized space, center=0)
  const cx = 50, cy = 50;
  const k = {
    head:    [cx,        cy - 22],
    neck:    [cx,        cy - 16],
    lsh:     [cx - 6,    cy - 14],
    rsh:     [cx + 6,    cy - 14],
    lel:     [cx - 9 + swing * 2, cy - 5],
    rel:     [cx + 9 - swing * 2, cy - 5],
    lwr:     [cx - 11 + swing * 3, cy + 3],
    rwr:     [cx + 11 - swing * 3, cy + 3],
    hip:     [cx,        cy - 2],
    lhip:    [cx - 4,    cy - 2],
    rhip:    [cx + 4,    cy - 2],
    lkn:     [cx - 4 + swing2 * 2, cy + 10],
    rkn:     [cx + 4 - swing2 * 2, cy + 10],
    lan:     [cx - 4 + swing2 * 3, cy + 22],
    ran:     [cx + 4 - swing2 * 3, cy + 22],
    lto:     [cx - 5 + swing2 * 3, cy + 24],
    rto:     [cx + 5 - swing2 * 3, cy + 24],
  };

  const bones = [
    ['head','neck'],
    ['neck','lsh'], ['neck','rsh'],
    ['lsh','lel'], ['lel','lwr'],
    ['rsh','rel'], ['rel','rwr'],
    ['neck','hip'],
    ['hip','lhip'], ['hip','rhip'],
    ['lhip','lkn'], ['lkn','lan'], ['lan','lto'],
    ['rhip','rkn'], ['rkn','ran'], ['ran','rto'],
  ];

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" style={{
      position: 'absolute', inset: 0, width: '100%', height: '100%',
    }}>
      <defs>
        <radialGradient id="floor" cx="50%" cy="80%" r="50%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.06)"/>
          <stop offset="100%" stopColor="transparent"/>
        </radialGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="0.4" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      {/* floor halo */}
      <ellipse cx="50" cy="78" rx="20" ry="3" fill="url(#floor)"/>

      {/* projection shadow */}
      <ellipse cx="50" cy="76" rx="9" ry="1.4" fill="rgba(0,0,0,0.5)"/>

      {/* bones */}
      {bones.map(([a, b], i) => {
        const [x1, y1] = k[a];
        const [x2, y2] = k[b];
        return (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="rgba(255,255,255,0.85)" strokeWidth="0.6"
                strokeLinecap="round" filter="url(#glow)"/>
        );
      })}

      {/* joints */}
      {Object.entries(k).map(([name, [x, y]]) => (
        <circle key={name} cx={x} cy={y} r="0.7" fill="#fff" filter="url(#glow)"/>
      ))}

      {/* a couple of axis lines from feet */}
      <line x1={k.lan[0]} y1={k.lan[1]} x2={k.lan[0]} y2="78" stroke="rgba(255,255,255,0.08)" strokeWidth="0.2" strokeDasharray="0.6 0.6"/>
      <line x1={k.ran[0]} y1={k.ran[1]} x2={k.ran[0]} y2="78" stroke="rgba(255,255,255,0.08)" strokeWidth="0.2" strokeDasharray="0.6 0.6"/>
    </svg>
  );
}

function ErrorChart() {
  // generate sparkline path
  const pts = [];
  for (let i = 0; i < 60; i++) {
    const v = 0.6 + Math.sin(i * 0.4) * 0.2 + Math.random() * 0.25;
    pts.push([i * (240 / 60), 40 - v * 30]);
  }
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const area = d + ` L 240 40 L 0 40 Z`;
  return (
    <svg viewBox="0 0 240 50" style={{ width: '100%', height: 50, marginTop: 8 }}>
      <defs>
        <linearGradient id="errArea" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.18)"/>
          <stop offset="100%" stopColor="transparent"/>
        </linearGradient>
      </defs>
      <path d={area} fill="url(#errArea)"/>
      <path d={d} fill="none" stroke="#fff" strokeWidth="1"/>
      <line x1="0" y1="20" x2="240" y2="20" stroke="rgba(255,255,255,0.08)" strokeDasharray="2 2"/>
    </svg>
  );
}

window.ConsoleView = ConsoleView;
window.Viewer3D = Viewer3D;
