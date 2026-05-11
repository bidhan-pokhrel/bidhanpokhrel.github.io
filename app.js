/**
 * app.js — Main Application Entry Point
 * ─────────────────────────────────────────────────────────────────────────────
 * All helper functions are at module level (no hoisting issues).
 * Boot is wrapped in try/catch so one error never silently kills the whole app.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ═══════════════════════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {

  // Wire the login button FIRST, before anything else can fail
  _bindClick('btn-login-toggle', _onLoginToggle);

  // Boot the rest of the app; wrap in try/catch so errors don't kill the UI
  try {
    await AuthManager.init();
  } catch (e) {
    console.error('Auth init error:', e);
  }

  try {
    ProfileManager.render();
  } catch (e) {
    console.error('Profile render error:', e);
  }

  try {
    EditorManager.init();
  } catch (e) {
    console.error('Editor init error:', e);
  }

  try {
    PostsManager.renderDevlog();
    PostsManager.renderApps();
  } catch (e) {
    console.error('Posts render error:', e);
  }

  // Footer year
  const yr = document.getElementById('footer-year');
  if (yr) yr.textContent = new Date().getFullYear();

  // Restore admin session if still valid
  if (AuthManager.isLoggedIn()) _activateAdminMode(false);

  // Background GitHub sync (non-blocking — page is already visible)
  if (GitHubStorage.isConfigured()) {
    _syncFromGitHub();
  }

  // ── Nav tabs ──────────────────────────────────────────────────────────────
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${target}`)?.classList.add('active');
    });
  });

  // ── Login form ────────────────────────────────────────────────────────────
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async e => {
      e.preventDefault();
      const username  = (document.getElementById('login-username')?.value || '').trim();
      const password  = document.getElementById('login-password')?.value || '';
      const submitBtn = document.getElementById('btn-do-login');
      if (submitBtn) submitBtn.disabled = true;
      _setLoginError('');
      try {
        const result = await AuthManager.login(username, password);
        if (result.ok) {
          _activateAdminMode(true);
          _closeModal('modal-login');
          loginForm.reset();
          showToast('Welcome back, ' + AuthManager.getUsername() + '! 🚀', 'success');
        } else {
          _setLoginError(result.error);
          loginForm.classList.add('shake');
          setTimeout(() => loginForm.classList.remove('shake'), 500);
          document.getElementById('login-password')?.select();
        }
      } catch (err) {
        _setLoginError('An error occurred. Please try again.');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  // ── Password show/hide ────────────────────────────────────────────────────
  _bindClick('toggle-password', () => {
    const pw   = document.getElementById('login-password');
    const icon = document.querySelector('#toggle-password i');
    if (!pw) return;
    const show = pw.type === 'password';
    pw.type = show ? 'text' : 'password';
    if (icon) icon.className = show ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
  });

  // ── New post / app ────────────────────────────────────────────────────────
  _bindClick('btn-new-devlog', () => EditorManager.open(null, 'devlog'));
  _bindClick('btn-new-post',   () => EditorManager.open(null, 'devlog'));
  _bindClick('btn-new-app',    () => EditorManager.open(null, 'app'));

  // ── Editor save ───────────────────────────────────────────────────────────
  _bindClick('btn-publish-post', async () => {
    const result = EditorManager.save('published');
    if (!result.ok) { showToast(result.error, 'error'); return; }
    await _handleEditorSave(result.post, 'Post published! 🚀');
  });

  _bindClick('btn-save-draft', async () => {
    const result = EditorManager.save('draft');
    if (!result.ok) { showToast(result.error, 'error'); return; }
    await _handleEditorSave(result.post, 'Saved as draft.');
  });

  // ── Effects toolbar ───────────────────────────────────────────────────────
  document.querySelectorAll('.fx-btn[data-effect]').forEach(btn => {
    btn.addEventListener('click', () => EditorManager.applyEffect(btn.dataset.effect));
  });
  _bindClick('btn-remove-fx', () => EditorManager.removeEffects());

  // ── Cover image upload ────────────────────────────────────────────────────
  const coverUpload = document.getElementById('post-cover-upload');
  if (coverUpload) {
    coverUpload.addEventListener('change', e => {
      const file = e.target.files?.[0];
      if (file) EditorManager.handleCoverUpload(file);
    });
  }

  // ── Profile settings ──────────────────────────────────────────────────────
  _bindClick('btn-settings',     () => ProfileManager.openEditModal());
  _bindClick('btn-edit-profile', () => ProfileManager.openEditModal());

  const avatarUpload = document.getElementById('avatar-file-upload');
  if (avatarUpload) {
    avatarUpload.addEventListener('change', e => {
      const file = e.target.files?.[0];
      if (!file || !file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = ev => {
        avatarUpload.dataset.base64 = ev.target.result;
        const preview = document.getElementById('profile-form-avatar-img');
        if (preview) { preview.src = ev.target.result; preview.style.display = ''; }
      };
      reader.readAsDataURL(file);
    });
  }

  _bindClick('btn-remove-avatar', () => {
    const fi = document.getElementById('avatar-file-upload');
    const pr = document.getElementById('profile-form-avatar-img');
    if (fi) fi.dataset.base64 = 'REMOVE';
    if (pr) pr.style.display  = 'none';
  });

  // ── Profile form submit ───────────────────────────────────────────────────
  const profileForm = document.getElementById('profile-form');
  if (profileForm) {
    profileForm.addEventListener('submit', async e => {
      e.preventDefault();
      const saveBtn = document.getElementById('btn-save-profile');
      if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }
      try {
        // Save GitHub config if filled
        const ghOwner  = (document.getElementById('gh-owner')?.value  || '').trim();
        const ghRepo   = (document.getElementById('gh-repo')?.value   || '').trim();
        const ghToken  = (document.getElementById('gh-token')?.value  || '').trim();
        const ghBranch = (document.getElementById('gh-branch')?.value || 'main').trim();
        if (ghOwner && ghRepo && ghToken) {
          GitHubStorage.setConfig({ owner: ghOwner, repo: ghRepo, token: ghToken, branch: ghBranch });
        }

        const pr = await ProfileManager.saveFromForm();
        if (!pr.ok) { showToast(pr.error, 'error'); return; }

        const newUser = (document.getElementById('pf-new-username')?.value  || '').trim();
        const newPw   = (document.getElementById('pf-new-password')?.value  || '').trim();
        const curPw   = (document.getElementById('pf-current-password')?.value || '').trim();
        if (newUser || newPw) {
          if (!curPw) { showToast('Enter current password to change credentials.', 'error'); return; }
          if (newUser) { const r = await AuthManager.changeUsername(newUser, curPw); if (!r.ok) { showToast(r.error,'error'); return; } }
          if (newPw)   { const r = await AuthManager.changePassword(newPw,  curPw); if (!r.ok) { showToast(r.error,'error'); return; } }
        }

        ProfileManager.render();
        _closeModal('modal-profile');
        showToast(GitHubStorage.isConfigured() ? 'Saved & synced to GitHub ✓' : 'Profile saved!', 'success');
        ['pf-new-username','pf-new-password','pf-current-password'].forEach(id => {
          const el = document.getElementById(id); if (el) el.value = '';
        });
      } finally {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Changes'; }
      }
    });
  }

  // ── Test GitHub connection ─────────────────────────────────────────────────
  _bindClick('btn-test-github', async () => {
    const btn    = document.getElementById('btn-test-github');
    const result = document.getElementById('gh-test-result');
    if (!result) return;
    GitHubStorage.setConfig({
      owner : (document.getElementById('gh-owner')?.value  || '').trim(),
      repo  : (document.getElementById('gh-repo')?.value   || '').trim(),
      token : (document.getElementById('gh-token')?.value  || '').trim(),
      branch: (document.getElementById('gh-branch')?.value || 'main').trim(),
    });
    if (btn) btn.disabled = true;
    result.textContent = 'Testing…';
    result.style.color = 'var(--text-muted)';
    const test = await GitHubStorage.testConnection();
    result.textContent = test.ok ? `✓ Connected!` : `✗ ${test.error}`;
    result.style.color = test.ok ? 'var(--neon-green)' : 'var(--neon-magenta)';
    showToast(test.ok ? 'Connected! Save profile to enable sync.' : test.error, test.ok ? 'success' : 'error');
    if (btn) btn.disabled = false;
  });

  // ── Post view — edit / delete ─────────────────────────────────────────────
  const postViewModal = document.getElementById('modal-post-view');

  _bindClick('btn-edit-current-post', () => {
    const id = postViewModal?.dataset.postId;
    if (!id) return;
    _closeModal('modal-post-view');
    EditorManager.open(id, PostsManager.get(id)?.type || 'devlog');
  });

  _bindClick('btn-delete-current-post', () => {
    const id = postViewModal?.dataset.postId;
    if (!id) return;
    const conf = document.getElementById('modal-confirm');
    const msg  = document.getElementById('confirm-message');
    if (conf) conf.dataset.deleteId = id;
    if (msg)  msg.textContent = `Delete "${PostsManager.get(id)?.title || 'this post'}"? This cannot be undone.`;
    _openModal('modal-confirm');
  });

  _bindClick('btn-confirm-ok', async () => {
    const conf = document.getElementById('modal-confirm');
    const id   = conf?.dataset.deleteId;
    if (!id) return;
    const type = PostsManager.get(id)?.type;
    await PostsManager.remove(id);
    type === 'app' ? PostsManager.renderApps() : PostsManager.renderDevlog();
    _closeModal('modal-confirm');
    _closeModal('modal-post-view');
    showToast('Post deleted.', 'info');
  });

  _bindClick('btn-confirm-cancel', () => _closeModal('modal-confirm'));

  // ── Modal close: X buttons and [data-close] cancel buttons ───────────────
  document.querySelectorAll('.modal-close, [data-close]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const targetId = el.getAttribute('data-close');
      if (targetId) { _closeModal(targetId); return; }
      const overlay = el.closest('.modal-overlay');
      if (overlay) _closeModal(overlay.id);
    });
  });

  // Backdrop click (only for safe modals where no work is lost)
  ['modal-login', 'modal-post-view', 'modal-confirm'].forEach(id => {
    const overlay = document.getElementById(id);
    if (overlay) {
      overlay.addEventListener('click', e => {
        if (e.target === overlay) _closeModal(id);
      });
    }
  });

  // Escape key closes topmost open modal
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const open = document.querySelectorAll('.modal-overlay.active');
    if (open.length) _closeModal(open[open.length - 1].id);
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// MODULE-LEVEL HELPERS  (defined here — no hoisting ambiguity)
// ═══════════════════════════════════════════════════════════════════════════

function _onLoginToggle() {
  if (AuthManager.isLoggedIn()) {
    AuthManager.logout();
    _deactivateAdminMode();
    showToast('Logged out.', 'info');
  } else {
    _openModal('modal-login');
    _setLoginError('');
    setTimeout(() => document.getElementById('login-username')?.focus(), 80);
  }
}

function _activateAdminMode(animate) {
  document.body.classList.add('is-admin');
  document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
  const span = document.getElementById('login-btn-text');
  if (span) span.textContent = 'Logout';
  if (animate) {
    const header = document.getElementById('site-header');
    if (header) { header.style.borderBottomColor = 'var(--neon-green)'; setTimeout(() => header.style.borderBottomColor = '', 1500); }
  }
  PostsManager.renderDevlog();
  PostsManager.renderApps();
}

function _deactivateAdminMode() {
  document.body.classList.remove('is-admin');
  document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'));
  const span = document.getElementById('login-btn-text');
  if (span) span.textContent = 'Login';
  PostsManager.renderDevlog();
  PostsManager.renderApps();
}

// Called by auth.js session-expiry watcher
function _deactivateFromAuth() { _deactivateAdminMode(); }

function _bindClick(id, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', fn);
}

function _setLoginError(msg) {
  const errEl = document.getElementById('login-error');
  const msgEl = document.getElementById('login-error-msg');
  if (!errEl) return;
  if (msg) { if (msgEl) msgEl.textContent = msg; errEl.classList.remove('hidden'); }
  else errEl.classList.add('hidden');
}

async function _handleEditorSave(post, successMsg) {
  const ind = document.getElementById('editor-saving-indicator');
  ['btn-publish-post','btn-save-draft'].forEach(id => {
    const el = document.getElementById(id); if (el) el.disabled = true;
  });
  if (ind) ind.classList.remove('hidden');
  try {
    await PostsManager.save(post);
    EditorManager.close();
    post.type === 'app' ? PostsManager.renderApps() : PostsManager.renderDevlog();
    showToast(successMsg, 'success');
  } finally {
    ['btn-publish-post','btn-save-draft'].forEach(id => {
      const el = document.getElementById(id); if (el) el.disabled = false;
    });
    if (ind) ind.classList.add('hidden');
  }
}

// Background GitHub sync — runs after page is visible, never blocks UI
async function _syncFromGitHub() {
  try {
    const [profileResult, postsResult] = await Promise.all([
      GitHubStorage.readJSON('data/profile.json').catch(() => ({ data: null })),
      GitHubStorage.readJSON('data/posts.json').catch(() => ({ data: null })),
    ]);
    let updated = false;
    if (profileResult.data) {
      localStorage.setItem('bp_profile', JSON.stringify(profileResult.data));
      ProfileManager.render();
      updated = true;
    }
    if (Array.isArray(postsResult.data)) {
      localStorage.setItem('bp_posts', JSON.stringify(postsResult.data));
      PostsManager.renderDevlog();
      PostsManager.renderApps();
      updated = true;
    }
    if (updated) {
      const ind = document.getElementById('gh-sync-indicator');
      if (ind) { ind.classList.remove('hidden'); setTimeout(() => ind.classList.add('hidden'), 3000); }
    }
  } catch (e) {
    console.warn('Background GitHub sync failed:', e.message);
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// GLOBAL UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

function _openModal(id)  { document.getElementById(id)?.classList.add('active'); }
function _closeModal(id) { document.getElementById(id)?.classList.remove('active'); }
function openModal(id)   { _openModal(id); }
function closeModal(id)  { _closeModal(id); }

function showToast(message, type) {
  type = type || 'info';
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'toast toast-' + type;
  toast.textContent = message;
  toast.setAttribute('role', 'alert');
  container.appendChild(toast);
  requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('toast-show')));
  setTimeout(() => {
    toast.classList.remove('toast-show');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, 3500);
}
