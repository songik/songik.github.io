// 앱 상태
let isAuthenticated = false;
let currentPage = "home";
let currentView = "list"; // 'list' 또는 'calendar'
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
            <a href="#" class="nav-links" onclick="navigateTo('coupons')">쿠폰</a>
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
  
  // 페이지 렌더링 전에 약간의 지연을 두어 DOM이 정리될 시간을 줌
  setTimeout(() => {
    renderPage(page);
  }, 50);
  
  // 모바일에서 메뉴가 열려있을 경우 닫기
  const navMenu = document.getElementById("nav-menu");
  if (navMenu && navMenu.classList.contains("active")) {
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
    case "coupons":
      loadCoupons();
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
    case "coupons":
      renderCouponsPage(contentEl);
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
  
// 한국 공휴일 추가 함수가 없으면 추가
  if (typeof addKoreanHolidays !== 'function') {
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
        
        // 2025년 추석
        holidays.push({ title: '추석 연휴', start: '2025-09-29' });
        holidays.push({ title: '추석', start: '2025-09-30' });
        holidays.push({ title: '추석 연휴', start: '2025-10-01' });
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
  }
  
  // 기존 함수
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
      
      // 2025년 추석
      holidays.push({ title: '추석 연휴', start: '2025-09-29' });
      holidays.push({ title: '추석', start: '2025-09-30' });
      holidays.push({ title: '추석 연휴', start: '2025-10-01' });
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
  dayMaxEvents: true,
  
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
    // 종일 이벤트라면 endDate를 startDate와 동일하게 설정
    if (allDay) {
      endDate = new Date(startDate);
    } else {
      // 종일 이벤트가 아니라면 1시간 후로 설정
      endDate = new Date(startDate);
      endDate.setHours(startDate.getHours() + 1);
    }
  } else if (typeof endDate === 'string') {
    endDate = new Date(endDate);
  }
  
  // 날짜 포맷을 HTML 입력에 맞게 변환
  const formattedStartDate = formatDateForInput(startDate);
  const formattedEndDate = formatDateForInput(endDate);
  
  const modalContent = `
    <form id="event-form">
      <div class="form-group">
        <label for="event-title">제목</label>
        <input type="text" id="event-title" required>
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
    const adjustedEndDate = `${formattedDate}T00:00`;
    
    startDateInput.value = adjustedStartDate;
    endDateInput.value = adjustedEndDate;
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
        // 종일 이벤트는 시간 정보를 00:00:00으로 

// 일정 업데이트 (계속)
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
      
      // 모달 닫기 (열려있는 경우)
      if (isModalOpen) {
        closeModal();
      }
      
      // 현재 보고 있는 페이지에 따라 달력 또는 쿠폰 새로고침
      if (currentPage === "calendar") {
        loadEvents(); // 일정 목록 새로고침
      } else if (currentPage === "coupons") {
        loadCoupons(); // 쿠폰 목록 새로고침
      }
    } catch (error) {
      console.error("일정 삭제 중 오류 발생:", error);
      alert('일정을 삭제하는 중 오류가 발생했습니다.');
    }
  }
}

// =========== 쿠폰 관리 기능 ===========

// 쿠폰 페이지 렌더링
function renderCouponsPage(container) {
  container.innerHTML = `
    <div class="page-container">
      <div class="page-header">
        <h1>쿠폰 관리</h1>
        <div class="page-actions">
          <button onclick="showAddCouponForm()">쿠폰 추가</button>
        </div>
      </div>
      
      <div class="calendar-container coupon-calendar">
        <div id="coupon-calendar"></div>
      </div>
    </div>
  `;
  
  // 쿠폰 데이터 불러오기 및 달력 표시
  loadCoupons();
  
  // 스타일 추가
  addCouponPageStyles();
}

// 쿠폰 관련 스타일 추가 함수
function addCouponPageStyles() {
  const styleEl = document.createElement('style');
  styleEl.id = 'coupon-page-styles';
  styleEl.textContent = `
    /* 쿠폰 달력 컨테이너 */
    .coupon-calendar {
      margin-top: 20px;
    }
    
    /* 쿠폰 아이템 스타일 */
    .coupon-item {
      background-color: #f8bbd0;
      color: #880e4f;
      border-left: 3px solid #e91e63;
      padding: 5px;
      margin-bottom: 2px;
      border-radius: 3px;
      font-size: 0.9em;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    
    /* 만료된 쿠폰 스타일 */
    .coupon-expired {
      background-color: #eeeeee;
      color: #9e9e9e;
      border-left: 3px solid #bdbdbd;
      text-decoration: line-through;
    }
    
    /* 오늘 만료되는 쿠폰 스타일 */
    .coupon-today {
      background-color: #ffecb3;
      color: #ff6f00;
      border-left: 3px solid #ffa000;
      font-weight: bold;
    }
    
    /* 날짜 배경색 스타일 */
    .date-color-coupon {
      opacity: 0.3;
    }
    
    /* 컨텍스트 메뉴 */
    .coupon-context-menu {
      position: absolute;
      background-color: white;
      border: 1px solid #ddd;
      border-radius: 4px;
      box-shadow: 0 2px 5px rgba(0,0,0,0.2);
      z-index: 1000;
      padding: 5px 0;
    }
    
    .coupon-context-menu-item {
      padding: 8px 15px;
      cursor: pointer;
    }
    
    .coupon-context-menu-item:hover {
      background-color: #f5f5f5;
    }
  `;
  
  // 이미 존재하는 스타일이 있으면 제거
  const existingStyle = document.getElementById('coupon-page-styles');
  if (existingStyle) {
    existingStyle.remove();
  }
  
  document.head.appendChild(styleEl);
}

// 쿠폰 데이터 불러오기
async function loadCoupons() {
  try {
    const couponsRef = db.collection("coupons");
    const snapshot = await couponsRef.orderBy("expiryDate", "asc").get();
    
    const coupons = [];
    snapshot.forEach(doc => {
      const coupon = doc.data();
      coupons.push({
        id: doc.id,
        title: coupon.title,
        description: coupon.description || '',
        storeName: coupon.storeName || '',
        expiryDate: coupon.expiryDate.toDate(),
        color: coupon.color || '#f8bbd0' // 기본 색상
      });
    });
    
    // 날짜 배경색 불러오기
    const dateColors = await loadCouponDateColors();
    
    // 쿠폰 달력 렌더링
    renderCouponsCalendar(coupons, dateColors);
  } catch (error) {
    console.error("쿠폰을 불러오는 중 오류 발생:", error);
    document.getElementById("coupon-calendar").innerHTML = '<p>쿠폰을 불러오는 중 오류가 발생했습니다.</p>';
  }
}

// 날짜 배경색 불러오기
async function loadCouponDateColors() {
  try {
    const dateColorRef = db.collection("couponDateColors");
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

// 쿠폰 달력 렌더링
function renderCouponsCalendar(coupons, dateColors) {
  const calendarEl = document.getElementById('coupon-calendar');
  
  if (!calendarEl) return;
  
  // 이전 인스턴스 제거 (있을 경우)
  if (window.couponCalendar) {
    try {
      window.couponCalendar.destroy();
    } catch (err) {
      console.error("캘린더 제거 중 오류:", err);
    }
  }
  
  // 오늘 날짜
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // 달력에 표시할 이벤트 형식으로 변환
  const events = coupons.map(coupon => {
    // 오늘 만료되는지 확인
    const expiryDate = new Date(coupon.expiryDate);
    expiryDate.setHours(0, 0, 0, 0);
    
    const isExpired = expiryDate < today;
    const isToday = expiryDate.getTime() === today.getTime();
    
    // 이벤트 클래스 설정
    let classNames = ['coupon-item'];
    if (isExpired) classNames.push('coupon-expired');
    if (isToday) classNames.push('coupon-today');
    
    return {
      id: coupon.id,
      title: `${coupon.title} ${coupon.storeName ? `(${coupon.storeName})` : ''}`,
      start: coupon.expiryDate,
      allDay: true,
      backgroundColor: coupon.color,
      borderColor: coupon.color,
      classNames: classNames,
      extendedProps: {
        description: coupon.description,
        storeName: coupon.storeName,
        isExpired: isExpired,
        isToday: isToday
      }
    };
  });
  
  // 날짜 배경색을 이벤트로 변환
  const colorEvents = dateColors.map(dc => ({
    start: formatDate(dc.date),
    end: formatDate(dc.date),
    display: 'background',
    color: dc.color,
    classNames: ['date-color-coupon'],
    extendedProps: {
      isDateColor: true,
      note: dc.note
    }
  }));
  
  // 모바일 여부 확인
  const isMobile = window.innerWidth < 768;
  
  // FullCalendar 초기화
  window.couponCalendar = new FullCalendar.Calendar(calendarEl, {
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: isMobile ? 'dayGridMonth,listMonth' : 'dayGridMonth'
    },
    initialView: 'dayGridMonth',
    height: isMobile ? 'auto' : undefined, // 모바일에서 높이 자동 조정
    locale: 'ko',
    events: [...events, ...colorEvents],
    eventTimeFormat: { // 시간 표시 형식 간소화
      hour: '2-digit',
      minute: '2-digit',
      meridiem: false
    },
    
    // 이벤트 렌더링 커스터마이징
    eventDidMount: function(info) {
      // 모바일에서 이벤트 표시 최적화
      if (isMobile && info.view.type === 'dayGridMonth') {
        const eventEl = info.el;
        eventEl.style.fontSize = '0.8rem';
        eventEl.style.padding = '2px 4px';
      }
      
      // 툴팁 추가
      if (!info.event.extendedProps.isDateColor) {
        const title = info.event.title;
        const description = info.event.extendedProps.description || '';
        const expiryDate = info.event.start;
        const isExpired = info.event.extendedProps.isExpired;
        const isToday = info.event.extendedProps.isToday;
        
        let status = '';
        if (isExpired) status = '(만료됨)';
        else if (isToday) status = '(오늘 만료)';
        
        $(info.el).tooltip({
          title: `${title} ${status}<br>${formatDate(expiryDate)}<br>${description}`,
          html: true,
          placement: 'top',
          container: 'body'
        });
      }
    },
    
    // 이벤트 클릭 시 편집 폼 표시
    eventClick: function(info) {
      if (info.event.extendedProps.isDateColor) {
        showDateColorForm(info.event.start);
      } else {
        showCouponDetail(info.event.id);
      }
    },
    
    // 날짜 선택 시 컨텍스트 메뉴 표시
    dateClick: function(info) {
      showCouponContextMenu(info.dateStr, info.jsEvent);
    }
  });
  
  // 명시적으로 렌더링 호출
  window.couponCalendar.render();
  console.log("쿠폰 캘린더가 성공적으로 렌더링되었습니다.");
  
  // 창 크기 변경 시 달력 반응형 업데이트
  window.addEventListener('resize', function() {
    const newIsMobile = window.innerWidth < 768;
    if (newIsMobile !== isMobile) {
      loadCoupons(); // 달력 새로고침
    }
  });
}

// 쿠폰 컨텍스트 메뉴 표시
function showCouponContextMenu(dateStr, event) {
  // 기존 컨텍스트 메뉴 제거
  const existingMenu = document.querySelector('.coupon-context-menu');
  if (existingMenu) {
    document.body.removeChild(existingMenu);
  }
  
  // 컨텍스트 메뉴 생성
  const menu = document.createElement('div');
  menu.className = 'coupon-context-menu';
  menu.style.left = `${event.pageX}px`;
  menu.style.top = `${event.pageY}px`;
  
  // 메뉴 항목 추가
  const addCouponItem = document.createElement('div');
  addCouponItem.className = 'coupon-context-menu-item';
  addCouponItem.textContent = '쿠폰 추가';
  addCouponItem.onclick = () => {
    document.body.removeChild(menu);
    showAddCouponForm(dateStr);
  };
  menu.appendChild(addCouponItem);
  
  const setColorItem = document.createElement('div');
  setColorItem.className = 'coupon-context-menu-item';
  setColorItem.textContent = '날짜 배경색 설정';
  setColorItem.onclick = () => {
    document.body.removeChild(menu);
    showDateColorForm(new Date(dateStr));
  };
  menu.appendChild(setColorItem);
  
  // 해당 날짜에 배경색이 있는지 확인
  loadCouponDateColors().then(dateColors => {
    const hasColorBackground = dateColors.some(dc => 
      formatDate(dc.date) === dateStr);
    
    if (hasColorBackground) {
      const removeColorItem = document.createElement('div');
      removeColorItem.className = 'coupon-context-menu-item';
      removeColorItem.textContent = '배경색 삭제';
      removeColorItem.onclick = () => {
        document.body.removeChild(menu);
        deleteDateColor(new Date(dateStr));
      };
      menu.appendChild(removeColorItem);
    }
    
    // 메뉴를 body에 추가
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
  });
}

// 쿠폰 추가 폼 표시
function showAddCouponForm(dateStr = null) {
  // 날짜 기본값 설정 (만료일)
  let formattedDate = '';
  if (dateStr) {
    formattedDate = dateStr;
  } else {
    // 기본값은 오늘부터 30일 후
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 30);
    formattedDate = formatDate(defaultDate);
  }
  
  const modalContent = `
    <form id="coupon-form">
      <div class="form-group">
        <label for="coupon-title">쿠폰명</label>
        <input type="text" id="coupon-title" placeholder="쿠폰 이름 또는 할인 내용" required>
      </div>
      <div class="form-group">
        <label for="coupon-store">상점명 (선택사항)</label>
        <input type="text" id="coupon-store" placeholder="상점 이름">
      </div>
      <div class="form-group">
        <label for="coupon-expiry-date">만료일</label>
        <input type="date" id="coupon-expiry-date" value="${formattedDate}" required>
      </div>
      <div class="form-group">
        <label for="coupon-color">색상</label>
        <input type="color" id="coupon-color" value="#f8bbd0">
      </div>
      <div class="form-group">
        <label for="coupon-description">설명 (선택사항)</label>
        <textarea id="coupon-description" rows="3" placeholder="추가 정보를 입력하세요..."></textarea>
      </div>
    </form>
  `;
  
  showModal("쿠폰 추가", modalContent, saveCoupon);
}

// 쿠폰 저장
async function saveCoupon() {
  const titleEl = document.getElementById('coupon-title');
  const storeEl = document.getElementById('coupon-store');
  const expiryDateEl = document.getElementById('coupon-expiry-date');
  const colorEl = document.getElementById('coupon-color');
  const descriptionEl = document.getElementById('coupon-description');
  
  if (!titleEl.value || !expiryDateEl.value) {
    alert('쿠폰명과 만료일은 필수 입력 항목입니다.');
    return;
  }
  
  try {
    // 쿠폰 데이터 구성
    const couponData = {
      title: titleEl.value,
      expiryDate: firebase.firestore.Timestamp.fromDate(new Date(expiryDateEl.value)),
      color: colorEl.value,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    // 선택적 필드 추가
    if (storeEl.value.trim()) {
      couponData.storeName = storeEl.value.trim();
    }
    
    if (descriptionEl.value.trim()) {
      couponData.description = descriptionEl.value.trim();
    }
    
    // Firestore에 저장
    await db.collection("coupons").add(couponData);
    
    // 모달 닫기
    closeModal();
    
    // 쿠폰 목록 새로고침
    loadCoupons();
  } catch (error) {
    console.error("쿠폰 저장 중 오류 발생:", error);
    alert('쿠폰을 저장하는 중 오류가 발생했습니다.');
  }
}

// 쿠폰 상세 정보 표시
async function showCouponDetail(couponId) {
  try {
    const couponDoc = await db.collection("coupons").doc(couponId).get();
    
    if (!couponDoc.exists) {
      alert('쿠폰 정보를 찾을 수 없습니다.');
      return;
    }
    
    const coupon = couponDoc.data();
    
    // 오늘 날짜와 비교하여 만료 여부 확인
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const expiryDate = coupon.expiryDate.toDate();
    const formattedExpiryDate = formatDate(expiryDate);
    
    const isExpired = expiryDate < today;
    const isToday = expiryDate.getTime() === today.getTime();
    
    let statusText = '';
    let statusClass = '';
    if (isExpired) {
      statusText = '만료됨';
      statusClass = 'coupon-expired';
    } else if (isToday) {
      statusText = '오늘 만료';
      statusClass = 'coupon-today';
    }
    
    const modalContent = `
      <div class="coupon-detail" style="border-left: 5px solid ${coupon.color}; padding-left: 10px;">
        <div class="coupon-detail-header">
          <h3>${coupon.title}</h3>
          ${coupon.storeName ? `<div class="coupon-store">${coupon.storeName}</div>` : ''}
        </div>
        
        <div class="coupon-detail-body">
          <div class="coupon-expiry">
            <strong>만료일:</strong> ${formattedExpiryDate}
            ${statusText ? `<span class="coupon-status ${statusClass}">${statusText}</span>` : ''}
          </div>
          
          ${coupon.description ? `
          <div class="coupon-description">
            <strong>설명:</strong>
            <p>${coupon.description}</p>
          </div>
          ` : ''}
        </div>
      </div>
    `;
    
    // 모달 표시 - 수정/삭제 버튼 포함
    const modalContainer = document.getElementById("modal-container");
    
    modalContainer.innerHTML = `
      <div class="modal-overlay" onclick="if(event.target === this) closeModal()">
        <div class="modal">
          <div class="modal-header">
            <h2 class="modal-title">쿠폰 상세 정보</h2>
            <button class="modal-close" onclick="closeModal()">×</button>
          </div>
          <div class="modal-content">
            ${modalContent}
          </div>
          <div class="modal-actions">
            <button onclick="closeModal()">닫기</button>
            <button onclick="editCoupon('${couponId}')">수정</button>
            <button onclick="deleteCoupon('${couponId}')" style="background-color: #f44336;">삭제</button>
          </div>
        </div>
      </div>
    `;
    
    isModalOpen = true;
    
    // 모달 스타일 추가
    const styleEl = document.createElement('style');
    styleEl.id = 'coupon-detail-styles';
    styleEl.textContent = `
      .coupon-detail {
        padding: 10px;
      }
      
      .coupon-detail-header {
        margin-bottom: 15px;
      }
      
      .coupon-store {
        color: #666;
        font-size: 0.9rem;
        margin-top: 5px;
      }
      
      .coupon-expiry {
        margin-bottom: 10px;
      }
      
      .coupon-status {
        display: inline-block;
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 0.8rem;
        margin-left: 8px;
      }
      
      .coupon-expired {
        background-color: #eeeeee;
        color: #9e9e9e;
      }
      
      .coupon-today {
        background-color: #ffecb3;
        color: #ff6f00;
      }
      
      .coupon-description {
        margin-top: 15px;
      }
      
      .coupon-description p {
        margin-top: 5px;
        white-space: pre-line;
      }
    `;
    
    // 이미 존재하는 스타일이 있으면 제거
    const existingStyle = document.getElementById('coupon-detail-styles');
    if (existingStyle) {
      existingStyle.remove();
    }
    
    document.head.appendChild(styleEl);
  } catch (error) {
    console.error("쿠폰 상세 정보 로드 중 오류 발생:", error);
    alert('쿠폰 상세 정보를 불러오는 중 오류가 발생했습니다.');
  }
}

// 쿠폰 편집 폼 표시
async function editCoupon(couponId) {
  try {
    const couponDoc = await db.collection("coupons").doc(couponId).get();
    
    if (!couponDoc.exists) {
      alert('쿠폰 정보를 찾을 수 없습니다.');
      return;
    }
    
    const coupon = couponDoc.data();
    
    const modalContent = `
      <form id="coupon-form">
        <input type="hidden" id="coupon-id" value="${couponId}">
        <div class="form-group">
          <label for="coupon-title">쿠폰명</label>
          <input type="text" id="coupon-title" value="${coupon.title}" required>
        </div>
        <div class="form-group">
          <label for="coupon-store">상점명 (선택사항)</label>
          <input type="text" id="coupon-store" value="${coupon.storeName || ''}">
        </div>
        <div class="form-group">
          <label for="coupon-expiry-date">만료일</label>
          <input type="date" id="coupon-expiry-date" value="${formatDate(coupon.expiryDate)}" required>
        </div>
        <div class="form-group">
          <label for="coupon-color">색상</label>
          <input type="color" id="coupon-color" value="${coupon.color || '#f8bbd0'}">
        </div>
        <div class="form-group">
          <label for="coupon-description">설명 (선택사항)</label>
          <textarea id="coupon-description" rows="3">${coupon.description || ''}</textarea>
        </div>
      </form>
    `;
    
    showModal("쿠폰 수정", modalContent, updateCoupon);
  } catch (error) {
    console.error("쿠폰 정보 로드 중 오류 발생:", error);
    alert('쿠폰 정보를 불러오는 중 오류가 발생했습니다.');
  }
}

// 쿠폰 업데이트
async function updateCoupon() {
  const couponId = document.getElementById('coupon-id').value;
  const titleEl = document.getElementById('coupon-title');
  const storeEl = document.getElementById('coupon-store');
  const expiryDateEl = document.getElementById('coupon-expiry-date');
  const colorEl = document.getElementById('coupon-color');
  const descriptionEl = document.getElementById('coupon-description');
  
  if (!titleEl.value || !expiryDateEl.value) {
    alert('쿠폰명과 만료일은 필수 입력 항목입니다.');
    return;
  }
  
  try {
    // 쿠폰 데이터 구성
    const couponData = {
      title: titleEl.value,
      expiryDate: firebase.firestore.Timestamp.fromDate(new Date(expiryDateEl.value)),
      color: colorEl.value,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    // 선택적 필드 추가 또는 삭제
    if (storeEl.value.trim()) {
      couponData.storeName = storeEl.value.trim();
    } else {
      couponData.storeName = firebase.firestore.FieldValue.delete();
    }
    
    if (descriptionEl.value.trim()) {
      couponData.description = descriptionEl.value.trim();
    } else {
      couponData.description = firebase.firestore.FieldValue.delete();
    }
    
    // Firestore에 업데이트
    await db.collection("coupons").doc(couponId).update(couponData);
    
    // 모달 닫기
    closeModal();
    
    // 쿠폰 목록 새로고침
    loadCoupons();
  } catch (error) {
    console.error("쿠폰 업데이트 중 오류 발생:", error);
    alert('쿠폰을 업데이트하는 중 오류가 발생했습니다.');
  }
}

// 쿠폰 삭제
async function deleteCoupon(couponId) {
  if (confirm('정말로 이 쿠폰을 삭제하시겠습니까?')) {
    try {
      await db.collection("coupons").doc(couponId).delete();
      
      // 모달이 열려 있으면 닫기
      if (isModalOpen) {
        closeModal();
      }
      
      // 쿠폰 목록 새로고침
      loadCoupons();
    } catch (error) {
      console.error("쿠폰 삭제 중 오류 발생:", error);
      alert('쿠폰을 삭제하는 중 오류가 발생했습니다.');
    }
  }
}

// 날짜 배경색 설정 폼
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
        <input type="text" id="color-note" placeholder="이 날짜 메모 (예: 할인 이벤트)">
      </div>
    </form>
  `;
  
  showModal(`${formattedDate} 배경색 설정`, modalContent, function() {
    saveDateColor(date, document.getElementById('background-color').value, document.getElementById('color-note').value);
  });
}

