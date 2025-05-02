// Firebase 초기화 설정
const firebaseConfig = {
  apiKey: "AIzaSyCm9ocxNT4IflnRjDXC7SknegFauX0iIxo",
  authDomain: "song-homepage.firebaseapp.com",
  projectId: "song-homepage",
  storageBucket: "song-homepage.firebasestorage.app",
  messagingSenderId: "772049031563",
  appId: "1:772049031563:web:bec6f81700c5e609689f8e",
  measurementId: "G-J1DPBKM3ZJ"
};

// 전역 변수로 선언
window.db = null;
window.auth = null;
window.storage = null;
window.DEFAULT_PASSWORD = "sik282";

// Firebase 초기화
try {
  if (firebase.apps && firebase.apps.length === 0) {
    firebase.initializeApp(firebaseConfig);
  } else {
    firebase.app(); // 이미 초기화된 앱이 있다면 그것을 사용
  }
  
  // Firebase 서비스 참조 생성 (window 객체에 할당)
  window.db = firebase.firestore();
  window.auth = firebase.auth();
  window.storage = firebase.storage();
  
  console.log("Firebase 초기화 완료");
} catch (error) {
  console.error("Firebase 초기화 오류:", error);
}
// 모바일 감지 함수 추가
function isMobileDevice() {
  return (
    window.innerWidth <= 768 || 
    navigator.userAgent.match(/Android/i) ||
    navigator.userAgent.match(/webOS/i) ||
    navigator.userAgent.match(/iPhone/i) ||
    navigator.userAgent.match(/iPad/i) ||
    navigator.userAgent.match(/iPod/i) ||
    navigator.userAgent.match(/BlackBerry/i) ||
    navigator.userAgent.match(/Windows Phone/i)
  );
}

// 모바일 환경 초기 감지
window.IS_MOBILE = isMobileDevice();

// 모바일 환경에서 성능 최적화 설정
if (window.IS_MOBILE) {
  console.log("모바일 환경 감지: 성능 최적화 설정 적용");
  
  // Firestore 캐싱 개선
  try {
    window.db.settings({
      cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED
    });
    
    // 오프라인 지속성 활성화 (선택적)
    window.db.enablePersistence({synchronizeTabs: true})
      .catch(err => {
        console.warn("오프라인 지속성 활성화 실패:", err);
      });
      
    console.log("모바일 최적화 설정이 완료되었습니다.");
  } catch (error) {
    console.error("모바일 최적화 설정 중 오류 발생:", error);
  }
}
