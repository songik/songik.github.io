// 앱 상태
let isAuthenticated = false;
let currentPage = "home";
let currentView = "calendar"; // 'list' 또는 'calendar' - 기본값을 calendar로 변경
const app = document.getElementById("app");
let editors = {}; // 텍스트 에디터 객체 보관용

// 현재 날짜 가져오기
const today = new Date();
const currentYear = today.getFullYear();
const currentMonth = today.getMonth();

// 모달 열린 상태 관리
let isModalOpen = false;

// =========== 읽기 절약 캐시 (Firestore 읽기 횟수 줄이기) ===========
// 동작 방식
//  1) 컬렉션을 한 번 읽으면 메모리와 이 기기(IndexedDB)에 저장해 두고, 메뉴를 옮기거나 저장한 뒤에는 다시 읽지 않습니다.
//  2) 저장/수정/삭제가 일어나면 settings/syncMeta 문서의 컬렉션별 버전 번호를 올립니다.
//     다른 기기는 이 문서 1건만 읽어서 바뀐 컬렉션만 다시 읽습니다.
//  3) 내가 저장한 항목은 해당 문서 1건만 다시 읽어 캐시에 반영합니다(전체를 다시 읽지 않음).
//  4) syncMeta를 쓸 수 없는 경우(권한 등)에는 이번 접속 동안의 메모리 캐시만 사용합니다.
const DB_CACHE_ROOTS = ['events', 'todos', 'goals', 'weights', 'transactions', 'diaries', 'notes', 'habits', 'bloodpressures', 'dateColors', 'bpDateColors', 'habitCategories'];
const DB_CACHE_SCHEMA = 1;
const DB_CACHE_META_TTL_MS = 20 * 1000;              // 다른 기기 변경 여부 확인 간격
const DB_CACHE_MAX_AGE_MS = 2 * 24 * 60 * 60 * 1000;  // 이보다 오래된 캐시는 한 번 새로 읽음 (안전장치)
const DB_CACHE_FALLBACK_AGE_MS = 5 * 60 * 1000;       // syncMeta를 못 쓸 때 메모리 캐시 유효 시간
const DB_CACHE_BATCH_PATCH_LIMIT = 100;               // 한 번에 이 개수보다 많이 바뀌면 컬렉션을 다시 읽음

window.dbCache = { mem: {}, inflight: {}, queues: {}, meta: null, metaCheckedAt: 0, metaOk: true, metaPending: null, hooked: false, persistTimers: {}, statTimer: null, suppress: 0 };
window.dbReadStats = { total: 0, byRoot: {} };

// ---------- 읽기 횟수 집계 ----------
function dbCountReads(path, n) {
  if (!n) return;
  const stats = window.dbReadStats;
  stats.total += n;
  const root = (typeof path === 'string' && path) ? path.split('/')[0] : '기타';
  stats.byRoot[root] = (stats.byRoot[root] || 0) + n;
  if (window.dbCache.statTimer) return;
  window.dbCache.statTimer = setTimeout(function () {
    window.dbCache.statTimer = null;
    const el = document.getElementById('read-stats');
    if (el) el.textContent = '읽기 ' + window.dbReadStats.total.toLocaleString() + '건';
  }, 200);
}

// ---------- 값 직렬화 (IndexedDB 저장용) ----------
function dbEncode(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(dbEncode);
  if (typeof v.toMillis === 'function' && typeof v.seconds === 'number') return { __hp: 'ts', s: v.seconds, n: v.nanoseconds };
  if (v instanceof Date) return { __hp: 'd', t: v.getTime() };
  if (typeof v.path === 'string' && typeof v.collection === 'function') return { __hp: 'ref', p: v.path };
  if (typeof v.latitude === 'number' && typeof v.longitude === 'number' && typeof v.isEqual === 'function') return { __hp: 'geo', la: v.latitude, lo: v.longitude };
  const proto = Object.getPrototypeOf(v);
  if (proto !== null && Object.getPrototypeOf(proto) !== null) throw new Error('저장할 수 없는 값 형식'); // 일반 객체만 허용
  const out = {};
  Object.keys(v).forEach(function (k) { out[k] = dbEncode(v[k]); });
  return out;
}

function dbDecode(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(dbDecode);
  if (v.__hp === 'ts') return new firebase.firestore.Timestamp(v.s, v.n);
  if (v.__hp === 'd') return new Date(v.t);
  if (v.__hp === 'ref') return db.doc(v.p);
  if (v.__hp === 'geo') return new firebase.firestore.GeoPoint(v.la, v.lo);
  const out = {};
  Object.keys(v).forEach(function (k) { out[k] = dbDecode(v[k]); });
  return out;
}

// ---------- IndexedDB (이 기기에 저장) ----------
function dbIdbKey(root) {
  let project = '';
  try { project = firebase.app().options.projectId || ''; } catch (e) { project = ''; }
  return 'entry:' + project + ':' + root;
}

function dbIdbOpen() {
  const C = window.dbCache;
  if (!C.idbPromise) {
    C.idbPromise = new Promise(function (resolve, reject) {
      try {
        const req = window.indexedDB.open('hp-read-cache', 1);
        req.onupgradeneeded = function () { req.result.createObjectStore('kv'); };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      } catch (err) { reject(err); }
    });
  }
  return C.idbPromise;
}

async function dbIdbRun(mode, fn) {
  const idb = await dbIdbOpen();
  return new Promise(function (resolve, reject) {
    const tx = idb.transaction('kv', mode);
    const store = tx.objectStore('kv');
    const req = fn(store);
    tx.oncomplete = function () { resolve(req ? req.result : undefined); };
    tx.onerror = function () { reject(tx.error); };
    tx.onabort = function () { reject(tx.error); };
  });
}

async function dbIdbLoad(root) {
  try {
    const raw = await dbIdbRun('readonly', function (s) { return s.get(dbIdbKey(root)); });
    if (!raw || raw.schema !== DB_CACHE_SCHEMA) return null;
    const docs = new Map();
    raw.docs.forEach(function (d) { docs.set(d[0], { id: d[0], data: dbDecode(d[1]) }); });
    const subs = {};
    Object.keys(raw.subs || {}).forEach(function (k) {
      const m = new Map();
      raw.subs[k].forEach(function (d) { m.set(d[0], { id: d[0], data: dbDecode(d[1]) }); });
      subs[k] = m;
    });
    return { version: raw.version, fetchedAt: raw.fetchedAt, docs: docs, subs: subs, dirty: false };
  } catch (err) {
    return null;
  }
}

async function dbIdbSave(root) {
  const e = window.dbCache.mem[root];
  if (!e || e.dirty || window.dbCache.metaOk === false) return;
  try {
    const raw = { schema: DB_CACHE_SCHEMA, root: root, version: e.version, fetchedAt: e.fetchedAt, docs: [], subs: {} };
    e.docs.forEach(function (d) { raw.docs.push([d.id, dbEncode(d.data)]); });
    Object.keys(e.subs).forEach(function (k) {
      const arr = [];
      e.subs[k].forEach(function (d) { arr.push([d.id, dbEncode(d.data)]); });
      raw.subs[k] = arr;
    });
    await dbIdbRun('readwrite', function (s) { return s.put(raw, dbIdbKey(root)); });
  } catch (err) {
    // 저장에 실패해도 화면 동작에는 영향이 없습니다 (다음 접속 때 다시 읽을 뿐)
    try { await dbIdbRun('readwrite', function (s) { return s.delete(dbIdbKey(root)); }); } catch (e2) { /* 무시 */ }
  }
}

function dbSchedulePersist(root) {
  const C = window.dbCache;
  if (C.persistTimers[root]) clearTimeout(C.persistTimers[root]);
  C.persistTimers[root] = setTimeout(function () {
    C.persistTimers[root] = null;
    dbIdbSave(root);
  }, 800);
}

async function dbIdbClear() {
  try { await dbIdbRun('readwrite', function (s) { return s.clear(); }); } catch (err) { /* 무시 */ }
}

// ---------- 동기화 정보 (settings/syncMeta) ----------
function dbMetaRef() {
  return db.collection('settings').doc('syncMeta');
}

async function dbGetMeta(force) {
  const C = window.dbCache;
  if (C.metaOk === false) return null;
  if (!force && C.meta && Date.now() - C.metaCheckedAt < DB_CACHE_META_TTL_MS) return C.meta;
  if (C.metaPending) return C.metaPending;

  C.metaPending = (async function () {
    try {
      const snap = await dbMetaRef().get();
      if (snap.exists) {
        C.meta = snap.data() || {};
      } else {
        // 최초 1회: 문서를 만들 수 있는지 확인 (못 만들면 아래 catch에서 메모리 캐시 모드로 전환)
        await dbMetaRef().set({ createdAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
        C.meta = {};
      }
      C.metaCheckedAt = Date.now();
      return C.meta;
    } catch (err) {
      console.warn('동기화 정보(settings/syncMeta)를 사용할 수 없어 이번 접속에서는 메모리 캐시만 사용합니다:', err);
      C.metaOk = false;
      return null;
    } finally {
      C.metaPending = null;
    }
  })();
  return C.metaPending;
}

async function dbBumpMeta(root) {
  const C = window.dbCache;
  if (C.metaOk === false) return null;
  try {
    await dbMetaRef().set({ [root]: firebase.firestore.FieldValue.increment(1) }, { merge: true });
    const snap = await dbMetaRef().get();
    const m = snap.data() || {};
    C.meta = m;
    C.metaCheckedAt = Date.now();
    return m[root] || 0;
  } catch (err) {
    console.warn('동기화 정보 갱신 실패 - 이번 접속에서는 메모리 캐시만 사용합니다:', err);
    C.metaOk = false;
    try { await dbIdbClear(); } catch (e2) { /* 무시 */ }
    return null;
  }
}

// ---------- 컬렉션 캐시 ----------
async function dbFetchEntry(root, want) {
  const snap = await db.collection(root).get();
  const docs = new Map();
  snap.forEach(function (d) { docs.set(d.id, { id: d.id, data: d.data() }); });
  const e = { version: want === null ? 0 : want, fetchedAt: Date.now(), docs: docs, subs: {}, dirty: false };
  window.dbCache.mem[root] = e;
  if (want !== null) dbSchedulePersist(root);
  return e;
}

async function dbEnsureEntry(root) {
  const C = window.dbCache;
  if (C.inflight[root]) return C.inflight[root];

  const p = (async function () {
    const meta = await dbGetMeta(false);
    const want = meta ? (meta[root] || 0) : null;
    const now = Date.now();
    const isFresh = function (e) {
      if (!e || e.dirty) return false;
      if (want === null) return now - e.fetchedAt < DB_CACHE_FALLBACK_AGE_MS;
      return e.version === want && now - e.fetchedAt < DB_CACHE_MAX_AGE_MS;
    };

    let e = C.mem[root];
    if (!isFresh(e) && want !== null) {
      const stored = await dbIdbLoad(root);
      if (stored && isFresh(stored)) {
        C.mem[root] = stored;
        e = stored;
      }
    }
    if (!isFresh(e)) {
      e = await dbFetchEntry(root, want);
    }
    return e;
  })();

  C.inflight[root] = p;
  try {
    return await p;
  } finally {
    if (C.inflight[root] === p) delete C.inflight[root];
  }
}

function dbSortValue(v) {
  if (v && typeof v.toMillis === 'function') return v.toMillis();
  if (v instanceof Date) return v.getTime();
  return v;
}

function dbCompare(a, b) {
  a = dbSortValue(a);
  b = dbSortValue(b);
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  if (typeof a !== typeof b) return typeof a < typeof b ? -1 : 1;
  return a < b ? -1 : 1;
}

// Firestore 쿼리 결과(snapshot)처럼 쓸 수 있는 객체 만들기: docs, size, empty, forEach, doc.id, doc.data()
function dbMakeSnapshot(list) {
  const docs = list.map(function (d) {
    return { id: d.id, exists: true, data: function () { return d.data; } };
  });
  return {
    docs: docs,
    size: docs.length,
    empty: docs.length === 0,
    forEach: function (fn) { docs.forEach(fn); }
  };
}

// 컬렉션 전체 읽기 (캐시 사용). opts.orderBy / opts.dir 은 Firestore orderBy와 같은 의미
// (orderBy 필드가 없는 문서는 Firestore처럼 결과에서 제외)
async function cachedCollection(root, opts) {
  opts = opts || {};
  if (!dbInstallHooks()) {
    // 캐시를 쓸 수 없는 환경: 예전처럼 서버에서 직접 읽기
    let q = db.collection(root);
    if (opts.orderBy) q = q.orderBy(opts.orderBy, opts.dir === 'desc' ? 'desc' : 'asc');
    return q.get();
  }
  const e = await dbEnsureEntry(root);
  let list = Array.from(e.docs.values());
  const dir = opts.dir === 'desc' ? -1 : 1;
  if (opts.orderBy) {
    list = list.filter(function (d) { return d.data[opts.orderBy] !== undefined; });
    list.sort(function (x, y) {
      const c = dbCompare(x.data[opts.orderBy], y.data[opts.orderBy]);
      if (c) return c * dir;
      return x.id < y.id ? -dir : (x.id > y.id ? dir : 0);
    });
  } else {
    list.sort(function (x, y) { return x.id < y.id ? -1 : (x.id > y.id ? 1 : 0); });
  }
  return dbMakeSnapshot(list);
}

// 하위 컬렉션 읽기 (예: goals/{id}/tasks, habits/{id}/records) - 캐시 사용
async function cachedSubcollection(root, parentId, subName) {
  if (!dbInstallHooks()) return db.collection(root).doc(parentId).collection(subName).get();
  const e = await dbEnsureEntry(root);
  const k = parentId + '/' + subName;
  if (!e.subs[k]) {
    const snap = await db.collection(root).doc(parentId).collection(subName).get();
    const m = new Map();
    snap.forEach(function (d) { m.set(d.id, { id: d.id, data: d.data() }); });
    e.subs[k] = m;
    if (window.dbCache.metaOk !== false) dbSchedulePersist(root);
  }
  const list = Array.from(e.subs[k].values());
  list.sort(function (x, y) { return x.id < y.id ? -1 : (x.id > y.id ? 1 : 0); });
  return dbMakeSnapshot(list);
}

// 문서 1건 읽기 (캐시 사용)
async function cachedDoc(root, id) {
  if (!dbInstallHooks()) return db.collection(root).doc(id).get();
  const e = await dbEnsureEntry(root);
  const d = e.docs.get(id);
  return { id: id, exists: !!d, data: function () { return d ? d.data : undefined; } };
}

// ---------- 쓰기 반영 ----------
function dbEnqueue(root, fn) {
  const C = window.dbCache;
  const prev = C.queues[root] || Promise.resolve();
  const next = prev.then(fn).catch(function (err) {
    console.warn('캐시 반영 실패 (다음 조회 때 다시 읽습니다):', root, err);
    const e = C.mem[root];
    if (e) e.dirty = true;
  });
  C.queues[root] = next;
  return next;
}

function dbNoteWrites(items) {
  const groups = {};
  (items || []).forEach(function (it) {
    try {
      const segs = String(it.ref.path).split('/');
      if (DB_CACHE_ROOTS.indexOf(segs[0]) < 0) return;
      (groups[segs[0]] = groups[segs[0]] || []).push({ ref: it.ref, segs: segs, deleted: !!it.deleted });
    } catch (err) { /* 무시 */ }
  });
  const roots = Object.keys(groups);
  if (!roots.length) return Promise.resolve();
  return Promise.all(roots.map(function (root) {
    return dbEnqueue(root, function () { return dbApplyWrites(root, groups[root]); });
  }));
}

async function dbApplyWrites(root, items) {
  const C = window.dbCache;
  if (C.inflight[root]) {
    try { await C.inflight[root]; } catch (err) { /* 무시 */ }
  }
  const e = C.mem[root];
  const patchable = !!e && !e.dirty && items.length <= DB_CACHE_BATCH_PATCH_LIMIT;

  // 변경된 문서 1건씩만 다시 읽기 + 동기화 버전 올리기 (동시에 진행)
  const refetch = async function () {
    const results = [];
    for (const it of items) {
      if (it.deleted) { results.push({ it: it, exists: false }); continue; }
      try {
        const snap = await it.ref.get();
        results.push({ it: it, exists: snap.exists, data: snap.exists ? snap.data() : undefined });
      } catch (err) {
        results.push({ it: it, failed: true });
      }
    }
    return results;
  };

  const out = await Promise.all([dbBumpMeta(root), patchable ? refetch() : Promise.resolve([])]);
  const newVer = out[0];
  const results = out[1];
  if (!e) return; // 이번 접속에서 읽은 적이 없으면 다음 조회 때 버전 차이로 다시 읽음

  if (!patchable) {
    e.dirty = true;
    return;
  }

  for (const r of results) {
    const segs = r.it.segs;
    if (r.failed) { e.dirty = true; continue; }
    if (segs.length === 2) {
      const id = segs[1];
      if (r.exists) {
        e.docs.set(id, { id: id, data: r.data });
      } else {
        e.docs.delete(id);
        Object.keys(e.subs).forEach(function (k) { if (k.indexOf(id + '/') === 0) delete e.subs[k]; });
      }
    } else if (segs.length === 4) {
      const m = e.subs[segs[1] + '/' + segs[2]];
      if (m) {
        if (r.exists) m.set(segs[3], { id: segs[3], data: r.data });
        else m.delete(segs[3]);
      }
    } else {
      e.dirty = true;
    }
  }

  if (newVer !== null) {
    if (newVer === e.version + 1) e.version = newVer; // 내 저장만 반영된 상태 → 캐시가 최신
    else e.dirty = true;                               // 다른 기기가 동시에 바꿈 → 다음에 다시 읽음
  }
  if (!e.dirty) dbSchedulePersist(root);
}

// ---------- Firestore 쓰기/읽기 후킹 ----------
// 쓰기(add/set/update/delete/batch)가 일어나면 캐시를 갱신하고, 읽기 횟수를 집계합니다.
// 하나라도 후킹할 수 없으면 아무것도 바꾸지 않고, 캐시 없이 예전 방식(항상 서버에서 읽기)으로 동작합니다.
function dbInstallHooks() {
  const C = window.dbCache;
  if (C.hooked) return true;
  if (C.hookFailed) return false;
  if (!window.db || typeof db.collection !== 'function') return false;

  try {
    const col = db.collection('__probe__');
    const docRef = col.doc('__probe__');
    const batch = db.batch();

    const owner = function (obj, name) {
      let p = Object.getPrototypeOf(obj);
      while (p) {
        if (Object.prototype.hasOwnProperty.call(p, name)) return p;
        p = Object.getPrototypeOf(p);
      }
      return null;
    };

    const plan = [];
    const add = function (sample, name, make) {
      const p = owner(sample, name);
      if (!p || typeof p[name] !== 'function') throw new Error('메서드를 찾을 수 없음: ' + name);
      plan.push({ proto: p, name: name, make: make });
    };

    // 읽기 횟수 집계
    add(col, 'get', function (orig) {
      return function () {
        const q = this;
        return orig.apply(this, arguments).then(function (snap) {
          try { dbCountReads(q.path, snap.size); } catch (e) { /* 무시 */ }
          return snap;
        });
      };
    });
    add(docRef, 'get', function (orig) {
      return function () {
        const d = this;
        return orig.apply(this, arguments).then(function (snap) {
          try { dbCountReads(d.path, 1); } catch (e) { /* 무시 */ }
          return snap;
        });
      };
    });

    // 단일 문서 쓰기
    // (SDK 내부에서 add/commit이 set 등을 다시 부르는 경우 이중 반영되지 않도록 suppress 사용)
    const call = function (self, orig, args) {
      const C2 = window.dbCache;
      C2.suppress++;
      try { return orig.apply(self, args); } finally { C2.suppress--; }
    };
    add(col, 'add', function (orig) {
      return function () {
        const skip = window.dbCache.suppress > 0;
        const p = call(this, orig, arguments);
        if (skip) return p;
        return p.then(function (ref) {
          return dbNoteWrites([{ ref: ref, deleted: false }]).then(function () { return ref; });
        });
      };
    });
    ['update', 'set'].forEach(function (name) {
      add(docRef, name, function (orig) {
        return function () {
          const ref = this;
          const skip = window.dbCache.suppress > 0;
          const p = call(this, orig, arguments);
          if (skip) return p;
          return p.then(function (res) {
            return dbNoteWrites([{ ref: ref, deleted: false }]).then(function () { return res; });
          });
        };
      });
    });
    add(docRef, 'delete', function (orig) {
      return function () {
        const ref = this;
        const skip = window.dbCache.suppress > 0;
        const p = call(this, orig, arguments);
        if (skip) return p;
        return p.then(function (res) {
          return dbNoteWrites([{ ref: ref, deleted: true }]).then(function () { return res; });
        });
      };
    });

    // 배치 쓰기
    ['set', 'update', 'delete'].forEach(function (name) {
      add(batch, name, function (orig) {
        return function (ref) {
          (this.__hpRefs = this.__hpRefs || []).push({ ref: ref, deleted: name === 'delete' });
          return orig.apply(this, arguments);
        };
      });
    });
    add(batch, 'commit', function (orig) {
      return function () {
        const refs = this.__hpRefs || [];
        this.__hpRefs = [];
        const skip = window.dbCache.suppress > 0;
        const p = call(this, orig, arguments);
        if (skip) return p;
        return p.then(function (res) {
          return dbNoteWrites(refs).then(function () { return res; });
        });
      };
    });

    // 모두 확인된 뒤에 한꺼번에 적용
    plan.forEach(function (item) { item.proto[item.name] = item.make(item.proto[item.name]); });
    C.hooked = true;
    return true;
  } catch (err) {
    console.warn('읽기 절약 기능을 켜지 못했습니다 (기존 방식으로 동작):', err);
    C.hookFailed = true;
    return false;
  }
}

// 캐시를 모두 지우고 현재 화면을 다시 불러오기 (다른 기기 변경이 안 보일 때 사용)
async function refreshAllData() {
  const C = window.dbCache;
  C.mem = {};
  C.inflight = {};
  C.meta = null;
  C.metaCheckedAt = 0;
  C.metaOk = true;
  window.habitCategories = null;
  await dbIdbClear();
  if (typeof renderPage === 'function') renderPage(currentPage);
}

// 로그아웃 시 이 기기에 저장된 캐시 삭제
async function dbClearLocalCache() {
  const C = window.dbCache;
  C.mem = {};
  C.inflight = {};
  C.meta = null;
  C.metaCheckedAt = 0;
  await dbIdbClear();
}

dbInstallHooks();


// =========== 인증 관련 함수 ===========

// 사용자 인증 확인
// app.js 파일의 checkAuth 함수
function checkAuth() {
  
  const isAuth = localStorage.getItem("isAuthenticated");
  if (isAuth === "true") {
    isAuthenticated = true;
    renderApp();
  } else {
    isAuthenticated = false;
    renderAuthPage();
  }
}

// 인증 페이지 렌더링
function renderAuthPage() {
  app.innerHTML = `
    <div class="auth-container">
      <div class="auth-card">
        <div class="auth-logo">흔들갈대</div>
        <h2>로그인</h2>
        <form id="auth-form">
          <div class="form-group">
            <label for="password">비밀번호</label>
            <input
              type="password"
              id="password"
              required
            />
          </div>
          <div id="error-message" class="error-message"></div>
          <button type="submit" class="auth-button">입장하기</button>
        </form>
      </div>
    </div>
  `;

  // 인증 폼 이벤트 리스너
  document.getElementById("auth-form").addEventListener("submit", function(e) {
    e.preventDefault();
    const password = document.getElementById("password").value;
    
    // Firebase에서 비밀번호 확인
    checkPassword(password);
  });
}

// 비밀번호 확인
async function checkPassword(password) {
  try {
    // 먼저 기본 비밀번호 확인
    if (password === DEFAULT_PASSWORD) {
      localStorage.setItem("isAuthenticated", "true");
      isAuthenticated = true;
      renderApp();
      return;
    }

    // Firestore가 제대로 초기화되었는지 확인
    if (!db) {
      console.error("Firebase Firestore가 초기화되지 않았습니다.");
      alert("서버 연결에 문제가 있습니다. 기본 비밀번호로 로그인해 주세요.");
      return;
    }

    // Firestore에서 설정된 비밀번호를 확인
    const passwordRef = db.collection("settings").doc("password");
    const doc = await passwordRef.get();
    
    if (doc.exists && doc.data().value === password) {
      // 비밀번호 일치
      localStorage.setItem("isAuthenticated", "true");
      isAuthenticated = true;
      renderApp();
    } else {
      // 비밀번호 불일치
      document.getElementById("error-message").textContent = "비밀번호가 일치하지 않습니다.";
    }
  } catch (error) {
    console.error("비밀번호 확인 중 오류 발생:", error);
    document.getElementById("error-message").textContent = 
      "인증 중 오류가 발생했습니다. 기본 비밀번호(sik282)를 사용해보세요.";
  }
}

// =========== 메인 앱 렌더링 함수 ===========

// 앱 화면 렌더링
function renderApp() {
  dbInstallHooks(); // 읽기 절약(캐시) 기능 켜기
  // 네비게이션 바와 콘텐츠 영역 렌더링
  app.innerHTML = `
    <nav class="navbar">
      <div class="navbar-container">
        <div class="navbar-logo">
          <a href="#" onclick="navigateTo('home')"><img src="logo.png" alt="흔들갈대" class="navbar-logo-image"></a>
        </div>
        <div class="menu-icon" onclick="toggleMenu()">
          <i class="fas fa-bars"></i>
        </div>
        <ul class="nav-menu" id="nav-menu">
          <li class="nav-item">
            <a href="#" class="nav-links" onclick="navigateTo('home')">HOME</a>
          </li>
          <li class="nav-item">
            <a href="#" class="nav-links" onclick="navigateTo('calendar')">일정</a>
          </li>
          <li class="nav-item">
            <a href="#" class="nav-links" onclick="navigateTo('todo')">뭐해?</a>
          </li>
          <li class="nav-item">
            <a href="#" class="nav-links" onclick="navigateTo('progress')">진행률</a>
          </li>
          <li class="nav-item">
            <a href="#" class="nav-links" onclick="navigateTo('diet')">그만먹어</a>
          </li>
          <li class="nav-item">
            <a href="#" class="nav-links" onclick="navigateTo('expense')">그만써</a>
          </li>
          <li class="nav-item">
            <a href="#" class="nav-links" onclick="navigateTo('diary')">일기</a>
          </li>
          <li class="nav-item">
            <a href="#" class="nav-links" onclick="navigateTo('notes')">메모</a>
          </li>
          <li class="nav-item">
            <a href="#" class="nav-links" onclick="navigateTo('habits')">습관</a>
          </li>
          <li class="nav-item">
            <a href="#" class="nav-links" onclick="navigateTo('bp')">혈압</a>
          </li>
          <li class="nav-item">
            <a href="#" class="nav-links" onclick="navigateTo('search')">검색</a>
          </li>
        </ul>
        <div class="navbar-logout">
          <span id="read-stats" title="이번 접속에서 서버(Firestore)에서 읽은 문서 수 (무료 한도: 하루 5만 건)"></span>
          <button onclick="refreshAllData()" class="logout-button refresh-data-button" title="다른 기기에서 바꾼 내용이 안 보일 때 눌러주세요 (서버에서 다시 읽어옵니다)">
            새로고침
          </button>
          <button onclick="logout()" class="logout-button">
            로그아웃
          </button>
        </div>
        <style>
          #read-stats { font-size: 0.75rem; color: #999; margin-right: 8px; }
          .refresh-data-button { margin-right: 6px; }
          .refresh-data-button:hover { background-color: #e3f2fd !important; color: #1976d2 !important; border-color: #1976d2 !important; }
          @media (max-width: 768px) { #read-stats { display: none; } }
        </style>
      </div>
    </nav>
    <div id="content" class="content">
      <!-- 현재 페이지 내용이 여기에 표시됩니다 -->
    </div>
    <div id="modal-container"></div>
  `;

  // 활성 메뉴 표시
  updateActiveMenu();

  // 읽기 횟수 표시 (이번 접속 기준)
  const readStatsEl = document.getElementById("read-stats");
  if (readStatsEl) readStatsEl.textContent = "읽기 " + window.dbReadStats.total.toLocaleString() + "건";
  
  // 현재 페이지 렌더링
  renderPage(currentPage);
}

// 메뉴 토글 (모바일용)
function toggleMenu() {
  const navMenu = document.getElementById("nav-menu");
  navMenu.classList.toggle("active");
  
  const menuIcon = document.querySelector(".menu-icon i");
  if (navMenu.classList.contains("active")) {
    menuIcon.classList.remove("fa-bars");
    menuIcon.classList.add("fa-times");
  } else {
    menuIcon.classList.remove("fa-times");
    menuIcon.classList.add("fa-bars");
  }
}

// 활성 메뉴 업데이트
function updateActiveMenu() {
  // 모든 네비게이션 링크에서 active 클래스 제거
  document.querySelectorAll(".nav-links").forEach(link => {
    link.classList.remove("active");
  });
  
  // 현재 페이지에 해당하는 링크에 active 클래스 추가
  const activeLink = document.querySelector(`.nav-links[onclick="navigateTo('${currentPage}')"]`);
  if (activeLink) {
    activeLink.classList.add("active");
  }
}

// 페이지 이동
function navigateTo(page) {
  currentPage = page;
  updateActiveMenu();
  renderPage(page);
  
  // 모바일에서 메뉴가 열려있을 경우 닫기
  const navMenu = document.getElementById("nav-menu");
  if (navMenu.classList.contains("active")) {
    toggleMenu();
  }
}

// 로그아웃
function logout() {
  localStorage.removeItem("isAuthenticated"); // 이 줄은 유지해야 합니다
  isAuthenticated = false;
  dbClearLocalCache(); // 이 기기에 저장해 둔 데이터 캐시 삭제
  renderAuthPage();
}

// 뷰 전환 (리스트 <-> 달력)
function toggleView(view) {
  if (currentView !== view) {
    currentView = view;
    
    // 뷰 토글 버튼 업데이트
    const listViewButton = document.getElementById("list-view-button");
    const calendarViewButton = document.getElementById("calendar-view-button");
    
    if (listViewButton && calendarViewButton) {
      if (view === "list") {
        listViewButton.classList.add("active");
        calendarViewButton.classList.remove("active");
      } else {
        listViewButton.classList.remove("active");
        calendarViewButton.classList.add("active");
      }
    }
    
    console.log(`뷰 전환: ${view}`);
    
    // 현재 페이지 컨텐츠 업데이트
    updatePageContent();
    
    // 뷰 컨테이너 표시/숨김 처리 명시적으로 설정
    const listContainer = document.getElementById("list-view-container");
    const calendarContainer = document.getElementById("calendar-view-container");
    
    if (listContainer && calendarContainer) {
      if (view === "list") {
        listContainer.style.display = "block";
        calendarContainer.style.display = "none";
      } else {
        listContainer.style.display = "none";
        calendarContainer.style.display = "block";
        
        // 달력 뷰에서 적절한 간격 유지를 위한 처리
        if (currentPage === "diet" || currentPage === "expense") {
          setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
          }, 100);
        }
      }
    }
  }
}

// 페이지 컨텐츠 업데이트 (뷰 전환 시)
function updatePageContent() {
  switch(currentPage) {
    case "calendar":
      loadEvents();
      break;
    case "todo":
      loadTodos();
      break;
    case "diet":
      loadWeights();
      break;
    case "expense":
      loadTransactions();
      break;
    case "habits":
      loadHabits();
      break;
    case "bp":
      loadBloodPressures();
      break;
  }
}

// =========== 모달 관련 함수 ===========

// 모달 표시
function showModal(title, content, onSave = null) {
  isModalOpen = true;
  const modalContainer = document.getElementById("modal-container");
  
  modalContainer.innerHTML = `
    <div class="modal-overlay" onclick="if(event.target === this) closeModal()">
      <div class="modal">
        <div class="modal-header">
          <h2 class="modal-title">${title}</h2>
          <button class="modal-close" onclick="closeModal()">×</button>
        </div>
        <div class="modal-content">
          ${content}
        </div>
        <div class="modal-actions">
          <button onclick="closeModal()">취소</button>
          ${onSave ? `<button id="modal-save-button">저장</button>` : ''}
        </div>
      </div>
    </div>
  `;
  
  if (onSave) {
    document.getElementById("modal-save-button").addEventListener("click", onSave);
  }
  
  // 입력 필드가 있으면 첫 번째 필드에 포커스
  const firstInput = modalContainer.querySelector("input, textarea, select");
  if (firstInput) {
    setTimeout(() => {
      firstInput.focus();
    }, 100);
  }
}

// 모달 닫기
function closeModal() {
  if (isModalOpen) {
    document.getElementById("modal-container").innerHTML = "";
    isModalOpen = false;
  }
}
// 수정 및 삭제 버튼이 있는 모달 표시 함수 추가
function showModalWithEdit(title, content, onSave = null, itemId = null) {
  isModalOpen = true;
  const modalContainer = document.getElementById("modal-container");
  
  modalContainer.innerHTML = `
    <div class="modal-overlay" onclick="if(event.target === this) closeModal()">
      <div class="modal">
        <div class="modal-header">
          <h2 class="modal-title">${title}</h2>
          <button class="modal-close" onclick="closeModal()">×</button>
        </div>
        <div class="modal-content">
          ${content}
        </div>
        <div class="modal-actions">
          <button onclick="toggleEditMode('${itemId}')" id="edit-mode-button">수정</button>
          <button id="modal-save-button" style="display: none;">저장</button>
          <button onclick="deleteEvent('${itemId}')" class="delete-button" style="background-color: #f44336;">삭제</button>
          <button onclick="closeModal()" class="cancel-button">닫기</button>
        </div>
      </div>
    </div>
  `;
  
  if (onSave) {
    document.getElementById("modal-save-button").addEventListener("click", onSave);
  }
  
  // 처음에는 폼 필드를 읽기 전용으로 설정
  setFormReadOnly(true);
  
  // 입력 필드가 있으면 첫 번째 필드에 포커스
  const firstInput = modalContainer.querySelector("input, textarea, select");
  if (firstInput) {
    setTimeout(() => {
      firstInput.focus();
    }, 100);
  }
}

// 폼 요소 읽기 전용 설정 함수
function setFormReadOnly(readOnly) {
  const formElements = document.querySelectorAll('#event-form input, #event-form select, #event-form textarea');
  formElements.forEach(el => {
    el.readOnly = readOnly;
    el.disabled = readOnly;
  });
  
  // 에디터 편집 가능 여부 설정
  if (editors['event-description-editor']) {
    editors['event-description-editor'].enable(!readOnly);
  }
}

// 수정 모드 토글 함수
function toggleEditMode(itemId) {
  const editButton = document.getElementById('edit-mode-button');
  const saveButton = document.getElementById('modal-save-button');
  
  if (editButton.textContent === '수정') {
    // 수정 모드로 전환
    editButton.textContent = '취소';
    saveButton.style.display = 'inline-block';
    setFormReadOnly(false);
  } else {
    // 읽기 모드로 되돌림
    editButton.textContent = '수정';
    saveButton.style.display = 'none';
    setFormReadOnly(true);
  }
}
// =========== 홈 페이지 렌더링 ===========

// 홈 페이지 렌더링
function renderHomePage(container) {
  container.innerHTML = `
    <div class="home-container">
      <div class="video-background">
        <video autoplay loop muted playsinline>
          <source src="video.mp4" type="video/mp4">
          <p>브라우저가 비디오 태그를 지원하지 않습니다.</p>
        </video>
      </div>
      <div class="quote-container">
        <h2 class="quote-text">헛되이 보낸 오늘은,<br>죽은 이가 그토록 바라던 내일이었다.</h2>
      </div>
    </div>
    <audio id="background-music" loop autoplay>
      <source src="bgm.mp3" type="audio/mpeg">
    </audio>
  `;

  // 배경음악 자동 재생 시도
  const bgMusic = document.getElementById('background-music');
  if(bgMusic) {
    bgMusic.volume = 0.3; // 볼륨 설정
    bgMusic.play().catch(e => console.log("자동 재생이 차단되었습니다: ", e));
  }
}

