/**
 * app.js — Main Application Entry Point
 * ─────────────────────────────────────────────────────────────────────────────
 * Boot order:
 *   1. Auth init (write default credentials if first load)
 *   2. GitHub init (if configured, loads posts + profile from GitHub)
 *   3. Profile render
 *   4. Editor init (Quill)
 *   5. Posts render
 * ─────────────────────────────────────────────────────────────────────────────
 */

document.addEventListener('DOMContentLoaded', async () => {

  // ══════════════════════════════════════════════════════════════════════════
  // 1. BOOT — show loading overlay while fetching from GitHub
  // ══════════════════════════════════════════════════════════════════════════
  _showLoader(true);

  await AuthManager.init();

  // If GitHub is configured, load remote data before rendering anything
  if (GitHubStorage.isConfigured()) {
    try {
      await Promise.all([ProfileManager.init(), PostsManager.init()]);
    } catch (e) {
      console.warn('Remote load error:', e.message);
    }
  }

  ProfileManager.render();
  EditorManager.init();
  PostsManager.renderDevlog();
  PostsManager.renderApps();

  const yearEl = document.getElementById('footer-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  _showLoader(false);

  // Restore admin session
  if (AuthManager.isLoggedIn()) _activateAdminMode(false);

  // ══════════════════════════════════════════════════════════════════════════
  // 2. NAV TABS
  // ══════════════════════════════════════════════════════════════════════════
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${target}`)?.classList.add('active');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 3. AUTH
  // ══════════════════════════════════════════════════════════════════════════
  _bindClick('btn-login-toggle', () => {
    if (AuthManager.isLoggedIn()) {
      AuthManager.logout();
      _deactivateAdminMode();
      showToast('Logged out.', 'info');
    } else {
      _openModal('modal-login');
      _setLoginError('');
      setTimeout(() => document.getElementById('login-username')?.focus(), 80);
    }
  });

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

  _bindClick('toggle-password', () => {
    const pw   = document.getElementById('login-password');
    const icon = document.querySelector('#toggle-password i');
    if (!pw) return;
    const show = pw.type === 'password';
    pw.type = show ? 'text' : 'password';
    if (icon) icon.className = show ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 4. NEW POST / APP
  // ══════════════════════════════════════════════════════════════════════════
  _bindClick('btn-new-devlog', () => EditorManager.open(null, 'devlog'));
  _bindClick('btn-new-post',   () => EditorManager.open(null, 'devlog'));
  _bindClick('btn-new-app',    () => EditorManager.open(null, 'app'));

  // ══════════════════════════════════════════════════════════════════════════
  // 5. EDITOR — Publish / Save Draft
  // ══════════════════════════════════════════════════════════════════════════
  _bindClick('btn-publish-post', async () => {
    const result = EditorManager.save('published');
    if (!result.ok) { showToast(result.error, 'error'); return; }
    await _afterSave(result.post);
    showToast('Post published! 🚀', 'success');
  });

  _bindClick('btn-save-draft', async () => {
    const result = EditorManager.save('draft');
    if (!result.ok) { showToast(result.error, 'error'); return; }
    await _afterSave(result.post);
    showToast('Saved as draft.', 'info');
  });

  async function _afterSave(post) {
    // Disable buttons while saving to GitHub
    _setSaveButtons(true);
    try {
      await PostsManager.save(post);
    } finally {
      _setSaveButtons(false);
    }
    EditorManager.close();
    post.type === 'app' ? PostsManager.renderApps() : PostsManager.renderDevlog();
  }

  function _setSaveButtons(disabled) {
    ['btn-publish-post','btn-save-draft'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = disabled;
    });
    const indicator = document.getElementById('editor-saving-indicator');
    if (indicator) indicator.classList.toggle('hidden', !disabled);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 6. EFFECTS TOOLBAR
  // ══════════════════════════════════════════════════════════════════════════
  document.querySelectorAll('.fx-btn[data-effect]').forEach(btn => {
    btn.addEventListener('click', () => EditorManager.applyEffect(btn.dataset.effect));
  });
  _bindClick('btn-remove-fx', () => EditorManager.removeEffects());

  // ══════════════════════════════════════════════════════════════════════════
  // 7. COVER IMAGE UPLOAD
  // ══════════════════════════════════════════════════════════════════════════
  const coverUpload = document.getElementById('post-cover-upload');
  if (coverUpload) {
    coverUpload.addEventListener('change', e => {
      const file = e.target.files?.[0];
      if (file) EditorManager.handleCoverUpload(file);
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 8. PROFILE SETTINGS
  // ══════════════════════════════════════════════════════════════════════════
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

  // Profile form submit
  const profileForm = document.getElementById('profile-form');
  if (profileForm) {
    profileForm.addEventListener('submit', async e => {
      e.preventDefault();
      const saveBtn = document.getElementById('btn-save-profile');
      if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }

      try {
        // Save GitHub config first (so subsequent profile save goes to GitHub)
        const ghOwner  = (document.getElementById('gh-owner')?.value  || '').trim();
        const ghRepo   = (document.getElementById('gh-repo')?.value   || '').trim();
        const ghToken  = (document.getElementById('gh-token')?.value  || '').trim();
        const ghBranch = (document.getElementById('gh-branch')?.value || 'main').trim();
        if (ghOwner && ghRepo && ghToken) {
          GitHubStorage.setConfig({ owner: ghOwner, repo: ghRepo, token: ghToken, branch: ghBranch });
        }

        const pr = await ProfileManager.saveFromForm();
        if (!pr.ok) { showToast(pr.error, 'error'); return; }

        // Credential change
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
        showToast(GitHubStorage.isConfigured() ? 'Profile saved & synced to GitHub! ✓' : 'Profile saved!', 'success');
        ['pf-new-username','pf-new-password','pf-current-password'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

      } finally {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Changes'; }
      }
    });
  }

  // Test GitHub connection
  _bindClick('btn-test-github', async () => {
    const btn    = document.getElementById('btn-test-github');
    const result = document.getElementById('gh-test-result');
    if (!result) return;

    // Temporarily save the typed-in values for the test
    const ghOwner  = (document.getElementById('gh-owner')?.value  || '').trim();
    const ghRepo   = (document.getElementById('gh-repo')?.value   || '').trim();
    const ghToken  = (document.getElementById('gh-token')?.value  || '').trim();
    const ghBranch = (document.getElementById('gh-branch')?.value || 'main').trim();
    GitHubStorage.setConfig({ owner: ghOwner, repo: ghRepo, token: ghToken, branch: ghBranch });

    if (btn) btn.disabled = true;
    result.textContent = 'Testing…';
    result.style.color = 'var(--text-muted)';

    const test = await GitHubStorage.testConnection();
    if (test.ok) {
      result.textContent = `✓ Connected to ${ghOwner}/${ghRepo}`;
      result.style.color = 'var(--neon-green)';
      showToast('GitHub connected! Save profile to enable sync.', 'success');
    } else {
      result.textContent = `✗ ${test.error}`;
      result.style.color = 'var(--neon-magenta)';
      showToast('Connection failed: ' + test.error, 'error');
    }
    if (btn) btn.disabled = false;
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 9. POST VIEW — Edit & Delete
  // ══════════════════════════════════════════════════════════════════════════
  const postViewModal = document.getElementById('modal-post-view');

  _bindClick('btn-edit-current-post', () => {
    const id = postViewModal?.dataset.postId;
    if (!id) return;
    _closeModal('modal-post-view');
    EditorManager.open(id, PostsManager.get(id)?.type || 'devlog');
  });

  _bindClick('btn-delete-current-post', () => {
    const id   = postViewModal?.dataset.postId;
    if (!id) return;
    const post = PostsManager.get(id);
    const conf = document.getElementById('modal-confirm');
    const msg  = document.getElementById('confirm-message');
    if (conf) conf.dataset.deleteId = id;
    if (msg)  msg.textContent = `Delete "${post?.title || 'this post'}"? This cannot be undone.`;
    _openModal('modal-confirm');
  });

  _bindClick('btn-confirm-ok', async () => {
    const conf = document.getElementById('modal-confirm');
    const id   = conf?.dataset.deleteId;
    if (!id) return;
    const post = PostsManager.get(id);
    await PostsManager.remove(id);
    post?.type === 'app' ? PostsManager.renderApps() : PostsManager.renderDevlog();
    _closeModal('modal-confirm');
    _closeModal('modal-post-view');
    showToast('Post deleted.', 'info');
  });

  _bindClick('btn-confirm-cancel', () => _closeModal('modal-confirm'));

  // ══════════════════════════════════════════════════════════════════════════
  // 10. MODAL CLOSE
  // ══════════════════════════════════════════════════════════════════════════
  document.querySelectorAll('.modal-close, [data-close]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const targetId = el.getAttribute('data-close');
      if (targetId) { _closeModal(targetId); return; }
      const overlay = el.closest('.modal-overlay');
      if (overlay) _closeModal(overlay.id);
    });
  });

  // Backdrop click — only for "safe" modals (no work to lose)
  const BACKDROP_SAFE = ['modal-login', 'modal-post-view', 'modal-confirm'];
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    if (!BACKDROP_SAFE.includes(overlay.id)) return;
    overlay.addEventListener('click', e => {
      if (e.target === overlay) _closeModal(overlay.id);
    });
  });

  // Escape key
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const open = document.querySelectorAll('.modal-overlay.active');
    if (open.length) _closeModal(open[open.length - 1].id);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  function _activateAdminMode(animate = true) {
    document.body.classList.add('is-admin');
    document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
    const span = document.getElementById('login-btn-text');
    if (span) span.textContent = 'Logout';
    if (animate) {
      const header = document.getElementById('site-header');
      if (header) {
        header.style.borderBottomColor = 'var(--neon-green)';
        setTimeout(() => header.style.borderBottomColor = '', 1500);
      }
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

  function _showLoader(show) {
    let loader = document.getElementById('page-loader');
    if (!loader) {
      loader = document.createElement('div');
      loader.id = 'page-loader';
      loader.innerHTML = '<div class="loader-inner"><div class="loader-spinner"></div><span>Loading…</span></div>';
      document.body.appendChild(loader);
    }
    loader.classList.toggle('hidden', !show);
  }

});

// ════════════════════════════════════════════════════════════════════════════
// GLOBAL UTILITIES
// ════════════════════════════════════════════════════════════════════════════

function _openModal(id)  { document.getElementById(id)?.classList.add('active'); }
function _closeModal(id) { document.getElementById(id)?.classList.remove('active'); }
function openModal(id)   { _openModal(id); }
function closeModal(id)  { _closeModal(id); }

function _deactivateFromAuth() {
  document.body.classList.remove('is-admin');
  document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'));
  const span = document.getElementById('login-btn-text');
  if (span) span.textContent = 'Login';
  if (typeof PostsManager !== 'undefined') { PostsManager.renderDevlog(); PostsManager.renderApps(); }
}

function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toast.setAttribute('role', 'alert');
  container.appendChild(toast);
  requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('toast-show')));
  setTimeout(() => {
    toast.classList.remove('toast-show');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, 3500);
}
