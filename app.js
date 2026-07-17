'use strict';
/* 留痕 · 个人记录反馈系统
 * 单文件 records.json · 防抖 1s 自动保存 · 多端 updatedAt 新者胜合并
 */

/* ================= utils ================= */
const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
const pad = n => String(n).padStart(2, '0');
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() :
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  }));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const debounce = (fn, ms) => { let t; const f = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; f.cancel = () => clearTimeout(t); return f; };
const WD = ['日', '一', '二', '三', '四', '五', '六'];
const dstr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => dstr(new Date());
const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const parseDate = ds => { const [y, m, d] = ds.split('-').map(Number); return new Date(y, m - 1, d); };
const wdOf = ds => WD[parseDate(ds).getDay()];
const addDays = (ds, n) => { const d = parseDate(ds); d.setDate(d.getDate() + n); return dstr(d); };
const hours1 = min => (Math.round(min / 6) / 10).toFixed(1);
const isMobile = () => window.matchMedia('(max-width:920px)').matches;

/* ================= state / store ================= */
const LS_KEY = 'liuhen.data.v1';
const LS_DEV = 'liuhen.device.v1';
const LS_DAV = 'liuhen.dav.v1';
const PALETTE = ['#C0502C', '#33587A', '#4A7051', '#B07C2A', '#7A4A6F', '#2C7A8C', '#8C3A46', '#5B6B2C', '#4C5A9C', '#6F6858'];
const DEFAULT_CATS = [
  { id: 'cat-fit', name: '健身', color: '#C0502C', order: 0, updatedAt: 0, deleted: false },
  { id: 'cat-study', name: '学习', color: '#33587A', order: 1, updatedAt: 0, deleted: false },
  { id: 'cat-write', name: '写作', color: '#4A7051', order: 2, updatedAt: 0, deleted: false },
  { id: 'cat-read', name: '阅读', color: '#B07C2A', order: 3, updatedAt: 0, deleted: false }
];
function freshData() {
  return { app: 'liuhen', version: 1, categories: JSON.parse(JSON.stringify(DEFAULT_CATS)), entries: [], devices: {} };
}
function normalize(d) {
  if (!d || typeof d !== 'object') return null;
  const out = freshData();
  out.categories = Array.isArray(d.categories) && d.categories.length ? d.categories : out.categories;
  out.entries = Array.isArray(d.entries) ? d.entries : [];
  out.devices = (d.devices && typeof d.devices === 'object') ? d.devices : {};
  return out;
}
let data = (() => {
  try { const v = normalize(JSON.parse(localStorage.getItem(LS_KEY))); if (v) return v; } catch (e) { /* 损坏则重建 */ }
  return freshData();
})();

const cats = () => data.categories.filter(c => !c.deleted).sort((a, b) => (a.order - b.order) || (a.updatedAt - b.updatedAt));
const entries = () => data.entries.filter(e => !e.deleted);
const catById = id => data.categories.find(c => c.id === id && !c.deleted);
const colorOf = e => { const c = catById(e.catId); return c ? c.color : '#A69D8C'; };
const nameOf = e => { const c = catById(e.catId); return c ? c.name : (e.cat || '未分类'); };

function deviceId() {
  let v = localStorage.getItem(LS_DEV);
  if (!v) { v = uuid(); localStorage.setItem(LS_DEV, v); }
  return v;
}
function deviceName() {
  const ua = navigator.userAgent;
  const mob = /Mobi|Android|iPhone|iPad/i.test(ua);
  const os = /iPhone|iPad|iOS/i.test(ua) ? 'iOS' : /Android/i.test(ua) ? 'Android' :
    /Mac/i.test(ua) ? 'Mac' : /Win/i.test(ua) ? 'Windows' : /Linux/i.test(ua) ? 'Linux' : '未知';
  return (mob ? '手机' : '电脑') + ' · ' + os;
}

/* --- 合并：条目/类别按 id，updatedAt 新者胜（含删除墓碑） --- */
function mergeData(a, b) {
  const pick = (x, y) => ((y.updatedAt || 0) > (x.updatedAt || 0) ? y : x);
  const mergeList = (la, lb) => {
    const m = new Map((la || []).map(x => [x.id, x]));
    for (const y of (lb || [])) { if (!y || !y.id) continue; const x = m.get(y.id); m.set(y.id, x ? pick(x, y) : y); }
    return Array.from(m.values());
  };
  const devices = Object.assign({}, a.devices || {});
  for (const [k, v] of Object.entries(b.devices || {})) {
    if (!devices[k] || (v.t || 0) > (devices[k].t || 0)) devices[k] = v;
  }
  return { app: 'liuhen', version: 1, categories: mergeList(a.categories, b.categories), entries: mergeList(a.entries, b.entries), devices };
}
const canon = d => JSON.stringify({
  c: (d.categories || []).slice().sort((a, b) => a.id < b.id ? -1 : 1),
  e: (d.entries || []).slice().sort((a, b) => a.id < b.id ? -1 : 1)
});
function purgeTombstones() { /* 清理 90 天前的墓碑，避免文件无限增长 */
  const lim = Date.now() - 90 * 864e5;
  data.entries = data.entries.filter(e => !(e.deleted && (e.updatedAt || 0) < lim));
}
function serialize() { return JSON.stringify(data, null, 1); }
function saveLocal() { try { localStorage.setItem(LS_KEY, serialize()); } catch (e) { console.warn(e); } }

let lastSavedAt = Number(localStorage.getItem('liuhen.savedAt') || 0);
function commit() {
  data.devices[deviceId()] = { name: deviceName(), t: Date.now() };
  purgeTombstones();
  saveLocal();
  lastSavedAt = Date.now(); localStorage.setItem('liuhen.savedAt', String(lastSavedAt));
  scheduleSync();
  render();
}
function absorbRemote(merged) { /* 同步拉回的合并结果 */
  if (canon(merged) === canon(data) ) { data.devices = merged.devices || data.devices; return false; }
  data = merged; saveLocal(); safeRender(); return true;
}

/* --- 数据操作 --- */
function addEntry(o) {
  const c = catById(o.catId);
  data.entries.push({
    id: uuid(), date: o.date || todayStr(), time: o.time || nowTime(),
    catId: o.catId || '', cat: c ? c.name : (o.cat || ''),
    note: (o.note || '').trim(), min: Math.max(0, Math.round(Number(o.min) || 0)),
    metric: (o.metric || '').trim(), updatedAt: Date.now(), deleted: false
  });
  commit();
}
function updateEntry(id, patch) {
  const e = data.entries.find(x => x.id === id); if (!e) return;
  Object.assign(e, patch);
  if (patch.catId !== undefined) { const c = catById(e.catId); if (c) e.cat = c.name; }
  if (patch.min !== undefined) e.min = Math.max(0, Math.round(Number(e.min) || 0));
  e.updatedAt = Date.now();
  commit();
}
function deleteEntry(id) {
  const e = data.entries.find(x => x.id === id); if (!e) return;
  e.deleted = true; e.updatedAt = Date.now(); commit();
}
function addCategory(name) {
  const used = new Set(cats().map(c => c.color));
  const color = PALETTE.find(c => !used.has(c)) || PALETTE[cats().length % PALETTE.length];
  const order = cats().reduce((m, c) => Math.max(m, c.order || 0), -1) + 1;
  data.categories.push({ id: 'cat-' + uuid().slice(0, 8), name: name.trim(), color, order, updatedAt: Date.now(), deleted: false });
  commit();
}
function updateCategory(id, patch) {
  const c = data.categories.find(x => x.id === id); if (!c) return;
  Object.assign(c, patch); c.updatedAt = Date.now(); commit();
}
function deleteCategory(id) {
  const c = data.categories.find(x => x.id === id); if (!c) return;
  c.deleted = true; c.updatedAt = Date.now();
  if (ui.quickCat === id) ui.quickCat = (cats()[0] || {}).id || '';
  commit();
}

/* --- 统计 --- */
const entriesOn = ds => entries().filter(e => e.date === ds);
const entriesInRange = (a, b) => entries().filter(e => e.date >= a && e.date <= b);
const sumMin = list => list.reduce((s, e) => s + (Number(e.min) || 0), 0);
function currentStreak() {
  const days = new Set(entries().map(e => e.date));
  if (!days.size) return 0;
  let ds = todayStr(); let n = 0;
  if (!days.has(ds)) ds = addDays(ds, -1);
  while (days.has(ds)) { n++; ds = addDays(ds, -1); }
  return n;
}
function longestStreak(daySet) {
  let best = 0;
  for (const ds of daySet) {
    if (daySet.has(addDays(ds, -1))) continue;
    let n = 1, cur = ds;
    while (daySet.has(cur = addDays(cur, 1))) n++;
    best = Math.max(best, n);
  }
  return best;
}

