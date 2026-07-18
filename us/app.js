'use strict';
/* 我们的小想法 · 两个人共用的想法流
 * 零后端：双方粘贴同一个 Gitee/GitHub 令牌 → 数据存同一个私密 Gist，双方可看可编辑。
 * 合并：想法按 id · updatedAt 新者胜；❤️ 按人、回复按条独立合并，互不覆盖。
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

/* ================= state / store ================= */
const LS_KEY = 'us.data.v1';
const LS_ME = 'us.me.v1';
const LS_DEV = 'us.dev.v1';
const LS_CLOUD = 'us.cloud.v1';
const LS_LOCAL = 'us.localonly.v1'; /* 「先本机试用」标记 */
const PALETTE = ['#C0502C', '#B04A5A', '#33587A', '#4A7051', '#B07C2A', '#7A4A6F', '#2C7A8C', '#5B6B2C'];

function freshData() {
  return { app: 'us-thoughts', version: 1, profiles: {}, thoughts: [], devices: {} };
}
function normalize(d) {
  if (!d || typeof d !== 'object') return null;
  const out = freshData();
  out.profiles = (d.profiles && typeof d.profiles === 'object') ? d.profiles : {};
  out.thoughts = Array.isArray(d.thoughts) ? d.thoughts.filter(t => t && t.id) : [];
  out.devices = (d.devices && typeof d.devices === 'object') ? d.devices : {};
  return out;
}
let data = (() => {
  try { const v = normalize(JSON.parse(localStorage.getItem(LS_KEY))); if (v) return v; } catch (e) { /* 损坏则重建 */ }
  return freshData();
})();

const thoughts = () => data.thoughts.filter(t => !t.deleted);
const me = () => localStorage.getItem(LS_ME) || '';
const profileOf = name => (data.profiles[name]) || null;
const colorOf = name => { const p = profileOf(name); return p && p.color ? p.color : '#A69D8C'; };

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

/* --- 深度合并：想法正文按 updatedAt 新者胜；❤️ 按人、回复按条各自合并 --- */
function mergeThought(x, y) {
  const t = Object.assign({}, (y.updatedAt || 0) > (x.updatedAt || 0) ? y : x);
  const hearts = Object.assign({}, x.hearts || {});
  for (const [k, v] of Object.entries(y.hearts || {})) {
    if (!hearts[k] || (v.at || 0) > (hearts[k].at || 0)) hearts[k] = v;
  }
  t.hearts = hearts;
  const m = new Map((x.replies || []).filter(r => r && r.id).map(r => [r.id, r]));
  for (const r of (y.replies || [])) {
    if (!r || !r.id) continue;
    const p = m.get(r.id);
    if (!p || (r.updatedAt || 0) > (p.updatedAt || 0)) m.set(r.id, r);
  }
  t.replies = Array.from(m.values()).sort((a, b) => (a.ts || 0) - (b.ts || 0));
  return t;
}
function mergeData(a, b) {
  const profiles = Object.assign({}, a.profiles || {});
  for (const [k, v] of Object.entries(b.profiles || {})) {
    if (!profiles[k] || (v.updatedAt || 0) > (profiles[k].updatedAt || 0)) profiles[k] = v;
  }
  const m = new Map((a.thoughts || []).map(t => [t.id, t]));
  for (const y of (b.thoughts || [])) {
    if (!y || !y.id) continue;
    const x = m.get(y.id);
    m.set(y.id, x ? mergeThought(x, y) : y);
  }
  const devices = Object.assign({}, a.devices || {});
  for (const [k, v] of Object.entries(b.devices || {})) {
    if (!devices[k] || (v.t || 0) > (devices[k].t || 0)) devices[k] = v;
  }
  return { app: 'us-thoughts', version: 1, profiles, thoughts: Array.from(m.values()), devices };
}
/* 规范化指纹：字段序、键序固定，避免两端因对象键顺序不同而互相误判「有变化」 */
const canon = d => JSON.stringify({
  p: Object.entries(d.profiles || {}).sort().map(([k, v]) => [k, v.color, v.updatedAt || 0]),
  t: (d.thoughts || []).slice().sort((a, b) => a.id < b.id ? -1 : 1).map(t => [
    t.id, t.author, t.text, t.ts || 0, t.updatedAt || 0, !!t.deleted,
    t.textColor || '', t.img ? [t.img.id, !!t.img.pending] : 0,
    Object.entries(t.hearts || {}).sort().map(([k, v]) => [k, !!v.on, v.at || 0]),
    (t.replies || []).slice().sort((a, b) => a.id < b.id ? -1 : 1)
      .map(r => [r.id, r.author, r.text, r.ts || 0, r.updatedAt || 0, !!r.deleted])
  ])
});
function purgeTombstones() { /* 90 天前的删除墓碑清理，避免无限增长 */
  const lim = Date.now() - 90 * 864e5;
  data.thoughts = data.thoughts.filter(t => !(t.deleted && (t.updatedAt || 0) < lim));
  for (const t of data.thoughts) {
    if (t.replies) t.replies = t.replies.filter(r => !(r.deleted && (r.updatedAt || 0) < lim));
  }
}
function serialize() { return JSON.stringify(data, null, 1); }
function saveLocal() { try { localStorage.setItem(LS_KEY, serialize()); } catch (e) { console.warn(e); } }