// =========== 텍스트 에디터 관련 함수 ===========

// 텍스트 에디터 초기화
function initTextEditor(containerId, placeholder = "내용을 입력하세요...", content = "") {
  // 이미 에디터가 있으면 제거
  if (editors[containerId]) {
    editors[containerId] = null;
  }
  
  // 에디터 툴바 옵션 설정
  const toolbarOptions = [
    [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ 'color': [] }, { 'background': [] }],
    [{ 'align': [] }],
    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
    ['blockquote', 'code-block'],
    ['link', 'image'],
    ['clean']
  ];
  
  // 에디터 초기화
  const editor = new Quill(`#${containerId}`, {
    modules: {
      toolbar: toolbarOptions
    },
    placeholder: placeholder,
    theme: 'snow'
  });
  
  // 내용 설정
  if (content) {
    try {
      editor.root.innerHTML = content;
    } catch (e) {
      console.error("에디터 내용 설정 중 오류:", e);
    }
  }
  
  // 에디터 객체 저장
  editors[containerId] = editor;
  
  return editor;
}

// 텍스트 에디터 내용 가져오기
function getEditorContent(containerId) {
  if (editors[containerId]) {
    return editors[containerId].root.innerHTML;
  }
  return "";
}

// =========== 유틸리티 함수 ===========

// 날짜 포맷팅
function formatDate(date, includeTime = false) {
  if (!date) return '';
  
  // Firestore Timestamp를 Date로 변환
  if (date && typeof date.toDate === 'function') {
    date = date.toDate();
  }
  
  try {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    if (!includeTime) {
      return `${year}-${month}-${day}`;
    }
    
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  } catch (err) {
    console.error("날짜 형식 변환 중 오류:", err, date);
    return '';
  }
}

// 날짜 입력값을 Date 객체로 변환
function parseDate(dateString) {
  if (!dateString) return null;
  
  // 이미 Date 객체인 경우
  if (dateString instanceof Date) {
    return dateString;
  }
  
  // YYYY-MM-DD 형식이면 날짜만 있는 경우
  if (dateString.length === 10) {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  
  // YYYY-MM-DD HH:MM 형식이면 시간도 있는 경우
  if (dateString.length >= 16) {
    const [datePart, timePart] = dateString.split(' ');
    const [year, month, day] = datePart.split('-').map(Number);
    const [hours, minutes] = timePart.split(':').map(Number);
    return new Date(year, month - 1, day, hours, minutes);
  }
  
  // 그 외의 경우 Date 객체로 변환 시도
  return new Date(dateString);
}

// 여기에 formatFullCalendarDate 함수를 추가하세요
// FullCalendar 날짜 포맷 변환 유틸리티
function formatFullCalendarDate(date, isEnd = false, isAllDay = false) {
  if (!date) return null;
  
  // Firestore Timestamp를 Date로 변환
  if (date && typeof date.toDate === 'function') {
    date = date.toDate();
  }
  
  // 종일 이벤트의 종료일은 FullCalendar에서 exclusive로 처리
  // 즉, 표시하려는 날짜 다음날로 설정해야 함
  if (isAllDay && isEnd) {
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
    return nextDay;
  }
  
  return date;
}

// 페이지 렌더링 분기
function renderPage(page) {
  const contentEl = document.getElementById("content");
  
  switch(page) {
    case "home":
      renderHomePage(contentEl);
      break;
    case "calendar":
      renderCalendarPage(contentEl);
      break;
    case "todo":
      renderTodoPage(contentEl);
      break;
    case "progress":
      renderProgressPage(contentEl);
      break;
    case "diet":
      renderDietPage(contentEl);
      break;
    case "expense":
      renderExpensePage(contentEl);
      break;
    case "diary":
      renderDiaryPage(contentEl);
      break;
    case "notes":
      renderNotesPage(contentEl);
      break;
    case "habits":
      renderHabitsPage(contentEl);
      break;
    case "bp":
      renderBloodPressurePage(contentEl);
      break;
    case "search":
      renderSearchPage(contentEl);
      break;
    default:
      renderHomePage(contentEl);
  }
}

// =========== 일정 관리 기능 ===========

// 일정 페이지 렌더링
function renderCalendarPage(container) {
  // 현재 뷰를 달력으로 설정
  currentView = 'calendar';

  // 다른 메뉴를 다녀온 뒤 일정 페이지에 새로 들어오면 오늘 기준으로 시작하도록 초기화
  window.eventCalendar = null;
  window.savedCalendarDate = null;
  window.savedCalendarView = null;
  
  container.innerHTML = `
    <div class="page-container">
      <div class="page-header">
        <h1>일정 관리</h1>
        <div class="page-actions">
          <div class="view-toggle">
            <button id="list-view-button" class="${currentView === 'list' ? 'active' : ''}" onclick="toggleView('list')">
              <i class="fas fa-list"></i> 리스트
            </button>
            <button id="calendar-view-button" class="${currentView === 'calendar' ? 'active' : ''}" onclick="toggleView('calendar')">
              <i class="fas fa-calendar-alt"></i> 달력
            </button>
          </div>
          <button onclick="showRepeatEventForm()">반복 일정 추가</button>
          <button onclick="showAddEventForm()">일정 추가</button>
        </div>
      </div>
      
      <div id="calendar-view-container" class="calendar-container" style="display: ${currentView === 'calendar' ? 'block' : 'none'}">
        <div id="calendar"></div>
      </div>
      
      <div id="list-view-container" style="display: ${currentView === 'list' ? 'block' : 'none'}">
        <div class="card">
          <h2 class="card-title">일정 목록</h2>
          <div id="events-list">
            <p>일정을 불러오는 중...</p>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // 일정 데이터 불러오기
  loadEvents();
}

// 일정 데이터 불러오기
async function loadEvents() {
  try {
    const eventsRef = db.collection("events");
    const snapshot = await cachedCollection("events", { orderBy: "start", dir: "asc" });
    
    const events = [];
    snapshot.forEach(doc => {
      const event = doc.data();
      const eventObj = {
        id: doc.id,
        title: event.title,
        start: event.start.toDate(),
        description: event.description || '',
        allDay: event.allDay || false
      };
      
      // 종료일 처리 - 수정된 부분!
      if (event.end) {
        const startDate = eventObj.start;
        const endDate = event.end.toDate();
        
        // 종일 이벤트일 경우
        if (event.allDay) {
          // 시작일과 종료일이 같은 경우 (하루짜리 이벤트)
          if (formatDate(startDate) === formatDate(endDate)) {
            // FullCalendar의 exclusive 종료일 때문에 +1일을 해줌 (동일 날짜로 표시하기 위함)
            const adjustedEnd = new Date(startDate);
            adjustedEnd.setDate(adjustedEnd.getDate() + 1);
            eventObj.end = adjustedEnd;
          } else {
            // 여러 날에 걸친 이벤트의 경우 종료일에 1일을 더해야 FullCalendar에서 제대로 표시됨
            const adjustedEnd = new Date(endDate);
            adjustedEnd.setDate(adjustedEnd.getDate() + 1);
            eventObj.end = adjustedEnd;
          }
        } else {
          // 종일 이벤트가 아닌 경우는 그대로 설정
          eventObj.end = endDate;
        }
      }
      
      // 색상 정보 추가
if (event.color) {
  eventObj.color = event.color;
}

if (event.seriesId) {
  eventObj.seriesId = event.seriesId;
}

events.push(eventObj);
    });
    
    // 뷰에 따라 다르게 표시
    if (currentView === 'list') {
      renderEventsList(events);
    } else {
      renderEventsCalendar(events);
    }
  } catch (error) {
    console.error("일정을 불러오는 중 오류 발생:", error);
    document.getElementById("events-list").innerHTML = '<p>일정을 불러오는 중 오류가 발생했습니다.</p>';
  }
}

// 일정 리스트 렌더링
function renderEventsList(events) {
  const eventsListEl = document.getElementById("events-list");
  
  if (events.length === 0) {
    eventsListEl.innerHTML = '<p>등록된 일정이 없습니다.</p>';
    return;
  }
  
  let html = '<ul class="list-container">';
  
  events.forEach(event => {
    html += `
      <li class="list-item" data-id="${event.id}">
        <div class="list-item-content">
          <div class="list-item-title">${event.seriesId ? '🔁 ' : ''}${event.title}</div>
          <div class="list-item-date">
            ${formatDate(event.start, true)}
            ${event.end ? ` ~ ${formatDate(event.end, true)}` : ''}
            ${event.allDay ? ' (종일)' : ''}
          </div>
          ${event.description ? `<div class="list-item-description">${event.description}</div>` : ''}
        </div>
        <div class="list-item-actions">
          <button onclick="editEvent('${event.id}')">수정</button>
          <button onclick="deleteEvent('${event.id}')">삭제</button>
        </div>
      </li>
    `;
  });
  
  html += '</ul>';
  eventsListEl.innerHTML = html;
}

// =========== 색상 프리셋 / 최근 사용 색상 ===========

// 기본 색상 샘플 (옅은 빨강 등 추가)
const COLOR_PRESETS = [
  '#FFF176', // 옅은 노랑
  '#90CAF9', // 옅은 파랑
  '#A5D6A7', // 옅은 초록
  '#EF9A9A', // 옅은 빨강
  '#F48FB1', // 옅은 분홍
  '#CE93D8', // 옅은 보라
  '#FFCC80', // 옅은 주황
  '#80DEEA', // 옅은 청록
  '#BCAAA4', // 옅은 갈색
  '#B0BEC5'  // 옅은 회색
];
const RECENT_COLORS_KEY = 'recentColors';
const MAX_RECENT_COLORS = 5;

// 최근 사용한 색상 목록 가져오기
function getRecentColors() {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_COLORS_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

// 사용한 색상을 최근 목록 맨 앞에 저장 (중복 제거, 최대 개수 제한)
function addRecentColor(color) {
  if (!color) return;
  try {
    const normalized = color.toLowerCase();
    const list = getRecentColors().filter(c => c.toLowerCase() !== normalized);
    list.unshift(color);
    localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(list.slice(0, MAX_RECENT_COLORS)));
  } catch (e) {
    console.warn("최근 색상 저장 실패:", e);
  }
}

// 색상 선택 버튼 클릭 시 input 값 변경
function selectPresetColor(inputId, color) {
  const input = document.getElementById(inputId);
  if (input) {
    input.value = color;
  }
}

// 색상 프리셋 + 최근 사용 색상 + 직접 선택 HTML 생성
function buildColorPickerHTML(inputId, currentColor) {
  const presetBtns = COLOR_PRESETS.map(c =>
    `<div class="preset-btn" title="${c}" style="background-color: ${c}" onclick="selectPresetColor('${inputId}', '${c}')"></div>`
  ).join('');

  const recent = getRecentColors();
  const recentHtml = recent.length > 0 ? `
    <div class="color-presets recent-colors">
      <span style="font-size: 12px; color: #888;">최근 사용 ➔</span>
      ${recent.map(c =>
        `<div class="preset-btn" title="${c}" style="background-color: ${c}" onclick="selectPresetColor('${inputId}', '${c}')"></div>`
      ).join('')}
    </div>` : '';

  return `
    <div class="color-presets">
      ${presetBtns}
      <span style="font-size: 12px; color: #888; margin-left: 5px">직접 선택 ➔</span>
      <input type="color" id="${inputId}" value="${currentColor}" style="width: 40px; border: none; background: none">
    </div>
    ${recentHtml}
  `;
}

// 날짜 배경색 설정 함수
function showDateColorForm(date) {
  const formattedDate = formatDate(date);
  
  const modalContent = `
    <form id="date-color-form">
      <div class="form-group">
        <label for="background-color">배경색 선택</label>
        ${buildColorPickerHTML('background-color', '#A5D6A7')}
      </div>
      <div class="form-group">
        <label for="color-note">메모 (선택사항)</label>
        <input type="text" id="color-note" placeholder="이 날짜 메모 (예: 중요한 날)">
      </div>
    </form>
  `;
  
  showModal(`${formattedDate} 배경색 설정`, modalContent, function() {
    saveDateBackground(date, document.getElementById('background-color').value, document.getElementById('color-note').value);
  });
}

// 날짜 배경색 저장
async function saveDateBackground(date, color, note = '') {
  try {
    const formattedDate = formatDate(date);
    addRecentColor(color);

    // 날짜 배경색 데이터 생성
    const colorData = {
      date: firebase.firestore.Timestamp.fromDate(new Date(formattedDate)),
      color: color,
      note: note,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    // 기존 설정 확인
    const dateColorRef = db.collection("dateColors");
    const snapshot = await dateColorRef.where("date", "==", colorData.date).get();
    
    if (snapshot.empty) {
      // 새로 추가
      await dateColorRef.add(colorData);
    } else {
      // 업데이트
      await dateColorRef.doc(snapshot.docs[0].id).update({
        color: color,
        note: note,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
    
    // 모달 닫기
    closeModal();
    
    // 달력 새로고침
    loadEvents();
    
  } catch (error) {
    console.error("날짜 배경색 저장 중 오류 발생:", error);
    alert('날짜 배경색을 저장하는 중 오류가 발생했습니다.');
  }
}

// 날짜 배경색 삭제
async function deleteDateBackground(date) {
  if (confirm('이 날짜의 배경색 설정을 삭제하시겠습니까?')) {
    try {
      const formattedDate = formatDate(date);
      const dateTs = firebase.firestore.Timestamp.fromDate(new Date(formattedDate));
      
      // 기존 설정 확인
      const dateColorRef = db.collection("dateColors");
      const snapshot = await dateColorRef.where("date", "==", dateTs).get();
      
      if (!snapshot.empty) {
        // 삭제
        await dateColorRef.doc(snapshot.docs[0].id).delete();
      }
      
      // 달력 새로고침
      loadEvents();
      
    } catch (error) {
      console.error("날짜 배경색 삭제 중 오류 발생:", error);
      alert('날짜 배경색을 삭제하는 중 오류가 발생했습니다.');
    }
  }
}

// 로딩 시 날짜 배경색 적용
async function loadDateColors() {
  try {
    const snapshot = await cachedCollection("dateColors");
    
    const dateColors = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      dateColors.push({
        id: doc.id,
        date: data.date.toDate(),
        color: data.color,
        note: data.note || ''
      });
    });
    
    return dateColors;
  } catch (error) {
    console.error("날짜 배경색 로드 중 오류 발생:", error);
    return [];
  }
}

// =========== 달력 공통: 보던 달 유지 ===========

window.persistentCalendars = window.persistentCalendars || {};
window.persistentCalendarDates = window.persistentCalendarDates || {};

// 페이지에 새로 들어올 때 호출 (오늘 기준으로 시작하도록 초기화)
function resetPersistentCalendar(key) {
  delete window.persistentCalendars[key];
  delete window.persistentCalendarDates[key];
}

// 달력을 다시 그릴 때 보던 달을 유지하며 생성
function createPersistentCalendar(key, calendarEl, options) {
  const prev = window.persistentCalendars[key];
  if (prev) {
    try {
      window.persistentCalendarDates[key] = prev.getDate();
    } catch (err) {
      console.error("달력 상태 저장 중 오류:", err);
    }
    try {
      prev.destroy();
    } catch (err) {
      console.error("달력 제거 중 오류:", err);
    }
  }

  const savedDate = window.persistentCalendarDates[key];
  const calendar = new FullCalendar.Calendar(
    calendarEl,
    savedDate ? Object.assign({}, options, { initialDate: savedDate }) : options
  );

  window.persistentCalendars[key] = calendar;
  calendar.render();
  return calendar;
}

// 일정 달력 렌더링
function renderEventsCalendar(events) {
  const calendarEl = document.getElementById('calendar');
  
  if (!calendarEl) return;
  
  // 이전 인스턴스 제거 전에 보고 있던 날짜/보기 방식을 기억 (저장·수정·삭제 후에도 같은 달 유지)
  if (window.eventCalendar) {
    try {
      window.savedCalendarDate = window.eventCalendar.getDate();
      window.savedCalendarView = window.eventCalendar.view.type;
    } catch (err) {
      console.error("캘린더 상태 저장 중 오류:", err);
    }
    try {
      window.eventCalendar.destroy();
    } catch (err) {
      console.error("캘린더 제거 중 오류:", err);
    }
    window.eventCalendar = null;
  }

  // 한국 공휴일 추가 함수
  function addKoreanHolidays(year) {
    const holidays = [
      // 양력 공휴일
      { title: '신정', start: `${year}-01-01` },
      { title: '3·1절', start: `${year}-03-01` },
      { title: '어린이날', start: `${year}-05-05` },
      { title: '현충일', start: `${year}-06-06` },
      { title: '광복절', start: `${year}-08-15` },
      { title: '개천절', start: `${year}-10-03` },
      { title: '한글날', start: `${year}-10-09` },
      { title: '크리스마스', start: `${year}-12-25` }
    ];
    
   // 2025년 기준으로 음력 휴일 추가
if (year === 2025) {
  // 2025년 설날
  holidays.push({ title: '설날 연휴', start: '2025-01-28' });
  holidays.push({ title: '설날', start: '2025-01-29' });
  holidays.push({ title: '설날 연휴', start: '2025-01-30' });
  
  // 2025년 부처님 오신 날
  holidays.push({ title: '부처님 오신 날', start: '2025-05-05' });
  
  // 2025년 추석 (10월 5일 ~ 10월 8일)
  holidays.push({ title: '추석 연휴', start: '2025-10-05' });
  holidays.push({ title: '추석', start: '2025-10-06' });
  holidays.push({ title: '추석 연휴', start: '2025-10-07' });
  holidays.push({ title: '추석 대체휴일', start: '2025-10-08' });
}
    
    return holidays.map(holiday => ({
      ...holiday,
      display: 'background',
      color: '#ffcdd2',
      classNames: ['holiday-event'],
      extendedProps: {
        isHoliday: true
      }
    }));
  }
  
  try {
    // 날짜 배경색 로드 및 캘린더 초기화
    loadDateColors().then(dateColors => {
      // 현재 연도와 전후 1년의 공휴일 추가
      const currentYear = new Date().getFullYear();
      const koreanHolidays = [
        ...addKoreanHolidays(currentYear - 1),
        ...addKoreanHolidays(currentYear),
        ...addKoreanHolidays(currentYear + 1)
      ];
      
      // 날짜 배경색을 이벤트로 변환
      const colorEvents = dateColors.map(dc => ({
        start: formatDate(dc.date),
        end: formatDate(dc.date),
        display: 'background',
        color: dc.color,
        classNames: ['date-color-event'],
        extendedProps: {
          isDateColor: true,
          note: dc.note
        }
      }));
      
// 모바일 여부 확인
const isMobile = window.innerWidth < 768;
window.eventCalendarIsMobile = isMobile;

// 창 크기 변경으로 모바일/PC 기준이 바뀌면 달력 새로고침 (한 번만 등록)
if (!window.eventCalendarResizeBound) {
  window.eventCalendarResizeBound = true;
  window.addEventListener('resize', function() {
    if (currentPage !== 'calendar' || currentView !== 'calendar') return;
    const newIsMobile = window.innerWidth < 768;
    if (newIsMobile !== window.eventCalendarIsMobile) {
      loadEvents();
    }
  });
}

// FullCalendar 초기화
window.eventCalendar = new FullCalendar.Calendar(calendarEl, {
  headerToolbar: {
    left: 'prev,next today',
    center: 'title',
    right: isMobile ? 'dayGridMonth,listMonth' : 'dayGridMonth,timeGridWeek,timeGridDay'
  },
  initialView: window.savedCalendarView || (isMobile ? 'listMonth' : 'dayGridMonth'), // 보던 보기 유지, 없으면 기본값
  initialDate: window.savedCalendarDate || undefined, // 보던 달 유지
  height: isMobile ? 'auto' : undefined, // 모바일에서 높이 자동 조정
  dayMaxEventRows: isMobile ? 2 : 6, // 모바일에서 표시하는 이벤트 수 제한
  eventTimeFormat: { // 시간 표시 형식 간소화
    hour: '2-digit',
    minute: '2-digit',
    meridiem: false
  },
  locale: 'ko',
    firstDay: 1, // 주의 시작: 월요일
  events: [...events, ...koreanHolidays, ...colorEvents],
  editable: true,
  selectable: true,
  selectMirror: true,
  dayMaxEvents: false,
  
// 이벤트 렌더링 커스터마이징 - 툴팁 활성화 및 모바일 최적화 통합
eventDidMount: function(info) {
  // 1. [PC/모바일 공통] 마우스 오버 시 전체 제목을 보여주는 툴팁(title) 기능 활성화
  // 이 기능은 PC에서 잘린 제목을 볼 수 있게 합니다.
  info.el.title = info.event.title; 

  // 2. [모바일 전용] 기존의 모바일 최적화 로직 유지
  if (isMobile && info.view.type === 'dayGridMonth') {
    const eventEl = info.el;
    eventEl.style.fontSize = '0.8rem';
    eventEl.style.padding = '2px 4px';
    
    // 이벤트 텍스트 길이 제한 (모바일에서만 적용)
    const titleEl = eventEl.querySelector('.fc-event-title');
    if (titleEl && titleEl.textContent.length > 10) {
      titleEl.textContent = titleEl.textContent.substring(0, 10) + '...';
    }
  }

  // 3. [스타일] 종일 이벤트 스타일 강화 (기존 로직 유지)
  if (info.event.allDay) {
    const eventEl = info.el;
    eventEl.style.fontWeight = 'bold';
  }
},

// 향상된 디버깅용 이벤트 핸들러
eventDidMount: function(info) {
  console.log("이벤트 표시:", info.event.id, 
            "제목:", info.event.title,
            "시작일:", formatDate(info.event.start, true), 
            "종료일:", info.event.end ? formatDate(info.event.end, true) : "없음",
            "allDay:", info.event.allDay,
            "시작 타임스탬프:", info.event.start.getTime(),
            "종료 타임스탬프:", info.event.end ? info.event.end.getTime() : "없음");
            
  // 종일 이벤트의 경우 스타일 강화
  if (info.event.allDay) {
    const eventEl = info.el;
    eventEl.style.fontWeight = 'bold';
  }
},
    
        // 여러 날/시간을 드래그해서 선택한 경우에만 바로 일정 추가 폼 표시
        // (날짜칸을 한 번 클릭한 경우는 dateClick의 메뉴에서 선택 후 진행)
        select: function(info) {
          const rangeMs = info.end - info.start;
          const isSingleClick = info.allDay ? rangeMs <= 86400000 : rangeMs <= 1800000;
          if (isSingleClick) {
            window.eventCalendar.unselect();
            return;
          }
          showAddEventForm(info.startStr, info.endStr, info.allDay);
        },
        // 이벤트 클릭 시 편집 폼 표시
        eventClick: function(info) {
          if (!info.event.extendedProps.isHoliday && !info.event.extendedProps.isDateColor) {
            editEvent(info.event.id);
          }
        },
        // 이벤트 드래그 앤 드롭으로 변경
        eventDrop: function(info) {
          updateEventDates(info.event.id, info.event.start, info.event.end, info.event.allDay);
        },
        // 이벤트 리사이징으로 기간 변경
        eventResize: function(info) {
          updateEventDates(info.event.id, info.event.start, info.event.end, info.event.allDay);
        },
        dateClick: function(info) {
          // 날짜를 클릭했을 때 컨텍스트 메뉴 표시
          const dateStr = info.dateStr;
          const menuItems = [
            {
              label: '일정 추가',
              action: () => showAddEventForm(dateStr, null, !dateStr.includes('T'))
            },
            {
              label: '반복 일정 추가',
              action: () => showRepeatEventForm(dateStr)
            },
            {
              label: '배경색 설정',
              action: () => showDateColorForm(new Date(dateStr))
            }
          ];
          
          // 해당 날짜에 이미 배경색이 있는지 확인
          const hasColorBackground = dateColors.some(dc => 
            formatDate(dc.date) === dateStr);
          
          if (hasColorBackground) {
            menuItems.push({
              label: '배경색 삭제',
              action: () => deleteDateBackground(new Date(dateStr))
            });
          }
          
          // 컨텍스트 메뉴 생성
          const menu = document.createElement('div');
          menu.className = 'date-context-menu';
          menu.style.position = 'absolute';
          menu.style.left = info.jsEvent.pageX + 'px';
          menu.style.top = info.jsEvent.pageY + 'px';
          menu.style.backgroundColor = 'white';
          menu.style.padding = '5px';
          menu.style.border = '1px solid #ccc';
          menu.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
          menu.style.zIndex = '9999';
          
          menuItems.forEach(item => {
            const menuItem = document.createElement('div');
            menuItem.textContent = item.label;
            menuItem.style.padding = '5px 10px';
            menuItem.style.cursor = 'pointer';
            menuItem.style.borderBottom = '1px solid #eee';
            menuItem.addEventListener('click', () => {
              document.body.removeChild(menu);
              item.action();
            });
            menuItem.addEventListener('mouseover', () => {
              menuItem.style.backgroundColor = '#f5f5f5';
            });
            menuItem.addEventListener('mouseout', () => {
              menuItem.style.backgroundColor = 'transparent';
            });
            menu.appendChild(menuItem);
          });
          
          document.body.appendChild(menu);
          
          // 메뉴 외부 클릭 시 메뉴 제거
          document.addEventListener('click', function closeMenu(e) {
            if (!menu.contains(e.target)) {
              if (document.body.contains(menu)) {
                document.body.removeChild(menu);
              }
              document.removeEventListener('click', closeMenu);
            }
          });
        }
      });
      
      // 명시적으로 렌더링 호출
      window.eventCalendar.render();
      console.log("캘린더가 성공적으로 렌더링되었습니다.");
    }).catch(error => {
      console.error("날짜 배경색 로드 중 오류 발생:", error);
      if (calendarEl) {
        calendarEl.innerHTML = '<p>날짜 배경색을 로드하는 중 오류가 발생했습니다.</p>';
      }
    });
  } catch (error) {
    console.error("캘린더 초기화 중 오류 발생:", error);
    if (calendarEl) {
      calendarEl.innerHTML = '<p>캘린더를 로드하는 중 오류가 발생했습니다.</p>';
    }
  }
}

// 일정 추가 폼 표시
function showAddEventForm(startDate = null, endDate = null, allDay = false) {
  // 시작일, 종료일 기본값 설정
  if (!startDate) {
    startDate = new Date();
  } else if (typeof startDate === 'string') {
    startDate = new Date(startDate);
  }
  
  if (!endDate) {
    // 종료일은 항상 시작일과 같은 날짜로 설정
    endDate = new Date(startDate);
    
    // 종일 이벤트가 아닌 경우, 시간만 1시간 뒤로 조정 (날짜는 동일)
    if (!allDay) {
      endDate.setHours(startDate.getHours() + 1);
    }
  } else if (typeof endDate === 'string') {
    endDate = new Date(endDate);
    
    // 종료일의 날짜를 시작일과 동일하게 조정
    const startDay = new Date(startDate);
    endDate.setFullYear(startDay.getFullYear());
    endDate.setMonth(startDay.getMonth());
    endDate.setDate(startDay.getDate());
  }
  
  // 날짜 포맷을 HTML 입력에 맞게 변환
  const formattedStartDate = formatDateForInput(startDate);
  const formattedEndDate = formatDateForInput(endDate);
  
  const modalContent = `
    <form id="event-form">
<div class="form-group">
  <label for="event-title">제목</label>
  <input type="text" id="event-title" required placeholder="이모티콘 사용 가능 😊 📅 ⭐">
  <div class="emoji-helper">
    <small>자주 쓰는 이모티콘: 
      <span onclick="insertEmoji('event-title', '📅')">📅</span>
      <span onclick="insertEmoji('event-title', '⭐')">⭐</span>
      <span onclick="insertEmoji('event-title', '🎯')">🎯</span>
      <span onclick="insertEmoji('event-title', '✨')">✨</span>
      <span onclick="insertEmoji('event-title', '🔔')">🔔</span>
      <span onclick="insertEmoji('event-title', '💼')">💼</span>
      <span onclick="insertEmoji('event-title', '🎉')">🎉</span>
    </small>
  </div>
</div>
      <div class="form-group">
        <label for="event-start">시작일시</label>
        <input type="datetime-local" id="event-start" value="${formattedStartDate}" required>
      </div>
      <div class="form-group">
        <label for="event-end">종료일시</label>
        <input type="datetime-local" id="event-end" value="${formattedEndDate}">
      </div>
      <div class="form-group">
        <label for="event-all-day">
          <input type="checkbox" id="event-all-day" ${allDay ? 'checked' : ''} onchange="adjustEndDateForAllDay()">
          종일
        </label>
      </div>
<div class="form-group">
  <label for="event-description">설명</label>
  <div id="event-description-editor"></div>
</div>
<div class="form-group">
          <label for="event-color">일정 색상</label>
          ${buildColorPickerHTML('event-color', '#2196f3')}
        </div>
    </form>
  `;
  
  showModal("일정 추가", modalContent, saveEvent);
  
  // 에디터 초기화
  setTimeout(() => {
    initTextEditor('event-description-editor', '일정에 대한 설명을 입력하세요...');
  }, 100);
}

// 종일 체크박스 변경 시 종료일시 조정 함수
function adjustEndDateForAllDay() {
  const allDayCheckbox = document.getElementById('event-all-day');
  const startDateInput = document.getElementById('event-start');
  const endDateInput = document.getElementById('event-end');
  
  if (allDayCheckbox && allDayCheckbox.checked) {
    // 종일 이벤트로 변경 시 시작일과 종료일을 같은 날짜의 00:00으로 설정
    const startDate = new Date(startDateInput.value);
    
    // 시작일의 날짜만 추출해서 시간은 00:00으로 설정
    const formattedDate = formatDate(startDate);
    const adjustedStartDate = `${formattedDate}T00:00`;
    const adjustedEndDate = `${formattedDate}T00:00`;  // 종료일은 시작일과 동일하게
    
    startDateInput.value = adjustedStartDate;
    endDateInput.value = adjustedEndDate;
  } else {
    // 종일 이벤트 해제 시, 종료 시간은 시작 시간으로부터 1시간 뒤로 설정 (날짜는 동일)
    const startDate = new Date(startDateInput.value);
    const endDate = new Date(startDate);
    endDate.setHours(startDate.getHours() + 1);
    
    startDateInput.value = formatDateForInput(startDate);
    endDateInput.value = formatDateForInput(endDate);
  }
}

// 날짜를 입력 필드용 포맷으로 변환
function formatDateForInput(date) {
  if (!date) return '';
  
  // Firestore Timestamp를 Date로 변환
  if (date.toDate) {
    date = date.toDate();
  }
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// 일정 저장
// app.js 파일에 데이터 크기 체크 함수 추가 (파일 상단에 추가)
function checkDataSize(data, maxSizeInBytes = 900000) {
  // HTML이 포함된 텍스트의 경우 크기가 클 수 있음
  if (data.description && data.description.length > 10000) {
    console.warn("설명 필드가 너무 큽니다. 10,000자로 제한합니다.");
    data.description = data.description.substring(0, 10000) + "... (잘림)";
  }
  return data;
}

// 일정 저장
async function saveEvent() {
  const titleEl = document.getElementById('event-title');
  const startEl = document.getElementById('event-start');
  const endEl = document.getElementById('event-end');
  const allDayEl = document.getElementById('event-all-day');
  
  if (!titleEl.value || !startEl.value) {
    alert('제목과 시작일시는 필수 입력 항목입니다.');
    return;
  }
  
  // 시작일과 종료일 파싱
  const startDate = new Date(startEl.value);
  let endDate = null;
  
  if (endEl.value) {
    endDate = new Date(endEl.value);
    
    // 종료일이 시작일보다 이전이면 경고
    if (endDate < startDate && !allDayEl.checked) {
      alert('종료일은 시작일 이후여야 합니다.');
      return;
    }
  }
  
  const description = getEditorContent('event-description-editor');
  
  try {
    // 일정 데이터 구성
    const eventData = {
      title: titleEl.value,
      start: firebase.firestore.Timestamp.fromDate(startDate),
      allDay: allDayEl.checked
    };
    
    // 종료일 추가 (종일 이벤트 처리)
    if (endDate) {
      // 종일 이벤트인 경우 시작일과 종료일이 같으면 그대로 저장
      if (allDayEl.checked) {
        // 종일 이벤트는 시간 정보를 00:00:00으로 정규화
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(0, 0, 0, 0);
      }
      
      eventData.end = firebase.firestore.Timestamp.fromDate(endDate);
    }
    
    if (description) {
  eventData.description = description;
}

// 색상 추가
const colorEl = document.getElementById('event-color');
if (colorEl && colorEl.value) {
  eventData.color = colorEl.value;
  addRecentColor(colorEl.value);
}

// 저장 시간 추가
eventData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    
    // 데이터 크기 확인 및 조정
    const safeData = checkDataSize(eventData);
    
    // Firestore에 저장
    await db.collection("events").add(safeData);
    
    // 모달 닫기
    closeModal();
    
    // 일정 목록 새로고침
    loadEvents();
  } catch (error) {
    console.error("일정 저장 중 오류 발생:", error);
    alert('일정을 저장하는 중 오류가 발생했습니다.');
  }
}

// =========== 반복 일정 추가 ===========

const REPEAT_WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']; // getDay() 값(0:일 ~ 6:토) 기준 이름
const REPEAT_WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // 화면에 표시하는 순서 (월요일 시작)
const MAX_REPEAT_EVENTS = 200; // 한 번에 만들 수 있는 최대 일정 수
window.repeatState = null;

// 'YYYY-MM-DD' 또는 날짜/시간 문자열을 로컬 날짜로 변환
function toLocalDate(value) {
  if (!value) return new Date();
  if (value instanceof Date) return new Date(value.getTime());
  if (typeof value === 'string' && value.length === 10) return parseDate(value);
  return new Date(value);
}

// 반복 일정 추가 창 표시
// baseDate: 날짜칸을 눌러 열었다면 그 날짜(해당 날짜가 미리 선택됨), 없으면 지금 보고 있는 달
function showRepeatEventForm(baseDate = null) {
  let base;
  if (baseDate) {
    base = toLocalDate(baseDate);
  } else if (window.eventCalendar && typeof window.eventCalendar.getDate === 'function') {
    base = window.eventCalendar.getDate();
  } else {
    base = new Date();
  }

  window.repeatState = {
    year: base.getFullYear(),
    month: base.getMonth(),
    selected: new Set()
  };

  if (baseDate) {
    window.repeatState.selected.add(formatDate(base));
  }

  const presetStyle = 'padding: 4px 10px; font-size: 0.8rem; background-color: #eee; color: #333;';

  const modalContent = `
    <form id="repeat-form" onsubmit="return false;">
      <div class="form-group">
        <label for="repeat-title">제목</label>
        <input type="text" id="repeat-title" required placeholder="예: 스피닝 🚴">
        <div class="emoji-helper">
          <small>자주 쓰는 이모티콘:
            <span onclick="insertEmoji('repeat-title', '🚴')">🚴</span>
            <span onclick="insertEmoji('repeat-title', '💪')">💪</span>
            <span onclick="insertEmoji('repeat-title', '🏊')">🏊</span>
            <span onclick="insertEmoji('repeat-title', '📅')">📅</span>
            <span onclick="insertEmoji('repeat-title', '⭐')">⭐</span>
            <span onclick="insertEmoji('repeat-title', '💼')">💼</span>
          </small>
        </div>
      </div>

      <div class="form-group">
        <label>날짜 선택</label>
        <p style="font-size: 0.85rem; color: #666; margin-bottom: 8px;">
          요일(월~일)을 누르면 이 달의 해당 요일이 모두 선택되고, 날짜를 누르면 하루씩 선택/해제됩니다.
          쉬는 날은 날짜를 눌러 해제하세요. 다른 달도 ‹ › 로 넘기면서 이어서 선택할 수 있어요.
        </p>
        <div id="repeat-grid"></div>
        <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px;">
          <button type="button" style="${presetStyle}" onclick="setRepeatPreset('weekdays')">평일 전체</button>
          <button type="button" style="${presetStyle}" onclick="setRepeatPreset('monsat')">월~토 전체</button>
          <button type="button" style="${presetStyle}" onclick="setRepeatPreset('all')">매일</button>
          <button type="button" style="${presetStyle}" onclick="setRepeatPreset('clear')">선택 초기화</button>
        </div>
        <div id="repeat-summary" style="font-size: 0.9rem; margin-top: 10px; line-height: 1.5;"></div>
      </div>

      <div class="form-group">
        <label style="display: flex; align-items: center; gap: 8px; font-weight: normal;">
          <input type="checkbox" id="repeat-all-day" style="width: auto; margin: 0;" onchange="toggleRepeatAllDay()">
          종일
        </label>
      </div>
      <div id="repeat-time-row" style="display: flex; gap: 10px;">
        <div class="form-group" style="flex: 1;">
          <label for="repeat-start-time">시작 시간</label>
          <input type="time" id="repeat-start-time" value="09:00">
        </div>
        <div class="form-group" style="flex: 1;">
          <label for="repeat-end-time">종료 시간</label>
          <input type="time" id="repeat-end-time" value="10:00">
        </div>
      </div>

      <div class="form-group">
        <label>설명</label>
        <div id="repeat-description-editor"></div>
      </div>
      <div class="form-group">
        <label for="repeat-color">일정 색상</label>
        ${buildColorPickerHTML('repeat-color', '#2196f3')}
      </div>
    </form>
  `;

  showModal("반복 일정 추가", modalContent, saveRepeatEvents);

  renderRepeatGrid();

  setTimeout(() => {
    initTextEditor('repeat-description-editor', '일정에 대한 설명을 입력하세요...');
  }, 100);
}

// 표시 중인 달에서 특정 요일(0:일 ~ 6:토)에 해당하는 날짜 키 목록
function getRepeatMonthDates(weekday) {
  const st = window.repeatState;
  const keys = [];
  const daysInMonth = new Date(st.year, st.month + 1, 0).getDate();

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(st.year, st.month, d);
    if (date.getDay() === weekday) {
      keys.push(formatDate(date));
    }
  }
  return keys;
}

// 날짜 선택 달력 그리기
function renderRepeatGrid() {
  const st = window.repeatState;
  const el = document.getElementById('repeat-grid');
  if (!st || !el) return;

  const daysInMonth = new Date(st.year, st.month + 1, 0).getDate();
  const leading = (new Date(st.year, st.month, 1).getDay() + 6) % 7; // 월요일 시작 기준 앞 빈칸 수

  const weekdayColor = wd => (wd === 0 ? '#e53935' : wd === 6 ? '#1e88e5' : '#333');

  // 요일 머리글 (누르면 그 달의 해당 요일 전체 선택/해제)
  const headerHtml = REPEAT_WEEKDAY_ORDER.map(wd => {
    const label = REPEAT_WEEKDAY_LABELS[wd];
    const keys = getRepeatMonthDates(wd);
    const allSelected = keys.length > 0 && keys.every(k => st.selected.has(k));

    return `<div onclick="toggleRepeatWeekday(${wd})" title="${label}요일 전체 선택/해제"
      style="text-align: center; padding: 8px 0; font-weight: bold; cursor: pointer; border-radius: 6px; user-select: none;
             color: ${allSelected ? '#fff' : weekdayColor(wd)};
             background: ${allSelected ? 'var(--primary-color)' : '#eef3ee'};">${label}</div>`;
  }).join('');

  // 날짜 칸
  let cells = '';
  for (let i = 0; i < leading; i++) {
    cells += '<div></div>';
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(st.year, st.month, d);
    const key = formatDate(date);
    const selected = st.selected.has(key);

    cells += `<div onclick="toggleRepeatDate('${key}')"
      style="text-align: center; padding: 10px 0; cursor: pointer; border-radius: 6px; user-select: none;
             border: 1px solid ${selected ? 'var(--primary-color)' : '#e0e0e0'};
             color: ${selected ? '#fff' : weekdayColor(date.getDay())};
             background: ${selected ? 'var(--primary-color)' : '#fff'};
             font-weight: ${selected ? 'bold' : 'normal'};">${d}</div>`;
  }

  el.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
      <button type="button" onclick="changeRepeatMonth(-1)">‹</button>
      <strong>${st.year}년 ${st.month + 1}월</strong>
      <button type="button" onclick="changeRepeatMonth(1)">›</button>
    </div>
    <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px;">
      ${headerHtml}${cells}
    </div>
  `;

  renderRepeatSummary();
}

// 선택된 날짜 요약
function renderRepeatSummary() {
  const st = window.repeatState;
  const el = document.getElementById('repeat-summary');
  if (!st || !el) return;

  const keys = Array.from(st.selected).sort();

  if (keys.length === 0) {
    el.style.color = '#999';
    el.textContent = '선택한 날짜가 없습니다.';
    return;
  }

  const byMonth = {};
  keys.forEach(key => {
    const [y, m, d] = key.split('-').map(Number);
    const monthKey = `${y}년 ${m}월`;
    if (!byMonth[monthKey]) byMonth[monthKey] = [];
    byMonth[monthKey].push(d);
  });

  el.style.color = '#388e3c';
  el.innerHTML = `<strong>총 ${keys.length}일 선택</strong><br>` +
    Object.keys(byMonth).map(monthKey => `${monthKey}: ${byMonth[monthKey].join(', ')}일`).join('<br>');
}

// 날짜 하나 선택/해제
function toggleRepeatDate(key) {
  const st = window.repeatState;
  if (!st) return;

  if (st.selected.has(key)) {
    st.selected.delete(key);
  } else {
    st.selected.add(key);
  }
  renderRepeatGrid();
}

// 요일 전체 선택/해제 (표시 중인 달 기준)
function toggleRepeatWeekday(weekday) {
  const st = window.repeatState;
  if (!st) return;

  const keys = getRepeatMonthDates(weekday);
  const allSelected = keys.length > 0 && keys.every(k => st.selected.has(k));

  keys.forEach(k => {
    if (allSelected) {
      st.selected.delete(k);
    } else {
      st.selected.add(k);
    }
  });
  renderRepeatGrid();
}

// 이전/다음 달로 이동 (이미 선택한 날짜는 유지)
function changeRepeatMonth(delta) {
  const st = window.repeatState;
  if (!st) return;

  const moved = new Date(st.year, st.month + delta, 1);
  st.year = moved.getFullYear();
  st.month = moved.getMonth();
  renderRepeatGrid();
}

// 빠른 선택 (표시 중인 달에 적용)
function setRepeatPreset(preset) {
  const st = window.repeatState;
  if (!st) return;

  if (preset === 'clear') {
    st.selected.clear();
  } else {
    const weekdays = {
      weekdays: [1, 2, 3, 4, 5],
      monsat: [1, 2, 3, 4, 5, 6],
      all: [0, 1, 2, 3, 4, 5, 6]
    }[preset] || [];

    weekdays.forEach(wd => {
      getRepeatMonthDates(wd).forEach(k => st.selected.add(k));
    });
  }
  renderRepeatGrid();
}

// 종일 체크 시 시간 입력 숨김
function toggleRepeatAllDay() {
  const allDay = document.getElementById('repeat-all-day').checked;
  const timeRow = document.getElementById('repeat-time-row');
  if (timeRow) {
    timeRow.style.display = allDay ? 'none' : 'flex';
  }
}

// 반복 일정 저장 (선택한 날짜마다 일정을 하나씩 만들고, 같은 묶음 ID를 붙임)
async function saveRepeatEvents() {
  const st = window.repeatState;
  const title = (document.getElementById('repeat-title').value || '').trim();

  if (!title) {
    alert('제목을 입력해주세요.');
    return;
  }

  const keys = st ? Array.from(st.selected).sort() : [];

  if (keys.length === 0) {
    alert('일정을 추가할 날짜를 선택해주세요.');
    return;
  }

  if (keys.length > MAX_REPEAT_EVENTS) {
    alert(`한 번에 최대 ${MAX_REPEAT_EVENTS}개까지 추가할 수 있습니다. (현재 ${keys.length}개 선택)`);
    return;
  }

  const allDay = document.getElementById('repeat-all-day').checked;
  const startTime = document.getElementById('repeat-start-time').value;
  const endTime = document.getElementById('repeat-end-time').value;

  if (!allDay) {
    if (!startTime) {
      alert('시작 시간을 입력해주세요.');
      return;
    }
    if (endTime && endTime < startTime) {
      alert('종료 시간은 시작 시간 이후여야 합니다.');
      return;
    }
  }

  if (keys.length > 31 && !confirm(`${keys.length}개의 일정이 한 번에 추가됩니다. 계속할까요?`)) {
    return;
  }

  let description = getEditorContent('repeat-description-editor');
  if (description === '<p><br></p>') {
    description = '';
  }

  const colorEl = document.getElementById('repeat-color');
  const color = colorEl && colorEl.value ? colorEl.value : '';

  try {
    const seriesId = db.collection("events").doc().id;
    const batch = db.batch();

    keys.forEach(key => {
      const [y, m, d] = key.split('-').map(Number);
      let start;
      let end = null;

      if (allDay) {
        start = new Date(y, m - 1, d, 0, 0, 0, 0);
        end = new Date(y, m - 1, d, 0, 0, 0, 0);
      } else {
        const [sh, sm] = startTime.split(':').map(Number);
        start = new Date(y, m - 1, d, sh, sm);

        if (endTime) {
          const [eh, em] = endTime.split(':').map(Number);
          end = new Date(y, m - 1, d, eh, em);
        }
      }

      const eventData = {
        title: title,
        start: firebase.firestore.Timestamp.fromDate(start),
        allDay: allDay,
        seriesId: seriesId,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      if (end) eventData.end = firebase.firestore.Timestamp.fromDate(end);
      if (description) eventData.description = description;
      if (color) eventData.color = color;

      batch.set(db.collection("events").doc(), checkDataSize(eventData));
    });

    await batch.commit();

    if (color) addRecentColor(color);

    // 추가한 첫 날짜가 있는 달로 달력 이동
    const [fy, fm, fd] = keys[0].split('-').map(Number);
    if (window.eventCalendar && typeof window.eventCalendar.gotoDate === 'function') {
      try {
        window.eventCalendar.gotoDate(new Date(fy, fm - 1, fd));
      } catch (err) {
        console.error("달력 이동 중 오류:", err);
      }
    }

    window.repeatState = null;
    closeModal();
    loadEvents();
  } catch (error) {
    console.error("반복 일정 저장 중 오류 발생:", error);
    alert('반복 일정을 저장하는 중 오류가 발생했습니다.');
  }
}

// 반복 일정 중 이 날짜 이후의 같은 묶음 일정에도 변경 내용 적용 (날짜는 유지, 제목/시간/색상/설명만 변경)
async function applyEventChangesToSeries(seriesId, eventId, originalStartMs, changes) {
  const snapshot = await db.collection("events").where("seriesId", "==", seriesId).get();
  const batch = db.batch();
  let count = 0;

  snapshot.forEach(doc => {
    if (doc.id === eventId) return;

    const data = doc.data();
    if (!data.start) return;

    const evDate = data.start.toDate();
    if (evDate.getTime() < originalStartMs) return;

    const y = evDate.getFullYear();
    const m = evDate.getMonth();
    const d = evDate.getDate();

    let start;
    let end = null;

    if (changes.allDay) {
      start = new Date(y, m, d, 0, 0, 0, 0);
      if (changes.dayOffset !== null) {
        end = new Date(y, m, d + changes.dayOffset, 0, 0, 0, 0);
      }
    } else {
      start = new Date(y, m, d, changes.startHour, changes.startMinute);
      if (changes.durationMs !== null) {
        end = new Date(start.getTime() + changes.durationMs);
      }
    }

    const update = {
      title: changes.title,
      allDay: changes.allDay,
      start: firebase.firestore.Timestamp.fromDate(start),
      end: end ? firebase.firestore.Timestamp.fromDate(end) : firebase.firestore.FieldValue.delete(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (changes.color) update.color = changes.color;
    if (changes.description) update.description = changes.description;

    batch.update(doc.ref, update);
    count++;
  });

  if (count > 0) {
    await batch.commit();
  }
}

// 반복 일정 삭제 범위 선택 창
function showSeriesDeleteOptions(eventId, seriesId) {
  const buttonStyle = 'width: 100%; margin: 0;';

  const content = `
    <p style="margin-bottom: 15px;">이 일정은 반복 일정으로 추가된 일정입니다. 어떻게 삭제할까요?</p>
    <div style="display: flex; flex-direction: column; gap: 10px;">
      <button type="button" style="${buttonStyle}" onclick="deleteEventSeries('${eventId}', '${seriesId}', 'one')">이 날짜만 삭제</button>
      <button type="button" style="${buttonStyle}" onclick="deleteEventSeries('${eventId}', '${seriesId}', 'following')">이 날짜 이후 반복 일정 모두 삭제</button>
      <button type="button" style="${buttonStyle} background-color: #f44336;" onclick="deleteEventSeries('${eventId}', '${seriesId}', 'all')">반복 일정 전체 삭제</button>
    </div>
  `;

  showModal("반복 일정 삭제", content);
}

// 반복 일정 삭제 실행 (scope: 'one' | 'following' | 'all')
async function deleteEventSeries(eventId, seriesId, scope) {
  try {
    if (scope === 'one') {
      await db.collection("events").doc(eventId).delete();
      closeModal();
      loadEvents();
      return;
    }

    const eventDoc = await db.collection("events").doc(eventId).get();
    const thisStartMs = eventDoc.exists && eventDoc.data().start ? eventDoc.data().start.toDate().getTime() : 0;

    const snapshot = await db.collection("events").where("seriesId", "==", seriesId).get();
    const targets = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      const startMs = data.start ? data.start.toDate().getTime() : 0;

      if (scope === 'all' || doc.id === eventId || startMs >= thisStartMs) {
        targets.push(doc.ref);
      }
    });

    if (targets.length === 0) {
      closeModal();
      return;
    }

    if (!confirm(`반복 일정 ${targets.length}개가 삭제됩니다. 계속할까요?`)) {
      return;
    }

    for (let i = 0; i < targets.length; i += 400) {
      const batch = db.batch();
      targets.slice(i, i + 400).forEach(ref => batch.delete(ref));
      await batch.commit();
    }

    closeModal();
    loadEvents();
  } catch (error) {
    console.error("반복 일정 삭제 중 오류 발생:", error);
    alert('반복 일정을 삭제하는 중 오류가 발생했습니다.');
  }
}

// 일정 편집 폼 표시
async function editEvent(eventId) {
  try {
    const eventDoc = await db.collection("events").doc(eventId).get();
    
    if (!eventDoc.exists) {
      alert('일정 정보를 찾을 수 없습니다.');
      return;
    }
    
    const event = eventDoc.data();
    
    const modalContent = `
      <form id="event-form">
        <input type="hidden" id="event-id" value="${eventId}">
        ${event.seriesId ? `
        <input type="hidden" id="event-series-id" value="${event.seriesId}">
        <input type="hidden" id="event-original-start" value="${event.start.toDate().getTime()}">
        <div class="form-group" style="background: #f1f8e9; padding: 10px 12px; border-radius: 6px;">
          <div style="font-size: 0.9rem; color: #558b2f;">🔁 반복 일정입니다. 수정하면 기본적으로 이 날짜만 바뀝니다.</div>
          <label style="display: flex; align-items: center; gap: 8px; margin: 8px 0 0; font-weight: normal;">
            <input type="checkbox" id="event-apply-series" style="width: auto; margin: 0;">
            이 날짜 이후 같은 반복 일정에도 적용 (제목·시간·색상·설명, 날짜는 그대로)
          </label>
        </div>` : ''}
        <div class="form-group">
          <label for="event-title">제목</label>
          <input type="text" id="event-title" value="${event.title}" required>
        </div>
        <div class="form-group">
          <label for="event-start">시작일시</label>
          <input type="datetime-local" id="event-start" value="${formatDateForInput(event.start)}" required>
        </div>
        <div class="form-group">
          <label for="event-end">종료일시</label>
          <input type="datetime-local" id="event-end" value="${event.end ? formatDateForInput(event.end) : ''}">
        </div>
        <div class="form-group">
          <label for="event-all-day">
            <input type="checkbox" id="event-all-day" ${event.allDay ? 'checked' : ''} onchange="adjustEndDateForAllDay()">
            종일
          </label>
        </div>
