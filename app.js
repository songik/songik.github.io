// 앱 상태
let isAuthenticated = false;
let currentPage = "home";
let currentView = "list"; // 'list' 또는 'calendar'
const app = document.getElementById("app");
let editors = {}; // 텍스트 에디터 객체 보관용

// 습관 관련 전역 변수 추가
let habitMode = "selection"; // 'selection' 또는 'completion' 모드
let selectedDates = []; // 선택된 날짜들 저장
let completedDates = {}; // 완료된 날짜들을 저장 (habitId를 키로 사용)

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
  // 인증 상태 초기화 (테스트를 위해 잠시 추가)
  localStorage.removeItem("isAuthenticated");
  
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
          <a href="#" onclick="navigateTo('home')">흔들갈대</a>
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
  localStorage.removeItem("isAuthenticated");
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

// =========== 홈 페이지 렌더링 ===========

// 홈 페이지 렌더링
function renderHomePage(container) {
// app.js 파일의 renderHomePage 함수 내부
container.innerHTML = `
  <div class="home-container">
    <div class="home-content">
      <div class="logo-container">
        <h1 class="home-logo">흔들갈대</h1>
      </div>
      
      <!-- 비디오 파일 직접 삽입 -->
      <div class="character-container">
        <video class="character-video" controls autoplay loop muted>
          <source src="videos/character.mp4" type="video/mp4">
          <p>브라우저가 비디오 태그를 지원하지 않습니다.</p>
        </video>
      </div>
      
      <div class="quote-container">
        <h2 class="quote-text">
          헛되이 보낸 오늘은, 죽은이가 그토록 바라던 내일이었다.
        </h2>
      </div>
      
      <div class="home-buttons">
        <a href="#" class="home-button" onclick="navigateTo('calendar')">
          일정 보기
        </a>
        <a href="#" class="home-button" onclick="navigateTo('todo')">
          할 일 확인
        </a>
        <a href="#" class="home-button" onclick="navigateTo('diary')">
          일기 쓰기
        </a>
      </div>
    </div>
  </div>
`;
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
      events.push({
        id: doc.id,
        title: event.title,
        start: event.start.toDate(),
        end: event.end ? event.end.toDate() : null,
        description: event.description || '',
        allDay: event.allDay || false
      });
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

// 일정 달력 렌더링
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
  
  try {
    // FullCalendar 초기화
    window.eventCalendar = new FullCalendar.Calendar(calendarEl, {
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek,timeGridDay'
      },
      initialView: 'dayGridMonth',
      locale: 'ko',
      events: events || [],
      editable: true,
      selectable: true,
      selectMirror: true,
      dayMaxEvents: true,
      // 날짜 선택 시 이벤트 추가 폼 표시
      select: function(info) {
        showAddEventForm(info.startStr, info.endStr, info.allDay);
      },
      // 이벤트 클릭 시 편집 폼 표시
      eventClick: function(info) {
        editEvent(info.event.id);
      },
      // 이벤트 드래그 앤 드롭으로 변경
      eventDrop: function(info) {
        updateEventDates(info.event.id, info.event.start, info.event.end, info.event.allDay);
      },
      // 이벤트 리사이징으로 기간 변경
      eventResize: function(info) {
        updateEventDates(info.event.id, info.event.start, info.event.end, info.event.allDay);
      }
    });
    
    // 명시적으로 렌더링 호출
    window.eventCalendar.render();
    console.log("캘린더가 성공적으로 렌더링되었습니다.");
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
    endDate = new Date(startDate);
    endDate.setHours(startDate.getHours() + 1);
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
          <input type="checkbox" id="event-all-day" ${allDay ? 'checked' : ''}>
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
  
  const description = getEditorContent('event-description-editor');
  
  try {
    // 일정 데이터 구성
    const eventData = {
      title: titleEl.value,
      start: firebase.firestore.Timestamp.fromDate(new Date(startEl.value)),
      allDay: allDayEl.checked
    };
    
    // 선택적 필드 추가
    if (endEl.value) {
      eventData.end = firebase.firestore.Timestamp.fromDate(new Date(endEl.value));
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
            <input type="checkbox" id="event-all-day" ${event.allDay ? 'checked' : ''}>
            종일
          </label>
        </div>
        <div class="form-group">
          <label for="event-description">설명</label>
          <div id="event-description-editor"></div>
        </div>
      </form>
    `;
    
    showModal("일정 수정", modalContent, updateEvent);
    
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
  
  const description = getEditorContent('event-description-editor');
  
  try {
    // 일정 데이터 구성
    const eventData = {
      title: titleEl.value,
      start: firebase.firestore.Timestamp.fromDate(new Date(startEl.value)),
      allDay: allDayEl.checked,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    // 선택적 필드 추가
    if (endEl.value) {
      eventData.end = firebase.firestore.Timestamp.fromDate(new Date(endEl.value));
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
    const eventData = {
      start: firebase.firestore.Timestamp.fromDate(start),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      allDay: allDay
    };
    
    if (end) {
      eventData.end = firebase.firestore.Timestamp.fromDate(end);
    }
    
    await db.collection("events").doc(eventId).update(eventData);
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
      // 체크박스가 아닌 부분을 클릭했을 때만 편집 화면 표시
      if (!info.jsEvent.target.matches('input[type="checkbox"]')) {
        editTodo(info.event.id);
      }
    },
    dateClick: function(info) {
      showAddTodoForm(info.dateStr);
    }
  });
  
  calendar.render();
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
        <input type="text" id="todo-title" required>
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
  
  // 목표 데이터 불러오기
  loadGoals();
}

// 목표 데이터 불러오기
async function loadGoals() {
  try {
    const goalsRef = db.collection("goals");
    const snapshot = await goalsRef.orderBy("createdAt", "desc").get();
    
    const goalsContainerEl = document.getElementById("goals-container");
    
    if (snapshot.empty) {
      goalsContainerEl.innerHTML = '<p>등록된 목표가 없습니다.</p>';
      return;
    }
    
    let html = '';
    
    for (const doc of snapshot.docs) {
      const goal = doc.data();
      const goalId = doc.id;
      
      // 목표에 속한 세부 항목 불러오기
      const tasksSnapshot = await db.collection("goals").doc(goalId).collection("tasks").get();
      const tasks = [];
      let completedTasks = 0;
      
      tasksSnapshot.forEach(taskDoc => {
        const task = taskDoc.data();
        tasks.push({
          id: taskDoc.id,
          title: task.title,
          completed: task.completed || false
        });
        
        if (task.completed) {
          completedTasks++;
        }
      });
      
      const progress = tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0;
      
      html += `
        <div class="progress-goal" data-id="${goalId}">
          <div class="progress-goal-title">
            <h2>${goal.title}</h2>
            <div class="list-item-actions">
              <button onclick="showAddTaskForm('${goalId}')">항목 추가</button>
              <button onclick="editGoal('${goalId}')">수정</button>
              <button onclick="deleteGoal('${goalId}')">삭제</button>
            </div>
          </div>
          <div class="progress-container">
            <div class="progress-bar" style="width: ${progress}%;"></div>
          </div>
          <div class="progress-percentage">${progress}% 완료</div>
          
          <div class="progress-goal-tasks">
            ${tasks.length > 0 ? 
              `<ul class="list-container">
                ${tasks.map(task => `
                  <li class="progress-task" data-id="${task.id}">
                    <div class="progress-task-checkbox">
                      <input 
                        type="checkbox" 
                        ${task.completed ? 'checked' : ''} 
                        onchange="toggleTaskComplete('${goalId}', '${task.id}', ${!task.completed})"
                      />
                    </div>
                    <div class="list-item-content ${task.completed ? 'completed' : ''}">
                      <div>${task.title}</div>
                    </div>
                    <div class="list-item-actions">
                      <button onclick="editTask('${goalId}', '${task.id}')">수정</button>
                      <button onclick="deleteTask('${goalId}', '${task.id}')">삭제</button>
                    </div>
                  </li>
                `).join('')}
              </ul>` 
              : '<p>등록된 세부 항목이 없습니다.</p>'
            }
          </div>
        </div>
      `;
    }
    
    goalsContainerEl.innerHTML = html;
  } catch (error) {
    console.error("목표를 불러오는 중 오류 발생:", error);
    document.getElementById("goals-container").innerHTML = '<p>목표를 불러오는 중 오류가 발생했습니다.</p>';
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

// 목표 저장
async function saveGoal() {
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
          <label for="goal

-description">설명 (선택사항)</label>
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

// 세부 항목 완료 상태 토글
async function toggleTaskComplete(goalId, taskId, completed) {
  try {
    await db.collection("goals").doc(goalId).collection("tasks").doc(taskId).update({ 
      completed,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp() 
    });
    loadGoals(); // 목록 새로고침
  } catch (error) {
    console.error("세부 항목 상태 변경 중 오류 발생:", error);
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

// =========== 체중 관리 기능 ===========

// 체중 관리 페이지 렌더링
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
        <div class="chart-container">
          <canvas id="weight-chart"></canvas>
        </div>
      </div>
      
      <div id="calendar-view-container" class="calendar-container" style="display: ${currentView === 'calendar' ? 'block' : 'none'}">
        <div id="weight-calendar"></div>
      </div>
      
      <div id="list-view-container" style="display: ${currentView === 'list' ? 'block' : 'none'}">
        <div class="card">
          <h2 class="card-title">체중 기록</h2>
          <div id="weights-list">
            <p>체중 기록을 불러오는 중...</p>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // 체중 데이터 불러오기
  loadWeights();
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
  
  if (!chartEl || weights.length === 0) return;
  
  // 차트용 데이터 가공
  weights.sort((a, b) => a.date - b.date);
  
  const chartData = {
    labels: weights.map(w => formatDate(w.date)),
    datasets: [{
      label: '체중 (kg)',
      data: weights.map(w => w.weight),
      borderColor: '#4caf50',
      backgroundColor: 'rgba(76, 175, 80, 0.1)',
      borderWidth: 2,
      fill: true,
      tension: 0.2
    }]
  };
  
  // 차트 옵션
  const chartOptions = {
    scales: {
      y: {
        beginAtZero: false,
        min: Math.min(...weights.map(w => w.weight)) - 2,
        max: Math.max(...weights.map(w => w.weight)) + 2
      }
    },
    responsive: true,
    maintainAspectRatio: false
  };
  
  // 이전 차트 제거
  if (window.weightChart) {
    window.weightChart.destroy();
  }
  
// 새 차트 생성 - 오류 처리 추가
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

// =========== 지출 관리 기능 ===========

// 지출 관리 페이지 렌더링
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
        <div class="chart-container">
          <canvas id="expense-chart"></canvas>
        </div>
      </div>
      
      <div id="calendar-view-container" class="calendar-container" style="display: ${currentView === 'calendar' ? 'block' : 'none'}">
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

// 지출 리스트 렌더링
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
          <div class="list-item-title">
            <span style="color: ${isExpense ? 'var(--error-color)' : 'var(--success-color)'}">
              ${isExpense ? '-' : '+'} ${transaction.amount.toLocaleString()}원
            </span>
            <span>${transaction.category}${transaction.subCategory ? ` > ${transaction.subCategory}` : ''}</span>
          </div>
          <div class="list-item-date">${formatDate(transaction.date)}</div>
          <div class="list-item-description">
            결제방법: ${transaction.paymentMethod || '기타'}
            ${transaction.description ? `<br>${transaction.description}` : ''}
          </div>
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
  
  if (!chartEl || transactions.length === 0) return;
  
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
  
  const chartData = {
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
  
  // 차트 옵션
  const chartOptions = {
    scales: {
      y: {
        beginAtZero: true
      }
    },
    responsive: true,
    maintainAspectRatio: false
  };
  
  // 이전 차트 제거
  if (window.expenseChart) {
    window.expenseChart.destroy();
  }
  
  // 새 차트 생성
  window.expenseChart = new Chart(chartEl, {
    type: 'bar',
    data: chartData,
    options: chartOptions
  });
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

// 지출 편집 폼 표시
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
    
    showModal("지출/수입 내역 수정", modalContent, updateTransaction);
    
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

  // =========== 습관 관리 기능 ===========

// 습관 페이지 렌더링
function renderHabitsPage(container) {
  container.innerHTML = `
    <div class="page-container">
      <div class="page-header">
        <h1>습관 관리</h1>
        <div class="page-actions">
          <div class="habit-mode-toggle">
            <button id="selection-mode-button" class="${habitMode === 'selection' ? 'active' : ''}" onclick="toggleHabitMode('selection')">
              <i class="fas fa-calendar-check"></i> 날짜 선택 모드
            </button>
            <button id="completion-mode-button" class="${habitMode === 'completion' ? 'active' : ''}" onclick="toggleHabitMode('completion')">
              <i class="fas fa-check-circle"></i> 완료 체크 모드
            </button>
          </div>
          <button onclick="showAddHabitForm()">습관 추가</button>
        </div>
      </div>
      
      <div class="card">
        <h2 class="card-title">습관 달력</h2>
        <div class="habit-calendar-container">
          <div id="habit-calendar"></div>
        </div>
      </div>
      
      <div class="card">
        <h2 class="card-title">습관 목록</h2>
        <div id="habits-list">
          <p>습관을 불러오는 중...</p>
        </div>
      </div>
    </div>
  `;
  
  // 습관 데이터 불러오기
  loadHabits();
}

// 습관 모드 전환
function toggleHabitMode(mode) {
  if (habitMode !== mode) {
    habitMode = mode;
    
    // 모드 토글 버튼 업데이트
    const selectionModeButton = document.getElementById("selection-mode-button");
    const completionModeButton = document.getElementById("completion-mode-button");
    
    if (selectionModeButton && completionModeButton) {
      if (mode === "selection") {
        selectionModeButton.classList.add("active");
        completionModeButton.classList.remove("active");
      } else {
        selectionModeButton.classList.remove("active");
        completionModeButton.classList.add("active");
      }
    }
    
    // 선택된 날짜 초기화
    selectedDates = [];
    
    // 캘린더 새로고침
    renderHabitCalendar();
  }
}

// 습관 데이터 불러오기
async function loadHabits() {
  try {
    const habitsRef = db.collection("habits");
    const snapshot = await habitsRef.orderBy("createdAt", "desc").get();
    
    const habits = [];
    completedDates = {}; // 완료된 날짜 초기화
    
    // 습관 데이터와 완료된 날짜 불러오기
    for (const doc of snapshot.docs) {
      const habit = doc.data();
      const habitId = doc.id;
      
      habits.push({
        id: habitId,
        title: habit.title,
        description: habit.description || '',
        createdAt: habit.createdAt ? habit.createdAt.toDate() : new Date()
      });
      
      // 완료된 날짜 불러오기
      const completionsSnapshot = await habitsRef.doc(habitId).collection("completions").get();
      
      completedDates[habitId] = [];
      
      completionsSnapshot.forEach(completionDoc => {
        const completion = completionDoc.data();
        if (completion.date) {
          // Firestore Timestamp를 문자열로 변환하여 저장
          const dateStr = formatDate(completion.date.toDate());
          completedDates[habitId].push({
            dateStr: dateStr,
            id: completionDoc.id
          });
        }
      });
    }
    
    // 습관 목록 렌더링
    renderHabitsList(habits);
    
    // 습관 캘린더 렌더링
    renderHabitCalendar(habits);
  } catch (error) {
    console.error("습관을 불러오는 중 오류 발생:", error);
    document.getElementById("habits-list").innerHTML = '<p>습관을 불러오는 중 오류가 발생했습니다.</p>';
  }
}

// 습관 목록 렌더링
function renderHabitsList(habits) {
  const habitsListEl = document.getElementById("habits-list");
  
  if (habits.length === 0) {
    habitsListEl.innerHTML = '<p>등록된 습관이 없습니다.</p>';
    return;
  }
  
  let html = '<ul class="list-container">';
  
  habits.forEach(habit => {
    // 완료된 날짜 개수 계산
    const completedCount = completedDates[habit.id] ? completedDates[habit.id].length : 0;
    
    html += `
      <li class="list-item" data-id="${habit.id}">
        <div class="list-item-content">
          <div class="list-item-title">${habit.title}</div>
          ${habit.description ? `<div class="list-item-description">${habit.description}</div>` : ''}
          <div class="habit-stats">완료한 날짜: ${completedCount}일</div>
        </div>
        <div class="list-item-actions">
          <button onclick="viewHabitDetails('${habit.id}')">상세</button>
          <button onclick="editHabit('${habit.id}')">수정</button>
          <button onclick="deleteHabit('${habit.id}')">삭제</button>
        </div>
      </li>
    `;
  });
  
  html += '</ul>';
  habitsListEl.innerHTML = html;
}

// 습관 캘린더 렌더링
function renderHabitCalendar(habits) {
  const calendarEl = document.getElementById('habit-calendar');
  
  if (!calendarEl) return;
  
  // 이전 인스턴스 제거 (있을 경우)
  if (window.habitCalendar) {
    try {
      window.habitCalendar.destroy();
    } catch (err) {
      console.error("캘린더 제거 중 오류:", err);
    }
  }
  
  try {
    // 캘린더에 표시할 이벤트 준비
    const events = [];
    
    // 선택 모드일 때 선택된 날짜 표시
    if (habitMode === 'selection') {
      selectedDates.forEach(dateStr => {
        events.push({
          title: '선택됨',
          start: dateStr,
          allDay: true,
          color: '#4285F4',
          classNames: ['selected-date']
        });
      });
    } 
    // 완료 모드일 때 모든 습관의 완료된 날짜 표시
    else if (habits && habits.length > 0) {
      habits.forEach(habit => {
        const habitCompletions = completedDates[habit.id] || [];
        
        habitCompletions.forEach(completion => {
          events.push({
            id: `${habit.id}-${completion.dateStr}`,
            title: habit.title,
            start: completion.dateStr,
            allDay: true,
            color: '#4CAF50',
            habitId: habit.id,
            completionId: completion.id
          });
        });
      });
    }
    
    // 달력 옵션
    const calendarOptions = {
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth'
      },
      initialView: 'dayGridMonth',
      locale: 'ko',
      events: events,
      selectable: habitMode === 'selection', // 선택 모드일 때만 날짜 선택 가능
      unselectAuto: false, // 다른 곳 클릭해도 선택 해제 안 됨
      dateClick: function(info) {
        if (habitMode === 'selection') {
          toggleDateSelection(info.dateStr);
        }
      },
      eventClick: function(info) {
        if (habitMode === 'completion' && info.event.extendedProps.habitId) {
          toggleHabitCompletion(
            info.event.extendedProps.habitId, 
            info.event.start,
            info.event.extendedProps.completionId
          );
        }
      }
    };
    
    // 캘린더 초기화
    window.habitCalendar = new FullCalendar.Calendar(calendarEl, calendarOptions);
    window.habitCalendar.render();
    
    // 날짜 셀에 체크박스 추가 (완료 모드일 때)
    if (habitMode === 'completion' && habits && habits.length > 0) {
      setTimeout(() => {
        addCheckboxesToCalendar(habits);
      }, 100);
    }
  } catch (error) {
    console.error("습관 캘린더 초기화 중 오류 발생:", error);
    if (calendarEl) {
      calendarEl.innerHTML = '<p>캘린더를 로드하는 중 오류가 발생했습니다.</p>';
    }
  }
}

// 날짜 선택/해제 토글
function toggleDateSelection(dateStr) {
  const index = selectedDates.indexOf(dateStr);
  
  if (index === -1) {
    // 선택되지 않은 날짜면 추가
    selectedDates.push(dateStr);
  } else {
    // 이미 선택된 날짜면 제거
    selectedDates.splice(index, 1);
  }
  
  // 캘린더 업데이트
  renderHabitCalendar();
}

// 습관 완료 상태 토글
async function toggleHabitCompletion(habitId, date, completionId = null) {
  try {
    const dateStr = formatDate(date);
    const habitRef = db.collection("habits").doc(habitId);
    
    // 이미 완료된 날짜인지 확인
    if (completionId) {
      // 완료 취소하기
      await habitRef.collection("completions").doc(completionId).delete();
      
      // 로컬 상태 업데이트
      const habitCompletions = completedDates[habitId] || [];
      const index = habitCompletions.findIndex(c => c.id === completionId);
      
      if (index !== -1) {
        habitCompletions.splice(index, 1);
        completedDates[habitId] = habitCompletions;
      }
    } else {
      // 완료 추가하기
      const completionData = {
        date: firebase.firestore.Timestamp.fromDate(new Date(date)),
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      const docRef = await habitRef.collection("completions").add(completionData);
      
      // 로컬 상태 업데이트
      if (!completedDates[habitId]) {
        completedDates[habitId] = [];
      }
      
      completedDates[habitId].push({
        dateStr: dateStr,
        id: docRef.id
      });
    }
    
    // 캘린더 및 목록 새로고침
    loadHabits();
  } catch (error) {
    console.error("습관 완료 상태 변경 중 오류 발생:", error);
    alert('습관 완료 상태를 변경하는 중 오류가 발생했습니다.');
  }
}

// 캘린더 날짜 셀에 체크박스 추가
function addCheckboxesToCalendar(habits) {
  // 모든 날짜 셀에 대해
  document.querySelectorAll('.fc-daygrid-day').forEach(dayCell => {
    const date = dayCell.getAttribute('data-date');
    
    if (!date) return;
    
    // 셀에 체크박스를 담을 컨테이너 추가
    const checkboxContainer = document.createElement('div');
    checkboxContainer.className = 'habit-checkboxes';
    
    // 각 습관에 대한 체크박스 추가
    habits.forEach(habit => {
      // 해당 날짜에 완료된 습관인지 확인
      const habitCompletions = completedDates[habit.id] || [];
      const completion = habitCompletions.find(c => c.dateStr === date);
      
      // 체크박스 요소 생성
      const checkbox = document.createElement('div');
      checkbox.className = `habit-checkbox ${completion ? 'completed' : ''}`;
      checkbox.title = habit.title;
      checkbox.innerHTML = `<span class="habit-checkbox-title">${habit.title}</span>`;
      
      // 클릭 이벤트 추가
      checkbox.addEventListener('click', function(e) {
        e.stopPropagation(); // 날짜 셀 클릭 이벤트 방지
        
        if (completion) {
          toggleHabitCompletion(habit.id, date, completion.id);
        } else {
          toggleHabitCompletion(habit.id, date);
        }
      });
      
      checkboxContainer.appendChild(checkbox);
    });
    
    // 날짜 셀에 체크박스 컨테이너 추가
    const cellContent = dayCell.querySelector('.fc-daygrid-day-bottom');
    if (cellContent) {
      cellContent.appendChild(checkboxContainer);
    }
  });
}

// 습관 추가 폼 표시
function showAddHabitForm() {
  const modalContent = `
    <form id="habit-form">
      <div class="form-group">
        <label for="habit-title">습관 제목</label>
        <input type="text" id="habit-title" required>
      </div>
      <div class="form-group">
        <label for="habit-description">설명 (선택사항)</label>
        <textarea id="habit-description" rows="3" placeholder="습관에 대한 설명을 입력하세요..."></textarea>
      </div>
      <div class="form-group">
        <label>선택한 날짜 (${selectedDates.length}일)</label>
        <div class="selected-dates-container">
          ${selectedDates.length > 0 ? 
            `<ul class="selected-dates-list">
              ${selectedDates.map(date => `<li>${date}</li>`).join('')}
            </ul>` 
            : '<p>날짜를 선택하지 않았습니다. 캘린더에서 날짜를 선택해주세요.</p>'
          }
        </div>
      </div>
    </form>
  `;
  
  showModal("습관 추가", modalContent, saveHabit);
}

// 습관 저장
async function saveHabit() {
  const titleEl = document.getElementById('habit-title');
  const descriptionEl = document.getElementById('habit-description');
  
  if (!titleEl.value) {
    alert('습관 제목은 필수 입력 항목입니다.');
    return;
  }
  
  try {
    // 습관 데이터 구성
    const habitData = {
      title: titleEl.value,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    if (descriptionEl.value.trim()) {
      habitData.description = descriptionEl.value.trim();
    }
    
    // Firestore에 습관 저장
    const habitRef = await db.collection("habits").add(habitData);
    
    // 선택된 날짜가 있으면 완료 정보 저장
    if (selectedDates.length > 0) {
      const batch = db.batch();
      
      selectedDates.forEach(dateStr => {
        const completionRef = habitRef.collection("completions").doc();
        batch.set(completionRef, {
          date: firebase.firestore.Timestamp.fromDate(new Date(dateStr)),
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      });
      
      await batch.commit();
    }
    
    // 모달 닫기
    closeModal();
    
    // 선택된 날짜 초기화
    selectedDates = [];
    
    // 습관 목록 새로고침
    loadHabits();
  } catch (error) {
    console.error("습관 저장 중 오류 발생:", error);
    alert('습관을 저장하는 중 오류가 발생했습니다.');
  }
}

// 습관 상세 보기
async function viewHabitDetails(habitId) {
  try {
    const habitDoc = await db.collection("habits").doc(habitId).get();
    
    if (!habitDoc.exists) {
      alert('습관 정보를 찾을 수 없습니다.');
      return;
    }
    
    const habit = habitDoc.data();
    const habitCompletions = completedDates[habitId] || [];
    
    // 날짜를 YYYY-MM-DD 형식에서 사용자 친화적인 형식으로 변환
    const formattedDates = habitCompletions.map(completion => {
      const dateParts = completion.dateStr.split('-');
      return `${dateParts[0]}년 ${dateParts[1]}월 ${dateParts[2]}일`;
    });
    
    const modalContent = `
      <div class="habit-details">
        <h3>${habit.title}</h3>
        ${habit.description ? `<p>${habit.description}</p>` : ''}
        
        <div class="habit-completion-stats">
          <h4>완료한 날짜 (${habitCompletions.length}일)</h4>
          ${habitCompletions.length > 0 ? 
            `<ul class="completed-dates-list">
              ${formattedDates.map(date => `<li>${date}</li>`).join('')}
            </ul>` 
            : '<p>아직 완료한 날짜가 없습니다.</p>'
          }
        </div>
      </div>
    `;
    
    showModal(`습관 상세 정보`, modalContent);
  } catch (error) {
    console.error("습관 정보 로드 중 오류 발생:", error);
    alert('습관 정보를 불러오는 중 오류가 발생했습니다.');
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
    const habitCompletions = completedDates[habitId] || [];
    
    const modalContent = `
      <form id="habit-form">
        <input type="hidden" id="habit-id" value="${habitId}">
        <div class="form-group">
          <label for="habit-title">습관 제목</label>
          <input type="text" id="habit-title" value="${habit.title}" required>
        </div>
        <div class="form-group">
          <label for="habit-description">설명 (선택사항)</label>
          <textarea id="habit-description" rows="3" placeholder="습관에 대한 설명을 입력하세요...">${habit.description || ''}</textarea>
        </div>
        <div class="form-group">
          <label>완료한 날짜 (${habitCompletions.length}일)</label>
          <div class="completed-dates-container">
            ${habitCompletions.length > 0 ? 
              `<ul class="completed-dates-list">
                ${habitCompletions.map(completion => `
                  <li>
                    ${completion.dateStr}
                    <button type="button" onclick="removeCompletionDate('${habitId}', '${completion.id}')">삭제</button>
                  </li>
                `).join('')}
              </ul>` 
              : '<p>완료한 날짜가 없습니다.</p>'
            }
          </div>
        </div>
      </form>
    `;
    
    showModal("습관 수정", modalContent, updateHabit);
  } catch (error) {
    console.error("습관 정보 로드 중 오류 발생:", error);
    alert('습관 정보를 불러오는 중 오류가 발생했습니다.');
  }
}

// 완료 날짜 삭제
async function removeCompletionDate(habitId, completionId) {
  try {
    await db.collection("habits").doc(habitId).collection("completions").doc(completionId).delete();
    
    // 로컬 상태 업데이트
    const habitCompletions = completedDates[habitId] || [];
    const index = habitCompletions.findIndex(c => c.id === completionId);
    
    if (index !== -1) {
      habitCompletions.splice(index, 1);
      completedDates[habitId] = habitCompletions;
    }
    
    // 모달 내용 새로고침 (현재 모달을 닫고 다시 열기)
    closeModal();
    editHabit(habitId);
  } catch (error) {
    console.error("완료 날짜 삭제 중 오류 발생:", error);
    alert('완료 날짜를 삭제하는 중 오류가 발생했습니다.');
  }
}

// 습관 업데이트
async function updateHabit() {
  const habitId = document.getElementById('habit-id').value;
  const titleEl = document.getElementById('habit-title');
  const descriptionEl = document.getElementById('habit-description');
  
  if (!titleEl.value) {
    alert('습관 제목은 필수 입력 항목입니다.');
    return;
  }
  
  try {
    // 습관 데이터 구성
    const habitData = {
      title: titleEl.value,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    if (descriptionEl.value.trim()) {
      habitData.description = descriptionEl.value.trim();
    } else {
      habitData.description = firebase.firestore.FieldValue.delete();
    }
    
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
  if (confirm('정말로 이 습관을 삭제하시겠습니까? 모든 완료 정보도 함께 삭제됩니다.')) {
    try {
      // 먼저 모든 완료 정보 삭제
      const completionsSnapshot = await db.collection("habits").doc(habitId).collection("completions").get();
      const batch = db.batch();
      
      completionsSnapshot.forEach(doc => {
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