/* --- 迷你 IndexedDB：图片缓存（图片不进 localStorage，避免撑爆配额） --- */
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('us', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbGet(k) { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction('kv').objectStore('kv').get(k); t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error); }); }
async function idbSet(k, v) { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite').objectStore('kv').put(v, k); t.onsuccess = () => res(); t.onerror = () => rej(t.error); }); }
async function idbDel(k) { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite').objectStore('kv').delete(k); t.onsuccess = () => res(); t.onerror = () => rej(t.error); }); }

let lastSavedAt = Number(localStorage.getItem('us.savedAt') || 0);
function commit() {
  data.devices[deviceId()] = { name: deviceName(), me: me(), t: Date.now() };
  purgeTombstones();
  saveLocal();
  lastSavedAt = Date.now(); localStorage.setItem('us.savedAt', String(lastSavedAt));
  scheduleSync();
  render();
}
function absorbRemote(merged) {
  if (canon(merged) === canon(data)) { data.devices = merged.devices || data.devices; return false; }
  data = merged; saveLocal(); safeRender(); return true;
}

/* --- 数据操作 --- */
function setProfile(name, color) {
  data.profiles[name] = { color, updatedAt: Date.now() };
  localStorage.setItem(LS_ME, name);
  commit();
}
function addThought(text, img, textColor) {
  text = (text || '').trim(); if (!text && !img) return;
  data.thoughts.push({
    id: uuid(), author: me(), text, textColor: textColor || '', img: img || null,
    ts: Date.now(), updatedAt: Date.now(),
    deleted: false, hearts: {}, replies: []
  });
  commit();
}
function updateThought(id, patch) {
  const t = data.thoughts.find(x => x.id === id); if (!t) return;
  if (patch.text !== undefined) t.text = patch.text.trim();
  if (patch.textColor !== undefined) t.textColor = patch.textColor;
  if (patch.removeImg && t.img) { discardImage(t.img); t.img = null; }
  if (!t.text && !t.img) { t.deleted = true; } /* 文字图片都没了 = 删除 */
  t.updatedAt = Date.now();
  commit();
}
function deleteThought(id) {
  const t = data.thoughts.find(x => x.id === id); if (!t) return;
  if (t.img) { discardImage(t.img); t.img = null; }
  t.deleted = true; t.updatedAt = Date.now(); commit();
}
function toggleHeart(id) {
  const t = data.thoughts.find(x => x.id === id); if (!t) return;
  if (!t.hearts) t.hearts = {};
  const cur = t.hearts[me()];
  t.hearts[me()] = { on: !(cur && cur.on), at: Date.now() };
  commit();
}
function addReply(tid, text) {
  const t = data.thoughts.find(x => x.id === tid); if (!t) return;
  text = (text || '').trim(); if (!text) return;
  if (!t.replies) t.replies = [];
  t.replies.push({ id: uuid(), author: me(), text, ts: Date.now(), updatedAt: Date.now(), deleted: false });
  commit();
}
function deleteReply(tid, rid) {
  const t = data.thoughts.find(x => x.id === tid); if (!t) return;
  const r = (t.replies || []).find(x => x.id === rid); if (!r) return;
  r.deleted = true; r.updatedAt = Date.now(); commit();
}

/* ================= 同步引擎：Gitee / GitHub 私密 Gist ================= */
const CLOUD_DESC = '我们的小想法 us-thoughts（请勿删除 / do not delete）';
const PROVIDERS = {
  gitee: {
    label: 'Gitee 码云', api: 'https://gitee.com/api/v5', authQuery: true,
    tokenUrl: 'https://gitee.com/profile/personal_access_tokens/new',
    tokenTip: '私人令牌，只勾选 <b>gists</b> 权限', netTip: '国内手机、电脑直连，无需翻墙'
  },
  github: {
    label: 'GitHub', api: 'https://api.github.com', authQuery: false,
    tokenUrl: 'https://github.com/settings/tokens/new?scopes=gist&description=us-thoughts',
    tokenTip: '经典令牌，只勾选 <b>gist</b> 权限', netTip: '国内直连可能不稳定，适合能访问 GitHub 的环境'
  }
};
function cloudCfg() { try { return JSON.parse(localStorage.getItem(LS_CLOUD)) || null; } catch (e) { return null; } }
function cloudEnabled() { const c = cloudCfg(); return !!(c && c.token && c.gistId && PROVIDERS[c.provider]); }
function cloudSave(c) { if (c) localStorage.setItem(LS_CLOUD, JSON.stringify(c)); else localStorage.removeItem(LS_CLOUD); }
let cloudLastOk = 0, syncBusy = false, syncQueued = false, syncErr = null;

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
  let g = (Array.isArray(gists) ? gists : []).find(x => x.files && x.files['us-thoughts.json'] && /us-thoughts/.test(x.description || ''));
  if (!g) {
    const rc = await cloudReq(provider, token, '/gists', {
      method: 'POST',
      body: JSON.stringify({ description: CLOUD_DESC, public: false, files: { 'us-thoughts.json': { content: serialize() } } })
    });
    if (!rc.ok) throw new Error('创建云端数据失败（HTTP ' + rc.status + '，令牌需要 gists 读写权限）');
    g = await rc.json();
  }
  cloudSave({ provider, token, login, gistId: g.id });
  localStorage.removeItem(LS_LOCAL);
  syncErr = null;
  await syncNow();
}
function cloudLogout() {
  cloudSave(null); cloudLastOk = 0; syncErr = null;
  localStorage.setItem(LS_LOCAL, '1'); /* 退出后仍可离线用，设置里可重新登录 */
  render();
}
async function gistSyncOnce() {
  const c = cloudCfg(); if (!c) return;
  const P = PROVIDERS[c.provider];
  const r = await cloudReq(c.provider, c.token, '/gists/' + c.gistId);
  if (r.status === 401) throw new Error(P.label + ' 令牌失效，请在设置里重新登录');
  if (r.status === 404) throw new Error('云端数据不存在（代码片段可能被删除），请退出后重新登录');
  if (!r.ok) throw new Error(P.label + ' 读取失败 HTTP ' + r.status);
  const g = await r.json();
  const f = g.files && g.files['us-thoughts.json'];
  let remote = null;
  if (f) {
    let txt = f.content;
    if (f.truncated && f.raw_url) { const rr = await fetch(f.raw_url, { cache: 'no-store' }); if (rr.ok) txt = await rr.text(); }
    try { remote = normalize(JSON.parse(txt)); } catch (e) { /* 云端损坏则覆盖 */ }
  }
  if (remote) absorbRemote(mergeData(data, remote));
  if (!remote || canon(remote) !== canon(data)) {
    const p = await cloudReq(c.provider, c.token, '/gists/' + c.gistId, {
      method: 'PATCH',
      body: JSON.stringify({ description: CLOUD_DESC, files: { 'us-thoughts.json': { content: serialize() } } })
    });
    if (!p.ok) throw new Error(P.label + ' 写入失败 HTTP ' + p.status);
    lastSavedAt = Date.now(); localStorage.setItem('us.savedAt', String(lastSavedAt));
  }
  cloudLastOk = Date.now();
}
const scheduleSync = debounce(() => syncNow(), 800);
async function syncNow() {
  if (!cloudEnabled()) { updateStatusUi(); return; }
  if (syncBusy) { syncQueued = true; return; }
  syncBusy = true; syncErr = null; updateStatusUi();
  try { await uploadPendingImages(); await gistSyncOnce(); }
  catch (e) { syncErr = (e && e.message) ? e.message : String(e); console.warn('sync:', e); }
  syncBusy = false;
  updateStatusUi();
  if (syncQueued) { syncQueued = false; syncNow(); }
}

/* ================= 图片：压缩 → 独立私密 Gist（主数据保持轻量） ================= */
const IMG_DESC = 'us-thoughts-img（想法配图，请勿删除 / do not delete）';
function compressImage(file) { /* 长边 ≤1280、逐步降质，确保 <700KB，不触发 Gist 截断 */
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      let max = 1280, q = 0.82;
      const attempt = () => {
        const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(img.naturalWidth * scale));
        cv.height = Math.max(1, Math.round(img.naturalHeight * scale));
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        const url = cv.toDataURL('image/jpeg', q);
        if (url.length > 700 * 1024 && (max > 640 || q > 0.5)) {
          max = Math.max(640, Math.round(max * 0.8)); q = Math.max(0.5, q - 0.08); attempt();
        } else res({ url, w: cv.width, h: cv.height });
      };
      attempt();
    };
    img.onerror = () => rej(new Error('无法读取这张图片'));
    img.src = URL.createObjectURL(file);
  });
}
function discardImage(img) { /* 删除想法/移除配图时清理：本地缓存 + 云端 Gist（尽力而为） */
  idbDel('img:' + img.id).catch(() => {});
  if (!img.pending && cloudEnabled()) {
    const c = cloudCfg();
    cloudReq(c.provider, c.token, '/gists/' + img.id, { method: 'DELETE' }).catch(() => {});
  }
}
async function uploadPendingImages() { /* 待上传的本机图片 → 各自建私密 Gist */
  if (!cloudEnabled()) return;
  const c = cloudCfg();
  for (const t of data.thoughts) {
    if (!t.img || !t.img.pending || t.deleted) continue;
    const dataUrl = await idbGet('img:' + t.img.id).catch(() => null);
    if (!dataUrl) { t.img = null; t.updatedAt = Date.now(); saveLocal(); continue; }
    const r = await cloudReq(c.provider, c.token, '/gists', {
      method: 'POST',
      body: JSON.stringify({ description: IMG_DESC, public: false, files: { 'img.txt': { content: dataUrl } } })
    });
    if (!r.ok) throw new Error('图片上传失败（HTTP ' + r.status + '）');
    const gid = (await r.json()).id;
    await idbSet('img:' + gid, dataUrl).catch(() => {});
    await idbDel('img:' + t.img.id).catch(() => {});
    t.img = { id: gid, w: t.img.w, h: t.img.h };
    t.updatedAt = Date.now();
    saveLocal();
  }
}
async function fetchImage(id) { /* 本地缓存优先，miss 则从 Gist 拉取并缓存 */
  const hit = await idbGet('img:' + id).catch(() => null);
  if (hit) return hit;
  if (id.charAt(0) === 'l' || !cloudEnabled()) return null; /* 待上传的图只有作者设备有 */
  const c = cloudCfg();
  const r = await cloudReq(c.provider, c.token, '/gists/' + id).catch(() => null);
  if (!r || !r.ok) return null;
  const g = await r.json();
  const f = g.files && g.files['img.txt'];
  if (!f) return null;
  let txt = f.content;
  if ((!txt || f.truncated) && f.raw_url) {
    const u = new URL(f.raw_url);
    if (PROVIDERS[c.provider].authQuery) u.searchParams.set('access_token', c.token);
    const rr = await fetch(u.toString(), { cache: 'no-store' }).catch(() => null);
    if (rr && rr.ok) txt = await rr.text();
  }
  if (txt && /^data:image\//.test(txt)) { await idbSet('img:' + id, txt).catch(() => {}); return txt; }
  return null;
}
const hydrating = new Set();
function hydrateImages() { /* 渲染后异步填充图片，只改 DOM 属性，不打断输入 */
  $$('.ph[data-gist]').forEach(el => {
    const id = el.dataset.gist;
    if (el.dataset.done || hydrating.has(id)) return;
    hydrating.add(id);
    fetchImage(id).then(url => {
      hydrating.delete(id);
      $$(`.ph[data-gist="${id}"]`).forEach(el2 => {
        if (el2.dataset.done) return;
        if (url) { el2.dataset.done = '1'; el2.classList.add('ld'); el2.innerHTML = `<img src="${url}" alt="">`; }
        else { const s = $('span', el2); if (s) s.textContent = el2.dataset.pending ? '图片同步中，等 TA 的设备在线…' : '图片加载失败，稍后自动重试'; }
      });
    }).catch(() => hydrating.delete(id));
  });
}
/* 轮询 + 焦点拉取：对方发的想法尽快出现 */
setInterval(() => { if (cloudEnabled() && !syncBusy && Date.now() - cloudLastOk > 30000) syncNow(); }, 10000);
window.addEventListener('focus', () => syncNow());
document.addEventListener('visibilitychange', () => { if (!document.hidden) syncNow(); });

/* ================= 导入 / 导出 ================= */
function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
function exportBackup() {
  const d = new Date();
  download(`小想法备份-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.json`, serialize());
}
function importBackup(file) {
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const remote = normalize(JSON.parse(rd.result));
      if (!remote) throw new Error('bad');
      data = mergeData(data, remote);
      commit();
      alert('导入完成，已自动合并（不覆盖现有内容）。');
    } catch (e) { alert('导入失败：不是有效的小想法备份 JSON 文件'); }
  };
  rd.readAsText(file);
}