<div class="form-group">
          <label for="event-description">설명</label>
          <div id="event-description-editor"></div>
        </div>
        <div class="form-group">
  <label for="event-color">일정 색상</label>
  ${buildColorPickerHTML('event-color', event.color || '#2196f3')}
</div>
      </form>
    `;
    
    // 여기가 변경된 부분: 수정 버튼을 포함하는 모달 표시
    showModalWithEdit("일정 상세", modalContent, updateEvent, eventId);
    
    // 에디터 초기화
    setTimeout(() => {
      initTextEditor('event-description-editor', '일정에 대한 설명을 입력하세요...', event.description || '');
    }, 100);
  } catch (error) {
    console.error("일정 정보 로드 중 오류 발생:", error);
    alert('일정 정보를 불러오는 중 오류가 발생했습니다.');
  }
}

// 일정 업데이트
async function updateEvent() {
  const eventId = document.getElementById('event-id').value;
  const titleEl = document.getElementById('event-title');
  const startEl = document.getElementById('event-start');
  const endEl = document.getElementById('event-end');
  const allDayEl = document.getElementById('event-all-day');
  
  if (!titleEl.value || !startEl.value) {
    alert('제목과 시작일시는 필수 입력 항목입니다.');
    return;
  }
  
  // 시작일과 종료일 파싱
  const startDate = new Date(startEl.value);
  let endDate = null;
  
  if (endEl.value) {
    endDate = new Date(endEl.value);
    
    // 종료일이 시작일보다 이전이면 경고 (종일 이벤트가 아닌 경우만)
    if (endDate < startDate && !allDayEl.checked) {
      alert('종료일은 시작일 이후여야 합니다.');
      return;
    }
  }
  
  const description = getEditorContent('event-description-editor');
  
  try {
    // 일정 데이터 구성
    const eventData = {
      title: titleEl.value,
      start: firebase.firestore.Timestamp.fromDate(startDate),
      allDay: allDayEl.checked,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    // 반복 일정에 일괄 적용할 변경 내용 (날짜 정규화 전에 먼저 계산)
    const applySeriesEl = document.getElementById('event-apply-series');
    const seriesIdEl = document.getElementById('event-series-id');
    const applyToSeries = !!(seriesIdEl && applySeriesEl && applySeriesEl.checked);
    let seriesChanges = null;

    if (applyToSeries) {
      const dayMs = 86400000;
      const startMidnight = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
      const endMidnight = endDate ? new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()) : null;
      const seriesColorEl = document.getElementById('event-color');

      seriesChanges = {
        title: titleEl.value,
        allDay: allDayEl.checked,
        startHour: startDate.getHours(),
        startMinute: startDate.getMinutes(),
        durationMs: endDate ? endDate.getTime() - startDate.getTime() : null,
        dayOffset: endDate ? Math.round((endMidnight - startMidnight) / dayMs) : null,
        color: seriesColorEl && seriesColorEl.value ? seriesColorEl.value : '',
        description: description && description !== '<p><br></p>' ? description : ''
      };
    }

    // 종료일 추가 또는 삭제
    if (endDate) {
      // 종일 이벤트인 경우 시작일과 종료일이 같으면 그대로 저장
      if (allDayEl.checked) {
        // 종일 이벤트는 시간 정보를 00:00:00으로 정규화
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(0, 0, 0, 0);
      }
      
      eventData.end = firebase.firestore.Timestamp.fromDate(endDate);
    } else {
      eventData.end = firebase.firestore.FieldValue.delete();
    }
    
    if (description) {
  eventData.description = description;
}

// 색상 추가
const colorEl = document.getElementById('event-color');
if (colorEl && colorEl.value) {
  eventData.color = colorEl.value;
  addRecentColor(colorEl.value);
}

// Firestore에 업데이트
await db.collection("events").doc(eventId).update(eventData);

    // 반복 일정: 이 날짜 이후 같은 묶음 일정에도 적용
    if (applyToSeries && seriesChanges) {
      const originalStartMs = Number(document.getElementById('event-original-start').value) || 0;
      await applyEventChangesToSeries(seriesIdEl.value, eventId, originalStartMs, seriesChanges);
    }
    
    // 모달 닫기
    closeModal();
    
    // 일정 목록 새로고침
    loadEvents();
  } catch (error) {
    console.error("일정 업데이트 중 오류 발생:", error);
    alert('일정을 업데이트하는 중 오류가 발생했습니다.');
  }
}

// 일정 날짜 업데이트 (드래그 앤 드롭)
async function updateEventDates(eventId, start, end, allDay) {
  try {
    // 먼저 원래 이벤트 데이터를 가져옴
    const eventDoc = await db.collection("events").doc(eventId).get();
    if (!eventDoc.exists) {
      console.error("이벤트를 찾을 수 없습니다.");
      return;
    }
    
    const eventData = {
      start: firebase.firestore.Timestamp.fromDate(start),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      allDay: allDay
    };
    
    if (end) {
      // allDay 이벤트일 경우, FullCalendar의 종료일에서 1일을 빼서 실제 종료일로 저장
      if (allDay) {
        // FullCalendar는 종료일을 exclusive로 처리하므로 1일 빼줌
        const adjustedEnd = new Date(end);
        adjustedEnd.setDate(adjustedEnd.getDate() - 1);
        
        // 시작일과 종료일이 같은지 확인
        const startDateStr = formatDate(start);
        const endDateStr = formatDate(adjustedEnd);
        
        if (startDateStr === endDateStr) {
          // 시작일과 종료일이 같으면 그대로 저장
          eventData.end = firebase.firestore.Timestamp.fromDate(adjustedEnd);
        } else if (adjustedEnd < start) {
          // 종료일이 시작일보다 이전이면 시작일로 설정
          eventData.end = firebase.firestore.Timestamp.fromDate(start);
        } else {
          // 정상적인 경우 조정된 종료일 사용
          eventData.end = firebase.firestore.Timestamp.fromDate(adjustedEnd);
        }
      } else {
        // 종일 이벤트가 아니면 그대로 사용
        eventData.end = firebase.firestore.Timestamp.fromDate(end);
      }
    } else {
      eventData.end = firebase.firestore.FieldValue.delete();
    }
    
    await db.collection("events").doc(eventId).update(eventData);
    console.log("이벤트 날짜 업데이트 완료:", eventId);
  } catch (error) {
    console.error("일정 날짜 업데이트 중 오류 발생:", error);
    alert('일정 날짜를 업데이트하는 중 오류가 발생했습니다.');
    loadEvents(); // 에러 발생 시 새로고침하여 원래 상태로 복원
  }
}

// 일정 삭제
async function deleteEvent(eventId) {
  // 반복 일정이면 삭제 범위를 먼저 선택
  try {
    const eventDoc = await db.collection("events").doc(eventId).get();
    if (eventDoc.exists && eventDoc.data().seriesId) {
      showSeriesDeleteOptions(eventId, eventDoc.data().seriesId);
      return;
    }
  } catch (error) {
    console.error("일정 정보 확인 중 오류 발생:", error);
  }

  if (confirm('정말로 이 일정을 삭제하시겠습니까?')) {
    try {
      await db.collection("events").doc(eventId).delete();
      closeModal();
      loadEvents(); // 목록 새로고침
    } catch (error) {
      console.error("일정 삭제 중 오류 발생:", error);
      alert('일정을 삭제하는 중 오류가 발생했습니다.');
    }
  }
}

// =========== 할 일 관리 기능 ===========

// 할 일 페이지 렌더링
function renderTodoPage(container) {
  resetPersistentCalendar('todo');
  container.innerHTML = `
    <div class="page-container">
      <div class="page-header">
        <h1>뭐해? (할 일 관리)</h1>
        <div class="page-actions">
          <div class="view-toggle">
            <button id="list-view-button" class="${currentView === 'list' ? 'active' : ''}" onclick="toggleView('list')">
              <i class="fas fa-list"></i> 리스트
            </button>
            <button id="calendar-view-button" class="${currentView === 'calendar' ? 'active' : ''}" onclick="toggleView('calendar')">
              <i class="fas fa-calendar-alt"></i> 달력
            </button>
          </div>
          <button onclick="showAddTodoForm()">할 일 추가</button>
        </div>
      </div>
      
      <div id="calendar-view-container" class="calendar-container" style="display: ${currentView === 'calendar' ? 'block' : 'none'}">
        <div id="todo-calendar"></div>
      </div>
      
      <div id="list-view-container" style="display: ${currentView === 'list' ? 'block' : 'none'}">
        <div class="card">
          <h2 class="card-title">할 일 목록</h2>
          <div id="todos-list">
            <p>할 일을 불러오는 중...</p>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // 할 일 데이터 불러오기
  loadTodos();
}

// 할 일 데이터 불러오기
async function loadTodos() {
  try {
    const todosRef = db.collection("todos");
    const snapshot = await cachedCollection("todos", { orderBy: "dueDate", dir: "asc" });
    
    const todos = [];
    snapshot.forEach(doc => {
      const todo = doc.data();
      todos.push({
        id: doc.id,
        title: todo.title,
        description: todo.description || '',
        dueDate: todo.dueDate ? todo.dueDate.toDate() : null,
        completed: todo.completed || false,
        createdAt: todo.createdAt ? todo.createdAt.toDate() : new Date(),
        priority: todo.priority || 'medium'
      });
    });
    
    // 뷰에 따라 다르게 표시
    if (currentView === 'list') {
      renderTodosList(todos);
    } else {
      renderTodosCalendar(todos);
    }
  } catch (error) {
    console.error("할 일을 불러오는 중 오류 발생:", error);
    document.getElementById("todos-list").innerHTML = '<p>할 일을 불러오는 중 오류가 발생했습니다.</p>';
  }
}

// 할 일 리스트 렌더링
function renderTodosList(todos) {
  const todosListEl = document.getElementById("todos-list");
  
  if (todos.length === 0) {
    todosListEl.innerHTML = '<p>등록된 할 일이 없습니다.</p>';
    return;
  }
  
  let html = '<ul class="list-container">';
  
// app.js 파일의 renderTodosList 함수 내부
todos.forEach(todo => {
  // 체크박스의 id를 고유하게 설정하여 충돌 방지
  const checkboxId = `todo-checkbox-${todo.id}`;
  
  html += `
    <li class="list-item" data-id="${todo.id}">
      <div class="list-item-checkbox">
        <input 
          type="checkbox" 
          id="${checkboxId}"
          ${todo.completed ? 'checked' : ''} 
          onchange="toggleTodoComplete('${todo.id}', ${!todo.completed})"
          style="display: inline-block; width: 20px; height: 20px; visibility: visible; opacity: 1;"
        />
        <label for="${checkboxId}" class="checkbox-label" style="display: inline-block;"></label>
      </div>
      <div class="list-item-content ${todo.completed ? 'completed' : ''}">
        <div class="list-item-title">${todo.title}</div>
        ${todo.dueDate ? `<div class="list-item-date">마감일: ${formatDate(todo.dueDate)}</div>` : ''}
        ${todo.description ? `<div class="list-item-description">${todo.description}</div>` : ''}
      </div>
      <div class="list-item-actions">
        <button onclick="editTodo('${todo.id}')">수정</button>
        <button onclick="deleteTodo('${todo.id}')">삭제</button>
      </div>
    </li>
  `;
});
  
  html += '</ul>';
  todosListEl.innerHTML = html;
}

// 할 일 달력 렌더링
function renderTodosCalendar(todos) {
  const calendarEl = document.getElementById('todo-calendar');
  
  if (!calendarEl) return;
  
  // 달력에 표시할 이벤트 형식으로 변환
  const events = todos.map(todo => {
    return {
      id: todo.id,
      title: todo.title,
      start: todo.dueDate,
      allDay: true,
      color: todo.completed ? '#4caf50' : (todo.priority === 'high' ? '#f44336' : '#2196f3'),
      extendedProps: {
        completed: todo.completed
      }
    };
  });
  
  // FullCalendar 초기화
  createPersistentCalendar('todo', calendarEl, {
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,listWeek'
    },
    initialView: 'dayGridMonth',
    locale: 'ko',
    firstDay: 1, // 주의 시작: 월요일
    events: events,
    eventDidMount: function(info) {
      // 이벤트마다 체크박스 추가
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = info.event.extendedProps.completed;
      checkbox.style.marginRight = '5px';
      checkbox.addEventListener('change', function() {
        toggleTodoComplete(info.event.id, checkbox.checked);
      });
      
      const titleElement = info.el.querySelector('.fc-event-title');
      if (titleElement) {
        titleElement.parentNode.insertBefore(checkbox, titleElement);
      }
    },
eventClick: function(info) {
  // 체크박스가 아닌 부분을 클릭했을 때만 상세 모달 표시
  if (!info.jsEvent.target.matches('input[type="checkbox"]')) {
    showTodoDetailModal(info.event.id);
  }
},
    dateClick: function(info) {
      showAddTodoForm(info.dateStr);
    }
  });
}

// 할 일 상세 모달 표시
async function showTodoDetailModal(todoId) {
  try {
    const todoDoc = await db.collection("todos").doc(todoId).get();
    
    if (!todoDoc.exists) {
      alert('할 일 정보를 찾을 수 없습니다.');
      return;
    }
    
    const todo = todoDoc.data();
    
    const modalContent = `
      <div class="todo-detail">
        <h3>${todo.title}</h3>
        ${todo.dueDate ? `<p><strong>마감일:</strong> ${formatDate(todo.dueDate)}</p>` : ''}
        <p><strong>우선순위:</strong> ${getPriorityText(todo.priority)}</p>
        <p><strong>상태:</strong> ${todo.completed ? '완료됨' : '진행 중'}</p>
        ${todo.description ? `<div class="todo-description"><strong>설명:</strong><br>${todo.description}</div>` : ''}
      </div>
    `;
    
    const modalContainer = document.getElementById("modal-container");
    
    modalContainer.innerHTML = `
      <div class="modal-overlay" onclick="if(event.target === this) closeModal()">
        <div class="modal">
          <div class="modal-header">
            <h2 class="modal-title">할 일 상세</h2>
            <button class="modal-close" onclick="closeModal()">×</button>
          </div>
          <div class="modal-content">
            ${modalContent}
          </div>
          <div class="modal-actions">
            <button onclick="closeModal()">취소</button>
            <button onclick="editTodo('${todoId}')">수정</button>
            <button onclick="deleteTodo('${todoId}')" style="background-color: #f44336;">삭제</button>
          </div>
        </div>
      </div>
    `;
    
    isModalOpen = true;
  } catch (error) {
    console.error("할 일 정보 로드 중 오류 발생:", error);
    alert('할 일 정보를 불러오는 중 오류가 발생했습니다.');
  }
}

// 우선순위 텍스트 변환 함수
function getPriorityText(priority) {
  switch(priority) {
    case 'high':
      return '높음';
    case 'medium':
      return '중간';
    case 'low':
      return '낮음';
    default:
      return '중간';
  }
}

// 할 일 완료 상태 토글
async function toggleTodoComplete(id, completed) {
  try {
    await db.collection("todos").doc(id).update({ 
      completed,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp() 
    });
    
    // 두 뷰 모두 갱신
    if (currentView === 'list') {
      // 리스트 뷰만 부분적으로 업데이트
      const checkbox = document.querySelector(`.list-item[data-id="${id}"] input[type="checkbox"]`);
      if (checkbox) {
        checkbox.checked = completed;
      }
      
      const content = document.querySelector(`.list-item[data-id="${id}"] .list-item-content`);
      if (content) {
        if (completed) {
          content.classList.add('completed');
        } else {
          content.classList.remove('completed');
        }
      }
    } else {
      // 달력 뷰면 달력만 새로고침
      loadTodos(); 
    }
  } catch (error) {
    console.error("할 일 상태 변경 중 오류 발생:", error);
  }
}

// 할 일 추가 폼 표시
function showAddTodoForm(dueDate = null) {
  // 마감일 기본값 설정
  let formattedDueDate = '';
  if (dueDate) {
    if (typeof dueDate === 'string') {
      formattedDueDate = dueDate;
    } else {
      formattedDueDate = formatDate(dueDate);
    }
  }
  
  const modalContent = `
    <form id="todo-form">
<div class="form-group">
        <label for="todo-title">제목</label>
        <input type="text" id="todo-title" required placeholder="이모티콘 사용 가능 ✅ 📝 🎯">
        <div class="emoji-helper">
          <small>자주 쓰는 이모티콘: 
            <span onclick="insertEmoji('todo-title', '✅')">✅</span>
            <span onclick="insertEmoji('todo-title', '📝')">📝</span>
            <span onclick="insertEmoji('todo-title', '🎯')">🎯</span>
            <span onclick="insertEmoji('todo-title', '⚡')">⚡</span>
            <span onclick="insertEmoji('todo-title', '🔥')">🔥</span>
            <span onclick="insertEmoji('todo-title', '💡')">💡</span>
            <span onclick="insertEmoji('todo-title', '⏰')">⏰</span>
          </small>
        </div>
      </div>
      <div class="form-group">
        <label for="todo-due-date">마감일</label>
        <input type="date" id="todo-due-date" value="${formattedDueDate}">
      </div>
      <div class="form-group">
        <label for="todo-priority">우선순위</label>
        <select id="todo-priority">
          <option value="low">낮음</option>
          <option value="medium" selected>중간</option>
          <option value="high">높음</option>
        </select>
      </div>
<div class="form-group">
  <label for="todo-description">설명</label>
  <div id="todo-description-editor"></div>
</div>
    </form>
  `;
  
  showModal("할 일 추가", modalContent, saveTodo);
  
  // 에디터 초기화
  setTimeout(() => {
    initTextEditor('todo-description-editor', '할 일에 대한 설명을 입력하세요...');
  }, 100);
}

