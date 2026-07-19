/* 我们的小想法 Service Worker：应用壳缓存 + 字体运行时缓存（离线可用） */
const VER = 'us-v3';
const RT = 'us-rt-v1';
const CORE = ['./', './index.html', './app.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VER).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VER && k !== RT).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return; /* Gist PATCH/POST 直通 */

  /* 应用壳：网络优先（保证更新），失败回退缓存（离线可用） */
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(e.request).then(r => {
        const cp = r.clone();
        caches.open(VER).then(c => c.put(e.request, cp));
        return r;
      }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
    );
    return;
  }
  /* Google Fonts：缓存优先 + 后台更新 */
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(
      caches.open(RT).then(async c => {
        const hit = await c.match(e.request);
        const net = fetch(e.request).then(r => { c.put(e.request, r.clone()); return r; }).catch(() => hit);
        return hit || net;
      })
    );
  }
  /* 其他跨域（Gist API GET 等）不拦截 */
});
