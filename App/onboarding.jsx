// onboarding.jsx — Configuration initiale (premier lancement) + splash de démarrage serveur

const { useState: useStateO, useEffect: useEffectO, useRef: useRefO } = React;

// ─────────────────────────────────────────────────────────────
// Modal : Configuration initiale (premier lancement)
// ─────────────────────────────────────────────────────────────
function OnboardingModal({ onChoose, onSkip }) {
  const [path, setPath] = useStateO('');
  const [hover, setHover] = useStateO(null);

  return (
    <div className="overlay">
      <div className="overlay-bg"/>
      <div className="onboarding-shell">
        <DecoRing size={680} x="50%" y="0%" opacity={0.5}/>
        <DecoRing size={520} x="50%" y="100%" opacity={0.4}/>

        <div className="onboarding-card">
          {/* Head */}
          <div className="ob-head">
            <div className="ob-head-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>
              </svg>
            </div>
            <div>
              <div className="ob-title">Configuration initiale</div>
              <div className="ob-subtitle">Oxymore Vision — Premier lancement</div>
            </div>
          </div>

          <div className="ob-intro">
            Oxymore Vision a besoin de <span className="mono" style={{ color: 'var(--fg-0)', background: 'rgba(255,255,255,0.08)', padding: '1px 6px', borderRadius: 4 }}>pose2sim</span> pour fonctionner.<br/>
            Choisissez comment l'obtenir :
          </div>

          {/* Option A: Auto install */}
          <button
            className={`ob-option ${hover === 'auto' ? 'is-hover' : ''}`}
            onMouseEnter={() => setHover('auto')}
            onMouseLeave={() => setHover(null)}
            onClick={() => onChoose('auto', { path })}
          >
            <div className="ob-option-icon ob-option-icon--accent">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="m12 3 9 5v8l-9 5-9-5V8z"/>
                <path d="m3 8 9 5 9-5M12 13v10"/>
              </svg>
            </div>
            <div className="ob-option-body">
              <div className="ob-option-title">Installer automatiquement</div>
              <div className="ob-option-desc">
                Crée un environnement dédié avec <span className="mono">torch CUDA 12.8</span>, <span className="mono">onnxruntime-gpu</span> et <span className="mono">pose2sim</span>.
              </div>
              <div className="ob-option-meta">
                <span>~4 Go</span>
                <span className="dot-sep">·</span>
                <span>connexion internet requise</span>
                <span className="dot-sep">·</span>
                <span>Python 3.10+ requis</span>
              </div>
            </div>
            <div className="ob-option-arrow">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6"/>
              </svg>
            </div>
          </button>

          {/* Path input */}
          <div className="ob-field">
            <label>Dossier d'installation (optionnel)</label>
            <div className="ob-path-row">
              <input
                type="text"
                value={path}
                onChange={e => setPath(e.target.value)}
                placeholder="Par défaut : à côté de l'application"
              />
              <button className="ob-path-pick" title="Parcourir">
                <svg viewBox="0 0 24 24" fill="none" stroke="#f5c66c" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                </svg>
              </button>
            </div>
            <div className="ob-field-help">
              Laissez vide pour installer dans le même dossier que l'application (~4 Go nécessaires).
            </div>
          </div>

          {/* Option B: existing */}
          <button
            className={`ob-option ${hover === 'existing' ? 'is-hover' : ''}`}
            onMouseEnter={() => setHover('existing')}
            onMouseLeave={() => setHover(null)}
            onClick={() => onChoose('existing')}
          >
            <div className="ob-option-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>
              </svg>
            </div>
            <div className="ob-option-body">
              <div className="ob-option-title">J'ai déjà pose2sim installé</div>
              <div className="ob-option-desc">
                Pointe vers un Python existant <span className="muted">(conda, venv, global).</span>
              </div>
              <div className="ob-option-meta">
                <span>Aucun téléchargement</span>
                <span className="dot-sep">·</span>
                <span>instantané</span>
              </div>
            </div>
            <div className="ob-option-arrow">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6"/>
              </svg>
            </div>
          </button>

          {/* Footer */}
          <div className="ob-footer">
            <button className="btn ghost" onClick={onSkip}>Ignorer</button>
            <div style={{ fontSize: 11, color: 'var(--fg-4)', fontFamily: 'var(--font-mono)' }}>
              v1.0.0
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Splash : démarrage du serveur (progress fluide)
// ─────────────────────────────────────────────────────────────
// Total = 6 500 ms → barre termine à 6.5 s, splash visible 7 s (MIN_SPLASH_TIME).
// On évite le redémarrage de l'animation : onReady est un no-op dans Scaler.
const BOOT_STEPS = [
  { label: 'Vérification de Python',           ms: 900  },
  { label: 'Activation de l\'environnement',   ms: 1000 },
  { label: 'Chargement de pose2sim',           ms: 1300 },
  { label: 'Détection du GPU (CUDA)',          ms: 1000 },
  { label: 'Démarrage du serveur',             ms: 1600 },
  { label: 'Connexion à l\'interface',         ms: 700  },
];

const SPLASH_PHRASES = [
  { before: 'Repoussez les ',     italic: 'limites', after: ' de l’animation' },
  { before: 'Donnez ',            italic: 'vie',     after: ' à votre imagination' },
  { before: 'Simplifiez votre ',  italic: 'flux',    after: ' de production' },
  { before: 'Maîtrisez chaque ',  italic: 'angle',   after: ' de l’espace' },
];

// Choisit un index aleatoire different du courant pour ne jamais repeter
function _nextRandomIdx(cur, len) {
  if (len <= 1) return cur;
  let n;
  do { n = Math.floor(Math.random() * len); } while (n === cur);
  return n;
}

function TypewriterPhrase() {
  // Demarrage sur une phrase aleatoire
  const [i, setI] = useStateO(() => Math.floor(Math.random() * SPLASH_PHRASES.length));
  // phase: 0 = typing italic, 1 = rest fading in, 2 = hold, 3 = rest fading out, 4 = erasing italic
  const [phase, setPhase] = useStateO(0);
  const [italicShown, setItalicShown] = useStateO(0);
  const [restVisible, setRestVisible] = useStateO(false);

  useEffectO(() => {
    const phrase = SPLASH_PHRASES[i];
    let t;

    if (phase === 0) {
      if (italicShown < phrase.italic.length) {
        t = setTimeout(() => setItalicShown(s => s + 1), 45 + Math.random() * 25);
      } else {
        t = setTimeout(() => { setRestVisible(true); setPhase(1); }, 180);
      }
    } else if (phase === 1) {
      t = setTimeout(() => setPhase(2), 500);
    } else if (phase === 2) {
      t = setTimeout(() => { setRestVisible(false); setPhase(3); }, 900);
    } else if (phase === 3) {
      t = setTimeout(() => setPhase(4), 350);
    } else if (phase === 4) {
      if (italicShown > 0) {
        t = setTimeout(() => setItalicShown(s => s - 1), 18);
      } else {
        setPhase(0);
        setI(_nextRandomIdx(i, SPLASH_PHRASES.length));
      }
    }
    return () => clearTimeout(t);
  }, [phase, italicShown, i]);

  const phrase = SPLASH_PHRASES[i];
  const italicText = phrase.italic.slice(0, italicShown);

  return (
    <div className="splash-phrase">
      <span className={`splash-phrase-text ${restVisible ? 'rest-on' : 'rest-off'}`}>
        <span className="splash-phrase-rest splash-phrase-before">{phrase.before}</span>
        <span className="splash-phrase-em">{italicText}</span>
        <span className="splash-phrase-rest splash-phrase-after">{phrase.after}</span>
      </span>
    </div>
  );
}

function BootSplash({ onReady, mode }) {
  const [stepIdx, setStepIdx] = useStateO(0);
  const [pct, setPct] = useStateO(0);
  const startRef = useRefO(Date.now());
  const splashRef = useRefO(null);

  useEffectO(() => {
    let cancelled = false;
    let acc = 0;
    const total = BOOT_STEPS.reduce((s, x) => s + x.ms, 0);

    function tick(i) {
      if (cancelled || i >= BOOT_STEPS.length) {
        setPct(100);
        setTimeout(() => !cancelled && onReady(), 350);
        return;
      }
      setStepIdx(i);
      const start = acc;
      const end = acc + BOOT_STEPS[i].ms;
      const t0 = Date.now();
      function frame() {
        if (cancelled) return;
        const elapsed = Date.now() - t0;
        const ratio = Math.min(1, elapsed / BOOT_STEPS[i].ms);
        const cur = start + ratio * BOOT_STEPS[i].ms;
        setPct(Math.round((cur / total) * 100));
        if (ratio < 1) requestAnimationFrame(frame);
        else { acc = end; tick(i + 1); }
      }
      frame();
    }
    tick(0);
    return () => { cancelled = true; };
  }, []);

  // Magnetic planets: pull toward cursor when nearby, then ease back to orbit
  useEffectO(() => {
    const root = splashRef.current;
    if (!root) return;
    const planets = root.querySelectorAll('.solar-planet, .planet-extra');
    const state = new WeakMap();
    let mouseX = -10000, mouseY = -10000;
    let rafId;

    function onMove(e) { mouseX = e.clientX; mouseY = e.clientY; }
    function onLeave() { mouseX = -10000; mouseY = -10000; }

    function tick() {
      for (const p of planets) {
        const s = state.get(p) || { x: 0, y: 0 };
        const r = p.getBoundingClientRect();
        if (r.width === 0) continue;
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const dx = mouseX - cx;
        const dy = mouseY - cy;
        const dist = Math.hypot(dx, dy);
        const threshold = 110;
        let tx = 0, ty = 0;
        if (dist < threshold && dist > 0.5) {
          const t = 1 - dist / threshold;
          const pull = Math.min(18, t * t * 32);
          tx = (dx / dist) * pull;
          ty = (dy / dist) * pull;
        }
        // counter-rotate by the orbit's current angle so screen-space pull stays screen-space
        const orbit = p.closest('.solar-orbit');
        if (orbit) {
          try {
            const m = new DOMMatrix(getComputedStyle(orbit).transform);
            const angle = Math.atan2(m.b, m.a);
            const c = Math.cos(-angle), si = Math.sin(-angle);
            const rx = tx * c - ty * si;
            const ry = tx * si + ty * c;
            tx = rx; ty = ry;
          } catch (e) {}
        }
        s.x += (tx - s.x) * 0.14;
        s.y += (ty - s.y) * 0.14;
        state.set(p, s);
        p.style.setProperty('--mx', s.x.toFixed(2) + 'px');
        p.style.setProperty('--my', s.y.toFixed(2) + 'px');
      }
      rafId = requestAnimationFrame(tick);
    }

    root.addEventListener('mousemove', onMove);
    root.addEventListener('mouseleave', onLeave);
    rafId = requestAnimationFrame(tick);
    return () => {
      root.removeEventListener('mousemove', onMove);
      root.removeEventListener('mouseleave', onLeave);
      cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div className="overlay splash-overlay" ref={splashRef}>
      <div className="overlay-bg overlay-bg--splash"/>

      {/* Solar system — full viewport, centered on logo */}
      <div className="splash-overlay-glows">
        <span className="g1"/>
        <span className="g2"/>
      </div>
      <div className="solar">
        <div className="solar-orbit o1"><div className="solar-planet p1 has-ring"/></div>
        <div className="solar-orbit o2">
          <div className="solar-planet p2"/>
          <div className="planet-extra sm right"/>
        </div>
        <div className="solar-orbit o3">
          <div className="solar-planet p3 has-ring"/>
          <div className="planet-extra bottom"/>
        </div>
        <div className="solar-orbit o4">
          <div className="solar-planet p4"/>
          <div className="planet-extra big has-ring right"/>
          <div className="planet-extra sm top"/>
        </div>
        <div className="solar-orbit o5">
          <div className="solar-planet p5"/>
          <div className="planet-extra bottom"/>
        </div>
        <div className="solar-orbit o6"><div className="solar-planet p6"/></div>
        {/* faint starfield */}
        <svg className="solar-stars" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
          {Array.from({ length: 80 }).map((_, i) => {
            const x = (i * 137.5) % 1440;
            const y = (i * 79.3) % 900;
            const r = 0.3 + (i % 4) * 0.25;
            const o = 0.15 + (i % 5) * 0.12;
            return <circle key={i} cx={x} cy={y} r={r} fill="#fff" opacity={o}/>;
          })}
        </svg>
      </div>

      <div className="splash splash--solar">
        <div className="splash-logo splash-logo--video">
          <div className="splash-sun"/>
          <video
            src={window.ANIM_SRC}
            autoPlay
            muted
            loop
            playsInline
          />
        </div>

        <TypewriterPhrase/>
      </div>

      {/* Progress bar pinned to bottom edge */}
      <div className="splash-bottom-bar">
        <div className="splash-bottom-fill" style={{ width: `${pct}%` }}/>
      </div>
    </div>
  );
}

window.OnboardingModal = OnboardingModal;
window.BootSplash = BootSplash;
