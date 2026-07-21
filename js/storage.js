// API storage layer — replaces the GitHub API layer from the old app.
// All state lives in D1 via the Cloudflare Worker.
// Auth is Google Sign-In + Worker-issued JWT.

const Storage = (() => {
  const JWT_KEY = 'club_jwt';
  const ROLES_KEY = 'club_roles';

  // Worker serves both the static HTML/JS and the API from the same origin.
  // Relative /api/... paths work for prod, staging, and local wrangler dev.
  const API_BASE = '';

  let _jwt = null;
  let _roles = [];

  // ── Auth ──────────────────────────────────────────────────────────────────

  // Restore session from localStorage (called on app init).
  function autoLogin() {
    _jwt = localStorage.getItem(JWT_KEY);
    const stored = localStorage.getItem(ROLES_KEY);
    _roles = stored ? JSON.parse(stored) : [];
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
    _roles = data.roles ?? [];
    localStorage.setItem(JWT_KEY, _jwt);
    localStorage.setItem(ROLES_KEY, JSON.stringify(_roles));
    return _roles;
  }

  function logout() {
    _jwt = null;
    _roles = [];
    localStorage.removeItem(JWT_KEY);
    localStorage.removeItem(ROLES_KEY);
  }

  function isAdmin() { return _roles.includes('admin') || _roles.includes('owner'); }
  function getRoles() { return _roles; }

  // ── HTTP helpers ──────────────────────────────────────────────────────────

  function apiFetch(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers ?? {}) };
    if (_jwt) headers['Authorization'] = `Bearer ${_jwt}`;
    return fetch(API_BASE + path, { cache: 'no-store', ...options, headers });
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

  async function setAttendance(date, playerId, attending) {
    const res = await apiJSON(`/api/sessions/${date}/attendance`, {
      method: 'PUT',
      body: JSON.stringify({ player_id: playerId, attending }),
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

  async function closeSession(date, leaderboardAfterIds) {
    await apiJSON(`/api/sessions/${date}/close`, {
      method: 'POST',
      body: JSON.stringify({ leaderboard_after: leaderboardAfterIds }),
    });
  }

  // ── Players ───────────────────────────────────────────────────────────────

  async function addPlayer(name, insertRank, sessionDate) {
    return apiJSON('/api/players', {
      method: 'POST',
      body: JSON.stringify({ name, insert_rank: insertRank, session_date: sessionDate }),
    });
  }

  async function reopenSession(date) {
    return apiJSON(`/api/sessions/${date}/reopen`, { method: 'POST' });
  }

  async function reopenAttendance(date) {
    return apiJSON(`/api/sessions/${date}/reopen-attendance`, { method: 'POST' });
  }

  // ── Players ───────────────────────────────────────────────────────────────

  async function getPlayer(id) {
    return apiJSON(`/api/players/${id}`);
  }

  async function updatePlayer(id, fields) {
    return apiJSON(`/api/players/${id}`, {
      method: 'PUT',
      body: JSON.stringify(fields),
    });
  }

  async function deletePlayer(id) {
    return apiJSON(`/api/players/${id}`, { method: 'DELETE' });
  }

  async function searchHCMembers(q) {
    return apiJSON(`/api/hc/members?q=${encodeURIComponent(q)}`);
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
    autoLogin, loginWithGoogleToken, logout, isAdmin, getRoles,
    getLeaderboard, saveLeaderboard,
    listSessions, getSession, createSession, deleteSession,
    setAttendance, saveBoxes, updateScore, closeSession,
    reopenSession, reopenAttendance,
    addPlayer, getPlayer, updatePlayer, deletePlayer,
    searchHCMembers,
    syncHelloClub, getConfig,
  };
})();
