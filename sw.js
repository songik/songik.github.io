// 홈 화면 추가(앱 설치)용 최소 서비스 워커.
// 파일을 저장해 두지 않고 항상 네트워크에서 받아오므로, app.js/styles.css를 수정해 올리면 바로 새 버전이 반영됩니다.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request));
});
