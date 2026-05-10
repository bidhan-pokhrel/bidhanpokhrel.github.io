/**
 * editor.js — Editor Manager
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages the Quill rich-text editor inside #modal-editor.
 *
 * HTML IDs used (must match index.html exactly):
 *   #quill-editor, #quill-toolbar, #modal-editor, #modal-editor-title
 *   #editing-post-id, #editing-post-type, #editor-app-fields
 *   #post-title, #post-tags
 *   #post-cover-upload, #cover-preview, #cover-preview-wrap
 *   #app-version, #app-platform, #app-link, #app-privacy-url, #app-terms-url
 * ─────────────────────────────────────────────────────────────────────────────
 */

const EditorManager = (() => {

  // Effect names — each maps to an fx-{name} CSS class in effects.css
  const EFFECT_NAMES = [
    'neon-cyan','neon-magenta','neon-green','neon-blue','neon-orange',
    'gradient-fire','gradient-ocean','gradient-aurora','gradient-cyber',
    'glitch','pulse','rainbow','float',
    'highlight-cyber','text-shadow-hard','code-inline',
  ];

  let quill          = null;
  let _editingPostId = null;
  let _editingType   = 'devlog';
  let _coverBase64   = '';

  // ── 1. Register custom Quill blots (must run before new Quill()) ──────────
  function _registerBlots() {
    if (typeof Quill === 'undefined') {
      console.error('EditorManager: Quill not loaded.');
      return;
    }
    const Inline = Quill.import('blots/inline');
    EFFECT_NAMES.forEach(name => {
      const key = `fx-${name}`;
      class EffectBlot extends Inline {}
      EffectBlot.blotName  = key;
      EffectBlot.tagName   = 'span';
      EffectBlot.className = key;
      try { Quill.register(EffectBlot, true); } catch (_) {}
    });
  }

  // ── 2. Initialise Quill ───────────────────────────────────────────────────
  function init() {
    _registerBlots();
    if (typeof Quill === 'undefined') return null;
    quill = new Quill('#quill-editor', {
      theme: 'snow',
      modules: { toolbar: '#quill-toolbar' },
      placeholder: 'Start writing your post here…',
    });
    return quill;
  }

  // ── 3. Open modal ─────────────────────────────────────────────────────────
  function open(postId, type) {
    _editingPostId = postId || null;
    _editingType   = type   || 'devlog';
    _coverBase64   = '';

    const titleInput   = document.getElementById('post-title');
    const tagsInput    = document.getElementById('post-tags');
    const coverInput   = document.getElementById('post-cover-upload');
    const coverPreview = document.getElementById('cover-preview');
    const coverWrap    = document.getElementById('cover-preview-wrap');
    const hiddenId     = document.getElementById('editing-post-id');
    const hiddenType   = document.getElementById('editing-post-type');

    if (titleInput)   titleInput.value = '';
    if (tagsInput)    tagsInput.value  = '';
    if (coverInput)   coverInput.value = '';
    if (coverPreview) coverPreview.src = '';
    if (coverWrap)    coverWrap.classList.add('hidden');
    if (hiddenId)     hiddenId.value   = '';
    if (hiddenType)   hiddenType.value = _editingType;

    if (quill) { quill.setContents([]); quill.history.clear(); }

    const appFields = document.getElementById('editor-app-fields');
    if (appFields) appFields.classList.toggle('hidden', _editingType !== 'app');

    ['app-version','app-platform','app-link','app-privacy-url','app-terms-url']
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

    const modalTitle = document.getElementById('modal-editor-title');
    if (modalTitle) {
      modalTitle.textContent = postId
        ? (_editingType === 'app' ? 'Edit App'  : 'Edit Post')
        : (_editingType === 'app' ? 'New App'   : 'New Post');
    }

    // Populate fields when editing an existing post
    if (postId && typeof PostsManager !== 'undefined') {
      const post = PostsManager.get(postId);
      if (post) {
        if (titleInput)  titleInput.value = post.title || '';
        if (tagsInput)   tagsInput.value  = (post.tags || []).join(', ');
        if (hiddenId)    hiddenId.value   = post.id;
        if (hiddenType)  hiddenType.value = post.type;
        _editingType = post.type;

        if (quill && post.delta) {
          try { quill.setContents(JSON.parse(post.delta)); }
          catch { if (post.content) quill.clipboard.dangerouslyPasteHTML(post.content); }
        }

        if (post.coverImage) {
          _coverBase64 = post.coverImage;
          if (coverPreview) coverPreview.src = post.coverImage;
          if (coverWrap)    coverWrap.classList.remove('hidden');
        }

        if (_editingType === 'app') {
          const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
          set('app-version', post.appVersion);
          set('app-platform', post.appPlatform);
          set('app-link', post.appLink);
          set('app-privacy-url', post.appPrivacyUrl);
          set('app-terms-url', post.appTermsUrl);
          if (appFields) appFields.classList.remove('hidden');
        }
      }
    }

    const modal = document.getElementById('modal-editor');
    if (modal) modal.classList.add('active');
    if (titleInput) setTimeout(() => titleInput.focus(), 100);
  }

  // ── 4. Close modal ────────────────────────────────────────────────────────
  function close() {
    const modal = document.getElementById('modal-editor');
    if (modal) modal.classList.remove('active');
    _editingPostId = null;
    _coverBase64   = '';
  }

  // ── 5. Apply / remove effects ─────────────────────────────────────────────
  function applyEffect(effectName) {
    if (!quill) return;
    const range = quill.getSelection();
    if (!range || range.length === 0) {
      if (typeof showToast === 'function') showToast('Select some text first!', 'warning');
      return;
    }
    quill.format(`fx-${effectName}`, true);
  }

  function removeEffects() {
    if (!quill) return;
    const range = quill.getSelection();
    if (!range || range.length === 0) {
      if (typeof showToast === 'function') showToast('Select some text first!', 'warning');
      return;
    }
    EFFECT_NAMES.forEach(name => quill.format(`fx-${name}`, false));
  }

  // ── 6. Collect form data and return a post object ─────────────────────────
  /**
   * save(status)
   * Returns { ok: true, post } or { ok: false, error }.
   * Does NOT persist — app.js calls PostsManager.save(post).
   */
  function save(status) {
    const titleInput = document.getElementById('post-title');
    const tagsInput  = document.getElementById('post-tags');
    const title      = (titleInput?.value || '').trim();

    if (!title)  return { ok: false, error: 'Please enter a title.' };
    if (!quill)  return { ok: false, error: 'Editor not initialised.' };

    const delta     = quill.getContents();
    const content   = quill.root.innerHTML;
    const plainText = quill.getText().trim();
    if (!plainText) return { ok: false, error: 'Post content cannot be empty.' };

    const tags = (tagsInput?.value || '').split(',').map(t => t.trim()).filter(Boolean);

    const hiddenId   = document.getElementById('editing-post-id');
    const existingId = hiddenId?.value || null;
    const now        = new Date().toISOString();

    const post = {
      id        : existingId || `post_${Date.now()}`,
      type      : _editingType,
      title,
      content,
      delta     : JSON.stringify(delta),
      tags,
      coverImage: _coverBase64 || '',
      status    : status || 'published',
      createdAt : existingId ? (PostsManager?.get(existingId)?.createdAt || now) : now,
      updatedAt : now,
    };

    if (_editingType === 'app') {
      const v = id => (document.getElementById(id)?.value || '').trim();
      post.appVersion    = v('app-version');
      post.appPlatform   = v('app-platform');
      post.appLink       = v('app-link');
      post.appPrivacyUrl = v('app-privacy-url');
      post.appTermsUrl   = v('app-terms-url');
    }

    return { ok: true, post };
  }

  // ── Cover image upload ────────────────────────────────────────────────────
  function handleCoverUpload(file) {
    if (!file || !file.type.startsWith('image/')) {
      if (typeof showToast === 'function') showToast('Please select an image file.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      _coverBase64 = e.target.result;
      const preview = document.getElementById('cover-preview');
      const wrap    = document.getElementById('cover-preview-wrap');
      if (preview) preview.src = _coverBase64;
      if (wrap)    wrap.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
  }

  function getQuill() { return quill; }

  return { init, open, close, applyEffect, removeEffects, save, handleCoverUpload, getQuill };

})();
