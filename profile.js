/**
 * profile.js — Profile Manager (with GitHub sync)
 * ─────────────────────────────────────────────────────────────────────────────
 * GitHub file: data/profile.json
 * localStorage backup: bp_profile
 * ─────────────────────────────────────────────────────────────────────────────
 */

const ProfileManager = (() => {

  const LOCAL_KEY = 'bp_profile';
  const GH_PATH   = 'data/profile.json';

  const DEFAULTS = {
    name        : 'Bidhan Pokhrel',
    role        : 'Data & AI Engineer · Solo Developer',
    bio         : 'Building intelligent systems and shipping production-grade AI products from Dubai. Passionate about turning raw data into real-world impact — one model at a time.',
    location    : 'Dubai, UAE',
    origin      : 'Built in Nepal 🇳🇵',
    experience  : '5+ Years Experience',
    status      : 'Available for Projects',
    statusActive: true,
    tagline     : 'Crafting the future, one commit at a time.',
    github      : 'https://github.com/bidhanpokhrel',
    linkedin    : 'https://linkedin.com/in/bidhanpokhrel',
    twitter     : 'https://twitter.com/bidhanpokhrel',
    email       : 'mailto:bidhan@example.com',
    website     : '',
    avatar      : '',
    skills      : ['Python','Machine Learning','Deep Learning','NLP','LLMs','LangChain',
                   'Vector DBs','FastAPI','Docker','Kubernetes','PostgreSQL','MongoDB',
                   'React','TypeScript','Git','Azure','AWS'],
  };

  function _merge(saved) { return Object.assign({}, DEFAULTS, saved || {}); }

  // ── Init (async) ───────────────────────────────────────────────────────────
  async function init() {
    if (GitHubStorage.isConfigured()) {
      try {
        const { data } = await GitHubStorage.readJSON(GH_PATH);
        if (data) {
          localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
          return;
        }
      } catch (e) {
        console.warn('ProfileManager: GitHub load failed, using localStorage.', e.message);
      }
    }
    // fall through to localStorage (already loaded via load())
  }

  function load() {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      return _merge(raw ? JSON.parse(raw) : null);
    } catch { return _merge(null); }
  }

  async function save(data) {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
    if (GitHubStorage.isConfigured()) {
      try {
        await GitHubStorage.writeJSON(GH_PATH, data, 'Update profile');
      } catch (e) {
        if (typeof showToast === 'function')
          showToast('Saved locally. GitHub sync failed: ' + e.message, 'warning');
      }
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  function render() {
    const p = load();
    const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v || ''; };

    setText('profile-name',       p.name);
    setText('profile-role-text',  p.role);
    setText('profile-bio',        p.bio);
    setText('profile-location',   p.location);
    setText('profile-origin',     p.origin);
    setText('profile-experience', p.experience);
    setText('profile-status',     p.status);
    setText('footer-tagline',     p.tagline);
    document.title = `${p.name} — Developer Portfolio`;

    const badge = document.querySelector('.status-badge') || document.getElementById('profile-status-badge');
    if (badge) badge.classList.toggle('inactive', !p.statusActive);

    const avatarImg      = document.getElementById('profile-avatar-img');
    const avatarFallback = document.getElementById('avatar-fallback');
    const avatarInitials = document.getElementById('avatar-initials');
    if (p.avatar) {
      if (avatarImg)      { avatarImg.src = p.avatar; avatarImg.style.display = ''; }
      if (avatarFallback) avatarFallback.style.display = 'none';
    } else {
      if (avatarImg)      avatarImg.style.display = 'none';
      if (avatarFallback) avatarFallback.style.display = '';
      if (avatarInitials) {
        const parts = (p.name||'BP').trim().split(/\s+/);
        avatarInitials.textContent = parts.length >= 2
          ? parts[0][0].toUpperCase() + parts[parts.length-1][0].toUpperCase()
          : parts[0].slice(0,2).toUpperCase();
      }
    }

    ['github','linkedin','twitter','email','website'].forEach(key => {
      const el = document.getElementById(`social-${key}`);
      if (!el) return;
      if (p[key]) { el.href = p[key]; el.classList.remove('hidden'); }
      else el.classList.add('hidden');
    });

    renderSkillsMarquee(p.skills || []);
    const ss = document.getElementById('stat-skills');
    if (ss) ss.textContent = (p.skills||[]).length;
  }

  function renderSkillsMarquee(skills) {
    document.querySelectorAll('.marquee-content').forEach(c => {
      c.innerHTML = skills.map(s => `<span class="skill-pill">${s}</span>`).join('');
    });
  }

  function openEditModal() {
    const p = load();
    const c = GitHubStorage.getConfig();
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };

    setVal('pf-name',       p.name);
    setVal('pf-role',       p.role);
    setVal('pf-bio',        p.bio);
    setVal('pf-location',   p.location);
    setVal('pf-origin',     p.origin);
    setVal('pf-experience', p.experience);
    setVal('pf-status',     p.status);
    setVal('pf-tagline',    p.tagline);
    setVal('pf-github',     p.github);
    setVal('pf-linkedin',   p.linkedin);
    setVal('pf-twitter',    p.twitter);
    setVal('pf-email',      p.email.replace('mailto:',''));
    setVal('pf-website',    p.website);
    setVal('pf-skills',     (p.skills||[]).join(', '));

    const toggle = document.getElementById('pf-status-active');
    if (toggle) toggle.checked = !!p.statusActive;

    const preview = document.getElementById('profile-form-avatar-img');
    if (preview) {
      if (p.avatar) { preview.src = p.avatar; preview.style.display = ''; }
      else            preview.style.display = 'none';
    }
    const fi = document.getElementById('avatar-file-upload');
    if (fi) fi.dataset.base64 = '';

    // Pre-fill GitHub config fields
    setVal('gh-owner',  c.owner);
    setVal('gh-repo',   c.repo);
    setVal('gh-token',  c.token);
    setVal('gh-branch', c.branch || 'main');

    // Show sync status
    _updateSyncStatus();

    document.getElementById('modal-profile')?.classList.add('active');
  }

  function _updateSyncStatus() {
    const el = document.getElementById('gh-sync-status');
    if (!el) return;
    if (GitHubStorage.isConfigured()) {
      const { owner, repo } = GitHubStorage.getConfig();
      el.innerHTML = `<span class="sync-ok">✓ Synced to <strong>${owner}/${repo}</strong></span>`;
    } else {
      el.innerHTML = `<span class="sync-off">○ Not configured — posts only visible in this browser</span>`;
    }
  }

  async function saveFromForm() {
    const getVal = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
    const name = getVal('pf-name');
    if (!name) return { ok: false, error: 'Name is required.' };

    const skills = getVal('pf-skills').split(',').map(s=>s.trim()).filter(Boolean);
    let email = getVal('pf-email');
    if (email && !email.startsWith('mailto:')) email = `mailto:${email}`;
    const toggle = document.getElementById('pf-status-active');

    const profileData = {
      name, role: getVal('pf-role'), bio: getVal('pf-bio'),
      location: getVal('pf-location'), origin: getVal('pf-origin'),
      experience: getVal('pf-experience'), status: getVal('pf-status'),
      tagline: getVal('pf-tagline'), github: getVal('pf-github'),
      linkedin: getVal('pf-linkedin'), twitter: getVal('pf-twitter'),
      email, website: getVal('pf-website'), skills,
      statusActive: toggle ? toggle.checked : true,
      avatar: load().avatar,
    };

    const fi = document.getElementById('avatar-file-upload');
    if (fi?.dataset.base64 && fi.dataset.base64 !== 'REMOVE') {
      profileData.avatar = fi.dataset.base64;
    } else if (fi?.dataset.base64 === 'REMOVE') {
      profileData.avatar = '';
    }

    await save(profileData);
    return { ok: true };
  }

  return { init, load, save, render, renderSkillsMarquee, openEditModal, saveFromForm };

})();
