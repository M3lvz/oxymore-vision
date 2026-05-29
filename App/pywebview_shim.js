/**
 * Oxymore Vision — PyWebView Shim
 * Override io() IMMÉDIATEMENT (synchrone) pour éviter le problème de timing.
 * La connexion à pywebview.api se fait en async après.
 */
(function() {

    // Ce fichier est chargé UNIQUEMENT dans Oxymore Vision Desktop.html
    // Pas de garde pywebview — on définit io() inconditionnellement

    // ── Event bus ────────────────────────────────────────────────────────────
    const _listeners = {};

    window.__pyEvent = function(payload) {
        const obj = typeof payload === 'string' ? JSON.parse(payload) : payload;
        (_listeners[obj.event] || []).forEach(cb => cb(obj.data));
    };

    function _on(event, cb)       { if (!_listeners[event]) _listeners[event]=[]; _listeners[event].push(cb); }
    function _emit_local(e, data) { (_listeners[e]||[]).forEach(cb=>cb(data)); }

    // ── Fake socket — défini SYNCHRONEMENT maintenant ────────────────────────
    const fakeSocket = {
        on(event, cb)  { _on(event, cb); return this; },
        off(event)     { delete _listeners[event]; return this; },
        emit(event, d) { if (window.__pyAPI && event==='set_project' && d?.path) window.__pyAPI.set_project(d.path); },
        removeAllListeners() { Object.keys(_listeners).forEach(k=>delete _listeners[k]); },
    };

    // ⚡ SYNCHRONE — io() disponible immédiatement pour app_connected.jsx
    window.io = () => fakeSocket;

    // ── Connexion API Python (async, après le chargement) ────────────────────
    function connectPywebview() {
        const api = window.pywebview?.api;
        if (api) {
            window.__pyAPI = api;
            console.log('[Shim] PyWebView API connectée');
            setTimeout(() => _emit_local('connect', {}), 50);
            _installFetchOverride(api);
        } else {
            // Réessaie indéfiniment jusqu'à ce que pywebview soit prêt
            setTimeout(connectPywebview, 100);
        }
    }

    connectPywebview();

    // ── Override fetch('/api/...') ───────────────────────────────────────────
    function _installFetchOverride(api) {
        const _orig = window.fetch;

        window.fetch = async function(url, opts) {
            if (typeof url !== 'string' || !url.startsWith('/api/')) {
                return _orig ? _orig(url, opts) : Promise.reject(new Error('fetch unavailable'));
            }

            const method = (opts?.method || 'GET').toUpperCase();
            let body = null;
            try { body = opts?.body ? JSON.parse(opts.body) : null; } catch(e) {}

            let result;
            try {
                const u = new URL(url, 'http://x');
                const p = k => u.searchParams.get(k);

                if      (url === '/api/project' && method === 'GET')       result = await api.get_project();
                else if (url === '/api/project' && method === 'POST')      result = await api.set_project(body?.path||'');
                else if (url === '/api/projects/scan')                      result = await api.scan_projects(body?.parent||'');
                else if (url === '/api/projects/create')                    result = await api.create_project(body?.name, body?.parent);
                else if (url === '/api/config'  && method === 'GET')       result = await api.get_config();
                else if (url === '/api/config'  && method === 'POST')      result = await api.save_config(body);
                else if (url === '/api/run')                                result = await api.run_pipeline(body?.steps||[]);
                else if (url === '/api/stop')                               result = await api.stop_pipeline();
                else if (url.startsWith('/api/files') && method === 'GET') result = await api.list_files(p('path'));
                else if (url === '/api/files/open')                         result = await api.open_file(body?.path);
                else if (url === '/api/files/delete')                       result = await api.delete_file(body?.path);
                else if (url === '/api/clean')                              result = await api.clean_project(body?.path);
                else if (url === '/api/browse-folder')                      result = await api.browse_folder();
                else if (url === '/api/system/stats')                       result = await api.get_system_stats();
                else if (url === '/api/system')                             result = await api.get_system_info();
                else if (url.startsWith('/api/viewer/files'))               result = await api.get_viewer_files(p('path'));
                else if (url.startsWith('/api/viewer/trc'))                 result = await api.get_trc_data(p('file'), parseInt(p('max_frames')||400));
                else result = { error: `Endpoint inconnu: ${url}` };
            } catch(e) {
                result = { error: e.message };
            }

            return new Response(JSON.stringify(result), {
                status: result?.error ? 400 : 200,
                headers: { 'Content-Type': 'application/json' },
            });
        };
    }

})();
