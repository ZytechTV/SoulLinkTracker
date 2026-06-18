/* Live room sync over Firebase Realtime Database.

   Model: the JSON savefile stays the source of truth. A "room" is a temporary
   live mirror of App.serializeState() at rooms/<code>. Anyone with the code +
   password joins the same room and edits together (last-write-wins on the whole
   state). Everyone can still export to JSON and open a new room anytime.

   Security: every client signs in ANONYMOUSLY, and the database rules require
   auth != null — so the DB is not world-readable and only the app can touch it.
   Each room additionally stores a SHA-256 hash of its password (never plaintext);
   joining verifies the entered password against that hash. See the rules block at
   the bottom of this file / the project README. */

window.App = window.App || {};

(function (App) {
  'use strict';

  var firebaseConfig = {
    apiKey: 'AIzaSyBtytxmNAuK_HSABQlG-U6Ef7Ae8cR0TB8',
    authDomain: 'soullink-tracker-a3b72.firebaseapp.com',
    databaseURL: 'https://soullink-tracker-a3b72-default-rtdb.europe-west1.firebasedatabase.app',
    projectId: 'soullink-tracker-a3b72',
    storageBucket: 'soullink-tracker-a3b72.firebasestorage.app',
    messagingSenderId: '866240804101',
    appId: '1:866240804101:web:03e84093f27a59025bb36c'
  };

  var db = null;
  var authReady = null; // Promise resolved once anonymous sign-in completes
  function ensureDb() {
    if (db) return db;
    if (typeof firebase === 'undefined' || !firebase.initializeApp) return null;
    if (!firebase.apps || !firebase.apps.length) firebase.initializeApp(firebaseConfig);
    db = firebase.database();
    return db;
  }
  App.syncAvailable = function () { return !!ensureDb() && typeof firebase.auth === 'function'; };

  // Sign in anonymously (once). The DB rules require auth != null.
  function ensureAuth() {
    if (authReady) return authReady;
    if (!App.syncAvailable()) return Promise.reject(new Error('Sync is unavailable.'));
    authReady = firebase.auth().signInAnonymously().then(function () {
      return true;
    }).catch(function (e) {
      authReady = null; // allow a retry on next attempt
      throw new Error('Could not connect to the sync service (' + (e.code || e.message) + ').');
    });
    return authReady;
  }
  // warm up the connection early so the first room action is fast
  if (App.syncAvailable && App.syncAvailable()) { try { ensureAuth(); } catch (e) {} }

  // ---- live room state (in-memory, not persisted) ----
  App.room = {
    code: null,        // current room code (null = offline)
    password: null,    // PLAINTEXT password, kept locally so we can copy it for
                       // sharing (only the hash is ever stored in the DB)
    pwHash: null,      // sha-256 of the password
    name: null,        // this user's display name in the room
    ref: null,         // firebase ref for rooms/<code>/state
    membersRef: null,  // firebase ref for rooms/<code>/members
    members: [],       // [{ id, name }] currently present (live)
    applying: false,   // true while applying a remote update (suppresses push)
    pushTimer: null,   // debounce timer for outgoing pushes
    listeners: []      // ui callbacks on room status changes
  };

  // Remembered display name (so we don't re-ask every time on a device).
  App.savedName = function () {
    try { return localStorage.getItem('sl-name') || ''; } catch (e) { return ''; }
  };
  App.rememberName = function (n) {
    try { if (n) localStorage.setItem('sl-name', n); } catch (e) {}
  };

  // Generate a short, friendly, hard-to-guess room code and password.
  function randStr(len, alphabet) {
    var a = alphabet || 'abcdefghijkmnpqrstuvwxyz23456789'; // no look-alikes
    var out = '';
    var arr = new Uint32Array(len);
    crypto.getRandomValues(arr);
    for (var i = 0; i < len; i++) out += a[arr[i] % a.length];
    return out;
  }
  App.genRoomCode = function (gameKey) {
    var base = cleanCode(gameKey || 'run');
    return (base ? base + '-' : '') + randStr(5);
  };
  App.genRoomPassword = function () { return randStr(8); };

  function emit() {
    App.room.listeners.forEach(function (fn) {
      try { fn(App.room.code); } catch (e) { /* ignore */ }
    });
  }
  App.onRoomChange = function (fn) { App.room.listeners.push(fn); };

  // sanitize a user code into a valid firebase key
  function cleanCode(code) {
    return String(code || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 40);
  }
  App.cleanRoomCode = cleanCode;

  // SHA-256 hex via the Web Crypto API (https/localhost only).
  function sha256(text) {
    var enc = new TextEncoder().encode(text);
    return crypto.subtle.digest('SHA-256', enc).then(function (buf) {
      return Array.prototype.map
        .call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); })
        .join('');
    });
  }

  // ---- create / join / leave ----------------------------------------------

  // Create (or overwrite) a room with the current App.state and a password.
  // name = this user's display name in the room. Resolves with the code.
  App.createRoom = function (rawCode, password, name) {
    var d = ensureDb();
    if (!d) return Promise.reject(new Error('Sync is unavailable (offline?).'));
    var code = cleanCode(rawCode);
    if (!code) return Promise.reject(new Error('Please enter a room code.'));
    if (!password) return Promise.reject(new Error('Please set a room password.'));

    return ensureAuth().then(function () {
      return sha256(password);
    }).then(function (pwHash) {
      var payload = {
        pwHash: pwHash,                     // stored password hash (never plaintext)
        owner: App.deviceId(),
        updatedAt: firebase.database.ServerValue.TIMESTAMP,
        state: App.serializeState()
      };
      return d.ref('rooms/' + code).update(payload).then(function () {
        bindRoom(code, pwHash, password, name);
        return code;
      });
    });
  };

  // Join an existing room: verify the password against the stored hash, then
  // pull its state and start listening. name = this user's display name.
  App.joinRoom = function (rawCode, password, name) {
    var d = ensureDb();
    if (!d) return Promise.reject(new Error('Sync is unavailable (offline?).'));
    var code = cleanCode(rawCode);
    if (!code) return Promise.reject(new Error('Please enter a room code.'));

    return ensureAuth().then(function () {
      return sha256(password || '');
    }).then(function (pwHash) {
      return d.ref('rooms/' + code).get().then(function (snap) {
        if (!snap.exists()) throw new Error('Room "' + code + '" does not exist.');
        var data = snap.val();
        if (!data || data.pwHash !== pwHash) throw new Error('Wrong password for room "' + code + '".');
        bindRoom(code, pwHash, password || '', name);
        if (data.state) {
          App.room.applying = true;
          App.applyState(data.state, true);
          App.room.applying = false;
          if (App.render) App.render();
        }
        return code;
      });
    });
  };

  // Start mirroring local changes -> room, room updates -> local, and register
  // this user in the room's live presence list.
  function bindRoom(code, pwHash, password, name) {
    leaveRoom(true); // drop any previous binding first (no UI emit yet)
    App.room.code = code;
    App.room.pwHash = pwHash;
    App.room.password = password != null ? password : null;
    App.room.name = name || App.savedName() || 'Guest';
    App.room.ref = ensureDb().ref('rooms/' + code + '/state');

    // ---- presence: list who is in the room (auto-removed on disconnect) ----
    var myId = App.deviceId();
    var meRef = ensureDb().ref('rooms/' + code + '/members/' + myId);
    meRef.set({ name: App.room.name, joinedAt: firebase.database.ServerValue.TIMESTAMP });
    meRef.onDisconnect().remove();
    App.room.membersRef = ensureDb().ref('rooms/' + code + '/members');
    App.room.membersRef.on('value', function (snap) {
      var v = snap.val() || {};
      App.room.members = Object.keys(v).map(function (id) {
        return { id: id, name: (v[id] && v[id].name) || 'Guest', me: id === myId };
      }).sort(function (a, b) { return (a.joinedAt || 0) - (b.joinedAt || 0); });
      emit();
      if (App.state && App.state.activeTab === 'Room' && App.render) App.render();
    });

    // remote -> local
    App.room.ref.on('value', function (snap) {
      var remote = snap.val();
      if (!remote) return;
      // don't clobber our own just-sent state if nothing meaningful differs
      App.room.applying = true;
      try { App.applyState(remote, true); } catch (e) { /* ignore bad payloads */ }
      App.room.applying = false;
      if (App.render) App.render();
    });
    emit();
  }

  // Push the current state to the room (debounced). Called from markDirty.
  App.pushRoomState = function () {
    if (!App.room.code || App.room.applying) return;
    if (App.room.pushTimer) clearTimeout(App.room.pushTimer);
    App.room.pushTimer = setTimeout(function () {
      var d = ensureDb();
      if (!d || !App.room.code) return;
      d.ref('rooms/' + App.room.code).update({
        updatedAt: firebase.database.ServerValue.TIMESTAMP,
        state: App.serializeState()
      }).catch(function () { /* surfaced by the UI elsewhere if needed */ });
    }, 400);
  };

  // Leave the room (stop syncing). silent=true skips the UI notification (used
  // internally when re-binding).
  function leaveRoom(silent) {
    // remove our presence entry + stop listening to the member list
    if (App.room.code) {
      try { ensureDb().ref('rooms/' + App.room.code + '/members/' + App.deviceId()).remove(); } catch (e) {}
    }
    if (App.room.membersRef) { App.room.membersRef.off(); App.room.membersRef = null; }
    if (App.room.ref) { App.room.ref.off(); App.room.ref = null; }
    if (App.room.pushTimer) { clearTimeout(App.room.pushTimer); App.room.pushTimer = null; }
    App.room.code = null;
    App.room.pwHash = null;
    App.room.password = null;
    App.room.name = null;
    App.room.members = [];
    App.room.applying = false;
    if (!silent) emit();
  }
  App.leaveRoom = function () { leaveRoom(false); };

  // One-click invite link for the current room: code + password in the URL hash
  // (the hash is never sent to the server). Empty if not in a room.
  App.inviteLink = function () {
    if (!App.room.code) return '';
    var base = location.origin + location.pathname;
    var frag = 'room=' + encodeURIComponent(App.room.code);
    if (App.room.password) frag += '&pw=' + encodeURIComponent(App.room.password);
    return base + '#' + frag;
  };

  // Parse an incoming invite (from location.hash). Returns {code, pw} or null.
  App.parseInvite = function () {
    var h = (location.hash || '').replace(/^#/, '');
    if (!h) return null;
    var params = {};
    h.split('&').forEach(function (kv) {
      var i = kv.indexOf('=');
      if (i > 0) params[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
    });
    if (!params.room) return null;
    return { code: params.room, pw: params.pw || '' };
  };
  // clear the invite from the URL bar so the password isn't left lying around
  App.clearInvite = function () {
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  };

  // A stable-ish per-browser id (so a room knows who created it). Not security.
  App.deviceId = function () {
    try {
      var k = 'sl-device-id';
      var v = localStorage.getItem(k);
      if (!v) { v = 'd-' + Math.random().toString(36).slice(2, 10); localStorage.setItem(k, v); }
      return v;
    } catch (e) { return 'd-anon'; }
  };

})(window.App);
