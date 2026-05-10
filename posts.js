/**
 * posts.js — Posts Manager
 * ─────────────────────────────────────────────────────────────────────────────
 * CRUD for Dev Log posts and Published App entries.
 * Renders post/app card grids and the reading view modal.
 *
 * Storage key (localStorage):
 *   bp_posts  → JSON array of post objects
 *
 * Post data structure:
 * {
 *   id, type ('devlog'|'app'), title, content (HTML), delta (JSON string),
 *   tags[], coverImage (base64), status ('published'|'draft'),
 *   createdAt, updatedAt,
 *   appVersion?, appPlatform?, appLink?, appPrivacyUrl?, appTermsUrl?
 * }
 *
 * HTML IDs used (must match index.html):
 *   #devlog-posts-grid, #devlog-empty
 *   #apps-grid, #apps-empty
 *   #stat-posts, #stat-apps
 *   #modal-post-view, #post-view-title, #post-view-date, #post-view-tags
 *   #post-view-cover, #post-view-cover-img, #post-view-body
 *   #view-app-info, #confirm-message
 * ─────────────────────────────────────────────────────────────────────────────
 */

const PostsManager = (() => {

  const STORAGE_KEY = 'bp_posts';

  // ── Storage helpers ────────────────────────────────────────────────────────
  function _loadAll() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  function _saveAll(posts) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
  }

  // ── CRUD ───────────────────────────────────────────────────────────────────

  /**
   * getAll(type)
   * Returns posts filtered by type, newest-first.
   */
  function getAll(type) {
    const all = _loadAll();
    const filtered = type ? all.filter(p => p.type === type) : all;
    return filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  /**
   * get(id) — returns a single post or null.
   */
  function get(id) {
    return _loadAll().find(p => p.id === id) || null;
  }

  /**
   * save(post) — upserts by id.
   */
  function save(post) {
    const all = _loadAll();
    const idx = all.findIndex(p => p.id === post.id);
    idx >= 0 ? (all[idx] = post) : all.push(post);
    _saveAll(all);
    _updateStatCounts();
  }

  /**
   * remove(id) — deletes a post.
   */
  function remove(id) {
    _saveAll(_loadAll().filter(p => p.id !== id));
    _updateStatCounts();
  }

  // ── Stat badges ────────────────────────────────────────────────────────────
  function _updateStatCounts() {
    const postsCount = getAll('devlog').filter(p => p.status === 'published').length;
    const appsCount  = getAll('app').filter(p => p.status === 'published').length;
    const sp = document.getElementById('stat-posts');
    const sa = document.getElementById('stat-apps');
    if (sp) sp.textContent = postsCount;
    if (sa) sa.textContent = appsCount;
  }

  // ── Utility helpers ────────────────────────────────────────────────────────

  /** Strip HTML tags and truncate to maxLen chars. */
  function getExcerpt(html, maxLen = 160) {
    const tmp  = document.createElement('div');
    tmp.innerHTML = html || '';
    const text = (tmp.textContent || tmp.innerText || '').replace(/\s+/g, ' ').trim();
    return text.length > maxLen ? text.slice(0, maxLen).trimEnd() + '…' : text;
  }

  /** Format ISO date → "May 6, 2026". */
  function formatDate(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch { return iso; }
  }

  /** Escape for HTML text content. */
  function _esc(str) {
    return String(str || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /** Escape for href / src attribute values. */
  function _escAttr(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  // ── Render: Dev Log grid ───────────────────────────────────────────────────

  /**
   * renderDevlog()
   * Populates #devlog-posts-grid with post cards.
   * Drafts only visible when body.is-admin is set.
   */
  function renderDevlog() {
    const grid  = document.getElementById('devlog-posts-grid');
    const empty = document.getElementById('devlog-empty');
    if (!grid) return;

    const isAdmin = document.body.classList.contains('is-admin');
    const posts   = getAll('devlog').filter(p => p.status === 'published' || (isAdmin && p.status === 'draft'));

    grid.innerHTML = '';

    if (!posts.length) { if (empty) empty.classList.remove('hidden'); return; }
    if (empty) empty.classList.add('hidden');

    posts.forEach(post => grid.appendChild(_buildPostCard(post)));
    _updateStatCounts();
  }

  function _buildPostCard(post) {
    const article = document.createElement('article');
    article.className = 'post-card';
    article.dataset.id = post.id;
    article.setAttribute('role', 'button');
    article.setAttribute('tabindex', '0');
    article.setAttribute('aria-label', `Read post: ${post.title}`);

    const coverHTML = post.coverImage
      ? `<div class="post-card-cover"><img src="${post.coverImage}" alt="" loading="lazy"></div>` : '';
    const tagsHTML  = (post.tags||[]).map(t => `<span class="tag">${_esc(t)}</span>`).join('');
    const draft     = post.status === 'draft' ? '<span class="draft-badge">DRAFT</span>' : '';

    article.innerHTML = `
      ${coverHTML}
      <div class="post-card-body">
        <div class="post-card-meta">
          <span class="post-date">${formatDate(post.createdAt)}</span>${draft}
        </div>
        <h3 class="post-card-title">${_esc(post.title)}</h3>
        <p class="post-card-excerpt">${_esc(getExcerpt(post.content))}</p>
        ${tagsHTML ? `<div class="post-tags">${tagsHTML}</div>` : ''}
      </div>`;

    const open = () => openPostView(post.id);
    article.addEventListener('click', open);
    article.addEventListener('keydown', e => { if (e.key==='Enter'||e.key===' ') open(); });
    return article;
  }

  // ── Render: Apps grid ──────────────────────────────────────────────────────

  /**
   * renderApps()
   * Populates #apps-grid with app cards.
   */
  function renderApps() {
    const grid  = document.getElementById('apps-grid');
    const empty = document.getElementById('apps-empty');
    if (!grid) return;

    const isAdmin = document.body.classList.contains('is-admin');
    const apps    = getAll('app').filter(p => p.status === 'published' || (isAdmin && p.status === 'draft'));

    grid.innerHTML = '';

    if (!apps.length) { if (empty) empty.classList.remove('hidden'); return; }
    if (empty) empty.classList.add('hidden');

    apps.forEach(app => grid.appendChild(_buildAppCard(app)));
    _updateStatCounts();
  }

  function _buildAppCard(app) {
    const article = document.createElement('article');
    article.className = 'app-card';
    article.dataset.id = app.id;
    article.setAttribute('role', 'button');
    article.setAttribute('tabindex', '0');
    article.setAttribute('aria-label', `View app: ${app.title}`);

    const coverHTML = app.coverImage
      ? `<div class="app-card-cover"><img src="${app.coverImage}" alt="" loading="lazy"></div>` : '';
    const tagsHTML  = (app.tags||[]).map(t => `<span class="tag">${_esc(t)}</span>`).join('');
    const draft     = app.status==='draft' ? '<span class="draft-badge">DRAFT</span>' : '';

    const links = [];
    if (app.appLink)       links.push(`<a href="${_escAttr(app.appLink)}" target="_blank" rel="noopener" class="app-meta-link" onclick="event.stopPropagation()">↗ Download / Visit</a>`);
    if (app.appPrivacyUrl) links.push(`<a href="${_escAttr(app.appPrivacyUrl)}" target="_blank" rel="noopener" class="app-meta-link" onclick="event.stopPropagation()">Privacy Policy</a>`);
    if (app.appTermsUrl)   links.push(`<a href="${_escAttr(app.appTermsUrl)}" target="_blank" rel="noopener" class="app-meta-link" onclick="event.stopPropagation()">Terms of Use</a>`);

    article.innerHTML = `
      ${coverHTML}
      <div class="app-card-body">
        <div class="app-card-meta">
          <span class="post-date">${formatDate(app.createdAt)}</span>
          ${app.appPlatform ? `<span class="platform-badge">${_esc(app.appPlatform)}</span>` : ''}
          ${app.appVersion  ? `<span class="version-badge">v${_esc(app.appVersion)}</span>` : ''}
          ${draft}
        </div>
        <h3 class="app-card-title">${_esc(app.title)}</h3>
        <p class="app-card-excerpt">${_esc(getExcerpt(app.content))}</p>
        ${tagsHTML ? `<div class="post-tags">${tagsHTML}</div>` : ''}
        ${links.length ? `<div class="app-meta-links">${links.join('')}</div>` : ''}
      </div>`;

    const open = () => openPostView(app.id);
    article.addEventListener('click', open);
    article.addEventListener('keydown', e => { if (e.key==='Enter'||e.key===' ') open(); });
    return article;
  }

  // ── Post view modal ────────────────────────────────────────────────────────

  /**
   * openPostView(id)
   * Fills and opens #modal-post-view with the post content.
   */
  function openPostView(id) {
    const post  = get(id);
    const modal = document.getElementById('modal-post-view');
    if (!post || !modal) return;

    // Title
    const titleEl = document.getElementById('post-view-title');
    if (titleEl) titleEl.textContent = post.title;

    // Date
    const dateEl = document.getElementById('post-view-date');
    if (dateEl) {
      let dateText = formatDate(post.createdAt);
      if (post.updatedAt && post.updatedAt !== post.createdAt)
        dateText += `  ·  Updated ${formatDate(post.updatedAt)}`;
      dateEl.textContent = dateText;
    }

    // Tags
    const tagsEl = document.getElementById('post-view-tags');
    if (tagsEl) {
      tagsEl.innerHTML = (post.tags || [])
        .map(t => `<span class="tag">${_esc(t)}</span>`).join('');
    }

    // Cover image
    const coverWrap = document.getElementById('post-view-cover');
    const coverImg  = document.getElementById('post-view-cover-img');
    if (coverWrap && coverImg) {
      if (post.coverImage) {
        coverImg.src = post.coverImage;
        coverWrap.classList.remove('hidden');
      } else {
        coverWrap.classList.add('hidden');
      }
    }

    // App-specific info bar
    const appInfo = document.getElementById('view-app-info');
    if (appInfo) {
      if (post.type === 'app') {
        let html = '<div class="app-info-bar">';
        if (post.appPlatform)   html += `<span class="platform-badge">${_esc(post.appPlatform)}</span>`;
        if (post.appVersion)    html += `<span class="version-badge">v${_esc(post.appVersion)}</span>`;
        if (post.appLink)       html += `<a href="${_escAttr(post.appLink)}" target="_blank" rel="noopener" class="btn btn--primary btn--sm">↗ Download / Visit</a>`;
        if (post.appPrivacyUrl) html += `<a href="${_escAttr(post.appPrivacyUrl)}" target="_blank" rel="noopener" class="app-meta-link">Privacy Policy</a>`;
        if (post.appTermsUrl)   html += `<a href="${_escAttr(post.appTermsUrl)}" target="_blank" rel="noopener" class="app-meta-link">Terms of Use</a>`;
        html += '</div>';
        appInfo.innerHTML = html;
        appInfo.classList.remove('hidden');
      } else {
        appInfo.classList.add('hidden');
      }
    }

    // Rich content — .ql-editor class applies Quill's built-in content styles
    const bodyEl = document.getElementById('post-view-body');
    if (bodyEl) {
      bodyEl.className = 'post-body ql-editor';
      bodyEl.innerHTML = post.content || '';
    }

    // Store post id on modal for Edit / Delete buttons
    modal.dataset.postId = id;

    // Admin action bar — show only when logged in
    const adminBar = modal.querySelector('.post-view-admin');
    if (adminBar) {
      adminBar.classList.toggle('hidden', !document.body.classList.contains('is-admin'));
    }

    modal.classList.add('active');
  }

  return { getAll, get, save, remove, renderDevlog, renderApps, openPostView, getExcerpt, formatDate };

})();
