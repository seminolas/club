// API storage layer — replaces the GitHub API layer from the old app.
// All state lives in D1 via the Cloudflare Worker.
// Auth is Google Sign-In + Worker-issued JWT.

const Storage = (() => {
  const JWT_KEY = 'club_jwt';
  const ROLE_KEY = 'club_role';

  // Worker serves both the static HTML/JS and the API from the same origin.
  // Relative /api/... paths work for prod, staging, and local wrangler dev.
  const API_BASE = '';

  let _jwt = null;
  let _role = null;

  // ── Auth ──────────────────────────────────────────────────────────────────

  // Restore session from localStorage (called on app init).
  function autoLogin() {
    _jwt = localStorage.getItem(JWT_KEY);
    _role = localStorage.getItem(ROLE_KEY);
    return !!_jwt;
  }

  // Called after Google Sign-In returns an id_token.
  async function loginWithGoogleToken(idToken) {
    const res = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ id_token: idToken }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Login failed');
    }
    const data = await res.json();
    _jwt = data.token;
    _role = data.role;
    localStorage.setItem(JWT_KEY, _jwt);
    localStorage.setItem(ROLE_KEY, _role);
    return _role;
  }

  function logout() {
    _jwt = null;
    _role = null;
    localStorage.removeItem(JWT_KEY);
    localStorage.removeItem(ROLE_KEY);
  }

  function isAdmin() { return !!_jwt; }
  function getRole() { return _role; }

  // ── HTTP helpers ──────────────────────────────────────────────────────────

  function apiFetch(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers ?? {}) };
    if (_jwt) headers['Authorization'] = `Bearer ${_jwt}`;
    return fetch(API_BASE + path, { ...options, headers });
  }

  async function apiJSON(path, options = {}) {
    const res = await apiFetch(path, options);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `API error: ${res.status}`);
    }
    return res.json();
  }

  // ── Leaderboard ───────────────────────────────────────────────────────────

  async function getLeaderboard() {
    const data = await apiJSON('/api/leaderboard');
    return { content: data };
  }

  async function saveLeaderboard(players) {
    await apiJSON('/api/leaderboard/import', {
      method: 'POST',
      body: JSON.stringify({ players }),
    });
  }

  // ── Sessions ──────────────────────────────────────────────────────────────

  async function listSessions() {
    return apiJSON('/api/sessions');
  }

  async function getSession(date) {
    const data = await apiJSON(`/api/sessions/${date}`);
    return { content: data };
  }

  async function createSession(date) {
    const data = await apiJSON('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ date }),
    });
    return { content: data };
  }

  async function deleteSession(date) {
    return apiJSON(`/api/sessions/${date}`, { method: 'DELETE' });
  }

  async function setAttendance(date, playerName, attending) {
    const res = await apiJSON(`/api/sessions/${date}/attendance`, {
      method: 'PUT',
      body: JSON.stringify({ player_name: playerName, attending }),
    });
    return res;
  }

  async function saveBoxes(date, boxes) {
    await apiJSON(`/api/sessions/${date}/boxes`, {
      method: 'PUT',
      body: JSON.stringify({ boxes }),
    });
  }

  async function updateScore(date, boxNumber, matchNumber, setNumber, scoreA, scoreB) {
    await apiJSON(`/api/sessions/${date}/score`, {
      method: 'PUT',
      body: JSON.stringify({
        box_number: boxNumber,
        match_number: matchNumber,
        set_number: setNumber,
        score_a: scoreA === '' ? null : scoreA,
        score_b: scoreB === '' ? null : scoreB,
      }),
    });
  }

  async function closeSession(date, leaderboardAfter) {
    await apiJSON(`/api/sessions/${date}/close`, {
      method: 'POST',
      body: JSON.stringify({ leaderboard_after: leaderboardAfter }),
    });
  }

  // ── Players ───────────────────────────────────────────────────────────────

  async function addPlayer(name, insertRank, sessionDate) {
    return apiJSON('/api/players', {
      method: 'POST',
      body: JSON.stringify({ name, insert_rank: insertRank, session_date: sessionDate }),
    });
  }

  // ── HelloClub sync ────────────────────────────────────────────────────────

  async function syncHelloClub(sessionDate) {
    return apiJSON('/api/hc/sync', {
      method: 'POST',
      body: JSON.stringify({ session_date: sessionDate }),
    });
  }

  // ── Config ────────────────────────────────────────────────────────────────

  async function getConfig() {
    return apiJSON('/api/config');
  }

  return {
    autoLogin, loginWithGoogleToken, logout, isAdmin, getRole,
    getLeaderboard, saveLeaderboard,
    listSessions, getSession, createSession, deleteSession,
    setAttendance, saveBoxes, updateScore, closeSession,
    addPlayer,
    syncHelloClub, getConfig,
  };
})();