/* ================= UI ================= */
const TC = ['#1C1A17', '#C0502C', '#B04A5A', '#33587A', '#4A7051', '#B07C2A', '#7A4A6F', '#2C7A8C']; /* 字体颜色，首个为默认墨色 */
const ui = {
  gate: null,           /* null=自动 | 'setup' | 'who' 强制显示某个门 */
  cloudProv: 'gitee', tokenDraft: '', gateErr: '', gateBusy: false,
  whoName: '', whoColor: '',
  draft: '',            /* 想法输入框草稿，跨渲染保留 */
  cmpColor: localStorage.getItem('us.tc.v1') || TC[0],
  cmpImg: null,         /* 待发布配图 {url,w,h} */
  editingId: null, editDraft: '', editColor: TC[0], editRemoveImg: false,
  replyTo: null, replyDraft: '',
  actsOn: null,         /* 手机上点开操作按钮的卡片 */
  sheet: false
};
function view() {
  if (ui.gate) return ui.gate;
  if (!cloudEnabled() && !localStorage.getItem(LS_LOCAL)) return 'setup';
  if (!me() || !profileOf(me())) return 'who';
  return 'main';
}

/* --- 时间显示 --- */
function dayKey(ts) { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function dayLabel(key) {
  const now = new Date();
  const today = dayKey(now.getTime());
  const yest = dayKey(now.getTime() - 864e5);
  const [y, m, d] = key.split('-').map(Number);
  const wd = WD[new Date(y, m - 1, d).getDay()];
  const md = `${m}月${d}日 周${wd}`;
  if (key === today) return `今天 · ${md}`;
  if (key === yest) return `昨天 · ${md}`;
  return y === now.getFullYear() ? md : `${y}年${md}`;
}
function timeStr(ts) {
  const diff = Date.now() - ts;
  if (diff < 60e3) return '刚刚';
  if (diff < 3600e3 && dayKey(ts) === dayKey(Date.now())) return Math.floor(diff / 60e3) + ' 分钟前';
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* --- 状态条 --- */
function statusText() {
  if (syncErr) return { cls: 'err', txt: '同步失败', title: syncErr };
  if (syncBusy) return { cls: 'busy', txt: '同步中…', title: '' };
  if (cloudEnabled()) {
    const c = cloudCfg();
    return { cls: '', txt: '已同步', title: PROVIDERS[c.provider].label + (c.login ? ' · @' + c.login : '') };
  }
  return { cls: 'off', txt: '仅本机', title: '未登录，数据只存在这台设备' };
}
function updateStatusUi() {
  const st = statusText();
  const chip = $('#st-chip');
  chip.className = 'save-line ' + st.cls;
  chip.title = st.title;
  $('#st-text').textContent = st.txt;
}

/* --- 视图：登录 --- */
function vSetup() {
  const P = PROVIDERS[ui.cloudProv];
  return `
  <div class="card gate">
    <h2>两个人，一个本子</h2>
    <p class="lead">一人创建一个令牌，<b>两个人粘贴同一个令牌登录</b>，就共用同一份私密云端数据——都能看到、都能写、都能回应。数据只存在这个账号的私密代码片段里，别人看不到。</p>
    <div class="provs">
      ${Object.entries(PROVIDERS).map(([k, p]) =>
        `<button class="${ui.cloudProv === k ? 'on' : ''}" data-prov="${k}">${p.label}${k === 'gitee' ? '（国内推荐）' : ''}</button>`).join('')}
    </div>
    <div class="token-row">
      <input class="line" id="g-token" type="password" placeholder="粘贴${P.label}令牌" value="${esc(ui.tokenDraft)}" autocomplete="off">
      <button class="btn dark" id="g-login" ${ui.gateBusy ? 'disabled' : ''}>${ui.gateBusy ? '登录中…' : '登录'}</button>
    </div>
    ${ui.gateErr ? `<div class="err-msg">${esc(ui.gateErr)}</div>` : ''}
    <div class="tip">
      还没有令牌？<a href="${P.tokenUrl}" target="_blank" rel="noopener">点这里去创建 →</a>（${P.tokenTip}）<br>
      创建好后把令牌发给对方一份，两个人各自粘贴登录即可。${P.netTip}。<br>
      令牌只保存在你们各自设备的浏览器里，不会上传到别处。
    </div>
    <button class="alt" id="g-skip">先在本机试用，稍后再登录 →</button>
  </div>`;
}

/* --- 视图：选身份 --- */
function vWho() {
  const names = Object.keys(data.profiles || {});
  const used = new Set(names.map(n => colorOf(n)));
  if (!ui.whoColor) ui.whoColor = PALETTE.find(c => !used.has(c)) || PALETTE[0];
  return `
  <div class="card gate">
    <h2>你是谁？</h2>
    <p class="lead">选择或创建你的身份，想法会以这个名字署名。同一个人在手机和电脑上用同一个名字即可。</p>
    ${names.length ? `
    <div class="who-list">
      ${names.map(n => `<button data-who="${esc(n)}"><span class="dot8" style="background:${colorOf(n)}"></span>${esc(n)}</button>`).join('')}
    </div>
    <div class="sec-label">或创建新身份</div>` : ''}
    <input class="line" id="who-name" placeholder="你的名字（如：阿宛）" value="${esc(ui.whoName)}" maxlength="12">
    <div class="swatches">
      ${PALETTE.map(c => `<button data-color="${c}" class="${ui.whoColor === c ? 'on' : ''}" style="background:${c}" aria-label="${c}"></button>`).join('')}
    </div>
    <button class="btn dark" id="who-ok" style="width:100%">就是我</button>
  </div>`;
}

/* --- 视图：想法流 --- */
function heartLine(t) {
  const who = Object.entries(t.hearts || {}).filter(([, v]) => v && v.on).map(([k]) => k);
  const mine = who.includes(me());
  return `<button class="heart ${mine ? 'on' : ''}" data-act="heart">${mine ? '♥' : '♡'}${
    who.length ? ` <span class="hn">${who.map(esc).join(' · ')}</span>` : ''}</button>`;
}
function tcsHtml(cls, cur) {
  return `<span class="tcs ${cls}">${TC.map(c =>
    `<button data-tc="${c}" class="${cur === c ? 'on' : ''}" style="background:${c}" aria-label="字体颜色 ${c}"></button>`).join('')}</span>`;
}
function imgBlock(t) {
  if (!t.img) return '';
  const ar = (t.img.w && t.img.h) ? ` style="aspect-ratio:${t.img.w}/${t.img.h}"` : '';
  return `<div class="ph" data-gist="${esc(t.img.id)}"${t.img.pending ? ' data-pending="1"' : ''}${ar}><span>图片加载中…</span></div>`;
}
function thoughtHtml(t) {
  const c = colorOf(t.author);
  const editing = ui.editingId === t.id;
  const replies = (t.replies || []).filter(r => !r.deleted);
  const replyOpen = ui.replyTo === t.id;
  return `
  <div class="th card ${ui.actsOn === t.id ? 'acts-on' : ''}" data-id="${t.id}" style="border-left-color:${c}">
    <div class="th-head">
      <span class="dot8" style="background:${c}"></span><b>${esc(t.author)}</b>
      <span class="tm">${timeStr(t.ts)}${(t.updatedAt || 0) > (t.ts || 0) + 60e3 ? ' · 已编辑' : ''}</span>
      <span class="th-acts"><button data-act="edit">编辑</button><button data-act="del">删除</button></span>
    </div>
    ${editing ? `
    <div class="edit-box">
      <textarea id="edit-ta" style="color:${ui.editColor}">${esc(ui.editDraft)}</textarea>
      ${t.img && !ui.editRemoveImg ? `<div class="cmp-prev edit-img">${imgBlock(t)}<button class="px" data-act="edit-img-x" title="移除图片">✕</button></div>` : ''}
      <div class="cmp-tools">${tcsHtml('edit-tcs', ui.editColor)}</div>
      <div class="edit-acts"><button class="btn" data-act="edit-cancel">取消</button><button class="btn dark" data-act="edit-save">保存</button></div>
    </div>` : `
    ${t.text ? `<div class="th-text"${t.textColor ? ` style="color:${esc(t.textColor)}"` : ''}>${esc(t.text)}</div>` : ''}
    ${imgBlock(t)}
    <div class="th-foot">
      ${heartLine(t)}
      <button data-act="reply-open">回复${replies.length ? ' ' + replies.length : ''}</button>
    </div>`}
    ${replies.length ? `<div class="replies">
      ${replies.map(r => `
      <div class="reply" data-rid="${r.id}">
        <b style="color:${colorOf(r.author)}">${esc(r.author)}</b>
        <span class="rt">${esc(r.text)}</span>
        <button class="rx" data-act="reply-del" title="删除回复">✕</button>
      </div>`).join('')}
    </div>` : ''}
    ${replyOpen ? `
    <div class="reply-form">
      <input id="reply-in" placeholder="回复 ${esc(t.author)}…" value="${esc(ui.replyDraft)}" maxlength="500">
      <button data-act="reply-send">发送</button>
    </div>` : ''}
  </div>`;
}
function vMain() {
  const list = thoughts().slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const myColor = colorOf(me());
  const groups = [];
  for (const t of list) {
    const k = dayKey(t.ts || 0);
    if (!groups.length || groups[groups.length - 1].key !== k) groups.push({ key: k, items: [] });
    groups[groups.length - 1].items.push(t);
  }
  return `
  <div class="card" id="composer">
    <textarea id="cmp" placeholder="此刻的小想法…" rows="2" style="color:${ui.cmpColor}">${esc(ui.draft)}</textarea>
    ${ui.cmpImg ? `<div class="cmp-prev"><img src="${ui.cmpImg.url}" alt=""><button class="px" id="cmp-img-x" title="移除图片">✕</button></div>` : ''}
    <div class="cmp-tools">
      ${tcsHtml('cmp-tcs', ui.cmpColor)}
      <button class="imgbtn" id="cmp-imgbtn">📷 图片</button>
      <input type="file" id="cmp-file" accept="image/*" hidden>
    </div>
    <div class="cmp-foot">
      <span class="me-chip"><span class="dot8" style="background:${myColor}"></span>${esc(me())}</span>
      <span class="cmp-hint">Ctrl + Enter 发布</span>
      <button class="cmp-send" id="cmp-send">发布</button>
    </div>
  </div>
  ${list.length ? groups.map(g => `
    <div class="day-label">${dayLabel(g.key)}</div>
    ${g.items.map(thoughtHtml).join('')}`).join('') :
    `<div class="empty">还没有想法。<br>写下第一条，${Object.keys(data.profiles).length > 1 ? '对方' : 'TA'} 打开就能看到。</div>`}
  `;
}

/* --- 设置弹层 --- */
function sheetHtml() {
  const c = cloudCfg();
  const st = statusText();
  const myColor = colorOf(me());
  return `
  <button class="x" data-act="close">✕</button>
  <h3>设置</h3>
  <div class="kv"><span class="k">同步</span><span class="v">
    ${cloudEnabled()
      ? `<span class="save-line ${st.cls}"><span class="dot"></span>${PROVIDERS[c.provider].label}${c.login ? ' · @' + esc(c.login) : ''}</span>
         <button class="btn" data-act="logout">退出登录</button>`
      : `<span class="save-line off"><span class="dot"></span>仅本机</span>
         <button class="btn dark" data-act="login">登录同步</button>`}
  </span></div>
  ${syncErr ? `<div class="kv"><span class="k" style="color:var(--red)">同步错误</span><span class="v" style="font-weight:400;font-size:12px;color:var(--red);text-align:right">${esc(syncErr)}</span></div>` : ''}
  <div class="kv"><span class="k">我的身份</span><span class="v">
    <span class="dot8" style="background:${myColor}"></span>${esc(me() || '未设置')}
    <button class="btn" data-act="switch-who">切换</button>
  </span></div>
  <div class="kv"><span class="k">我的颜色</span><span class="v">
    <span class="swatches" style="margin:0">
      ${PALETTE.map(cc => `<button data-mycolor="${cc}" class="${myColor === cc ? 'on' : ''}" style="background:${cc}"></button>`).join('')}
    </span>
  </span></div>
  <div class="kv"><span class="k">数据</span><span class="v">
    <button class="btn" data-act="export">导出备份</button>
    <button class="btn" data-act="import">导入备份</button>
    <input type="file" id="imp-file" accept="application/json,.json" hidden>
  </span></div>
  <p class="small">数据始终先存本机浏览器；登录后自动保存到账号下的<b>私密代码片段（Gist）</b>，双方粘贴同一个令牌即共用同一份。改动约 1 秒上传，每半分钟自动拉取合并；两人同时编辑按条目「新者胜」，❤️ 和回复各自独立合并，不会互相覆盖。</p>`;
}
function renderSheet() {
  const sheet = $('#sheet'), mask = $('#mask');
  if (!ui.sheet) { sheet.hidden = true; mask.hidden = true; return; }
  sheet.hidden = false; mask.hidden = false;
  sheet.innerHTML = sheetHtml();
}

/* --- 渲染 --- */
let renderQueued = false;
function render() {
  renderQueued = false;
  $('#main').innerHTML = ({ setup: vSetup, who: vWho, main: vMain })[view()]();
  const cmp = $('#cmp');
  if (cmp) autosize(cmp);
  hydrateImages();
  updateStatusUi();
  if (ui.sheet) renderSheet();
}
function safeRender() { /* 远端更新时不打断正在打字的人 */
  const ae = document.activeElement;
  const typing = ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT') &&
    (ae.value || ui.editingId || ui.replyTo);
  if (typing) {
    if (renderQueued) return;
    renderQueued = true;
    ae.addEventListener('blur', () => { if (renderQueued) render(); }, { once: true });
    return;
  }
  const focusId = ae && ae.id;
  render();
  if (focusId) { const el = document.getElementById(focusId); if (el) el.focus(); }
}
function autosize(ta) {
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, window.innerHeight * 0.4) + 'px';
}

/* --- 事件 --- */
async function doLogin() {
  const token = ($('#g-token') || {}).value || '';
  ui.tokenDraft = token; ui.gateErr = ''; ui.gateBusy = true; render();
  try {
    await cloudLogin(ui.cloudProv, token);
    ui.gate = null; ui.tokenDraft = ''; ui.gateBusy = false;
  } catch (e) {
    ui.gateErr = (e && e.message) ? e.message : String(e);
    ui.gateBusy = false;
  }
  render();
}
async function doPublish() {
  const cmp = $('#cmp'); if (!cmp) return;
  const text = cmp.value.trim();
  if (!text && !ui.cmpImg) return;
  let img = null;
  if (ui.cmpImg) { /* 图片先落本机 IndexedDB，同步时自动上传成独立 Gist */
    const id = 'l' + uuid();
    try { await idbSet('img:' + id, ui.cmpImg.url); } catch (e) { alert('图片保存失败：' + e.message); return; }
    img = { id, w: ui.cmpImg.w, h: ui.cmpImg.h, pending: true };
  }
  ui.draft = ''; ui.cmpImg = null;
  addThought(text, img, ui.cmpColor === TC[0] ? '' : ui.cmpColor);
  const c2 = $('#cmp'); if (c2) c2.focus();
}
async function pickImage(file) {
  if (!file) return;
  try { ui.cmpImg = await compressImage(file); render(); }
  catch (e) { alert(e.message); }
}
$('#main').addEventListener('click', e => {
  const v = view();
  /* 登录页 */
  const prov = e.target.closest('[data-prov]');
  if (prov) { ui.cloudProv = prov.dataset.prov; ui.gateErr = ''; render(); return; }
  if (e.target.id === 'g-login') { doLogin(); return; }
  if (e.target.id === 'g-skip') { localStorage.setItem(LS_LOCAL, '1'); ui.gate = null; render(); return; }
  /* 身份页 */
  const who = e.target.closest('[data-who]');
  if (who) { localStorage.setItem(LS_ME, who.dataset.who); ui.gate = null; commit(); return; }
  const sw = e.target.closest('[data-color]');
  if (sw) { ui.whoColor = sw.dataset.color; render(); return; }
  if (e.target.id === 'who-ok') {
    const name = (($('#who-name') || {}).value || '').trim();
    if (!name) { const el = $('#who-name'); if (el) el.focus(); return; }
    ui.gate = null; ui.whoName = '';
    setProfile(name, ui.whoColor);
    return;
  }
  if (v !== 'main') return;
  /* 想法流 */
  if (e.target.id === 'cmp-send') { doPublish(); return; }
  if (e.target.id === 'cmp-imgbtn') { $('#cmp-file').click(); return; }
  if (e.target.id === 'cmp-img-x') { ui.cmpImg = null; render(); return; }
  /* 字体颜色：只改状态和样式，不整页重绘，避免打断输入 */
  const tc = e.target.closest('[data-tc]');
  if (tc) {
    const color = tc.dataset.tc;
    if (tc.closest('.cmp-tcs')) {
      ui.cmpColor = color; localStorage.setItem('us.tc.v1', color);
      const ta = $('#cmp'); if (ta) ta.style.color = color;
      $$('.cmp-tcs [data-tc]').forEach(b => b.classList.toggle('on', b.dataset.tc === color));
    } else {
      ui.editColor = color;
      const ta = $('#edit-ta'); if (ta) ta.style.color = color;
      $$('.edit-tcs [data-tc]').forEach(b => b.classList.toggle('on', b.dataset.tc === color));
    }
    return;
  }
  /* 点图片 → 全屏查看 */
  const ph = e.target.closest('.ph.ld');
  if (ph && !e.target.closest('.edit-img')) {
    const im = $('img', ph);
    if (im && im.src) { $('#viewer img').src = im.src; $('#viewer').hidden = false; }
    return;
  }
  const card = e.target.closest('.th');
  const act = e.target.closest('[data-act]');
  if (!card) return;
  const id = card.dataset.id;
  const t = data.thoughts.find(x => x.id === id);
  if (!act) { /* 手机上点卡片空白处 → 显示/隐藏 编辑删除 */
    ui.actsOn = ui.actsOn === id ? null : id;
    $$('.th').forEach(el => el.classList.toggle('acts-on', el.dataset.id === ui.actsOn));
    return;
  }
  switch (act.dataset.act) {
    case 'heart': toggleHeart(id); break;
    case 'reply-open':
      ui.replyTo = ui.replyTo === id ? null : id; ui.replyDraft = '';
      render();
      { const inp = $('#reply-in'); if (inp) inp.focus(); }
      break;
    case 'reply-send': {
      const inp = $('#reply-in');
      const txt = inp ? inp.value.trim() : '';
      if (!txt) break;
      ui.replyTo = null; ui.replyDraft = '';
      addReply(id, txt);
      break;
    }
    case 'reply-del': {
      const row = e.target.closest('[data-rid]');
      if (row && confirm('删除这条回复？')) deleteReply(id, row.dataset.rid);
      break;
    }
    case 'edit':
      ui.editingId = id; ui.editDraft = t ? t.text : '';
      ui.editColor = (t && t.textColor) || TC[0]; ui.editRemoveImg = false;
      render();
      { const ta = $('#edit-ta'); if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } }
      break;
    case 'edit-img-x': ui.editRemoveImg = true; render(); break;
    case 'edit-save': {
      const ta = $('#edit-ta');
      const txt = ta ? ta.value.trim() : '';
      const keepImg = t && t.img && !ui.editRemoveImg;
      const removeImg = ui.editRemoveImg;
      ui.editingId = null; ui.editDraft = ''; ui.editRemoveImg = false;
      if (!t || (!txt && !keepImg)) { render(); break; } /* 什么都不剩就不保存 */
      updateThought(id, { text: txt, textColor: ui.editColor === TC[0] ? '' : ui.editColor, removeImg });
      break;
    }
    case 'edit-cancel': ui.editingId = null; ui.editDraft = ''; ui.editRemoveImg = false; render(); break;
    case 'del':
      if (confirm('删除这条想法？双方都将看不到。')) deleteThought(id);
      break;
  }
});
$('#main').addEventListener('change', e => {
  if (e.target.id === 'cmp-file' && e.target.files && e.target.files[0]) {
    pickImage(e.target.files[0]);
    e.target.value = '';
  }
});
$('#viewer').addEventListener('click', () => { $('#viewer').hidden = true; $('#viewer img').src = ''; });
$('#main').addEventListener('input', e => {
  if (e.target.id === 'cmp') { ui.draft = e.target.value; autosize(e.target); }
  if (e.target.id === 'edit-ta') ui.editDraft = e.target.value;
  if (e.target.id === 'reply-in') ui.replyDraft = e.target.value;
  if (e.target.id === 'g-token') ui.tokenDraft = e.target.value;
  if (e.target.id === 'who-name') ui.whoName = e.target.value;
});
$('#main').addEventListener('keydown', e => {
  if (e.isComposing || e.keyCode === 229) return; /* 中文输入法选词的 Enter 不算发送 */
  if (e.target.id === 'cmp' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); doPublish(); }
  if (e.target.id === 'edit-ta' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    const b = $('[data-act="edit-save"]'); if (b) b.click();
  }
  if (e.target.id === 'reply-in' && e.key === 'Enter') {
    e.preventDefault();
    const card = e.target.closest('.th');
    const txt = e.target.value.trim();
    if (card && txt) { ui.replyTo = null; ui.replyDraft = ''; addReply(card.dataset.id, txt); }
  }
  if (e.target.id === 'g-token' && e.key === 'Enter') { e.preventDefault(); doLogin(); }
  if (e.target.id === 'who-name' && e.key === 'Enter') { e.preventDefault(); const b = $('#who-ok'); if (b) b.click(); }
});

