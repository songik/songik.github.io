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
  // auth / storage 스크립트는 사용하지 않아 불러오지 않으므로, 있을 때만 연결
  if (typeof firebase.auth === 'function') window.auth = firebase.auth();
  if (typeof firebase.storage === 'function') window.storage = firebase.storage();
  
  console.log("Firebase 초기화 완료");
} catch (error) {
  console.error("Firebase 초기화 오류:", error);
}
