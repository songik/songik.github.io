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

// 전역 변수로 명확하게 선언
window.db = null;
window.auth = null;
window.storage = null;
window.DEFAULT_PASSWORD = "sik282";

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
