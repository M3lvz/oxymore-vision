// pipeline.jsx — vue Pipeline : 8 étapes + Run All + progression

const { useState: useStateP, useEffect: useEffectP, useRef: useRefP } = React;

const STEPS = [
  { id: 'calibration',       label: 'Calibration',          desc: 'Calcul ou conversion des paramètres caméra',                 icon: Icon.calib,    eta: '~30s' },
  { id: 'poseEstimation',    label: 'Pose Estimation',      desc: 'Détection 2D des keypoints sur chaque vidéo',                icon: Icon.pose,     eta: '~4m' },
  { id: 'synchronization',   label: 'Synchronisation',      desc: 'Alignement temporel des caméras',                            icon: Icon.sync,     eta: '~45s' },
  { id: 'personAssociation', label: 'Association personnes', desc: 'Correspondance des personnes entre caméras',                 icon: Icon.people,   eta: '~20s' },
  { id: 'triangulation',     label: 'Triangulation',        desc: 'Reconstruction 3D des marqueurs',                            icon: Icon.tri,      eta: '~1m 30s' },
  { id: 'filtering',         label: 'Filtrage',             desc: 'Lissage des trajectoires 3D (Butterworth, Kalman…)',         icon: Icon.filter,   eta: '~25s' },
  { id: 'markerAugmentation',label: 'Marker Augmentation',  desc: 'Estimation de marqueurs virtuels (optionnel)',               icon: Icon.sparkle,  eta: '~50s' },
  { id: 'kinematics',        label: 'Cinématique',          desc: 'Calcul des angles articulaires via OpenSim',                 icon: Icon.bone,     eta: '~2m' },
  { id: 'handFusion',        label: 'Fusion doigts',        desc: 'Fusionne le hand tracking Quest avec la cinématique corps → BVH avec doigts', icon: Icon.hand, eta: '~30s', defaultEnabled: false, optional: true },
];