// 할 일 저장
async function saveTodo() {
  const titleEl = document.getElementById('todo-title');
  const dueDateEl = document.getElementById('todo-due-date');
  const priorityEl = document.getElementById('todo-priority');
  
  if (!titleEl.value) {
    alert('제목은 필수 입력 항목입니다.');
    return;
  }
  
  const description = getEditorContent('todo-description-editor');
  
  try {
    // 할 일 데이터 구성
    const todoData = {
      title: titleEl.value,
      priority: priorityEl.value,
      completed: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    // 선택적 필드 추가
    if (dueDateEl.value) {
      const dueDate = new Date(dueDateEl.value);
      todoData.dueDate = firebase.firestore.Timestamp.fromDate(dueDate);
    }
    
    if (description) {
      todoData.description = description;
    }
    
    // Firestore에 저장
    await db.collection("todos").add(todoData);
    
    // 모달 닫기
    closeModal();
    
    // 할 일 목록 새로고침
    loadTodos();
  } catch (error) {
    console.error("할 일 저장 중 오류 발생:", error);
    alert('할 일을 저장하는 중 오류가 발생했습니다.');
  }
}

// 할 일 편집 폼 표시
async function editTodo(todoId) {
  try {
    const todoDoc = await db.collection("todos").doc(todoId).get();
    
    if (!todoDoc.exists) {
      alert('할 일 정보를 찾을 수 없습니다.');
      return;
    }
    
    const todo = todoDoc.data();
    
    const modalContent = `
      <form id="todo-form">
        <input type="hidden" id="todo-id" value="${todoId}">
        <div class="form-group">
          <label for="todo-title">제목</label>
          <input type="text" id="todo-title" value="${todo.title}" required>
        </div>
        <div class="form-group">
          <label for="todo-due-date">마감일</label>
          <input type="date" id="todo-due-date" value="${todo.dueDate ? formatDate(todo.dueDate) : ''}">
        </div>
        <div class="form-group">
          <label for="todo-priority">우선순위</label>
          <select id="todo-priority">
            <option value="low" ${todo.priority === 'low' ? 'selected' : ''}>낮음</option>
            <option value="medium" ${!todo.priority || todo.priority === 'medium' ? 'selected' : ''}>중간</option>
            <option value="high" ${todo.priority === 'high' ? 'selected' : ''}>높음</option>
          </select>
        </div>
        <div class="form-group">
          <label for="todo-completed">
            <input type="checkbox" id="todo-completed" ${todo.completed ? 'checked' : ''}>
            완료됨
          </label>
        </div>
        <div class="form-group">
          <label for="todo-description">설명</label>
          <div id="todo-description-editor"></div>
        </div>
      </form>
    `;
    
    showModal("할 일 수정", modalContent, updateTodo);
    
    // 에디터 초기화
    setTimeout(() => {
      initTextEditor('todo-description-editor', '할 일에 대한 설명을 입력하세요...', todo.description || '');
    }, 100);
  } catch (error) {
    console.error("할 일 정보 로드 중 오류 발생:", error);
    alert('할 일 정보를 불러오는 중 오류가 발생했습니다.');
  }
}

// 할 일 업데이트
async function updateTodo() {
  const todoId = document.getElementById('todo-id').value;
  const titleEl = document.getElementById('todo-title');
  const dueDateEl = document.getElementById('todo-due-date');
  const priorityEl = document.getElementById('todo-priority');
  const completedEl = document.getElementById('todo-completed');
  
  if (!titleEl.value) {
    alert('제목은 필수 입력 항목입니다.');
    return;
  }
  
  const description = getEditorContent('todo-description-editor');
  
  try {
    // 할 일 데이터 구성
    const todoData = {
      title: titleEl.value,
      priority: priorityEl.value,
      completed: completedEl.checked,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    // 선택적 필드 추가
    if (dueDateEl.value) {
      const dueDate = new Date(dueDateEl.value);
      todoData.dueDate = firebase.firestore.Timestamp.fromDate(dueDate);
    } else {
      // 날짜 필드 삭제
      todoData.dueDate = null;
    }
    
    if (description) {
      todoData.description = description;
    }
    
    // Firestore에 업데이트
    await db.collection("todos").doc(todoId).update(todoData);
    
    // 모달 닫기
    closeModal();
    
    // 할 일 목록 새로고침
    loadTodos();
  } catch (error) {
    console.error("할 일 업데이트 중 오류 발생:", error);
    alert('할 일을 업데이트하는 중 오류가 발생했습니다.');
  }
}

// 할 일 삭제
async function deleteTodo(todoId) {
  if (confirm('정말로 이 할 일을 삭제하시겠습니까?')) {
    try {
      await db.collection("todos").doc(todoId).delete();
      loadTodos(); // 목록 새로고침
    } catch (error) {
      console.error("할 일 삭제 중 오류 발생:", error);
      alert('할 일을 삭제하는 중 오류가 발생했습니다.');
    }
  }
}

// =========== 진행률 관리 기능 ===========

// 진행률 페이지 렌더링
function renderProgressPage(container) {
  container.innerHTML = `
    <div class="page-container">
      <div class="page-header">
        <h1>진행률 관리</h1>
        <div class="page-actions">
          <button onclick="showAddGoalForm()">목표 추가</button>
        </div>
      </div>
      <div id="goals-container">
        <p>목표를 불러오는 중...</p>
      </div>
    </div>
  `;
  
  // 목표 데이터 불러오기 함수 호출 추가
  loadGoals();
}

// 목표 데이터 불러오기 함수 수정
async function loadGoals() {
  try {
    console.log("목표 데이터 로딩 시작..."); // 디버깅 로그 추가
    
    const goalsContainerEl = document.getElementById("goals-container");
    goalsContainerEl.innerHTML = '<p>목표를 불러오는 중...</p>';
    
    // 모든 목표 불러오기 (필터 없이)
    const goalsRef = db.collection("goals");
    console.log("Firestore 쿼리 생성됨");
    
    const snapshot = await cachedCollection("goals");
    console.log("Firestore에서 데이터 받음, 문서 수:", snapshot.size);
    
    if (snapshot.empty) {
      console.log("Firebase에서 목표를 찾을 수 없습니다");
      goalsContainerEl.innerHTML = '<p>등록된 목표가 없습니다.</p>';
      return;
    }
    
    // 목표 데이터를 저장할 배열
    const goals = [];
    
    // 모든 목표 처리
    for (const doc of snapshot.docs) {
      const goal = doc.data();
      const goalId = doc.id;
      
      console.log("목표 ID:", goalId, "제목:", goal.title || "제목 없음", "completed 필드:", goal.completed);
      
      // 목표에 속한 세부 항목 불러오기
      try {
        const tasksSnapshot = await cachedSubcollection("goals", goalId, "tasks");
        console.log(`목표 ID ${goalId}의 작업 수:`, tasksSnapshot.size);
        
        const tasks = [];
        let completedTasks = 0;
        
        tasksSnapshot.forEach(taskDoc => {
          const task = taskDoc.data();
          tasks.push({
            id: taskDoc.id,
            title: task.title || "제목 없음",
            completed: task.completed || false
          });
          
          if (task.completed) {
            completedTasks++;
          }
        });
        
        const progress = tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0;
        
        // completed 필드가 undefined인 경우를 처리
        let isCompleted;
        if (goal.completed !== undefined) {
          isCompleted = goal.completed;
        } else {
          isCompleted = progress === 100;
          // completed 필드가 없으면 설정
          try {
            await db.collection("goals").doc(goalId).update({
              completed: isCompleted,
              updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            console.log(`목표 ID ${goalId}의 completed 필드를 ${isCompleted}로 업데이트했습니다`);
          } catch (updateError) {
            console.error(`목표 ID ${goalId}의 completed 필드 업데이트 실패:`, updateError);
          }
        }
        
        // 목표 정보를 배열에 저장
        goals.push({
          id: goalId,
          title: goal.title || "제목 없음",
          tasks,
          progress,
          isCompleted,
          order: goal.order !== undefined ? goal.order : 9999,
          createdAt: goal.createdAt
        });
      } catch (taskError) {
        console.error(`목표 ID ${goalId}의 작업 로드 중 오류:`, taskError);
        // 오류가 발생해도 기본 목표 정보는 추가
        goals.push({
          id: goalId,
          title: goal.title || "제목 없음",
          tasks: [],
          progress: 0,
          isCompleted: goal.completed || false,
          order: goal.order !== undefined ? goal.order : 9999,
          createdAt: goal.createdAt
        });
      }
    }
    
    console.log("처리된 총 목표 수:", goals.length);
    
    // 목표를 활성/완료 상태로 분류
    const activeGoals = goals.filter(goal => !goal.isCompleted);
    const completedGoals = goals.filter(goal => goal.isCompleted);
    
    // 활성 목표는 order로 정렬
    activeGoals.sort((a, b) => a.order - b.order);
    
    // 완료된 목표는 createdAt으로 정렬 (최신순)
    completedGoals.sort((a, b) => {
      if (!a.createdAt || !b.createdAt) return 0;
      
      // Firestore Timestamp를 Date로 변환
      let dateA, dateB;
      
      if (a.createdAt && typeof a.createdAt.toDate === 'function') {
        dateA = a.createdAt.toDate();
      } else if (a.createdAt) {
        dateA = new Date(a.createdAt);
      } else {
        dateA = new Date(0); // 기본값
      }
      
      if (b.createdAt && typeof b.createdAt.toDate === 'function') {
        dateB = b.createdAt.toDate();
      } else if (b.createdAt) {
        dateB = new Date(b.createdAt);
      } else {
        dateB = new Date(0); // 기본값
      }
      
      return dateB - dateA; // 내림차순
    });
    
    // 정렬된 목표 배열 병합 - 완료된 목표는 맨 아래로
    const sortedGoals = [...activeGoals, ...completedGoals];
    
    console.log("정렬 후 활성 목표:", activeGoals.length, "완료된 목표:", completedGoals.length);
    
    // 목표가 없는 경우 처리
    if (sortedGoals.length === 0) {
      goalsContainerEl.innerHTML = '<p>등록된 목표가 없습니다.</p>';
      return;
    }
    
// 목표 리스트 HTML 생성
let html = '';

sortedGoals.forEach((goal, index) => {
  const isFirstActiveGoal = !goal.isCompleted && activeGoals.indexOf(goal) === 0;
  const isLastActiveGoal = !goal.isCompleted && activeGoals.indexOf(goal) === activeGoals.length - 1;
  
html += `
  <div class="progress-goal ${goal.isCompleted ? 'completed' : ''}" data-id="${goal.id}">
    <div class="progress-goal-title">
      <h2>${goal.title}</h2>
      <div class="list-item-actions">
        ${!goal.isCompleted ? `
          <button onclick="moveGoalUp('${goal.id}')" class="move-goal-up-btn" ${isFirstActiveGoal ? 'disabled' : ''}>
            <i class="fas fa-arrow-up"></i>
          </button>
          <button onclick="moveGoalDown('${goal.id}')" class="move-goal-down-btn" ${isLastActiveGoal ? 'disabled' : ''}>
            <i class="fas fa-arrow-down"></i>
          </button>
        ` : ''}
        <button onclick="showAddTaskForm('${goal.id}')">항목 추가</button>
        <button onclick="editGoal('${goal.id}')">수정</button>
        <button onclick="deleteGoal('${goal.id}')">삭제</button>
      </div>
    </div>
    ...
    <div class="progress-container">
      <div class="progress-bar" style="width: ${goal.progress}%;"></div>
    </div>
    <div class="progress-percentage">${goal.progress}% 완료</div>
    
    <div class="progress-goal-tasks">
      ${goal.tasks.length > 0 ? 
        `<ul class="list-container">
          ${goal.tasks.map(task => `
            <li class="progress-task" data-id="${task.id}">
              <div class="progress-task-checkbox">
                <input 
                  type="checkbox" 
                  class="task-checkbox"
                  data-goal-id="${goal.id}"
                  data-task-id="${task.id}"
                  ${task.completed ? 'checked' : ''}
                  onclick="toggleTaskComplete('${goal.id}', '${task.id}', ${!task.completed})"
                />
              </div>
              <div class="list-item-content ${task.completed ? 'completed' : ''}">
                <div>${task.title}</div>
              </div>
              <div class="list-item-actions">
                <button onclick="editTask('${goal.id}', '${task.id}')" class="edit-task-btn" data-goal-id="${goal.id}" data-task-id="${task.id}">수정</button>
                <button onclick="deleteTask('${goal.id}', '${task.id}')" class="delete-task-btn" data-goal-id="${goal.id}" data-task-id="${task.id}">삭제</button>
              </div>
            </li>
          `).join('')}
        </ul>` 
        : '<p>등록된 세부 항목이 없습니다.</p>'
      }
    </div>
  </div>
`;
});

goalsContainerEl.innerHTML = html;

// CSS 스타일이 제대로 적용되지 않을 경우를 대비해 직접 스타일 추가
const styleEl = document.createElement('style');
styleEl.textContent = `
  /* 진행률 바 스타일 */
  .progress-container {
    width: 100%;
    height: 24px;
    background-color: #e0e0e0;
    border-radius: 12px;
    margin: 10px 0;
    overflow: hidden;
  }

  .progress-bar {
    height: 100%;
    background-color: #4caf50;
    border-radius: 12px;
    transition: width 0.3s ease;
  }

  .progress-goal {
    margin-bottom: 20px;
    padding: 15px;
    border-radius: 8px;
    background-color: #fff;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.05);
    transition: all 0.3s ease;
  }

/* 이동 버튼 스타일 추가 */
.move-goal-up-btn,
.move-goal-down-btn {
  padding: 5px 8px !important;
  margin-right: 5px !important;
  background-color: #f0f0f0 !important;
  color: #333 !important;
}

.move-goal-up-btn:hover,
.move-goal-down-btn:hover {
  background-color: #e0e0e0 !important;
}

.move-goal-up-btn:disabled,
.move-goal-down-btn:disabled {
  opacity: 0.3 !important;
  cursor: not-allowed !important;
}

/* 완료된 항목 스타일 강화 */
.list-item-content.completed {
  text-decoration: line-through !important;
  color: #757575 !important;
}

  .progress-goal-title {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  }

  .progress-goal-tasks {
    margin-top: 15px;
  }

  .progress-task {
    display: flex;
    align-items: center;
    margin-bottom: 8px;
  }

  .progress-task-checkbox {
    margin-right: 10px;
  }

  /* 완료된 항목 스타일 */
  .list-item-content.completed {
    text-decoration: line-through !important;
    color: #757575 !important;
  }
`;
document.head.appendChild(styleEl);

// 목표 렌더링 완료
console.log("목표 렌더링 시작");

// 완료된 목표 스타일 직접 적용
document.querySelectorAll('.progress-goal.completed').forEach(elem => {
  elem.style.backgroundColor = '#f5f5f5';
  elem.style.opacity = '0.8';
  elem.style.borderLeft = '5px solid #9e9e9e';
});

// 추가 디버깅 로그
console.log("이벤트 리스너 설정 완료, 상하 버튼 개수: ", 
  document.querySelectorAll('.move-goal-up-btn').length,
  document.querySelectorAll('.move-goal-down-btn').length);

// 완료된 목표 갯수 확인
console.log("완료된 목표 갯수:", document.querySelectorAll('.progress-goal.completed').length);
console.log("전체 목표 갯수:", document.querySelectorAll('.progress-goal').length);

        // 여기에 드래그 앤 드롭 초기화 코드를 추가하세요
    enableDragAndDrop();
    
  } catch (error) {
    console.error("목표를 불러오는 중 오류 발생:", error);
    console.error("오류 상세:", error.message, error.stack);
    document.getElementById("goals-container").innerHTML = '<p>목표를 불러오는 중 오류가 발생했습니다.</p>';
  }
}

// app.js 파일
async function moveGoalUp(goalId) {
  try {
    console.log("moveGoalUp 실행:", goalId);
    
    // 진행 중인 목표만 가져오기
    const goalsRef = db.collection("goals");
    
    // 완료되지 않은 목표만 가져오기
    let query = goalsRef.where("completed", "==", false);
    
    // 쿼리 실행
    const snapshot = await query.orderBy("order", "asc").get();
    
    // 목표 목록 구성
    const goals = [];
    snapshot.forEach(doc => {
      goals.push({
        id: doc.id,
        order: doc.data().order !== undefined ? doc.data().order : 9999
      });
    });
    
    // 목록이 비어있으면 처리 중단
    if (goals.length === 0) {
      console.log("이동할 목표가 없습니다");
      return;
    }
    
    // 현재 목표의 인덱스 찾기
    const currentIndex = goals.findIndex(g => g.id === goalId);
    
    // 목표를 찾을 수 없으면 처리 중단
    if (currentIndex === -1) {
      console.log("지정된 목표를 찾을 수 없습니다", goalId);
      console.log("사용 가능한 목표 ID들:", goals.map(g => g.id));
      return;
    }
    
    // 첫 번째면 이동 불가
    if (currentIndex <= 0) {
      console.log("첫 번째 항목이므로 이동 불가");
      return;
    }
    
    // 이전 목표와 현재 목표의 순서를 교환
    const prevGoal = goals[currentIndex - 1];
    const currentGoal = goals[currentIndex];
    
    // 두 목표의 순서 교환
    const tempOrder = prevGoal.order;
    
    const batch = db.batch();
    batch.update(goalsRef.doc(prevGoal.id), { 
      order: currentGoal.order,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    batch.update(goalsRef.doc(currentGoal.id), { 
      order: tempOrder,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    await batch.commit();
    console.log("목표 순서 변경 완료:", goalId);
    
    // 목표 목록 새로고침
    await loadGoals();
  } catch (error) {
    console.error("목표 순서 변경 중 오류 발생:", error);
    alert("목표 순서를 변경하는 중 오류가 발생했습니다.");
  }
}

async function moveGoalDown(goalId) {
  try {
    console.log("moveGoalDown 실행:", goalId);
    
    // 진행 중인 목표만 가져오기
    const goalsRef = db.collection("goals");
    const snapshot = await goalsRef
      .where("completed", "==", false)
      .orderBy("order", "asc")
      .get();
    
    const goals = [];
    snapshot.forEach(doc => {
      goals.push({
        id: doc.id,
        order: doc.data().order !== undefined ? doc.data().order : 9999
      });
    });
    
    // 현재 목표의 인덱스 찾기
    const currentIndex = goals.findIndex(g => g.id === goalId);
    
    // 마지막이면 이동 불가
    if (currentIndex >= goals.length - 1) {
      console.log("마지막 항목이므로 이동 불가");
      return;
    }
    
    // 다음 목표와 현재 목표의 순서를 교환
    const nextGoal = goals[currentIndex + 1];
    const currentGoal = goals[currentIndex];
    
    // 두 목표의 순서 교환
    const tempOrder = nextGoal.order;
    
    const batch = db.batch();
    batch.update(goalsRef.doc(nextGoal.id), { 
      order: currentGoal.order,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    batch.update(goalsRef.doc(currentGoal.id), { 
      order: tempOrder,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    await batch.commit();
    
    // 목표 목록 새로고침
    await loadGoals();
  } catch (error) {
    console.error("목표 순서 변경 중 오류 발생:", error);
    alert("목표 순서를 변경하는 중 오류가 발생했습니다.");
  }
}

// 목표 추가 폼 표시
function showAddGoalForm() {
  const modalContent = `
    <form id="goal-form">
      <div class="form-group">
        <label for="goal-title">목표 제목</label>
        <input type="text" id="goal-title" required>
      </div>
      <div class="form-group">
        <label for="goal-description">설명 (선택사항)</label>
        <div id="goal-description-editor"></div>
      </div>
    </form>
  `;
  
  showModal("목표 추가", modalContent, saveGoal);
  
  // 에디터 초기화
  setTimeout(() => {
    initTextEditor('goal-description-editor', '목표에 대한 설명을 입력하세요...');
  }, 100);
}

// 목표 저장 함수 수정 - 새 목표 생성 시
async function saveGoal() {
  const titleEl = document.getElementById('goal-title');
  
  if (!titleEl.value) {
    alert('목표 제목은 필수 입력 항목입니다.');
    return;
  }
  
  const description = getEditorContent('goal-description-editor');
  
  try {
    // 현재 최소 순서 값 가져오기 (진행 중인 목표만)
    const goalsRef = db.collection("goals");
    const snapshot = await goalsRef
      .where("completed", "==", false)
      .orderBy("order", "asc")
      .limit(1)
      .get();
    
    let minOrder = 10; // 기본 시작 값
    
    if (!snapshot.empty) {
      const firstGoal = snapshot.docs[0].data();
      minOrder = (firstGoal.order !== undefined ? firstGoal.order : 10) - 10;
    }
    
    // 목표 데이터 구성
    const goalData = {
      title: titleEl.value,
      completed: false, // 새 목표는 기본적으로 미완료
      order: minOrder, // 새로운 목표는 가장 위에 표시
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    if (description) {
      goalData.description = description;
    }
    
    // Firestore에 저장
    await db.collection("goals").add(goalData);
    
    // 모달 닫기
    closeModal();
    
    // 목표 목록 새로고침
    loadGoals();
  } catch (error) {
    console.error("목표 저장 중 오류 발생:", error);
    alert('목표를 저장하는 중 오류가 발생했습니다.');
  }
}

// 목표 편집 폼 표시
async function editGoal(goalId) {
  try {
    const goalDoc = await db.collection("goals").doc(goalId).get();
    
    if (!goalDoc.exists) {
      alert('목표 정보를 찾을 수 없습니다.');
      return;
    }
    
    const goal = goalDoc.data();
    
    const modalContent = `
      <form id="goal-form">
        <input type="hidden" id="goal-id" value="${goalId}">
        <div class="form-group">
          <label for="goal-title">목표 제목</label>
          <input type="text" id="goal-title" value="${goal.title}" required>
        </div>
        <div class="form-group">
          <label for="goal-description">설명 (선택사항)</label>
          <div id="goal-description-editor"></div>
        </div>
      </form>
    `;
    
    showModal("목표 수정", modalContent, updateGoal);
    
    // 에디터 초기화
    setTimeout(() => {
      initTextEditor('goal-description-editor', '목표에 대한 설명을 입력하세요...', goal.description || '');
    }, 100);
  } catch (error) {
    console.error("목표 정보 로드 중 오류 발생:", error);
    alert('목표 정보를 불러오는 중 오류가 발생했습니다.');
  }
}

// 목표 업데이트
async function updateGoal() {
  const goalId = document.getElementById('goal-id').value;
  const titleEl = document.getElementById('goal-title');
  
  if (!titleEl.value) {
    alert('목표 제목은 필수 입력 항목입니다.');
    return;
  }
  
  const description = getEditorContent('goal-description-editor');
  
  try {
    // 목표 데이터 구성
    const goalData = {
      title: titleEl.value,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    if (description) {
      goalData.description = description;
    }
    
    // Firestore에 업데이트
    await db.collection("goals").doc(goalId).update(goalData);
    
    // 모달 닫기
    closeModal();
    
    // 목표 목록 새로고침
    loadGoals();
  } catch (error) {
    console.error("목표 업데이트 중 오류 발생:", error);
    alert('목표를 업데이트하는 중 오류가 발생했습니다.');
  }
}

// 목표 삭제
async function deleteGoal(goalId) {
  if (confirm('정말로 이 목표를 삭제하시겠습니까? 모든 세부 항목도 함께 삭제됩니다.')) {
    try {
      // 먼저 모든 세부 항목 삭제
      const tasksSnapshot = await db.collection("goals").doc(goalId).collection("tasks").get();
      const batch = db.batch();
      
      tasksSnapshot.forEach(doc => {
        batch.delete(doc.ref);
      });
      
      // 배치 작업 실행
      await batch.commit();
      
      // 목표 삭제
      await db.collection("goals").doc(goalId).delete();
      
      // 목표 목록 새로고침
      loadGoals();
    } catch (error) {
      console.error("목표 삭제 중 오류 발생:", error);
      alert('목표를 삭제하는 중 오류가 발생했습니다.');
    }
  }
}

// 세부 항목 추가 폼 표시
function showAddTaskForm(goalId) {
  const modalContent = `
    <form id="task-form">
      <input type="hidden" id="goal-id" value="${goalId}">
      <div class="form-group">
        <label for="task-title">항목 제목</label>
        <input type="text" id="task-title" required>
      </div>
    </form>
  `;
  
  showModal("세부 항목 추가", modalContent, saveTask);
}

// 세부 항목 저장
async function saveTask() {
  const goalId = document.getElementById('goal-id').value;
  const titleEl = document.getElementById('task-title');
  
  if (!titleEl.value) {
    alert('항목 제목은 필수 입력 항목입니다.');
    return;
  }
  
  try {
    // 세부 항목 데이터 구성
    const taskData = {
      title: titleEl.value,
      completed: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    // Firestore에 저장
    await db.collection("goals").doc(goalId).collection("tasks").add(taskData);
    
    // 모달 닫기
    closeModal();
    
    // 목표 목록 새로고침
    loadGoals();
  } catch (error) {
    console.error("세부 항목 저장 중 오류 발생:", error);
    alert('세부 항목을 저장하는 중 오류가 발생했습니다.');
  }
}

// 세부 항목 편집 폼 표시
async function editTask(goalId, taskId) {
  try {
    const taskDoc = await db.collection("goals").doc(goalId).collection("tasks").doc(taskId).get();
    
    if (!taskDoc.exists) {
      alert('세부 항목 정보를 찾을 수 없습니다.');
      return;
    }
    
    const task = taskDoc.data();
    
    const modalContent = `
      <form id="task-form">
        <input type="hidden" id="goal-id" value="${goalId}">
        <input type="hidden" id="task-id" value="${taskId}">
        <div class="form-group">
          <label for="task-title">항목 제목</label>
          <input type="text" id="task-title" value="${task.title}" required>
        </div>
        <div class="form-group">
          <label for="task-completed">
            <input type="checkbox" id="task-completed" ${task.completed ? 'checked' : ''}>
            완료됨
          </label>
        </div>
      </form>
    `;
    
    showModal("세부 항목 수정", modalContent, updateTask);
  } catch (error) {
    console.error("세부 항목 정보 로드 중 오류 발생:", error);
    alert('세부 항목 정보를 불러오는 중 오류가 발생했습니다.');
  }
}

// 세부 항목 업데이트
async function updateTask() {
  const goalId = document.getElementById('goal-id').value;
  const taskId = document.getElementById('task-id').value;
  const titleEl = document.getElementById('task-title');
  const completedEl = document.getElementById('task-completed');
  
  if (!titleEl.value) {
    alert('항목 제목은 필수 입력 항목입니다.');
    return;
  }
  
  try {
    // 세부 항목 데이터 구성
    const taskData = {
      title: titleEl.value,
      completed: completedEl.checked,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    // Firestore에 업데이트
    await db.collection("goals").doc(goalId).collection("tasks").doc(taskId).update(taskData);
    
    // 모달 닫기
    closeModal();
    
    // 목표 목록 새로고침
    loadGoals();
  } catch (error) {
    console.error("세부 항목 업데이트 중 오류 발생:", error);
    alert('세부 항목을 업데이트하는 중 오류가 발생했습니다.');
  }
}

async function toggleTaskComplete(goalId, taskId, completed) {
  try {
    console.log(`세부 항목 토글: 목표 ID ${goalId}, 작업 ID ${taskId}, 완료 ${completed}`);
    
    // 세부 항목 업데이트
    await db.collection("goals").doc(goalId).collection("tasks").doc(taskId).update({ 
      completed,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp() 
    });
    
    // 해당 목표의 모든 세부 항목 가져오기
    const tasksSnapshot = await db.collection("goals").doc(goalId).collection("tasks").get();
    let totalTasks = 0;
    let completedTasks = 0;
    
    tasksSnapshot.forEach(doc => {
      totalTasks++;
      if (doc.data().completed) {
        completedTasks++;
      }
    });
    
    // 목표 진행률 계산
    const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    console.log(`목표 ID ${goalId} 진행률: ${progress}% (${completedTasks}/${totalTasks})`);
    
    // 목표 완료 상태 업데이트
    const isCompleted = progress === 100;
    await db.collection("goals").doc(goalId).update({
      completed: isCompleted,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`목표 ID ${goalId} 완료 상태 업데이트: ${isCompleted}`);
    
    // 목표 목록 새로고침
    await loadGoals();
  } catch (error) {
    console.error("세부 항목 상태 변경 중 오류 발생:", error);
    alert("세부 항목 상태를 변경하는 중 오류가 발생했습니다.");
  }
}

// 세부 항목 삭제
async function deleteTask(goalId, taskId) {
  if (confirm('정말로 이 세부 항목을 삭제하시겠습니까?')) {
    try {
      await db.collection("goals").doc(goalId).collection("tasks").doc(taskId).delete();
      loadGoals(); // 목록 새로고침
    } catch (error) {
      console.error("세부 항목 삭제 중 오류 발생:", error);
      alert('세부 항목을 삭제하는 중 오류가 발생했습니다.');
    }
  }
}
function enableDragAndDrop() {
  const container = document.getElementById('goals-container');
  if (!container) return;

  // 드래그 가능한 목표 목록 가져오기 (완료되지 않은 것만)
  const goals = container.querySelectorAll('.progress-goal:not(.completed)');
  
  goals.forEach(goal => {
    // 드래그 가능하게 설정
    goal.setAttribute('draggable', 'true');
    
    // 드래그 핸들러 역할을 하는 제목 부분만 드래그 가능하게 설정
    const titleBar = goal.querySelector('.progress-goal-title');
    if (titleBar) {
      titleBar.style.cursor = 'grab';
      titleBar.style.userSelect = 'none'; // 텍스트 선택 방지
    }
    
    // 드래그 시작 이벤트
    goal.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', goal.dataset.id);
      goal.classList.add('dragging');
      // 드래그 이미지 숨기기
      setTimeout(() => {
        goal.style.opacity = '0.4';
      }, 0);
    });
    
    // 드래그 종료 이벤트
    goal.addEventListener('dragend', () => {
      goal.classList.remove('dragging');
      goal.style.opacity = '1';
    });
    
    // 드래그 오버 이벤트 (드래그 중인 요소가 다른 요소 위에 있을 때)
    goal.addEventListener('dragover', (e) => {
      e.preventDefault();
      const draggingElement = document.querySelector('.dragging');
      
      // 자기 자신이거나 완료된 목표는 처리하지 않음
      if (!draggingElement || draggingElement === goal || goal.classList.contains('completed')) {
        return;
      }
      
      // 마우스 위치에 따라 위/아래 결정
      const rect = goal.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      
      if (e.clientY < midpoint) {
        // 마우스가 요소의 윗부분에 있으면 위에 배치
        container.insertBefore(draggingElement, goal);
      } else {
        // 마우스가 요소의 아랫부분에 있으면 아래에 배치
        container.insertBefore(draggingElement, goal.nextSibling);
      }
    });
    
    // 드롭 이벤트 (드래그 요소를 놓았을 때)
    goal.addEventListener('drop', async (e) => {
      e.preventDefault();
      const sourceId = e.dataTransfer.getData('text/plain');
      const targetId = goal.dataset.id;
      
      if (sourceId !== targetId && !goal.classList.contains('completed')) {
        // 새로운 순서를 데이터베이스에 저장
        await updateGoalOrders();
      }
    });
  });
  
  // 컨테이너 자체에도 드롭 이벤트 추가
  container.addEventListener('dragover', (e) => {
    e.preventDefault();
  });
  
  container.addEventListener('drop', async (e) => {
    e.preventDefault();
    await updateGoalOrders();
  });
}

// 목표 순서 업데이트 함수
async function updateGoalOrders() {
  try {
    const container = document.getElementById('goals-container');
    if (!container) return;
    
    const goals = container.querySelectorAll('.progress-goal:not(.completed)');
    
    if (goals.length === 0) return;
    
    // 현재 화면에 표시된 순서대로 order 값 재할당
    const batch = db.batch();
    const goalsRef = db.collection("goals");
    
    let order = 10; // 시작 order 값
    goals.forEach(goal => {
      const goalId = goal.dataset.id;
      batch.update(goalsRef.doc(goalId), {
        order: order,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      order += 10; // 다음 order 값 (간격을 두어 나중에 중간 삽입이 쉽도록)
    });
    
    await batch.commit();
    console.log("목표 순서 업데이트 완료");
    
  } catch (error) {
    console.error("목표 순서 업데이트 중 오류 발생:", error);
  }
}
// =========== 체중 관리 기능 ===========

function renderDietPage(container) {
  resetPersistentCalendar('weight');
  container.innerHTML = `
    <div class="page-container">
      <div class="page-header">
        <h1>그만먹어 (체중 관리)</h1>
        <div class="page-actions">
          <div class="view-toggle">
            <button id="list-view-button" class="${currentView === 'list' ? 'active' : ''}" onclick="toggleView('list')">
              <i class="fas fa-list"></i> 리스트
            </button>
            <button id="calendar-view-button" class="${currentView === 'calendar' ? 'active' : ''}" onclick="toggleView('calendar')">
              <i class="fas fa-calendar-alt"></i> 달력
            </button>
          </div>
          <button onclick="showAddWeightForm()">체중 기록</button>
        </div>
      </div>
      
<div class="card">
  <h2 class="card-title">체중 추이</h2>
  
  <!-- 기간 설정 컨트롤 추가 -->
  <div class="period-control">
    <label for="weight-period">기간:</label>
    <select id="weight-period" onchange="updateWeightChart()">
      <option value="1">최근 1개월</option>
      <option value="3" selected>최근 3개월</option>
      <option value="6">최근 6개월</option>
      <option value="12">최근 1년</option>
      <option value="0">전체 기간</option>
      <option value="custom">사용자 정의</option>
    </select>
    
    <!-- 사용자 정의 기간 설정 - style="display: none;" 추가 -->
    <div class="custom-period" style="display: none;">
      <label for="weight-start-date">시작일:</label>
      <input type="date" id="weight-start-date">
      <label for="weight-end-date">종료일:</label>
      <input type="date" id="weight-end-date">
      <button id="apply-custom-period" onclick="applyCustomPeriod()">적용</button>
    </div>
  </div>
  
  <div class="chart-container weight-chart">
    <canvas id="weight-chart"></canvas>
  </div>
</div>
      
      <!-- 섹션 구분선 추가 -->
      <div class="section-divider"></div>

      <div id="calendar-view-container" class="calendar-container" style="display: ${currentView === 'calendar' ? 'block' : 'none'}">
        <div id="weight-calendar"></div>
      </div>
      
      <div id="list-view-container" style="display: ${currentView === 'list' ? 'block' : 'none'}">
        <div class="card">
          <h2 class="card-title">체중 기록</h2>
          <div id="weights-list">
            <p>기록을 불러오는 중...</p>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // 체중 데이터 불러오기
  loadWeights();
  
  // 기간 설정 UI 초기화 함수 호출 추가
  setTimeout(() => {
    initDateRangeUI();
  }, 100);
  
  // 기간 설정 관련 스타일 추가
  const styleEl = document.createElement('style');
  styleEl.id = 'weight-period-styles';
  styleEl.textContent = `
    .period-control {
      margin-bottom: 15px;
      background-color: #f9f9f9;
      padding: 15px;
      border-radius: 8px;
      border: 1px solid #e0e0e0;
    }
    
    .custom-period {
      margin-top: 15px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
    }
    
    @media (max-width: 768px) {
      .custom-period {
        flex-direction: column;
        align-items: flex-start;
      }
      
      .custom-period input,
      .custom-period button {
        width: 100%;
        margin-bottom: 5px;
      }
    }
  `;
  document.head.appendChild(styleEl);
}

// 체중 데이터 불러오기
async function loadWeights() {
  try {
    const weightsRef = db.collection("weights");
    const snapshot = await cachedCollection("weights", { orderBy: "date", dir: "desc" });
    
    const weights = [];
    snapshot.forEach(doc => {
      const weight = doc.data();
      weights.push({
        id: doc.id,
        weight: weight.weight,
        date: weight.date.toDate(),
        notes: weight.notes || ''
      });
    });
        // 데이터 캐싱 추가 - 이 줄을 추가
    window.cachedWeights = weights;
    
    // 뷰에 따라 다르게 표시
    if (currentView === 'list') {
      renderWeightsList(weights);
    } else {
      renderWeightsCalendar(weights);
    }
    
    // 차트 그리기 (항상 표시)
    renderWeightChart(weights);
  } catch (error) {
    console.error("체중 기록을 불러오는 중 오류 발생:", error);
    document.getElementById("weights-list").innerHTML = '<p>체중 기록을 불러오는 중 오류가 발생했습니다.</p>';
  }
}

// 체중 리스트 렌더링
function renderWeightsList(weights) {
  const weightsListEl = document.getElementById("weights-list");
  
  if (weights.length === 0) {
    weightsListEl.innerHTML = '<p>등록된 체중 기록이 없습니다.</p>';
    return;
  }
  
  let html = '<ul class="list-container">';
  
  weights.forEach(weight => {
    html += `
      <li class="list-item" data-id="${weight.id}">
        <div class="list-item-content">
          <div class="list-item-title">${weight.weight} kg</div>
          <div class="list-item-date">${formatDate(weight.date)}</div>
          ${weight.notes ? `<div class="list-item-description">${weight.notes}</div>` : ''}
        </div>
        <div class="list-item-actions">
          <button onclick="editWeight('${weight.id}')">수정</button>
          <button onclick="deleteWeight('${weight.id}')">삭제</button>
        </div>
      </li>
    `;
  });
  
  html += '</ul>';
  weightsListEl.innerHTML = html;
}

// 체중 달력 렌더링
function renderWeightsCalendar(weights) {
  const calendarEl = document.getElementById('weight-calendar');
  
  if (!calendarEl) return;
  
  // 달력에 표시할 이벤트 형식으로 변환
  const events = weights.map(weight => {
    return {
      id: weight.id,
      title: `${weight.weight} kg`,
      start: weight.date,
      allDay: true
    };
  });
  
  // FullCalendar 초기화
  createPersistentCalendar('weight', calendarEl, {
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth'
    },
    initialView: 'dayGridMonth',
    locale: 'ko',
    firstDay: 1, // 주의 시작: 월요일
    events: events,
    eventClick: function(info) {
      editWeight(info.event.id);
    },
    dateClick: function(info) {
      showAddWeightForm(info.dateStr);
    }
  });
}

// 체중 차트 렌더링
function renderWeightChart(weights) {
  const chartEl = document.getElementById('weight-chart');
  const chartContainerEl = chartEl ? chartEl.closest('.chart-container') : null;
  
  if (!chartEl || !chartContainerEl || weights.length === 0) return;
  
  // 차트 높이 명시적 설정
  chartContainerEl.style.height = '400px';
  
  // 차트용 데이터 가공
  weights.sort((a, b) => a.date - b.date);
  
  // 기간 설정 가져오기
  const periodSelect = document.getElementById('weight-period');
  const periodValue = periodSelect ? periodSelect.value : '3'; // 기본값은 3개월
  
  // 선택된 기간에 따라 데이터 필터링
  let filteredWeights = [...weights]; // 원본 배열 복사
  
  if (periodValue === 'custom') {
    // 사용자 정의 기간
    const startDateInput = document.getElementById('weight-start-date');
    const endDateInput = document.getElementById('weight-end-date');
    
    if (startDateInput && startDateInput.value) {
      const startDate = new Date(startDateInput.value);
      startDate.setHours(0, 0, 0, 0);
      filteredWeights = filteredWeights.filter(w => w.date >= startDate);
    }
    
    if (endDateInput && endDateInput.value) {
      const endDate = new Date(endDateInput.value);
      endDate.setHours(23, 59, 59, 999);
      filteredWeights = filteredWeights.filter(w => w.date <= endDate);
    }
  } else {
    // 미리 정의된 기간
    const months = parseInt(periodValue);
    
    if (months > 0) {
      const cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() - months);
      filteredWeights = filteredWeights.filter(w => w.date >= cutoffDate);
    }
    // periodValue가 0이면 전체 데이터 사용 (필터링하지 않음)
  }
  
  // 빈 데이터 처리
  if (filteredWeights.length === 0) {
    // 데이터가 없으면 차트 영역에 메시지 표시
    chartEl.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">선택한 기간에 데이터가 없습니다.</div>';
    return;
  }
  
  // 차트 데이터 설정
  const chartData = {
    labels: filteredWeights.map(w => formatDate(w.date)),
    datasets: [{
      label: '체중 (kg)',
      data: filteredWeights.map(w => w.weight),
      borderColor: '#4caf50',
      backgroundColor: 'rgba(76, 175, 80, 0.1)',
      borderWidth: 2,
      fill: true,
      tension: 0.2
    }]
  };
  
  // 추세선 데이터 계산
  if (filteredWeights.length > 1) {
    const xValues = filteredWeights.map((_, i) => i);
    const yValues = filteredWeights.map(w => w.weight);
    
    // 선형 회귀 계산
    const n = xValues.length;
    const sum_x = xValues.reduce((a, b) => a + b, 0);
    const sum_y = yValues.reduce((a, b) => a + b, 0);
    const sum_xy = xValues.map((x, i) => x * yValues[i]).reduce((a, b) => a + b, 0);
    const sum_xx = xValues.map(x => x * x).reduce((a, b) => a + b, 0);
    
    const slope = (n * sum_xy - sum_x * sum_y) / (n * sum_xx - sum_x * sum_x);
    const intercept = (sum_y - slope * sum_x) / n;
    
    // 추세선 데이터셋 추가
    chartData.datasets.push({
      label: '추세선',
      data: xValues.map(x => slope * x + intercept),
      borderColor: '#ff9800',
      borderWidth: 2,
      fill: false,
      borderDash: [5, 5],
      pointRadius: 0
    });
  }
  
  // 차트 옵션
  const chartOptions = {
    scales: {
      y: {
        beginAtZero: false,
        min: Math.min(...filteredWeights.map(w => w.weight)) - 2,
        max: Math.max(...filteredWeights.map(w => w.weight)) + 2
      }
    },
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      tooltip: {
        callbacks: {
          afterLabel: function(context) {
            const weight = filteredWeights[context.dataIndex];
            return weight.notes ? `메모: ${weight.notes}` : '';
          }
        }
      }
    }
  };
  
  // 차트 여백 설정
  chartOptions.layout = {
    padding: {
      top: 20,
      right: 20,
      bottom: 20,
      left: 20
    }
  };
  
  // 이전 차트 제거
  if (window.weightChart) {
    window.weightChart.destroy();
  }
  
  // 새 차트 생성
  try {
    if (typeof Chart !== 'undefined' && chartEl) {
      window.weightChart = new Chart(chartEl, {
        type: 'line',
        data: chartData,
        options: chartOptions
      });
    }
  } catch (error) {
    console.error("차트 초기화 중 오류 발생:", error);
    if (chartEl) {
      chartEl.innerHTML = "<p>차트를 로드하는 중 오류가 발생했습니다.</p>";
    }
  }
  
  // 통계 업데이트
  updateWeightStats(filteredWeights);
  
  // 통계 스타일 추가
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    .weight-stats {
      margin-bottom: 15px;
      padding: 15px;
      background-color: #f9f9f9;
      border-radius: 8px;
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      text-align: center;
    }
    
    @media screen and (max-width: 768px) {
      .stats-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }
    
    .stat-item {
      padding: 10px;
    }
    
    .stat-value {
      font-size: 1.3rem;
      font-weight: bold;
      margin-bottom: 5px;
    }
    
    .stat-label {
      font-size: 0.9rem;
      color: #666;
    }
    
    .text-success {
      color: #4caf50;
    }
    
    .text-danger {
      color: #f44336;
    }
  `;
  document.head.appendChild(styleEl);
}

// 체중 추가 폼 표시
function showAddWeightForm(dateStr = null) {
  // 날짜 기본값 설정
  let formattedDate = '';
  if (dateStr) {
    formattedDate = dateStr;
  } else {
    formattedDate = formatDate(new Date());
  }
  
  const modalContent = `
    <form id="weight-form">
      <div class="form-group">
        <label for="weight-value">체중 (kg)</label>
        <input type="number" id="weight-value" step="0.1" min="20" max="200" required>
      </div>
      <div class="form-group">
        <label for="weight-date">날짜</label>
        <input type="date" id="weight-date" value="${formattedDate}" required>
      </div>
      <div class="form-group">
        <label for="weight-notes">메모 (선택사항)</label>
        <textarea id="weight-notes" rows="3" placeholder="추가 메모를 입력하세요..."></textarea>
      </div>
    </form>
  `;
  
  showModal("체중 기록", modalContent, saveWeight);
}

// 체중 저장
async function saveWeight() {
  const weightEl = document.getElementById('weight-value');
  const dateEl = document.getElementById('weight-date');
  const notesEl = document.getElementById('weight-notes');
  
  if (!weightEl.value || !dateEl.value) {
    alert('체중과 날짜는 필수 입력 항목입니다.');
    return;
  }
  
  try {
    // 체중 데이터 구성
    const weightData = {
      weight: parseFloat(weightEl.value),
      date: firebase.firestore.Timestamp.fromDate(new Date(dateEl.value)),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    if (notesEl.value.trim()) {
      weightData.notes = notesEl.value.trim();
    }
    
    // Firestore에 저장
    await db.collection("weights").add(weightData);
    
    // 모달 닫기
    closeModal();
    
    // 체중 기록 새로고침
    loadWeights();
  } catch (error) {
    console.error("체중 저장 중 오류 발생:", error);
    alert('체중을 저장하는 중 오류가 발생했습니다.');
  }
}

// 체중 편집 폼 표시
async function editWeight(weightId) {
  try {
    const weightDoc = await db.collection("weights").doc(weightId).get();
    
    if (!weightDoc.exists) {
      alert('체중 기록을 찾을 수 없습니다.');
      return;
    }
    
    const weight = weightDoc.data();
    
    const modalContent = `
      <form id="weight-form">
        <input type="hidden" id="weight-id" value="${weightId}">
        <div class="form-group">
          <label for="weight-value">체중 (kg)</label>
          <input type="number" id="weight-value" step="0.1" min="20" max="200" value="${weight.weight}" required>
        </div>
        <div class="form-group">
          <label for="weight-date">날짜</label>
          <input type="date" id="weight-date" value="${formatDate(weight.date)}" required>
        </div>
        <div class="form-group">
          <label for="weight-notes">메모 (선택사항)</label>
          <textarea id="weight-notes" rows="3" placeholder="추가 메모를 입력하세요...">${weight.notes || ''}</textarea>
        </div>
      </form>
    `;
    
    showModal("체중 기록 수정", modalContent, updateWeight);
  } catch (error) {
    console.error("체중 기록 로드 중 오류 발생:", error);
    alert('체중 기록을 불러오는 중 오류가 발생했습니다.');
  }
}

// 체중 업데이트
async function updateWeight() {
  const weightId = document.getElementById('weight-id').value;
  const weightEl = document.getElementById('weight-value');
  const dateEl = document.getElementById('weight-date');
  const notesEl = document.getElementById('weight-notes');
  
  if (!weightEl.value || !dateEl.value) {
    alert('체중과 날짜는 필수 입력 항목입니다.');
    return;
  }
  
  try {
    // 체중 데이터 구성
    const weightData = {
      weight: parseFloat(weightEl.value),
      date: firebase.firestore.Timestamp.fromDate(new Date(dateEl.value)),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    if (notesEl.value.trim()) {
      weightData.notes = notesEl.value.trim();
    } else {
      // notes 필드가 비어있으면 삭제
      weightData.notes = firebase.firestore.FieldValue.delete();
    }
    
    // Firestore에 업데이트
    await db.collection("weights").doc(weightId).update(weightData);
    
    // 모달 닫기
    closeModal();
    
    // 체중 기록 새로고침
    loadWeights();
  } catch (error) {
    console.error("체중 업데이트 중 오류 발생:", error);
    alert('체중을 업데이트하는 중 오류가 발생했습니다.');
  }
}

// 체중 삭제
async function deleteWeight(weightId) {
  if (confirm('정말로 이 체중 기록을 삭제하시겠습니까?')) {
    try {
      await db.collection("weights").doc(weightId).delete();
      loadWeights(); // 목록 새로고침
    } catch (error) {
      console.error("체중 삭제 중 오류 발생:", error);
      alert('체중 기록을 삭제하는 중 오류가 발생했습니다.');
    }
  }
}
// 여기에 updateWeightStats 함수 추가
// 체중 통계 업데이트 함수
function updateWeightStats(weights) {
  if (!weights || weights.length === 0) return;
  
  // 통계를 표시할 컨테이너 확인 또는 생성
  const chartContainer = document.querySelector('.weight-chart');
  let statsContainer = document.querySelector('.weight-stats');
  
  if (!statsContainer && chartContainer) {
    // 통계 컨테이너가 없으면 생성
    statsContainer = document.createElement('div');
    statsContainer.className = 'weight-stats';
    chartContainer.parentNode.insertBefore(statsContainer, chartContainer);
  }
  
  if (!statsContainer) return;
  
  // 데이터 정렬 (날짜 순)
  const sortedWeights = [...weights].sort((a, b) => a.date - b.date);
  
  // 통계 계산
  const latestWeight = sortedWeights[sortedWeights.length - 1].weight;
  const startWeight = sortedWeights[0].weight;
  const weightChange = latestWeight - startWeight;
  
  const allWeights = sortedWeights.map(w => w.weight);
  const avgWeight = allWeights.reduce((sum, w) => sum + w, 0) / allWeights.length;
  const minWeight = Math.min(...allWeights);
  const maxWeight = Math.max(...allWeights);
  
  // 통계 HTML 생성
  statsContainer.innerHTML = `
    <div class="stats-grid">
      <div class="stat-item">
        <div class="stat-value">${avgWeight.toFixed(1)} kg</div>
        <div class="stat-label">평균 체중</div>
      </div>
      <div class="stat-item">
        <div class="stat-value ${weightChange < 0 ? 'text-success' : weightChange > 0 ? 'text-danger' : ''}">${weightChange.toFixed(1)} kg</div>
        <div class="stat-label">기간 변화</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">${minWeight.toFixed(1)} kg</div>
        <div class="stat-label">최저 체중</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">${maxWeight.toFixed(1)} kg</div>
        <div class="stat-label">최고 체중</div>
      </div>
    </div>
  `;
}
// 체중 차트 업데이트 함수
function updateWeightChart() {
  // 이미 불러온 체중 데이터가 있으면 재사용, 없으면 다시 불러오기
  if (window.cachedWeights && window.cachedWeights.length > 0) {
    renderWeightChart(window.cachedWeights);
  } else {
    loadWeights();
  }
}

// 사용자 정의 기간 적용 함수
function applyCustomPeriod() {
  const startDateInput = document.getElementById('weight-start-date');
  const endDateInput = document.getElementById('weight-end-date');
  
  // 날짜 유효성 검사
  if (startDateInput.value && endDateInput.value) {
    const startDate = new Date(startDateInput.value);
    const endDate = new Date(endDateInput.value);
    
    if (startDate > endDate) {
      alert('시작일은 종료일보다 이전이어야 합니다.');
      return;
    }
  }
  
  // 차트 업데이트
  updateWeightChart();
}

// 기간 설정 UI 초기화 함수
function initDateRangeUI() {
  // 사용자 정의 기간 UI 초기 숨김
  const customPeriod = document.querySelector('.custom-period');
  if (customPeriod) {
    customPeriod.style.display = 'none';
  }
  
  // 기간 선택 이벤트 리스너
  const periodSelector = document.getElementById('weight-period');
  if (periodSelector) {
    periodSelector.addEventListener('change', function() {
      const customPeriod = document.querySelector('.custom-period');
      if (this.value === 'custom') {
        customPeriod.style.display = 'flex';
      } else {
        customPeriod.style.display = 'none';
        updateWeightChart();
      }
    });
  }
}
// =========== 지출 관리 기능 ===========

function renderExpensePage(container) {
  resetPersistentCalendar('expense');
  container.innerHTML = `
    <div class="page-container">
      <div class="page-header">
        <h1>그만써 (지출 관리)</h1>
        <div class="page-actions">
          <div class="view-toggle">
            <button id="list-view-button" class="${currentView === 'list' ? 'active' : ''}" onclick="toggleView('list')">
              <i class="fas fa-list"></i> 리스트
            </button>
            <button id="calendar-view-button" class="${currentView === 'calendar' ? 'active' : ''}" onclick="toggleView('calendar')">
              <i class="fas fa-calendar-alt"></i> 달력
            </button>
          </div>
          <button onclick="showAddTransactionForm()">내역 추가</button>
        </div>
      </div>
      
      <div class="card">
        <h2 class="card-title">월별 요약</h2>
        <div id="expense-chart-container" class="chart-container expense-chart">
          <canvas id="expense-chart"></canvas>
        </div>
      </div>
      
      <!-- 섹션 구분선 추가 -->
      <div class="section-divider"></div>
      
      <div id="calendar-view-container" class="calendar-container expense-calendar" style="display: ${currentView === 'calendar' ? 'block' : 'none'}">
        <div id="expense-calendar"></div>
      </div>
      
      <div id="list-view-container" style="display: ${currentView === 'list' ? 'block' : 'none'}">
        <div class="card">
          <h2 class="card-title">지출/수입 내역</h2>
          <div id="transactions-list">
            <p>내역을 불러오는 중...</p>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // 지출 데이터 불러오기
  loadTransactions();
  
  // 스타일 추가 함수 호출
  addExpensePageStyles();
}

// 지출 데이터 불러오기
async function loadTransactions() {
  try {
    const transactionsRef = db.collection("transactions");
    const snapshot = await cachedCollection("transactions", { orderBy: "date", dir: "desc" });
    
    const transactions = [];
    snapshot.forEach(doc => {
      const transaction = doc.data();
      transactions.push({
        id: doc.id,
        amount: transaction.amount,
        category: transaction.category || '',
        subCategory: transaction.subCategory || '',
        date: transaction.date.toDate(),
        type: transaction.type || 'expense',
        paymentMethod: transaction.paymentMethod || '',
        description: transaction.description || ''
      });
    });
    
    // 뷰에 따라 다르게 표시
    if (currentView === 'list') {
      renderTransactionsList(transactions);
    } else {
      renderTransactionsCalendar(transactions);
    }
    
    // 차트 그리기 (항상 표시)
    renderExpenseChart(transactions);
  } catch (error) {
    console.error("지출 내역을 불러오는 중 오류 발생:", error);
    document.getElementById("transactions-list").innerHTML = '<p>지출 내역을 불러오는 중 오류가 발생했습니다.</p>';
  }
}

// 지출 리스트 렌더링 - 수정된 함수
function renderTransactionsList(transactions) {
  const transactionsListEl = document.getElementById("transactions-list");
  
  if (transactions.length === 0) {
    transactionsListEl.innerHTML = '<p>등록된 지출/수입 내역이 없습니다.</p>';
    return;
  }
  
  let html = '<ul class="list-container">';
  
  transactions.forEach(transaction => {
    const isExpense = transaction.type === 'expense';
    
    html += `
      <li class="list-item" data-id="${transaction.id}">
        <div class="list-item-content">
          <div class="list-item-title ${isExpense ? 'expense-amount' : 'income-amount'}">
            ${isExpense ? '-' : '+'} ${transaction.amount.toLocaleString()}원
          </div>
          <div class="list-item-category">
            ${transaction.category} ${transaction.subCategory ? `> ${transaction.subCategory}` : ''}
          </div>
          <div class="list-item-date">
            ${formatDate(transaction.date)} · ${transaction.paymentMethod}
          </div>
          ${transaction.description ? `<div class="list-item-description">${transaction.description}</div>` : ''}
        </div>
        <div class="list-item-actions">
          <button onclick="editTransaction('${transaction.id}')">수정</button>
          <button onclick="deleteTransaction('${transaction.id}')">삭제</button>
        </div>
      </li>
    `;
  });
  
  html += '</ul>';
  transactionsListEl.innerHTML = html;
}

// 지출 달력 렌더링
function renderTransactionsCalendar(transactions) {
  const calendarEl = document.getElementById('expense-calendar');
  
  if (!calendarEl) return;
  
  // 달력에 표시할 이벤트 형식으로 변환
  const events = transactions.map(transaction => {
    const isExpense = transaction.type === 'expense';
    return {
      id: transaction.id,
      title: `${isExpense ? '-' : '+'} ${transaction.amount.toLocaleString()}원 (${transaction.category})`,
      start: transaction.date,
      allDay: true,
      color: isExpense ? '#f44336' : '#4caf50'
    };
  });
  
  // FullCalendar 초기화
  createPersistentCalendar('expense', calendarEl, {
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth'
    },
    initialView: 'dayGridMonth',
    locale: 'ko',
    firstDay: 1, // 주의 시작: 월요일
    events: events,
    eventClick: function(info) {
      editTransaction(info.event.id);
    },
    dateClick: function(info) {
      showAddTransactionForm(info.dateStr);
    }
  });
}

// 지출 차트 렌더링
function renderExpenseChart(transactions) {
  const chartEl = document.getElementById('expense-chart');
  const chartContainerEl = document.getElementById('expense-chart-container');
  
  if (!chartEl || transactions.length === 0) return;
  
  // 기존 차트 영역 수정 - 레이아웃 개선
  chartContainerEl.innerHTML = `
    <div class="expense-dashboard">
      <!-- 요약 정보 섹션 -->
      <div class="expense-summary-section">
        <h3 class="summary-title">이번 달 요약</h3>
        <div class="expense-stats">
          <div class="stat-item">
            <div class="stat-label">수입</div>
            <div class="stat-value income-value">계산 중...</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">지출</div>
            <div class="stat-value expense-value">계산 중...</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">잔액</div>
            <div class="stat-value balance-value">계산 중...</div>
          </div>
        </div>
      </div>
      
      <!-- 차트 선택기 섹션 -->
      <div class="chart-selector-section">
        <div class="chart-selector-wrapper">
          <label for="chart-period-selector">차트 유형:</label>
          <select id="chart-period-selector" class="chart-selector">
            <option value="month">월별</option>
            <option value="category">카테고리별</option>
          </select>
        </div>
      </div>
    </div>
    
    <!-- 차트 영역 -->
    <div id="bar-chart-container" class="chart-container">
      <canvas id="expense-bar-chart"></canvas>
    </div>
    <div id="pie-chart-container" class="chart-container" style="display: none;">
      <canvas id="expense-pie-chart"></canvas>
    </div>
  `;
  
  const barChartEl = document.getElementById('expense-bar-chart');
  const pieChartEl = document.getElementById('expense-pie-chart');
  const periodSelector = document.getElementById('chart-period-selector');
  
  // 월별 데이터 가공
  const monthlyData = {};
  
  transactions.forEach(transaction => {
    const date = transaction.date;
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = {
        income: 0,
        expense: 0
      };
    }
    
    if (transaction.type === 'income') {
      monthlyData[monthKey].income += transaction.amount;
    } else {
      monthlyData[monthKey].expense += transaction.amount;
    }
  });
  
  // 최근 6개월 데이터 추출
  const months = Object.keys(monthlyData).sort().slice(-6);
  
  const barChartData = {
    labels: months.map(month => {
      const [year, m] = month.split('-');
      return `${year}년 ${m}월`;
    }),
    datasets: [
      {
        label: '수입',
        data: months.map(month => monthlyData[month].income),
        backgroundColor: 'rgba(76, 175, 80, 0.5)',
        borderColor: 'rgba(76, 175, 80, 1)',
        borderWidth: 1
      },
      {
        label: '지출',
        data: months.map(month => monthlyData[month].expense),
        backgroundColor: 'rgba(244, 67, 54, 0.5)',
        borderColor: 'rgba(244, 67, 54, 1)',
        borderWidth: 1
      }
    ]
  };
  
  // 카테고리별 데이터 가공
  const categoryData = {};
  let totalExpense = 0;
  
  transactions.forEach(transaction => {
    // 지출만 처리
    if (transaction.type !== 'expense') return;
    
    // 최근 1개월 데이터만 사용
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    if (transaction.date < oneMonthAgo) return;
    
    const category = transaction.category || '기타';
    
    if (!categoryData[category]) {
      categoryData[category] = 0;
    }
    
    categoryData[category] += transaction.amount;
    totalExpense += transaction.amount;
  });
  
  // 카테고리 데이터를 내림차순으로 정렬
  const sortedCategories = Object.entries(categoryData)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8); // 상위 8개 카테고리만 표시
  
  // 나머지는 '기타'로 묶기
  let otherAmount = 0;
  Object.entries(categoryData)
    .sort((a, b) => b[1] - a[1])
    .slice(8)
    .forEach(([_, amount]) => {
      otherAmount += amount;
    });
  
  if (otherAmount > 0) {
    sortedCategories.push(['기타 항목', otherAmount]);
  }
  
  const pieChartData = {
    labels: sortedCategories.map(([category, amount]) => 
      `${category} (${Math.round(amount / totalExpense * 100)}%)`
    ),
    datasets: [{
      data: sortedCategories.map(([_, amount]) => amount),
      backgroundColor: [
        '#f44336', '#2196f3', '#4caf50', '#ff9800', 
        '#9c27b0', '#00bcd4', '#795548', '#607d8b', '#9e9e9e'
      ],
      borderWidth: 1
    }]
  };
  
  // 차트 옵션
  const barChartOptions = {
    scales: {
      y: {
        beginAtZero: true
      }
    },
    responsive: true,
    maintainAspectRatio: false
  };
  
  const pieChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right',
        labels: {
          boxWidth: 12,
          font: {
            size: 11
          }
        }
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            const value = context.raw;
            return `${context.label.split(' (')[0]}: ${value.toLocaleString()}원`;
          }
        }
      }
    }
  };
  
  // 이전 차트 제거
  if (window.expenseBarChart) {
    window.expenseBarChart.destroy();
  }
  
  if (window.expensePieChart) {
    window.expensePieChart.destroy();
  }
  
  // 새 차트 생성
  window.expenseBarChart = new Chart(barChartEl, {
    type: 'bar',
    data: barChartData,
    options: barChartOptions
  });
  
  window.expensePieChart = new Chart(pieChartEl, {
    type: 'pie',
    data: pieChartData,
    options: pieChartOptions
  });
  
// 현재 달 통계 업데이트
const currentMonth = new Date().getMonth();
const currentYear = new Date().getFullYear();
const currentMonthKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;

const currentMonthData = monthlyData[currentMonthKey] || { income: 0, expense: 0 };
const balance = currentMonthData.income - currentMonthData.expense;

// 요약 정보 업데이트
document.querySelector('.income-value').textContent = `${currentMonthData.income.toLocaleString()}원`;
document.querySelector('.expense-value').textContent = `${currentMonthData.expense.toLocaleString()}원`;

const balanceValueEl = document.querySelector('.balance-value');
balanceValueEl.textContent = `${balance.toLocaleString()}원`;
balanceValueEl.classList.add(balance >= 0 ? 'text-success' : 'text-danger');
  
  // 뷰 전환 이벤트 리스너
  periodSelector.addEventListener('change', function() {
    const barChartContainer = document.getElementById('bar-chart-container');
    const pieChartContainer = document.getElementById('pie-chart-container');
    
    if (this.value === 'month') {
      barChartContainer.style.display = 'block';
      pieChartContainer.style.display = 'none';
    } else {
      barChartContainer.style.display = 'none';
      pieChartContainer.style.display = 'block';
    }
  });
  
  // 스타일 추가
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    .chart-selector {
      margin: 10px 0;
      padding: 5px 10px;
      border-radius: 4px;
      border: 1px solid #ddd;
    }
    
    .expense-stats {
      display: flex;
      justify-content: space-between;
      margin: 15px 0;
    }
    
    .expense-stats .stat-item {
      text-align: center;
      flex: 1;
    }
    
    .stats-summary {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
    }
  `;
  document.head.appendChild(styleEl);
}

// 지출 추가 폼 표시
function showAddTransactionForm(dateStr = null) {
  // 날짜 기본값 설정
  let formattedDate = '';
  if (dateStr) {
    formattedDate = dateStr;
  } else {
    formattedDate = formatDate(new Date());
  }
  
  const modalContent = `
    <form id="transaction-form">
      <div class="form-group">
        <label for="transaction-type">종류</label>
        <select id="transaction-type" onchange="toggleCategoryFields()">
          <option value="expense">지출</option>
          <option value="income">수입</option>
        </select>
      </div>
      <div class="form-group">
        <label for="transaction-amount">금액</label>
        <input type="number" id="transaction-amount" min="0" required>
      </div>
      <div class="form-group">
        <label for="transaction-date">날짜</label>
        <input type="date" id="transaction-date" value="${formattedDate}" required>
      </div>
      
      <div id="income-category-container" style="display: none;">
        <div class="form-group">
          <label for="income-category">수입 카테고리</label>
          <select id="income-category">
            <option value="월급">월급</option>
            <option value="부수입">부수입</option>
            <option value="기타">기타</option>
          </select>
        </div>
      </div>
      
      <div id="expense-category-container">
        <div class="form-group">
          <label for="expense-category">지출 카테고리</label>
          <select id="expense-category">
            <option value="식비">식비</option>
            <option value="쿠폰구매">쿠폰 구매</option>
            <option value="주전부리">주전부리</option>
            <option value="쇼핑">쇼핑</option>
            <option value="음식배달">음식*배달</option>
            <option value="음식온라인구매">음식*온라인 구매</option>
            <option value="외식">외식</option>
            <option value="의료비">의료비</option>
            <option value="인간관계">인간관계</option>
            <option value="운동">운동</option>
            <option value="교통비">교통비</option>
            <option value="집관련물품">집 관련 물품</option>
            <option value="가족비">가족비</option>
            <option value="고정비">매달 고정비</option>
            <option value="문화생활">문화 생활</option>
            <option value="자기계발">자기계발</option>
            <option value="업무용">업무용</option>
            <option value="공용">공용</option>
            <option value="기타">기타</option>
          </select>
        </div>
        <div class="form-group" id="expense-subcategory-container">
          <label for="expense-subcategory">세부 카테고리</label>
          <input type="text" id="expense-subcategory" placeholder="직접 입력">
        </div>
      </div>
      
      <div class="form-group">
        <label for="transaction-payment-method">결제 방법</label>
        <select id="transaction-payment-method">
          <option value="현대카드">현대카드</option>
          <option value="삼성카드">삼성카드</option>
          <option value="롯데카드">롯데카드</option>
          <option value="신한카드">신한카드</option>
          <option value="계좌">계좌</option>
          <option value="현금">현금</option>
          <option value="기타">기타</option>
        </select>
      </div>
      <div class="form-group" id="payment-method-other-container" style="display: none;">
        <label for="payment-method-other">결제 방법 (직접 입력)</label>
        <input type="text" id="payment-method-other" placeholder="결제 방법 입력">
      </div>
      <div class="form-group">
        <label for="transaction-description">설명 (선택사항)</label>
        <textarea id="transaction-description" rows="3" placeholder="추가 설명을 입력하세요..."></textarea>
      </div>
    </form>
  `;
  
  showModal("지출/수입 내역 추가", modalContent, saveTransaction);
  
  // 카테고리 필드 토글 이벤트 리스너
  setTimeout(() => {
    document.getElementById('transaction-payment-method').addEventListener('change', function() {
      const otherContainer = document.getElementById('payment-method-other-container');
      if (this.value === '기타') {
        otherContainer.style.display = 'block';
      } else {
        otherContainer.style.display = 'none';
      }
    });
  }, 100);
}

// 카테고리 필드 토글
function toggleCategoryFields() {
  const type = document.getElementById('transaction-type').value;
  const incomeContainer = document.getElementById('income-category-container');
  const expenseContainer = document.getElementById('expense-category-container');
  
  if (type === 'income') {
    incomeContainer.style.display = 'block';
    expenseContainer.style.display = 'none';
  } else {
    incomeContainer.style.display = 'none';
    expenseContainer.style.display = 'block';
  }
}

// 지출 저장
async function saveTransaction() {
  const typeEl = document.getElementById('transaction-type');
  const amountEl = document.getElementById('transaction-amount');
  const dateEl = document.getElementById('transaction-date');
  const descriptionEl = document.getElementById('transaction-description');
  const paymentMethodEl = document.getElementById('transaction-payment-method');
  const paymentMethodOtherEl = document.getElementById('payment-method-other');
  
  if (!amountEl.value || !dateEl.value) {
    alert('금액과 날짜는 필수 입력 항목입니다.');
    return;
  }
  
  try {
    // 지출/수입 데이터 구성
    const transactionData = {
      amount: parseFloat(amountEl.value),
      date: firebase.firestore.Timestamp.fromDate(new Date(dateEl.value)),
      type: typeEl.value,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    // 카테고리 설정
    if (typeEl.value === 'income') {
      const incomeCategoryEl = document.getElementById('income-category');
      transactionData.category = incomeCategoryEl.value;
    } else {
      const expenseCategoryEl = document.getElementById('expense-category');
      const expenseSubCategoryEl = document.getElementById('expense-subcategory');
      transactionData.category = expenseCategoryEl.value;
      
      if (expenseSubCategoryEl.value.trim()) {
        transactionData.subCategory = expenseSubCategoryEl.value.trim();
      }
    }
    
    // 결제 방법 설정
    if (paymentMethodEl.value === '기타' && paymentMethodOtherEl.value.trim()) {
      transactionData.paymentMethod = paymentMethodOtherEl.value.trim();
    } else {
      transactionData.paymentMethod = paymentMethodEl.value;
    }
    
    // 설명 추가
    if (descriptionEl.value.trim()) {
      transactionData.description = descriptionEl.value.trim();
    }
    
    // Firestore에 저장
    await db.collection("transactions").add(transactionData);
    
    // 모달 닫기
    closeModal();
    
    // 지출 목록 새로고침
    loadTransactions();
  } catch (error) {
    console.error("지출/수입 내역 저장 중 오류 발생:", error);
    alert('지출/수입 내역을 저장하는 중 오류가 발생했습니다.');
  }
}

// 지출 편집 폼 표시 (수정/삭제 버튼 포함)
async function editTransaction(transactionId) {
  try {
    const transactionDoc = await db.collection("transactions").doc(transactionId).get();
    
    if (!transactionDoc.exists) {
      alert('지출/수입 내역을 찾을 수 없습니다.');
      return;
    }
    
    const transaction = transactionDoc.data();
    
    const modalContent = `
      <form id="transaction-form">
        <input type="hidden" id="transaction-id" value="${transactionId}">
        <div class="form-group">
          <label for="transaction-type">종류</label>
          <select id="transaction-type" onchange="toggleCategoryFields()">
            <option value="expense" ${transaction.type === 'expense' ? 'selected' : ''}>지출</option>
            <option value="income" ${transaction.type === 'income' ? 'selected' : ''}>수입</option>
          </select>
        </div>
        <div class="form-group">
          <label for="transaction-amount">금액</label>
          <input type="number" id="transaction-amount" min="0" value="${transaction.amount}" required>
        </div>
        <div class="form-group">
          <label for="transaction-date">날짜</label>
          <input type="date" id="transaction-date" value="${formatDate(transaction.date)}" required>
        </div>
        
        <div id="income-category-container" style="display: ${transaction.type === 'income' ? 'block' : 'none'};">
          <div class="form-group">
            <label for="income-category">수입 카테고리</label>
            <select id="income-category">
              <option value="월급" ${transaction.category === '월급' ? 'selected' : ''}>월급</option>
              <option value="부수입" ${transaction.category === '부수입' ? 'selected' : ''}>부수입</option>
              <option value="기타" ${transaction.category === '기타' ? 'selected' : ''}>기타</option>
            </select>
          </div>
        </div>
        
        <div id="expense-category-container" style="display: ${transaction.type === 'expense' ? 'block' : 'none'};">
          <div class="form-group">
            <label for="expense-category">지출 카테고리</label>
            <select id="expense-category">
              <option value="식비" ${transaction.category === '식비' ? 'selected' : ''}>식비</option>
              <option value="쿠폰구매" ${transaction.category === '쿠폰구매' ? 'selected' : ''}>쿠폰 구매</option>
              <option value="주전부리" ${transaction.category === '주전부리' ? 'selected' : ''}>주전부리</option>
              <option value="쇼핑" ${transaction.category === '쇼핑' ? 'selected' : ''}>쇼핑</option>
              <option value="음식배달" ${transaction.category === '음식배달' ? 'selected' : ''}>음식*배달</option>
              <option value="음식온라인구매" ${transaction.category === '음식온라인구매' ? 'selected' : ''}>음식*온라인 구매</option>
              <option value="외식" ${transaction.category === '외식' ? 'selected' : ''}>외식</option>
              <option value="의료비" ${transaction.category === '의료비' ? 'selected' : ''}>의료비</option>
              <option value="인간관계" ${transaction.category === '인간관계' ? 'selected' : ''}>인간관계</option>
              <option value="운동" ${transaction.category === '운동' ? 'selected' : ''}>운동</option>
              <option value="교통비" ${transaction.category === '교통비' ? 'selected' : ''}>교통비</option>
              <option value="집관련물품" ${transaction.category === '집관련물품' ? 'selected' : ''}>집 관련 물품</option>
              <option value="가족비" ${transaction.category === '가족비' ? 'selected' : ''}>가족비</option>
              <option value="고정비" ${transaction.category === '고정비' ? 'selected' : ''}>매달 고정비</option>
              <option value="문화생활" ${transaction.category === '문화생활' ? 'selected' : ''}>문화 생활</option>
              <option value="자기계발" ${transaction.category === '자기계발' ? 'selected' : ''}>자기계발</option>
              <option value="업무용" ${transaction.category === '업무용' ? 'selected' : ''}>업무용</option>
              <option value="공용" ${transaction.category === '공용' ? 'selected' : ''}>공용</option>
              <option value="기타" ${transaction.category === '기타' ? 'selected' : ''}>기타</option>
            </select>
          </div>
          <div class="form-group" id="expense-subcategory-container">
            <label for="expense-subcategory">세부 카테고리</label>
            <input type="text" id="expense-subcategory" placeholder="직접 입력" value="${transaction.subCategory || ''}">
          </div>
        </div>
        
        <div class="form-group">
          <label for="transaction-payment-method">결제 방법</label>
          <select id="transaction-payment-method">
            <option value="현대카드" ${transaction.paymentMethod === '현대카드' ? 'selected' : ''}>현대카드</option>
            <option value="삼성카드" ${transaction.paymentMethod === '삼성카드' ? 'selected' : ''}>삼성카드</option>
            <option value="롯데카드" ${transaction.paymentMethod === '롯데카드' ? 'selected' : ''}>롯데카드</option>
            <option value="신한카드" ${transaction.paymentMethod === '신한카드' ? 'selected' : ''}>신한카드</option>
            <option value="계좌" ${transaction.paymentMethod === '계좌' ? 'selected' : ''}>계좌</option>
            <option value="현금" ${transaction.paymentMethod === '현금' ? 'selected' : ''}>현금</option>
            <option value="기타" ${!['현대카드', '삼성카드', '롯데카드', '신한카드', '계좌', '현금'].includes(transaction.paymentMethod) ? 'selected' : ''}>기타</option>
          </select>
        </div>
        <div class="form-group" id="payment-method-other-container" style="display: ${!['현대카드', '삼성카드', '롯데카드', '신한카드', '계좌', '현금'].includes(transaction.paymentMethod) ? 'block' : 'none'};">
          <label for="payment-method-other">결제 방법 (직접 입력)</label>
          <input type="text" id="payment-method-other" placeholder="결제 방법 입력" value="${!['현대카드', '삼성카드', '롯데카드', '신한카드', '계좌', '현금'].includes(transaction.paymentMethod) ? transaction.paymentMethod : ''}">
        </div>
        <div class="form-group">
          <label for="transaction-description">설명 (선택사항)</label>
          <textarea id="transaction-description" rows="3" placeholder="추가 설명을 입력하세요...">${transaction.description || ''}</textarea>
        </div>
      </form>
    `;
    
    // 수정/삭제 버튼이 포함된 커스텀 모달 표시
    showTransactionEditModal("지출/수입 내역 수정", modalContent, transactionId);
    
    // 카테고리 필드 토글 이벤트 리스너
    setTimeout(() => {
      document.getElementById('transaction-payment-method').addEventListener('change', function() {
        const otherContainer = document.getElementById('payment-method-other-container');
        if (this.value === '기타') {
          otherContainer.style.display = 'block';
        } else {
          otherContainer.style.display = 'none';
        }
      });
    }, 100);
  } catch (error) {
    console.error("지출/수입 내역 로드 중 오류 발생:", error);
    alert('지출/수입 내역을 불러오는 중 오류가 발생했습니다.');
  }
}

// 지출 업데이트
async function updateTransaction() {
  const transactionId = document.getElementById('transaction-id').value;
  const typeEl = document.getElementById('transaction-type');
  const amountEl = document.getElementById('transaction-amount');
  const dateEl = document.getElementById('transaction-date');
  const descriptionEl = document.getElementById('transaction-description');
  const paymentMethodEl = document.getElementById('transaction-payment-method');
  const paymentMethodOtherEl = document.getElementById('payment-method-other');
  
  if (!amountEl.value || !dateEl.value) {
    alert('금액과 날짜는 필수 입력 항목입니다.');
    return;
  }
  
  try {
    // 지출/수입 데이터 구성
    const transactionData = {
      amount: parseFloat(amountEl.value),
      date: firebase.firestore.Timestamp.fromDate(new Date(dateEl.value)),
      type: typeEl.value,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    // 카테고리 설정
    if (typeEl.value === 'income') {
      const incomeCategoryEl = document.getElementById('income-category');
      transactionData.category = incomeCategoryEl.value;
      // 지출에서 수입으로 변경된 경우 하위 카테고리 삭제
      transactionData.subCategory = firebase.firestore.FieldValue.delete();
    } else {
      const expenseCategoryEl = document.getElementById('expense-category');
      const expenseSubCategoryEl = document.getElementById('expense-subcategory');
      transactionData.category = expenseCategoryEl.value;
      
      if (expenseSubCategoryEl.value.trim()) {
        transactionData.subCategory = expenseSubCategoryEl.value.trim();
      } else {
        transactionData.subCategory = firebase.firestore.FieldValue.delete();
      }
    }
    
    // 결제 방법 설정
    if (paymentMethodEl.value === '기타' && paymentMethodOtherEl.value.trim()) {
      transactionData.paymentMethod = paymentMethodOtherEl.value.trim();
    } else {
      transactionData.paymentMethod = paymentMethodEl.value;
    }
    
    // 설명 추가
    if (descriptionEl.value.trim()) {
      transactionData.description = descriptionEl.value.trim();
    } else {
      transactionData.description = firebase.firestore.FieldValue.delete();
    }
    
    // Firestore에 업데이트
    await db.collection("transactions").doc(transactionId).update(transactionData);
    
    // 모달 닫기
    closeModal();
    
    // 지출 목록 새로고침
    loadTransactions();
  } catch (error) {
    console.error("지출/수입 내역 업데이트 중 오류 발생:", error);
    alert('지출/수입 내역을 업데이트하는 중 오류가 발생했습니다.');
  }
}

// 지출 삭제
async function deleteTransaction(transactionId) {
  if (confirm('정말로 이 지출/수입 내역을 삭제하시겠습니까?')) {
    try {
      await db.collection("transactions").doc(transactionId).delete();
      loadTransactions(); // 목록 새로고침
    } catch (error) {
      console.error("지출/수입 내역 삭제 중 오류 발생:", error);
      alert('지출/수입 내역을 삭제하는 중 오류가 발생했습니다.');
    }
  }
}

// =========== 일기 관리 기능 ===========

// 일기 페이지 렌더링
function renderDiaryPage(container) {
  container.innerHTML = `
    <div class="page-container">
      <div class="page-header">
        <h1>일기</h1>
        <div class="page-actions">
          <button onclick="showAddDiaryForm()">새 일기 작성</button>
        </div>
      </div>
      <div class="card">
        <h2 class="card-title">일기 목록</h2>
        <div id="diaries-list">
          <p>일기를 불러오는 중...</p>
        </div>
      </div>
    </div>
  `;
  
  // 일기 데이터 불러오기
  loadDiaries();
}

// 일기 데이터 불러오기
async function loadDiaries() {
  try {
    const diariesRef = db.collection("diaries");
    const snapshot = await cachedCollection("diaries", { orderBy: "date", dir: "desc" });
    
    const diariesListEl = document.getElementById("diaries-list");
    
    if (snapshot.empty) {
      diariesListEl.innerHTML = '<p>작성된 일기가 없습니다.</p>';
      return;
    }
    
    let html = '<ul class="list-container">';
    
    snapshot.forEach(doc => {
      const diary = doc.data();
      html += `
        <li class="list-item" data-id="${doc.id}">
          <div class="list-item-content">
            <div class="list-item-title">${formatDate(diary.date)} 일기</div>
            <div class="list-item-preview">${truncateText(diary.content, 100)}</div>
          </div>
          <div class="list-item-actions">
            <button onclick="viewDiary('${doc.id}')">보기</button>
            <button onclick="editDiary('${doc.id}')">수정</button>
            <button onclick="deleteDiary('${doc.id}')">삭제</button>
          </div>
        </li>
      `;
    });
    
    html += '</ul>';
    diariesListEl.innerHTML = html;
  } catch (error) {
    console.error("일기를 불러오는 중 오류 발생:", error);
    document.getElementById("diaries-list").innerHTML = '<p>일기를 불러오는 중 오류가 발생했습니다.</p>';
  }
}

// 텍스트 길이 제한
function truncateText(text, maxLength) {
  if (!text) return '';
  
  // HTML 태그 제거
  const plainText = text.replace(/<[^>]*>/g, '');
  
  if (plainText.length <= maxLength) {
    return plainText;
  }
  
  return plainText.substring(0, maxLength) + '...';
}

// 일기 추가 폼 표시
function showAddDiaryForm() {
  const today = formatDate(new Date());
  
  const modalContent = `
    <form id="diary-form">
      <div class="form-group">
        <label for="diary-date">날짜</label>
        <input type="date" id="diary-date" value="${today}" required>
      </div>
      <div class="form-group">
        <label for="diary-content">내용</label>
        <div id="diary-editor"></div>
      </div>
    </form>
  `;
  
  showModal("새 일기 작성", modalContent, saveDiary);
  
  // 에디터 초기화
  setTimeout(() => {
    initTextEditor('diary-editor', '오늘의 일기를 작성하세요...');
  }, 100);
}

// 일기 저장
async function saveDiary() {
  const dateEl = document.getElementById('diary-date');
  
  if (!dateEl.value) {
    alert('날짜는 필수 입력 항목입니다.');
    return;
  }
  
  const content = getEditorContent('diary-editor');
  
  if (!content) {
    alert('내용을 입력해주세요.');
    return;
  }
  
  try {
    // 일기 데이터 구성
    const diaryData = {
      date: firebase.firestore.Timestamp.fromDate(new Date(dateEl.value)),
      content: content,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    // Firestore에 저장
    await db.collection("diaries").add(diaryData);
    
    // 모달 닫기
    closeModal();
    
    // 일기 목록 새로고침
    loadDiaries();
  } catch (error) {
    console.error("일기 저장 중 오류 발생:", error);
    alert('일기를 저장하는 중 오류가 발생했습니다.');
  }
}

// 일기 보기
async function viewDiary(diaryId) {
  try {
    const diaryDoc = await db.collection("diaries").doc(diaryId).get();
    
    if (!diaryDoc.exists) {
      alert('일기를 찾을 수 없습니다.');
      return;
    }
    
    const diary = diaryDoc.data();
    
    const modalContent = `
      <div class="diary-view">
        <div class="diary-date">${formatDate(diary.date)}</div>
        <div class="diary-content">${diary.content}</div>
      </div>
    `;
    
    showModal(`${formatDate(diary.date)} 일기`, modalContent);
  } catch (error) {
    console.error("일기 불러오기 중 오류 발생:", error);
    alert('일기를 불러오는 중 오류가 발생했습니다.');
  }
}

// 일기 편집 폼 표시
async function editDiary(diaryId) {
  try {
    const diaryDoc = await db.collection("diaries").doc(diaryId).get();
    
    if (!diaryDoc.exists) {
      alert('일기를 찾을 수 없습니다.');
      return;
    }
    
    const diary = diaryDoc.data();
    
    const modalContent = `
      <form id="diary-form">
        <input type="hidden" id="diary-id" value="${diaryId}">
        <div class="form-group">
          <label for="diary-date">날짜</label>
          <input type="date" id="diary-date" value="${formatDate(diary.date)}" required>
        </div>
        <div class="form-group">
          <label for="diary-content">내용</label>
          <div id="diary-editor"></div>
        </div>
      </form>
    `;
    
    showModal("일기 수정", modalContent, updateDiary);
    
    // 에디터 초기화
    setTimeout(() => {
      initTextEditor('diary-editor', '오늘의 일기를 작성하세요...', diary.content);
    }, 100);
  } catch (error) {
    console.error("일기 로드 중 오류 발생:", error);
    alert('일기를 불러오는 중 오류가 발생했습니다.');
  }
}

// 일기 업데이트
async function updateDiary() {
  const diaryId = document.getElementById('diary-id').value;
  const dateEl = document.getElementById('diary-date');
  
  if (!dateEl.value) {
    alert('날짜는 필수 입력 항목입니다.');
    return;
  }
  
  const content = getEditorContent('diary-editor');
  
  if (!content) {
    alert('내용을 입력해주세요.');
    return;
  }
  
  try {
    // 일기 데이터 구성
    const diaryData = {
      date: firebase.firestore.Timestamp.fromDate(new Date(dateEl.value)),
      content: content,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    // Firestore에 업데이트
    await db.collection("diaries").doc(diaryId).update(diaryData);
    
    // 모달 닫기
    closeModal();
    
    // 일기 목록 새로고침
    loadDiaries();
  } catch (error) {
    console.error("일기 업데이트 중 오류 발생:", error);
    alert('일기를 업데이트하는 중 오류가 발생했습니다.');
  }
}

// 일기 삭제
async function deleteDiary(diaryId) {
  if (confirm('정말로 이 일기를 삭제하시겠습니까?')) {
    try {
      await db.collection("diaries").doc(diaryId).delete();
      loadDiaries(); // 목록 새로고침
    } catch (error) {
      console.error("일기 삭제 중 오류 발생:", error);
      alert('일기를 삭제하는 중 오류가 발생했습니다.');
    }
  }
}

// =========== 메모 관리 기능 ===========

// 메모 페이지 렌더링
function renderNotesPage(container) {
  container.innerHTML = `
    <div class="page-container">
      <div class="page-header">
        <h1>메모</h1>
        <div class="page-actions">
          <button onclick="showAddNoteForm()">새 메모 작성</button>
        </div>
      </div>
      <div class="card">
        <h2 class="card-title">메모 목록</h2>
        <div id="notes-list">
          <p>메모를 불러오는 중...</p>
        </div>
      </div>
    </div>
  `;
  
  // 메모 데이터 불러오기
  loadNotes();
}

// 메모 데이터 불러오기
async function loadNotes() {
  try {
    const notesRef = db.collection("notes");
    const snapshot = await cachedCollection("notes", { orderBy: "updatedAt", dir: "desc" });
    
    const notesListEl = document.getElementById("notes-list");
    
    if (snapshot.empty) {
      notesListEl.innerHTML = '<p>작성된 메모가 없습니다.</p>';
      return;
    }
    
    let html = '<ul class="list-container">';
    
    snapshot.forEach(doc => {
      const note = doc.data();
      html += `
        <li class="list-item" data-id="${doc.id}">
          <div class="list-item-content">
            <div class="list-item-title">${note.title}</div>
            <div class="list-item-date">최근 수정: ${formatDate(note.updatedAt || note.createdAt)}</div>
            <div class="list-item-preview">${truncateText(note.content, 100)}</div>
          </div>
          <div class="list-item-actions">
            <button onclick="viewNote('${doc.id}')">보기</button>
            <button onclick="editNote('${doc.id}')">수정</button>
            <button onclick="deleteNote('${doc.id}')">삭제</button>
          </div>
        </li>
      `;
    });
    
    html += '</ul>';
    notesListEl.innerHTML = html;
  } catch (error) {
    console.error("메모를 불러오는 중 오류 발생:", error);
    document.getElementById("notes-list").innerHTML = '<p>메모를 불러오는 중 오류가 발생했습니다.</p>';
  }
}

// 메모 추가 폼 표시
function showAddNoteForm() {
  const modalContent = `
    <form id="note-form">
<div class="form-group">
        <label for="note-title">제목</label>
        <input type="text" id="note-title" required placeholder="이모티콘 사용 가능 📝 💭 📌">
        <div class="emoji-helper">
          <small>자주 쓰는 이모티콘: 
            <span onclick="insertEmoji('note-title', '📝')">📝</span>
            <span onclick="insertEmoji('note-title', '💭')">💭</span>
            <span onclick="insertEmoji('note-title', '📌')">📌</span>
            <span onclick="insertEmoji('note-title', '💡')">💡</span>
            <span onclick="insertEmoji('note-title', '⭐')">⭐</span>
            <span onclick="insertEmoji('note-title', '🔖')">🔖</span>
            <span onclick="insertEmoji('note-title', '📋')">📋</span>
          </small>
        </div>
      </div>
      <div class="form-group">
        <label for="note-content">내용</label>
        <div id="note-editor"></div>
      </div>
    </form>
  `;
  
  showModal("새 메모 작성", modalContent, saveNote);
  
  // 에디터 초기화
  setTimeout(() => {
    initTextEditor('note-editor', '메모 내용을 작성하세요...');
  }, 100);
}

// 메모 저장
async function saveNote() {
  const titleEl = document.getElementById('note-title');
  
  if (!titleEl.value) {
    alert('제목은 필수 입력 항목입니다.');
    return;
  }
  
  const content = getEditorContent('note-editor');
  
  if (!content) {
    alert('내용을 입력해주세요.');
    return;
  }
  
  try {
    // 메모 데이터 구성
    const noteData = {
      title: titleEl.value,
      content: content,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    // Firestore에 저장
    await db.collection("notes").add(noteData);
    
    // 모달 닫기
    closeModal();
    
    // 메모 목록 새로고침
    loadNotes();
  } catch (error) {
    console.error("메모 저장 중 오류 발생:", error);
    alert('메모를 저장하는 중 오류가 발생했습니다.');
  }
}

// 메모 보기
async function viewNote(noteId) {
  try {
    const noteDoc = await db.collection("notes").doc(noteId).get();
    
    if (!noteDoc.exists) {
      alert('메모를 찾을 수 없습니다.');
      return;
    }
    
    const note = noteDoc.data();
    
    const modalContent = `
      <div class="note-view">
        <div class="note-date">최근 수정: ${formatDate(note.updatedAt || note.createdAt)}</div>
        <div class="note-content">${note.content}</div>
      </div>
    `;
    
    showModal(note.title, modalContent);
  } catch (error) {
    console.error("메모 불러오기 중 오류 발생:", error);
    alert('메모를 불러오는 중 오류가 발생했습니다.');
  }
}

// 메모 편집 폼 표시
async function editNote(noteId) {
  try {
    const noteDoc = await db.collection("notes").doc(noteId).get();
    
    if (!noteDoc.exists) {
      alert('메모를 찾을 수 없습니다.');
      return;
    }
    
    const note = noteDoc.data();
    
    const modalContent = `
      <form id="note-form">
        <input type="hidden" id="note-id" value="${noteId}">
        <div class="form-group">
          <label for="note-title">제목</label>
          <input type="text" id="note-title" value="${note.title}" required>
        </div>
        <div class="form-group">
          <label for="note-content">내용</label>
          <div id="note-editor"></div>
        </div>
      </form>
    `;
    
    showModal("메모 수정", modalContent, updateNote);
    
    // 에디터 초기화
    setTimeout(() => {
      initTextEditor('note-editor', '메모 내용을 작성하세요...', note.content);
    }, 100);
  } catch (error) {
    console.error("메모 로드 중 오류 발생:", error);
    alert('메모를 불러오는 중 오류가 발생했습니다.');
  }
}

// 메모 업데이트
async function updateNote() {
  const noteId = document.getElementById('note-id').value;
  const titleEl = document.getElementById('note-title');
  
  if (!titleEl.value) {
    alert('제목은 필수 입력 항목입니다.');
    return;
  }
  
  const content = getEditorContent('note-editor');
  
  if (!content) {
    alert('내용을 입력해주세요.');
    return;
  }
  
  try {
    // 메모 데이터 구성
    const noteData = {
      title: titleEl.value,
      content: content,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    // Firestore에 업데이트
    await db.collection("notes").doc(noteId).update(noteData);
    
    // 모달 닫기
    closeModal();
    
    // 메모 목록 새로고침
    loadNotes();
  } catch (error) {
    console.error("메모 업데이트 중 오류 발생:", error);
    alert('메모를 업데이트하는 중 오류가 발생했습니다.');
  }
}

// 메모 삭제
async function deleteNote(noteId) {
  if (confirm('정말로 이 메모를 삭제하시겠습니까?')) {
    try {
      await db.collection("notes").doc(noteId).delete();
      loadNotes(); // 목록 새로고침
    } catch (error) {
      console.error("메모 삭제 중 오류 발생:", error);
      alert('메모를 삭제하는 중 오류가 발생했습니다.');
    }
  }
}

// =========== 습관 관리 기능 ===========

// 습관 페이지 렌더링
function renderHabitsPage(container) {
  // 습관 페이지에 새로 들어오면 오늘 기준으로 시작
  window.habitCalendar = null;
  window.savedHabitCalendarDate = null;

  container.innerHTML = `
    <div class="page-container">
      <div class="page-header">
        <h1>습관 관리</h1>
        <div class="page-actions">
          <div class="view-toggle">
            <button id="list-view-button" class="${currentView === 'list' ? 'active' : ''}" onclick="toggleView('list')">
              <i class="fas fa-list"></i> 리스트
            </button>
            <button id="calendar-view-button" class="${currentView === 'calendar' ? 'active' : ''}" onclick="toggleView('calendar')">
              <i class="fas fa-calendar-alt"></i> 달력
            </button>
          </div>
          <button onclick="showHabitCategoryManager()">카테고리 관리</button>
          <button onclick="showAddHabitForm()">습관 추가</button>
        </div>
      </div>

      <div id="calendar-view-container" class="calendar-container" style="display: ${currentView === 'calendar' ? 'block' : 'none'}">
        <div id="habit-calendar"></div>
      </div>
      
      <div id="list-view-container" style="display: ${currentView === 'list' ? 'block' : 'none'}">
        <div class="card">
          <h2 class="card-title">습관 목록</h2>
          <div id="habits-list">
            <p>습관을 불러오는 중...</p>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // 습관 데이터 불러오기
  loadHabits();
}

// 습관 데이터 불러오기
async function loadHabits() {
  try {
    // 카테고리(이름/색상) 먼저 불러오기
    await loadHabitCategories();

    const habitsRef = db.collection("habits");
    const snapshot = await cachedCollection("habits", { orderBy: "createdAt", dir: "desc" });

    const habits = [];
    
    for (const doc of snapshot.docs) {
      const habit = doc.data();
      
      // 습관 완료 기록 불러오기
      const recordsSnapshot = await cachedSubcollection("habits", doc.id, "records");
      const records = [];
      
      recordsSnapshot.forEach(recordDoc => {
        const record = recordDoc.data();
        records.push({
          id: recordDoc.id,
          date: record.date.toDate(),
          completed: record.completed || false
        });
      });
      
      habits.push({
        id: doc.id,
        name: habit.name,
        category: habit.category || '기타',
        createdAt: habit.createdAt.toDate(),
        archived: habit.archived === true,
        archivedAt: habit.archivedAt && typeof habit.archivedAt.toDate === 'function' ? habit.archivedAt.toDate() : null,
        records: records
      });
    }
    
    // 뷰에 따라 다르게 표시
    if (currentView === 'list') {
      renderHabitsList(habits);
    } else {
      renderHabitsCalendar(habits);
    }
  } catch (error) {
    console.error("습관을 불러오는 중 오류 발생:", error);
    document.getElementById("habits-list").innerHTML = '<p>습관을 불러오는 중 오류가 발생했습니다.</p>';
  }
}

// 습관 리스트 렌더링
function renderHabitsList(habits) {
  const habitsListEl = document.getElementById("habits-list");

  const activeHabits = habits.filter(h => !h.archived);
  const archivedHabits = habits.filter(h => h.archived);

  if (habits.length === 0) {
    habitsListEl.innerHTML = '<p>등록된 습관이 없습니다.</p>';
    return;
  }

  // 오늘 날짜
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let html = '';

  if (activeHabits.length === 0) {
    html += '<p>진행 중인 습관이 없습니다.</p>';
  } else {
    html += '<ul class="list-container">';
  }

  activeHabits.forEach(habit => {
    // 오늘 완료 여부 확인
    const todayRecord = habit.records.find(record => {
      const recordDate = new Date(record.date);
      recordDate.setHours(0, 0, 0, 0);
      return recordDate.getTime() === today.getTime();
    });

    const isCompletedToday = todayRecord && todayRecord.completed;

    // 이번 달 완료 횟수 계산
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    const monthCompletedCount = habit.records.filter(record => {
      const recordDate = new Date(record.date);
      return recordDate.getMonth() === currentMonth &&
             recordDate.getFullYear() === currentYear &&
             record.completed;
    }).length;

    html += `
      <li class="list-item" data-id="${habit.id}">
        <div class="list-item-checkbox">
          <input
            type="checkbox"
            ${isCompletedToday ? 'checked' : ''}
            onchange="toggleHabitComplete('${habit.id}', ${!isCompletedToday})"
          />
        </div>
        <div class="list-item-content">
          <div class="list-item-title">${habit.name}</div>
          <div class="list-item-description">
            <span class="habit-category" style="color: ${getCategoryColor(habit.category)}; font-weight: 500;">${escapeHtml(habit.category)}</span>
            <span class="habit-stats">이번 달: ${monthCompletedCount}회 완료</span>
          </div>
        </div>
        <div class="list-item-actions">
          <button onclick="showHabitCalendar('${habit.id}')">달력</button>
          <button onclick="editHabit('${habit.id}')">수정</button>
          <button onclick="archiveHabit('${habit.id}')" title="이전 기록은 남기고 앞으로 사용하지 않기">종료</button>
        </div>
      </li>
    `;
  });

  if (activeHabits.length > 0) {
    html += '</ul>';
  }

  // 종료된 습관 (이전 기록은 달력에 그대로 남아 있음)
  if (archivedHabits.length > 0) {
    html += `
      <details style="margin-top: 20px;">
        <summary style="cursor: pointer; font-weight: 500; color: #757575; margin-bottom: 10px;">
          종료된 습관 (${archivedHabits.length})
        </summary>
        <ul class="list-container">
    `;

    archivedHabits.forEach(habit => {
      const totalCount = habit.records.filter(record => record.completed).length;
      const endedText = habit.archivedAt ? ` · 종료일 ${formatDate(habit.archivedAt)}` : '';

      html += `
        <li class="list-item" data-id="${habit.id}" style="opacity: 0.75;">
          <div class="list-item-content">
            <div class="list-item-title">${habit.name}</div>
            <div class="list-item-description">
              <span class="habit-category" style="color: ${getCategoryColor(habit.category)}; font-weight: 500;">${escapeHtml(habit.category)}</span>
              <span class="habit-stats">전체 ${totalCount}회 완료${endedText}</span>
            </div>
          </div>
          <div class="list-item-actions">
            <button onclick="showHabitCalendar('${habit.id}')">달력</button>
            <button onclick="restoreHabit('${habit.id}')">다시 시작</button>
            <button onclick="deleteHabit('${habit.id}')" style="background-color: #f44336;">완전 삭제</button>
          </div>
        </li>
      `;
    });

    html += '</ul></details>';
  }

  habitsListEl.innerHTML = html;
}

// 습관 달력 렌더링
function renderHabitsCalendar(habits) {
  const calendarEl = document.getElementById('habit-calendar');

  if (!calendarEl) return;

  // 이전 인스턴스를 없애기 전에 보고 있던 달을 기억 (체크/수정 후에도 같은 달 유지)
  if (window.habitCalendar) {
    try {
      window.savedHabitCalendarDate = window.habitCalendar.getDate();
    } catch (err) {
      console.error("습관 달력 상태 저장 중 오류:", err);
    }
    try {
      window.habitCalendar.destroy();
    } catch (err) {
      console.error("습관 달력 제거 중 오류:", err);
    }
    window.habitCalendar = null;
  }

  // 달력에 표시할 이벤트 형식으로 변환 (종료된 습관의 지난 기록도 모두 표시)
  const events = [];

  habits.forEach(habit => {
    habit.records.forEach(record => {
      if (record.completed) {
        events.push({
          title: habit.name,
          start: record.date,
          allDay: true,
          backgroundColor: getCategoryColor(habit.category),
          extendedProps: {
            habitId: habit.id,
            completed: true
          }
        });
      }
    });
  });

  // FullCalendar 초기화
  window.habitCalendar = new FullCalendar.Calendar(calendarEl, {
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth'
    },
    initialView: 'dayGridMonth',
    initialDate: window.savedHabitCalendarDate || undefined,
    locale: 'ko',
    firstDay: 1, // 주의 시작: 월요일
    events: events,
    eventDidMount: function(info) {
      // 이벤트에 체크 표시 추가
      const eventEl = info.el;
      if (info.event.extendedProps.completed) {
        const checkmark = document.createElement('span');
        checkmark.innerHTML = '✓';
        checkmark.style.marginRight = '5px';
        checkmark.style.fontWeight = 'bold';

        const titleElement = eventEl.querySelector('.fc-event-title');
        if (titleElement) {
          titleElement.parentNode.insertBefore(checkmark, titleElement);
        }
      }
    },
    dateClick: function(info) {
      showDayHabits(info.date, habits);
    }
  });

  window.habitCalendar.render();
}

// 카테고리별 색상 가져오기 (화면에서 관리하는 카테고리 색상 사용)
function getCategoryColor(category) {
  const categories = window.habitCategories || [];
  const found = categories.find(c => c.name === category);
  if (found) return found.color;

  // 삭제되었거나 목록에 없는 카테고리는 예전 기본 색상 또는 기타 색상으로 표시
  const legacy = DEFAULT_HABIT_CATEGORIES.find(c => c.name === category);
  return legacy ? legacy.color : '#9c27b0';
}

// 특정 날짜의 습관 현황 표시
function showDayHabits(date, habits) {
  const selectedDate = new Date(date);
  selectedDate.setHours(0, 0, 0, 0);

  const formattedDate = formatDate(selectedDate);

  let habitItems = '';

  habits.forEach(habit => {
    // 해당 날짜 완료 여부 확인
    const dayRecord = habit.records.find(record => {
      const recordDate = new Date(record.date);
      recordDate.setHours(0, 0, 0, 0);
      return recordDate.getTime() === selectedDate.getTime();
    });

    const isCompleted = dayRecord && dayRecord.completed;

    // 종료된 습관은 종료일 이전 날짜이거나 해당 날짜에 기록이 있을 때만 표시
    if (habit.archived) {
      const endDate = habit.archivedAt ? new Date(habit.archivedAt) : new Date();
      endDate.setHours(0, 0, 0, 0);

      if (!dayRecord && selectedDate.getTime() > endDate.getTime()) {
        return;
      }
    }

    habitItems += `
      <div class="habit-day-item" style="display: flex; align-items: center; gap: 10px; padding: 8px 0;">
        <input
          type="checkbox"
          style="width: 20px; height: 20px; margin: 0; flex: none;"
          ${isCompleted ? 'checked' : ''}
          onchange="updateHabitRecord('${habit.id}', '${formattedDate}', ${!isCompleted})"
        />
        <span>${habit.name} (${escapeHtml(habit.category)})${habit.archived ? ' <small style="color: #999;">종료됨</small>' : ''}</span>
      </div>
    `;
  });

  const modalContent = `
    <div class="habits-day">
      <h3>${formattedDate} 습관 현황</h3>
      <div class="habits-day-list">
        ${habitItems || '<p>등록된 습관이 없습니다.</p>'}
      </div>
    </div>
  `;

  showModal(`${formattedDate} 습관`, modalContent);
}

// 습관 완료 상태 토글 (오늘)
async function toggleHabitComplete(habitId, completed) {
  const today = formatDate(new Date());
  updateHabitRecord(habitId, today, completed);
}

// 습관 기록 업데이트
async function updateHabitRecord(habitId, dateStr, completed) {
  try {
    const date = new Date(dateStr);
    date.setHours(0, 0, 0, 0);
    
    // 해당 날짜의 기록 확인
    const recordsRef = db.collection("habits").doc(habitId).collection("records");
    const snapshot = await recordsRef
      .where("date", ">=", date)
      .where("date", "<", new Date(date.getTime() + 86400000)) // +1일
      .get();
    
    if (snapshot.empty) {
      // 기록이 없으면 새로 추가
      await recordsRef.add({
        date: firebase.firestore.Timestamp.fromDate(date),
        completed: completed,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } else {
      // 기존 기록 업데이트
      const recordId = snapshot.docs[0].id;
      await recordsRef.doc(recordId).update({
        completed: completed,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
    
    // 현재 뷰가 리스트면 리스트 새로고침, 달력이면 달력 새로고침
    loadHabits();
    
    // 모달이 열려있으면 닫기
    if (isModalOpen) {
      closeModal();
    }
  } catch (error) {
    console.error("습관 기록 업데이트 중 오류 발생:", error);
    alert('습관 기록을 업데이트하는 중 오류가 발생했습니다.');
  }
}

// 습관 개별 달력 표시
// 습관 개별 달력 표시
async function showHabitCalendar(habitId) {
  try {
    const habitDoc = await cachedDoc("habits", habitId);
    
    if (!habitDoc.exists) {
      alert('습관 정보를 찾을 수 없습니다.');
      return;
    }
    
    const habit = habitDoc.data();
    
    // 습관 완료 기록 불러오기
    const recordsSnapshot = await cachedSubcollection("habits", habitId, "records");
    const records = [];
    
    recordsSnapshot.forEach(recordDoc => {
      const record = recordDoc.data();
      records.push({
        id: recordDoc.id,
        date: record.date.toDate(),
        completed: record.completed || false
      });
    });
    
    // 이번 달 달력 생성
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    const daysInMonth = lastDay.getDate();
    const firstDayOfWeek = (firstDay.getDay() + 6) % 7; // 월요일 시작 기준 (0: 월요일 ... 6: 일요일)
    
    // 달력 HTML 생성
    let calendarHTML = `
      <h3>${year}년 ${month + 1}월</h3>
      <div class="habit-calendar">
        ${['월', '화', '수', '목', '금', '토', '일'].map(day => `<div class="habit-day habit-day-header">${day}</div>`).join('')}
    `;
    
    // 이전 달의 마지막 날짜들로 채우기
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = 0; i < firstDayOfWeek; i++) {
      const prevDay = prevMonthLastDay - firstDayOfWeek + i + 1;
      calendarHTML += `<div class="habit-day habit-day-other-month">${prevDay}</div>`;
    }
    
    // 이번 달 날짜 채우기
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      date.setHours(0, 0, 0, 0);
      
      // 해당 날짜에 완료 여부 확인
      const record = records.find(record => {
        const recordDate = new Date(record.date);
        recordDate.setHours(0, 0, 0, 0);
        return recordDate.getTime() === date.getTime();
      });
      
      const isCompleted = record && record.completed;
      
      // 오늘 날짜 표시
      const isToday = date.getTime() === new Date().setHours(0, 0, 0, 0);
      
      // 날짜 클래스 구성
      let dayClass = "habit-day";
      if (isCompleted) dayClass += " completed";
      if (isToday) dayClass += " today";
      
      calendarHTML += `
        <div class="${dayClass}" 
             data-date="${formatDate(date)}" 
             onclick="updateHabitRecord('${habitId}', '${formatDate(date)}', ${!isCompleted})">
          ${day}
          ${isCompleted ? '<div class="habit-checkmark">✓</div>' : ''}
        </div>
      `;
    }
    
    // 다음 달의 첫 날짜들로 채우기
    const lastDayOfWeek = (lastDay.getDay() + 6) % 7; // 월요일 시작 기준
    const daysToAdd = 6 - lastDayOfWeek;
    for (let i = 1; i <= daysToAdd; i++) {
      calendarHTML += `<div class="habit-day habit-day-other-month">${i}</div>`;
    }
    
    calendarHTML += '</div>';
    
    // 체크 표시용 CSS 추가
    calendarHTML += `
      <style>
        .habit-checkmark {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          color: white;
          font-weight: bold;
        }
        .habit-day {
          position: relative;
        }
        .habit-day.completed {
          background-color: var(--primary-color);
          color: white;
          cursor: pointer;
        }
      </style>
    `;
    
    const modalContent = `
      <div class="habit-detail">
        <div class="habit-info">
          <h3>${habit.name}</h3>
          <p>카테고리: ${habit.category || '기타'}</p>
        </div>
        <div class="habit-calendar-container">
          ${calendarHTML}
        </div>
      </div>
    `;
    
    showModal(habit.name, modalContent);
  } catch (error) {
    console.error("습관 달력 로드 중 오류 발생:", error);
    alert('습관 달력을 불러오는 중 오류가 발생했습니다.');
  }
}
    

// =========== 습관 카테고리 관리 ===========

// 최초 1회 자동 등록되는 기본 카테고리 (이후에는 화면에서 자유롭게 추가/삭제)
const DEFAULT_HABIT_CATEGORIES = [
  { name: '약', color: '#f44336' },
  { name: '운동', color: '#4caf50' },
  { name: '학습', color: '#2196f3' },
  { name: '업무', color: '#ff9800' },
  { name: '기타', color: '#9c27b0' }
];

// 새 카테고리를 만들 때 순서대로 자동 배정되는 색상
const HABIT_CATEGORY_COLOR_POOL = [
  '#00897b', '#5c6bc0', '#d81b60', '#6d4c41', '#039be5',
  '#7cb342', '#f4511e', '#8e24aa', '#546e7a', '#c0ca33'
];

window.habitCategories = window.habitCategories || null;

// HTML 특수문자 이스케이프
function escapeHtml(str) {
  return String(str === undefined || str === null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 습관 카테고리 불러오기 (처음이면 기본 카테고리를 자동 등록)
async function loadHabitCategories(force = false) {
  if (window.habitCategories && !force) {
    return window.habitCategories;
  }

  const ref = db.collection("habitCategories");
  let snapshot = await cachedCollection("habitCategories");

  if (snapshot.empty) {
    try {
      const batch = db.batch();
      DEFAULT_HABIT_CATEGORIES.forEach((c, i) => {
        batch.set(ref.doc(), {
          name: c.name,
          color: c.color,
          order: (i + 1) * 10,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      });
      await batch.commit();
      snapshot = await cachedCollection("habitCategories");
    } catch (error) {
      // 쓰기에 실패해도 화면은 동작하도록 기본값을 메모리에서만 사용
      console.error("기본 습관 카테고리 등록 실패:", error);
      window.habitCategories = DEFAULT_HABIT_CATEGORIES.map((c, i) => ({
        id: null, name: c.name, color: c.color, order: (i + 1) * 10
      }));
      return window.habitCategories;
    }
  }

  const list = [];
  snapshot.forEach(doc => {
    const d = doc.data();
    list.push({
      id: doc.id,
      name: d.name,
      color: d.color || '#9c27b0',
      order: d.order !== undefined ? d.order : 9999
    });
  });
  list.sort((a, b) => a.order - b.order);

  window.habitCategories = list;
  return list;
}

// 카테고리 관리 창 표시
async function showHabitCategoryManager() {
  try {
    const categories = await loadHabitCategories(true);

    const rows = categories.map(c => `
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
        <input type="color" value="${c.color}" title="색상 변경"
               style="width: 40px; height: 34px; padding: 0; margin: 0; flex: none;"
               onchange="updateHabitCategoryColor('${c.id}', this.value)">
        <span style="flex: 1;">${escapeHtml(c.name)}</span>
        <button type="button" style="background-color: #f44336; padding: 5px 10px; font-size: 0.8rem;"
                onclick="deleteHabitCategory('${c.id}')">삭제</button>
      </div>
    `).join('');

    const content = `
      <div>
        <p style="font-size: 0.85rem; color: #666; margin-bottom: 12px;">
          카테고리를 삭제해도 이미 등록된 습관과 기록은 그대로 유지됩니다.
        </p>
        ${rows || '<p>등록된 카테고리가 없습니다.</p>'}
        <div style="display: flex; align-items: center; gap: 8px; margin-top: 15px;">
          <input type="color" id="new-habit-category-color" value="${HABIT_CATEGORY_COLOR_POOL[categories.length % HABIT_CATEGORY_COLOR_POOL.length]}"
                 style="width: 40px; height: 40px; padding: 0; margin: 0; flex: none;">
          <input type="text" id="new-habit-category-name" placeholder="새 카테고리 이름" style="margin: 0;"
                 onkeyup="if(event.key === 'Enter') addHabitCategory()">
          <button type="button" style="white-space: nowrap;" onclick="addHabitCategory()">추가</button>
        </div>
      </div>
    `;

    showModal("습관 카테고리 관리", content);
  } catch (error) {
    console.error("습관 카테고리 로드 중 오류 발생:", error);
    alert('습관 카테고리를 불러오는 중 오류가 발생했습니다.');
  }
}

// 카테고리 추가
async function addHabitCategory() {
  const nameEl = document.getElementById('new-habit-category-name');
  const colorEl = document.getElementById('new-habit-category-color');
  const name = nameEl ? nameEl.value.trim() : '';

  if (!name) {
    alert('카테고리 이름을 입력해주세요.');
    return;
  }

  try {
    const categories = await loadHabitCategories();

    if (categories.some(c => c.name === name)) {
      alert('이미 있는 카테고리입니다.');
      return;
    }

    const maxOrder = categories.reduce((m, c) => Math.max(m, c.order === 9999 ? 0 : c.order), 0);

    await db.collection("habitCategories").add({
      name: name,
      color: colorEl ? colorEl.value : '#607d8b',
      order: maxOrder + 10,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    await showHabitCategoryManager();
    loadHabits();
  } catch (error) {
    console.error("습관 카테고리 추가 중 오류 발생:", error);
    alert('카테고리를 추가하는 중 오류가 발생했습니다.');
  }
}

// 카테고리 색상 변경
async function updateHabitCategoryColor(categoryId, color) {
  try {
    await db.collection("habitCategories").doc(categoryId).update({
      color: color,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    window.habitCategories = null;
    await loadHabitCategories(true);
    loadHabits();
  } catch (error) {
    console.error("습관 카테고리 색상 변경 중 오류 발생:", error);
    alert('카테고리 색상을 변경하는 중 오류가 발생했습니다.');
  }
}

// 카테고리 삭제 (이미 등록된 습관/기록에는 영향 없음)
async function deleteHabitCategory(categoryId) {
  try {
    const categories = await loadHabitCategories();

    if (categories.length <= 1) {
      alert('카테고리는 최소 1개가 필요합니다.');
      return;
    }

    const target = categories.find(c => c.id === categoryId);
    const label = target ? `'${target.name}'` : '이';

    if (!confirm(`${label} 카테고리를 삭제하시겠습니까?\n이미 등록된 습관과 기록은 그대로 유지됩니다.`)) {
      return;
    }

    await db.collection("habitCategories").doc(categoryId).delete();

    window.habitCategories = null;
    await showHabitCategoryManager();
    loadHabits();
  } catch (error) {
    console.error("습관 카테고리 삭제 중 오류 발생:", error);
    alert('카테고리를 삭제하는 중 오류가 발생했습니다.');
  }
}

// 습관 폼용 카테고리 선택 상자 HTML 생성
function buildHabitCategorySelect(selected) {
  const categories = window.habitCategories || [];
  const names = categories.map(c => c.name);

  let options = '';

  // 이미 삭제된 카테고리를 쓰는 습관을 수정할 때도 값이 유지되도록 처리
  if (selected && !names.includes(selected)) {
    options += `<option value="${escapeHtml(selected)}" selected>${escapeHtml(selected)} (삭제된 카테고리)</option>`;
  }

  options += categories.map(c =>
    `<option value="${escapeHtml(c.name)}" ${c.name === selected ? 'selected' : ''}>${escapeHtml(c.name)}</option>`
  ).join('');

  options += '<option value="__new__">➕ 새 카테고리 추가...</option>';

  return `<select id="habit-category" onchange="toggleNewHabitCategory(this.value)">${options}</select>`;
}

// '새 카테고리 추가' 선택 시 입력칸 표시/숨김
function toggleNewHabitCategory(value) {
  const container = document.getElementById('habit-new-category-container');
  if (!container) return;

  if (value === '__new__') {
    container.style.display = 'block';
    const input = document.getElementById('habit-new-category');
    if (input) input.focus();
  } else {
    container.style.display = 'none';
  }
}

// 폼에서 선택/입력한 카테고리를 확정 (새 카테고리면 목록에도 등록)
async function resolveHabitCategory() {
  const categoryEl = document.getElementById('habit-category');

  if (categoryEl.value !== '__new__') {
    return categoryEl.value;
  }

  const name = document.getElementById('habit-new-category').value.trim();
  if (!name) {
    alert('새 카테고리 이름을 입력해주세요.');
    return null;
  }

  const categories = await loadHabitCategories();
  if (categories.some(c => c.name === name)) {
    return name;
  }

  const maxOrder = categories.reduce((m, c) => Math.max(m, c.order === 9999 ? 0 : c.order), 0);

  await db.collection("habitCategories").add({
    name: name,
    color: HABIT_CATEGORY_COLOR_POOL[categories.length % HABIT_CATEGORY_COLOR_POOL.length],
    order: maxOrder + 10,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  window.habitCategories = null;
  await loadHabitCategories(true);

  return name;
}

// =========== 습관 추가/수정/종료/삭제 ===========

// 습관 추가 폼 표시
async function showAddHabitForm() {
  try {
    const categories = await loadHabitCategories();
    const defaultCategory = categories.length > 0 ? categories[0].name : '';

    const modalContent = `
      <form id="habit-form">
        <div class="form-group">
          <label for="habit-name">습관명</label>
          <input type="text" id="habit-name" required>
        </div>
        <div class="form-group">
          <label for="habit-category">카테고리</label>
          ${buildHabitCategorySelect(defaultCategory)}
        </div>
        <div class="form-group" id="habit-new-category-container" style="display: none;">
          <label for="habit-new-category">새 카테고리 이름</label>
          <input type="text" id="habit-new-category" placeholder="카테고리 이름 입력">
        </div>
      </form>
    `;

    showModal("습관 추가", modalContent, saveHabit);
  } catch (error) {
    console.error("습관 추가 폼 표시 중 오류 발생:", error);
    alert('습관 추가 화면을 여는 중 오류가 발생했습니다.');
  }
}

// 습관 저장
async function saveHabit() {
  const nameEl = document.getElementById('habit-name');

  if (!nameEl.value) {
    alert('습관명은 필수 입력 항목입니다.');
    return;
  }

  try {
    const category = await resolveHabitCategory();
    if (category === null) return;

    // 습관 데이터 구성
    const habitData = {
      name: nameEl.value,
      category: category,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    // Firestore에 저장
    await db.collection("habits").add(habitData);

    // 모달 닫기
    closeModal();

    // 습관 목록 새로고침
    loadHabits();
  } catch (error) {
    console.error("습관 저장 중 오류 발생:", error);
    alert('습관을 저장하는 중 오류가 발생했습니다.');
  }
}

// 습관 편집 폼 표시
async function editHabit(habitId) {
  try {
    const habitDoc = await db.collection("habits").doc(habitId).get();

    if (!habitDoc.exists) {
      alert('습관 정보를 찾을 수 없습니다.');
      return;
    }

    const habit = habitDoc.data();
    await loadHabitCategories();

    const modalContent = `
      <form id="habit-form">
        <input type="hidden" id="habit-id" value="${habitId}">
        <div class="form-group">
          <label for="habit-name">습관명</label>
          <input type="text" id="habit-name" value="${escapeHtml(habit.name)}" required>
        </div>
        <div class="form-group">
          <label for="habit-category">카테고리</label>
          ${buildHabitCategorySelect(habit.category || '기타')}
        </div>
        <div class="form-group" id="habit-new-category-container" style="display: none;">
          <label for="habit-new-category">새 카테고리 이름</label>
          <input type="text" id="habit-new-category" placeholder="카테고리 이름 입력">
        </div>
      </form>
    `;

    showModal("습관 수정", modalContent, updateHabit);
  } catch (error) {
    console.error("습관 정보 로드 중 오류 발생:", error);
    alert('습관 정보를 불러오는 중 오류가 발생했습니다.');
  }
}

// 습관 업데이트
async function updateHabit() {
  const habitId = document.getElementById('habit-id').value;
  const nameEl = document.getElementById('habit-name');

  if (!nameEl.value) {
    alert('습관명은 필수 입력 항목입니다.');
    return;
  }

  try {
    const category = await resolveHabitCategory();
    if (category === null) return;

    // 습관 데이터 구성
    const habitData = {
      name: nameEl.value,
      category: category,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    // Firestore에 업데이트
    await db.collection("habits").doc(habitId).update(habitData);

    // 모달 닫기
    closeModal();

    // 습관 목록 새로고침
    loadHabits();
  } catch (error) {
    console.error("습관 업데이트 중 오류 발생:", error);
    alert('습관을 업데이트하는 중 오류가 발생했습니다.');
  }
}

// 습관 종료 (기록은 그대로 보존, 오늘부터 목록/체크 화면에서만 제외)
async function archiveHabit(habitId) {
  if (!confirm('이 습관을 종료하시겠습니까?\n이전 기록은 달력에 그대로 남고, 오늘부터는 목록과 체크 화면에서 제외됩니다.\n(\'종료된 습관\'에서 언제든 다시 시작할 수 있습니다.)')) {
    return;
  }

  try {
    await db.collection("habits").doc(habitId).update({
      archived: true,
      archivedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    loadHabits();
  } catch (error) {
    console.error("습관 종료 중 오류 발생:", error);
    alert('습관을 종료하는 중 오류가 발생했습니다.');
  }
}

// 종료한 습관 다시 시작
async function restoreHabit(habitId) {
  try {
    await db.collection("habits").doc(habitId).update({
      archived: false,
      archivedAt: firebase.firestore.FieldValue.delete(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    loadHabits();
  } catch (error) {
    console.error("습관 다시 시작 중 오류 발생:", error);
    alert('습관을 다시 시작하는 중 오류가 발생했습니다.');
  }
}

// 습관 완전 삭제 (모든 기록도 함께 삭제됨 - 종료된 습관 목록에서만 사용)
async function deleteHabit(habitId) {
  if (confirm('이 습관을 완전히 삭제하시겠습니까?\n이 습관의 모든 기록이 달력에서도 함께 사라지며 되돌릴 수 없습니다.\n(기록을 남기려면 취소하고 \'종료\'만 해두세요.)')) {
    try {
      // 먼저 모든 기록 삭제
      const recordsSnapshot = await db.collection("habits").doc(habitId).collection("records").get();
      const batch = db.batch();

      recordsSnapshot.forEach(doc => {
        batch.delete(doc.ref);
      });

      // 배치 작업 실행
      await batch.commit();

      // 습관 삭제
      await db.collection("habits").doc(habitId).delete();

      // 습관 목록 새로고침
      loadHabits();
    } catch (error) {
      console.error("습관 삭제 중 오류 발생:", error);
      alert('습관을 삭제하는 중 오류가 발생했습니다.');
    }
  }
}

// =========== 혈압 관리 기능 ===========

// 혈압 페이지 렌더링
function renderBloodPressurePage(container) {
  resetPersistentCalendar('bp');
  container.innerHTML = `
    <div class="page-container">
      <div class="page-header">
        <h1>혈압 관리</h1>
        <div class="page-actions">
          <div class="view-toggle">
            <button id="list-view-button" class="${currentView === 'list' ? 'active' : ''}" onclick="toggleView('list')">
              <i class="fas fa-list"></i> 리스트
            </button>
            <button id="calendar-view-button" class="${currentView === 'calendar' ? 'active' : ''}" onclick="toggleView('calendar')">
              <i class="fas fa-calendar-alt"></i> 달력
            </button>
          </div>
          <button onclick="showAddBloodPressureForm()">혈압 기록</button>
        </div>
      </div>
      
      <div class="card">
        <h2 class="card-title">혈압 추이</h2>
        
        <!-- 기간 설정 컨트롤 추가 -->
        <div class="period-control">
          <label for="bp-period">기간:</label>
          <select id="bp-period" onchange="updateBloodPressureChart()">
            <option value="1">최근 1개월</option>
            <option value="3" selected>최근 3개월</option>
            <option value="6">최근 6개월</option>
            <option value="12">최근 1년</option>
            <option value="0">전체 기간</option>
            <option value="custom">사용자 정의</option>
          </select>
          
          <!-- 사용자 정의 기간 설정 - style="display: none;" 추가 -->
          <div class="custom-period" style="display: none;">
            <label for="bp-start-date">시작일:</label>
            <input type="date" id="bp-start-date">
            <label for="bp-end-date">종료일:</label>
            <input type="date" id="bp-end-date">
            <button id="apply-custom-period" onclick="applyCustomBpPeriod()">적용</button>
          </div>
        </div>
        
        <div class="chart-container bp-chart">
          <canvas id="bp-chart"></canvas>
        </div>
      </div>
      
      <!-- 섹션 구분선 추가 -->
      <div class="section-divider"></div>

      <div id="calendar-view-container" class="calendar-container" style="display: ${currentView === 'calendar' ? 'block' : 'none'}">
        <div id="bp-calendar"></div>
      </div>
      
      <div id="list-view-container" style="display: ${currentView === 'list' ? 'block' : 'none'}">
        <div class="card">
          <h2 class="card-title">혈압 기록</h2>
          <div id="bp-list">
            <p>기록을 불러오는 중...</p>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // 혈압 데이터 불러오기
  loadBloodPressures();
  
  // 기간 설정 UI 초기화 함수 호출 추가
  setTimeout(() => {
    initBpDateRangeUI();
  }, 100);
  
  // 혈압 관련 스타일 추가
  addBloodPressurePageStyles();
}

// 혈압 관련 스타일 추가 함수
function addBloodPressurePageStyles() {
  const styleEl = document.createElement('style');
  styleEl.id = 'bp-page-styles';
  styleEl.textContent = `
    /* 혈압 차트 컨테이너 - 높이 증가 */
    .bp-chart {
      height: 400px !important;
      margin-bottom: 40px !important;
      overflow: visible !important;
    }
    
    /* 혈압 기록 스타일 */
    .bp-item {
      display: flex;
      justify-content: space-between;
      margin-bottom: 10px;
      padding: 10px;
      background-color: #f9f9f9;
      border-radius: 5px;
    }
    
    .bp-value-high {
      color: #f44336;
      font-weight: bold;
    }
    
    .bp-value-normal {
      color: #4caf50;
      font-weight: bold;
    }
    
    .bp-value-low {
      color: #2196f3;
      font-weight: bold;
    }
    
    /* 혈압 상태 표시 라벨 */
    .bp-status {
      display: inline-block;
      padding: 3px 6px;
      border-radius: 3px;
      font-size: 0.8rem;
      color: white;
      margin-left: 10px;
    }
    
    .bp-status-high {
      background-color: #f44336;
    }
    
    .bp-status-elevated {
      background-color: #ff9800;
    }
    
    .bp-status-normal {
      background-color: #4caf50;
    }
    
    .bp-status-low {
      background-color: #2196f3;
    }
    
    /* 통계 카드 스타일 */
    .bp-stats {
      display: flex;
      flex-wrap: wrap;
      gap: 15px;
      margin-top: 15px;
      margin-bottom: 20px;
    }
    
    .bp-stat-item {
      background-color: white;
      padding: 15px;
      border-radius: 8px;
      box-shadow: 0 2px 5px rgba(0,0,0,0.05);
      flex: 1;
      min-width: 120px;
      text-align: center;
    }
    
    .bp-stat-value {
      font-size: 1.5rem;
      font-weight: bold;
      margin-bottom: 5px;
    }
    
    .bp-stat-label {
      font-size: 0.9rem;
      color: #666;
    }
    
    /* 혈압 달력 날짜 배경색 스타일 */
    .bp-date-color-event {
      opacity: 0.3 !important;
    }

    /* 혈압 날짜 컨텍스트 메뉴 스타일 */
    .bp-date-context-menu {
      min-width: 120px;
    }

    .bp-date-context-menu div:hover {
      background-color: #f0f0f0;
    }
  `;
  
  // 이미 존재하는 스타일이 있으면 제거
  const existingStyle = document.getElementById('bp-page-styles');
  if (existingStyle) {
    existingStyle.remove();
  }
  
  document.head.appendChild(styleEl);
}

// 혈압 데이터 불러오기
async function loadBloodPressures() {
  try {
    const bpRef = db.collection("bloodpressures");
    const snapshot = await cachedCollection("bloodpressures", { orderBy: "date", dir: "desc" });
    
    const bloodPressures = [];
    snapshot.forEach(doc => {
      const bp = doc.data();
      bloodPressures.push({
        id: doc.id,
        systolic: bp.systolic,
        diastolic: bp.diastolic,
        pulse: bp.pulse || null,
        date: bp.date.toDate(),
        notes: bp.notes || ''
      });
    });
    
    // 데이터 캐싱
    window.cachedBloodPressures = bloodPressures;
    
    // 뷰에 따라 다르게 표시
    if (currentView === 'list') {
      renderBloodPressureList(bloodPressures);
    } else {
      renderBloodPressureCalendar(bloodPressures);
    }
    
    // 차트 그리기 (항상 표시)
    renderBloodPressureChart(bloodPressures);
  } catch (error) {
    console.error("혈압 기록을 불러오는 중 오류 발생:", error);
    document.getElementById("bp-list").innerHTML = '<p>혈압 기록을 불러오는 중 오류가 발생했습니다.</p>';
  }
}

// 혈압 리스트 렌더링
function renderBloodPressureList(bloodPressures) {
  const bpListEl = document.getElementById("bp-list");
  
  if (bloodPressures.length === 0) {
    bpListEl.innerHTML = '<p>등록된 혈압 기록이 없습니다.</p>';
    return;
  }
  
  let html = '<ul class="list-container">';
  
bloodPressures.forEach(bp => {
    // 혈압 상태 판단
    const bpStatus = getBpStatus(bp.systolic, bp.diastolic);
    const statusClass = `bp-status-${bpStatus.toLowerCase()}`;
    const statusText = getBpStatusText(bpStatus);
    
    html += `
      <li class="list-item" data-id="${bp.id}" onclick="showBloodPressureDetail('${bp.id}')">
        <div class="list-item-content">
          <div class="list-item-title">
            <span class="${getSystolicClass(bp.systolic)}">${bp.systolic}</span> / 
            <span class="${getDiastolicClass(bp.diastolic)}">${bp.diastolic}</span> mmHg
            <span class="bp-status ${statusClass}">${statusText}</span>
          </div>
          <div class="list-item-date">${formatDate(bp.date, true)}</div>
          ${bp.pulse ? `<div class="list-item-pulse">맥박: ${bp.pulse} bpm</div>` : ''}
          ${bp.notes ? `<div class="list-item-description">${bp.notes}</div>` : ''}
        </div>
        <div class="list-item-actions" onclick="event.stopPropagation()">
          <button onclick="editBloodPressure('${bp.id}')">수정</button>
          <button onclick="deleteBloodPressure('${bp.id}')">삭제</button>
        </div>
      </li>
    `;
  });
  
  html += '</ul>';
  bpListEl.innerHTML = html;
}

// 혈압 상태 판단 함수
function getBpStatus(systolic, diastolic) {
  if (systolic >= 180 || diastolic >= 120) {
    return "HIGH"; // 고혈압 위기
  } else if (systolic >= 140 || diastolic >= 90) {
    return "HIGH"; // 고혈압 단계 2
  } else if (systolic >= 130 || diastolic >= 80) {
    return "ELEVATED"; // 고혈압 단계 1
  } else if (systolic >= 120 && diastolic < 80) {
    return "ELEVATED"; // 주의 혈압
  } else if (systolic < 90 || diastolic < 60) {
    return "LOW"; // 저혈압
  } else {
    return "NORMAL"; // 정상
  }
}

// 혈압 상태 텍스트 반환 함수
function getBpStatusText(status) {
  switch(status) {
    case "HIGH":
      return "고혈압";
    case "ELEVATED":
      return "주의";
    case "NORMAL":
      return "정상";
    case "LOW":
      return "저혈압";
    default:
      return "정상";
  }
}

// 수축기 혈압 클래스 반환 함수
function getSystolicClass(systolic) {
  if (systolic >= 140) {
    return "bp-value-high";
  } else if (systolic >= 120) {
    return "bp-value-elevated";
  } else if (systolic < 90) {
    return "bp-value-low";
  } else {
    return "bp-value-normal";
  }
}

// 이완기 혈압 클래스 반환 함수
function getDiastolicClass(diastolic) {
  if (diastolic >= 90) {
    return "bp-value-high";
  } else if (diastolic >= 80) {
    return "bp-value-elevated";
  } else if (diastolic < 60) {
    return "bp-value-low";
  } else {
    return "bp-value-normal";
  }
}

// 혈압 날짜 배경색 설정 함수
function showBpDateColorForm(date) {
  const formattedDate = formatDate(date);
  
  const modalContent = `
    <form id="bp-date-color-form">
      <div class="form-group">
        <label>
          <input type="checkbox" id="bp-color-toggle" checked>
          이 날짜에 배경색 표시 (파스텔 핑크)
        </label>
      </div>
      <div class="form-group">
        <label for="bp-color-note">메모 (선택사항)</label>
        <input type="text" id="bp-color-note" placeholder="이 날짜 메모">
      </div>
    </form>
  `;
  
  showModal(`${formattedDate} 배경색 설정`, modalContent, function() {
    const isChecked = document.getElementById('bp-color-toggle').checked;
    const note = document.getElementById('bp-color-note').value;
    
    if (isChecked) {
      saveBpDateBackground(date, '#ffc0cb', note); // 파스텔 핑크색
    } else {
      deleteBpDateBackground(date);
    }
  });
}

// 혈압 날짜 배경색 저장
async function saveBpDateBackground(date, color, note = '') {
  try {
    const formattedDate = formatDate(date);
    
    const colorData = {
      date: firebase.firestore.Timestamp.fromDate(new Date(formattedDate)),
      color: color,
      note: note,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    const bpDateColorRef = db.collection("bpDateColors");
    const snapshot = await bpDateColorRef.where("date", "==", colorData.date).get();
    
    if (snapshot.empty) {
      await bpDateColorRef.add(colorData);
    } else {
      await bpDateColorRef.doc(snapshot.docs[0].id).update({
        color: color,
        note: note,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
    
    closeModal();
    loadBloodPressures();
    
  } catch (error) {
    console.error("혈압 날짜 배경색 저장 중 오류 발생:", error);
    alert('날짜 배경색을 저장하는 중 오류가 발생했습니다.');
  }
}

// 혈압 날짜 배경색 삭제
async function deleteBpDateBackground(date) {
  try {
    const formattedDate = formatDate(date);
    const dateTs = firebase.firestore.Timestamp.fromDate(new Date(formattedDate));
    
    const bpDateColorRef = db.collection("bpDateColors");
    const snapshot = await bpDateColorRef.where("date", "==", dateTs).get();
    
    if (!snapshot.empty) {
      await bpDateColorRef.doc(snapshot.docs[0].id).delete();
    }
    
    closeModal();
    loadBloodPressures();
    
  } catch (error) {
    console.error("혈압 날짜 배경색 삭제 중 오류 발생:", error);
    alert('날짜 배경색을 삭제하는 중 오류가 발생했습니다.');
  }
}

// 혈압 날짜 배경색 로드
async function loadBpDateColors() {
  try {
    const snapshot = await cachedCollection("bpDateColors");
    
    const dateColors = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      dateColors.push({
        id: doc.id,
        date: data.date.toDate(),
        color: data.color,
        note: data.note || ''
      });
    });
    
    return dateColors;
  } catch (error) {
    console.error("혈압 날짜 배경색 로드 중 오류 발생:", error);
    return [];
  }
}

// 혈압 달력 렌더링
function renderBloodPressureCalendar(bloodPressures) {
  const calendarEl = document.getElementById('bp-calendar');
  
  if (!calendarEl) return;
  
  // 날짜 배경색 로드 및 캘린더 초기화
  loadBpDateColors().then(dateColors => {
    // 달력에 표시할 이벤트 형식으로 변환
    const events = bloodPressures.map(bp => {
      // 혈압 상태에 따른 색상 지정
      const status = getBpStatus(bp.systolic, bp.diastolic);
      let color = '#4caf50'; // 기본 정상 색상
      
      if (status === 'HIGH') {
        color = '#f44336'; // 고혈압
      } else if (status === 'ELEVATED') {
        color = '#ff9800'; // 주의
      } else if (status === 'LOW') {
        color = '#2196f3'; // 저혈압
      }
      
      return {
        id: bp.id,
        title: `${bp.systolic}/${bp.diastolic} mmHg`,
        start: bp.date,
        allDay: true,
        backgroundColor: color,
        borderColor: color
      };
    });
    
    // 날짜 배경색을 이벤트로 추가
    const colorEvents = dateColors.map(dc => ({
      start: formatDate(dc.date),
      end: formatDate(dc.date),
      display: 'background',
      color: dc.color,
      classNames: ['bp-date-color-event'],
      extendedProps: {
        isDateColor: true,
        note: dc.note
      }
    }));
    
    // FullCalendar 초기화
    window.bpCalendar = createPersistentCalendar('bp', calendarEl, {
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,listMonth'
      },
      initialView: 'dayGridMonth',
      locale: 'ko',
    firstDay: 1, // 주의 시작: 월요일
      events: [...events, ...colorEvents],
      eventClick: function(info) {
        if (!info.event.extendedProps.isDateColor) {
          showBloodPressureDetail(info.event.id);
        }
      },
      dateClick: function(info) {
        // 날짜를 클릭했을 때 컨텍스트 메뉴 표시
        const dateStr = info.dateStr;
        const menuItems = [
          {
            label: '혈압 기록',
            action: () => showAddBloodPressureForm(dateStr)
          },
          {
            label: '배경색 설정',
            action: () => showBpDateColorForm(new Date(dateStr))
          }
        ];
        
        // 해당 날짜에 이미 배경색이 있는지 확인
        const hasColorBackground = dateColors.some(dc => 
          formatDate(dc.date) === dateStr);
        
        if (hasColorBackground) {
          menuItems.push({
            label: '배경색 삭제',
            action: () => {
              if (confirm('이 날짜의 배경색 설정을 삭제하시겠습니까?')) {
                deleteBpDateBackground(new Date(dateStr));
              }
            }
          });
        }
        
        // 컨텍스트 메뉴 생성
        const menu = document.createElement('div');
        menu.className = 'bp-date-context-menu';
        menu.style.position = 'absolute';
        menu.style.left = info.jsEvent.pageX + 'px';
        menu.style.top = info.jsEvent.pageY + 'px';
        menu.style.backgroundColor = 'white';
        menu.style.padding = '5px';
        menu.style.border = '1px solid #ccc';
        menu.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
        menu.style.zIndex = '9999';
        menu.style.borderRadius = '5px';
        
        menuItems.forEach(item => {
          const menuItem = document.createElement('div');
          menuItem.textContent = item.label;
          menuItem.style.padding = '8px 12px';
          menuItem.style.cursor = 'pointer';
          menuItem.style.borderBottom = '1px solid #eee';
          menuItem.addEventListener('click', () => {
            document.body.removeChild(menu);
            item.action();
          });
          menuItem.addEventListener('mouseover', () => {
            menuItem.style.backgroundColor = '#f5f5f5';
          });
          menuItem.addEventListener('mouseout', () => {
            menuItem.style.backgroundColor = 'transparent';
          });
          menu.appendChild(menuItem);
        });
        
        // 마지막 항목의 border 제거
        const lastItem = menu.lastChild;
        if (lastItem) {
          lastItem.style.borderBottom = 'none';
        }
        
        document.body.appendChild(menu);
        
        // 메뉴 외부 클릭 시 메뉴 제거
        document.addEventListener('click', function closeMenu(e) {
          if (!menu.contains(e.target)) {
            if (document.body.contains(menu)) {
              document.body.removeChild(menu);
            }
            document.removeEventListener('click', closeMenu);
          }
        });
      }
    });
  }).catch(error => {
    console.error("혈압 날짜 배경색 로드 중 오류 발생:", error);
  });
}

// 혈압 차트 렌더링
function renderBloodPressureChart(bloodPressures) {
  const chartEl = document.getElementById('bp-chart');
  const chartContainerEl = chartEl ? chartEl.closest('.chart-container') : null;
  
  if (!chartEl || !chartContainerEl || bloodPressures.length === 0) return;
  
  // 차트 높이 명시적 설정
  chartContainerEl.style.height = '400px';
  
  // 차트용 데이터 가공
  bloodPressures.sort((a, b) => a.date - b.date);
  
  // 기간 설정 가져오기
  const periodSelect = document.getElementById('bp-period');
  const periodValue = periodSelect ? periodSelect.value : '3'; // 기본값은 3개월
  
  // 선택된 기간에 따라 데이터 필터링
  let filteredBps = [...bloodPressures]; // 원본 배열 복사
  
  if (periodValue === 'custom') {
    // 사용자 정의 기간
    const startDateInput = document.getElementById('bp-start-date');
    const endDateInput = document.getElementById('bp-end-date');
    
    if (startDateInput && startDateInput.value) {
      const startDate = new Date(startDateInput.value);
      startDate.setHours(0, 0, 0, 0);
      filteredBps = filteredBps.filter(w => w.date >= startDate);
    }
    
    if (endDateInput && endDateInput.value) {
      const endDate = new Date(endDateInput.value);
      endDate.setHours(23, 59, 59, 999);
      filteredBps = filteredBps.filter(w => w.date <= endDate);
    }
  } else {
    // 미리 정의된 기간
    const months = parseInt(periodValue);
    
    if (months > 0) {
      const cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() - months);
      filteredBps = filteredBps.filter(w => w.date >= cutoffDate);
    }
    // periodValue가 0이면 전체 데이터 사용 (필터링하지 않음)
  }
  
  // 빈 데이터 처리
  if (filteredBps.length === 0) {
    // 데이터가 없으면 차트 영역에 메시지 표시
    chartEl.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">선택한 기간에 데이터가 없습니다.</div>';
    return;
  }
  
  // 차트 데이터 설정
  const labels = filteredBps.map(bp => formatDate(bp.date));
  const systolicData = filteredBps.map(bp => bp.systolic);
  const diastolicData = filteredBps.map(bp => bp.diastolic);
  const pulseData = filteredBps.map(bp => bp.pulse);
  
  // 차트 데이터셋
  const datasets = [
    {
      label: '수축기(SYS)',
      data: systolicData,
      borderColor: '#f44336',
      backgroundColor: 'rgba(244, 67, 54, 0.1)',
      borderWidth: 2,
      fill: false,
      tension: 0.2
    },
    {
      label: '이완기(DIA)',
      data: diastolicData,
      borderColor: '#2196f3',
      backgroundColor: 'rgba(33, 150, 243, 0.1)',
      borderWidth: 2,
      fill: false,
      tension: 0.2
    }
  ];
  
  // 맥박 데이터가 있는 경우 추가
  if (pulseData.some(pulse => pulse !== null)) {
    datasets.push({
      label: '맥박(PULSE)',
      data: pulseData,
      borderColor: '#4caf50',
      backgroundColor: 'rgba(76, 175, 80, 0.1)',
      borderWidth: 2,
      fill: false,
      tension: 0.2,
      yAxisID: 'y1'
    });
  }
  
  // 이전 차트 제거
  if (window.bpChart) {
    window.bpChart.destroy();
  }
  
  // 차트 옵션
  const chartOptions = {
    scales: {
      y: {
        display: true,
        position: 'left',
        beginAtZero: false,
        title: {
          display: true,
          text: '혈압 (mmHg)'
        },
        min: Math.min(...diastolicData) - 10,
        max: Math.max(...systolicData) + 10,
        grid: {
          color: 'rgba(0, 0, 0, 0.05)'
        }
      },
      y1: {
        display: pulseData.some(pulse => pulse !== null),
        position: 'right',
        beginAtZero: false,
        title: {
          display: true,
          text: '맥박 (bpm)'
        },
        min: 40,
        max: 120,
        grid: {
          display: false
        }
      }
    },
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      tooltip: {
        mode: 'index',
        intersect: false
      },
      legend: {
        position: 'top',
      }
    }
  };
  
  // 새 차트 생성
  window.bpChart = new Chart(chartEl, {
    type: 'line',
    data: {
      labels: labels,
      datasets: datasets
    },
    options: chartOptions
  });
  
  // 혈압 통계 업데이트
  updateBloodPressureStats(filteredBps);
}

// 혈압 통계 업데이트
function updateBloodPressureStats(bloodPressures) {
  if (!bloodPressures || bloodPressures.length === 0) return;
  
  // 통계를 표시할 컨테이너 확인 또는 생성
  const chartContainer = document.querySelector('.bp-chart');
  let statsContainer = document.querySelector('.bp-stats');
  
  if (!statsContainer && chartContainer) {
    // 통계 컨테이너가 없으면 생성
    statsContainer = document.createElement('div');
    statsContainer.className = 'bp-stats';
    chartContainer.parentNode.insertBefore(statsContainer, chartContainer);
  }
  
  if (!statsContainer) return;
  
  // 데이터 가공
  const systolicValues = bloodPressures.map(bp => bp.systolic);
  const diastolicValues = bloodPressures.map(bp => bp.diastolic);
  const pulseValues = bloodPressures.filter(bp => bp.pulse !== null).map(bp => bp.pulse);
  
  // 최근 혈압
  const latestBp = bloodPressures[bloodPressures.length - 1];
  const latestStatus = getBpStatusText(getBpStatus(latestBp.systolic, latestBp.diastolic));
  
  // 평균 계산
  const avgSystolic = Math.round(systolicValues.reduce((a, b) => a + b, 0) / systolicValues.length);
  const avgDiastolic = Math.round(diastolicValues.reduce((a, b) => a + b, 0) / diastolicValues.length);
  const avgPulse = pulseValues.length > 0 
    ? Math.round(pulseValues.reduce((a, b) => a + b, 0) / pulseValues.length)
    : 'N/A';
  
  // 최대/최소
  const maxSystolic = Math.max(...systolicValues);
  const minSystolic = Math.min(...systolicValues);
  const maxDiastolic = Math.max(...diastolicValues);
  const minDiastolic = Math.min(...diastolicValues);
  
  // 고혈압 비율
  const highBpCount = bloodPressures.filter(bp => 
    getBpStatus(bp.systolic, bp.diastolic) === 'HIGH').length;
  const highBpPercent = Math.round((highBpCount / bloodPressures.length) * 100);
  
  // 통계 HTML 생성
  statsContainer.innerHTML = `
    <div class="bp-stat-item">
      <div class="bp-stat-value">${avgSystolic}/${avgDiastolic}</div>
      <div class="bp-stat-label">평균 혈압</div>
    </div>
    <div class="bp-stat-item">
      <div class="bp-stat-value">${maxSystolic}/${maxDiastolic}</div>
      <div class="bp-stat-label">최고 혈압</div>
    </div>
    <div class="bp-stat-item">
      <div class="bp-stat-value">${minSystolic}/${minDiastolic}</div>
      <div class="bp-stat-label">최저 혈압</div>
    </div>
    <div class="bp-stat-item">
      <div class="bp-stat-value">${avgPulse}</div>
      <div class="bp-stat-label">평균 맥박</div>
    </div>
    <div class="bp-stat-item">
      <div class="bp-stat-value">${highBpPercent}%</div>
      <div class="bp-stat-label">고혈압 비율</div>
    </div>
  `;
}

// 혈압 차트 업데이트 함수
function updateBloodPressureChart() {
  // 이미 불러온 혈압 데이터가 있으면 재사용, 없으면 다시 불러오기
  if (window.cachedBloodPressures && window.cachedBloodPressures.length > 0) {
    renderBloodPressureChart(window.cachedBloodPressures);
  } else {
    loadBloodPressures();
  }
}

// 사용자 정의 기간 적용 함수
function applyCustomBpPeriod() {
  const startDateInput = document.getElementById('bp-start-date');
  const endDateInput = document.getElementById('bp-end-date');
  
  // 날짜 유효성 검사
  if (startDateInput.value && endDateInput.value) {
    const startDate = new Date(startDateInput.value);
    const endDate = new Date(endDateInput.value);
    
    if (startDate > endDate) {
      alert('시작일은 종료일보다 이전이어야 합니다.');
      return;
    }
  }
  
  // 차트 업데이트
  updateBloodPressureChart();
}

// 기간 설정 UI 초기화 함수
function initBpDateRangeUI() {
  // 사용자 정의 기간 UI 초기 숨김
  const customPeriod = document.querySelector('.custom-period');
  if (customPeriod) {
    customPeriod.style.display = 'none';
  }
  
  // 기간 선택 이벤트 리스너
  const periodSelector = document.getElementById('bp-period');
  if (periodSelector) {
    periodSelector.addEventListener('change', function() {
      const customPeriod = document.querySelector('.custom-period');
      if (this.value === 'custom') {
        customPeriod.style.display = 'flex';
      } else {
        customPeriod.style.display = 'none';
        updateBloodPressureChart();
      }
    });
  }
}

// 혈압 추가 폼 표시
function showAddBloodPressureForm(dateStr = null) {
  // 날짜 기본값 설정
  let formattedDate = '';
  if (dateStr) {
    formattedDate = dateStr;
  } else {
    formattedDate = formatDate(new Date());
  }
  
  const modalContent = `
    <form id="bp-form">
      <div class="form-group">
        <label for="systolic">수축기 혈압 (SYS, mmHg)</label>
        <input type="number" id="systolic" min="60" max="250" required>
      </div>
      <div class="form-group">
        <label for="diastolic">이완기 혈압 (DIA, mmHg)</label>
        <input type="number" id="diastolic" min="40" max="150" required>
      </div>
      <div class="form-group">
        <label for="pulse">맥박 (PULSE, bpm) (선택사항)</label>
        <input type="number" id="pulse" min="40" max="200">
      </div>
      <div class="form-group">
        <label for="bp-date">날짜</label>
        <input type="date" id="bp-date" value="${formattedDate}" required>
      </div>
      <div class="form-group">
        <label for="bp-time">시간</label>
        <input type="time" id="bp-time" value="${new Date().toTimeString().slice(0, 5)}" required>
      </div>
      <div class="form-group">
        <label for="bp-notes">메모 (선택사항)</label>
        <textarea id="bp-notes" rows="3" placeholder="추가 메모를 입력하세요..."></textarea>
      </div>
    </form>
  `;
  
  showModal("혈압 기록", modalContent, saveBloodPressure);
}

// 혈압 저장
async function saveBloodPressure() {
  const systolicEl = document.getElementById('systolic');
  const diastolicEl = document.getElementById('diastolic');
  const pulseEl = document.getElementById('pulse');
  const dateEl = document.getElementById('bp-date');
  const timeEl = document.getElementById('bp-time');
  const notesEl = document.getElementById('bp-notes');
  
  if (!systolicEl.value || !diastolicEl.value || !dateEl.value || !timeEl.value) {
    alert('수축기 혈압, 이완기 혈압, 날짜, 시간은 필수 입력 항목입니다.');
    return;
  }
  
  try {
    // 날짜와 시간 결합
    const dateTime = new Date(dateEl.value + 'T' + timeEl.value);
    
    // 혈압 데이터 구성
    const bpData = {
      systolic: parseInt(systolicEl.value),
      diastolic: parseInt(diastolicEl.value),
      date: firebase.firestore.Timestamp.fromDate(dateTime),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    // 선택적 필드 추가
    if (pulseEl.value) {
      bpData.pulse = parseInt(pulseEl.value);
    }
    
    if (notesEl.value.trim()) {
      bpData.notes = notesEl.value.trim();
    }
    
    // Firestore에 저장
    await db.collection("bloodpressures").add(bpData);
    
    // 모달 닫기
    closeModal();
    
    // 혈압 목록 새로고침
    loadBloodPressures();
  } catch (error) {
    console.error("혈압 저장 중 오류 발생:", error);
    alert('혈압을 저장하는 중 오류가 발생했습니다.');
  }
}

// 혈압 상세 정보 표시
async function showBloodPressureDetail(bpId) {
  try {
    const bpDoc = await db.collection("bloodpressures").doc(bpId).get();
    
    if (!bpDoc.exists) {
      alert('혈압 기록을 찾을 수 없습니다.');
      return;
    }
    
    const bp = bpDoc.data();
    const bpDate = bp.date.toDate();
    
    // 혈압 상태 판단
    const bpStatus = getBpStatus(bp.systolic, bp.diastolic);
    const statusClass = `bp-status-${bpStatus.toLowerCase()}`;
    const statusText = getBpStatusText(bpStatus);
    
    // 모달 내용 구성
    const modalContent = `
      <div class="bp-detail">
        <div class="bp-detail-header">
          <h3>
            <span class="${getSystolicClass(bp.systolic)}">${bp.systolic}</span> / 
            <span class="${getDiastolicClass(bp.diastolic)}">${bp.diastolic}</span> mmHg
            <span class="bp-status ${statusClass}">${statusText}</span>
          </h3>
          <div class="bp-detail-date">${formatDate(bpDate, true)}</div>
        </div>
        
        ${bp.pulse ? `
        <div class="bp-detail-item">
          <span class="bp-detail-label">맥박:</span>
          <span class="bp-detail-value">${bp.pulse} bpm</span>
        </div>
        ` : ''}
        
        ${bp.notes ? `
        <div class="bp-detail-item">
          <span class="bp-detail-label">메모:</span>
          <div class="bp-detail-notes">${bp.notes}</div>
        </div>
        ` : ''}
      </div>
    `;
    
    // 모달 표시 - 수정/삭제 버튼 포함
    const modalContainer = document.getElementById("modal-container");
    
    modalContainer.innerHTML = `
      <div class="modal-overlay" onclick="if(event.target === this) closeModal()">
        <div class="modal">
          <div class="modal-header">
            <h2 class="modal-title">혈압 상세 정보</h2>
            <button class="modal-close" onclick="closeModal()">×</button>
          </div>
          <div class="modal-content">
            ${modalContent}
          </div>
          <div class="modal-actions">
            <button onclick="closeModal()">닫기</button>
            <button onclick="editBloodPressure('${bpId}')">수정</button>
            <button onclick="deleteBloodPressure('${bpId}')" style="background-color: #f44336;">삭제</button>
          </div>
        </div>
      </div>
    `;
    
    isModalOpen = true;
    
    // 모달 스타일 추가
    const styleEl = document.createElement('style');
    styleEl.id = 'bp-detail-styles';
    styleEl.textContent = `
      .bp-detail {
        padding: 10px;
      }
      
      .bp-detail-header {
        margin-bottom: 15px;
      }
      
      .bp-detail-date {
        color: #666;
        font-size: 0.9rem;
        margin-top: 5px;
      }
      
      .bp-detail-item {
        margin-bottom: 15px;
        display: flex;
        align-items: flex-start;
      }
      
      .bp-detail-label {
        font-weight: bold;
        min-width: 80px;
        margin-right: 10px;
      }
      
      .bp-detail-value {
        flex: 1;
      }
      
      .bp-detail-notes {
        flex: 1;
        background-color: #f9f9f9;
        padding: 10px;
        border-radius: 5px;
        white-space: pre-line;
      }
    `;
    
    // 이미 존재하는 스타일이 있으면 제거
    const existingStyle = document.getElementById('bp-detail-styles');
    if (existingStyle) {
      existingStyle.remove();
    }
    
    document.head.appendChild(styleEl);
  } catch (error) {
    console.error("혈압 상세 정보 로드 중 오류 발생:", error);
    alert('혈압 상세 정보를 불러오는 중 오류가 발생했습니다.');
  }
}

// 혈압 편집 폼 표시
async function editBloodPressure(bpId) {
  try {
    const bpDoc = await db.collection("bloodpressures").doc(bpId).get();
    
    if (!bpDoc.exists) {
      alert('혈압 기록을 찾을 수 없습니다.');
      return;
    }
    
    const bp = bpDoc.data();
    const bpDate = bp.date.toDate();
    
    // 날짜와 시간 분리
    const formattedDate = formatDate(bpDate);
    const formattedTime = bpDate.toTimeString().slice(0, 5);
    
    const modalContent = `
      <form id="bp-form">
        <input type="hidden" id="bp-id" value="${bpId}">
        <div class="form-group">
          <label for="systolic">수축기 혈압 (SYS, mmHg)</label>
          <input type="number" id="systolic" min="60" max="250" value="${bp.systolic}" required>
        </div>
        <div class="form-group">
          <label for="diastolic">이완기 혈압 (DIA, mmHg)</label>
          <input type="number" id="diastolic" min="40" max="150" value="${bp.diastolic}" required>
        </div>
        <div class="form-group">
          <label for="pulse">맥박 (PULSE, bpm) (선택사항)</label>
          <input type="number" id="pulse" min="40" max="200" value="${bp.pulse !== undefined ? bp.pulse : ''}">
        </div>
        <div class="form-group">
          <label for="bp-date">날짜</label>
          <input type="date" id="bp-date" value="${formattedDate}" required>
        </div>
        <div class="form-group">
          <label for="bp-time">시간</label>
          <input type="time" id="bp-time" value="${formattedTime}" required>
        </div>
        <div class="form-group">
          <label for="bp-notes">메모 (선택사항)</label>
          <textarea id="bp-notes" rows="3" placeholder="추가 메모를 입력하세요...">${bp.notes || ''}</textarea>
        </div>
      </form>
    `;
    
    showModal("혈압 기록 수정", modalContent, updateBloodPressure);
  } catch (error) {
    console.error("혈압 기록 로드 중 오류 발생:", error);
    alert('혈압 기록을 불러오는 중 오류가 발생했습니다.');
  }
}

// 혈압 업데이트
async function updateBloodPressure() {
  const bpId = document.getElementById('bp-id').value;
  const systolicEl = document.getElementById('systolic');
  const diastolicEl = document.getElementById('diastolic');
  const pulseEl = document.getElementById('pulse');
  const dateEl = document.getElementById('bp-date');
  const timeEl = document.getElementById('bp-time');
  const notesEl = document.getElementById('bp-notes');
  
  if (!systolicEl.value || !diastolicEl.value || !dateEl.value || !timeEl.value) {
    alert('수축기 혈압, 이완기 혈압, 날짜, 시간은 필수 입력 항목입니다.');
    return;
  }
  
  try {
    // 날짜와 시간 결합
    const dateTime = new Date(dateEl.value + 'T' + timeEl.value);
    
    // 혈압 데이터 구성
    const bpData = {
      systolic: parseInt(systolicEl.value),
      diastolic: parseInt(diastolicEl.value),
      date: firebase.firestore.Timestamp.fromDate(dateTime),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    // 선택적 필드 추가 또는 삭제
    if (pulseEl.value) {
      bpData.pulse = parseInt(pulseEl.value);
    } else {
      bpData.pulse = firebase.firestore.FieldValue.delete();
    }
    
    if (notesEl.value.trim()) {
      bpData.notes = notesEl.value.trim();
    } else {
      bpData.notes = firebase.firestore.FieldValue.delete();
    }
    
    // Firestore에 업데이트
    await db.collection("bloodpressures").doc(bpId).update(bpData);
    
    // 모달 닫기
    closeModal();
    
    // 혈압 목록 새로고침
    loadBloodPressures();
  } catch (error) {
    console.error("혈압 업데이트 중 오류 발생:", error);
    alert('혈압을 업데이트하는 중 오류가 발생했습니다.');
  }
}

// 혈압 삭제
async function deleteBloodPressure(bpId) {
  if (confirm('정말로 이 혈압 기록을 삭제하시겠습니까?')) {
    try {
      await db.collection("bloodpressures").doc(bpId).delete();
      loadBloodPressures(); // 목록 새로고침
    } catch (error) {
      console.error("혈압 삭제 중 오류 발생:", error);
      alert('혈압 기록을 삭제하는 중 오류가 발생했습니다.');
    }
  }
}

// =========== 검색 기능 ===========

// 검색 페이지 렌더링
function renderSearchPage(container) {
  container.innerHTML = `
    <div class="page-container">
      <div class="page-header">
        <h1>검색</h1>
      </div>
      <div class="card">
        <div class="search-form">
          <input 
            type="text" 
            id="search-input" 
            placeholder="검색어를 입력하세요" 
            onkeyup="if(event.key === 'Enter') performSearch()"
          />
          <button onclick="performSearch()">검색</button>
          <button onclick="toggleAdvancedSearch()" id="advanced-search-toggle">
            <i class="fas fa-cog"></i> 고급 검색
          </button>
        </div>
        
        <div id="advanced-search-options" style="display: none;">
          <div class="search-options">
            <div class="form-group">
              <label>데이터 유형</label>
              <div class="checkbox-group">
                <label><input type="checkbox" name="search-type" value="events" checked> 일정</label>
                <label><input type="checkbox" name="search-type" value="todos" checked> 할 일</label>
                <label><input type="checkbox" name="search-type" value="diaries" checked> 일기</label>
                <label><input type="checkbox" name="search-type" value="notes" checked> 메모</label>
                <label><input type="checkbox" name="search-type" value="habits" checked> 습관</label>
                <label><input type="checkbox" name="search-type" value="transactions" checked> 지출/수입</label>
                <label><input type="checkbox" name="search-type" value="weights" checked> 체중</label>
                <label><input type="checkbox" name="search-type" value="goals" checked> 목표</label>
              </div>
            </div>
            
            <div class="form-group">
              <label>날짜 범위</label>
              <div class="date-range">
                <input type="date" id="search-start-date" placeholder="시작일">
                <span>~</span>
                <input type="date" id="search-end-date" placeholder="종료일">
              </div>
            </div>
            
            <div class="form-group search-buttons">
              <button onclick="resetAdvancedSearch()">초기화</button>
            </div>
          </div>
        </div>
        
        <div id="search-results">
          <p>검색 결과가 여기에 표시됩니다.</p>
        </div>
      </div>
    </div>
  `;
  
  // 스타일 추가
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    .search-form {
      display: flex;
      gap: 10px;
      margin-bottom: 15px;
      flex-wrap: wrap;
    }
    
    .search-form input[type="text"] {
      flex: 1;
      min-width: 200px;
    }
    
    #advanced-search-options {
      background-color: #f9f9f9;
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 20px;
      border: 1px solid #e0e0e0;
    }
    
    .checkbox-group {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin: 10px 0;
    }
    
    .checkbox-group label {
      display: flex;
      align-items: center;
      gap: 5px;
      margin-right: 10px;
      min-width: 80px;
    }
    
    .date-range {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 10px 0;
    }
    
    .date-range input {
      flex: 1;
    }
    
    .search-buttons {
      margin-top: 15px;
      display: flex;
      justify-content: flex-end;
    }
    
    @media screen and (max-width: 768px) {
      .checkbox-group {
        flex-direction: column;
        align-items: flex-start;
      }
      
      .date-range {
        flex-direction: column;
        align-items: stretch;
      }
      
      .date-range span {
        text-align: center;
      }
    }
  `;
  document.head.appendChild(styleEl);
}

// 검색 수행
async function performSearch() {
  const searchInput = document.getElementById("search-input").value.trim().toLowerCase();
  if (!searchInput) {
    document.getElementById("search-results").innerHTML = "<p>검색어를 입력하세요.</p>";
    return;
  }

  document.getElementById("search-results").innerHTML = "<p>검색 중...</p>";

  try {
    const results = [];

// app.js 파일의 performSearch 함수 내부 - 일정 검색 부분
const eventsSnapshot = await cachedCollection("events");
eventsSnapshot.forEach(doc => {
  const event = doc.data();
  
  // event.title이 undefined인 경우를 대비하여 안전하게 처리
  const titleMatch = event.title && event.title.toLowerCase().includes(searchInput);
  const descMatch = event.description && event.description.toLowerCase().includes(searchInput);
  
  if (searchInput && (titleMatch || descMatch)) {
    results.push({
      type: "일정",
      id: doc.id,
      title: event.title || "제목 없음",
      date: formatDate(event.start),
      page: "calendar"
    });
  }
});

// 다른 검색 부분들도 동일한 방식으로 수정해주세요

    // 할 일 검색
    const todosSnapshot = await cachedCollection("todos");
    todosSnapshot.forEach(doc => {
      const todo = doc.data();
      if (todo.title.toLowerCase().includes(searchInput) || 
          (todo.description && todo.description.toLowerCase().includes(searchInput))) {
        results.push({
          type: "할 일",
          id: doc.id,
          title: todo.title,
          date: todo.dueDate ? formatDate(todo.dueDate) : "기한 없음",
          page: "todo"
        });
      }
    });

    // 일기 검색
    const diariesSnapshot = await cachedCollection("diaries");
    diariesSnapshot.forEach(doc => {
      const diary = doc.data();
      if ((diary.content && diary.content.toLowerCase().includes(searchInput))) {
        results.push({
          type: "일기",
          id: doc.id,
          title: `${formatDate(diary.date)} 일기`,
          date: formatDate(diary.date),
          page: "diary"
        });
      }
    });

    // 메모 검색
    const notesSnapshot = await cachedCollection("notes");
    notesSnapshot.forEach(doc => {
      const note = doc.data();
      if (note.title.toLowerCase().includes(searchInput) || 
          (note.content && note.content.toLowerCase().includes(searchInput))) {
        results.push({
          type: "메모",
          id: doc.id,
          title: note.title,
          date: note.updatedAt ? formatDate(note.updatedAt) : "날짜 없음",
          page: "notes"
        });
      }
    });
    
    // 습관 검색
    const habitsSnapshot = await cachedCollection("habits");
    habitsSnapshot.forEach(doc => {
      const habit = doc.data();
      if (habit.name.toLowerCase().includes(searchInput) || 
          (habit.category && habit.category.toLowerCase().includes(searchInput))) {
        results.push({
          type: "습관",
          id: doc.id,
          title: habit.name,
          date: habit.createdAt ? formatDate(habit.createdAt) : "날짜 없음",
          page: "habits"
        });
      }
    });
    
    // 지출/수입 검색
    const transactionsSnapshot = await cachedCollection("transactions");
    transactionsSnapshot.forEach(doc => {
      const transaction = doc.data();
      const amount = transaction.amount.toString();
      const category = transaction.category || '';
      const subCategory = transaction.subCategory || '';
      const description = transaction.description || '';
      
      if (amount.includes(searchInput) || 
          category.toLowerCase().includes(searchInput) || 
          subCategory.toLowerCase().includes(searchInput) || 
          description.toLowerCase().includes(searchInput)) {
        results.push({
          type: transaction.type === 'income' ? "수입" : "지출",
          id: doc.id,
          title: `${transaction.amount.toLocaleString()}원 (${category}${subCategory ? ' > ' + subCategory : ''})`,
          date: formatDate(transaction.date),
          page: "expense"
        });
      }
    });
    
    // 체중 기록 검색
    const weightsSnapshot = await cachedCollection("weights");
    weightsSnapshot.forEach(doc => {
      const weight = doc.data();
      const weightValue = weight.weight.toString();
      const notes = weight.notes || '';
      
      if (weightValue.includes(searchInput) || notes.toLowerCase().includes(searchInput)) {
        results.push({
          type: "체중",
          id: doc.id,
          title: `${weight.weight} kg`,
          date: formatDate(weight.date),
          page: "diet"
        });
      }
    });

// 혈압 기록 검색
const bloodPressuresSnapshot = await cachedCollection("bloodpressures");
bloodPressuresSnapshot.forEach(doc => {
  const bp = doc.data();
  const systolic = bp.systolic.toString();
  const diastolic = bp.diastolic.toString();
  const notes = bp.notes || '';
  
  if (systolic.includes(searchInput) || 
      diastolic.includes(searchInput) || 
      notes.toLowerCase().includes(searchInput)) {
    results.push({
      type: "혈압",
      id: doc.id,
      title: `${bp.systolic}/${bp.diastolic} mmHg`,
      date: formatDate(bp.date),
      page: "bp"
    });
  }
});
    
    // 목표 검색
    const goalsSnapshot = await cachedCollection("goals");
    goalsSnapshot.forEach(doc => {
      const goal = doc.data();
      if (goal.title.toLowerCase().includes(searchInput) || 
          (goal.description && goal.description.toLowerCase().includes(searchInput))) {
        results.push({
          type: "목표",
          id: doc.id,
          title: goal.title,
          date: goal.createdAt ? formatDate(goal.createdAt) : "날짜 없음",
          page: "progress"
        });
      }
    });

    // 결과 표시
    if (results.length === 0) {
      document.getElementById("search-results").innerHTML = "<p>검색 결과가 없습니다.</p>";
    } else {
      let html = `<h3>검색 결과: ${results.length}건</h3><ul class="search-results-list">`;
      results.forEach(result => {
        html += `
          <li class="search-result-item">
            <div class="result-type">${result.type}</div>
            <div class="result-title">${result.title}</div>
            <div class="result-date">${result.date}</div>
            <button onclick="navigateToResult('${result.page}', '${result.id}')">이동</button>
          </li>
        `;
      });
      html += "</ul>";
      document.getElementById("search-results").innerHTML = html;
    }
  } catch (error) {
    console.error("검색 중 오류 발생:", error);
    document.getElementById("search-results").innerHTML = "<p>검색 중 오류가 발생했습니다.</p>";
  }
}
// 고급 검색 토글 함수 - 고급 검색 옵션의 표시/숨김을 전환
function toggleAdvancedSearch() {
  const advancedOptions = document.getElementById('advanced-search-options');
  const toggleButton = document.getElementById('advanced-search-toggle');
  
  if (advancedOptions.style.display === 'none') {
    // 고급 검색 옵션이 숨겨져 있으면 표시
    advancedOptions.style.display = 'block';
    toggleButton.innerHTML = '<i class="fas fa-times"></i> 기본 검색';
  } else {
    // 고급 검색 옵션이 표시되어 있으면 숨김
    advancedOptions.style.display = 'none';
    toggleButton.innerHTML = '<i class="fas fa-cog"></i> 고급 검색';
  }
}

// 고급 검색 초기화 함수 - 모든 검색 필터를 기본값으로 재설정
function resetAdvancedSearch() {
  // 모든 검색 유형 체크박스를 체크 상태로 초기화
  document.querySelectorAll('input[name="search-type"]').forEach(checkbox => {
    checkbox.checked = true;
  });
  
  // 날짜 범위 입력 필드를 비움
  document.getElementById('search-start-date').value = '';
  document.getElementById('search-end-date').value = '';
}
// 검색 결과로 이동
function navigateToResult(page, id) {
  navigateTo(page);
  
  // 페이지 로드 후 해당 항목으로 스크롤
  setTimeout(() => {
    const resultItem = document.querySelector(`[data-id="${id}"]`);
    if (resultItem) {
      resultItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
      resultItem.classList.add('highlight');
      
      // 하이라이트 효과 제거
      setTimeout(() => {
        resultItem.classList.remove('highlight');
      }, 3000);
    }
    
    // 특정 페이지별 추가 동작
    switch (page) {
      case "diary":
        viewDiary(id);
        break;
      case "notes":
        viewNote(id);
        break;
      case "habits":
        showHabitCalendar(id);
        break;
    }
  }, 500);
}

// 초기화 함수 호출
checkAuth();
// 브라우저 콘솔에 로드 완료 메시지 출력
console.log("앱 초기화가 완료되었습니다.");
// 지출 관리 페이지용 스타일 추가
function addExpensePageStyles() {
  const styleEl = document.createElement('style');
  styleEl.id = 'expense-page-styles';
  styleEl.textContent = `
    /* 월별 요약 차트 컨테이너 - 높이 증가 */
    .expense-chart {
      height: 400px !important;
      margin-bottom: 40px !important;
      overflow: visible !important;
    }
    
    /* 섹션 구분선 */
    .section-divider {
      height: 1px;
      background-color: #e0e0e0;
      margin: 30px 0;
      clear: both;
    }
    
    /* 달력 컨테이너 */
    .expense-calendar {
      margin-top: 40px;
      clear: both;
    }
    
    /* 지출/수입 금액 색상 */
    .expense-amount {
      color: #f44336;
      font-weight: bold;
    }
    
    .income-amount {
      color: #4caf50;
      font-weight: bold;
    }
    
    /* 카테고리 스타일 */
    .list-item-category {
      font-size: 0.9rem;
      color: #666;
      margin: 2px 0;
    }
  `;
  
  // 이미 존재하는 스타일이 있으면 제거
  const existingStyle = document.getElementById('expense-page-styles');
  if (existingStyle) {
    existingStyle.remove();
  }
  
  document.head.appendChild(styleEl);
}

// 체중 관리 페이지용 스타일 추가
function addDietPageStyles() {
  const styleEl = document.createElement('style');
  styleEl.id = 'diet-page-styles';
  styleEl.textContent = `
    /* 체중 차트 컨테이너 - 높이 증가 */
    .weight-chart {
      height: 400px !important;
      margin-bottom: 40px !important;
      overflow: visible !important;
    }
    
    /* 섹션 구분선 */
    .section-divider {
      height: 1px;
      background-color: #e0e0e0;
      margin: 30px 0;
      clear: both;
    }
    
    /* 달력 컨테이너 */
    .weight-calendar {
      margin-top: 40px;
      clear: both;
    }
    
    /* 체중 통계 카드 스타일 */
    .weight-stats {
      display: flex;
      flex-wrap: wrap;
      gap: 15px;
      margin-top: 15px;
      margin-bottom: 20px;
    }
    
    .weight-stat-item {
      background-color: white;
      padding: 15px;
      border-radius: 8px;
      box-shadow: 0 2px 5px rgba(0,0,0,0.05);
      flex: 1;
      min-width: 120px;
      text-align: center;
    }
    
    .weight-stat-value {
      font-size: 1.5rem;
      font-weight: bold;
      margin-bottom: 5px;
    }
    
    .weight-stat-label {
      font-size: 0.9rem;
      color: #666;
    }
    
    .weight-decrease {
      color: #4caf50;
    }
    
    .weight-increase {
      color: #f44336;
    }
    
    /* 달력 날짜 셀 스타일 개선 */
    .fc-daygrid-day-frame {
      min-height: 60px;
    }
    
    /* 모바일 대응 */
    @media screen and (max-width: 768px) {
      .weight-stats {
        flex-direction: column;
      }
      
      .weight-stat-item {
        width: 100%;
      }
    }
  `;
  
  // 이미 존재하는 스타일이 있으면 제거
  const existingStyle = document.getElementById('diet-page-styles');
  if (existingStyle) {
    existingStyle.remove();
  }
  
  document.head.appendChild(styleEl);
}

// 초기화 함수 호출
checkAuth();
// 브라우저 콘솔에 로드 완료 메시지 출력
console.log("앱 초기화가 완료되었습니다.");

// 지출 관리 페이지용 스타일 추가
function addExpensePageStyles() {
  const styleEl = document.createElement('style');
  styleEl.id = 'expense-page-styles';
  styleEl.textContent = `
    /* 월별 요약 차트 컨테이너 - 높이 증가 */
    .expense-chart {
      height: 400px !important;
      margin-bottom: 40px !important;
      overflow: visible !important;
    }
    
    /* 섹션 구분선 */
    .section-divider {
      height: 1px;
      background-color: #e0e0e0;
      margin: 30px 0;
      clear: both;
    }
    
    /* 달력 컨테이너 */
    .expense-calendar {
      margin-top: 40px;
      clear: both;
    }
    
    /* 지출/수입 금액 색상 */
    .expense-amount {
      color: #f44336;
      font-weight: bold;
    }
    
    .income-amount {
      color: #4caf50;
      font-weight: bold;
    }
    
    /* 카테고리 스타일 */
    .list-item-category {
      font-size: 0.9rem;
      color: #666;
      margin: 2px 0;
    }
    
    /* 여기서부터 새로운 대시보드 레이아웃 스타일을 추가합니다 */
    .expense-dashboard {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 20px;
      padding: 15px;
      background-color: #f9f9f9;
      border-radius: 8px;
    }
    
    .expense-summary-section {
      flex: 1;
      min-width: 300px;
      margin-right: 20px;
    }
    
    .chart-selector-section {
      min-width: 150px;
      display: flex;
      justify-content: flex-end;
      align-items: center;
    }
    
    .expense-stats {
      display: flex;
      flex-wrap: wrap;
      gap: 15px;
      margin-top: 10px;
    }
    
    .stat-item {
      background-color: white;
      padding: 15px;
      border-radius: 8px;
      box-shadow: 0 2px 5px rgba(0,0,0,0.05);
      flex: 1;
      min-width: 120px;
      text-align: center;
    }
    
    .summary-title {
      font-size: 1.1rem;
      font-weight: 500;
      margin-bottom: 10px;
      color: #555;
    }
    
    .stat-value {
      font-size: 1.5rem;
      font-weight: bold;
      margin-bottom: 5px;
    }
    
    .stat-label {
      font-size: 0.9rem;
      color: #666;
    }
    
    .income-value {
      color: #4caf50;
    }
    
    .expense-value {
      color: #f44336;
    }
    
    .text-success {
      color: #4caf50;
    }
    
    .text-danger {
      color: #f44336;
    }
    
    .chart-selector-wrapper {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    /* 모바일 대응 */
    @media screen and (max-width: 768px) {
      .expense-dashboard {
        flex-direction: column;
      }
      
      .expense-summary-section,
      .chart-selector-section {
        width: 100%;
        margin-right: 0;
        margin-bottom: 15px;
      }
      
      .chart-selector-section {
        justify-content: flex-start;
      }
      
      .stat-item {
        min-width: 100px;
      }
    }
  `;
  
  // 이미 존재하는 스타일이 있으면 제거
  const existingStyle = document.getElementById('expense-page-styles');
  if (existingStyle) {
    existingStyle.remove();
  }
  
  document.head.appendChild(styleEl);
}

// 지출/수입 내역 수정용 커스텀 모달 표시 함수
function showTransactionEditModal(title, content, transactionId) {
  isModalOpen = true;
  const modalContainer = document.getElementById("modal-container");
  
  modalContainer.innerHTML = `
    <div class="modal-overlay" onclick="if(event.target === this) closeModal()">
      <div class="modal">
        <div class="modal-header">
          <h2 class="modal-title">${title}</h2>
          <button class="modal-close" onclick="closeModal()">×</button>
        </div>
        <div class="modal-content">
          ${content}
        </div>
        <div class="modal-actions">
          <button onclick="closeModal()" class="cancel-button">취소</button>
          <button onclick="updateTransaction()" class="save-button">저장</button>
          <button onclick="deleteTransaction('${transactionId}')" class="delete-button" style="background-color: #f44336; color: white;">삭제</button>
        </div>
      </div>
    </div>
  `;
  
  // 입력 필드가 있으면 첫 번째 필드에 포커스
  const firstInput = modalContainer.querySelector("input, textarea, select");
  if (firstInput) {
    setTimeout(() => {
      firstInput.focus();
    }, 100);
  }
}

// 이모티콘 삽입 함수
function insertEmoji(inputId, emoji) {
  const input = document.getElementById(inputId);
  if (input) {
    const currentValue = input.value;
    const cursorPos = input.selectionStart;
    const newValue = currentValue.slice(0, cursorPos) + emoji + currentValue.slice(cursorPos);
    input.value = newValue;
    input.focus();
    input.setSelectionRange(cursorPos + emoji.length, cursorPos + emoji.length);
  }
}




