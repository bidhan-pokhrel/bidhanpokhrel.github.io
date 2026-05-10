/**
 * app.js — Main Application Entry Point
 * ─────────────────────────────────────────────────────────────────────────────
 * Boots the app, wires all event listeners.
 * Load order: auth.js → profile.js → editor.js → posts.js → app.js
 * ─────────────────────────────────────────────────────────────────────────────
 */

document.addEventListener('DOMContentLoaded', async () => {

  // ══════════════════════════════════════════════════════════════════════════
  // 1. BOOT
  // ══════════════════════════════════════════════════════════════════════════
  await AuthManager.init();
  ProfileManager.render();
  EditorManager.init();
  PostsManager.renderDevlog();
  PostsManager.renderApps();

  const yearEl = document.getElementById('footer-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Restore session if still valid
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
      const pane = document.getElementById(`tab-${target}`);
      if (pane) pane.classList.add('active');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 3. AUTH
  // ══════════════════════════════════════════════════════════════════════════

  _bindClick('btn-login-toggle', () => {
    if (AuthManager.isLoggedIn()) {
      AuthManager.logout();
      _deactivateAdminMode();
      showToast('Logged out successfully.', 'info');
    } else {
      _openModal('modal-login');
      // Clear any previous error
      _setLoginError('');
      document.getElementById('login-username')?.focus();
    }
  });

  // Login form
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async e => {
      e.preventDefault();

      const username = (document.getElementById('login-username')?.value || '').trim();
      const password  = document.getElementById('login-password')?.value || '';
      const submitBtn = document.getElementById('btn-do-login');

      // Disable button during async operation
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
          // Shake animation
          loginForm.classList.add('shake');
          setTimeout(() => loginForm.classList.remove('shake'), 500);
          document.getElementById('login-password')?.select();
        }
      } catch (err) {
        _setLoginError('An error occurred. Please try again.');
        console.error('Login error:', err);
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  // Password visibility toggle
  _bindClick('toggle-password', () => {
    const pw  = document.getElementById('login-password');
    const btn = document.getElementById('toggle-password');
    if (!pw) return;
    const showing = pw.type === 'text';
    pw.type = showing ? 'password' : 'text';
    // Update the icon
    const icon = btn?.querySelector('i');
    if (icon) {
      icon.className = showing ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash';
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 4. NEW POST / APP BUTTONS
  // ══════════════════════════════════════════════════════════════════════════
  _bindClick('btn-new-devlog', () => EditorManager.open(null, 'devlog'));
  _bindClick('btn-new-post',   () => EditorManager.open(null, 'devlog'));
  _bindClick('btn-new-app',    () => EditorManager.open(null, 'app'));

  // ══════════════════════════════════════════════════════════════════════════
  // 5. EDITOR — Publish / Draft
  // ══════════════════════════════════════════════════════════════════════════
  _bindClick('btn-publish-post', () => {
    const result = EditorManager.save('published');
    if (!result.ok) { showToast(result.error, 'error'); return; }
    _afterSave(result.post);
    showToast('Post published! 🚀', 'success');
  });

  _bindClick('btn-save-draft', () => {
    const result = EditorManager.save('draft');
    if (!result.ok) { showToast(result.error, 'error'); return; }
    _afterSave(result.post);
    showToast('Saved as draft.', 'info');
  });

  function _afterSave(post) {
    PostsManager.save(post);
    EditorManager.close();
    post.type === 'app' ? PostsManager.renderApps() : PostsManager.renderDevlog();
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

  // Avatar upload preview
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

  // Remove avatar
  _bindClick('btn-remove-avatar', () => {
    const fi = document.getElementById('avatar-file-upload');
    const pr = document.getElementById('profile-form-avatar-img');
    if (fi) fi.dataset.base64 = 'REMOVE';
    if (pr) pr.style.display = 'none';
  });

  // Profile form submit
  const profileForm = document.getElementById('profile-form');
  if (profileForm) {
    profileForm.addEventListener('submit', async e => {
      e.preventDefault();

      // Handle avatar removal
      const fi = document.getElementById('avatar-file-upload');
      if (fi?.dataset.base64 === 'REMOVE') {
        const cur = ProfileManager.load();
        cur.avatar = '';
        ProfileManager.save(cur);
        fi.dataset.base64 = '';
      }

      const pr = ProfileManager.saveFromForm();
      if (!pr.ok) { showToast(pr.error, 'error'); return; }

      // Handle credential change if fields are filled
      const newUser = (document.getElementById('pf-new-username')?.value || '').trim();
      const newPw   = (document.getElementById('pf-new-password')?.value  || '').trim();
      const curPw   = (document.getElementById('pf-current-password')?.value || '').trim();

      if (newUser || newPw) {
        if (!curPw) {
          showToast('Enter your current password to change credentials.', 'error');
          return;
        }
        if (newUser) {
          const r = await AuthManager.changeUsername(newUser, curPw);
          if (!r.ok) { showToast(r.error, 'error'); return; }
        }
        if (newPw) {
          const r = await AuthManager.changePassword(newPw, curPw);
          if (!r.ok) { showToast(r.error, 'error'); return; }
        }
      }

      ProfileManager.render();
      _closeModal('modal-profile');
      showToast('Profile updated!', 'success');

      // Clear security fields
      ['pf-new-username','pf-new-password','pf-current-password'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 9. POST VIEW — Edit & Delete
  // ══════════════════════════════════════════════════════════════════════════
  const postViewModal = document.getElementById('modal-post-view');

  _bindClick('btn-edit-current-post', () => {
    const id = postViewModal?.dataset.postId;
    if (!id) return;
    const post = PostsManager.get(id);
    _closeModal('modal-post-view');
    EditorManager.open(id, post?.type || 'devlog');
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

  _bindClick('btn-confirm-ok', () => {
    const conf = document.getElementById('modal-confirm');
    const id   = conf?.dataset.deleteId;
    if (!id) return;
    const post = PostsManager.get(id);
    PostsManager.remove(id);
    post?.type === 'app' ? PostsManager.renderApps() : PostsManager.renderDevlog();
    _closeModal('modal-confirm');
    _closeModal('modal-post-view');
    showToast('Post deleted.', 'info');
  });

  _bindClick('btn-confirm-cancel', () => _closeModal('modal-confirm'));

  // ══════════════════════════════════════════════════════════════════════════
  // 10. MODAL CLOSE HANDLERS
  // ══════════════════════════════════════════════════════════════════════════

  // .modal-close buttons and [data-close] cancel buttons
  document.querySelectorAll('.modal-close, [data-close]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      // data-close value is the explicit modal id to close
      const targetId = el.getAttribute('data-close');
      if (targetId) { _closeModal(targetId); return; }
      // fallback: find the nearest modal-overlay
      const overlay = el.closest('.modal-overlay');
      if (overlay) _closeModal(overlay.id);
    });
  });

  // Click on backdrop (dark area around the modal box)
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
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
  // PRIVATE HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * _activateAdminMode(animate)
   * Adds body.is-admin, explicitly removes 'hidden' from admin-only elements,
   * re-renders grids (so drafts appear), and updates the login button label.
   */
  function _activateAdminMode(animate = true) {
    document.body.classList.add('is-admin');

    // Explicitly show every admin-only element (belt + suspenders over CSS)
    document.querySelectorAll('.admin-only').forEach(el => {
      el.classList.remove('hidden');
    });

    const btn = document.getElementById('btn-login-toggle');
    const loginSpan = document.getElementById('login-btn-text');
    if (loginSpan) loginSpan.textContent = 'Logout';

    if (animate) {
      // Brief green flash on the header to signal login success
      const header = document.getElementById('site-header');
      if (header) {
        header.style.borderBottomColor = 'var(--neon-green)';
        setTimeout(() => header.style.borderBottomColor = '', 1500);
      }
    }

    PostsManager.renderDevlog();
    PostsManager.renderApps();
  }

  /**
   * _deactivateAdminMode()
   * Removes body.is-admin, explicitly re-hides admin-only elements.
   */
  function _deactivateAdminMode() {
    document.body.classList.remove('is-admin');

    document.querySelectorAll('.admin-only').forEach(el => {
      el.classList.add('hidden');
    });

    const btn = document.getElementById('btn-login-toggle');
    const loginSpan2 = document.getElementById('login-btn-text');
    if (loginSpan2) loginSpan2.textContent = 'Login';

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
    if (msg) {
      if (msgEl) msgEl.textContent = msg;
      errEl.classList.remove('hidden');
    } else {
      errEl.classList.add('hidden');
    }
  }

});

// ════════════════════════════════════════════════════════════════════════════
// GLOBAL UTILITIES
// ════════════════════════════════════════════════════════════════════════════

function _openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function _closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('active');
}

// Aliases used by editor.js / posts.js
function openModal(id)  { _openModal(id); }
function closeModal(id) { _closeModal(id); }

/**
 * showToast(message, type)
 * Brief notification at the bottom-right of the screen.
 */
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

  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('toast-show'));
  });

  setTimeout(() => {
    toast.classList.remove('toast-show');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, 3500);
}
