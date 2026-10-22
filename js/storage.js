// API storage layer — replaces the GitHub API layer from the old app.
// All state lives in D1 via the Cloudflare Worker.
// Auth is BetterAuth: Google sign-in by redirect, then a session cookie that
// the browser sends with every same-origin request.

const Storage = (() => {
  // Worker serves both the static HTML/JS and the API from the same origin.
  // Relative /api/... paths work for prod, staging, and local wrangler dev.
  const API_BASE = '';

  // ── Auth ──────────────────────────────────────────────────────────────────

  // Who's signed in: { signedIn, isAdmin, name?, player? }.
  async function me() {
    const res = await apiFetch('/api/me');
    return res.ok ? res.json() : { signedIn: false, isAdmin: false };
  }

  // Goes to Google; Google sends the browser back to this page, signed in.
  async function signInWithGoogle() {
    const here = location.href;
    const res = await apiFetch('/api/auth/sign-in/social', {
      method: 'POST',
      body: JSON.stringify({ provider: 'google', callbackURL: here, errorCallbackURL: here }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) throw new Error(data.message || 'Could not start sign-in');
    location.href = data.url;
  }

  async function logout() {
    await apiFetch('/api/auth/sign-out', { method: 'POST', body: '{}' });
  }

  // "This is me": players a signed-in login can pick, and picking one.
  async function claimablePlayers() {
    return (await apiJSON('/api/me/claimable')).players;
  }

  async function claimPlayer(playerId) {
    return apiJSON('/api/me/claim', {
      method: 'POST',
      body: JSON.stringify({ player_id: playerId }),
    });
  }

  async function unlinkPlayerLogin(playerId) {
    return apiJSON(`/api/players/${playerId}/unlink`, { method: 'POST', body: '{}' });
  }

  // ── HTTP helpers ──────────────────────────────────────────────────────────

  function apiFetch(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers ?? {}) };
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

  return {
    me, signInWithGoogle, logout, claimablePlayers, claimPlayer, unlinkPlayerLogin,
    getLeaderboard, saveLeaderboard,
    listSessions, getSession, createSession, deleteSession,
    setAttendance, saveBoxes, updateScore, closeSession,
    reopenSession, reopenAttendance,
    addPlayer, getPlayer, updatePlayer, deletePlayer,
    searchHCMembers,
    syncHelloClub,
  };
})();
