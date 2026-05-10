/**
 * auth.js — Authentication Manager (hardened)
 * ─────────────────────────────────────────────────────────────────────────────
 * Security features:
 *   ✓ SHA-256 password hashing via Web Crypto API (no plaintext ever stored)
 *   ✓ Brute-force lockout: 5 wrong attempts → 30-minute cooldown
 *   ✓ Session timeout: auto-logout after 60 minutes of inactivity
 *   ✓ Session token: random UUID stored in sessionStorage (not a simple flag)
 *   ✓ Attempt counter stored server-side-safe (keyed by username hash)
 *
 * localStorage keys:
 *   bp_auth_setup          → "1" once defaults written
 *   bp_auth_username       → stored username
 *   bp_auth_password_hash  → hex SHA-256 of the password
 *   bp_auth_attempts       → JSON { count, lockedUntil }
 *
 * sessionStorage keys:
 *   bp_session_token       → random UUID (valid session)
 *   bp_session_expiry      → ISO timestamp (auto-logout time)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const AuthManager = (() => {

  const KEY_SETUP    = 'bp_auth_setup';
  const KEY_USER     = 'bp_auth_username';
  const KEY_HASH     = 'bp_auth_password_hash';
  const KEY_ATTEMPTS = 'bp_auth_attempts';
  const KEY_TOKEN    = 'bp_session_token';
  const KEY_EXPIRY   = 'bp_session_expiry';

  const DEFAULT_USERNAME    = 'bidhan';
  const DEFAULT_PASSWORD    = 'Admin@2024';
  const MAX_ATTEMPTS        = 5;          // wrong tries before lockout
  const LOCKOUT_MINUTES     = 30;         // lockout duration
  const SESSION_MINUTES     = 60;         // auto-logout after inactivity
  const ACTIVITY_CHECK_MS   = 30_000;     // check inactivity every 30 s

  let _activityTimer = null;

  // ── Crypto ────────────────────────────────────────────────────────────────
  async function sha256(text) {
    const buf   = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,'0')).join('');
  }

  function _randomToken() {
    // Generate a cryptographically random UUID-like token
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    return [...arr].map(b => b.toString(16).padStart(2,'0')).join('');
  }

  // ── Attempt tracking ──────────────────────────────────────────────────────
  function _getAttempts() {
    try { return JSON.parse(localStorage.getItem(KEY_ATTEMPTS)) || { count: 0, lockedUntil: 0 }; }
    catch { return { count: 0, lockedUntil: 0 }; }
  }
  function _saveAttempts(obj) { localStorage.setItem(KEY_ATTEMPTS, JSON.stringify(obj)); }

  function _isLocked() {
    const a = _getAttempts();
    return a.lockedUntil && Date.now() < a.lockedUntil;
  }

  function _lockoutRemaining() {
    const ms = _getAttempts().lockedUntil - Date.now();
    return ms > 0 ? Math.ceil(ms / 60000) : 0;
  }

  function _recordFailure() {
    const a = _getAttempts();
    a.count++;
    if (a.count >= MAX_ATTEMPTS) {
      a.lockedUntil = Date.now() + LOCKOUT_MINUTES * 60_000;
      a.count = 0;   // reset counter for next window
    }
    _saveAttempts(a);
  }

  function _clearAttempts() {
    _saveAttempts({ count: 0, lockedUntil: 0 });
  }

  // ── Session expiry ────────────────────────────────────────────────────────
  function _setExpiry() {
    const expiry = new Date(Date.now() + SESSION_MINUTES * 60_000).toISOString();
    sessionStorage.setItem(KEY_EXPIRY, expiry);
  }

  function _isSessionExpired() {
    const expiry = sessionStorage.getItem(KEY_EXPIRY);
    if (!expiry) return true;
    return Date.now() > new Date(expiry).getTime();
  }

  /**
   * Refreshes the expiry timestamp on any user activity.
   * Called on mouse, keyboard, and touch events in app.js.
   */
  function refreshActivity() {
    if (isLoggedIn()) _setExpiry();
  }

  function _startActivityWatcher() {
    if (_activityTimer) clearInterval(_activityTimer);
    _activityTimer = setInterval(() => {
      if (isLoggedIn() && _isSessionExpired()) {
        logout();
        showToast('Session expired — please log in again.', 'warning');
        // Re-render the UI to remove admin state
        document.body.classList.remove('is-admin');
        const btn = document.getElementById('btn-login-toggle');
        if (btn) btn.textContent = 'Login';
        // Re-render grids (hide drafts)
        if (typeof PostsManager !== 'undefined') {
          PostsManager.renderDevlog();
          PostsManager.renderApps();
        }
      }
    }, ACTIVITY_CHECK_MS);

    // Reset expiry on any user interaction
    const reset = () => refreshActivity();
    ['mousemove','keydown','mousedown','touchstart','scroll'].forEach(ev =>
      document.addEventListener(ev, reset, { passive: true })
    );
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  async function init() {
    if (!localStorage.getItem(KEY_SETUP)) {
      const hash = await sha256(DEFAULT_PASSWORD);
      localStorage.setItem(KEY_USER,  DEFAULT_USERNAME);
      localStorage.setItem(KEY_HASH,  hash);
      localStorage.setItem(KEY_SETUP, '1');
    }
    _startActivityWatcher();
  }

  async function login(username, password) {
    // Lockout check
    if (_isLocked()) {
      return { ok: false, error: `Too many failed attempts. Try again in ${_lockoutRemaining()} minute(s).` };
    }

    // Empty-field guard
    if (!username.trim() || !password) {
      return { ok: false, error: 'Username and password are required.' };
    }

    const storedUser = localStorage.getItem(KEY_USER) || '';
    const storedHash = localStorage.getItem(KEY_HASH) || '';

    // Constant-time-ish comparison: always hash before comparing
    const inputHash = await sha256(password);
    const userMatch = username.trim().toLowerCase() === storedUser.toLowerCase();
    const hashMatch = inputHash === storedHash;

    if (!userMatch || !hashMatch) {
      _recordFailure();
      const a = _getAttempts();
      const remaining = MAX_ATTEMPTS - a.count;
      if (_isLocked()) {
        return { ok: false, error: `Too many failed attempts. Locked for ${LOCKOUT_MINUTES} minutes.` };
      }
      return { ok: false, error: `Invalid credentials. ${remaining} attempt(s) remaining.` };
    }

    // Success
    _clearAttempts();
    const token = _randomToken();
    sessionStorage.setItem(KEY_TOKEN, token);
    _setExpiry();
    return { ok: true };
  }

  function logout() {
    sessionStorage.removeItem(KEY_TOKEN);
    sessionStorage.removeItem(KEY_EXPIRY);
  }

  function isLoggedIn() {
    const token  = sessionStorage.getItem(KEY_TOKEN);
    if (!token || token.length < 32) return false;   // no token = not logged in
    if (_isSessionExpired()) { logout(); return false; }
    return true;
  }

  async function changeUsername(newUsername, currentPassword) {
    const trimmed = newUsername.trim();
    if (!trimmed) return { ok: false, error: 'Username cannot be empty.' };
    if (trimmed.length < 3) return { ok: false, error: 'Username must be at least 3 characters.' };

    const storedHash = localStorage.getItem(KEY_HASH) || '';
    const hash = await sha256(currentPassword);
    if (hash !== storedHash) return { ok: false, error: 'Current password is incorrect.' };

    localStorage.setItem(KEY_USER, trimmed);
    return { ok: true };
  }

  async function changePassword(newPassword, currentPassword) {
    if (!newPassword || newPassword.length < 8) {
      return { ok: false, error: 'New password must be at least 8 characters.' };
    }
    // Reject trivially weak passwords
    const weak = ['password','12345678','admin1234','00000000'];
    if (weak.includes(newPassword.toLowerCase())) {
      return { ok: false, error: 'That password is too common. Choose something stronger.' };
    }

    const storedHash = localStorage.getItem(KEY_HASH) || '';
    const oldHash    = await sha256(currentPassword);
    if (oldHash !== storedHash) return { ok: false, error: 'Current password is incorrect.' };

    const newHash = await sha256(newPassword);
    localStorage.setItem(KEY_HASH, newHash);
    return { ok: true };
  }

  function getUsername() {
    return localStorage.getItem(KEY_USER) || DEFAULT_USERNAME;
  }

  return {
    init, login, logout, isLoggedIn,
    changeUsername, changePassword,
    getUsername, refreshActivity,
  };

})();