/* ================= 同步引擎 ================= */
/* 三层：localStorage（始终）→ 本地文件 File System Access（桌面）→ WebDAV（跨设备） */
let fileHandle = null, pendingHandle = null, fileInfo = null, fileLastMod = 0;
let syncBusy = false, syncQueued = false, syncErr = null, davLastOk = 0;

const scheduleSync = debounce(() => syncNow(), 1000); /* 设计要求：改动防抖 1s 自动写盘 */

async function syncNow() {
  if (!fileHandle && !davEnabled() && !cloudEnabled()) { updateStatusUi(); return; }
  if (syncBusy) { syncQueued = true; return; }
  syncBusy = true; syncErr = null; updateStatusUi('busy');
  try {
    if (fileHandle) await fileSyncOnce();
    if (cloudEnabled()) await gistSyncOnce();
    if (davEnabled()) await davSyncOnce();
  } catch (e) {
    syncErr = (e && e.message) ? e.message : String(e);
    console.warn('sync:', e);
  }
  syncBusy = false;
  updateStatusUi();
  if (syncQueued) { syncQueued = false; syncNow(); }
}

/* --- 本地文件（File System Access API） --- */
const fsSupported = () => 'showSaveFilePicker' in window && 'showOpenFilePicker' in window;
async function fileSyncOnce() {
  const f = await fileHandle.getFile();
  let remote = null;
  if (f.size > 0) { try { remote = normalize(JSON.parse(await f.text())); } catch (e) { /* 文件损坏：以本地覆盖 */ } }
  if (remote) absorbRemote(mergeData(data, remote));
  if (!remote || canon(remote) !== canon(data) || JSON.stringify(remote.devices) !== JSON.stringify(data.devices)) {
    const w = await fileHandle.createWritable();
    await w.write(serialize()); await w.close();
    lastSavedAt = Date.now(); localStorage.setItem('liuhen.savedAt', String(lastSavedAt));
  }
  const f2 = await fileHandle.getFile();
  fileLastMod = f2.lastModified;
  fileInfo = { name: f2.name, size: f2.size };
}
async function connectFile(create) {
  try {
    let h;
    if (create) {
      h = await window.showSaveFilePicker({
        suggestedName: 'records.json',
        types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
      });
    } else {
      [h] = await window.showOpenFilePicker({
        types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
      });
    }
    if (!h) return;
    if ((await h.requestPermission({ mode: 'readwrite' })) !== 'granted') return;
    fileHandle = h; pendingHandle = null;
    await idbSet('fileHandle', h);
    await syncNow();
    renderSheet();
  } catch (e) { if (e && e.name !== 'AbortError') { syncErr = e.message; updateStatusUi(); } }
}
async function disconnectFile() {
  fileHandle = null; pendingHandle = null; fileInfo = null;
  await idbDel('fileHandle'); updateStatusUi(); renderSheet();
}
async function resumeFile() {
  const h = pendingHandle; if (!h) return;
  try {
    if ((await h.requestPermission({ mode: 'readwrite' })) === 'granted') {
      fileHandle = h; pendingHandle = null;
      await syncNow(); renderSheet();
    }
  } catch (e) { syncErr = e.message; updateStatusUi(); }
}
async function initFile() {
  if (!fsSupported()) return;
  try {
    const h = await idbGet('fileHandle');
    if (!h) return;
    const q = await h.queryPermission({ mode: 'readwrite' });
    if (q === 'granted') { fileHandle = h; syncNow(); }
    else { pendingHandle = h; updateStatusUi(); }
  } catch (e) { /* ignore */ }
}

/* --- 迷你 IndexedDB（存文件句柄） --- */
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('liuhen', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbGet(k) { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction('kv').objectStore('kv').get(k); t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error); }); }
async function idbSet(k, v) { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite').objectStore('kv').put(v, k); t.onsuccess = () => res(); t.onerror = () => rej(t.error); }); }
async function idbDel(k) { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite').objectStore('kv').delete(k); t.onsuccess = () => res(); t.onerror = () => rej(t.error); }); }

/* --- WebDAV --- */
function davCfg() { try { return JSON.parse(localStorage.getItem(LS_DAV)) || null; } catch (e) { return null; } }
function davEnabled() { const c = davCfg(); return !!(c && c.url); }
function davSave(cfg) { if (cfg) localStorage.setItem(LS_DAV, JSON.stringify(cfg)); else localStorage.removeItem(LS_DAV); }
function davHeaders(c) {
  const h = {};
  if (c.user) h['Authorization'] = 'Basic ' + btoa(unescape(encodeURIComponent(c.user + ':' + (c.pass || ''))));
  return h;
}
async function davSyncOnce() {
  const c = davCfg(); if (!c) return;
  let remote = null;
  const r = await fetch(c.url, { headers: davHeaders(c), cache: 'no-store' }).catch(e => { throw new Error('WebDAV 连接失败（网络或 CORS）'); });
  if (r.ok) { try { remote = normalize(JSON.parse(await r.text())); } catch (e) { /* 远端损坏，覆盖 */ } }
  else if (r.status === 401) throw new Error('WebDAV 认证失败（检查账号/应用密码）');
  else if (r.status !== 404) throw new Error('WebDAV 读取失败 HTTP ' + r.status);
  if (remote) absorbRemote(mergeData(data, remote));
  if (!remote || canon(remote) !== canon(data) || JSON.stringify(remote.devices) !== JSON.stringify(data.devices)) {
    const put = () => fetch(c.url, { method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, davHeaders(c)), body: serialize() });
    let p = await put();
    if (p.status === 409 || p.status === 404) { /* 父目录不存在 → MKCOL 后重试 */
      const dir = c.url.replace(/\/[^/]*$/, '');
      await fetch(dir, { method: 'MKCOL', headers: davHeaders(c) }).catch(() => {});
      p = await put();
    }
    if (!p.ok) throw new Error('WebDAV 写入失败 HTTP ' + p.status);
    lastSavedAt = Date.now(); localStorage.setItem('liuhen.savedAt', String(lastSavedAt));
  }
  davLastOk = Date.now();
}

/* --- 浏览器登录同步：Gitee（国内直连）/ GitHub，数据存账号下的私密代码片段（Gist） --- */
const LS_CLOUD = 'liuhen.cloud.v1';
const CLOUD_DESC = '留痕记录数据 liuhen-records（请勿删除 / do not delete）';
const PROVIDERS = {
  gitee: {
    label: 'Gitee 码云', api: 'https://gitee.com/api/v5', authQuery: true,
    tokenUrl: 'https://gitee.com/profile/personal_access_tokens/new',
    tokenTip: '私人令牌，只勾选 <b>gists</b> 权限', netTip: '国内手机、电脑直连，无需翻墙'
  },
  github: {
    label: 'GitHub', api: 'https://api.github.com', authQuery: false,
    tokenUrl: 'https://github.com/settings/tokens/new?scopes=gist&description=liuhen',
    tokenTip: '经典令牌，只勾选 <b>gist</b> 权限', netTip: '国内直连可能不稳定，适合能访问 GitHub 的环境'
  }
};
function cloudCfg() { try { return JSON.parse(localStorage.getItem(LS_CLOUD)) || null; } catch (e) { return null; } }
function cloudEnabled() { const c = cloudCfg(); return !!(c && c.token && c.gistId && PROVIDERS[c.provider]); }
function cloudSave(c) { if (c) localStorage.setItem(LS_CLOUD, JSON.stringify(c)); else localStorage.removeItem(LS_CLOUD); }
let cloudLastOk = 0;
function cloudReq(provider, token, path, opts) {
  const P = PROVIDERS[provider];
  opts = opts || {};
  const url = new URL(P.api + path);
  const headers = Object.assign({}, opts.headers || {});
  if (P.authQuery) url.searchParams.set('access_token', token);
  else { headers['Authorization'] = 'Bearer ' + token; headers['Accept'] = 'application/vnd.github+json'; }
  if (opts.body) headers['Content-Type'] = 'application/json';
  return fetch(url.toString(), Object.assign({ cache: 'no-store' }, opts, { headers }))
    .catch(() => { throw new Error('无法连接 ' + P.label + '（检查网络）'); });
}
async function cloudLogin(provider, token) {
  token = (token || '').trim();
  const P = PROVIDERS[provider];
  if (!token) throw new Error('请先粘贴' + P.label + '令牌');
  let login = '';
  const ru = await cloudReq(provider, token, '/user');
  if (ru.status === 401) throw new Error('令牌无效或已过期');
  if (ru.ok) { try { login = (await ru.json()).login || ''; } catch (e) { /* ignore */ } }
  const rl = await cloudReq(provider, token, '/gists?per_page=100&page=1');
  if (!rl.ok) throw new Error('令牌缺少 gists 权限（HTTP ' + rl.status + '，创建令牌时请勾选 gists）');
  const gists = await rl.json();
  let g = (Array.isArray(gists) ? gists : []).find(x => x.files && x.files['records.json'] && /liuhen/.test(x.description || ''));
  if (!g) {
    const rc = await cloudReq(provider, token, '/gists', {
      method: 'POST',
      body: JSON.stringify({ description: CLOUD_DESC, public: false, files: { 'records.json': { content: serialize() } } })
    });
    if (!rc.ok) throw new Error('创建云端数据失败（HTTP ' + rc.status + '，令牌需要 gists 读写权限）');
    g = await rc.json();
  }
  cloudSave({ provider, token, login, gistId: g.id });
  syncErr = null;
  await syncNow();
}
function cloudLogout() { cloudSave(null); cloudLastOk = 0; syncErr = null; updateStatusUi(); }
async function gistSyncOnce() {
  const c = cloudCfg(); if (!c) return;
  const P = PROVIDERS[c.provider];
  const r = await cloudReq(c.provider, c.token, '/gists/' + c.gistId);
  if (r.status === 401) throw new Error(P.label + ' 令牌失效，请在设置里重新登录');
  if (r.status === 404) throw new Error('云端数据不存在（代码片段可能被删除），请退出登录后重新登录');
  if (!r.ok) throw new Error(P.label + ' 读取失败 HTTP ' + r.status);
  const g = await r.json();
  const f = g.files && g.files['records.json'];
  let remote = null;
  if (f) {
    let txt = f.content;
    if (f.truncated && f.raw_url) { const rr = await fetch(f.raw_url, { cache: 'no-store' }); if (rr.ok) txt = await rr.text(); }
    try { remote = normalize(JSON.parse(txt)); } catch (e) { /* 云端损坏则覆盖 */ }
  }
  if (remote) absorbRemote(mergeData(data, remote));
  if (!remote || canon(remote) !== canon(data) || JSON.stringify(remote.devices) !== JSON.stringify(data.devices)) {
    const p = await cloudReq(c.provider, c.token, '/gists/' + c.gistId, {
      method: 'PATCH',
      body: JSON.stringify({ description: CLOUD_DESC, files: { 'records.json': { content: serialize() } } })
    });
    if (!p.ok) throw new Error(P.label + ' 写入失败 HTTP ' + p.status);
    lastSavedAt = Date.now(); localStorage.setItem('liuhen.savedAt', String(lastSavedAt));
  }
  cloudLastOk = Date.now();
}

/* --- 后台轮询 + 焦点拉取 --- */
setInterval(async () => {
  if (syncBusy) return;
  try {
    if (fileHandle) {
      const f = await fileHandle.getFile();
      if (f.lastModified > fileLastMod) syncNow();
    }
  } catch (e) { /* ignore */ }
  if (davEnabled() && Date.now() - davLastOk > 60000) syncNow();
  else if (cloudEnabled() && Date.now() - cloudLastOk > 60000) syncNow();
}, 15000);
window.addEventListener('focus', () => syncNow());
document.addEventListener('visibilitychange', () => { if (!document.hidden) syncNow(); });

/* ================= 导入 / 导出 ================= */
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: type || 'application/json' }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
function exportBackup() {
  const d = new Date();
  download(`留痕备份-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.json`, serialize());
}
function exportCsv(list, label) {
  const q = s => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
  const rows = [['日期', '时间', '类别', '内容', '时长(分钟)', '指标'].join(',')];
  for (const e of list) rows.push([q(e.date), q(e.time), q(nameOf(e)), q(e.note), e.min || 0, q(e.metric)].join(','));
  download(`留痕-${label}.csv`, '﻿' + rows.join('\r\n'), 'text/csv');
}
function importBackup(file) {
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const remote = normalize(JSON.parse(rd.result));
      if (!remote) throw new Error('bad');
      const before = entries().length;
      data = mergeData(data, remote);
      commit();
      alert(`导入完成：现有 ${entries().length} 条记录（新增/更新 ${Math.max(0, entries().length - before)} 条以上）。`);
      renderSheet();
    } catch (e) { alert('导入失败：不是有效的留痕备份 JSON 文件'); }
  };
  rd.readAsText(file);
}

