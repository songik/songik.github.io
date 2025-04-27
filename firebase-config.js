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

// Firebase 초기화
try {
  if (firebase.apps && firebase.apps.length === 0) {
    firebase.initializeApp(firebaseConfig);
  } else {
    firebase.app(); // 이미 초기화된 앱이 있다면 그것을 사용
  }
  
  // Firebase 서비스 참조 생성
  const db = firebase.firestore();
  const auth = firebase.auth();
  const storage = firebase.storage();
  
  // 기본 비밀번호 설정
  const DEFAULT_PASSWORD = "sik282";
  
  console.log("Firebase 초기화 완료");
} catch (error) {
  console.error("Firebase 초기화 오류:", error);
}