/* 设置弹层 */
$('#btn-gear').addEventListener('click', () => { ui.sheet = true; renderSheet(); });
$('#mask').addEventListener('click', () => { ui.sheet = false; renderSheet(); });
$('#sheet').addEventListener('click', e => {
  const act = e.target.closest('[data-act]');
  const sw = e.target.closest('[data-mycolor]');
  if (sw) { if (me()) setProfile(me(), sw.dataset.mycolor); renderSheet(); return; }
  if (!act) return;
  switch (act.dataset.act) {
    case 'close': ui.sheet = false; renderSheet(); break;
    case 'logout':
      if (confirm('退出登录？本机数据保留，重新登录同一令牌可继续同步。')) { ui.sheet = false; cloudLogout(); }
      renderSheet(); break;
    case 'login': ui.sheet = false; ui.gate = 'setup'; renderSheet(); render(); break;
    case 'switch-who': ui.sheet = false; ui.gate = 'who'; renderSheet(); render(); break;
    case 'export': exportBackup(); break;
    case 'import': $('#imp-file').click(); break;
  }
});
$('#sheet').addEventListener('change', e => {
  if (e.target.id === 'imp-file' && e.target.files && e.target.files[0]) {
    importBackup(e.target.files[0]);
    e.target.value = '';
  }
});

/* ================= 启动 ================= */
render();
syncNow();
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
