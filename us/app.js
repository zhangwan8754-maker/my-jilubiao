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
/* 日期串工具（YYYY-MM-DD，按本地时区，避开 UTC 偏移问题） */
const dstr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => dstr(new Date());
const parseDate = ds => { const [y, m, d] = String(ds).split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (ds, n) => { const d = parseDate(ds); d.setDate(d.getDate() + n); return dstr(d); };

/* ================= state / store ================= */
const LS_KEY = 'us.data.v1';
const LS_ME = 'us.me.v1';
const LS_DEV = 'us.dev.v1';
const LS_CLOUD = 'us.cloud.v1';
const LS_LOCAL = 'us.localonly.v1'; /* 「先本机试用」标记 */
const PALETTE = ['#C0502C', '#B04A5A', '#33587A', '#4A7051', '#B07C2A', '#7A4A6F', '#2C7A8C', '#5B6B2C'];
/* 随心选默认分类：固定 id + updatedAt:0，任何真实编辑/删除（带真时间戳）都会盖过它 */
const PICK_EMOJIS = ['🧋', '🍚', '🤖', '🎾', '💕', '🎬', '🎁', '🍜', '🎲', '✨'];
const DEFAULT_PICKS = [
  { id: 'pk-tea', name: '奶茶', emoji: '🧋', color: '#B07C2A', options: ['蜜雪', '喜茶', 'CoCo', '益禾堂', '古茗'], order: 0, updatedAt: 0, deleted: false },
  { id: 'pk-food', name: '饭店', emoji: '🍚', color: '#C0502C', options: ['平价饭店', '漂亮饭店', '小吃饭店'], order: 1, updatedAt: 0, deleted: false },
  { id: 'pk-ai', name: 'AI', emoji: '🤖', color: '#33587A', options: ['ChatGPT', 'Claude', 'Kimi', '豆包'], order: 2, updatedAt: 0, deleted: false },
  { id: 'pk-sport', name: '娱乐运动', emoji: '🎾', color: '#4A7051', options: ['网球', '羽毛球', '健身', '演唱会', '旅行'], order: 3, updatedAt: 0, deleted: false },
  { id: 'pk-date', name: '约会', emoji: '💕', color: '#B04A5A', options: ['散步', '逛街', '逛公园', '骑行'], order: 4, updatedAt: 0, deleted: false }
];

function freshData() {
  return { app: 'us-thoughts', version: 1, profiles: {}, thoughts: [], wishes: [], picks: JSON.parse(JSON.stringify(DEFAULT_PICKS)), lock: null, cycles: [], cycleOwner: null, devices: {} };
}
function normalize(d) {
  if (!d || typeof d !== 'object') return null;
  const out = freshData();
  out.profiles = (d.profiles && typeof d.profiles === 'object') ? d.profiles : {};
  out.thoughts = Array.isArray(d.thoughts) ? d.thoughts.filter(t => t && t.id) : [];
  out.wishes = Array.isArray(d.wishes) ? d.wishes.filter(w => w && w.id) : [];
  out.picks = Array.isArray(d.picks) ? d.picks.filter(p => p && p.id) : JSON.parse(JSON.stringify(DEFAULT_PICKS));
  /* lock 保留「撤锁墓碑」（h 为空但有 updatedAt），否则撤锁无法同步到其他设备 */
  out.lock = (d.lock && typeof d.lock === 'object' && (d.lock.h || d.lock.updatedAt)) ? d.lock : null;
  out.cycles = Array.isArray(d.cycles) ? d.cycles.filter(c => c && c.id && c.start) : [];
  out.cycleOwner = (d.cycleOwner && typeof d.cycleOwner === 'object') ? d.cycleOwner : null;
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
  const wm = new Map((a.wishes || []).filter(w => w && w.id).map(w => [w.id, w]));
  for (const y of (b.wishes || [])) {
    if (!y || !y.id) continue;
    const x = wm.get(y.id);
    if (!x || (y.updatedAt || 0) > (x.updatedAt || 0)) wm.set(y.id, y);
  }
  const pm = new Map((a.picks || []).filter(p => p && p.id).map(p => [p.id, p]));
  for (const y of (b.picks || [])) {
    if (!y || !y.id) continue;
    const x = pm.get(y.id);
    if (!x || (y.updatedAt || 0) > (x.updatedAt || 0)) pm.set(y.id, y);
  }
  const devices = Object.assign({}, a.devices || {});
  for (const [k, v] of Object.entries(b.devices || {})) {
    if (!devices[k] || (v.t || 0) > (devices[k].t || 0)) devices[k] = v;
  }
  /* 私人锁：新者胜（设锁/改锁/撤锁都带时间戳），会同步到所有设备 */
  const la = a.lock, lb = b.lock;
  const lock = (((lb && lb.updatedAt) || 0) > ((la && la.updatedAt) || 0)) ? lb : (la || lb || null);
  const cm = new Map((a.cycles || []).filter(c => c && c.id).map(c => [c.id, c]));
  for (const y of (b.cycles || [])) {
    if (!y || !y.id) continue;
    const x = cm.get(y.id);
    if (!x || (y.updatedAt || 0) > (x.updatedAt || 0)) cm.set(y.id, y);
  }
  const oa = a.cycleOwner, ob = b.cycleOwner;
  const cycleOwner = (((ob && ob.updatedAt) || 0) > ((oa && oa.updatedAt) || 0)) ? ob : (oa || ob || null);
  return { app: 'us-thoughts', version: 1, profiles, thoughts: Array.from(m.values()), wishes: Array.from(wm.values()), picks: Array.from(pm.values()), lock: lock || null, cycles: Array.from(cm.values()), cycleOwner: cycleOwner || null, devices };
}
/* 规范化指纹：字段序、键序固定，避免两端因对象键顺序不同而互相误判「有变化」 */
const canon = d => JSON.stringify({
  p: Object.entries(d.profiles || {}).sort().map(([k, v]) => [k, v.color, v.updatedAt || 0]),
  t: (d.thoughts || []).slice().sort((a, b) => a.id < b.id ? -1 : 1).map(t => [
    t.id, t.author, t.text, t.ts || 0, t.updatedAt || 0, !!t.deleted,
    t.textColor || '', t.bg || '', t.img ? [t.img.id, !!t.img.pending] : 0,
    Object.entries(t.hearts || {}).sort().map(([k, v]) => [k, !!v.on, v.at || 0]),
    (t.replies || []).slice().sort((a, b) => a.id < b.id ? -1 : 1)
      .map(r => [r.id, r.author, r.text, r.ts || 0, r.updatedAt || 0, !!r.deleted])
  ]),
  w: (d.wishes || []).slice().sort((a, b) => a.id < b.id ? -1 : 1).map(w => [
    w.id, w.text, w.addedBy, w.ts || 0, w.updatedAt || 0, !!w.deleted,
    w.done ? [w.done.by, w.done.at || 0] : 0, w.img ? [w.img.id, !!w.img.pending] : 0
  ]),
  k: (d.picks || []).slice().sort((a, b) => a.id < b.id ? -1 : 1).map(p => [
    p.id, p.name, p.emoji, p.color, (p.options || []).join(''), p.order || 0, p.updatedAt || 0, !!p.deleted
  ]),
  l: d.lock ? [d.lock.h || '', d.lock.updatedAt || 0] : 0,
  c: (d.cycles || []).slice().sort((a, b) => a.id < b.id ? -1 : 1).map(c => [
    c.id, c.start, c.end || '', c.updatedAt || 0, !!c.deleted
  ]),
  o: d.cycleOwner ? [d.cycleOwner.name || '', d.cycleOwner.updatedAt || 0] : 0
});
function purgeTombstones() { /* 90 天前的删除墓碑清理，避免无限增长 */
  const lim = Date.now() - 90 * 864e5;
  data.thoughts = data.thoughts.filter(t => !(t.deleted && (t.updatedAt || 0) < lim));
  data.wishes = (data.wishes || []).filter(w => !(w.deleted && (w.updatedAt || 0) < lim));
  data.picks = (data.picks || []).filter(p => !(p.deleted && (p.updatedAt || 0) < lim));
  data.cycles = (data.cycles || []).filter(c => !(c.deleted && (c.updatedAt || 0) < lim));
  for (const t of data.thoughts) {
    if (t.replies) t.replies = t.replies.filter(r => !(r.deleted && (r.updatedAt || 0) < lim));
  }
}
function serialize() { return JSON.stringify(data, null, 1); }
/* 上传给 Gitee 的内容转成纯 ASCII：把非 ASCII（emoji、中文等）写成 \uXXXX。
   Gitee 的数据库字段是老的 utf8（非 utf8mb4），存不了 4 字节 emoji（🫂😂😘…），
   直接写会 HTTP 400 Mysql2 Incorrect string value 拒收整份数据、连累全部同步。
   读回来时 JSON.parse 会自动还原，界面显示不受影响。 */
function cloudContent() {
  return serialize().replace(/[\u0080-\uffff]/g, function (c) {
    return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
  });
}
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
function addThought(text, img, textColor, bg) {
  text = (text || '').trim(); if (!text && !img) return;
  data.thoughts.push({
    id: uuid(), author: me(), text, textColor: textColor || '', bg: bg || '', img: img || null,
    ts: Date.now(), updatedAt: Date.now(),
    deleted: false, hearts: {}, replies: []
  });
  commit();
}
function updateThought(id, patch) {
  const t = data.thoughts.find(x => x.id === id); if (!t) return;
  if (patch.text !== undefined) t.text = patch.text.trim();
  if (patch.textColor !== undefined) t.textColor = patch.textColor;
  if (patch.bg !== undefined) t.bg = patch.bg;
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
/* --- 回应：❤️ 之外扩展贴纸；hearts 键为「名字|表情」，旧的纯名字键视为 ❤️ --- */
const REACTS = ['❤️', '🫂', '😂', '😘'];
function reactMap(t) { /* 表情 → 点过的人 */
  const m = {};
  for (const [k, v] of Object.entries(t.hearts || {})) {
    if (!v || !v.on) continue;
    const i = k.indexOf('|');
    const emo = i < 0 ? '❤️' : k.slice(i + 1);
    (m[emo] = m[emo] || []).push(i < 0 ? k : k.slice(0, i));
  }
  return m;
}
function toggleReact(id, emo) {
  const t = data.thoughts.find(x => x.id === id); if (!t) return;
  if (!t.hearts) t.hearts = {};
  const key = me() + '|' + emo;
  const legacy = emo === '❤️' && t.hearts[me()];
  const cur = (t.hearts[key] && t.hearts[key].on) || (legacy && legacy.on);
  if (legacy) t.hearts[me()] = { on: false, at: Date.now() };
  t.hearts[key] = { on: !cur, at: Date.now() };
  commit();
}
/* --- 一起做的 100 件事 --- */
function addWish(text) {
  text = (text || '').trim(); if (!text) return;
  data.wishes.push({ id: uuid(), text, addedBy: me(), ts: Date.now(), updatedAt: Date.now(), deleted: false, done: null, img: null });
  commit();
}
function updateWish(id, patch) {
  const w = data.wishes.find(x => x.id === id); if (!w) return;
  if (patch.text !== undefined) { const s = patch.text.trim(); if (s) w.text = s; }
  if (patch.img !== undefined) { if (w.img) discardImage(w.img); w.img = patch.img; }
  if (patch.removeImg && w.img) { discardImage(w.img); w.img = null; }
  w.updatedAt = Date.now();
  commit();
}
function toggleWish(id) {
  const w = data.wishes.find(x => x.id === id); if (!w) return false;
  w.done = w.done ? null : { by: me(), at: Date.now() };
  w.updatedAt = Date.now();
  commit();
  return !!w.done;
}
function deleteWish(id) {
  const w = data.wishes.find(x => x.id === id); if (!w) return;
  if (w.img) { discardImage(w.img); w.img = null; }
  w.deleted = true; w.updatedAt = Date.now(); commit();
}
/* ================= 姨妈记录 =================
   cycles: [{id, start:'YYYY-MM-DD', end:'YYYY-MM-DD'|null, updatedAt, deleted}]
   预测按最近几次的实际间隔取平均；排卵/易孕窗口为推算值，仅供参考。 */
const DEF_CYCLE_LEN = 28, DEF_PERIOD_LEN = 5;
const cycles = () => (data.cycles || []).filter(c => !c.deleted && c.start).sort((a, b) => a.start < b.start ? -1 : 1);
const cycleOwnerName = () => (data.cycleOwner && data.cycleOwner.name) || '';
const iAmOwner = () => !cycleOwnerName() || cycleOwnerName() === me();
function setCycleOwner(name) {
  data.cycleOwner = { name: name || '', updatedAt: Date.now() };
  commit();
}
const daysBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 864e5);
const OPEN_MAX = 10; /* 忘记点「结束了」时，最多按 10 天算作进行中，避免天数一直涨 */
function currentCycle() { /* 正在进行中的一次 */
  const t = todayStr();
  return cycles().slice().reverse().find(c =>
    c.start <= t && (c.end ? c.end >= t : daysBetween(c.start, t) < OPEN_MAX)) || null;
}
function cycleSpan(c) { /* 这次记录在日历上覆盖的最后一天：没记结束的只画到今天，不虚构未来 */
  if (c.end) return c.end;
  const t = todayStr();
  const capped = addDays(c.start, OPEN_MAX - 1);
  const lastVisible = capped < t ? capped : t;
  return lastVisible < c.start ? c.start : lastVisible;
}
function startPeriod(dateStr) {
  const d = dateStr || todayStr();
  if (cycles().some(c => c.start === d)) return;
  data.cycles.push({ id: uuid(), start: d, end: null, updatedAt: Date.now(), deleted: false });
  commit();
}
function endPeriod(dateStr) {
  const c = currentCycle(); if (!c) return;
  const d = dateStr || todayStr();
  const row = data.cycles.find(x => x.id === c.id); if (!row) return;
  row.end = d < row.start ? row.start : d;
  row.updatedAt = Date.now();
  commit();
}
function deleteCycle(id) {
  const c = data.cycles.find(x => x.id === id); if (!c) return;
  c.deleted = true; c.updatedAt = Date.now(); commit();
}
function cycleStats() {
  const cs = cycles();
  const gaps = [];
  for (let i = 1; i < cs.length; i++) {
    const g = daysBetween(cs[i - 1].start, cs[i].start);
    if (g >= 15 && g <= 60) gaps.push(g); /* 剔除明显异常，避免误记把平均值带偏 */
  }
  const recentGaps = gaps.slice(-6);
  const avgCycle = recentGaps.length ? Math.round(recentGaps.reduce((s, g) => s + g, 0) / recentGaps.length) : DEF_CYCLE_LEN;
  const lens = cs.filter(c => c.end).map(c => daysBetween(c.start, c.end) + 1).filter(n => n >= 1 && n <= 15);
  const avgLen = lens.length ? Math.round(lens.slice(-6).reduce((s, n) => s + n, 0) / Math.min(6, lens.length)) : DEF_PERIOD_LEN;
  const last = cs[cs.length - 1] || null;
  const nextStart = last ? addDays(last.start, avgCycle) : null;
  return { count: cs.length, avgCycle, avgLen, last, nextStart, estimated: recentGaps.length === 0 };
}
function fertileWindow(nextStart) { /* 排卵日 ≈ 下次月经前 14 天；易孕窗口 = 排卵前 5 天 ~ 后 1 天 */
  if (!nextStart) return null;
  const ovu = addDays(nextStart, -14);
  return { ovu, from: addDays(ovu, -5), to: addDays(ovu, 1) };
}
function cycleDayInfo() { /* 顶部状态：经期中第几天 / 距离下次还有几天 / 推迟几天 */
  const t = todayStr();
  const cur = currentCycle();
  const st = cycleStats();
  if (cur) return { state: 'on', day: daysBetween(cur.start, t) + 1, cycle: cur, stats: st };
  if (!st.nextStart) return { state: 'none', stats: st };
  const diff = daysBetween(t, st.nextStart);
  if (diff >= 0) return { state: 'wait', days: diff, stats: st };
  return { state: 'late', days: -diff, stats: st };
}

/* --- 随心选：分类 + 选项，整条按 updatedAt 新者胜合并 --- */
const picks = () => (data.picks || []).filter(p => !p.deleted).sort((a, b) => (a.order || 0) - (b.order || 0) || (a.updatedAt || 0) - (b.updatedAt || 0));
const pickById = id => (data.picks || []).find(p => p.id === id && !p.deleted);
function addPick(name, emoji) {
  const used = new Set(picks().map(p => p.color));
  const color = PALETTE.find(c => !used.has(c)) || PALETTE[picks().length % PALETTE.length];
  const order = picks().reduce((m, p) => Math.max(m, p.order || 0), -1) + 1;
  data.picks.push({ id: 'pk-' + uuid().slice(0, 8), name: (name || '').trim() || '新分类', emoji: emoji || '🎲', color, options: [], order, updatedAt: Date.now(), deleted: false });
  commit();
}
function updatePick(id, patch) {
  const p = data.picks.find(x => x.id === id); if (!p) return;
  if (patch.name !== undefined) { const s = patch.name.trim(); if (s) p.name = s; }
  if (patch.emoji !== undefined) p.emoji = patch.emoji;
  if (patch.options !== undefined) p.options = patch.options.filter(o => (o || '').trim()).map(o => o.trim());
  p.updatedAt = Date.now(); commit();
}
function addPickOption(id, text) {
  const p = data.picks.find(x => x.id === id); if (!p) return;
  text = (text || '').trim(); if (!text) return;
  p.options = (p.options || []).concat(text);
  p.updatedAt = Date.now(); commit();
}
function removePickOption(id, idx) {
  const p = data.picks.find(x => x.id === id); if (!p) return;
  p.options = (p.options || []).filter((_, i) => i !== idx);
  p.updatedAt = Date.now(); commit();
}
function deletePick(id) {
  const p = data.picks.find(x => x.id === id); if (!p) return;
  p.deleted = true; p.updatedAt = Date.now(); commit();
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
let rateLimitUntil = 0; /* 被 403 限流后的自动退避截止时间 */
let lastPatchAt = 0;    /* 上次写入云端的时间，用于写入节流 */

/* 同步错误日志（最近 6 条，持久化）：手机上看不到悬停提示，靠它定位问题 */
const LS_SLOG = 'us.synclog.v1';
function slog() { try { return JSON.parse(localStorage.getItem(LS_SLOG)) || []; } catch (e) { return []; } }
function slogPush(m) {
  m = String(m).slice(0, 140);
  const l = slog();
  if (l[0] && l[0].m === m) { l[0].t = Date.now(); l[0].n = (l[0].n || 1) + 1; }
  else l.unshift({ t: Date.now(), m, n: 1 });
  try { localStorage.setItem(LS_SLOG, JSON.stringify(l.slice(0, 6))); } catch (e) { /* ignore */ }
}
function httpErr(P, verb, status, body) { /* 把 HTTP 状态翻译成能看懂的话，带上服务端原话方便定位 */
  let msg = '';
  try { msg = (JSON.parse(body || '') || {}).message || ''; } catch (e) { msg = String(body || '').slice(0, 60); }
  const tail = msg ? '：' + String(msg).slice(0, 60) : '';
  if (status === 401) return new Error(P.label + ' 令牌失效或已过期 → 请在设置里退出后重新登录');
  if (status === 403) { rateLimitUntil = Date.now() + 90e3; return new Error('被 ' + P.label + ' 限频（403' + tail + '），已自动减速，约 1 分钟后恢复'); }
  if (status === 404) return new Error('云端数据不存在（代码片段可能被删除）→ 请退出后重新登录');
  return new Error(P.label + ' ' + verb + '失败 HTTP ' + status + tail);
}

function cloudReq(provider, token, path, opts) {
  const P = PROVIDERS[provider];
  opts = opts || {};
  const url = new URL(P.api + path);
  const headers = Object.assign({}, opts.headers || {});
  if (P.authQuery) url.searchParams.set('access_token', token);
  else { headers['Authorization'] = 'Bearer ' + token; headers['Accept'] = 'application/vnd.github+json'; }
  if (opts.body) headers['Content-Type'] = 'application/json';
  const ac = new AbortController(); /* 弱网下不让一个请求挂死同步 */
  const tm = setTimeout(() => ac.abort(), 20000);
  return fetch(url.toString(), Object.assign({ cache: 'no-store' }, opts, { headers, signal: ac.signal }))
    .finally(() => clearTimeout(tm))
    .catch(e => {
      throw new Error(e && e.name === 'AbortError' ? P.label + ' 连接超时' : '无法连接 ' + P.label);
    });
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
      body: JSON.stringify({ description: CLOUD_DESC, public: false, files: { 'us-thoughts.json': { content: cloudContent() } } })
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
  if (!r.ok) throw httpErr(P, '读取', r.status, await r.text().catch(() => ''));
  const g = await r.json();
  const f = g.files && g.files['us-thoughts.json'];
  let remote = null;
  if (f) {
    let txt = f.content;
    if (f.truncated && f.raw_url) { const rr = await fetch(f.raw_url, { cache: 'no-store' }); if (rr.ok) txt = await rr.text(); }
    try { remote = normalize(JSON.parse(txt)); } catch (e) { /* 云端损坏则覆盖 */ }
  }
  if (remote) absorbRemote(mergeData(data, remote));
  /* 设备心跳：让对方能看到「TA 什么时候来过」，10 分钟粒度，避免频繁写 */
  data.devices[deviceId()] = { name: deviceName(), me: me(), t: Date.now() };
  const myRemoteDev = remote && remote.devices && remote.devices[deviceId()];
  const heartbeat = !myRemoteDev || Date.now() - (myRemoteDev.t || 0) > 10 * 60e3;
  const contentChanged = !remote || canon(remote) !== canon(data);
  if (contentChanged || heartbeat) {
    /* 写入节流：Gitee 对连续写入限频很严，内容改动两次上传至少间隔 8 秒；
       没到点的改动先存本地、到点自动补传，绝不当成失败。心跳每 10 分钟一次不受限。 */
    const since = Date.now() - lastPatchAt;
    if (contentChanged && since < 5000) {
      cloudLastOk = Date.now();
      setTimeout(() => { if (!syncBusy) syncNow(); }, 5000 - since + 300);
      return;
    }
    const p = await cloudReq(c.provider, c.token, '/gists/' + c.gistId, {
      method: 'PATCH',
      body: JSON.stringify({ description: CLOUD_DESC, files: { 'us-thoughts.json': { content: cloudContent() } } })
    });
    if (!p.ok) throw httpErr(P, '写入', p.status, await p.text().catch(() => ''));
    lastPatchAt = Date.now();
    lastSavedAt = Date.now(); localStorage.setItem('us.savedAt', String(lastSavedAt));
  }
  cloudLastOk = Date.now();
}
const scheduleSync = debounce(() => syncNow(), 800);
let syncFails = 0; /* 连续失败次数：第 1 次静默快速重试，≥2 次才提示失败 */
let imgRetryCount = 0;
async function syncNow() {
  if (!cloudEnabled()) { updateStatusUi(); return; }
  if (syncBusy) { syncQueued = true; return; }
  syncBusy = true; updateStatusUi();
  try {
    await uploadPendingImages(); /* 单张图失败只记软错误，不抛出、不拦主数据 */
    await gistSyncOnce();
    syncFails = 0;
    syncErr = imgSoftErr;
    if (imgSoftErr && imgRetryCount < 5) { /* 图片没传上：8 秒后自动补传，连续 5 次后交给常规轮询 */
      imgRetryCount++;
      setTimeout(() => { if (!syncBusy) syncNow(); }, 8000);
    } else if (!imgSoftErr) imgRetryCount = 0;
  } catch (e) {
    syncFails++;
    syncErr = (e && e.message) ? e.message : String(e);
    slogPush(syncErr);
    console.warn('sync:', e);
    /* 被限流时不做密集快速重试，否则越限越死 */
    if (syncFails < 4 && Date.now() >= rateLimitUntil) {
      setTimeout(() => { if (!syncBusy) syncNow(); }, 3000 * syncFails); /* 3s/6s/9s 快速重试 */
    }
  }
  syncBusy = false;
  updateStatusUi();
  if (syncQueued) { syncQueued = false; syncNow(); }
}

/* ================= 图片：压缩 → 独立私密 Gist（主数据保持轻量） ================= */
const IMG_DESC = 'us-thoughts-img（想法配图，请勿删除 / do not delete）';
function compressImage(file) { /* 长边 ≤1280、逐步降质，压到 500KB 内，上传更稳 */
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
        if (url.length > 500 * 1024 && (max > 560 || q > 0.5)) {
          max = Math.max(560, Math.round(max * 0.8)); q = Math.max(0.5, q - 0.08); attempt();
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
function shrinkDataUrl(url, maxSide, q) { /* 把已压缩的图再压小（上传被拒时降级重试用） */
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(img.naturalWidth * scale));
      cv.height = Math.max(1, Math.round(img.naturalHeight * scale));
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      res(cv.toDataURL('image/jpeg', q));
    };
    img.onerror = () => rej(new Error('bad image'));
    img.src = url;
  });
}
const imgTries = new Map();
let imgSoftErr = null;
async function uploadPendingImages() { /* 待上传的本机图片（想法 + 100 件事）→ 各自建私密 Gist
  单张失败只记录、继续下一张，绝不拦住主数据同步 */
  imgSoftErr = null;
  if (!cloudEnabled()) return;
  const c = cloudCfg();
  for (const t of [...data.thoughts, ...(data.wishes || [])]) {
    if (!t.img || !t.img.pending || t.deleted) continue;
    const key = t.img.id;
    try {
      const dataUrl = await idbGet('img:' + key);
      /* 关键：pending 图的原始数据只存在「发图那台设备」上。别的设备找不到 blob
         时必须原样跳过——绝不能把它清空（那会用更新的时间戳覆盖、抹掉对方还没传完的图，
         并引发反复同步）。等发图设备自己传完，img.id 变成 g... 大家就都能看到了。 */
      if (!dataUrl) continue;
      const r = await cloudReq(c.provider, c.token, '/gists', {
        method: 'POST',
        body: JSON.stringify({ description: IMG_DESC, public: false, files: { 'img.txt': { content: dataUrl } } })
      });
      if (!r.ok) {
        if (r.status === 403) rateLimitUntil = Date.now() + 5 * 60e3; /* 限流同样退避 */
        const n = (imgTries.get(key) || 0) + 1; imgTries.set(key, n);
        if ((r.status === 400 || r.status === 413 || r.status === 422) && n <= 3) { /* 疑似过大被拒：压更小，下轮再试 */
          const smaller = await shrinkDataUrl(dataUrl, n === 1 ? 640 : 400, 0.55).catch(() => null);
          if (smaller && smaller.length < dataUrl.length) await idbSet('img:' + key, smaller).catch(() => {});
        }
        throw new Error('有图片上传失败（HTTP ' + r.status + '，会自动重试）');
      }
      const gid = (await r.json()).id;
      imgTries.delete(key);
      await idbSet('img:' + gid, dataUrl).catch(() => {});
      await idbDel('img:' + key).catch(() => {});
      t.img = { id: gid, w: t.img.w, h: t.img.h };
      t.updatedAt = Date.now();
      saveLocal();
    } catch (e) {
      imgSoftErr = (e && e.message) ? e.message : String(e);
      slogPush(imgSoftErr);
    }
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
const imgFailAt = new Map(); /* 拉取失败的图：冷却 60 秒再重试，避免每次渲染都轰炸 Gitee */
function hydrateImages() { /* 渲染后异步填充图片，只改 DOM 属性，不打断输入 */
  $$('.ph[data-gist]').forEach(el => {
    const id = el.dataset.gist;
    if (el.dataset.done || hydrating.has(id)) return;
    if (Date.now() - (imgFailAt.get(id) || 0) < 60000) return; /* 冷却中，先不重试 */
    hydrating.add(id);
    fetchImage(id).then(url => {
      hydrating.delete(id);
      if (url) imgFailAt.delete(id); else imgFailAt.set(id, Date.now());
      $$(`.ph[data-gist="${id}"]`).forEach(el2 => {
        if (el2.dataset.done) return;
        if (url) { el2.dataset.done = '1'; el2.classList.add('ld'); el2.innerHTML = `<img src="${url}" alt="">`; }
        else { const s = $('span', el2); if (s) s.textContent = el2.dataset.pending ? '图片同步中，等 TA 的设备在线…' : '图片加载中，稍后自动重试'; }
      });
    }).catch(() => { hydrating.delete(id); imgFailAt.set(id, Date.now()); });
  });
}
/* 轮询 + 焦点拉取：对方发的想法尽快出现；后台不轮询（锁屏必失败），限流期间暂停 */
setInterval(() => {
  if (document.hidden || Date.now() < rateLimitUntil) return;
  if (cloudEnabled() && !syncBusy && Date.now() - cloudLastOk > 30000) syncNow();
}, 10000);
window.addEventListener('focus', () => syncNow());
document.addEventListener('visibilitychange', () => { if (!document.hidden) syncNow(); });

/* ================= 涂鸦画板 ================= */
const dd = { strokes: [], cur: null, color: '#C0502C', size: 7 };
function ddRedraw() {
  const cv = $('#dd-cv'), ctx = cv.getContext('2d');
  ctx.fillStyle = '#FFFEFB'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.lineCap = ctx.lineJoin = 'round';
  for (const s of [...dd.strokes, ...(dd.cur ? [dd.cur] : [])]) {
    ctx.strokeStyle = s.color; ctx.lineWidth = s.size;
    ctx.beginPath();
    s.pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    if (s.pts.length === 1) ctx.lineTo(s.pts[0][0] + 0.1, s.pts[0][1] + 0.1); /* 单点也画个点 */
    ctx.stroke();
  }
}
function ddOpen() {
  dd.strokes = []; dd.cur = null;
  $('#dd-colors').innerHTML = TC.map(c =>
    `<button data-ddc="${c}" class="${dd.color === c ? 'on' : ''}" style="background:${c}"></button>`).join('');
  const cv = $('#dd-cv');
  cv.width = 900; cv.height = 900;
  $('#doodle').hidden = false;
  ddRedraw();
}
function ddPos(e) {
  const cv = $('#dd-cv'), r = cv.getBoundingClientRect();
  return [(e.clientX - r.left) / r.width * cv.width, (e.clientY - r.top) / r.height * cv.height];
}
function ddBind() {
  const cv = $('#dd-cv');
  cv.addEventListener('pointerdown', e => {
    e.preventDefault(); cv.setPointerCapture(e.pointerId);
    dd.cur = { color: dd.color, size: dd.size, pts: [ddPos(e)] };
    ddRedraw();
  });
  cv.addEventListener('pointermove', e => { if (dd.cur) { dd.cur.pts.push(ddPos(e)); ddRedraw(); } });
  const up = () => { if (dd.cur) { dd.strokes.push(dd.cur); dd.cur = null; } };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  $('#doodle').addEventListener('click', e => {
    const c = e.target.closest('[data-ddc]');
    if (c) { dd.color = c.dataset.ddc; $$('#dd-colors button').forEach(b => b.classList.toggle('on', b.dataset.ddc === dd.color)); return; }
    const s = e.target.closest('[data-ds]');
    if (s) { dd.size = Number(s.dataset.ds); $$('.dd-sizes button').forEach(b => b.classList.toggle('on', b === s)); return; }
    if (e.target.id === 'dd-undo') { dd.strokes.pop(); ddRedraw(); }
    if (e.target.id === 'dd-clear') { dd.strokes = []; ddRedraw(); }
    if (e.target.id === 'dd-cancel') $('#doodle').hidden = true;
    if (e.target.id === 'dd-done') {
      if (dd.strokes.length) {
        ui.cmpImg = { url: $('#dd-cv').toDataURL('image/jpeg', 0.85), w: 900, h: 900 };
      }
      $('#doodle').hidden = true;
      render();
    }
  });
}

/* ================= 打卡撒花 ================= */
function confetti(x, y) {
  const host = document.createElement('div');
  host.className = 'confetti';
  document.body.appendChild(host);
  const cols = ['#C0502C', '#B04A5A', '#B07C2A', '#4A7051', '#33587A', '#7A4A6F'];
  for (let i = 0; i < 26; i++) {
    const p = document.createElement('i');
    const a = Math.random() * Math.PI * 2, r = 60 + Math.random() * 90;
    p.style.cssText = `left:${x}px;top:${y}px;background:${cols[i % cols.length]};` +
      `--dx:${Math.cos(a) * r}px;--dy:${Math.sin(a) * r - 50}px;` +
      `width:${5 + Math.random() * 5}px;height:${5 + Math.random() * 5}px;` +
      `animation-delay:${Math.random() * 80}ms`;
    host.appendChild(p);
  }
  setTimeout(() => host.remove(), 1200);
}

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
const BGS = ['', '#FBF3E4', '#F9E9E7', '#EAF0EC', '#E9EEF5', '#F3EAF3']; /* 便签底色，空 = 默认卡片色 */
const ui = {
  gate: null,           /* null=自动 | 'setup' | 'who' 强制显示某个门 */
  cloudProv: 'gitee', tokenDraft: '', gateErr: '', gateBusy: false,
  whoName: '', whoColor: '',
  tab: 'feed',          /* feed=想法流 | list=100 件事 */
  q: '', month: '',     /* 搜索词 / 月份筛选（YYYY-MM） */
  draft: '',            /* 想法输入框草稿，跨渲染保留 */
  cmpColor: localStorage.getItem('us.tc.v1') || TC[0],
  cmpBg: localStorage.getItem('us.bg.v1') || '',
  cmpImg: null,         /* 待发布配图 {url,w,h} */
  editingId: null, editDraft: '', editColor: TC[0], editBg: '', editRemoveImg: false,
  replyTo: null, replyDraft: '',
  reactOpen: null,      /* 展开贴纸面板的想法 id */
  actsOn: null,         /* 手机上点开操作按钮的卡片 */
  wDraft: '', wActsOn: null, wEditId: null, wEditDraft: '', wImgFor: null,
  pickId: null,         /* 当前展开的随心选分类 */
  pickFor: 'me',        /* me=给我抽 | ta=给 TA 抽 */
  pickResult: null,     /* {catId, text} 抽中结果 */
  pickSpin: false,      /* 正在滚动动画 */
  pickEdit: false, pickOptDraft: '', pickNewName: '',
  cycYM: null,          /* 姨妈日历显示的月份 {y,m}，null=本月 */
  lockErr: '',
  sheet: false
};
/* ================= 私人锁 =================
   口令的哈希存在同步数据里 → 会推到所有已登录设备，别的设备打不开应用。
   本机验证通过后记住（存哈希），换口令后需重新输入。
   忘记口令的退路：你是 Gitee 账号主人，可在 gist 里把 "lock" 字段删掉。 */
const LS_UNLOCK = 'us.unlock.v1';
async function hashPass(pw) {
  const salt = 'us-thoughts-lock-v1';
  if (crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + '|' + pw));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 5381; /* 无 crypto.subtle（http 环境）时的退化实现 */
  const s = salt + '|' + pw;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return 'x' + h.toString(16);
}
const lockOn = () => !!(data.lock && data.lock.h);
const unlocked = () => !lockOn() || localStorage.getItem(LS_UNLOCK) === data.lock.h;
async function setLock(pw) {
  const h = await hashPass(pw);
  data.lock = { h, by: me(), updatedAt: Date.now() };
  localStorage.setItem(LS_UNLOCK, h);
  commit();
}
function removeLock() {
  data.lock = { h: '', updatedAt: Date.now() }; /* 墓碑：让撤锁也能同步出去 */
  localStorage.removeItem(LS_UNLOCK);
  commit();
}
async function tryUnlock(pw) {
  const h = await hashPass(pw);
  if (!lockOn() || h !== data.lock.h) return false;
  localStorage.setItem(LS_UNLOCK, h);
  return true;
}

function view() {
  if (lockOn() && !unlocked()) return 'lock';
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

/* --- TA 的足迹：对方设备的最后活跃时间（同步心跳上报，10 分钟粒度） --- */
function partnerSeen() {
  let best = null;
  for (const d of Object.values(data.devices || {})) {
    if (!d.me || d.me === me()) continue;
    if (!best || (d.t || 0) > best.t) best = { name: d.me, t: d.t || 0 };
  }
  return best;
}
function seenStr(ts) {
  const d = new Date(ts);
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const k = dayKey(ts);
  if (Date.now() - ts < 5 * 60e3) return '刚刚';
  if (k === dayKey(Date.now())) return '今天 ' + hm;
  if (k === dayKey(Date.now() - 864e5)) return '昨天 ' + hm;
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/* --- 状态条 --- */
function statusText() {
  if (syncBusy) return { cls: 'busy', txt: '同步中…', title: '' };
  if (syncErr && syncFails >= 2) return { cls: 'err', txt: '同步失败', title: syncErr + '（会自动重试）' };
  if (syncErr && syncFails >= 1) return { cls: 'busy', txt: '重试中…', title: syncErr };
  if (cloudEnabled()) {
    const c = cloudCfg();
    return { cls: '', txt: '已同步', title: PROVIDERS[c.provider].label + (c.login ? ' · @' + c.login : '') + (syncErr ? ' · ' + syncErr : '') };
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

/* --- 视图：私人锁 --- */
function vLock() {
  return `
  <div class="card gate lockgate">
    <div class="lk-icon">🔒</div>
    <h2>请输入口令</h2>
    <p class="lead">这个本子已上私人锁，只有知道口令的人能打开。</p>
    <div class="token-row">
      <input class="line" id="lk-in" type="password" placeholder="口令" autocomplete="off" inputmode="text">
      <button class="btn dark" id="lk-ok">打开</button>
    </div>
    ${ui.lockErr ? `<div class="err-msg">${esc(ui.lockErr)}</div>` : ''}
  </div>`;
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
function reactsLine(t) {
  const rm = reactMap(t);
  const hearts = rm['❤️'] || [];
  return `<span class="reacts">
    <button class="rq ${hearts.includes(me()) ? 'on' : ''}" data-emo="❤️">${hearts.includes(me()) ? '♥' : '♡'}${
      hearts.length ? `<span class="hn">${hearts.map(esc).join('·')}</span>` : ''}</button>
    ${REACTS.slice(1).filter(e => rm[e] && rm[e].length).map(e =>
      `<button class="rpill ${rm[e].includes(me()) ? 'mine' : ''}" data-emo="${e}">${e}<span class="hn">${rm[e].map(esc).join('·')}</span></button>`).join('')}
    <button class="radd" data-act="react-open" title="更多回应">☺</button>
    ${ui.reactOpen === t.id ? `<span class="rpal">${REACTS.slice(1).map(e => `<button data-emo="${e}">${e}</button>`).join('')}</span>` : ''}
  </span>`;
}
function tcsHtml(cls, cur) {
  return `<span class="tcs ${cls}">${TC.map(c =>
    `<button data-tc="${c}" class="${cur === c ? 'on' : ''}" style="background:${c}" aria-label="字体颜色 ${c}"></button>`).join('')}</span>`;
}
function bgsHtml(cls, cur) {
  return `<span class="bgs ${cls}">${BGS.map(c =>
    `<button data-bg="${c}" class="${cur === c ? 'on' : ''}" style="background:${c || 'var(--card)'}" aria-label="便签底色"></button>`).join('')}</span>`;
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
  <div class="th card ${ui.actsOn === t.id ? 'acts-on' : ''}" data-id="${t.id}" style="border-left-color:${c}${t.bg ? `;background:${esc(t.bg)}` : ''}">
    <div class="th-head">
      <span class="dot8" style="background:${c}"></span><b>${esc(t.author)}</b>
      <span class="tm">${timeStr(t.ts)}${(t.updatedAt || 0) > (t.ts || 0) + 60e3 ? ' · 已编辑' : ''}</span>
      <span class="th-acts"><button data-act="edit">编辑</button><button data-act="del">删除</button></span>
    </div>
    ${editing ? `
    <div class="edit-box">
      <textarea id="edit-ta" style="color:${ui.editColor}">${esc(ui.editDraft)}</textarea>
      ${t.img && !ui.editRemoveImg ? `<div class="cmp-prev edit-img">${imgBlock(t)}<button class="px" data-act="edit-img-x" title="移除图片">✕</button></div>` : ''}
      <div class="cmp-tools">${tcsHtml('edit-tcs', ui.editColor)}${bgsHtml('edit-bgs', ui.editBg)}</div>
      <div class="edit-acts"><button class="btn" data-act="edit-cancel">取消</button><button class="btn dark" data-act="edit-save">保存</button></div>
    </div>` : `
    ${t.text ? `<div class="th-text"${t.textColor ? ` style="color:${esc(t.textColor)}"` : ''}>${esc(t.text)}</div>` : ''}
    ${imgBlock(t)}
    <div class="th-foot">
      ${reactsLine(t)}
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
function vTabs() {
  const seen = partnerSeen();
  const ws = (data.wishes || []).filter(w => !w.deleted);
  return `
  <div id="tabs">
    <button class="${ui.tab === 'feed' ? 'on' : ''}" data-tab="feed">想法</button>
    <button class="${ui.tab === 'list' ? 'on' : ''}" data-tab="list">100 件事${ws.length ? `<i>${ws.filter(w => w.done).length}/${ws.length}</i>` : ''}</button>
    <button class="${ui.tab === 'pick' ? 'on' : ''}" data-tab="pick">随心选</button>
    <button class="${ui.tab === 'cyc' ? 'on' : ''}" data-tab="cyc">姨妈</button>
    ${seen ? `<span class="lastseen"><span class="dot8" style="background:${colorOf(seen.name)}"></span>${esc(seen.name)} ${seenStr(seen.t)}来过</span>` : ''}
  </div>`;
}
function vFeed() {
  let list = thoughts().slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const total = list.length;
  const months = [...new Set(list.map(t => dayKey(t.ts || 0).slice(0, 7)))];
  const q = ui.q.trim().toLowerCase();
  const filtered = !!(q || ui.month);
  if (q) list = list.filter(t =>
    (t.text || '').toLowerCase().includes(q) || (t.author || '').toLowerCase().includes(q) ||
    (t.replies || []).some(r => !r.deleted && (r.text || '').toLowerCase().includes(q)));
  if (ui.month) list = list.filter(t => dayKey(t.ts || 0).startsWith(ui.month));
  const myColor = colorOf(me());
  const groups = [];
  for (const t of list) {
    const k = dayKey(t.ts || 0);
    if (!groups.length || groups[groups.length - 1].key !== k) groups.push({ key: k, items: [] });
    groups[groups.length - 1].items.push(t);
  }
  return `
  <div class="card" id="composer"${ui.cmpBg ? ` style="background:${ui.cmpBg}"` : ''}>
    <textarea id="cmp" placeholder="此刻的小想法…" rows="2" style="color:${ui.cmpColor}">${esc(ui.draft)}</textarea>
    ${ui.cmpImg ? `<div class="cmp-prev"><img src="${ui.cmpImg.url}" alt=""><button class="px" id="cmp-img-x" title="移除图片">✕</button></div>` : ''}
    <div class="cmp-tools">
      ${tcsHtml('cmp-tcs', ui.cmpColor)}
      ${bgsHtml('cmp-bgs', ui.cmpBg)}
      <span class="cmp-btns"><button class="imgbtn" id="cmp-doodle">🎨 涂鸦</button><button class="imgbtn" id="cmp-imgbtn">📷 图片</button></span>
      <input type="file" id="cmp-file" accept="image/*" hidden>
    </div>
    <div class="cmp-foot">
      <span class="me-chip"><span class="dot8" style="background:${myColor}"></span>${esc(me())}</span>
      <span class="cmp-hint">Ctrl + Enter 发布</span>
      <button class="cmp-send" id="cmp-send">发布</button>
    </div>
  </div>
  ${total > 3 || filtered ? `
  <div class="ftools">
    <input id="q-in" placeholder="搜想法…" value="${esc(ui.q)}">
    <select id="m-sel">
      <option value="">全部月份</option>
      ${months.map(m => `<option value="${m}" ${ui.month === m ? 'selected' : ''}>${m.slice(0, 4)}年${Number(m.slice(5))}月</option>`).join('')}
    </select>
    ${filtered ? `<button id="f-clear">✕ ${list.length} 条</button>` : ''}
  </div>` : ''}
  ${list.length ? groups.map(g => `
    <div class="day-label">${dayLabel(g.key)}</div>
    ${g.items.map(thoughtHtml).join('')}`).join('') :
    filtered ? `<div class="empty">没有找到相关想法</div>` :
    `<div class="empty">还没有想法。<br>写下第一条，${Object.keys(data.profiles).length > 1 ? '对方' : 'TA'} 打开就能看到。</div>`}
  `;
}
/* --- 视图：一起做的 100 件事 --- */
function vList() {
  const ws = (data.wishes || []).filter(w => !w.deleted);
  const done = ws.filter(w => w.done).sort((a, b) => (b.done.at || 0) - (a.done.at || 0));
  const todo = ws.filter(w => !w.done).sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const pct = ws.length ? Math.round(done.length / ws.length * 100) : 0;
  const wRow = w => {
    const dd = w.done ? new Date(w.done.at) : null;
    return `
    <div class="wish card ${w.done ? 'wd' : ''} ${ui.wActsOn === w.id ? 'acts-on' : ''}" data-wid="${w.id}">
      <button class="wcheck" data-act="w-toggle" title="${w.done ? '取消打卡' : '完成打卡'}">${w.done ? '✓' : ''}</button>
      <div class="wbody">
        ${ui.wEditId === w.id ? `
        <input class="line" id="w-edit-in" value="${esc(ui.wEditDraft)}" maxlength="100">
        <div class="edit-acts"><button class="btn" data-act="w-edit-cancel">取消</button><button class="btn dark" data-act="w-edit-save">保存</button></div>` : `
        <div class="wtext">${esc(w.text)}</div>
        <div class="wmeta">${w.done ? `${esc(w.done.by)} 打卡 · ${dd.getMonth() + 1}月${dd.getDate()}日` : `${esc(w.addedBy)} 提议`}</div>`}
        ${imgBlock(w)}
      </div>
      <span class="th-acts"><button data-act="w-img">配图</button><button data-act="w-edit">改</button><button data-act="w-del">删</button></span>
    </div>`;
  };
  return `
  <div class="card" id="wadd">
    <input id="w-in" placeholder="想到一件要一起做的事…" value="${esc(ui.wDraft)}" maxlength="100">
    <button class="cmp-send" id="w-add">添加</button>
  </div>
  ${ws.length ? `
  <div class="wprog">
    <span>已完成 <b>${done.length}</b> / ${ws.length} 件</span>
    <div class="wbar"><i style="width:${pct}%"></i></div>
  </div>` : `<div class="empty">把你们想一起做的事一条条记下来，<br>做到一件就打个勾，攒够一百件 ✓</div>`}
  ${todo.map(wRow).join('')}
  ${done.length ? `<div class="day-label">已完成 ${done.length} 件</div>${done.map(wRow).join('')}` : ''}
  <input type="file" id="w-file" accept="image/*" hidden>
  `;
}
/* --- 视图：随心选 --- */
function vPick() {
  const list = picks();
  let cur = ui.pickId ? pickById(ui.pickId) : null;
  if (!cur) cur = list[0] || null; /* 选中的分类被删/失效时回退到第一个 */
  if (cur) ui.pickId = cur.id;
  const partner = Object.keys(data.profiles || {}).find(n => n !== me());
  return `
  <div class="pk-cats">
    ${list.map(p => `<button class="pk-cat ${cur && cur.id === p.id ? 'on' : ''}" data-pick="${p.id}" style="${cur && cur.id === p.id ? `background:${p.color};border-color:${p.color}` : ''}">
      <span class="pe">${esc(p.emoji || '🎲')}</span>${esc(p.name)}</button>`).join('')}
    <button class="pk-cat add" data-act="pk-newcat">＋ 分类</button>
  </div>
  ${!cur ? `<div class="empty">还没有分类。<br>点「＋ 分类」加一个，比如奶茶、饭店、约会。</div>` : `
  <div class="pk-stage card" style="border-color:${cur.color}">
    <div class="pk-result ${ui.pickSpin ? 'spin' : ''}" style="color:${cur.color}">
      ${ui.pickResult && ui.pickResult.catId === cur.id
        ? esc(ui.pickResult.text)
        : (cur.options && cur.options.length ? '<span class="pk-hint">点下面按钮，随心选一个</span>' : '<span class="pk-hint">这个分类还没有选项，去下面加几个</span>')}
    </div>
    ${ui.pickResult && ui.pickResult.catId === cur.id && !ui.pickSpin && ui.pickResult.forName
      ? `<div class="pk-forwho">已为 <b>${esc(ui.pickResult.forName)}</b> 抽中${ui.pickResult.posted ? ' · 已送到 TA 的想法流 ✓' : ''}</div>` : ''}
    <div class="pk-forsel">
      <button class="${ui.pickFor === 'me' ? 'on' : ''}" data-pfor="me">给我抽</button>
      <button class="${ui.pickFor === 'ta' ? 'on' : ''}" data-pfor="ta" ${partner ? '' : 'disabled title="等对方登录后可用"'}>给 ${partner ? esc(partner) : 'TA'} 抽</button>
    </div>
    <button class="pk-go" data-act="pk-spin" style="background:${cur.color}" ${(cur.options && cur.options.length && !ui.pickSpin) ? '' : 'disabled'}>
      ${ui.pickSpin ? '抽选中…' : '随心选 🎲'}
    </button>
  </div>
  <div class="pk-opts-head">
    <span>${esc(cur.emoji || '')} ${esc(cur.name)} · ${(cur.options || []).length} 个选项</span>
    <button data-act="pk-edit">${ui.pickEdit ? '完成' : '编辑'}</button>
  </div>
  <div class="pk-opts">
    ${(cur.options || []).map((o, i) => `<span class="pk-opt">${esc(o)}${ui.pickEdit ? `<button class="ox" data-opt="${i}">✕</button>` : ''}</span>`).join('')}
    ${!(cur.options || []).length ? '<span class="pk-hint2">还没有选项</span>' : ''}
  </div>
  ${ui.pickEdit ? `
  <div class="pk-add">
    <input id="pk-opt-in" placeholder="加一个选项，如「蜜雪」" value="${esc(ui.pickOptDraft)}" maxlength="30">
    <button data-act="pk-addopt">加入</button>
  </div>
  <div class="pk-catedit">
    <button class="btn" data-act="pk-rename">改分类名 / 图标</button>
    <button class="btn" data-act="pk-delcat">删除该分类</button>
  </div>` : ''}
  `}`;
}
/* --- 视图：姨妈记录 --- */
function vCycle() {
  const owner = cycleOwnerName();
  const names = Object.keys(data.profiles || {});
  if (!owner) { /* 首次：先确认这是谁的记录，才能分「本人视图 / 体贴视图」 */
    return `
    <div class="card gate cyc-setup">
      <h2>这是谁的记录？</h2>
      <p class="lead">选一个人，之后 TA 打开是记录界面，另一位打开是体贴提醒界面。</p>
      <div class="who-list">
        ${names.map(n => `<button data-cycowner="${esc(n)}"><span class="dot8" style="background:${colorOf(n)}"></span>${esc(n)}</button>`).join('')}
      </div>
      ${names.length < 2 ? '<div class="tip">提示：等两个人都登录过，这里就能选到对方。</div>' : ''}
    </div>`;
  }
  const mine = iAmOwner();
  const info = cycleDayInfo();
  const st = info.stats;
  const fw = fertileWindow(st.nextStart);
  const cur = currentCycle();

  /* 顶部状态卡：本人是行动界面，对方是体贴提醒 */
  let big = '', sub = '', tip = '';
  if (info.state === 'on') {
    big = mine ? `第 ${info.day} 天` : `${esc(owner)} 第 ${info.day} 天`;
    sub = cur.end ? `已记录到 ${cur.end}` : '还在进行中';
    if (!mine) tip = info.day <= 2 ? '这两天最难受，别让 TA 碰凉的，多喝热水 🍵' : '记得多问一句「今天好点没」';
  } else if (info.state === 'wait') {
    big = info.days === 0 ? '预计就是今天' : `还有 ${info.days} 天`;
    sub = `预计 ${st.nextStart}${st.estimated ? '（按 28 天默认值推算）' : ''}`;
    if (!mine && info.days <= 3) tip = '快到了，可以提前备点红糖姜茶 ☕';
  } else if (info.state === 'late') {
    big = `已推迟 ${info.days} 天`;
    sub = `预计是 ${st.nextStart}`;
    if (!mine) tip = '周期本来就会浮动，先别紧张';
  } else {
    big = '还没有记录';
    sub = '点下面的按钮记下第一次';
  }

  return `
  <div class="cyc-status card ${info.state}">
    <div class="cyc-big">${big}</div>
    <div class="cyc-sub">${esc(sub)}</div>
    ${tip ? `<div class="cyc-tip">${tip}</div>` : ''}
    <div class="cyc-acts">
      ${info.state === 'on'
        ? `<button class="cyc-btn end" data-act="cyc-end">${mine ? '结束了' : '记录：结束了'}</button>`
        : `<button class="cyc-btn start" data-act="cyc-start">${mine ? '姨妈来了' : '记录：来了'}</button>`}
      <button class="cyc-btn ghost" data-act="cyc-other">记其他日期</button>
    </div>
  </div>
  ${vCycCal(st, fw)}
  <div class="cyc-stats">
    <div><b>${st.avgCycle}</b><span>平均周期(天)</span></div>
    <div><b>${st.avgLen}</b><span>平均持续(天)</span></div>
    <div><b>${st.count}</b><span>已记录(次)</span></div>
  </div>
  ${fw ? `<p class="cyc-note">浅色区间是按平均周期推算的易孕期，🥚 为估算排卵日。<b>仅供参考，会受作息、压力、生病影响，不能作为避孕依据。</b></p>`
       : '<p class="cyc-note">记满两次之后，预测会按你们自己的实际周期来算。</p>'}
  ${st.count ? `
  <div class="day-label">历史记录</div>
  <div class="cyc-hist">
    ${cycles().slice().reverse().slice(0, 12).map((c, i, arr) => {
      const ongoing = !c.end && currentCycle() && currentCycle().id === c.id;
      const len = c.end ? daysBetween(c.start, c.end) + 1 : null;
      const prev = arr[i + 1];
      const gap = prev ? daysBetween(prev.start, c.start) : null;
      return `<div class="cyc-row" data-cyc="${c.id}">
        <span class="cd">${c.start.slice(5)}${c.end ? ' ~ ' + c.end.slice(5) : (ongoing ? ' ~ 进行中' : ' ~ 未记结束')}</span>
        <span class="cl">${len ? len + ' 天' : ''}</span>
        <span class="cg">${gap ? '间隔 ' + gap + ' 天' : ''}</span>
        <button class="cx" data-act="cyc-del" title="删除这次记录">✕</button>
      </div>`;
    }).join('')}
  </div>` : ''}
  <div class="cyc-owner">记录归属：${esc(owner)} · <button data-act="cyc-chowner">修改</button></div>
  `;
}
function vCycCal(st, fw) { /* 月历：实心=已记录，虚线=预测，浅底=易孕期 */
  const now = new Date();
  const ym = ui.cycYM || { y: now.getFullYear(), m: now.getMonth() + 1 };
  const first = new Date(ym.y, ym.m - 1, 1);
  const days = new Date(ym.y, ym.m, 0).getDate();
  const lead = first.getDay();
  const t = todayStr();
  const cs = cycles();
  const onDay = ds => cs.some(c => ds >= c.start && ds <= cycleSpan(c));
  const predDays = [];
  if (st.nextStart) for (let i = 0; i < st.avgLen; i++) predDays.push(addDays(st.nextStart, i));
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<span class="cc pad"></span>');
  for (let d = 1; d <= days; d++) {
    const ds = `${ym.y}-${pad(ym.m)}-${pad(d)}`;
    const cls = ['cc'];
    if (onDay(ds)) cls.push('on');
    else if (predDays.includes(ds)) cls.push('pred');
    if (fw && ds >= fw.from && ds <= fw.to) cls.push('fert');
    if (ds === t) cls.push('today');
    const egg = fw && ds === fw.ovu ? '<i>🥚</i>' : '';
    cells.push(`<button class="${cls.join(' ')}" data-cday="${ds}">${d}${egg}</button>`);
  }
  return `
  <div class="cyc-cal card">
    <div class="cal-head">
      <button data-act="cyc-prev">‹</button>
      <b>${ym.y} 年 ${ym.m} 月</b>
      <button data-act="cyc-next">›</button>
    </div>
    <div class="cal-wd">${WD.map(w => `<span>${w}</span>`).join('')}</div>
    <div class="cal-grid">${cells.join('')}</div>
    <div class="cal-legend">
      <span><i class="lg on"></i>已记录</span>
      <span><i class="lg pred"></i>预测</span>
      ${fw ? '<span><i class="lg fert"></i>易孕期(推算)</span>' : ''}
    </div>
  </div>`;
}
function vMain() { return vTabs() + ({ list: vList, pick: vPick, cyc: vCycle, feed: vFeed }[ui.tab] || vFeed)(); }

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
  ${cloudEnabled() ? `
  <div class="kv"><span class="k">同步状态</span><span class="v" style="font-weight:400;font-size:12px;text-align:right">
    ${syncBusy ? '同步中…' : cloudLastOk ? '上次成功 ' + seenStr(cloudLastOk) : '尚未成功'}
    <button class="btn" data-act="syncnow">立即同步</button>
  </span></div>
  ${rateLimitUntil > Date.now() ? `<div class="kv"><span class="k" style="color:var(--red)">限频中</span><span class="v" style="font-weight:400;font-size:12px;color:var(--red)">约 ${Math.ceil((rateLimitUntil - Date.now()) / 1000)} 秒后自动恢复</span></div>` : ''}
  ${slog().length ? `<div class="kv" style="align-items:flex-start"><span class="k">最近错误</span><span class="v" style="font-weight:400;font-size:11px;color:var(--gray);text-align:right;line-height:1.7;max-width:72%">
    ${slog().map(e => `${seenStr(e.t)}${e.n > 1 ? ` ×${e.n}` : ''}：${esc(e.m)}`).join('<br>')}
  </span></div>` : ''}` : ''}
  <div class="kv"><span class="k">我的身份</span><span class="v">
    <span class="dot8" style="background:${myColor}"></span>${esc(me() || '未设置')}
    <button class="btn" data-act="switch-who">切换</button>
  </span></div>
  <div class="kv"><span class="k">我的颜色</span><span class="v">
    <span class="swatches" style="margin:0">
      ${PALETTE.map(cc => `<button data-mycolor="${cc}" class="${myColor === cc ? 'on' : ''}" style="background:${cc}"></button>`).join('')}
    </span>
  </span></div>
  <div class="kv"><span class="k">私人锁</span><span class="v">
    ${lockOn()
      ? `<span class="save-line"><span class="dot"></span>已上锁</span>
         <button class="btn" data-act="lock-change">改口令</button>
         <button class="btn" data-act="lock-off">撤销</button>`
      : `<span class="save-line off"><span class="dot"></span>未上锁</span>
         <button class="btn dark" data-act="lock-on">设置口令</button>`}
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
  const v = view();
  $('#main').innerHTML = ({ lock: vLock, setup: vSetup, who: vWho, main: vMain })[v]();
  /* 上锁未解锁时藏起设置齿轮与状态，避免绕过锁去改设置 */
  const locked = v === 'lock';
  $('#btn-gear').hidden = locked;
  $('#st-chip').hidden = locked;
  if (locked) { ui.sheet = false; renderSheet(); const el = $('#lk-in'); if (el) el.focus(); return; }
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
  addThought(text, img, ui.cmpColor === TC[0] ? '' : ui.cmpColor, ui.cmpBg);
  const c2 = $('#cmp'); if (c2) c2.focus();
}
async function pickImage(file) {
  if (!file) return;
  try { ui.cmpImg = await compressImage(file); render(); }
  catch (e) { alert(e.message); }
}
/* 随心选：老虎机式滚动动画，减速停在随机结果 */
function doSpin() {
  const cur = pickById(ui.pickId);
  if (!cur || !cur.options || !cur.options.length || ui.pickSpin) return;
  const opts = cur.options;
  const finalText = opts[Math.floor(Math.random() * opts.length)];
  ui.pickSpin = true;
  ui.pickResult = { catId: cur.id, text: opts[0] };
  render();
  let delay = 55, elapsed = 0, i = 0;
  const step = () => {
    const node = $('.pk-result');
    if (!node || !ui.pickSpin) { ui.pickSpin = false; return; }
    elapsed += delay;
    if (elapsed >= 1900) { /* 落定 */
      node.textContent = finalText;
      ui.pickSpin = false;
      finishSpin(cur, finalText);
      return;
    }
    i = (i + 1) % opts.length;
    node.textContent = opts[i];
    delay = Math.min(300, delay + 14); /* 逐渐减速 */
    setTimeout(step, delay);
  };
  setTimeout(step, delay);
}
function finishSpin(cur, text) {
  ui.pickResult = { catId: cur.id, text };
  if (ui.pickFor === 'ta') {
    const partner = Object.keys(data.profiles || {}).find(n => n !== me());
    if (partner) {
      ui.pickResult.forName = partner; ui.pickResult.posted = true;
      addThought(`🎁 我帮你随心选了个${cur.name}：${cur.emoji || ''} ${text}`, null, cur.color, '#FBF3E4'); /* commit 内含 render */
      return;
    }
  }
  render();
}
function onCycDayTap(ds, quiet) { /* 点日历某天：已在记录内→可删；否则→记为开始 / 补记结束 */
  const inCycle = cycles().find(c => ds >= c.start && ds <= cycleSpan(c));
  if (inCycle) {
    if (confirm(`${ds} 已在一次记录里（${inCycle.start} 开始）。要删除这次记录吗？`)) deleteCycle(inCycle.id);
    return;
  }
  const cur = currentCycle();
  if (cur && ds > cur.start) {
    if (confirm(`把 ${ds} 记为这次的结束日？`)) endPeriod(ds);
    return;
  }
  if (quiet || confirm(`把 ${ds} 记为姨妈开始的日子？`)) startPeriod(ds);
}
async function doUnlock() {
  const el = $('#lk-in'); if (!el) return;
  const pw = el.value;
  if (!pw) { el.focus(); return; }
  if (await tryUnlock(pw)) { ui.lockErr = ''; render(); syncNow(); }
  else { ui.lockErr = '口令不对'; render(); const e2 = $('#lk-in'); if (e2) { e2.value = ''; e2.focus(); } }
}
$('#main').addEventListener('click', e => {
  const v = view();
  /* 私人锁 */
  if (e.target.id === 'lk-ok') { doUnlock(); return; }
  if (v === 'lock') return;
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
  /* 页签 / 筛选 */
  const tab = e.target.closest('[data-tab]');
  if (tab) { ui.tab = tab.dataset.tab; ui.pickResult = null; ui.pickSpin = false; render(); return; }
  if (e.target.id === 'f-clear') { ui.q = ''; ui.month = ''; render(); return; }
  /* 姨妈记录 */
  if (ui.tab === 'cyc') {
    const ow = e.target.closest('[data-cycowner]');
    if (ow) { setCycleOwner(ow.dataset.cycowner); return; }
    const cd = e.target.closest('[data-cday]');
    if (cd) { onCycDayTap(cd.dataset.cday); return; }
    const ca = e.target.closest('[data-act]');
    if (ca) {
      switch (ca.dataset.act) {
        case 'cyc-start': startPeriod(todayStr()); break;
        case 'cyc-end': endPeriod(todayStr()); break;
        case 'cyc-other': {
          const d = prompt('记录哪一天？格式 2026-08-06', todayStr());
          if (d == null) break;
          if (!/^\d{4}-\d{2}-\d{2}$/.test(d.trim())) { alert('日期格式不对，应该像 2026-08-06'); break; }
          onCycDayTap(d.trim(), true);
          break;
        }
        case 'cyc-prev': case 'cyc-next': {
          const now = new Date();
          const ym = ui.cycYM || { y: now.getFullYear(), m: now.getMonth() + 1 };
          let m = ym.m + (ca.dataset.act === 'cyc-next' ? 1 : -1), y = ym.y;
          if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; }
          ui.cycYM = { y, m }; render();
          break;
        }
        case 'cyc-del': {
          const row = e.target.closest('[data-cyc]');
          if (row && confirm('删除这次记录？')) deleteCycle(row.dataset.cyc);
          break;
        }
        case 'cyc-chowner': setCycleOwner(''); break;
      }
      return;
    }
    return;
  }
  /* 随心选 */
  if (ui.tab === 'pick') {
    const pc = e.target.closest('[data-pick]');
    if (pc) { ui.pickId = pc.dataset.pick; ui.pickResult = null; ui.pickEdit = false; render(); return; }
    const pf = e.target.closest('[data-pfor]');
    if (pf) { ui.pickFor = pf.dataset.pfor; $$('.pk-forsel button').forEach(b => b.classList.toggle('on', b.dataset.pfor === ui.pickFor)); return; }
    const ox = e.target.closest('[data-opt]');
    if (ox) { removePickOption(ui.pickId, Number(ox.dataset.opt)); return; }
    const pact = e.target.closest('[data-act]');
    if (pact) {
      switch (pact.dataset.act) {
        case 'pk-spin': doSpin(); break;
        case 'pk-edit': ui.pickEdit = !ui.pickEdit; ui.pickOptDraft = ''; render(); break;
        case 'pk-addopt': {
          const el = $('#pk-opt-in'); const t = el ? el.value.trim() : '';
          if (t) { ui.pickOptDraft = ''; addPickOption(ui.pickId, t); const e2 = $('#pk-opt-in'); if (e2) e2.focus(); }
          break;
        }
        case 'pk-newcat': {
          const name = prompt('新分类名字（比如：电影、去哪玩）'); if (name == null) break;
          const emoji = prompt('给它一个 emoji 图标（可留空）', '🎲') || '🎲';
          addPick(name, emoji.trim().slice(0, 2));
          const list = picks(); ui.pickId = list[list.length - 1].id; ui.pickEdit = true; ui.pickResult = null; render();
          break;
        }
        case 'pk-rename': {
          const cur = pickById(ui.pickId); if (!cur) break;
          const name = prompt('分类名字', cur.name); if (name == null) break;
          const emoji = prompt('emoji 图标', cur.emoji || '🎲');
          updatePick(ui.pickId, { name, emoji: (emoji || cur.emoji || '🎲').trim().slice(0, 2) });
          break;
        }
        case 'pk-delcat':
          if (confirm('删除这个分类？（选项也会一起删）')) { const nx = picks().find(p => p.id !== ui.pickId); deletePick(ui.pickId); ui.pickId = nx ? nx.id : null; ui.pickResult = null; ui.pickEdit = false; }
          break;
      }
      return;
    }
    return;
  }
  /* 想法流 */
  if (e.target.id === 'cmp-send') { doPublish(); return; }
  if (e.target.id === 'cmp-imgbtn') { $('#cmp-file').click(); return; }
  if (e.target.id === 'cmp-doodle') { ddOpen(); return; }
  if (e.target.id === 'cmp-img-x') { ui.cmpImg = null; render(); return; }
  /* 字体颜色 / 便签底色：只改状态和样式，不整页重绘，避免打断输入 */
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
  const bgb = e.target.closest('[data-bg]');
  if (bgb) {
    const bg = bgb.dataset.bg;
    if (bgb.closest('.cmp-bgs')) {
      ui.cmpBg = bg; localStorage.setItem('us.bg.v1', bg);
      const cp = $('#composer'); if (cp) cp.style.background = bg || 'var(--card)';
      $$('.cmp-bgs [data-bg]').forEach(b => b.classList.toggle('on', b.dataset.bg === bg));
    } else {
      ui.editBg = bg;
      const cd = bgb.closest('.th'); if (cd) cd.style.background = bg || 'var(--card)';
      $$('.edit-bgs [data-bg]').forEach(b => b.classList.toggle('on', b.dataset.bg === bg));
    }
    return;
  }
  /* 回应贴纸（在卡片操作之前处理） */
  const emo = e.target.closest('[data-emo]');
  if (emo) {
    const card0 = emo.closest('.th');
    if (card0) { ui.reactOpen = null; toggleReact(card0.dataset.id, emo.dataset.emo); }
    return;
  }
  /* 100 件事 */
  const wrow = e.target.closest('.wish');
  if (wrow) {
    const wid = wrow.dataset.wid;
    const wact = e.target.closest('[data-act]');
    const w = data.wishes.find(x => x.id === wid);
    if (!wact) {
      const ph2 = e.target.closest('.ph.ld');
      if (ph2) { const im = $('img', ph2); if (im && im.src) { $('#viewer img').src = im.src; $('#viewer').hidden = false; } return; }
      ui.wActsOn = ui.wActsOn === wid ? null : wid;
      $$('.wish').forEach(el => el.classList.toggle('acts-on', el.dataset.wid === ui.wActsOn));
      return;
    }
    switch (wact.dataset.act) {
      case 'w-toggle': {
        const r = wact.getBoundingClientRect();
        if (toggleWish(wid)) confetti(r.left + r.width / 2, r.top + r.height / 2);
        break;
      }
      case 'w-edit':
        ui.wEditId = wid; ui.wEditDraft = w ? w.text : '';
        render();
        { const el = $('#w-edit-in'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }
        break;
      case 'w-edit-save': {
        const el = $('#w-edit-in');
        const txt = el ? el.value.trim() : '';
        ui.wEditId = null; ui.wEditDraft = '';
        if (txt) updateWish(wid, { text: txt }); else render();
        break;
      }
      case 'w-edit-cancel': ui.wEditId = null; ui.wEditDraft = ''; render(); break;
      case 'w-del': if (confirm('删除这件事？')) deleteWish(wid); break;
      case 'w-img': ui.wImgFor = wid; $('#w-file').click(); break;
    }
    return;
  }
  if (e.target.id === 'w-add') {
    const el = $('#w-in');
    const txt = el ? el.value.trim() : '';
    if (txt) { ui.wDraft = ''; addWish(txt); const el2 = $('#w-in'); if (el2) el2.focus(); }
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
    case 'react-open': ui.reactOpen = ui.reactOpen === id ? null : id; render(); break;
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
      ui.editColor = (t && t.textColor) || TC[0]; ui.editBg = (t && t.bg) || ''; ui.editRemoveImg = false;
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
      updateThought(id, { text: txt, textColor: ui.editColor === TC[0] ? '' : ui.editColor, bg: ui.editBg, removeImg });
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
  if (e.target.id === 'w-file' && e.target.files && e.target.files[0]) {
    const file = e.target.files[0]; e.target.value = '';
    const wid = ui.wImgFor; ui.wImgFor = null;
    if (!wid) return;
    compressImage(file).then(async r => {
      const id = 'l' + uuid();
      await idbSet('img:' + id, r.url);
      updateWish(wid, { img: { id, w: r.w, h: r.h, pending: true } });
    }).catch(err => alert(err.message));
  }
  if (e.target.id === 'm-sel') { ui.month = e.target.value; render(); }
});
$('#viewer').addEventListener('click', () => { $('#viewer').hidden = true; $('#viewer img').src = ''; });
const qRender = debounce(() => { /* 搜索边打边筛，渲染后把焦点还给搜索框 */
  render();
  const el = $('#q-in');
  if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
}, 250);
$('#main').addEventListener('input', e => {
  if (e.target.id === 'cmp') { ui.draft = e.target.value; autosize(e.target); }
  if (e.target.id === 'edit-ta') ui.editDraft = e.target.value;
  if (e.target.id === 'reply-in') ui.replyDraft = e.target.value;
  if (e.target.id === 'g-token') ui.tokenDraft = e.target.value;
  if (e.target.id === 'who-name') ui.whoName = e.target.value;
  if (e.target.id === 'q-in') { ui.q = e.target.value; qRender(); }
  if (e.target.id === 'w-in') ui.wDraft = e.target.value;
  if (e.target.id === 'w-edit-in') ui.wEditDraft = e.target.value;
  if (e.target.id === 'pk-opt-in') ui.pickOptDraft = e.target.value;
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
  if (e.target.id === 'lk-in' && e.key === 'Enter') { e.preventDefault(); doUnlock(); }
  if (e.target.id === 'g-token' && e.key === 'Enter') { e.preventDefault(); doLogin(); }
  if (e.target.id === 'who-name' && e.key === 'Enter') { e.preventDefault(); const b = $('#who-ok'); if (b) b.click(); }
  if (e.target.id === 'w-in' && e.key === 'Enter') { e.preventDefault(); const b = $('#w-add'); if (b) b.click(); }
  if (e.target.id === 'pk-opt-in' && e.key === 'Enter') { e.preventDefault(); const t = e.target.value.trim(); if (t) { ui.pickOptDraft = ''; addPickOption(ui.pickId, t); const el = $('#pk-opt-in'); if (el) el.focus(); } }
  if (e.target.id === 'w-edit-in' && e.key === 'Enter') { e.preventDefault(); const b = $('[data-act="w-edit-save"]'); if (b) b.click(); }
});

/* 设置弹层 */
$('#btn-gear').addEventListener('click', () => { ui.sheet = true; renderSheet(); });
$('#st-chip').addEventListener('click', () => { ui.sheet = true; renderSheet(); }); /* 点状态点 → 看同步详情/错误 */
$('#st-chip').style.cursor = 'pointer';
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
    case 'syncnow':
      syncFails = 0; rateLimitUntil = 0; imgRetryCount = 0; imgTries.clear();
      syncNow().then(() => renderSheet());
      renderSheet();
      break;
    case 'lock-on':
    case 'lock-change': {
      const pw = prompt(act.dataset.act === 'lock-change' ? '设置新口令' : '设置口令（只有知道它的人能打开这个本子）');
      if (pw == null) break;
      if (!pw.trim()) { alert('口令不能为空'); break; }
      const again = prompt('再输一次确认');
      if (again == null) break;
      if (again !== pw) { alert('两次输入不一致，没有改动'); break; }
      setLock(pw).then(() => {
        renderSheet();
        alert('已上锁。请记住口令——它会同步到所有已登录的设备，别的设备打不开。\n\n忘记了也有退路：你是 Gitee 账号主人，可以在 Gist 里删掉 lock 字段。');
      });
      break;
    }
    case 'lock-off':
      if (confirm('撤销私人锁？之后打开应用不再需要口令。')) { removeLock(); renderSheet(); }
      break;
  }
});
$('#sheet').addEventListener('change', e => {
  if (e.target.id === 'imp-file' && e.target.files && e.target.files[0]) {
    importBackup(e.target.files[0]);
    e.target.value = '';
  }
});

/* ================= 启动 ================= */
ddBind();
render();
syncNow();
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  /* updateViaCache:'none' —— 连 sw.js 本身也不吃 HTTP 缓存，保证能及时发现新版本 */
  const hadController = !!navigator.serviceWorker.controller; /* 首次安装时为 false */
  let swRefreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    /* 新版本接管了：只有「本来就在旧版本上」才刷新——首次安装不刷，避免白刷一次 */
    if (swRefreshing || !hadController) return;
    swRefreshing = true;
    location.reload();
  });
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
    .then(reg => { reg.update().catch(() => {}); })
    .catch(() => {});
  document.addEventListener('visibilitychange', () => { /* 每次切回前台顺手查一次更新 */
    if (!document.hidden) navigator.serviceWorker.getRegistration().then(r => r && r.update()).catch(() => {});
  });
}