/* ================= UI 状态 / 路由 ================= */
const nowYM = () => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() + 1 }; };
const ui = {
  page: 'today',
  quickCat: (cats()[0] || {}).id || '',
  tableYM: nowYM(), tableFilter: 'all', tableQ: '',
  editingId: null,
  revYM: nowYM(), revPeriod: 'month', revFilter: 'all',
  catEditId: null, catPaletteId: null, catAdding: false,
  sheet: null, sheetEntry: null,
  cloudProv: 'gitee', tokenDraft: ''
};
function go(page) { location.hash = '#/' + page; }
function applyHash() {
  const p = (location.hash.replace(/^#\/?/, '') || 'today').split('?')[0];
  ui.page = ['today', 'table', 'review', 'cats'].includes(p) ? p : 'today';
  ui.editingId = null;
  render();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', applyHash);

/* 后台同步触发的渲染：避免打断正在输入/编辑的用户 */
let renderQueued = false;
function safeRender() {
  const ae = document.activeElement;
  const typing = ae && ae.closest && ae.closest('#main,#sheet') &&
    (ae.tagName === 'INPUT' || ae.tagName === 'SELECT' || ae.tagName === 'TEXTAREA');
  if (typing && !ui.editingId && !ui.sheet) {
    /* 光标停在还没打字的快速记录框里：直接重绘并还回焦点，不阻塞远端更新 */
    const qids = ['q-note', 'q-min', 'q-metric'];
    const idle = qids.includes(ae.id) && qids.every(id => { const el = document.getElementById(id); return !el || !el.value; });
    if (idle) {
      const fid = ae.id;
      render();
      const el = document.getElementById(fid); if (el) el.focus();
      return;
    }
  }
  if (typing || ui.editingId || ui.sheet) { renderQueued = true; return; }
  render();
}
document.addEventListener('focusout', () => {
  setTimeout(() => { if (renderQueued && !ui.sheet) { renderQueued = false; safeRender(); } }, 120);
});

/* ================= 状态栏 ================= */
function timeAgo(t) {
  if (!t) return '—';
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return '刚刚';
  if (s < 3600) return Math.floor(s / 60) + ' 分钟前';
  if (s < 86400) return Math.floor(s / 3600) + ' 小时前';
  return Math.floor(s / 86400) + ' 天前';
}
function deviceCount() {
  const lim = Date.now() - 30 * 864e5;
  return Object.values(data.devices || {}).filter(d => (d.t || 0) > lim).length;
}
function statusText() {
  if (syncErr) return { cls: 'err', main: '同步失败', sub: syncErr };
  if (syncBusy) return { cls: 'busy', main: '同步中…', sub: syncTargetsLine() };
  if (pendingHandle) return { cls: 'busy', main: '点击恢复文件连接', sub: syncTargetsLine() };
  return { cls: '', main: '已保存 · ' + timeAgo(lastSavedAt), sub: syncTargetsLine() };
}
function syncTargetsLine() {
  const parts = [];
  if (cloudEnabled()) { const c = cloudCfg(); parts.push(PROVIDERS[c.provider].label + (c.login ? ' · @' + esc(c.login) : ' 已登录')); }
  if (fileInfo) parts.push(`${fileInfo.name} · ${Math.max(1, Math.round(fileInfo.size / 1024))} KB`);
  else if (fileHandle || pendingHandle) parts.push('records.json');
  if (davEnabled()) parts.push('WebDAV');
  if (!parts.length) parts.push('未登录 · 点击设置同步');
  const n = deviceCount();
  if (n > 1) parts.push(`已同步 ${n} 台设备`);
  return parts.join('<br>');
}
function updateStatusUi() {
  const st = statusText();
  const line = $('#save-line'), sub = $('#save-sub');
  if (line) { line.className = 'save-line ' + st.cls; $('#save-text').textContent = st.main; }
  if (sub) sub.innerHTML = st.sub;
  const chip = $('#m-save-chip');
  if (chip) {
    chip.className = 'save-line ' + st.cls;
    chip.innerHTML = `<span class="dot"></span>${syncErr ? '同步失败' : syncBusy ? '同步中…' : pendingHandle ? '待恢复' : '已保存'}`;
  }
}
setInterval(updateStatusUi, 30000);

/* ================= 渲染 ================= */
function render() {
  renderQueued = false;
  /* 侧栏/底栏高亮与计数 */
  $$('#nav button,#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.nav === ui.page));
  const tn = entriesOn(todayStr()).length;
  const { y, m } = nowYM();
  const mk = `${y}-${pad(m)}`;
  $('#n-today').textContent = tn ? tn + ' 条' : '';
  $('#n-table').textContent = entries().filter(e => e.date.startsWith(mk)).length || '';
  $('#n-cats').textContent = cats().length;
  const main = $('#main');
  main.innerHTML = ({ today: vToday, table: vTable, review: vReview, cats: vCats })[ui.page]();
  bindPage(main);
  updateStatusUi();
}

const catChipsHtml = (selId, withAdd) => cats().map(c =>
  `<button class="chip ${selId === c.id ? 'on-c' : ''}" data-cat="${c.id}"
     style="${selId === c.id ? `background:${c.color};border-color:${c.color};` : ''}">${esc(c.name)}</button>`
).join('') + (withAdd ? `<button class="chip add" data-act="add-cat">＋</button>` : '');

/* ---------- 今日 ---------- */
function vToday() {
  const ds = todayStr(), d = new Date();
  const list = entriesOn(ds).sort((a, b) => a.time === b.time ? (a.updatedAt - b.updatedAt) : (a.time < b.time ? -1 : 1));
  const streak = currentStreak();
  /* 本周（周一起） */
  const dow = (d.getDay() + 6) % 7;
  const mon = addDays(ds, -dow);
  const week = [];
  for (let i = 0; i < 7; i++) {
    const wds = addDays(mon, i);
    const future = wds > ds, today = wds === ds;
    const dots = future ? [] : [...new Set(entriesOn(wds).map(colorOf))];
    week.push({ lb: WD[(i + 1) % 7], num: Number(wds.slice(8)), dots, today, future });
  }
  const wkRange = `${Number(mon.slice(5, 7))}.${Number(mon.slice(8))} – ${Number(addDays(mon, 6).slice(5, 7))}.${Number(addDays(mon, 6).slice(8))}`;
  /* 本月截至今天 */
  const mk = ds.slice(0, 7);
  const mlist = entries().filter(e => e.date.startsWith(mk));
  const mstats = cats().map(c => {
    const l = mlist.filter(e => e.catId === c.id);
    return { c, count: l.length, min: sumMin(l) };
  }).filter(s => s.count);

  return `
  <div class="page-head">
    <div class="page-title">${d.getMonth() + 1}月${d.getDate()}日 <small>周${WD[d.getDay()]}</small></div>
    <div class="h-tools">
      <span class="mob save-line" id="m-save-chip" data-act="open-settings" style="cursor:pointer"></span>
      <span class="pill">已连续记录 <b>${streak}</b> 天</span>
    </div>
  </div>
  <div class="today-cols">
    <div class="today-main">
      <div class="qcard">
        <div class="chips" id="q-chips">${catChipsHtml(ui.quickCat, true)}</div>
        <div class="qrow">
          <div class="qnote"><input class="line" id="q-note" placeholder="今天做了什么？如：力量训练 · 推日" maxlength="200"></div>
          <div class="qmin"><input class="line" id="q-min" inputmode="numeric" placeholder="分钟"></div>
          <div class="qmetric"><input class="line" id="q-metric" placeholder="指标（可选）" maxlength="120"></div>
          <button class="qbtn" id="q-save">记录</button>
        </div>
        <div class="qhint">回车即保存 · 自动写入本地文件，无需手动操作</div>
      </div>
      <div class="tlist">
        <div class="tlist-head">今日 · ${list.length} 条</div>
        ${list.length ? list.map(e => `
        <div class="trow" data-edit="${e.id}">
          <span class="t">${esc(e.time)}</span>
          <span class="cat"><span class="dot8" style="background:${colorOf(e)}"></span><span class="txt">${esc(nameOf(e))}</span></span>
          <span class="note">${esc(e.note) || '<span style="color:var(--faint)">（未填写内容）</span>'}</span>
          <span class="metric" data-t="${esc(e.time)}">${esc(e.metric) || '—'}</span>
          <span class="min">${e.min ? e.min + ' 分钟' : '—'}</span>
        </div>`).join('') : `<div class="empty">今天还没有记录。<br>随手记一笔 —— 记录只是反馈，不设目标。</div>`}
        <button class="trow-more" data-act="focus-note">＋ 继续记一笔</button>
      </div>
    </div>
    <div class="today-rail">
      <div class="railcard">
        <h4>本周 · ${wkRange}</h4>
        <div class="wk">${week.map(w => `
          <div class="d" style="${w.today ? 'border-color:var(--ink);background:var(--card)' : ''}">
            <span class="lb">${w.lb}</span>
            <span class="num" style="color:${w.future ? 'var(--mist)' : 'var(--ink)'}">${w.num}</span>
            <span class="dots">${w.dots.map(c => `<i style="background:${c}"></i>`).join('')}</span>
          </div>`).join('')}</div>
      </div>
      <div class="railcard">
        <h4>本月截至今天</h4>
        ${mstats.length ? mstats.map(s => `
        <div class="mstat">
          <span class="dot8" style="background:${s.c.color}"></span>
          <span class="nm">${esc(s.c.name)}</span>
          <b>${s.count} 次</b>
          <span style="flex:1"></span>
          <span class="hrs">${hours1(s.min)} h</span>
        </div>`).join('') : `<div class="empty" style="padding:10px 0">本月还没有记录</div>`}
        <div class="rail-note">记录只是反馈，不设目标。<br><a data-act="go-review">去复盘页看日历标记 →</a></div>
      </div>
    </div>
  </div>`;
}

/* ---------- 记录表 ---------- */
function tableList() {
  const { y, m } = ui.tableYM;
  const mk = `${y}-${pad(m)}`;
  let list = entries().filter(e => e.date.startsWith(mk));
  if (ui.tableFilter !== 'all') list = list.filter(e => e.catId === ui.tableFilter);
  if (ui.tableQ) {
    const q = ui.tableQ.toLowerCase();
    list = list.filter(e => (e.note + ' ' + e.metric + ' ' + nameOf(e)).toLowerCase().includes(q));
  }
  return list.sort((a, b) => {
    const ka = a.date + a.time, kb = b.date + b.time;
    return ka === kb ? (b.updatedAt - a.updatedAt) : (kb < ka ? -1 : 1);
  });
}
function vTable() {
  const { y, m } = ui.tableYM;
  const list = tableList();
  const totalMin = sumMin(list);
  let lastDate = null;
  const rows = list.map(e => {
    const first = e.date !== lastDate; lastDate = e.date;
    if (ui.editingId === e.id) return trEditHtml(e);
    return `
    ${first ? `<div class="d-sep">${e.date.slice(5)} · 周${wdOf(e.date)}</div>` : ''}
    <div class="tr row" data-edit="${e.id}">
      <span class="c-date">${first ? `${e.date.slice(5)} <span class="wd">${wdOf(e.date)}</span>` : ''}</span>
      <span class="c-time" data-metric="${esc(e.metric) || '—'}">${esc(e.time)}</span>
      <span class="c-cat"><span class="dot7" style="background:${colorOf(e)}"></span><span class="txt">${esc(nameOf(e))}</span></span>
      <span class="c-note">${esc(e.note) || '<span style="color:var(--faint)">（未填写内容）</span>'}</span>
      <span class="c-min">${e.min || '—'}</span>
      <span class="c-metric">${esc(e.metric) || '—'}</span>
      <button class="c-menu" data-del="${e.id}" title="删除">✕</button>
    </div>`;
  }).join('');

  return `
  <div class="page-head">
    <div style="display:flex;align-items:baseline;gap:18px;flex-wrap:wrap">
      <div class="page-title">记录表</div>
      <div class="mnav"><button data-act="tbl-prev">‹</button><b>${y} 年 ${m} 月</b><button data-act="tbl-next">›</button></div>
    </div>
    <div class="h-tools">
      <input class="search" id="tbl-q" placeholder="搜索内容…" value="${esc(ui.tableQ)}">
      <button class="btn" data-act="csv">导出 CSV</button>
    </div>
  </div>
  <div class="chips">
    <button class="chip ${ui.tableFilter === 'all' ? 'on' : ''}" data-tf="all">全部</button>
    ${cats().map(c => `<button class="chip ${ui.tableFilter === c.id ? 'on' : ''}" data-tf="${c.id}"><span class="cdot" style="background:${c.color}"></span>${esc(c.name)}</button>`).join('')}
  </div>
  <div class="tbl">
    <div class="tr head"><span>日期</span><span>时间</span><span>类别</span><span>内容</span><span>时长</span><span>指标</span><span></span></div>
    ${rows || `<div class="empty">这个月${ui.tableQ || ui.tableFilter !== 'all' ? '没有符合条件的' : '还没有'}记录</div>`}
    <div style="flex:1"></div>
    <div class="tbl-foot">
      <span>本月 <b>${list.length}</b> 条 · 合计 <b>${hours1(totalMin)}</b> 小时</span>
      <span>${isMobile() ? '点记录直接编辑 · 改动自动保存' : '点击任意记录直接编辑 · 改动自动保存'}</span>
    </div>
  </div>`;
}
function trEditHtml(e) {
  return `
  <div class="tr editing" data-eid="${e.id}">
    <span><input type="date" class="e-date" value="${esc(e.date)}"></span>
    <span><input type="time" class="e-time" value="${esc(e.time)}"></span>
    <span><select class="e-cat">${cats().map(c => `<option value="${c.id}" ${c.id === e.catId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
      ${!catById(e.catId) ? `<option value="${esc(e.catId)}" selected>${esc(nameOf(e))}</option>` : ''}</select></span>
    <span><input class="e-note" value="${esc(e.note)}" maxlength="200"></span>
    <span><input class="e-min" inputmode="numeric" value="${e.min || ''}" placeholder="分钟"></span>
    <span><input class="e-metric" value="${esc(e.metric)}" maxlength="120" placeholder="指标（可选）"></span>
    <button class="save" data-act="row-save">保存</button>
  </div>`;
}

/* ---------- 复盘 ---------- */
function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }
function periodRange() {
  const { y, m } = ui.revYM, p = ui.revPeriod;
  if (p === 'month') return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(daysInMonth(y, m))}`, label: `${y} 年 ${m} 月` };
  if (p === 'quarter') {
    const q = Math.floor((m - 1) / 3);
    const m1 = q * 3 + 1, m2 = q * 3 + 3;
    return { start: `${y}-${pad(m1)}-01`, end: `${y}-${pad(m2)}-${pad(daysInMonth(y, m2))}`, label: `${y} 年 Q${q + 1}` };
  }
  return { start: `${y}-01-01`, end: `${y}-12-31`, label: `${y} 年` };
}
function periodShift(dir) {
  const { y, m } = ui.revYM, p = ui.revPeriod;
  if (p === 'month') { const d = new Date(y, m - 1 + dir, 1); ui.revYM = { y: d.getFullYear(), m: d.getMonth() + 1 }; }
  else if (p === 'quarter') { const d = new Date(y, m - 1 + dir * 3, 1); ui.revYM = { y: d.getFullYear(), m: d.getMonth() + 1 }; }
  else ui.revYM = { y: y + dir, m };
}
function vReview() {
  const pr = periodRange();
  const ds0 = todayStr();
  let list = entriesInRange(pr.start, pr.end);
  if (ui.revFilter !== 'all') list = list.filter(e => e.catId === ui.revFilter);
  const daySet = new Set(list.map(e => e.date));
  const elapsedEnd = pr.end > ds0 ? ds0 : pr.end;
  const elapsed = pr.start > ds0 ? 0 :
    Math.round((parseDate(elapsedEnd) - parseDate(pr.start)) / 864e5) + 1;
  const totalMin = sumMin(list);
  const pName = { month: '本月', quarter: '本季', year: '本年' }[ui.revPeriod];

  /* 类别卡片（当前时段） */
  const allInRange = entriesInRange(pr.start, pr.end);
  const cards = cats().map(c => {
    const l = allInRange.filter(e => e.catId === c.id);
    const dset = new Set(l.map(e => e.date));
    return { c, days: dset.size, min: sumMin(l), streak: longestStreak(dset) };
  }).filter(x => x.days);
  const maxDays = Math.max(1, ...cards.map(x => x.days));

  /* 时间占比 */
  const shares = cards.slice().sort((a, b) => b.min - a.min).map(x => ({
    name: x.c.name, c: x.c.color, min: x.min,
    pct: totalShare(x.min, cards)
  })).filter(s => s.min > 0);

  /* 趋势图：月/季 → 周；年 → 月 */
  const chart = ui.revPeriod === 'year' ? yearChart(pr) : weekChart(pr);

  return `
  <div class="page-head">
    <div style="display:flex;align-items:baseline;gap:18px;flex-wrap:wrap">
      <div class="page-title">复盘</div>
      <div class="mnav"><button data-act="rv-prev">‹</button><b>${pr.label}</b><button data-act="rv-next">›</button></div>
    </div>
    <div class="seg">
      <button class="${ui.revPeriod === 'month' ? 'on' : ''}" data-period="month">月</button>
      <button class="${ui.revPeriod === 'quarter' ? 'on' : ''}" data-period="quarter">季</button>
      <button class="${ui.revPeriod === 'year' ? 'on' : ''}" data-period="year">年</button>
    </div>
  </div>
  <div class="rv-stats">
    <div class="s"><div class="v">${list.length}</div><div class="k">${pName}记录（条）</div></div>
    <div class="sep"></div>
    <div class="s"><div class="v">${daySet.size}<small>/${elapsed}</small></div><div class="k">有记录的天数</div></div>
    <div class="sep"></div>
    <div class="s"><div class="v">${hours1(totalMin)}<small> h</small></div><div class="k">合计时长</div></div>
    <div class="sep"></div>
    <div class="s"><div class="v">${currentStreak()}<small> 天</small></div><div class="k">当前连续记录</div></div>
  </div>
  <div class="rv-cols">
    <div class="rv-cal">
      <div class="chips">
        <button class="chip ${ui.revFilter === 'all' ? 'on' : ''}" data-rf="all">全部</button>
        ${cats().map(c => `<button class="chip ${ui.revFilter === c.id ? 'on-c' : ''}" data-rf="${c.id}"
          style="${ui.revFilter === c.id ? `background:${c.color};border-color:${c.color};` : ''}"><span class="cdot" style="background:${ui.revFilter === c.id ? 'rgba(255,255,255,.85)' : c.color}"></span>${esc(c.name)}</button>`).join('')}
        <span style="font-size:11.5px;color:var(--faint);margin-left:auto">点类别筛选日历标记</span>
      </div>
      ${ui.revPeriod === 'month' ? calHtml() : miniMonthsHtml(pr)}
    </div>
    <div class="rv-side">
      <div class="sec-label" style="padding:2px 2px 0">各类别 · ${pName}</div>
      ${cards.length ? cards.map(x => `
      <div class="catcard">
        <div class="top"><span class="dot8" style="background:${x.c.color}"></span><b>${esc(x.c.name)}</b><span class="n">${x.days} 天</span></div>
        <div class="bar"><i style="width:${Math.round(x.days / maxDays * 100)}%;background:${x.c.color}"></i></div>
        <div class="sub"><span>${hours1(x.min)} 小时</span><span>最长连续 ${x.streak} 天</span></div>
      </div>`).join('') : `<div class="card empty">${pName}还没有记录</div>`}
    </div>
  </div>
  <div class="rv-bottom">
    <div class="chart-card" style="flex:1.35;min-width:0">
      <div class="sec-label" style="margin-bottom:14px">${chart.title}</div>
      <div class="bars">${chart.cols.map(w => `
        <div class="col"><div class="stack">${w.segs.map(s => `<div style="width:100%;height:${s.h}px;background:${s.c}"></div>`).join('')}</div>
        <span class="tick">${w.tick}</span></div>`).join('')}</div>
    </div>
    <div class="chart-card" style="width:316px;flex-shrink:0;display:flex;flex-direction:column;gap:12px" id="share-card">
      <div class="sec-label">${pName}时间占比</div>
      <div class="share-bar">${shares.map(s => `<div style="width:${s.pct}%;background:${s.c}"></div>`).join('')}</div>
      <div>${shares.length ? shares.map(s => `
        <div class="share-row"><span class="dot7" style="background:${s.c}"></span>${esc(s.name)}
          <span class="pc">${s.pct}%</span><span class="hh">${hours1(s.min)} h</span></div>`).join('') :
        `<div class="empty" style="padding:8px 0">暂无时长数据</div>`}</div>
    </div>
  </div>`;
}
function totalShare(min, cards) {
  const t = cards.reduce((s, x) => s + x.min, 0);
  return t ? Math.round(min / t * 100) : 0;
}
function calHtml() {
  const { y, m } = ui.revYM;
  const ds0 = todayStr();
  const first = new Date(y, m - 1, 1);
  const lead = (first.getDay() + 6) % 7; /* 周一起 */
  const nd = daysInMonth(y, m);
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<div class="cell blank"></div>');
  for (let d = 1; d <= nd; d++) {
    const ds = `${y}-${pad(m)}-${pad(d)}`;
    const today = ds === ds0, future = ds > ds0;
    let dots = [];
    if (!future) {
      let l = entriesOn(ds);
      if (ui.revFilter !== 'all') l = l.filter(e => e.catId === ui.revFilter);
      dots = [...new Set(l.map(colorOf))].slice(0, 4);
    }
    cells.push(`<div class="cell${today ? ' today' : ''}${future ? ' future' : ''}">
      <span class="num">${d}</span>
      <span class="dots">${dots.map(c => `<i style="background:${c}"></i>`).join('')}</span></div>`);
  }
  while (cells.length % 7) cells.push('<div class="cell blank"></div>');
  return `<div class="cal-wd"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div>
    <div class="cal">${cells.join('')}</div>`;
}
function miniMonthsHtml(pr) { /* 季/年视图：迷你月份热力格 */
  const ds0 = todayStr();
  const [sy, sm] = pr.start.split('-').map(Number);
  const [ey, em] = pr.end.split('-').map(Number);
  const months = [];
  for (let y = sy, m = sm; y < ey || (y === ey && m <= em); m === 12 ? (m = 1, y++) : m++) months.push({ y, m });
  return `<div class="mini-months">${months.map(({ y, m }) => {
    const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7;
    const nd = daysInMonth(y, m);
    let sq = '';
    for (let i = 0; i < lead; i++) sq += '<i class="blank"></i>';
    for (let d = 1; d <= nd; d++) {
      const ds = `${y}-${pad(m)}-${pad(d)}`;
      let l = ds > ds0 ? [] : entriesOn(ds);
      if (ui.revFilter !== 'all') l = l.filter(e => e.catId === ui.revFilter);
      const cat = ui.revFilter !== 'all' ? catById(ui.revFilter) : null;
      const base = cat ? cat.color : 'var(--ink)';
      const op = l.length ? Math.min(0.25 + l.length * 0.2, 0.95) : 0;
      sq += `<i class="${ds === ds0 ? 'today' : ''}" style="${op ? `background:${base};opacity:${op}` : ''}" title="${ds}${l.length ? ' · ' + l.length + ' 条' : ''}"></i>`;
    }
    return `<div class="mini-m"><div class="mt">${m} 月</div><div class="mini-grid">${sq}</div></div>`;
  }).join('')}</div>`;
}
function weekChart(pr) { /* 近 12 周（或季内各周）每周时长，按类别堆叠 */
  const ds0 = todayStr();
  const endRef = pr.end > ds0 ? ds0 : pr.end;
  const endD = parseDate(endRef);
  const dow = (endD.getDay() + 6) % 7;
  const lastMon = addDays(endRef, -dow);
  const n = 12;
  const cols = [];
  let prevMonth = null;
  const weeks = [];
  for (let i = n - 1; i >= 0; i--) weeks.push(addDays(lastMon, -7 * i));
  let max = 1;
  const catList = cats();
  const rows = weeks.map(mon => {
    const sun = addDays(mon, 6);
    const l = entriesInRange(mon, sun);
    const byCat = catList.map(c => sumMin(l.filter(e => e.catId === c.id)));
    const other = sumMin(l.filter(e => !catById(e.catId)));
    const tot = byCat.reduce((s, v) => s + v, 0) + other;
    max = Math.max(max, tot);
    return { mon, byCat, other };
  });
  for (const r of rows) {
    const mn = Number(r.mon.slice(5, 7));
    const tick = mn !== prevMonth ? `${mn}月` : '';
    prevMonth = mn;
    const segs = r.byCat.map((v, i) => ({ h: Math.round(v / max * 112), c: catList[i].color })).filter(s => s.h > 0);
    if (r.other) segs.push({ h: Math.round(r.other / max * 112), c: '#A69D8C' });
    cols.push({ tick, segs });
  }
  return { title: '近 12 周 · 每周时长（按类别堆叠）', cols };
}
function yearChart(pr) {
  const y = ui.revYM.y;
  const catList = cats();
  let max = 1;
  const rows = [];
  for (let m = 1; m <= 12; m++) {
    const mk = `${y}-${pad(m)}`;
    const l = entries().filter(e => e.date.startsWith(mk));
    const byCat = catList.map(c => sumMin(l.filter(e => e.catId === c.id)));
    const other = sumMin(l.filter(e => !catById(e.catId)));
    max = Math.max(max, byCat.reduce((s, v) => s + v, 0) + other);
    rows.push({ m, byCat, other });
  }
  const cols = rows.map(r => {
    const segs = r.byCat.map((v, i) => ({ h: Math.round(v / max * 112), c: catList[i].color })).filter(s => s.h > 0);
    if (r.other) segs.push({ h: Math.round(r.other / max * 112), c: '#A69D8C' });
    return { tick: r.m + '月', segs };
  });
  return { title: y + ' 年 · 每月时长（按类别堆叠）', cols };
}

/* ---------- 类别 ---------- */
function vCats() {
  const rows = cats().map(c => {
    const l = entries().filter(e => e.catId === c.id);
    const editing = ui.catEditId === c.id;
    return `
    <div class="cat-row" data-cid="${c.id}">
      <button class="swatch" style="background:${c.color}" data-pal="${c.id}" title="换颜色"></button>
      ${editing ? `<input class="nm-in" value="${esc(c.name)}" maxlength="12" data-rename="${c.id}">`
                : `<span class="nm" data-edit-name="${c.id}">${esc(c.name)}</span>`}
      <span class="meta">${l.length} 条 · ${hours1(sumMin(l))} h</span>
      <button class="del" data-del-cat="${c.id}" title="删除类别">✕</button>
    </div>
    ${ui.catPaletteId === c.id ? `<div class="palette">${PALETTE.map(p =>
      `<button class="${p === c.color ? 'on' : ''}" style="background:${p}" data-set-color="${c.id}|${p}"></button>`).join('')}</div>` : ''}`;
  }).join('');
  return `
  <div class="page-head">
    <div class="page-title">类别</div>
    <div class="h-tools"><span class="pill">共 <b>${cats().length}</b> 个 · 可增删改名、选色</span></div>
  </div>
  <div class="card cat-list">
    ${rows}
    ${ui.catAdding ? `
    <div class="cat-row">
      <span class="swatch" style="background:var(--line2)"></span>
      <input class="nm-in" placeholder="类别名称" maxlength="12" data-new-cat autofocus>
    </div>` : `<button class="cat-add" data-act="cat-add">＋ 新增类别</button>`}
  </div>
  <div style="margin-top:16px;font-size:12px;color:var(--faint);line-height:1.9">
    删除类别不会删除已有记录：这些记录会保留原名称、以灰点显示。<br>改名会立即在所有页面生效。
  </div>
  <div style="margin-top:24px"><button class="btn" data-act="open-settings">存储与同步设置</button>
  <button class="btn" data-act="export" style="margin-left:8px">导出备份</button></div>`;
}

/* ================= 弹层（设置 / 记录编辑） ================= */
function openSheet(kind, entry) {
  ui.sheet = kind; ui.sheetEntry = entry || null;
  $('#overlay').hidden = false;
  renderSheet();
}
function closeSheet() {
  ui.sheet = null; ui.sheetEntry = null;
  $('#overlay').hidden = true;
  if (renderQueued) { renderQueued = false; render(); }
}
function renderSheet() {
  if (!ui.sheet) return;
  const sheet = $('#sheet');
  sheet.innerHTML = ui.sheet === 'settings' ? sheetSettingsHtml() : sheetEntryHtml();
  bindSheet(sheet);
}
function sheetSettingsHtml() {
  const c = davCfg() || {};
  const st = statusText();
  const devs = Object.entries(data.devices || {}).sort((a, b) => (b[1].t || 0) - (a[1].t || 0)).slice(0, 8);
  return `
  <button class="x" data-act="close">✕</button>
  <h3>存储与同步</h3>
  <div class="status-ln"><span class="save-line ${st.cls}" style="display:inline-flex"><span class="dot"></span>${st.main}</span><br>${st.sub}</div>

  <h5>浏览器登录同步（推荐）</h5>
  ${cloudEnabled() ? (() => { const g = cloudCfg(); const P = PROVIDERS[g.provider]; return `
    <div class="hint">已登录 <b>${P.label}${g.login ? ' · @' + esc(g.login) : ''}</b>。数据保存在你账号下的<b>私密代码片段</b>里，
    手机、电脑打开本页用同一令牌登录，即可看到同样的数据（约每分钟自动同步，改动后 1 秒内上传）。</div>
    <div class="btns">
      <button class="btn dark" data-act="gh-sync">立即同步</button>
      <button class="btn" data-act="gh-logout">退出登录</button>
    </div>`; })() : (() => { const P = PROVIDERS[ui.cloudProv]; return `
    <div class="hint">登录后数据自动存到你自己账号的<b>私密代码片段</b>——换设备打开本页、粘贴同一个令牌登录即可同步，无需服务器。</div>
    <div class="seg" style="margin:8px 0 10px;display:inline-flex">
      <button class="${ui.cloudProv === 'gitee' ? 'on' : ''}" data-prov="gitee">Gitee 码云（国内）</button>
      <button class="${ui.cloudProv === 'github' ? 'on' : ''}" data-prov="github">GitHub</button>
    </div>
    <div class="hint">${P.netTip}。<br>
    <a href="${P.tokenUrl}" target="_blank" rel="noopener">① 点此创建${P.label}令牌 →</a>（${P.tokenTip}）&nbsp;② 生成后复制，粘贴到下框登录。</div>
    <div class="frow" style="margin-top:8px"><label>${P.label} 令牌（只保存在本设备浏览器里）</label>
      <input class="line" id="gh-token" type="password" placeholder="粘贴令牌…" autocomplete="off" value="${esc(ui.tokenDraft || '')}"></div>
    <div class="btns"><button class="btn dark" data-act="gh-login">登录</button></div>
    <div class="hint" id="gh-msg" style="color:var(--red)"></div>`; })()}

  <h5>本地文件（桌面 Chrome / Edge）</h5>
  ${fsSupported() ? `
    <div class="hint">${fileHandle ? `已连接 <b>${esc(fileInfo ? fileInfo.name : 'records.json')}</b>，每次改动后 1 秒自动写盘。` :
      pendingHandle ? '上次连接的文件需要重新授权。' :
      '把 records.json 放进 iCloud Drive / 坚果云 / OneDrive 同步目录，即得多设备同步。'}</div>
    <div class="btns">
      ${pendingHandle ? `<button class="btn dark" data-act="fs-resume">恢复文件连接</button>` : ''}
      ${fileHandle ? `<button class="btn" data-act="fs-off">断开文件</button>` :
        `<button class="btn dark" data-act="fs-new">新建 records.json</button>
         <button class="btn" data-act="fs-open">连接已有文件</button>`}
    </div>` :
    `<div class="hint">当前浏览器不支持直接读写本地文件（File System Access API，需桌面版 Chrome / Edge）。手机端请用下方 WebDAV 同步。</div>`}

  <h5>WebDAV 同步（手机 + 电脑通用）</h5>
  <div class="frow"><label>文件完整地址（例：https://dav.jianguoyun.com/dav/留痕/records.json）</label>
    <input class="line" id="dav-url" value="${esc(c.url || '')}" placeholder="https://…/records.json"></div>
  <div class="frow"><label>账号</label><input class="line" id="dav-user" value="${esc(c.user || '')}" autocomplete="off"></div>
  <div class="frow"><label>密码（坚果云请用「应用密码」）</label><input class="line" type="password" id="dav-pass" value="${esc(c.pass || '')}" autocomplete="off"></div>
  <div class="btns">
    <button class="btn dark" data-act="dav-save">保存并立即同步</button>
    ${davEnabled() ? `<button class="btn" data-act="dav-off">停用 WebDAV</button>` : ''}
  </div>
  <div class="hint">多端以每条记录的 updatedAt「新者胜」自动合并，不会互相覆盖。若浏览器控制台提示 CORS 被拦截，需服务端允许跨域（自建 dufs / alist 均可），或把本应用与 WebDAV 部署在同一域名下。</div>

  <h5>数据</h5>
  <div class="btns">
    <button class="btn" data-act="export">导出备份 JSON</button>
    <button class="btn" data-act="import">导入备份（合并）</button>
    <button class="btn" data-act="csv-all">导出全部 CSV</button>
  </div>
  <input type="file" id="imp-file" accept=".json,application/json" hidden>

  ${devs.length ? `<h5>出现过的设备</h5>${devs.map(([id, d]) =>
    `<div class="dev"><span>${esc(d.name || '设备')}${id === deviceId() ? '（本机）' : ''}</span><span class="tm">${timeAgo(d.t)}</span></div>`).join('')}` : ''}
  `;
}
function sheetEntryHtml() {
  const e = ui.sheetEntry;
  return `
  <button class="x" data-act="close">✕</button>
  <h3>编辑记录</h3>
  <h5>类别</h5>
  <div class="chips" id="se-chips">${catChipsHtml(e.catId, false)}</div>
  <div class="frow" style="margin-top:14px"><label>内容</label><input class="line" id="se-note" value="${esc(e.note)}" maxlength="200"></div>
  <div style="display:flex;gap:12px">
    <div class="frow" style="flex:1"><label>日期</label><input class="line" type="date" id="se-date" value="${esc(e.date)}"></div>
    <div class="frow" style="flex:1"><label>时间</label><input class="line" type="time" id="se-time" value="${esc(e.time)}"></div>
  </div>
  <div style="display:flex;gap:12px">
    <div class="frow" style="width:100px"><label>分钟</label><input class="line" id="se-min" inputmode="numeric" value="${e.min || ''}"></div>
    <div class="frow" style="flex:1"><label>指标（可选）</label><input class="line" id="se-metric" value="${esc(e.metric)}" maxlength="120"></div>
  </div>
  <div class="btns" style="justify-content:space-between">
    <button class="btn danger" data-act="se-del">删除</button>
    <button class="btn dark" data-act="se-save" style="padding:7px 26px">保存</button>
  </div>`;
}
function bindSheet(sheet) {
  sheet.onclick = ev => {
    const pv = ev.target.closest('[data-prov]');
    if (pv) {
      const inp = $('#gh-token', sheet);
      ui.tokenDraft = inp ? inp.value : ui.tokenDraft;
      ui.cloudProv = pv.dataset.prov; renderSheet(); return;
    }
    const t = ev.target.closest('[data-act],[data-cat]');
    if (!t) return;
    if (t.dataset.cat) { /* 编辑弹层里的类别选择 */
      ui.sheetEntry = Object.assign({}, ui.sheetEntry, { catId: t.dataset.cat });
      const vals = readSheetEntry(sheet);
      ui.sheetEntry = Object.assign(ui.sheetEntry, vals);
      renderSheet(); return;
    }
    const act = t.dataset.act;
    if (act === 'close') closeSheet();
    else if (act === 'gh-login') {
      const inp = $('#gh-token', sheet), msg = $('#gh-msg', sheet);
      ui.tokenDraft = inp ? inp.value : '';
      t.disabled = true; t.textContent = '正在登录…'; if (msg) msg.textContent = '';
      cloudLogin(ui.cloudProv, inp ? inp.value : '').then(() => { ui.tokenDraft = ''; renderSheet(); }).catch(e => {
        t.disabled = false; t.textContent = '登录';
        if (msg) msg.textContent = e.message || String(e);
      });
    }
    else if (act === 'gh-logout') { if (confirm('退出登录？本机数据保留，云端数据不会删除。')) { cloudLogout(); renderSheet(); } }
    else if (act === 'gh-sync') { t.textContent = '同步中…'; syncNow().then(() => renderSheet()); }
    else if (act === 'fs-new') connectFile(true);
    else if (act === 'fs-open') connectFile(false);
    else if (act === 'fs-off') disconnectFile();
    else if (act === 'fs-resume') resumeFile();
    else if (act === 'dav-save') {
      const url = $('#dav-url', sheet).value.trim();
      if (!url) { alert('请填写 WebDAV 文件完整地址'); return; }
      davSave({ url, user: $('#dav-user', sheet).value.trim(), pass: $('#dav-pass', sheet).value });
      syncNow().then(renderSheet);
    }
    else if (act === 'dav-off') { davSave(null); syncErr = null; updateStatusUi(); renderSheet(); }
    else if (act === 'export') exportBackup();
    else if (act === 'csv-all') exportCsv(entries().sort((a, b) => (a.date + a.time) < (b.date + b.time) ? -1 : 1), '全部');
    else if (act === 'import') $('#imp-file', sheet).click();
    else if (act === 'se-save') {
      const vals = readSheetEntry(sheet);
      updateEntry(ui.sheetEntry.id, Object.assign({ catId: ui.sheetEntry.catId }, vals));
      closeSheet();
    }
    else if (act === 'se-del') {
      if (confirm('删除这条记录？')) { deleteEntry(ui.sheetEntry.id); closeSheet(); }
    }
  };
  const imp = $('#imp-file', sheet);
  if (imp) imp.onchange = () => { if (imp.files[0]) importBackup(imp.files[0]); };
  const tok = $('#gh-token', sheet);
  if (tok) tok.onkeydown = ev => {
    if (ev.key === 'Enter' && !ev.isComposing) { const b = $('[data-act="gh-login"]', sheet); if (b) b.click(); }
  };
}
function readSheetEntry(sheet) {
  return {
    note: $('#se-note', sheet) ? $('#se-note', sheet).value : ui.sheetEntry.note,
    date: $('#se-date', sheet) ? ($('#se-date', sheet).value || ui.sheetEntry.date) : ui.sheetEntry.date,
    time: $('#se-time', sheet) ? ($('#se-time', sheet).value || ui.sheetEntry.time) : ui.sheetEntry.time,
    min: $('#se-min', sheet) ? $('#se-min', sheet).value : ui.sheetEntry.min,
    metric: $('#se-metric', sheet) ? $('#se-metric', sheet).value : ui.sheetEntry.metric
  };
}

/* ================= 页面事件 ================= */
function quickSave() {
  const note = $('#q-note').value.trim();
  const min = $('#q-min').value.trim();
  const metric = $('#q-metric').value.trim();
  if (!note && !min && !metric) { $('#q-note').focus(); return; }
  if (!ui.quickCat || !catById(ui.quickCat)) ui.quickCat = (cats()[0] || {}).id || '';
  addEntry({ catId: ui.quickCat, note, min, metric });
  const n = $('#q-note'); if (n) n.focus();
}
let lastRowSave = { id: null, t: 0 };
function saveEditingRow(row) {
  const id = row.dataset.eid;
  lastRowSave = { id, t: Date.now() };
  ui.editingId = null; /* 先退出编辑态，updateEntry 内的 render 才会画普通行 */
  updateEntry(id, {
    date: $('.e-date', row).value || todayStr(),
    time: $('.e-time', row).value || '00:00',
    catId: $('.e-cat', row).value,
    note: $('.e-note', row).value.trim(),
    min: $('.e-min', row).value,
    metric: $('.e-metric', row).value.trim()
  });
}
function bindPage(main) {
  main.onclick = ev => {
    const t = ev.target;
    const actEl = t.closest('[data-act]');
    const act = actEl && actEl.dataset.act;

    /* 通用动作 */
    if (act === 'open-settings') { openSheet('settings'); return; }
    if (act === 'export') { exportBackup(); return; }
    if (act === 'go-review') { go('review'); return; }
    if (act === 'focus-note') { const n = $('#q-note'); if (n) { n.focus(); n.scrollIntoView({ block: 'center' }); } return; }

    /* 今日：类别 chips */
    const chip = t.closest('#q-chips [data-cat]');
    if (chip) { ui.quickCat = chip.dataset.cat; render(); $('#q-note').focus(); return; }
    if (act === 'add-cat') { go('cats'); ui.catAdding = true; return; }

    /* 今日列表 / 移动端表格行 → 编辑弹层；桌面表格行 → 行内编辑 */
    const del = t.closest('[data-del]');
    if (del) { ev.stopPropagation(); if (confirm('删除这条记录？')) deleteEntry(del.dataset.del); return; }
    const editRow = t.closest('[data-edit]');
    if (editRow) {
      const e = data.entries.find(x => x.id === editRow.dataset.edit);
      if (!e) return;
      /* 刚保存的行：吞掉紧随其后的同一次点击，避免重新进入编辑态 */
      if (lastRowSave.id === e.id && Date.now() - lastRowSave.t < 500) return;
      if (ui.page === 'table' && !isMobile()) {
        if (ui.editingId && ui.editingId !== e.id) { const r = $('.tr.editing'); if (r) saveEditingRow(r); }
        ui.editingId = e.id; render();
        const inp = $('.tr.editing .e-note'); if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
      } else {
        openSheet('entry', Object.assign({}, e));
      }
      return;
    }
    if (act === 'row-save') { const r = t.closest('.tr.editing'); if (r) { saveEditingRow(r); } return; }

    /* 记录表 */
    if (act === 'tbl-prev' || act === 'tbl-next') {
      const d = new Date(ui.tableYM.y, ui.tableYM.m - 1 + (act === 'tbl-next' ? 1 : -1), 1);
      ui.tableYM = { y: d.getFullYear(), m: d.getMonth() + 1 }; ui.editingId = null; render(); return;
    }
    const tf = t.closest('[data-tf]');
    if (tf) { ui.tableFilter = tf.dataset.tf; ui.editingId = null; render(); return; }
    if (act === 'csv') { exportCsv(tableList(), `${ui.tableYM.y}-${pad(ui.tableYM.m)}`); return; }

    /* 复盘 */
    if (act === 'rv-prev' || act === 'rv-next') { periodShift(act === 'rv-next' ? 1 : -1); render(); return; }
    const pd = t.closest('[data-period]');
    if (pd) { ui.revPeriod = pd.dataset.period; render(); return; }
    const rf = t.closest('[data-rf]');
    if (rf) { ui.revFilter = rf.dataset.rf; render(); return; }

    /* 类别 */
    if (act === 'cat-add') { ui.catAdding = true; render(); const i = $('[data-new-cat]'); if (i) i.focus(); return; }
    const pal = t.closest('[data-pal]');
    if (pal) { ui.catPaletteId = ui.catPaletteId === pal.dataset.pal ? null : pal.dataset.pal; render(); return; }
    const sc = t.closest('[data-set-color]');
    if (sc) { const [id, color] = sc.dataset.setColor.split('|'); ui.catPaletteId = null; updateCategory(id, { color }); return; }
    const en = t.closest('[data-edit-name]');
    if (en) { ui.catEditId = en.dataset.editName; render(); const i = $('[data-rename]'); if (i) { i.focus(); i.select(); } return; }
    const dc = t.closest('[data-del-cat]');
    if (dc) {
      const id = dc.dataset.delCat;
      const c = catById(id); if (!c) return;
      const n = entries().filter(e => e.catId === id).length;
      if (confirm(n ? `「${c.name}」下有 ${n} 条记录，删除类别后记录保留并显示原名称。确定删除？` : `删除类别「${c.name}」？`)) deleteCategory(id);
      return;
    }
  };

  main.onkeydown = ev => {
    if (ev.key === 'Enter' && !ev.isComposing) {
      if (ev.target.closest && ev.target.closest('.qcard')) { ev.preventDefault(); quickSave(); return; }
      const r = ev.target.closest && ev.target.closest('.tr.editing');
      if (r) { ev.preventDefault(); saveEditingRow(r); return; }
      if (ev.target.dataset && ev.target.dataset.newCat !== undefined) {
        const v = ev.target.value.trim();
        ui.catAdding = false;
        if (v) addCategory(v); else render();
        return;
      }
      if (ev.target.dataset && ev.target.dataset.rename) {
        const v = ev.target.value.trim(); const id = ev.target.dataset.rename;
        ui.catEditId = null;
        if (v) updateCategory(id, { name: v }); else render();
        return;
      }
    }
    if (ev.key === 'Escape') {
      if (ui.editingId) { ui.editingId = null; render(); }
      if (ui.catEditId) { ui.catEditId = null; render(); }
      if (ui.catAdding) { ui.catAdding = false; render(); }
    }
  };

  /* 行内编辑 / 类别改名：失焦落到编辑区外时自动保存 */
  main.addEventListener('focusout', ev => {
    setTimeout(() => {
      const ae = document.activeElement;
      const r = $('.tr.editing');
      if (r && ui.editingId && (!ae || !r.contains(ae))) saveEditingRow(r) || render();
      const ren = $('[data-rename]');
      if (ren && (!ae || ae !== ren)) {
        const v = ren.value.trim(); const id = ren.dataset.rename;
        ui.catEditId = null;
        if (v) updateCategory(id, { name: v }); else render();
      }
      const nc = $('[data-new-cat]');
      if (nc && (!ae || ae !== nc)) {
        const v = nc.value.trim();
        ui.catAdding = false;
        if (v) addCategory(v); else render();
      }
    }, 100);
  });

  const q = $('#tbl-q');
  if (q) q.oninput = debounce(() => { ui.tableQ = q.value.trim(); const foc = q === document.activeElement; render(); if (foc) { const q2 = $('#tbl-q'); q2.focus(); q2.setSelectionRange(q2.value.length, q2.value.length); } }, 250);

  const qs = $('#q-save');
  if (qs) qs.onclick = quickSave;
}

/* ================= 启动 ================= */
$$('#nav button,#tabbar button').forEach(b => b.onclick = () => go(b.dataset.nav));
$('#side-foot').onclick = ev => { if (!ev.target.closest('#btn-export')) openSheet('settings'); };
$('#btn-export').onclick = ev => { ev.stopPropagation(); exportBackup(); };
$('#overlay').onclick = ev => { if (ev.target.id === 'overlay') closeSheet(); };
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && ui.sheet) closeSheet(); });

if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

applyHash();
initFile();
if (davEnabled() || cloudEnabled()) syncNow();
