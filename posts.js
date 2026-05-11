/**
 * posts.js — Posts Manager (with GitHub sync)
 * ─────────────────────────────────────────────────────────────────────────────
 * Data flow:
 *   On init: GitHub → memory cache → localStorage (backup)
 *   On save: memory cache → GitHub → localStorage (backup)
 *   Offline / no GitHub: memory cache → localStorage only
 *
 * Storage key (localStorage backup):  bp_posts
 * GitHub file:                         data/posts.json
 * ─────────────────────────────────────────────────────────────────────────────
 */

const PostsManager = (() => {

  const LOCAL_KEY = 'bp_posts';
  const GH_PATH   = 'data/posts.json';

  let _cache = [];   // in-memory working copy

  // ── Local storage helpers ──────────────────────────────────────────────────
  function _loadLocal() {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY)) || []; }
    catch { return []; }
  }
  function _saveLocal(posts) {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(posts));
  }

  // ── Initialise (async) ─────────────────────────────────────────────────────
  /**
   * init()
   * Loads posts from GitHub if configured, otherwise from localStorage.
   * Must be awaited before rendering.
   */
  async function init() {
    if (GitHubStorage.isConfigured()) {
      try {
        const { data } = await GitHubStorage.readJSON(GH_PATH);
        _cache = Array.isArray(data) ? data : [];
        _saveLocal(_cache);          // keep localStorage as a fresh backup
        return;
      } catch (e) {
        console.warn('PostsManager: GitHub load failed, falling back to localStorage.', e.message);
      }
    }
    _cache = _loadLocal();
  }

  /**
   * refresh()
   * Re-fetches from GitHub (used after publishing to confirm the write).
   */
  async function refresh() {
    if (!GitHubStorage.isConfigured()) return;
    try {
      const { data } = await GitHubStorage.readJSON(GH_PATH);
      if (Array.isArray(data)) { _cache = data; _saveLocal(_cache); }
    } catch (_) {}
  }

  // ── CRUD ───────────────────────────────────────────────────────────────────

  function getAll(type) {
    const filtered = type ? _cache.filter(p => p.type === type) : _cache;
    return [...filtered].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  function get(id) {
    return _cache.find(p => p.id === id) || null;
  }

  /**
   * save(post)
   * Upserts a post, writes to GitHub (if configured), keeps localStorage in sync.
   * @returns {Promise<void>}
   */
  async function save(post) {
    const idx = _cache.findIndex(p => p.id === post.id);
    idx >= 0 ? (_cache[idx] = post) : _cache.push(post);
    _saveLocal(_cache);

    if (GitHubStorage.isConfigured()) {
      try {
        const verb = post.status === 'published' ? 'Publish' : 'Draft';
        await GitHubStorage.writeJSON(GH_PATH, _cache, `${verb}: ${post.title}`);
      } catch (e) {
        if (typeof showToast === 'function')
          showToast('Saved locally. GitHub sync failed: ' + e.message, 'warning');
        return;
      }
    }
    _updateStatCounts();
  }

  /**
   * remove(id)
   * Deletes a post and syncs.
   */
  async function remove(id) {
    const post = get(id);
    _cache = _cache.filter(p => p.id !== id);
    _saveLocal(_cache);

    if (GitHubStorage.isConfigured()) {
      try {
        await GitHubStorage.writeJSON(GH_PATH, _cache, `Delete: ${post?.title || id}`);
      } catch (e) {
        if (typeof showToast === 'function')
          showToast('Deleted locally. GitHub sync failed: ' + e.message, 'warning');
      }
    }
    _updateStatCounts();
  }

  // ── Stat counts ────────────────────────────────────────────────────────────
  function _updateStatCounts() {
    const sp = document.getElementById('stat-posts');
    const sa = document.getElementById('stat-apps');
    if (sp) sp.textContent = getAll('devlog').filter(p => p.status === 'published').length;
    if (sa) sa.textContent = getAll('app').filter(p => p.status === 'published').length;
  }

  // ── Utilities ──────────────────────────────────────────────────────────────
  function getExcerpt(html, max = 160) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html || '';
    const t = (tmp.textContent || '').replace(/\s+/g, ' ').trim();
    return t.length > max ? t.slice(0, max).trimEnd() + '…' : t;
  }

  function formatDate(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' }); }
    catch { return iso; }
  }

  function _esc(s)     { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function _escA(s)    { return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

  // ── Render: Dev Log ────────────────────────────────────────────────────────
  function renderDevlog() {
    const grid  = document.getElementById('devlog-posts-grid');
    const empty = document.getElementById('devlog-empty');
    if (!grid) return;

    const isAdmin = document.body.classList.contains('is-admin');
    const posts   = getAll('devlog').filter(p => p.status==='published' || (isAdmin && p.status==='draft'));

    grid.innerHTML = '';
    if (!posts.length) { if (empty) empty.classList.remove('hidden'); return; }
    if (empty) empty.classList.add('hidden');
    posts.forEach(p => grid.appendChild(_postCard(p)));
    _updateStatCounts();
  }

  function _postCard(post) {
    const el = document.createElement('article');
    el.className = 'post-card';
    el.dataset.id = post.id;
    el.setAttribute('role','button'); el.setAttribute('tabindex','0');

    el.innerHTML = `
      ${post.coverImage ? `<div class="post-card-cover"><img src="${post.coverImage}" alt="" loading="lazy"></div>` : ''}
      <div class="post-card-body">
        <div class="post-card-meta">
          <span class="post-date">${formatDate(post.createdAt)}</span>
          ${post.status==='draft' ? '<span class="draft-badge">DRAFT</span>' : ''}
        </div>
        <h3 class="post-card-title">${_esc(post.title)}</h3>
        <p class="post-card-excerpt">${_esc(getExcerpt(post.content))}</p>
        ${(post.tags||[]).length ? `<div class="post-tags">${(post.tags||[]).map(t=>`<span class="tag">${_esc(t)}</span>`).join('')}</div>` : ''}
      </div>`;

    const open = () => openPostView(post.id);
    el.addEventListener('click', open);
    el.addEventListener('keydown', e => { if (e.key==='Enter'||e.key===' ') open(); });
    return el;
  }

  // ── Render: Apps ──────────────────────────────────────────────────────────
  function renderApps() {
    const grid  = document.getElementById('apps-grid');
    const empty = document.getElementById('apps-empty');
    if (!grid) return;

    const isAdmin = document.body.classList.contains('is-admin');
    const apps    = getAll('app').filter(p => p.status==='published' || (isAdmin && p.status==='draft'));

    grid.innerHTML = '';
    if (!apps.length) { if (empty) empty.classList.remove('hidden'); return; }
    if (empty) empty.classList.add('hidden');
    apps.forEach(a => grid.appendChild(_appCard(a)));
    _updateStatCounts();
  }

  function _appCard(app) {
    const el = document.createElement('article');
    el.className = 'app-card';
    el.dataset.id = app.id;
    el.setAttribute('role','button'); el.setAttribute('tabindex','0');

    const links = [
      app.appLink       && `<a href="${_escA(app.appLink)}" target="_blank" rel="noopener" class="app-meta-link" onclick="event.stopPropagation()">↗ Download / Visit</a>`,
      app.appPrivacyUrl && `<a href="${_escA(app.appPrivacyUrl)}" target="_blank" rel="noopener" class="app-meta-link" onclick="event.stopPropagation()">Privacy Policy</a>`,
      app.appTermsUrl   && `<a href="${_escA(app.appTermsUrl)}" target="_blank" rel="noopener" class="app-meta-link" onclick="event.stopPropagation()">Terms of Use</a>`,
    ].filter(Boolean);

    el.innerHTML = `
      ${app.coverImage ? `<div class="app-card-cover"><img src="${app.coverImage}" alt="" loading="lazy"></div>` : ''}
      <div class="app-card-body">
        <div class="app-card-meta">
          <span class="post-date">${formatDate(app.createdAt)}</span>
          ${app.appPlatform ? `<span class="platform-badge">${_esc(app.appPlatform)}</span>` : ''}
          ${app.appVersion  ? `<span class="version-badge">v${_esc(app.appVersion)}</span>` : ''}
          ${app.status==='draft' ? '<span class="draft-badge">DRAFT</span>' : ''}
        </div>
        <h3 class="app-card-title">${_esc(app.title)}</h3>
        <p class="app-card-excerpt">${_esc(getExcerpt(app.content))}</p>
        ${(app.tags||[]).length ? `<div class="post-tags">${(app.tags||[]).map(t=>`<span class="tag">${_esc(t)}</span>`).join('')}</div>` : ''}
        ${links.length ? `<div class="app-meta-links">${links.join('')}</div>` : ''}
      </div>`;

    const open = () => openPostView(app.id);
    el.addEventListener('click', open);
    el.addEventListener('keydown', e => { if (e.key==='Enter'||e.key===' ') open(); });
    return el;
  }

  // ── Post view modal ────────────────────────────────────────────────────────
  function openPostView(id) {
    const post  = get(id);
    const modal = document.getElementById('modal-post-view');
    if (!post || !modal) return;

    const setText = (elId, val) => { const el = document.getElementById(elId); if (el) el.textContent = val || ''; };
    setText('post-view-title', post.title);
    setText('post-view-date',  formatDate(post.createdAt) + (post.updatedAt && post.updatedAt!==post.createdAt ? '  ·  Updated ' + formatDate(post.updatedAt) : ''));

    const tagsEl = document.getElementById('post-view-tags');
    if (tagsEl) tagsEl.innerHTML = (post.tags||[]).map(t=>`<span class="tag">${_esc(t)}</span>`).join('');

    const coverWrap = document.getElementById('post-view-cover');
    const coverImg  = document.getElementById('post-view-cover-img');
    if (coverWrap && coverImg) {
      if (post.coverImage) { coverImg.src = post.coverImage; coverWrap.classList.remove('hidden'); }
      else coverWrap.classList.add('hidden');
    }

    const appInfo = document.getElementById('view-app-info');
    if (appInfo) {
      if (post.type === 'app') {
        let h = '<div class="app-info-bar">';
        if (post.appPlatform)   h += `<span class="platform-badge">${_esc(post.appPlatform)}</span>`;
        if (post.appVersion)    h += `<span class="version-badge">v${_esc(post.appVersion)}</span>`;
        if (post.appLink)       h += `<a href="${_escA(post.appLink)}" target="_blank" rel="noopener" class="btn btn--primary btn--sm">↗ Visit / Download</a>`;
        if (post.appPrivacyUrl) h += `<a href="${_escA(post.appPrivacyUrl)}" target="_blank" rel="noopener" class="app-meta-link">Privacy Policy</a>`;
        if (post.appTermsUrl)   h += `<a href="${_escA(post.appTermsUrl)}" target="_blank" rel="noopener" class="app-meta-link">Terms of Use</a>`;
        h += '</div>';
        appInfo.innerHTML = h; appInfo.classList.remove('hidden');
      } else {
        appInfo.classList.add('hidden');
      }
    }

    const bodyEl = document.getElementById('post-view-body');
    if (bodyEl) { bodyEl.className = 'post-body ql-editor'; bodyEl.innerHTML = post.content || ''; }

    modal.dataset.postId = id;

    const adminBar = modal.querySelector('.post-view-admin');
    if (adminBar) adminBar.classList.toggle('hidden', !document.body.classList.contains('is-admin'));

    const tagEl = document.getElementById('post-view-tag');
    if (tagEl) tagEl.textContent = post.type === 'app' ? '// PUBLISHED_APP' : '// DEV_LOG';

    modal.classList.add('active');
  }

  return {
    init, refresh,
    getAll, get, save, remove,
    renderDevlog, renderApps,
    openPostView, getExcerpt, formatDate,
  };

})();
