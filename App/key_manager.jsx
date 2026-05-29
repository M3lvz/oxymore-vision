// key_manager.jsx — Gestionnaire de clés de licence (utilisateur + admin limité)
//
// Deux niveaux d'accès :
//   • Utilisateur : voir son statut, activer sa clé
//   • Admin (ID + mdp côté serveur) : générer une clé — ne peut PAS voir/révoquer les autres

const { useState: useStateKM, useEffect: useEffectKM, useRef: useRefKM } = React;

// ─── Modal de confirmation custom (remplace window.confirm) ───────────────────
function ConfirmModal({ modal, onResult }) {
  if (!modal) return null;
  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,.7)',
      display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999,
    }}>
      <div style={{
        background:'#1a1a2e', border:'1px solid rgba(255,255,255,.12)',
        borderRadius:12, padding:'24px 28px', maxWidth:380, width:'90%',
        boxShadow:'0 8px 32px rgba(0,0,0,.5)',
      }}>
        <p style={{ margin:'0 0 20px', color:'#e0e0e0', fontSize:14, lineHeight:1.5, whiteSpace:'pre-line' }}>
          {modal.message}
        </p>
        <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
          <button onClick={() => onResult(false)} style={{
            padding:'7px 18px', borderRadius:7, border:'1px solid rgba(255,255,255,.15)',
            background:'transparent', color:'#aaa', cursor:'pointer', fontSize:13,
          }}>Annuler</button>
          <button onClick={() => onResult(true)} style={{
            padding:'7px 18px', borderRadius:7, border:'none',
            background:'var(--accent, #7eb8f7)', color:'#000', cursor:'pointer',
            fontSize:13, fontWeight:600,
          }}>Confirmer</button>
        </div>
      </div>
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function LicStatusBadge({ reason }) {
  const map = {
    dev_mode:   { label:'⚙ Dev mode',        color:'#7eb8f7' },
    valid:      { label:'✅ Licence valide',   color:'var(--success)' },
    grace:      { label:'⚡ Mode grâce',       color:'var(--warn)' },
    no_license: { label:'⚠ Aucune licence',   color:'var(--warn)' },
    expired:    { label:'❌ Licence expirée',  color:'var(--error)' },
    invalid:    { label:'❌ Licence invalide', color:'var(--error)' },
  };
  const { label, color } = map[reason] || { label: reason || '…', color: 'var(--fg-3)' };
  return (
    <span style={{
      fontSize:11, fontWeight:600, padding:'3px 10px', borderRadius:999,
      background:`${color}18`, color, border:`1px solid ${color}30`,
    }}>
      {label}
    </span>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────
function KeyManager({ onLicenseActivated }) {
  // ── Statut ──
  const [status,    setStatus]    = useStateKM(null);
  const [machineId, setMachineId] = useStateKM('');
  const [midCopied,    setMidCopied]    = useStateKM(false);
  const [deactivating, setDeactivating] = useStateKM(false);
  const [deactivateMsg,setDeactivateMsg]= useStateKM('');

  // ── Activation clé ──
  const [key,          setKey]          = useStateKM('');
  const [activateMsg,  setActivateMsg]  = useStateKM('');
  const [activating,   setActivating]   = useStateKM(false);

  // ── Section admin ──
  const [adminOpen,   setAdminOpen]   = useStateKM(false);
  const [adminId,     setAdminId]     = useStateKM('');
  const [adminPwd,    setAdminPwd]    = useStateKM('');
  const [sessionTok,  setSessionTok]  = useStateKM('');
  const [loginMsg,    setLoginMsg]    = useStateKM('');
  const [loginLoading,setLoginLoading]= useStateKM(false);

  // ── Modal confirmation ──
  const [confirmModal, setConfirmModal] = useStateKM(null);
  const confirmResolve = useRefKM(null);
  function showConfirm(message) {
    return new Promise(resolve => {
      confirmResolve.current = resolve;
      setConfirmModal({ message });
    });
  }
  function handleConfirmResult(result) {
    setConfirmModal(null);
    confirmResolve.current?.(result);
  }

  // ── Génération clé (admin) ──
  const [genNote,    setGenNote]    = useStateKM('');
  const [genExpiry,  setGenExpiry]  = useStateKM('');
  const [newKey,     setNewKey]     = useStateKM('');
  const [genMsg,     setGenMsg]     = useStateKM('');
  const [genLoading, setGenLoading] = useStateKM(false);
  const [newKeyCopied,setNewKeyCopied]= useStateKM(false);

  // ── Liste des licences (admin) ──
  const [licenses,    setLicenses]    = useStateKM({});
  const [listLoaded,  setListLoaded]  = useStateKM(false);
  const [listLoading, setListLoading] = useStateKM(false);
  const [listMsg,     setListMsg]     = useStateKM('');

  useEffectKM(() => {
    loadStatus();
    fetch('/api/license/machine-id')
      .then(r => r.json())
      .then(d => setMachineId(d.machine_id || ''))
      .catch(() => {});
  }, []);

  async function loadStatus() {
    try {
      const r = await fetch('/api/license/status');
      setStatus(await r.json());
    } catch { setStatus(null); }
  }

  // ── Format clé auto ───────────────────────────────────────────────────────
  function handleKeyInput(e) {
    const raw   = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 16);
    const parts = [];
    for (let i = 0; i < raw.length; i += 4) parts.push(raw.slice(i, i + 4));
    setKey(parts.join('-'));
  }

  // ── Activer une clé ──────────────────────────────────────────────────────
  async function activateKey() {
    if (!key) return;
    setActivating(true); setActivateMsg('');
    try {
      const r = await fetch('/api/license/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });
      const d = await r.json();
      if (d.valid) {
        setActivateMsg('✅ Licence activée avec succès');
        loadStatus();
        onLicenseActivated?.();
      } else {
        setActivateMsg(`❌ ${d.message || 'Clé invalide ou non reconnue'}`);
      }
    } catch { setActivateMsg('❌ Erreur réseau'); }
    setActivating(false);
  }

  // ── Login admin ──────────────────────────────────────────────────────────
  async function adminLogin() {
    setLoginLoading(true); setLoginMsg('');
    try {
      const r = await fetch('/api/license/admin-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: adminId, password: adminPwd }),
      });
      const d = await r.json();
      if (d.ok && d.token) {
        setSessionTok(d.token);
        setLoginMsg('✅ Connecté');
        setAdminId(''); setAdminPwd('');
      } else {
        setLoginMsg('❌ Identifiants incorrects');
      }
    } catch { setLoginMsg('❌ Erreur réseau'); }
    setLoginLoading(false);
  }

  // ── Générer une clé (admin) ──────────────────────────────────────────────
  async function generateKey() {
    setGenLoading(true); setGenMsg(''); setNewKey('');
    try {
      const r = await fetch('/api/license/admin/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_token: sessionTok,
          note:        genNote,
          expiry:      genExpiry || null,
        }),
      });
      const d = await r.json();
      if (d.key) {
        setNewKey(d.key);
        setGenMsg('✅ Clé générée');
      } else {
        setGenMsg(`❌ ${d.error || 'Erreur serveur'}`);
      }
    } catch { setGenMsg('❌ Erreur réseau'); }
    setGenLoading(false);
  }

  // ── Liste licences (admin) ─────────────────────────────────────────────────
  async function loadLicenses() {
    setListLoading(true); setListMsg('');
    try {
      const r = await fetch('/api/license/admin/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_token: sessionTok }),
      });
      const d = await r.json();
      if (d.error) { setListMsg(`❌ ${d.error}`); }
      else { setLicenses(d.licenses || {}); setListLoaded(true); }
    } catch { setListMsg('❌ Erreur réseau'); }
    setListLoading(false);
  }

  async function revokeKey(key) {
    if (!await showConfirm(`Révoquer définitivement ${key} ?`)) return;
    try {
      await fetch('/api/license/admin/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_token: sessionTok, key }),
      });
      loadLicenses();
    } catch { setListMsg('❌ Erreur réseau'); }
  }

  async function resetMachine(key) {
    if (!await showConfirm(`Réinitialiser la machine liée à ${key} ?\n(Le prochain PC qui l'active sera lié.)`)) return;
    try {
      await fetch('/api/license/admin/reset-machine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_token: sessionTok, key }),
      });
      loadLicenses();
    } catch { setListMsg('❌ Erreur réseau'); }
  }

  async function deactivateLicense() {
    if (!await showConfirm('Désactiver la licence locale ?\nL\'app repassera en mode non licencié.')) return;
    setDeactivating(true); setDeactivateMsg('');
    try {
      const r = await fetch('/api/license/deactivate', { method: 'POST' });
      const d = await r.json();
      if (d.ok) {
        setDeactivateMsg('✅ Licence désactivée');
        loadStatus();
        onLicenseActivated?.(false); // signale à l'app que la licence est perdue
      } else {
        setDeactivateMsg(`❌ ${d.message}`);
      }
    } catch { setDeactivateMsg('❌ Erreur réseau'); }
    setDeactivating(false);
    setTimeout(() => setDeactivateMsg(''), 4000);
  }

  function copyMachineId() {
    navigator.clipboard.writeText(machineId).catch(() => {});
    setMidCopied(true); setTimeout(() => setMidCopied(false), 2000);
  }
  function copyNewKey() {
    navigator.clipboard.writeText(newKey).catch(() => {});
    setNewKeyCopied(true); setTimeout(() => setNewKeyCopied(false), 2000);
  }

  const inputSt = {
    background: 'rgba(255,255,255,0.05)', border: '1px solid var(--line)',
    borderRadius: 6, padding: '8px 12px', color: 'var(--fg-1)',
    fontSize: 12, fontFamily: 'var(--font-mono)', outline: 'none',
    width: '100%', boxSizing: 'border-box',
  };

  const keyReady = key.replace(/-/g, '').length >= 12;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>🔑 Key Manager</h1>
          <div className="sub">Gestion de votre licence OxymoreVision</div>
        </div>
        <button className="btn" onClick={loadStatus}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
               style={{width:13,height:13}}>
            <path d="M1 4v6h6M23 20v-6h-6"/>
            <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/>
          </svg>
          <span>Actualiser</span>
        </button>
      </div>

      <div className="page-body" style={{ display:'flex', flexDirection:'column', gap:14 }}>

        {/* ── Statut actuel ── */}
        <div className="card">
          <div className="card-head"><h3>Statut de la licence</h3></div>
          <div style={{ padding:'14px 20px', display:'flex', flexDirection:'column', gap:9 }}>
            {status ? (
              <>
                <Row label="Statut"
                  value={<LicStatusBadge reason={status.reason}/>}/>
                <Row label="Clé active"   value={status.key || '—'} mono/>
                <Row label="Expiration"   value={status.expiry
                  ? new Date(status.expiry).toLocaleDateString('fr-FR')
                  : 'Perpétuelle'}/>
                <Row label="Dernier check" value={status.last_check
                  ? new Date(status.last_check).toLocaleString('fr-FR', {dateStyle:'short',timeStyle:'short'})
                  : '—'}/>

                {/* Machine ID */}
                <div style={{ display:'flex', alignItems:'center', gap:12, padding:'5px 0' }}>
                  <span style={{ fontSize:11, color:'var(--fg-4)', width:130, flexShrink:0 }}>
                    Machine ID
                  </span>
                  <span style={{
                    flex:1, fontSize:11, fontFamily:'var(--font-mono)',
                    color:'var(--fg-3)', wordBreak:'break-all',
                  }}>
                    {machineId || '…'}
                  </span>
                  <button className="btn sm icon ghost"
                          onClick={copyMachineId}
                          style={{ color: midCopied ? 'var(--success)' : undefined, flexShrink:0 }}>
                    {midCopied ? '✓' : '📋'}
                  </button>
                </div>

                {/* Bouton désactivation */}
                {status.reason !== 'no_license' && (
                  <div style={{ display:'flex', alignItems:'center', gap:10, paddingTop:6, borderTop:'1px solid rgba(255,255,255,0.06)', marginTop:4 }}>
                    <button
                      className="btn sm ghost"
                      style={{ color:'var(--error)', borderColor:'rgba(255,80,80,0.25)' }}
                      onClick={deactivateLicense}
                      disabled={deactivating}>
                      {deactivating ? '…' : '🗑  Désactiver la licence'}
                    </button>
                    {deactivateMsg && (
                      <span style={{ fontSize:11,
                                     color: deactivateMsg.startsWith('✅') ? 'var(--success)' : 'var(--error)' }}>
                        {deactivateMsg}
                      </span>
                    )}
                  </div>
                )}
              </>
            ) : (
              <span style={{ fontSize:12, color:'var(--fg-4)' }}>Chargement…</span>
            )}
          </div>
        </div>

        {/* ── Activer une clé ── */}
        <div className="card">
          <div className="card-head"><h3>Activer une clé</h3></div>
          <div style={{ padding:'14px 20px', display:'flex', flexDirection:'column', gap:10 }}>
            <input
              value={key}
              onChange={handleKeyInput}
              onKeyDown={e => e.key === 'Enter' && keyReady && !activating && activateKey()}
              placeholder="OXYM-XXXX-XXXX-XXXX"
              maxLength={19}
              style={{
                ...inputSt,
                fontSize: 18, letterSpacing: '0.14em', textAlign: 'center',
              }}
            />
            {activateMsg && (
              <div style={{
                fontSize:12,
                color: activateMsg.startsWith('✅') ? 'var(--success)' : 'var(--error)',
              }}>
                {activateMsg}
              </div>
            )}
            <button
              className="btn primary"
              onClick={activateKey}
              disabled={activating || !keyReady}>
              {activating ? 'Activation…' : '🔑  Activer la licence'}
            </button>
          </div>
        </div>

        {/* ── Section admin ── */}
        <div className="card">
          <div className="card-head"
               style={{ cursor:'pointer' }}
               onClick={() => setAdminOpen(o => !o)}>
            <h3>Section administrateur</h3>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                 style={{
                   width:14, height:14, color:'var(--fg-4)',
                   transform: adminOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                   transition:'transform .2s',
                 }}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>

          {adminOpen && (
            <div style={{ padding:'14px 20px', display:'flex', flexDirection:'column', gap:12 }}>

              {!sessionTok ? (
                /* Login */
                <>
                  <div style={{ fontSize:11.5, color:'var(--fg-4)', marginBottom:2 }}>
                    Réservé à l'administrateur — génération de clés uniquement.
                  </div>
                  <div style={{ display:'flex', gap:10 }}>
                    <input value={adminId}
                           onChange={e => setAdminId(e.target.value)}
                           placeholder="Identifiant admin"
                           style={inputSt}/>
                    <input value={adminPwd}
                           onChange={e => setAdminPwd(e.target.value)}
                           type="password"
                           placeholder="Mot de passe"
                           onKeyDown={e => e.key === 'Enter' && adminLogin()}
                           style={inputSt}/>
                  </div>
                  {loginMsg && (
                    <div style={{ fontSize:12,
                                  color: loginMsg.startsWith('✅') ? 'var(--success)' : 'var(--error)' }}>
                      {loginMsg}
                    </div>
                  )}
                  <button className="btn"
                          onClick={adminLogin}
                          disabled={loginLoading || !adminId || !adminPwd}>
                    {loginLoading ? 'Connexion…' : 'Se connecter'}
                  </button>
                </>
              ) : (
                /* Admin connecté */
                <>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <span style={{ fontSize:12, color:'var(--success)' }}>
                      ✅ Connecté en tant qu'administrateur
                    </span>
                    <button className="btn sm ghost"
                            onClick={() => { setSessionTok(''); setNewKey(''); setGenMsg(''); }}>
                      Déconnexion
                    </button>
                  </div>

                  <div style={{
                    height:1, background:'rgba(255,255,255,0.07)', margin:'2px 0',
                  }}/>

                  {/* Formulaire génération */}
                  <div style={{ display:'flex', gap:10 }}>
                    <input value={genNote}
                           onChange={e => setGenNote(e.target.value)}
                           placeholder="Note (client, usage…)"
                           style={inputSt}/>
                    <input value={genExpiry}
                           onChange={e => setGenExpiry(e.target.value)}
                           placeholder="Expiration YYYY-MM-DD (vide = perpétuelle)"
                           style={{ ...inputSt, width:240, flex:'none' }}/>
                  </div>

                  <button className="btn" onClick={generateKey} disabled={genLoading}>
                    {genLoading ? 'Génération…' : '✨  Générer une clé'}
                  </button>

                  {genMsg && (
                    <div style={{ fontSize:12,
                                  color: genMsg.startsWith('✅') ? 'var(--success)' : 'var(--error)' }}>
                      {genMsg}
                    </div>
                  )}

                  {newKey && (
                    <div style={{
                      display:'flex', alignItems:'center', justifyContent:'space-between', gap:12,
                      background:'rgba(110,231,160,0.06)',
                      border:'1px solid rgba(110,231,160,0.25)',
                      borderRadius:8, padding:'12px 16px',
                    }}>
                      <span style={{
                        fontFamily:'var(--font-mono)', fontSize:17, fontWeight:700,
                        color:'var(--success)', letterSpacing:'0.12em',
                      }}>
                        {newKey}
                      </span>
                      <button className="btn sm ghost"
                              onClick={copyNewKey}
                              style={{ color: newKeyCopied ? 'var(--success)' : undefined }}>
                        {newKeyCopied ? '✓ Copié' : '📋 Copier'}
                      </button>
                    </div>
                  )}

                  <div style={{ height:1, background:'rgba(255,255,255,0.07)', margin:'6px 0' }}/>

                  {/* ── Liste toutes les licences ── */}
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <span style={{ fontSize:11.5, fontWeight:500, color:'var(--fg-2)' }}>
                      Toutes les licences
                      {listLoaded && Object.keys(licenses).length > 0 && (
                        <span style={{
                          marginLeft:8, fontSize:10, fontFamily:'var(--font-mono)',
                          padding:'1px 7px', borderRadius:999,
                          background:'rgba(126,184,247,0.12)', color:'#7eb8f7',
                          border:'1px solid rgba(126,184,247,0.2)',
                        }}>{Object.keys(licenses).length}</span>
                      )}
                    </span>
                    <button className="btn sm" onClick={loadLicenses} disabled={listLoading}>
                      {listLoading ? '…' : listLoaded ? '🔄 Rafraîchir' : 'Charger'}
                    </button>
                  </div>

                  {listMsg && (
                    <div style={{ fontSize:12, color:'var(--error)' }}>{listMsg}</div>
                  )}

                  {!listLoaded ? (
                    <div style={{ fontSize:11.5, color:'var(--fg-4)', fontStyle:'italic' }}>
                      Cliquez « Charger » pour voir les licences sur le serveur.
                    </div>
                  ) : Object.keys(licenses).length === 0 ? (
                    <div style={{ fontSize:11.5, color:'var(--fg-4)' }}>Aucune licence enregistrée.</div>
                  ) : (
                    <div style={{
                      display:'flex', flexDirection:'column', gap:0,
                      border:'1px solid var(--line)', borderRadius:8, overflow:'hidden',
                    }}>
                      {Object.entries(licenses).map(([k, info]) => (
                        <div key={k} style={{
                          padding:'10px 14px', borderBottom:'1px solid var(--line)',
                          opacity: info.revoked ? 0.45 : 1,
                          background: 'rgba(255,255,255,0.015)',
                        }}>
                          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, marginBottom:4 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                              <span style={{
                                fontFamily:'var(--font-mono)', fontSize:13, fontWeight:700,
                                letterSpacing:'0.07em',
                                color: info.revoked ? 'var(--error)' : 'var(--fg-0)',
                              }}>{k}</span>
                              {info.revoked && (
                                <span style={{ fontSize:9, padding:'1px 5px', borderRadius:999,
                                  background:'rgba(255,80,80,0.1)', color:'var(--error)',
                                  border:'1px solid rgba(255,80,80,0.2)' }}>RÉVOQUÉE</span>
                              )}
                              {!info.machine_id && !info.revoked && (
                                <span style={{ fontSize:9, padding:'1px 5px', borderRadius:999,
                                  background:'rgba(246,196,78,0.1)', color:'var(--warn)',
                                  border:'1px solid rgba(246,196,78,0.2)' }}>Non activée</span>
                              )}
                            </div>
                            <div style={{ display:'flex', gap:5, flexShrink:0 }}>
                              {info.machine_id && !info.revoked && (
                                <button className="btn sm ghost" onClick={() => resetMachine(k)}>↩ Reset</button>
                              )}
                              {!info.revoked && (
                                <button className="btn sm ghost"
                                        style={{ color:'var(--error)' }}
                                        onClick={() => revokeKey(k)}>Révoquer</button>
                              )}
                            </div>
                          </div>
                          <div style={{ display:'flex', gap:12, flexWrap:'wrap', fontSize:10, color:'var(--fg-4)', fontFamily:'var(--font-mono)' }}>
                            {info.note && <span>📝 {info.note}</span>}
                            <span>Créée : {info.created_at ? new Date(info.created_at).toLocaleDateString('fr-FR') : '—'}</span>
                            <span>Expire : {info.expiry ? new Date(info.expiry).toLocaleDateString('fr-FR') : 'Perpétuelle'}</span>
                            {info.machine_id && <span>Machine : {info.machine_id.slice(0,12)}…</span>}
                            {info.last_ping  && <span>Ping : {new Date(info.last_ping).toLocaleDateString('fr-FR')}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

      </div>
      <ConfirmModal modal={confirmModal} onResult={handleConfirmResult} />
    </>
  );
}

// ─── Helper Row ───────────────────────────────────────────────────────────────
function Row({ label, value, mono }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:12, padding:'4px 0' }}>
      <span style={{ fontSize:11, color:'var(--fg-4)', width:130, flexShrink:0 }}>{label}</span>
      <span style={{
        fontSize:12, color:'var(--fg-1)', flex:1,
        fontFamily: mono ? 'var(--font-mono)' : undefined,
      }}>
        {value}
      </span>
    </div>
  );
}

window.KeyManager = KeyManager;
