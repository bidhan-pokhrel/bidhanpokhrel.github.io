/**
 * profile.js — Profile Manager
 * ─────────────────────────────────────────────────────────────────────────────
 * Loads, saves, renders, and edits the developer profile.
 *
 * Storage key (localStorage):
 *   bp_profile → JSON profile object
 *
 * HTML IDs used (must match index.html exactly):
 *   Profile card:   #profile-name, #profile-role-text, #profile-bio,
 *                   #profile-location, #profile-origin, #profile-experience,
 *                   #profile-status, #profile-avatar-img (img), #avatar-initials,
 *                   #avatar-fallback, #social-github/linkedin/twitter/email/website,
 *                   #footer-tagline, #stat-skills
 *   Marquee:        .marquee-content  (both copies inside .marquee-track)
 *   Form fields:    #pf-name, #pf-role, #pf-bio, #pf-location, #pf-origin,
 *                   #pf-experience, #pf-status, #pf-status-active, #pf-tagline,
 *                   #pf-github, #pf-linkedin, #pf-twitter, #pf-email, #pf-website,
 *                   #pf-skills, #pf-new-username, #pf-new-password, #pf-current-password
 *   Avatar upload:  #avatar-file-upload, #profile-form-avatar-img
 * ─────────────────────────────────────────────────────────────────────────────
 */

const ProfileManager = (() => {

  const STORAGE_KEY = 'bp_profile';

  // ── Built-in defaults (edit these for a hard-coded reset) ─────────────────
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
    skills      : [
      'Python','Machine Learning','Deep Learning','NLP','LLMs','LangChain',
      'Vector DBs','FastAPI','Docker','Kubernetes','PostgreSQL','MongoDB',
      'React','TypeScript','Git','Azure','AWS',
    ],
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  function _merge(saved) { return Object.assign({}, DEFAULTS, saved || {}); }

  // ── Public API ─────────────────────────────────────────────────────────────

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return _merge(raw ? JSON.parse(raw) : null);
    } catch { return _merge(null); }
  }

  function save(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  /**
   * render()
   * Updates all profile DOM elements from the current stored profile.
   * Safe to call multiple times.
   */
  function render() {
    const p = load();

    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || ''; };

    setText('profile-name',       p.name);
    setText('profile-role-text',  p.role);
    setText('profile-bio',        p.bio);
    setText('profile-location',   p.location);
    setText('profile-origin',     p.origin);
    setText('profile-experience', p.experience);
    setText('profile-status',     p.status);
    setText('footer-tagline',     p.tagline);

    document.title = `${p.name} — Developer Portfolio`;

    // Status dot
    const badge = document.getElementById('profile-status-badge') ||
                  document.querySelector('.status-badge');
    if (badge) badge.classList.toggle('inactive', !p.statusActive);

    // Avatar
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
        const parts    = (p.name || 'BP').trim().split(/\s+/);
        const initials = parts.length >= 2
          ? parts[0][0].toUpperCase() + parts[parts.length-1][0].toUpperCase()
          : parts[0].slice(0,2).toUpperCase();
        avatarInitials.textContent = initials;
      }
    }

    // Social links
    ['github','linkedin','twitter','email','website'].forEach(key => {
      const el = document.getElementById(`social-${key}`);
      if (!el) return;
      if (p[key]) { el.href = p[key]; el.classList.remove('hidden'); }
      else          el.classList.add('hidden');
    });

    // Skills marquee + stat count
    renderSkillsMarquee(p.skills || []);
    const skillStat = document.getElementById('stat-skills');
    if (skillStat) skillStat.textContent = (p.skills || []).length;
  }

  /**
   * renderSkillsMarquee(skills)
   * Injects .skill-pill elements into every .marquee-content div
   * (there are two copies inside .marquee-track for the seamless loop).
   */
  function renderSkillsMarquee(skills) {
    const containers = document.querySelectorAll('.marquee-content');
    if (!containers.length) return;
    const html = skills.map(s => `<span class="skill-pill">${s}</span>`).join('');
    containers.forEach(c => { c.innerHTML = html; });
  }

  /**
   * openEditModal()
   * Populates the profile settings form with current data and shows the modal.
   */
  function openEditModal() {
    const p = load();
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };

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

    // Avatar preview in form
    const preview = document.getElementById('profile-form-avatar-img');
    if (preview) {
      if (p.avatar) { preview.src = p.avatar; preview.style.display = ''; }
      else            preview.style.display = 'none';
    }

    // Clear the file input's stored base64 from any previous session
    const fileInput = document.getElementById('avatar-file-upload');
    if (fileInput) fileInput.dataset.base64 = '';

    const modal = document.getElementById('modal-profile');
    if (modal) modal.classList.add('active');
  }

  /**
   * saveFromForm()
   * Reads all profile form fields and persists.
   * Returns { ok: boolean, error?: string }
   */
  function saveFromForm() {
    const getVal = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };

    const name = getVal('pf-name');
    if (!name) return { ok: false, error: 'Name is required.' };

    const skills = getVal('pf-skills').split(',').map(s => s.trim()).filter(Boolean);

    let email = getVal('pf-email');
    if (email && !email.startsWith('mailto:')) email = `mailto:${email}`;

    const toggle = document.getElementById('pf-status-active');

    const profileData = {
      name        : name,
      role        : getVal('pf-role'),
      bio         : getVal('pf-bio'),
      location    : getVal('pf-location'),
      origin      : getVal('pf-origin'),
      experience  : getVal('pf-experience'),
      status      : getVal('pf-status'),
      tagline     : getVal('pf-tagline'),
      github      : getVal('pf-github'),
      linkedin    : getVal('pf-linkedin'),
      twitter     : getVal('pf-twitter'),
      email,
      website     : getVal('pf-website'),
      skills,
      statusActive: toggle ? toggle.checked : true,
      avatar      : load().avatar,   // preserve existing avatar by default
    };

    // Overwrite avatar if a new file was selected
    const fileInput = document.getElementById('avatar-file-upload');
    if (fileInput && fileInput.dataset.base64) {
      profileData.avatar = fileInput.dataset.base64;
    }

    save(profileData);
    return { ok: true };
  }

  return { load, save, render, renderSkillsMarquee, openEditModal, saveFromForm };

})();
