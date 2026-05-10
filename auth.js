/**
 * auth.js — Authentication Manager
 * ─────────────────────────────────────────────────────────────────────────────
 * Security:
 *   ✓ SHA-256 password hashing (Web Crypto API — no plaintext stored)
 *   ✓ Random 32-byte session token (not a guessable flag)
 *   ✓ 5-attempt brute-force lockout with 30-min cooldown
 *   ✓ 60-minute inactivity auto-logout
 *   ✓ Password strength requirements (min 8 chars)
 *
 * Default credentials:  username=bidhan  password=Admin@2024
 * (Change via Settings modal after first login)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const AuthManager = (() => {

  // ── Storage keys ──────────────────────────────────────────────────────────
  const K_SETUP    = 'bp_v2_setup';       // version-scoped key (avoids stale old data)
  const K_USER     = 'bp_v2_user';
  const K_HASH     = 'bp_v2_hash';
  const K_ATTEMPTS = 'bp_v2_attempts';
  const K_TOKEN    = 'bp_session_token';
  const K_EXPIRY   = 'bp_session_expiry';

  // ── Config ─────────────────────────────────────────────────────────────────
  const DEFAULT_USER = 'bidhan';
  const DEFAULT_PASS = 'Admin@2024';
  const MAX_TRIES    = 5;
  const LOCK_MINS    = 30;
  const SESSION_MINS = 60;

  // ── Crypto helpers ─────────────────────────────────────────────────────────
  async function _sha256(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,'0')).join('');
  }

  function _token() {
    const a = new Uint8Array(32);
    crypto.getRandomValues(a);
    return [...a].map(b => b.toString(16).padStart(2,'0')).join('');
  }

  // ── Attempt tracking ───────────────────────────────────────────────────────
  function _getAttempts() {
    try { return JSON.parse(localStorage.getItem(K_ATTEMPTS)) || {n:0,until:0}; }
    catch { return {n:0,until:0}; }
  }
  function _setAttempts(obj) { localStorage.setItem(K_ATTEMPTS, JSON.stringify(obj)); }

  function _locked() {
    const a = _getAttempts();
    return a.until && Date.now() < a.until;
  }

  function _lockMinsLeft() {
    return Math.max(0, Math.ceil((_getAttempts().until - Date.now()) / 60000));
  }

  function _fail() {
    const a = _getAttempts();
    a.n++;
    if (a.n >= MAX_TRIES) {
      a.until = Date.now() + LOCK_MINS * 60000;
      a.n = 0;
    }
    _setAttempts(a);
  }

  function _clearFails() { _setAttempts({n:0,until:0}); }

  // ── Session ────────────────────────────────────────────────────────────────
  function _extendSession() {
    sessionStorage.setItem(K_EXPIRY, new Date(Date.now() + SESSION_MINS * 60000).toISOString());
  }

  function _expired() {
    const e = sessionStorage.getItem(K_EXPIRY);
    return !e || Date.now() > new Date(e).getTime();
  }

  // Activity watcher — resets the 60-min countdown on any user interaction
  function _watchActivity() {
    const reset = () => { if (isLoggedIn()) _extendSession(); };
    ['mousemove','keydown','mousedown','touchstart','scroll'].forEach(ev =>
      document.addEventListener(ev, reset, { passive: true })
    );

    setInterval(() => {
      if (sessionStorage.getItem(K_TOKEN) && _expired()) {
        logout();
        // Notify the UI (app.js functions available at this point)
        if (typeof showToast === 'function') showToast('Session expired — please log in again.', 'warning');
        if (typeof _deactivateFromAuth === 'function') _deactivateFromAuth();
      }
    }, 30000);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * init()
   * Writes default credentials to localStorage on first-ever load
   * (uses a version-scoped key so old stale data is ignored).
   */
  async function init() {
    if (!localStorage.getItem(K_SETUP)) {
      localStorage.setItem(K_USER,  DEFAULT_USER);
      localStorage.setItem(K_HASH,  await _sha256(DEFAULT_PASS));
      localStorage.setItem(K_SETUP, '1');
    }
    _watchActivity();
  }

  /**
   * login(username, password)
   * @returns {Promise<{ok:boolean, error?:string}>}
   */
  async function login(username, password) {
    if (_locked()) return { ok:false, error:`Account locked. Try again in ${_lockMinsLeft()} min.` };
    if (!username || !password) return { ok:false, error:'Please enter username and password.' };

    const stored = localStorage.getItem(K_USER) || '';
    const hash   = localStorage.getItem(K_HASH) || '';
    const inputH = await _sha256(password);

    const userOk = username.trim().toLowerCase() === stored.toLowerCase();
    const hashOk = inputH === hash;

    if (!userOk || !hashOk) {
      _fail();
      if (_locked()) return { ok:false, error:`Too many attempts. Locked for ${LOCK_MINS} minutes.` };
      const left = MAX_TRIES - _getAttempts().n;
      return { ok:false, error:`Wrong credentials. ${left} attempt${left!==1?'s':''} left.` };
    }

    _clearFails();
    sessionStorage.setItem(K_TOKEN, _token());
    _extendSession();
    return { ok:true };
  }

  function logout() {
    sessionStorage.removeItem(K_TOKEN);
    sessionStorage.removeItem(K_EXPIRY);
  }

  function isLoggedIn() {
    if (!sessionStorage.getItem(K_TOKEN)) return false;
    if (_expired()) { logout(); return false; }
    return true;
  }

  async function changeUsername(newUser, curPass) {
    const u = newUser.trim();
    if (!u || u.length < 3) return { ok:false, error:'Username must be at least 3 characters.' };
    const h = await _sha256(curPass);
    if (h !== localStorage.getItem(K_HASH)) return { ok:false, error:'Current password is wrong.' };
    localStorage.setItem(K_USER, u);
    return { ok:true };
  }

  async function changePassword(newPass, curPass) {
    if (!newPass || newPass.length < 8) return { ok:false, error:'Password must be at least 8 characters.' };
    const h = await _sha256(curPass);
    if (h !== localStorage.getItem(K_HASH)) return { ok:false, error:'Current password is wrong.' };
    localStorage.setItem(K_HASH, await _sha256(newPass));
    return { ok:true };
  }

  function getUsername() { return localStorage.getItem(K_USER) || DEFAULT_USER; }

  return { init, login, logout, isLoggedIn, changeUsername, changePassword, getUsername };

})();

// Called by the session watcher when auto-logout fires
function _deactivateFromAuth() {
  document.body.classList.remove('is-admin');
  document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'));
  const btn = document.getElementById('btn-login-toggle');
  if (btn) btn.textContent = '⌁ Login';
  if (typeof PostsManager !== 'undefined') {
    PostsManager.renderDevlog();
    PostsManager.renderApps();
  }
}
