/**
 * app.js — Main Application Entry Point
 * ─────────────────────────────────────────────────────────────────────────────
 * Bootstraps the app and wires all event listeners.
 * Load order in index.html: auth.js → profile.js → editor.js → posts.js → app.js
 *
 * HTML IDs used (must match index.html exactly):
 *   Auth:     #btn-login-toggle, #login-form, #login-username, #login-password,
 *             #toggle-password
 *   Tabs:     .nav-tab[data-tab], .tab-pane[id="tab-*"]
 *   Buttons:  #btn-new-post, #btn-new-devlog, #btn-new-app,
 *             #btn-publish-post, #btn-save-draft
 *   Editor:   #post-cover-upload
 *   Effects:  .fx-btn[data-effect], #btn-remove-fx
 *   Profile:  #btn-settings, #btn-edit-profile, #profile-form,
 *             #avatar-file-upload, #pf-new-username, #pf-new-password, #pf-current-password
 *   Post view: #modal-post-view, #btn-edit-current-post, #btn-delete-current-post
 *   Confirm:  #modal-confirm, #btn-confirm-ok, #btn-confirm-cancel, #confirm-message
 *   Footer:   #footer-year
 * ─────────────────────────────────────────────────────────────────────────────
 */

document.addEventListener('DOMContentLoaded', async () => {

  // ══════════════════════════════════════════════════════════════════════════
  // 1. BOOT — initialise all managers in dependency order
  // ══════════════════════════════════════════════════════════════════════════

  await AuthManager.init();      // Write default credentials if first load
  ProfileManager.render();       // Populate the profile card from stored data
  EditorManager.init();          // Register Quill blots + create Quill instance
  PostsManager.renderDevlog();   // Render Dev Log grid
  PostsManager.renderApps();     // Render Published Apps grid

  // Auto-set footer year
  const yearEl = document.getElementById('footer-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // ══════════════════════════════════════════════════════════════════════════
  // 2. SESSION RESTORE — re-apply admin UI if user is still logged in
  //    (sessionStorage survives page refresh but clears on tab close)
  // ══════════════════════════════════════════════════════════════════════════
  if (AuthManager.isLoggedIn()) _activateAdminMode();

  // ══════════════════════════════════════════════════════════════════════════
  // 3. NAV TABS
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
  // 4. AUTH — Login / Logout
  // ══════════════════════════════════════════════════════════════════════════

  // Header button toggles between "Login" and "Logout"
  _bindClick('btn-login-toggle', () => {
    if (AuthManager.isLoggedIn()) {
      AuthManager.logout();
      _deactivateAdminMode();
      showToast('Logged out.', 'info');
    } else {
      openModal('modal-login');
    }
  });

  // Login form submit
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async e => {
      e.preventDefault();
      const username = document.getElementById('login-username')?.value || '';
      const password = document.getElementById('login-password')?.value || '';
      const result   = await AuthManager.login(username, password);
      if (result.ok) {
        _activateAdminMode();
        closeModal('modal-login');
        showToast(`Welcome back, ${AuthManager.getUsername()}!`, 'success');
        loginForm.reset();
      } else {
        showToast(result.error || 'Login failed.', 'error');
        loginForm.classList.add('shake');
        setTimeout(() => loginForm.classList.remove('shake'), 500);
      }
    });
  }

  // Password visibility toggle on the login form
  _bindClick('toggle-password', () => {
    const pwInput = document.getElementById('login-password');
    if (!pwInput) return;
    const isHidden = pwInput.type === 'password';
    pwInput.type = isHidden ? 'text' : 'password';
    const btn = document.getElementById('toggle-password');
    if (btn) btn.textContent = isHidden ? '🙈' : '👁';
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 5. NEW POST / APP BUTTONS
  // ══════════════════════════════════════════════════════════════════════════
  _bindClick('btn-new-devlog', () => EditorManager.open(null, 'devlog'));
  _bindClick('btn-new-post',   () => EditorManager.open(null, 'devlog'));
  _bindClick('btn-new-app',    () => EditorManager.open(null, 'app'));

  // ══════════════════════════════════════════════════════════════════════════
  // 6. EDITOR — Publish / Draft / Close
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
  // 7. EFFECTS TOOLBAR
  // ══════════════════════════════════════════════════════════════════════════

  // All effect buttons carry data-effect="neon-cyan" etc.
  document.querySelectorAll('.fx-btn[data-effect]').forEach(btn => {
    btn.addEventListener('click', () => EditorManager.applyEffect(btn.dataset.effect));
  });

  _bindClick('btn-remove-fx', () => EditorManager.removeEffects());

  // ══════════════════════════════════════════════════════════════════════════
  // 8. COVER IMAGE UPLOAD (inside editor)
  // ══════════════════════════════════════════════════════════════════════════
  const coverUpload = document.getElementById('post-cover-upload');
  if (coverUpload) {
    coverUpload.addEventListener('change', e => {
      const file = e.target.files?.[0];
      if (file) EditorManager.handleCoverUpload(file);
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 9. PROFILE SETTINGS
  // ══════════════════════════════════════════════════════════════════════════

  _bindClick('btn-settings',     () => ProfileManager.openEditModal());
  _bindClick('btn-edit-profile', () => ProfileManager.openEditModal());

  // Avatar file picker — show preview immediately in the form
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

  // Remove avatar button
  _bindClick('btn-remove-avatar', () => {
    const fileInput = document.getElementById('avatar-file-upload');
    const preview   = document.getElementById('profile-form-avatar-img');
    if (fileInput)  fileInput.dataset.base64 = 'REMOVE';
    if (preview)    preview.style.display = 'none';
  });

  // Profile form submit
  const profileForm = document.getElementById('profile-form');
  if (profileForm) {
    profileForm.addEventListener('submit', async e => {
      e.preventDefault();

      // Handle "remove avatar" intent
      const fileInput = document.getElementById('avatar-file-upload');
      if (fileInput?.dataset.base64 === 'REMOVE') {
        const current = ProfileManager.load();
        current.avatar = '';
        ProfileManager.save(current);
        fileInput.dataset.base64 = '';
      }

      const profileResult = ProfileManager.saveFromForm();
      if (!profileResult.ok) { showToast(profileResult.error, 'error'); return; }

      // Optional credential change — only if the user filled in the security fields
      const newUsername = (document.getElementById('pf-new-username')?.value || '').trim();
      const newPassword = (document.getElementById('pf-new-password')?.value || '').trim();
      const currentPw   = (document.getElementById('pf-current-password')?.value || '').trim();

      if (newUsername || newPassword) {
        if (!currentPw) {
          showToast('Enter your current password to change credentials.', 'error');
          return;
        }
        if (newUsername) {
          const res = await AuthManager.changeUsername(newUsername, currentPw);
          if (!res.ok) { showToast(res.error, 'error'); return; }
        }
        if (newPassword) {
          const res = await AuthManager.changePassword(newPassword, currentPw);
          if (!res.ok) { showToast(res.error, 'error'); return; }
        }
      }

      ProfileManager.render();
      closeModal('modal-profile');
      showToast('Profile updated!', 'success');

      // Clear security fields
      ['pf-new-username','pf-new-password','pf-current-password'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 10. POST VIEW — Edit & Delete from reading modal
  // ══════════════════════════════════════════════════════════════════════════

  const postViewModal = document.getElementById('modal-post-view');

  _bindClick('btn-edit-current-post', () => {
    const id = postViewModal?.dataset.postId;
    if (!id) return;
    const post = PostsManager.get(id);
    closeModal('modal-post-view');
    EditorManager.open(id, post?.type || 'devlog');
  });

  _bindClick('btn-delete-current-post', () => {
    const id = postViewModal?.dataset.postId;
    if (!id) return;
    const post    = PostsManager.get(id);
    const confirm = document.getElementById('modal-confirm');
    const msgEl   = document.getElementById('confirm-message');
    if (confirm)  confirm.dataset.deleteId = id;
    if (msgEl)    msgEl.textContent = `Delete "${post?.title || 'this post'}"? This cannot be undone.`;
    openModal('modal-confirm');
  });

  // Confirm — YES (delete)
  _bindClick('btn-confirm-ok', () => {
    const confirm = document.getElementById('modal-confirm');
    const id      = confirm?.dataset.deleteId;
    if (!id) return;
    const post = PostsManager.get(id);
    PostsManager.remove(id);
    post?.type === 'app' ? PostsManager.renderApps() : PostsManager.renderDevlog();
    closeModal('modal-confirm');
    closeModal('modal-post-view');
    showToast('Post deleted.', 'info');
  });

  // Confirm — NO (cancel)
  _bindClick('btn-confirm-cancel', () => closeModal('modal-confirm'));

  // ══════════════════════════════════════════════════════════════════════════
  // 11. MODAL CLOSE — X buttons, overlay backdrop, Escape key
  // ══════════════════════════════════════════════════════════════════════════

  // Buttons with class .modal-close or attribute data-close
  document.querySelectorAll('.modal-close, [data-close]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const modal = el.closest('.modal-overlay') || el.closest('.modal');
      if (modal) closeModal(modal.id);
      // data-close may hold an explicit modal id
      const targetId = el.getAttribute('data-close');
      if (targetId) closeModal(targetId);
    });
  });

  // Click on the dark backdrop (outside the inner .modal box)
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });

  // Escape key — close the topmost open modal
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const open = document.querySelectorAll('.modal-overlay.active');
    if (open.length) closeModal(open[open.length - 1].id);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  /** Enable admin UI: add body class, re-render grids to show drafts, update button label. */
  function _activateAdminMode() {
    document.body.classList.add('is-admin');
    const btn = document.getElementById('btn-login-toggle');
    if (btn) btn.textContent = 'Logout';
    PostsManager.renderDevlog();
    PostsManager.renderApps();
  }

  /** Disable admin UI: remove body class, re-render to hide drafts, update button label. */
  function _deactivateAdminMode() {
    document.body.classList.remove('is-admin');
    const btn = document.getElementById('btn-login-toggle');
    if (btn) btn.textContent = 'Login';
    PostsManager.renderDevlog();
    PostsManager.renderApps();
  }

  /** Shorthand: attach click listener by element id. Silently ignores missing elements. */
  function _bindClick(id, handler) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', handler);
  }

});

// ════════════════════════════════════════════════════════════════════════════
// GLOBAL UTILITIES  (accessible from any module)
// ════════════════════════════════════════════════════════════════════════════

/**
 * openModal(id) — shows a modal overlay by adding .active.
 */
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

/**
 * closeModal(id) — hides a modal overlay by removing .active.
 */
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('active');
}

/**
 * showToast(message, type)
 * Shows a brief notification at the bottom of the screen.
 *
 * @param {string} message
 * @param {'success'|'error'|'info'|'warning'} [type='info']
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
  toast.setAttribute('aria-live', 'polite');
  container.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('toast-show'));

  setTimeout(() => {
    toast.classList.remove('toast-show');
    toast.classList.add('toast-hide');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, 3000);
}