function Pipeline({ runState, dispatchRun, project, licenseValid }) {
  const { enabled, current, statuses, progress, startedAt } = runState;
  const running = current != null;
  const [handAvailable, setHandAvailable] = useStateP(false);

  useEffectP(() => {
    if (!project?.path) return;
    fetch(`/api/rec/hand/check?project=${encodeURIComponent(project.path)}`)
      .then(r => r.json())
      .then(d => setHandAvailable(!!d.exists))
      .catch(() => {});
  }, [project?.path]);

  function toggle(id) {
    if (running) return;
    if (id === 'handFusion' && !handAvailable) return;
    dispatchRun({ type: 'TOGGLE_STEP', id });
  }

  const enabledCount = enabled.filter(Boolean).length;
  const doneCount = Object.values(statuses).filter(s => s === 'done').length;
  const totalEnabled = STEPS.filter((_, i) => enabled[i]).length;
  const overall = totalEnabled === 0 ? 0 : Math.round((doneCount / totalEnabled) * 100);

  // global elapsed
  const [elapsed, setElapsed] = useStateP(0);
  useEffectP(() => {
    if (!startedAt) { setElapsed(0); return; }
    const i = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 200);
    return () => clearInterval(i);
  }, [startedAt]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Pipeline</h1>
          <div className="sub">{project?.name} · {enabledCount} étape{enabledCount > 1 ? 's' : ''} sélectionnée{enabledCount > 1 ? 's' : ''} · ETA ~6 m 30 s</div>
        </div>
        <div className="head-actions">
          {running ? (
            <button className="btn danger" onClick={() => dispatchRun({ type: 'STOP' })}>
              {Icon.stop}<span>Arrêter</span>
            </button>
          ) : (
            <button className="btn" onClick={() => dispatchRun({ type: 'RESET' })}>
              {Icon.refresh}<span>Réinitialiser</span>
            </button>
          )}
          <button
            className="btn primary"
            disabled={running || enabledCount === 0 || licenseValid === false}
            title={licenseValid === false ? 'Licence requise — rendez-vous dans Key Manager' : undefined}
            onClick={() => dispatchRun({ type: 'RUN_ALL' })}
          >
            {Icon.play}<span>{running ? 'Exécution…' : 'Tout exécuter'}</span>
          </button>
        </div>
      </div>

      <div className="page-body">
        {/* Overall progress */}
        <div className="card" style={{ marginBottom: 22, position: 'relative', overflow: 'hidden' }}>
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: running
              ? 'radial-gradient(700px 200px at 50% 100%, rgba(255,255,255,0.06), transparent 70%)'
              : 'radial-gradient(700px 200px at 50% 100%, rgba(255,255,255,0.025), transparent 70%)',
            transition: 'background .4s ease',
          }}/>
          <div style={{ padding: '22px 24px', position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div>
                <div style={{
                  fontSize: 10.5, fontWeight: 500, letterSpacing: '0.1em',
                  textTransform: 'uppercase', color: 'var(--fg-4)', marginBottom: 4,
                }}>Progression globale</div>
                <div style={{ fontSize: 36, fontWeight: 500, letterSpacing: '-0.03em', color: 'var(--fg-0)', fontFeatureSettings: '"tnum"' }}>
                  {overall}<span style={{ fontSize: 18, color: 'var(--fg-3)', marginLeft: 4 }}>%</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 36, fontSize: 12 }}>
                <div>
                  <div style={{ color: 'var(--fg-4)', fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Étapes</div>
                  <div className="mono" style={{ fontSize: 16, color: 'var(--fg-0)', marginTop: 4 }}>{doneCount}<span style={{ color: 'var(--fg-3)' }}> / {totalEnabled}</span></div>
                </div>
                <div>
                  <div style={{ color: 'var(--fg-4)', fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Écoulé</div>
                  <div className="mono" style={{ fontSize: 16, color: 'var(--fg-0)', marginTop: 4 }}>
                    {String(Math.floor(elapsed / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')}
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--fg-4)', fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase' }}>GPU</div>
                  <div className="mono" style={{ fontSize: 16, color: 'var(--fg-0)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {running ? '78%' : '6%'}
                    <span style={{
                      width: 5, height: 5, borderRadius: '50%',
                      background: running ? '#fff' : 'var(--success)',
                      boxShadow: '0 0 6px rgba(255,255,255,0.5)',
                      animation: running ? 'pulse-soft 1s infinite' : 'none',
                    }}/>
                  </div>
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div style={{
              height: 6, background: 'rgba(255,255,255,0.05)',
              borderRadius: 3, overflow: 'hidden', position: 'relative',
            }}>
              <div style={{
                width: `${overall}%`, height: '100%',
                background: 'linear-gradient(90deg, #fff, #d0d0d0)',
                boxShadow: '0 0 14px rgba(255,255,255,0.4)',
                transition: 'width .6s ease',
              }}/>
              {running && (
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)',
                  backgroundSize: '200% 100%',
                  animation: 'shimmer 2s linear infinite',
                  width: `${overall}%`,
                }}/>
              )}
            </div>
          </div>
        </div>

        {/* Steps */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {STEPS.map((s, i) => {
            const isHandFusion = s.id === 'handFusion';
            const locked = isHandFusion && !handAvailable;
            const status = statuses[s.id] || (enabled[i] ? 'idle' : 'skipped');
            const stepProgress = progress[s.id] || 0;
            const isRunning = current === i;
            return (
              <div
                key={s.id}
                className={`step ${status === 'done' ? 'done' : ''} ${isRunning ? 'running' : ''} ${status === 'error' ? 'error' : ''} ${locked ? 'locked' : ''}`}
              >
                {/* num/step indicator */}
                <div className="badge-num">
                  {isRunning ? <div className="spinner"/> :
                   status === 'done' ? <span style={{ color: 'var(--success)' }}>{Icon.check}</span> :
                   locked ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width:13, height:13 }}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> :
                   String(i + 1).padStart(2, '0')}
                </div>

                {/* icon */}
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--line-2)',
                  display: 'grid', placeItems: 'center',
                  color: locked ? 'var(--fg-4)' : status === 'done' ? 'var(--fg-1)' : 'var(--fg-2)',
                  flex: '0 0 36px',
                  opacity: locked ? 0.5 : 1,
                }}>
                  <div style={{ width: 18, height: 18 }}>{s.icon}</div>
                </div>

                {/* info */}
                <div className="info" style={{ opacity: locked ? 0.5 : 1 }}>
                  <div className="name" style={{ display:'flex', alignItems:'center', gap:8 }}>
                    {s.label}
                    {isHandFusion && (
                      <span style={{
                        fontSize:9.5, padding:'1px 6px', borderRadius:10,
                        background: handAvailable ? 'rgba(45,212,191,0.12)' : 'rgba(255,255,255,0.06)',
                        color: handAvailable ? 'rgba(45,212,191,0.9)' : 'var(--fg-4)',
                        border: `1px solid ${handAvailable ? 'rgba(45,212,191,0.3)' : 'var(--line)'}`,
                        fontWeight:500,
                      }}>
                        {handAvailable ? 'Quest détecté' : 'Requiert hand_tracking.json'}
                      </span>
                    )}
                  </div>
                  <div className="desc">{s.desc}</div>
                  {(isRunning || status === 'done') && (
                    <div className="meta">
                      {isRunning && <span style={{ color: 'var(--fg-1)' }}>{stepProgress}%</span>}
                      {status === 'done' && <span style={{ color: 'var(--success)' }}>Terminé</span>}
                      <span>·</span>
                      <span>{isRunning ? `restant ${s.eta}` : `durée ${s.eta}`}</span>
                    </div>
                  )}
                </div>

                {/* toggle enable */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <Toggle on={enabled[i] && !locked} onClick={() => toggle(s.id)}
                    style={{ opacity: locked ? 0.4 : 1, pointerEvents: locked ? 'none' : 'auto' }}/>
                  <button
                    className="btn sm icon"
                    title={locked ? 'Lance d\'abord un REK avec Hand Tracking' : licenseValid === false ? 'Licence requise' : 'Exécuter cette étape uniquement'}
                    disabled={running || !enabled[i] || licenseValid === false || locked}
                    onClick={() => dispatchRun({ type: 'RUN_ONE', id: s.id })}
                  >
                    {Icon.play}
                  </button>
                </div>

                {/* loading shimmer at bottom of running step */}
                {isRunning && <div className="step-progress"/>}
              </div>
            );
          })}
        </div>

        {/* Helpful hint */}
        <div style={{
          marginTop: 22, padding: '14px 18px',
          background: 'rgba(255,255,255,0.025)',
          border: '1px solid var(--line)',
          borderRadius: 12,
          display: 'flex', alignItems: 'center', gap: 14,
          fontSize: 12.5, color: 'var(--fg-3)',
        }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(255,255,255,0.04)', display: 'grid', placeItems: 'center', flex: '0 0 28px', color: 'var(--fg-2)' }}>
            {Icon.bolt}
          </div>
          <div className="grow">
            Astuce : désactive <span style={{ color: 'var(--fg-1)' }}>« Afficher détection en direct »</span> dans la configuration Pose pour accélérer l'exécution en arrière-plan.
          </div>
          <button className="btn sm ghost">Configurer</button>
        </div>
      </div>
    </>
  );
}

window.Pipeline = Pipeline;
window.STEPS = STEPS;
