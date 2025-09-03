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
          <button onclick="logout()" class="logout-button">
            로그아웃
          </button>
        </div>
      </div>
    </nav>
    <div id="content" class="content">
      <!-- 현재 페이지 내용이 여기에 표시됩니다 -->
    </div>
    <div id="modal-container"></div>
  `;

  // 활성 메뉴 표시
  updateActiveMenu();
  
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
    const snapshot = await eventsRef.orderBy("start", "asc").get();
    
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
          <div class="list-item-title">${event.title}</div>
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

// 날짜 배경색 설정 함수
function showDateColorForm(date) {
  const formattedDate = formatDate(date);
  
  const modalContent = `
    <form id="date-color-form">
      <div class="form-group">
        <label for="background-color">배경색 선택</label>
        <input type="color" id="background-color" value="#e8f5e9">
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
    const dateColorRef = db.collection("dateColors");
    const snapshot = await dateColorRef.get();
    
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

// 일정 달력 렌더링
function renderEventsCalendar(events) {
  const calendarEl = document.getElementById('calendar');
  
  if (!calendarEl) return;
  
  // 이전 인스턴스 제거 (있을 경우)
  if (window.eventCalendar) {
    try {
      window.eventCalendar.destroy();
    } catch (err) {
      console.error("캘린더 제거 중 오류:", err);
    }
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

// FullCalendar 초기화
window.eventCalendar = new FullCalendar.Calendar(calendarEl, {
  headerToolbar: {
    left: 'prev,next today',
    center: 'title',
    right: isMobile ? 'dayGridMonth,listMonth' : 'dayGridMonth,timeGridWeek,timeGridDay'
  },
  initialView: isMobile ? 'listMonth' : 'dayGridMonth', // 모바일에서는 기본 리스트 뷰
  height: isMobile ? 'auto' : undefined, // 모바일에서 높이 자동 조정
  dayMaxEventRows: isMobile ? 2 : 6, // 모바일에서 표시하는 이벤트 수 제한
  eventTimeFormat: { // 시간 표시 형식 간소화
    hour: '2-digit',
    minute: '2-digit',
    meridiem: false
  },
  locale: 'ko',
  events: [...events, ...koreanHolidays, ...colorEvents],
  editable: true,
  selectable: true,
  selectMirror: true,
  dayMaxEvents: false,
  
  // 이벤트 렌더링 커스터마이징 - 모바일 최적화
  eventDidMount: function(info) {
    // 모바일에서 이벤트 표시 최적화
    if (isMobile && info.view.type === 'dayGridMonth') {
      const eventEl = info.el;
      eventEl.style.fontSize = '0.8rem';
      eventEl.style.padding = '2px 4px';
      
      // 이벤트 텍스트 길이 제한
      const titleEl = eventEl.querySelector('.fc-event-title');
      if (titleEl && titleEl.textContent.length > 10) {
        titleEl.textContent = titleEl.textContent.substring(0, 10) + '...';
      }
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
    
        // 날짜 선택 시 이벤트 추가 폼 표시
        select: function(info) {
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
              action: () => showAddEventForm(dateStr)
            },
            {
              label: '배경색 설정',
              action: () => showDateColorForm(new Date(dateStr))
            }
          ];
          
          // 창 크기 변경 시 달력 반응형 업데이트 (함수 끝 부분에 추가)
window.addEventListener('resize', function() {
  const newIsMobile = window.innerWidth < 768;
  if (newIsMobile !== isMobile) {
    loadEvents(); // 달력 새로고침
  }
});
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
  <input type="color" id="event-color" value="#2196f3">
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
          <input type="color" id="event-color" value="${event.color || '#2196f3'}">
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
}

// Firestore에 업데이트
await db.collection("events").doc(eventId).update(eventData);
    
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
  if (confirm('정말로 이 일정을 삭제하시겠습니까?')) {
    try {
      await db.collection("events").doc(eventId).delete();
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
    const snapshot = await todosRef.orderBy("dueDate", "asc").get();
    
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
  const calendar = new FullCalendar.Calendar(calendarEl, {
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,listWeek'
    },
    initialView: 'dayGridMonth',
    locale: 'ko',
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
  
  calendar.render();
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
    
    const snapshot = await goalsRef.get();
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
        const tasksRef = db.collection("goals").doc(goalId).collection("tasks");
        const tasksSnapshot = await tasksRef.get();
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
    const snapshot = await weightsRef.orderBy("date", "desc").get();
    
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
  const calendar = new FullCalendar.Calendar(calendarEl, {
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth'
    },
    initialView: 'dayGridMonth',
    locale: 'ko',
    events: events,
    eventClick: function(info) {
      editWeight(info.event.id);
    },
    dateClick: function(info) {
      showAddWeightForm(info.dateStr);
    }
  });
  
  calendar.render();
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
    const snapshot = await transactionsRef.orderBy("date", "desc").get();
    
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
  const calendar = new FullCalendar.Calendar(calendarEl, {
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth'
    },
    initialView: 'dayGridMonth',
    locale: 'ko',
    events: events,
    eventClick: function(info) {
      editTransaction(info.event.id);
    },
    dateClick: function(info) {
      showAddTransactionForm(info.dateStr);
    }
  });
  
  calendar.render();
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
    const snapshot = await diariesRef.orderBy("date", "desc").get();
    
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
    const snapshot = await notesRef.orderBy("updatedAt", "desc").get();
    
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
    const habitsRef = db.collection("habits");
    const snapshot = await habitsRef.orderBy("createdAt", "desc").get();
    
    const habits = [];
    
    for (const doc of snapshot.docs) {
      const habit = doc.data();
      
      // 습관 완료 기록 불러오기
      const recordsSnapshot = await db.collection("habits").doc(doc.id).collection("records").get();
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
  
  if (habits.length === 0) {
    habitsListEl.innerHTML = '<p>등록된 습관이 없습니다.</p>';
    return;
  }
  
  // 오늘 날짜
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let html = '<ul class="list-container">';
  
  habits.forEach(habit => {
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
            <span class="habit-category">${habit.category}</span>
            <span class="habit-stats">이번 달: ${monthCompletedCount}회 완료</span>
          </div>
        </div>
        <div class="list-item-actions">
          <button onclick="showHabitCalendar('${habit.id}')">달력</button>
          <button onclick="editHabit('${habit.id}')">수정</button>
          <button onclick="deleteHabit('${habit.id}')">삭제</button>
        </div>
      </li>
    `;
  });
  
  html += '</ul>';
  habitsListEl.innerHTML = html;
}

// 습관 달력 렌더링
function renderHabitsCalendar(habits) {
  const calendarEl = document.getElementById('habit-calendar');
  
  if (!calendarEl) return;
  
  // 달력에 표시할 이벤트 형식으로 변환
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
  const calendar = new FullCalendar.Calendar(calendarEl, {
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth'
    },
    initialView: 'dayGridMonth',
    locale: 'ko',
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
  
  calendar.render();
}

// 카테고리별 색상 가져오기
function getCategoryColor(category) {
  const colors = {
    '약': '#f44336',
    '운동': '#4caf50',
    '학습': '#2196f3',
    '업무': '#ff9800',
    '기타': '#9c27b0'
  };
  
  return colors[category] || colors['기타'];
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
    
    habitItems += `
      <div class="habit-day-item">
        <input 
          type="checkbox" 
          ${isCompleted ? 'checked' : ''} 
          onchange="updateHabitRecord('${habit.id}', '${formattedDate}', ${!isCompleted})"
        />
        <span>${habit.name} (${habit.category})</span>
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
    const habitDoc = await db.collection("habits").doc(habitId).get();
    
    if (!habitDoc.exists) {
      alert('습관 정보를 찾을 수 없습니다.');
      return;
    }
    
    const habit = habitDoc.data();
    
    // 습관 완료 기록 불러오기
    const recordsSnapshot = await db.collection("habits").doc(habitId).collection("records").get();
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
    const firstDayOfWeek = firstDay.getDay(); // 0: 일요일, 1: 월요일, ...
    
    // 달력 HTML 생성
    let calendarHTML = `
      <h3>${year}년 ${month + 1}월</h3>
      <div class="habit-calendar">
        ${['일', '월', '화', '수', '목', '금', '토'].map(day => `<div class="habit-day habit-day-header">${day}</div>`).join('')}
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
    const lastDayOfWeek = lastDay.getDay();
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
    

// 습관 추가 폼 표시
function showAddHabitForm() {
  const modalContent = `
    <form id="habit-form">
      <div class="form-group">
        <label for="habit-name">습관명</label>
        <input type="text" id="habit-name" required>
      </div>
      <div class="form-group">
        <label for="habit-category">카테고리</label>
        <select id="habit-category">
          <option value="약">약</option>
          <option value="운동">운동</option>
          <option value="학습">학습</option>
          <option value="업무">업무</option>
          <option value="기타">기타</option>
        </select>
      </div>
      <div class="form-group" id="habit-custom-category-container" style="display: none;">
        <label for="habit-custom-category">카테고리 (직접 입력)</label>
        <input type="text" id="habit-custom-category" placeholder="카테고리 입력">
      </div>
    </form>
  `;
  
  showModal("습관 추가", modalContent, saveHabit);
  
  // 카테고리 직접 입력 토글
  setTimeout(() => {
    document.getElementById('habit-category').addEventListener('change', function() {
      const customContainer = document.getElementById('habit-custom-category-container');
      if (this.value === '기타') {
        customContainer.style.display = 'block';
      } else {
        customContainer.style.display = 'none';
      }
    });
  }, 100);
}

// 습관 저장
async function saveHabit() {
  const nameEl = document.getElementById('habit-name');
  const categoryEl = document.getElementById('habit-category');
  const customCategoryEl = document.getElementById('habit-custom-category');
  
  if (!nameEl.value) {
    alert('습관명은 필수 입력 항목입니다.');
    return;
  }
  
  try {
    // 카테고리 설정
    let category = categoryEl.value;
    if (category === '기타' && customCategoryEl.value.trim()) {
      category = customCategoryEl.value.trim();
    }
    
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
    
    // 기본 카테고리 목록
    const defaultCategories = ['약', '운동', '학습', '업무', '기타'];
    const isCustomCategory = !defaultCategories.includes(habit.category);
    
    const modalContent = `
      <form id="habit-form">
        <input type="hidden" id="habit-id" value="${habitId}">
        <div class="form-group">
          <label for="habit-name">습관명</label>
          <input type="text" id="habit-name" value="${habit.name}" required>
        </div>
        <div class="form-group">
          <label for="habit-category">카테고리</label>
          <select id="habit-category">
            <option value="약" ${habit.category === '약' ? 'selected' : ''}>약</option>
            <option value="운동" ${habit.category === '운동' ? 'selected' : ''}>운동</option>
            <option value="학습" ${habit.category === '학습' ? 'selected' : ''}>학습</option>
            <option value="업무" ${habit.category === '업무' ? 'selected' : ''}>업무</option>
            <option value="기타" ${isCustomCategory || habit.category === '기타' ? 'selected' : ''}>기타</option>
          </select>
        </div>
        <div class="form-group" id="habit-custom-category-container" style="display: ${isCustomCategory ? 'block' : 'none'};">
          <label for="habit-custom-category">카테고리 (직접 입력)</label>
          <input type="text" id="habit-custom-category" placeholder="카테고리 입력" value="${isCustomCategory ? habit.category : ''}">
        </div>
      </form>
    `;
    
    showModal("습관 수정", modalContent, updateHabit);
    
    // 카테고리 직접 입력 토글
    setTimeout(() => {
      document.getElementById('habit-category').addEventListener('change', function() {
        const customContainer = document.getElementById('habit-custom-category-container');
        if (this.value === '기타') {
          customContainer.style.display = 'block';
        } else {
          customContainer.style.display = 'none';
        }
      });
    }, 100);
  } catch (error) {
    console.error("습관 정보 로드 중 오류 발생:", error);
    alert('습관 정보를 불러오는 중 오류가 발생했습니다.');
  }
}

// 습관 업데이트
async function updateHabit() {
  const habitId = document.getElementById('habit-id').value;
  const nameEl = document.getElementById('habit-name');
  const categoryEl = document.getElementById('habit-category');
  const customCategoryEl = document.getElementById('habit-custom-category');
  
  if (!nameEl.value) {
    alert('습관명은 필수 입력 항목입니다.');
    return;
  }
  
  try {
    // 카테고리 설정
    let category = categoryEl.value;
    if (category === '기타' && customCategoryEl.value.trim()) {
      category = customCategoryEl.value.trim();
    }
    
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

// 습관 삭제
async function deleteHabit(habitId) {
  if (confirm('정말로 이 습관을 삭제하시겠습니까? 모든 기록도 함께 삭제됩니다.')) {
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
    const snapshot = await bpRef.orderBy("date", "desc").get();
    
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
    const bpDateColorRef = db.collection("bpDateColors");
    const snapshot = await bpDateColorRef.get();
    
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
  
  // 이전 인스턴스 제거
  if (window.bpCalendar) {
    try {
      window.bpCalendar.destroy();
    } catch (err) {
      console.error("혈압 달력 제거 중 오류:", err);
    }
  }
  
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
    window.bpCalendar = new FullCalendar.Calendar(calendarEl, {
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,listMonth'
      },
      initialView: 'dayGridMonth',
      locale: 'ko',
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
    
    window.bpCalendar.render();
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
const eventsSnapshot = await db.collection("events").get();
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
    const todosSnapshot = await db.collection("todos").get();
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
    const diariesSnapshot = await db.collection("diaries").get();
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
    const notesSnapshot = await db.collection("notes").get();
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
    const habitsSnapshot = await db.collection("habits").get();
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
    const transactionsSnapshot = await db.collection("transactions").get();
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
    const weightsSnapshot = await db.collection("weights").get();
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
const bloodPressuresSnapshot = await db.collection("bloodpressures").get();
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
    const goalsSnapshot = await db.collection("goals").get();
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