// 날짜 배경색 저장
async function saveDateColor(date, color, note = '') {
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
    const dateColorRef = db.collection("couponDateColors");
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
    loadCoupons();
    
  } catch (error) {
    console.error("날짜 배경색 저장 중 오류 발생:", error);
    alert('날짜 배경색을 저장하는 중 오류가 발생했습니다.');
  }
}

// 날짜 배경색 삭제
async function deleteDateColor(date) {
  if (confirm('이 날짜의 배경색 설정을 삭제하시겠습니까?')) {
    try {
      const formattedDate = formatDate(date);
      const dateTs = firebase.firestore.Timestamp.fromDate(new Date(formattedDate));
      
      // 기존 설정 확인
      const dateColorRef = db.collection("couponDateColors");
      const snapshot = await dateColorRef.where("date", "==", dateTs).get();
      
      if (!snapshot.empty) {
        // 삭제
        await dateColorRef.doc(snapshot.docs[0].id).delete();
      }
      
      // 달력 새로고침
      loadCoupons();
      
    } catch (error) {
      console.error("날짜 배경색 삭제 중 오류 발생:", error);
      alert('날짜 배경색을 삭제하는 중 오류가 발생했습니다.');
    }
  }
}

// 검색 로직에도 쿠폰 추가
async function performSearch() {
  // 기존 검색 함수 내부의 다른 콜렉션 검색 코드들...

  // 쿠폰 검색
  const couponsSnapshot = await db.collection("coupons").get();
  couponsSnapshot.forEach(doc => {
    const coupon = doc.data();
    if (coupon.title.toLowerCase().includes(searchInput) || 
        (coupon.storeName && coupon.storeName.toLowerCase().includes(searchInput)) ||
        (coupon.description && coupon.description.toLowerCase().includes(searchInput))) {
      results.push({
        type: "쿠폰",
        id: doc.id,
        title: `${coupon.title} ${coupon.storeName ? `(${coupon.storeName})` : ''}`,
        date: formatDate(coupon.expiryDate),
        page: "coupons"
      });
    }
  });

  // 기존 검색 함수의 나머지 부분...
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

// 나머지 함수들... (생략)

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
                <label><input type="checkbox" name="search-type" value="coupons" checked> 쿠폰</label>
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
}

// 쿠폰 관련 오류 처리 함수
function handleCouponError(error, message) {
  console.error(message, error);
  
  // 오류 발생 시 사용자에게 알림
  const errorContainer = document.querySelector(".calendar-container");
  if (errorContainer) {
    errorContainer.innerHTML = `
      <div class="error-message" style="padding: 20px; text-align: center; color: #f44336;">
        <p>${message}</p>
        <p>오류 상세: ${error.message}</p>
        <button onclick="loadCoupons()">다시 시도</button>
      </div>
    `;
  }
}

// 초기화 함수 호출
checkAuth();

// 브라우저 콘솔에 로드 완료 메시지 출력
console.log("앱 초기화가 완료되었습니다.");
