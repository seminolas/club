// Strip leading/trailing asterisks (and surrounding spaces) used as ladder markers.
function cleanName(name) {
  return name.replace(/^\*+\s*|\s*\*+$/g, '');
}

// Filter a ranked list [{name, rank}] by query, with word-boundary hits first.
function searchRanked(items, q) {
  return items
    .filter(p => p.name.toLowerCase().includes(q))
    .sort((a, b) => {
      const words = n => cleanName(n).toLowerCase().split(/\s+/);
      const aWord = words(a.name).some(w => w.startsWith(q)) ? 0 : 1;
      const bWord = words(b.name).some(w => w.startsWith(q)) ? 0 : 1;
      if (aWord !== bWord) return aWord - bWord;
      return a.rank - b.rank;
    });
}

function appData() {
  return {
    // ── State ──────────────────────────────────────────────────────────────
    view: 'home',
    homeTab: 1,            // 1=Players, 2=Sessions
    homeSearch: '',
    sessionTab: 1,         // 1=Attendance, 2=Games, 3=Wrap-up
    loading: false,
    error: null,
    toast: null,
    toastTimer: null,

    // Auth
    isAdmin: false,
    showLogin: false,
    loginError: null,

    // Leaderboard
    leaderboard: [],

    // Sessions list — full objects {date, status, attendee_count}, newest first
    sessionList: [],
    mostRecentSessionStatus: null,
    selectedDate: null,

    // Active session
    session: null,

    // UI helpers
    sessionSearch: '',
    boxExpanded: {},
    allBoxesExpanded: true,
    highlightIdx: -1,
    addPlayerName: '',
    addPlayerPos: null,
    showAddPlayer: false,
    _scoreSaveTimers: {},  // key: "bi-mi-si" → timer id

    // HelloClub sync modal
    hcSync: { open: false, running: false, log: [] },

    // ── Init ───────────────────────────────────────────────────────────────
    _googleClientId: null,

    async init() {
      this.isAdmin = Storage.autoLogin();

      // Load club config to get googleClientId for GIS initialization
      Storage.getConfig().then(cfg => {
        this._googleClientId = cfg.googleClientId ?? null;
      }).catch(() => {});

      await this.loadHome();
      this.initSelectedDate();

      window.addEventListener('hashchange', () => this.route());
      this.route();
    },

    get sessionDates() { return this.sessionList.map(s => s.date); },

    initSelectedDate() {
      if (this.mostRecentSessionStatus && this.mostRecentSessionStatus !== 'closed' && this.sessionList[0]) {
        this.selectedDate = this.sessionList[0].date;
      } else {
        this.selectedDate = nextTuesday();
      }
    },

    get filteredLeaderboard() {
      const q = this.homeSearch.trim().toLowerCase();
      const ranked = this.leaderboard.map((name, i) => ({ name, rank: i + 1 }));
      return q ? searchRanked(ranked, q) : ranked;
    },

    shortDate(isoDate) {
      const d = new Date(isoDate + 'T00:00:00');
      return d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' });
    },

    async route() {
      const hash = location.hash.replace('#', '') || '/';

      // Redirect old URL format (from previously shared WhatsApp links)
      const oldM = hash.match(/^\/session\/(\d{4}-\d{2}-\d{2})(\/(\w+))?/);
      if (oldM) {
        const tab = oldM[3] === 'results' ? 'games' : oldM[3] === 'leaderboard' ? 'wrapup' : 'attendance';
        location.hash = `/${oldM[1]}/${tab}`;
        return;
      }

      // Session: /YYYY-MM-DD or /YYYY-MM-DD/tab
      const m = hash.match(/^\/(\d{4}-\d{2}-\d{2})(\/(\w+))?/);
      if (m) {
        const date = m[1];
        if (this.view !== 'session' || this.session?.date !== date) {
          await this.openSession(date, { pushHash: false });
        }
        const sub = m[3];
        if (sub === 'games') this.sessionTab = 2;
        else if (sub === 'wrapup') this.sessionTab = 3;
        else this.sessionTab = 1;
        return;
      }

      // Home tabs
      this.view = 'home';
      if (hash === '/sessions') this.homeTab = 2;
      else this.homeTab = 1;
    },

    setHomeTab(num) {
      this.homeTab = num;
      location.hash = num === 2 ? '/sessions' : '/players';
    },

    setSessionTab(num) {
      if (this.isTabLocked(num)) return;
      this.sessionTab = num;
      const date = this.session?.date;
      if (!date) return;
      const slug = num === 2 ? 'games' : num === 3 ? 'wrapup' : 'attendance';
      location.hash = `/${date}/${slug}`;
    },

    isTabLocked(num) {
      const s = this.session?.status;
      if (!s) return num !== 1;
      if (num === 2) return s === 'attendance';
      if (num === 3) return s !== 'closed';
      return false;
    },

    // Render the Google Sign-In button into #google-signin-btn.
    // Retries every 100ms until the GIS SDK and config are ready.
    initGoogleButton() {
      if (!this.showLogin) return;
      if (!window.google?.accounts?.id || !this._googleClientId) {
        setTimeout(() => this.initGoogleButton(), 100);
        return;
      }
      const el = document.getElementById('google-signin-btn');
      if (!el || el.children.length > 0) return;
      google.accounts.id.initialize({
        client_id: this._googleClientId,
        callback: (r) => this.onGoogleSignIn(r),
      });
      google.accounts.id.renderButton(el, { type: 'standard', size: 'large', theme: 'outline' });
    },

    // ── Auth (Google Sign-In) ──────────────────────────────────────────────
    // Called by the Google Identity Services callback (set in index.html)
    async onGoogleSignIn(response) {
      this.loginError = null;
      try {
        await Storage.loginWithGoogleToken(response.credential);
        this.isAdmin = true;
        this.showLogin = false;
      } catch (e) {
        this.loginError = e.message;
      }
    },

    logout() {
      Storage.logout();
      this.isAdmin = false;
    },

    // ── Home ───────────────────────────────────────────────────────────────
    async loadHome() {
      this.loading = true;
      this.error = null;
      try {
        const lb = await Storage.getLeaderboard();
        if (lb) this.leaderboard = lb.content.players;

        this.sessionList = await Storage.listSessions();
        if (this.sessionList.length > 0) {
          this.mostRecentSessionStatus = this.sessionList[0].status;
        } else {
          this.mostRecentSessionStatus = null;
        }
      } catch (e) {
        this.error = e.message;
      } finally {
        this.loading = false;
      }
    },

    get mostRecentSession() { return this.sessionDates[0] || null; },
    get isStaging() { return location.hostname.includes('staging'); },

    get sessionDateExists() {
      return !!this.selectedDate && this.sessionDates.includes(this.selectedDate);
    },

    // ── CSV Import ─────────────────────────────────────────────────────────
    async importCSV(event) {
      const file = event.target.files[0];
      if (!file) return;

      if (this.session && this.session.status !== 'closed') {
        this.showToast('Finish the current session before importing a new leaderboard.', 'error');
        event.target.value = '';
        return;
      }

      const text = await file.text();
      const players = parseLeaderboardCSV(text);
      if (players.length === 0) {
        this.showToast('No player rows found in CSV.', 'error');
        return;
      }

      if (!confirm(`Import ${players.length} players and overwrite the current leaderboard?`)) {
        event.target.value = '';
        return;
      }

      this.loading = true;
      try {
        await Storage.saveLeaderboard(players);
        this.leaderboard = players;
        this.showToast(`Imported ${players.length} players.`);
      } catch (e) {
        this.showToast(e.message, 'error');
      } finally {
        this.loading = false;
        event.target.value = '';
      }
    },

    // ── CSV Export ─────────────────────────────────────────────────────────
    exportCSV() {
      if (this.leaderboard.length === 0) {
        this.showToast('No leaderboard data to export.', 'error');
        return;
      }
      const date = nextTuesday();
      const csv = generateLeaderboardCSV(this.leaderboard, date);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `leaderboard-${date}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },

    // ── Session management ─────────────────────────────────────────────────
    async startSession(date) {
      if (!date) return;
      if (this.sessionDates.includes(date)) {
        await this.openSession(date);
        return;
      }

      this.loading = true;
      try {
        const result = await Storage.createSession(date);
        this.session = result.content;
        this.sessionList = [{ date, status: 'attendance', attendee_count: 0 }, ...this.sessionList.filter(s => s.date !== date)];
        this.sessionTab = 1;
        this.view = 'session';
        location.hash = `/${date}/attendance`;
      } catch (e) {
        this.showToast(e.message, 'error');
      } finally {
        this.loading = false;
      }
    },

    async openSession(date, { pushHash = true } = {}) {
      this.loading = true;
      try {
        const result = await Storage.getSession(date);
        if (!result) { this.showToast('Session not found.', 'error'); return; }
        this.session = result.content;
        this.mostRecentSessionStatus = result.content.status;
        this.sessionTab = 1;
        this.view = 'session';
        this.boxExpanded = {};
        this.sessionSearch = '';
        if (pushHash) location.hash = `/${date}/attendance`;

        if (this.leaderboard.length === 0) {
          const lb = await Storage.getLeaderboard();
          if (lb) this.leaderboard = lb.content.players;
        }
      } catch (e) {
        this.showToast(e.message, 'error');
      } finally {
        this.loading = false;
      }
    },

    // ── Attendance ─────────────────────────────────────────────────────────
    get attendanceLeaderboard() {
      const base = (this.session && this.session.status !== 'attendance' && this.session.leaderboardBefore)
        ? this.session.leaderboardBefore
        : this.leaderboard;
      return base;
    },

    get filteredPlayers() {
      const q = this.sessionSearch.trim().toLowerCase();
      const ranked = this.attendanceLeaderboard.map((name, i) => ({ name, rank: i + 1 }));
      return q ? searchRanked(ranked, q) : ranked;
    },

    get searchHasNoMatch() {
      const q = this.sessionSearch.trim().toLowerCase();
      return q.length >= 2 && this.filteredPlayers.length === 0;
    },

    isAttending(name) { return this.session?.attendees.includes(name) ?? false; },

    async toggleAttendance(name) {
      if (!this.session || this.session.status === 'in_progress' || this.session.status === 'closed') return;

      const wasAttending = this.session.attendees.includes(name);
      const hadBoxes = this.session.status === 'boxes_assigned' && this.session.boxes.length > 0;

      if (hadBoxes) {
        if (!confirm('Attendance changed — this will clear the current box assignments. Continue?')) return;
      }

      // Optimistic update
      if (wasAttending) {
        this.session.attendees = this.session.attendees.filter(n => n !== name);
      } else {
        this.session.attendees.push(name);
      }

      try {
        const res = await Storage.setAttendance(this.session.date, name, !wasAttending);
        if (res.boxesCleared) {
          this.session.boxes = [];
          this.session.status = 'attendance';
        }
      } catch (e) {
        // Roll back optimistic update
        if (wasAttending) {
          this.session.attendees.push(name);
        } else {
          this.session.attendees = this.session.attendees.filter(n => n !== name);
        }
        this.showToast(e.message, 'error');
      }
    },

    get attendingCount() { return this.session?.attendees.length ?? 0; },

    // ── Match status helpers ───────────────────────────────────────────────
    matchStatus(boxIdx, matchIdx) {
      return getMatchStatus(this.session.boxes[boxIdx].matches[matchIdx]);
    },

    setIsValid(match, setIdx) {
      const s = match.sets?.[setIdx];
      if (!s) return null;
      const aEmpty = s[0] === '' || s[0] == null;
      const bEmpty = s[1] === '' || s[1] == null;
      if (aEmpty || bEmpty) return null;
      return isValidSet(s[0], s[1]);
    },

    scoreInputClass(match, setIdx, side) {
      const s = match.sets?.[setIdx];
      if (!s) return '';
      const a = s[0], b = s[1];
      if (a === '' || a == null || b === '' || b == null) return '';
      if (!isValidSet(a, b)) return 'border-red-400 bg-red-50';
      const sideWins = side === 0 ? Number(a) > Number(b) : Number(b) > Number(a);
      return sideWins ? 'border-green-500 bg-green-50' : 'border-red-400 bg-red-50';
    },

    pairResultClass(match, pairSide) {
      if (getMatchStatus(match) !== 'complete') return 'text-gray-800';
      let p1Sets = 0, p2Sets = 0;
      for (const s of (match.sets || [])) {
        if (!isValidSet(s[0], s[1])) continue;
        if (Number(s[0]) > Number(s[1])) p1Sets++; else p2Sets++;
      }
      const wins = pairSide === 0 ? p1Sets > p2Sets : p2Sets > p1Sets;
      return wins ? 'text-green-600' : 'text-red-500';
    },

    showThirdSet(match) {
      const s0 = match.sets?.[0], s1 = match.sets?.[1];
      if (!s0 || !s1) return false;
      if (!isSetComplete(s0[0], s0[1]) || !isSetComplete(s1[0], s1[1])) return false;
      return (Number(s0[0]) > Number(s0[1])) !== (Number(s1[0]) > Number(s1[1]));
    },

    // ── Search keyboard navigation ─────────────────────────────────────────
    onSearchInput() { this.highlightIdx = this.sessionSearch.trim() ? 0 : -1; },

    attendanceKeydown(e) {
      if (this.showAddPlayer) return;
      const players = this.filteredPlayers;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!players.length) return;
        this.highlightIdx = this.highlightIdx < players.length - 1 ? this.highlightIdx + 1 : 0;
        this._scrollHighlighted();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!players.length) return;
        this.highlightIdx = this.highlightIdx > 0 ? this.highlightIdx - 1 : players.length - 1;
        this._scrollHighlighted();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const idx = this.highlightIdx >= 0 ? this.highlightIdx : 0;
        if (players[idx]) {
          this.toggleAttendance(players[idx].name);
          this.sessionSearch = '';
          this.highlightIdx = -1;
        }
      } else if (e.key === 'Escape') {
        this.sessionSearch = '';
        this.highlightIdx = -1;
      }
    },

    _scrollHighlighted() {
      this.$nextTick(() => {
        document.querySelector('.player-row-highlighted')?.scrollIntoView({ block: 'nearest' });
      });
    },

    clearSearch() { this.sessionSearch = ''; this.highlightIdx = -1; },

    // ── Add new player ─────────────────────────────────────────────────────
    prepareAddPlayer() {
      this.addPlayerName = this.sessionSearch.trim();
      this.addPlayerPos = this.leaderboard.length + 1;
      this.showAddPlayer = true;
    },

    async confirmAddPlayer() {
      const name = this.addPlayerName.trim();
      if (!name) return;
      const pos = parseInt(this.addPlayerPos, 10);
      const insertIdx = Math.max(0, Math.min(pos - 1, this.leaderboard.length));

      this.loading = true;
      try {
        const res = await Storage.addPlayer(name, insertIdx + 1, this.session.date);

        // Update local leaderboard
        const newLeaderboard = [...this.leaderboard];
        newLeaderboard.splice(insertIdx, 0, name);
        this.leaderboard = newLeaderboard;

        // Update session's leaderboardBefore
        if (this.session && this.session.status !== 'in_progress' && this.session.status !== 'closed') {
          this.session.leaderboardBefore.splice(insertIdx, 0, name);
        }

        // Auto-mark as attending (already done server-side)
        if (!this.session.attendees.includes(name)) {
          this.session.attendees.push(name);
        }

        if (res.boxesCleared) {
          this.session.boxes = [];
          this.session.status = 'attendance';
        }

        this.showAddPlayer = false;
        this.sessionSearch = '';
        this.showToast(`Added ${name} at position ${insertIdx + 1}.`);
      } catch (e) {
        this.showToast(e.message, 'error');
      } finally {
        this.loading = false;
      }
    },

    // ── Box assignment ─────────────────────────────────────────────────────
    async assignBoxes() {
      if (!this.session || this.attendingCount < 4) return;

      const lb = this.session.leaderboardBefore;
      const sorted = [...this.session.attendees].sort((a, b) => {
        const ai = lb.indexOf(a), bi = lb.indexOf(b);
        return (ai === -1 ? 9999 : ai) - (bi === -1 ? 9999 : bi);
      });

      const boxes = assignBoxes(sorted);
      this.loading = true;
      try {
        await Storage.saveBoxes(this.session.date, boxes);
        this.session.boxes = boxes;
        this.session.status = 'in_progress';
        this.allBoxesExpanded = true;
        this.boxExpanded = {};
        this.setSessionTab(2);
      } catch (e) {
        this.showToast(e.message, 'error');
      } finally {
        this.loading = false;
      }
    },

    // ── Score entry ────────────────────────────────────────────────────────
    pairLabel(box, pairIndices) {
      return pairIndices.map(i => this.boxDisplayName(box, i)).join(' & ');
    },

    firstName(name) {
      const clean = cleanName(name);
      return clean.match(/[a-zA-ZÀ-ÖØ-öø-ÿ]+/)?.[0] ?? clean.trim();
    },

    boxDisplayName(box, playerIdx) {
      const name = box.players[playerIdx];
      const first = this.firstName(name);
      const allPlayers = this.session?.boxes?.flatMap(b => b.players) ?? box.players;
      const hasDuplicate = allPlayers.some((other) => other !== name && this.firstName(other) === first);
      if (!hasDuplicate) return first;
      const clean = name.replace(/^\*+\s*|\s*\*+$/g, '').trim();
      const words = clean.split(/\s+/).filter(w => /[a-zA-ZÀ-ÖØ-öø-ÿ]/.test(w));
      if (words.length < 2) return first;
      const initial = words[words.length - 1].match(/[a-zA-ZÀ-ÖØ-öø-ÿ]/)?.[0];
      return initial ? `${first} ${initial.toUpperCase()}.` : first;
    },

    boxHeaderLabel(box, bi) {
      const names = box.players.map((_, i) => this.boxDisplayName(box, i)).join(', ');
      return `Box ${bi + 1} (${box.players.length}p): ${names}`;
    },

    isBoxVisible(bi) {
      const q = this.sessionSearch.trim().toLowerCase();
      if (!q) return true;
      const box = this.session?.boxes?.[bi];
      if (!box) return false;
      return box.players.some(name => name.toLowerCase().includes(q));
    },

    isBoxExpanded(bi) {
      if (this.sessionSearch.trim() && this.isBoxVisible(bi)) return true;
      if (bi in this.boxExpanded) return this.boxExpanded[bi];
      return this.allBoxesExpanded;
    },

    toggleBoxExpanded(bi) {
      this.boxExpanded = { ...this.boxExpanded, [bi]: !this.isBoxExpanded(bi) };
    },

    get anyBoxCollapsed() {
      return (this.session?.boxes ?? []).some((_, bi) => !this.isBoxExpanded(bi));
    },

    toggleAllBoxes() {
      this.allBoxesExpanded = this.anyBoxCollapsed;
      this.boxExpanded = {};
    },

    isBoxComplete(bi) {
      const box = this.session?.boxes?.[bi];
      if (!box) return false;
      return box.matches.every(m => getMatchStatus(m) === 'complete');
    },

    isSitout(boxIndex, matchIndex, playerIndex) {
      const box = this.session.boxes[boxIndex];
      if (box.players.length !== 5) return false;
      return SITOUT_5[matchIndex] === playerIndex;
    },

    setScore(bi, mi, si, side, value) {
      if (this.session.status === 'closed') return;
      const match = this.session.boxes[bi].matches[mi];

      while (match.sets.length <= si) match.sets.push(['', '']);
      match.sets[si][side] = value === '' ? '' : parseInt(value, 10) || 0;

      // Remove trailing empty sets
      while (match.sets.length > 0) {
        const last = match.sets[match.sets.length - 1];
        if (last[0] === '' && last[1] === '') match.sets.pop();
        else break;
      }

      if (this.session.status === 'boxes_assigned') {
        this.session.status = 'in_progress';
      }

      // Clear stale third set on sweep
      const sets = match.sets;
      if (sets.length > 2 && isSetComplete(sets[0]?.[0], sets[0]?.[1]) && isSetComplete(sets[1]?.[0], sets[1]?.[1])) {
        const p1Won0 = Number(sets[0][0]) > Number(sets[0][1]);
        const p1Won1 = Number(sets[1][0]) > Number(sets[1][1]);
        if (p1Won0 === p1Won1) match.sets = match.sets.slice(0, 2);
      }

      this._scheduleScoreSave(bi, mi, si, match);
    },

    // Debounce score saves — one per set cell so rapid typing doesn't flood the API.
    _scheduleScoreSave(bi, mi, si, match) {
      const key = `${bi}-${mi}-${si}`;
      clearTimeout(this._scoreSaveTimers[key]);
      this._scoreSaveTimers[key] = setTimeout(async () => {
        const [a, b] = match.sets[si] ?? ['', ''];
        try {
          await Storage.updateScore(
            this.session.date, bi, mi, si,
            a === '' ? null : Number(a),
            b === '' ? null : Number(b)
          );
        } catch (e) {
          this.showToast('Score save failed: ' + e.message, 'error');
        }
      }, 1500);
    },

    saveScores() {
      // Kept for template compatibility — individual saves handled by _scheduleScoreSave.
    },

    handleScoreTab(bi, mi, setIdx, event) {
      if (setIdx !== 1) return;
      event.preventDefault();
      this.setScore(bi, mi, 1, 1, event.target.value);
      const currentEl = event.target;
      window.Alpine.nextTick(() => {
        const all = [...document.querySelectorAll('.score-input:not([disabled])')].filter(
          el => el.offsetParent !== null
        );
        const idx = all.indexOf(currentEl);
        if (idx !== -1 && idx + 1 < all.length) all[idx + 1].focus();
      });
    },

    getBoxStandings(boxIdx) {
      const box = this.session.boxes[boxIdx];
      return computeBoxStandings(box, this.session.leaderboardBefore);
    },

    get allScoresComplete() {
      if (!this.session?.boxes?.length) return false;
      return allScoresComplete(this.session.boxes);
    },

    // ── Close session ──────────────────────────────────────────────────────
    async closeSession() {
      if (!this.allScoresComplete) return;
      if (!confirm('Close this session and update the leaderboard?')) return;

      const newLeaderboard = applyLeaderboardUpdate(this.session.boxes, this.session.leaderboardBefore);

      this.loading = true;
      try {
        await Storage.closeSession(this.session.date, newLeaderboard);
        this.session.leaderboardAfter = newLeaderboard;
        this.session.status = 'closed';
        this.leaderboard = newLeaderboard;
        this.mostRecentSessionStatus = 'closed';
        this.setSessionTab(3);
        this.showToast('Session closed. Leaderboard updated.');
      } catch (e) {
        this.showToast(e.message, 'error');
      } finally {
        this.loading = false;
      }
    },

    // ── Edit last closed session ───────────────────────────────────────────
    get canEditSession() {
      if (!this.session || this.session.status !== 'closed') return false;
      return this.session.date === this.sessionDates[0];
    },

    async deleteSession() {
      const label = formatDate(this.session.date);
      if (!confirm(`Delete session "${label}"?\n\nThis will permanently remove all attendance, boxes, and scores. This cannot be undone.`)) return;
      this.loading = true;
      try {
        await Storage.deleteSession(this.session.date);
        this.sessionList = this.sessionList.filter(s => s.date !== this.session.date);
        if (this.sessionList.length > 0) {
          this.mostRecentSessionStatus = this.sessionList[0].status;
        } else {
          this.mostRecentSessionStatus = null;
        }
        this.session = null;
        location.hash = '/sessions';
        this.showToast(`Session deleted.`);
      } catch (e) {
        this.showToast(e.message, 'error');
      } finally {
        this.loading = false;
      }
    },

    async enableEditing() {
      if (!confirm('Re-open this session for editing?\n\nThe live leaderboard will only be updated when you close again.')) return;
      // Store a local snapshot for discard
      this.session._editSnapshot = {
        boxes: JSON.parse(JSON.stringify(this.session.boxes)),
        leaderboardAfter: this.session.leaderboardAfter ? [...this.session.leaderboardAfter] : null,
      };
      // Update status server-side — reuse the score endpoint to trigger in_progress
      // (simpler: just optimistically update, the next score save will flip status)
      this.session.status = 'in_progress';
    },

    async closeWithDiscard() {
      if (!confirm('Discard all changes and restore the original results?')) return;
      this.loading = true;
      try {
        const snap = this.session._editSnapshot;
        if (snap) {
          this.session.boxes = snap.boxes;
          this.session.leaderboardAfter = snap.leaderboardAfter;
        }
        // Re-close with original leaderboard
        await Storage.closeSession(this.session.date, this.session.leaderboardAfter ?? []);
        this.session.status = 'closed';
        delete this.session._editSnapshot;
        this.showToast('Changes discarded.');
      } catch (e) {
        this.showToast(e.message, 'error');
      } finally {
        this.loading = false;
      }
    },

    async closeSessionWithSave() {
      if (!confirm('Save changes and update the leaderboard?')) return;

      const newLeaderboard = applyLeaderboardUpdate(this.session.boxes, this.session.leaderboardBefore);

      this.loading = true;
      try {
        // Re-save boxes with current state (scores may have changed)
        await Storage.saveBoxes(this.session.date, this.session.boxes);
        await Storage.closeSession(this.session.date, newLeaderboard);
        this.session.leaderboardAfter = newLeaderboard;
        this.session.status = 'closed';
        delete this.session._editSnapshot;
        this.leaderboard = newLeaderboard;
        this.setSessionTab(3);
        this.showToast('Session saved. Leaderboard updated.');
      } catch (e) {
        this.showToast(e.message, 'error');
      } finally {
        this.loading = false;
      }
    },

    // ── WhatsApp share ─────────────────────────────────────────────────────
    shareOnWhatsApp() {
      const base  = location.origin;
      const date  = this.session.date;
      const d     = new Date(date + 'T00:00:00');
      const label = d.toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' });

      const lines = [
        `🏸 ${label} — Box Night`,
        '',
        `Results: ${base}/#/${date}/games`,
        `Ladder:  ${base}/#/${date}/wrapup`,
      ];

      window.open(`https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`, '_blank');
    },

    // ── HelloClub sync ─────────────────────────────────────────────────────
    async syncHelloClub() {
      this.hcSync = { open: true, running: true, log: [] };
      try {
        const { log } = await Storage.syncHelloClub(this.session.date);
        this.hcSync.log = log;
      } catch (e) {
        this.hcSync.log.push({ text: `Error: ${e.message}`, type: 'error' });
      }
      this.hcSync.running = false;
    },

    // ── Leaderboard delta ──────────────────────────────────────────────────
    rankDelta(name) {
      if (!this.session?.leaderboardBefore || !this.session?.leaderboardAfter) return 0;
      const before = this.session.leaderboardBefore.indexOf(name) + 1;
      const after  = this.session.leaderboardAfter.indexOf(name) + 1;
      if (before === 0 || after === 0) return 0;
      return before - after;
    },

    deltaLabel(name) {
      const d = this.rankDelta(name);
      if (d > 0) return `↑${d}`;
      if (d < 0) return `↓${Math.abs(d)}`;
      return '→';
    },

    deltaClass(name) {
      const d = this.rankDelta(name);
      if (d > 0) return 'text-green-600 font-semibold';
      if (d < 0) return 'text-red-500 font-semibold';
      return 'text-gray-400';
    },

    // ── Print ──────────────────────────────────────────────────────────────
    printBoxes() { window.print(); },

    printLadder() {
      const isoDate = this.session?.date ?? this.selectedDate ?? '';
      const d = isoDate ? new Date(isoDate + 'T00:00:00') : null;
      const dateStr = d
        ? `${_DAYS[d.getDay()]}, ${_MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
        : '';
      const players = this.session?.leaderboardBefore ?? this.leaderboard;
      const n = players.length;

      const stops = [
        [0.00,  59, 130, 246],
        [0.25,   8, 145, 178],
        [0.38, 101, 163,  13],
        [0.50, 202, 138,   4],
        [0.63, 249, 115,  22],
        [0.78, 239,  68,  68],
        [1.00, 252, 165, 165],
      ];
      const lerp = (idx) => {
        const t = n <= 1 ? 0 : idx / (n - 1);
        let lo = stops[0], hi = stops[stops.length - 1];
        for (let k = 0; k < stops.length - 1; k++) {
          if (t >= stops[k][0] && t <= stops[k + 1][0]) { lo = stops[k]; hi = stops[k + 1]; break; }
        }
        const u = hi[0] === lo[0] ? 0 : (t - lo[0]) / (hi[0] - lo[0]);
        return `rgb(${Math.round(lo[1]+(hi[1]-lo[1])*u)},${Math.round(lo[2]+(hi[2]-lo[2])*u)},${Math.round(lo[3]+(hi[3]-lo[3])*u)})`;
      };

      const rows = players.map((name, i) => {
        const esc = name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return `<tr><td class="n" style="background:${lerp(i)}">${i+1}</td><td>${esc}</td><td></td><td></td></tr>`;
      }).join('\n');

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Box Doubles Draw</title>
<style>
@page{size:A4 portrait;margin:1.5cm}
*{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:Arial,Helvetica,sans-serif;font-size:14pt}
table{width:100%;border-collapse:collapse}
tr{page-break-inside:avoid;break-inside:avoid}
td{border:1.5pt solid #000;padding:1pt 5pt;vertical-align:middle}
.n{width:36pt;text-align:center;font-weight:bold}
.ht{font-weight:bold;text-align:center}
.hd{font-weight:bold;text-align:center}
.ha{width:85pt;font-weight:bold;text-align:center}
.hs{width:85pt;font-weight:bold;text-align:center}
</style>
</head>
<body>
<table><tbody>
<tr><td class="n"></td><td class="ht">Box Doubles Draw</td><td class="ha"></td><td class="hs"></td></tr>
<tr><td class="n"></td><td class="hd">${dateStr}</td><td class="ha">Attend</td><td class="hs">Signature</td></tr>
<tr><td></td><td>&nbsp;</td><td></td><td></td></tr>
<tr><td></td><td>&nbsp;</td><td></td><td></td></tr>
${rows}
</tbody></table>
<script>window.print()<\/script>
</body>
</html>`;

      const w = window.open('', '_blank');
      if (!w) { this.showToast('Pop-up blocked — allow pop-ups for this site', 'error'); return; }
      w.document.write(html);
      w.document.close();
    },

    // ── Toast ──────────────────────────────────────────────────────────────
    showToast(msg, type = 'success') {
      this.toast = { msg, type };
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => { this.toast = null; }, 3500);
    },
  };
}
