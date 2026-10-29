// Boot and composition root for Torres del Sisal.
//
// The page loads this module as its entrypoint: it installs the global error
// handlers and then constructs `window._game` exactly once. `Game` and
// `showFatal` live in `game.mjs`; `window.TDS_BUILD` stays inline in
// `index.html` because the deploy workflow stamps the build tag there.
//
// Contract:
// - The `error` and `unhandledrejection` handlers are registered at module
//   evaluation, before `boot()` runs, so init failures reach the same banner.
// - `boot()` is idempotent: an existing `window._game` is left untouched.
// - A construction failure is reported through `showFatal('init: ...')`
//   instead of escaping the module.
// - `boot()` runs immediately unless the document is still loading, in which
//   case it waits for `DOMContentLoaded`; a Rocket Loader-deferred module
//   therefore still boots.

import { Game, showFatal } from './game.mjs';

window.addEventListener('error', function(e){ showFatal((e.error&&e.error.stack)||e.message||('error @ '+e.filename+':'+e.lineno)); });
window.addEventListener('unhandledrejection', function(e){ showFatal('promesa: '+((e.reason&&(e.reason.stack||e.reason.message))||e.reason)); });

function boot(){
  if(window._game) return;
  try {
    window._game = new Game();
    console.log('[TDS] build', window.TDS_BUILD, 'loaded · THREE=', typeof window.THREE);
  } catch(err) {
    showFatal('init: ' + (err && (err.stack || err.message) || err));
  }
}

// If the script runs after DOMContentLoaded (e.g. deferred by Rocket Loader), boot immediately.
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot); else boot();
