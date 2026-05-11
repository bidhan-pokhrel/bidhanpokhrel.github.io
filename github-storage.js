/**
 * github-storage.js — GitHub API Storage
 * ─────────────────────────────────────────────────────────────────────────────
 * Reads and writes JSON data files directly to your GitHub repository.
 *
 * How it works:
 *   READ  → GitHub API (public repos need no token; private repos need token)
 *   WRITE → GitHub API PUT (always needs a Personal Access Token)
 *
 * Files stored in your repo:
 *   data/posts.json    → all posts and apps
 *   data/profile.json  → your profile data
 *
 * Config stored in localStorage (on YOUR device only):
 *   bp_gh_owner   → GitHub username
 *   bp_gh_repo    → repository name
 *   bp_gh_token   → Personal Access Token
 *   bp_gh_branch  → branch (default: main)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const GitHubStorage = (() => {

  const K_OWNER  = 'bp_gh_owner';
  const K_REPO   = 'bp_gh_repo';
  const K_TOKEN  = 'bp_gh_token';
  const K_BRANCH = 'bp_gh_branch';

  // SHA cache — GitHub requires the current file SHA to update a file
  const _sha = {};

  // ── Config helpers ─────────────────────────────────────────────────────────
  function getConfig() {
    return {
      owner  : localStorage.getItem(K_OWNER)  || '',
      repo   : localStorage.getItem(K_REPO)   || '',
      token  : localStorage.getItem(K_TOKEN)  || '',
      branch : localStorage.getItem(K_BRANCH) || 'main',
    };
  }

  function setConfig({ owner, repo, token, branch }) {
    localStorage.setItem(K_OWNER,  (owner  || '').trim());
    localStorage.setItem(K_REPO,   (repo   || '').trim());
    localStorage.setItem(K_TOKEN,  (token  || '').trim());
    localStorage.setItem(K_BRANCH, (branch || 'main').trim());
  }

  function isConfigured() {
    const c = getConfig();
    return !!(c.owner && c.repo && c.token);
  }

  // ── Base64 helpers (handles Unicode / emoji in JSON) ───────────────────────
  function _encode(obj) {
    const json  = JSON.stringify(obj, null, 2);
    const bytes = new TextEncoder().encode(json);
    let binary  = '';
    bytes.forEach(b => (binary += String.fromCharCode(b)));
    return btoa(binary);
  }

  function _decode(b64) {
    const clean  = b64.replace(/\n/g, '');
    const binary = atob(clean);
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  // ── Core API calls ─────────────────────────────────────────────────────────

  /**
   * readJSON(path)
   * Reads a JSON file from the repo. Returns { data, sha }.
   * If the file doesn't exist yet, returns { data: null, sha: null }.
   * @param {string} path  e.g. 'data/posts.json'
   */
  async function readJSON(path) {
    const { owner, repo, token, branch } = getConfig();
    if (!owner || !repo) throw new Error('GitHub not configured.');

    const headers = { 'Accept': 'application/vnd.github.v3+json' };
    if (token) headers['Authorization'] = `token ${token}`;

    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}&t=${Date.now()}`;
    const res = await fetch(url, { headers });

    if (res.status === 404) return { data: null, sha: null };
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `GitHub read failed (${res.status})`);
    }

    const file   = await res.json();
    _sha[path]   = file.sha;

    try {
      return { data: _decode(file.content), sha: file.sha };
    } catch (e) {
      console.warn('GitHubStorage: failed to parse', path, e);
      return { data: null, sha: file.sha };
    }
  }

  /**
   * writeJSON(path, data, commitMessage)
   * Creates or updates a JSON file in the repo.
   * Always requires a token.
   */
  async function writeJSON(path, data, commitMessage) {
    const { owner, repo, token, branch } = getConfig();
    if (!token) throw new Error('No GitHub token configured. Add it in Settings → GitHub Sync.');

    // Ensure we have the current SHA (needed to update existing files)
    if (!_sha[path]) {
      const existing = await readJSON(path);
      // _sha[path] is now set (or null if file is new)
    }

    const body = {
      message : commitMessage || `Update ${path}`,
      content : _encode(data),
      branch,
    };
    if (_sha[path]) body.sha = _sha[path];

    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
      {
        method  : 'PUT',
        headers : {
          'Authorization' : `token ${token}`,
          'Accept'        : 'application/vnd.github.v3+json',
          'Content-Type'  : 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `GitHub write failed (${res.status})`);
    }

    const result = await res.json();
    // Cache the new SHA for the next update
    _sha[path] = result.content?.sha || null;
    return result;
  }

  /**
   * testConnection()
   * Verifies the token can access the repo.
   * @returns {Promise<{ok:boolean, error?:string, repo?:object}>}
   */
  async function testConnection() {
    const { owner, repo, token } = getConfig();
    if (!owner || !repo || !token) {
      return { ok: false, error: 'Please fill in all three fields first.' };
    }
    try {
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}`,
        { headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' } }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { ok: false, error: err.message || `Error ${res.status}` };
      }
      const data = await res.json();
      return { ok: true, repo: data };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  return { getConfig, setConfig, isConfigured, readJSON, writeJSON, testConnection };

})();
