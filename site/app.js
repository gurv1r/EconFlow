const STORAGE_KEY = "uplearn-econ-progress-v3";
const DAY_MS = 24 * 60 * 60 * 1000;
const FIREBASE_SDK_VERSION = "12.12.1";
const CLOUD_PROGRESS_DOC_ID = "default";
const PAPER_GUIDANCE = {
  "Paper 1": "Microeconomics focus: chains of reasoning, diagrams, and market failure evaluation.",
  "Paper 2": "Macroeconomics focus: AD/AS logic, policy trade-offs, and real-world performance data.",
  "Paper 3": "Synoptic focus: connect micro and macro ideas, compare options, and sustain evaluation.",
};
const SPEC_BLUEPRINT = {
  "14": {
    theme: "Theme 1: Introduction to Markets and Market Failure",
    papers: ["Paper 1", "Paper 3"],
    official: ["Nature of economics", "How markets work", "Market failure", "Government intervention"],
    revision: ["Nature of Economics", "How Markets Work", "Market Failure", "Government Intervention"],
  },
  "15": {
    theme: "Theme 2: The UK Economy - Performance and Policies",
    papers: ["Paper 2", "Paper 3"],
    official: ["Measures of economic performance", "Aggregate demand", "Aggregate supply", "National income", "Economic growth", "Macroeconomic objectives and policy"],
    revision: ["Measures of Economic Performance", "Aggregate Demand", "Aggregate Supply", "National Income", "Economic Growth", "Macroeconomic Objectives and Policies"],
  },
  "16": {
    theme: "Theme 3: Business Behaviour and the Labour Market",
    papers: ["Paper 1", "Paper 3"],
    official: ["Business growth", "Business objectives", "Revenues, costs and profits", "Market structures", "Labour market", "Government intervention"],
    revision: ["Business Growth", "Business Objectives", "Revenues, Costs & Profits", "Market Structures", "Labour Market", "Government Intervention"],
  },
  "17": {
    theme: "Theme 4: A Global Perspective",
    papers: ["Paper 2", "Paper 3"],
    official: ["International economics", "Poverty and inequality", "Emerging and developing economies", "The financial sector", "Role of the state in the macroeconomy"],
    revision: ["International Economics", "Poverty & Inequality", "Emerging & Developing Economies", "The Financial Sector", "Role of the State in the Macroeconomy"],
  },
};

const state = {
  catalog: null,
  filteredModules: [],
  currentModuleId: null,
  progress: loadProgress(),
  quizSession: null,
  flashcardSession: null,
  studySession: null,
  resourceCache: new Map(),
  paperTimerHandle: null,
  cloud: {
    available: false,
    configured: false,
    auth: null,
    db: null,
    user: null,
    status: "Local-only progress",
    syncLabel: "Not synced",
    saveTimer: null,
  },
};

const LOCAL_ARCHIVE_ROOT = new URL("../", window.location.href).toString();
const HOSTED_ARCHIVE_ROOT = "https://storage.googleapis.com/uplearn-economics-study-dashboard-assets-260426/";
const LOCAL_ARCHIVE_HOSTNAMES = new Set(["127.0.0.1", "localhost"]);

function getArchiveRoot() {
  return LOCAL_ARCHIVE_HOSTNAMES.has(window.location.hostname) ? LOCAL_ARCHIVE_ROOT : HOSTED_ARCHIVE_ROOT;
}

function archiveUrl(path) {
  if (!path) return null;
  const normalized = String(path).replaceAll("\\", "/").replace(/^\/+/, "");
  const encoded = normalized
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return new URL(encoded, getArchiveRoot()).toString();
}

function getVideoLabel(video, fallbackIndex = null) {
  if (video?.displayTitle) return video.displayTitle;
  const order = Number(video?.displayOrder);
  const title = String(video?.title || "").trim();
  if (Number.isFinite(order) && order > 0) return title ? `Video ${order} - ${title}` : `Video ${order}`;
  if (fallbackIndex != null) return title ? `Video ${fallbackIndex + 1} - ${title}` : `Video ${fallbackIndex + 1}`;
  return title ? `Video - ${title}` : "Video";
}

function getQuizBaseTitle(quiz) {
  return String(quiz?.title || "").replace(/^Quiz:\s*/i, "").trim() || "Quiz";
}

function getQuizIndex(topic, quiz, fallbackIndex = null) {
  const index = topic?.quizzes?.findIndex((candidate) => candidate.jsonPath === quiz?.jsonPath) ?? -1;
  return index >= 0 ? index : fallbackIndex;
}

function getQuizDuplicateIndex(topic, quiz) {
  const baseTitle = getQuizBaseTitle(quiz).toLowerCase();
  const matches = (topic?.quizzes || []).filter((candidate) => getQuizBaseTitle(candidate).toLowerCase() === baseTitle);
  if (matches.length <= 1) return null;
  const position = matches.findIndex((candidate) => candidate.jsonPath === quiz?.jsonPath);
  return position >= 0 ? { position: position + 1, total: matches.length } : null;
}

function getQuizLabel(topic, quiz, fallbackIndex = null) {
  const index = getQuizIndex(topic, quiz, fallbackIndex);
  const prefix = index != null && index >= 0 ? `Quiz ${index + 1}` : "Quiz";
  const baseTitle = getQuizBaseTitle(quiz);
  const duplicate = getQuizDuplicateIndex(topic, quiz);
  const duplicateSuffix = duplicate ? ` (set ${duplicate.position})` : "";
  return `${prefix} - ${baseTitle}${duplicateSuffix}`;
}

function getQuizMetricLabel(topic, quiz, fallbackIndex = null) {
  const questionLabel = `${quiz.questionCount} question${quiz.questionCount === 1 ? "" : "s"}`;
  return `${getQuizLabel(topic, quiz, fallbackIndex)} | ${questionLabel}`;
}

function getVideoIdentity(video) {
  return `${video?.videoPath || ""}::${video?.htmlPath || ""}::${video?.title || ""}`;
}

function getTopicVideoIndex(topic, video) {
  const targetIdentity = getVideoIdentity(video);
  return topic?.videos?.findIndex((candidate) => getVideoIdentity(candidate) === targetIdentity) ?? -1;
}

function getAdjacentTopicVideos(topic, video) {
  const index = getTopicVideoIndex(topic, video);
  if (index < 0) return { index: -1, previousVideo: null, nextVideo: null };
  return {
    index,
    previousVideo: topic.videos[index - 1] || null,
    nextVideo: topic.videos[index + 1] || null,
  };
}

function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function formatVideoShortcut(text) {
  const key = document.createElement("kbd");
  key.className = "shortcut-key";
  key.textContent = text;
  return key;
}

function buildVideoCommandBar(player, options = {}) {
  const { nextVideo = null, onPlayNext = null } = options;
  const controls = document.createElement("section");
  controls.className = "video-command-bar";
  controls.tabIndex = 0;
  controls.setAttribute("aria-label", "Video keyboard and playback controls");

  const primary = document.createElement("div");
  primary.className = "video-command-group";

  const secondary = document.createElement("div");
  secondary.className = "video-command-group video-command-group-shortcuts";

  const togglePlayback = () => {
    if (player.paused) player.play();
    else player.pause();
  };

  const seekBy = (seconds) => {
    if (!Number.isFinite(player.duration) && !Number.isFinite(player.currentTime)) return;
    const duration = Number.isFinite(player.duration) ? player.duration : player.currentTime + Math.abs(seconds);
    const nextTime = Math.min(Math.max(player.currentTime + seconds, 0), duration);
    player.currentTime = nextTime;
  };

  const toggleMute = () => {
    player.muted = !player.muted;
  };

  const toggleFullscreen = async () => {
    const container = player.closest(".study-video-player") || player;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    if (container.requestFullscreen) await container.requestFullscreen();
  };

  primary.append(
    buttonPill("Play / Pause", togglePlayback),
    buttonPill("Back 10s", () => seekBy(-10)),
    buttonPill("Forward 10s", () => seekBy(10)),
    buttonPill("Mute", toggleMute),
  );

  if (document.fullscreenEnabled) {
    primary.append(buttonPill("Fullscreen", () => {
      toggleFullscreen().catch((error) => console.error("Fullscreen failed", error));
    }));
  }

  if (nextVideo && onPlayNext) {
    const nextLabel = getVideoLabel(nextVideo);
    const nextButton = buttonPill(`Play Next: ${nextLabel}`, onPlayNext);
    nextButton.setAttribute("aria-keyshortcuts", "N");
    primary.append(nextButton);
  }

  const shortcuts = [
    ["Space", "play or pause"],
    ["J / Left", "back"],
    ["L / Right", "forward"],
    ["M", "mute"],
    document.fullscreenEnabled ? ["F", "fullscreen"] : null,
    nextVideo && onPlayNext ? ["N", "play next"] : null,
  ].filter(Boolean);

  for (const [keyText, label] of shortcuts) {
    const item = document.createElement("span");
    item.className = "video-shortcut";
    item.append(formatVideoShortcut(keyText), document.createTextNode(label));
    secondary.append(item);
  }

  const handleShortcut = (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || isTypingTarget(event.target)) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    const scopedToControls = target && controls.contains(target);
    const scopedToVideo = target && target.closest(".study-video-player") && player.closest(".study-video-player")?.contains(target);
    if (!scopedToControls && !scopedToVideo && document.activeElement !== player) return;

    const key = event.key.toLowerCase();
    if (key === " " || key === "k") {
      event.preventDefault();
      togglePlayback();
    } else if (key === "arrowleft" || key === "j") {
      event.preventDefault();
      seekBy(-10);
    } else if (key === "arrowright" || key === "l") {
      event.preventDefault();
      seekBy(10);
    } else if (key === "m") {
      event.preventDefault();
      toggleMute();
    } else if (key === "f" && document.fullscreenEnabled) {
      event.preventDefault();
      toggleFullscreen().catch((error) => console.error("Fullscreen failed", error));
    } else if (key === "n" && nextVideo && onPlayNext) {
      event.preventDefault();
      onPlayNext();
    }
  };

  controls.addEventListener("keydown", handleShortcut);
  player.addEventListener("keydown", handleShortcut);
  controls.append(primary, secondary);
  return controls;
}

async function fetchChunk(url, offset, size = 1024 * 1024) {
  const safeOffset = Math.max(0, Number(offset) || 0);
  const safeSize = Math.max(1, Number(size) || 1024 * 1024);
  const end = safeOffset + safeSize - 1;
  const response = await fetch(url, {
    mode: "cors",
    headers: {
      Range: `bytes=${safeOffset}-${end}`,
    },
  });

  if (response.status !== 206 && response.status !== 200) {
    throw new Error(`Unexpected response ${response.status}`);
  }

  return response.arrayBuffer();
}

const searchInput = document.getElementById("searchInput");
const yearFilter = document.getElementById("yearFilter");
const moduleFilter = document.getElementById("moduleFilter");
const appBrand = document.querySelector(".app-brand");
const coursesNavLink = document.querySelector('.app-nav-link[href="#resultTitle"]');
const todayNavLink = document.querySelector('.app-nav-link[href="#todayTitle"]');
const studyNavLink = document.querySelector('.app-nav-link[href="#studyTitle"]');
const resumeStudyBtn = document.getElementById("resumeStudyBtn");
const studyStageSelect = document.getElementById("studyStageSelect");
const coveredOnlyToggle = document.getElementById("coveredOnlyToggle");
const allowFutureToggle = document.getElementById("allowFutureToggle");
const statsGrid = document.getElementById("statsGrid");
const moduleList = document.getElementById("moduleList");
const pageShell = document.querySelector(".page-shell");
const appSidebar = document.querySelector(".sidebar");
const heroSection = document.querySelector(".hero");
const resultsHeader = document.querySelector(".results-header");
const dashboardDetails = document.querySelector(".dashboard-details");
const moduleView = document.getElementById("moduleView");
const moduleViewTitle = document.getElementById("moduleViewTitle");
const moduleViewMeta = document.getElementById("moduleViewMeta");
const moduleViewActions = document.getElementById("moduleViewActions");
const moduleViewStats = document.getElementById("moduleViewStats");
const moduleViewTopicsTitle = document.getElementById("moduleViewTopicsTitle");
const moduleViewTopicsMeta = document.getElementById("moduleViewTopicsMeta");
const moduleViewSections = document.getElementById("moduleViewSections");
const moduleViewExamList = document.getElementById("moduleViewExamList");
const moduleViewDefinitionList = document.getElementById("moduleViewDefinitionList");
const resultTitle = document.getElementById("resultTitle");
const resultMeta = document.getElementById("resultMeta");
const progressTitle = document.getElementById("progressTitle");
const progressMeta = document.getElementById("progressMeta");
const dueTitle = document.getElementById("dueTitle");
const dueMeta = document.getElementById("dueMeta");
const focusTitle = document.getElementById("focusTitle");
const focusMeta = document.getElementById("focusMeta");
const dueList = document.getElementById("dueList");
const weakTopicList = document.getElementById("weakTopicList");
const todayTitle = document.getElementById("todayTitle");
const todayMeta = document.getElementById("todayMeta");
const todayPlanList = document.getElementById("todayPlanList");
const specMapTitle = document.getElementById("specMapTitle");
const specMapMeta = document.getElementById("specMapMeta");
const specMapList = document.getElementById("specMapList");
const studyTitle = document.getElementById("studyTitle");
const studyMeta = document.getElementById("studyMeta");
const studyActions = document.getElementById("studyActions");
const studyContent = document.getElementById("studyContent");
const studyLayout = document.querySelector(".study-layout");
const studyPanelRoot = document.querySelector(".study-panel");
const notesTitle = document.getElementById("notesTitle");
const notesMeta = document.getElementById("notesMeta");
const insertNotePromptBtn = document.getElementById("insertNotePromptBtn");
const studyNotes = document.getElementById("studyNotes");
const notesSavedState = document.getElementById("notesSavedState");
const notesCount = document.getElementById("notesCount");
const specTitle = document.getElementById("specTitle");
const specMeta = document.getElementById("specMeta");
const specTags = document.getElementById("specTags");
const specChecklist = document.getElementById("specChecklist");
const notePrompt = document.getElementById("notePrompt");
const paperTitle = document.getElementById("paperTitle");
const paperMeta = document.getElementById("paperMeta");
const paperChecklist = document.getElementById("paperChecklist");
const paperTimerDisplay = document.getElementById("paperTimerDisplay");
const paperScoreDisplay = document.getElementById("paperScoreDisplay");
const startPaperTimerBtn = document.getElementById("startPaperTimerBtn");
const pausePaperTimerBtn = document.getElementById("pausePaperTimerBtn");
const resetPaperTimerBtn = document.getElementById("resetPaperTimerBtn");
const recentNotesList = document.getElementById("recentNotesList");
const mistakeList = document.getElementById("mistakeList");

const moduleTemplate = document.getElementById("moduleTemplate");
const topicTemplate = document.getElementById("topicTemplate");
const exportProgressBtn = document.getElementById("exportProgressBtn");
const importProgressInput = document.getElementById("importProgressInput");
const resetProgressBtn = document.getElementById("resetProgressBtn");
const authPanelTitle = document.getElementById("authPanelTitle");
const authStatusText = document.getElementById("authStatusText");
const authForm = document.getElementById("authForm");
const authSessionPanel = document.getElementById("authSessionPanel");
const authEmailInput = document.getElementById("authEmailInput");
const authPasswordInput = document.getElementById("authPasswordInput");
const signUpBtn = document.getElementById("signUpBtn");
const logInBtn = document.getElementById("logInBtn");
const logOutBtn = document.getElementById("logOutBtn");
const pushCloudBtn = document.getElementById("pushCloudBtn");
const pullCloudBtn = document.getElementById("pullCloudBtn");
const authUserBadge = document.getElementById("authUserBadge");
const cloudSyncBadge = document.getElementById("cloudSyncBadge");
const startDueReviewBtn = document.getElementById("startDueReviewBtn");
const startMixedReviewBtn = document.getElementById("startMixedReviewBtn");
const focusWeakTopicsBtn = document.getElementById("focusWeakTopicsBtn");
const startTodayPlanBtn = document.getElementById("startTodayPlanBtn");

const quizDialog = document.getElementById("quizDialog");
const closeQuizBtn = document.getElementById("closeQuizBtn");
const quizTitle = document.getElementById("quizTitle");
const quizMeta = document.getElementById("quizMeta");
const quizScoreboard = document.getElementById("quizScoreboard");
const quizQuestionMount = document.getElementById("quizQuestionMount");
const prevQuizBtn = document.getElementById("prevQuizBtn");
const nextQuizBtn = document.getElementById("nextQuizBtn");

const flashcardDialog = document.getElementById("flashcardDialog");
const flashcardTitle = document.getElementById("flashcardTitle");
const flashcardMeta = document.getElementById("flashcardMeta");
const flashcardMount = document.getElementById("flashcardMount");
const closeFlashcardBtn = document.getElementById("closeFlashcardBtn");
const revealFlashcardBtn = document.getElementById("revealFlashcardBtn");
const flashcardAgainBtn = document.getElementById("flashcardAgainBtn");
const flashcardHardBtn = document.getElementById("flashcardHardBtn");
const flashcardGoodBtn = document.getElementById("flashcardGoodBtn");
const flashcardEasyBtn = document.getElementById("flashcardEasyBtn");

async function boot() {
  const response = await fetch("./catalog.json");
  state.catalog = await response.json();
  normalizeProgress();
  syncPreferenceControls();
  seedFlashcards();
  populateFilters();
  bindEvents();
  renderCloudUi();
  await initCloudLayer();
  renderStats(state.catalog.stats);
  applyFilters();
  syncRouteToView();
  updateResumeStudyButton();
}

function setupNavSync() {
  const links = document.querySelectorAll(".app-nav-link");
  const sections = [
    { id: "resultTitle", el: document.getElementById("moduleList") },
    { id: "todayTitle", el: document.querySelector(".today-card") },
    { id: "studyTitle", el: document.querySelector(".study-layout") }
  ];

  function updateNav() {
    let currentId = "resultTitle";
    let minTop = Infinity;

    sections.forEach(s => {
      if (!s.el) return;
      const rect = s.el.getBoundingClientRect();
      if (rect.top <= 180 && rect.bottom > 180) {
        currentId = s.id;
      } else if (rect.top > 0 && rect.top < minTop) {
        minTop = rect.top;
        if (rect.top < window.innerHeight * 0.6) {
          currentId = s.id;
        }
      }
    });

    links.forEach(link => {
      if (link.getAttribute("href") === `#${currentId}`) {
        link.classList.add("is-active");
      } else {
        link.classList.remove("is-active");
      }
    });
  }

  window.addEventListener("scroll", updateNav, { passive: true });
  // Initial sync
  updateNav();
}

function bindEvents() {
  setupNavSync();
  window.addEventListener("hashchange", syncRouteToView);
  appBrand?.addEventListener("click", handleCoursesNavigation);
  coursesNavLink?.addEventListener("click", handleCoursesNavigation);
  todayNavLink?.addEventListener("click", handleTodayNavigation);
  studyNavLink?.addEventListener("click", handleStudyNavigation);
  searchInput.addEventListener("input", applyFilters);
  yearFilter.addEventListener("change", applyFilters);
  moduleFilter.addEventListener("change", applyFilters);
  studyStageSelect.addEventListener("change", updatePreferencesFromControls);
  coveredOnlyToggle.addEventListener("change", updatePreferencesFromControls);
  allowFutureToggle.addEventListener("change", updatePreferencesFromControls);

  exportProgressBtn.addEventListener("click", exportProgress);
  importProgressInput.addEventListener("change", importProgress);
  resetProgressBtn.addEventListener("click", resetProgress);
  resumeStudyBtn?.addEventListener("click", restoreLastStudy);
  signUpBtn?.addEventListener("click", signUpWithEmail);
  logInBtn?.addEventListener("click", logInWithEmail);
  logOutBtn?.addEventListener("click", logOutUser);
  pushCloudBtn?.addEventListener("click", () => pushCloudProgress(true));
  pullCloudBtn?.addEventListener("click", () => pullCloudProgress(true));

  startDueReviewBtn.addEventListener("click", () => startFlashcardSession("due"));
  startMixedReviewBtn.addEventListener("click", () => startFlashcardSession("mixed"));
  focusWeakTopicsBtn.addEventListener("click", focusWeakTopics);
  startTodayPlanBtn.addEventListener("click", startTodayPlan);
  insertNotePromptBtn.addEventListener("click", insertNotePrompt);

  closeQuizBtn.addEventListener("click", () => quizDialog.close());
  prevQuizBtn.addEventListener("click", () => moveQuiz(-1));
  nextQuizBtn.addEventListener("click", () => moveQuiz(1));

  closeFlashcardBtn.addEventListener("click", () => flashcardDialog.close());
  revealFlashcardBtn.addEventListener("click", revealFlashcard);
  flashcardAgainBtn.addEventListener("click", () => rateFlashcard(0));
  flashcardHardBtn.addEventListener("click", () => rateFlashcard(3));
  flashcardGoodBtn.addEventListener("click", () => rateFlashcard(4));
  flashcardEasyBtn.addEventListener("click", () => rateFlashcard(5));

  studyNotes.addEventListener("input", saveStudyNotes);

  startPaperTimerBtn.addEventListener("click", startPaperTimer);
  pausePaperTimerBtn.addEventListener("click", pausePaperTimer);
  resetPaperTimerBtn.addEventListener("click", resetPaperTimer);
}

function handleCoursesNavigation(event) {
  if (state.currentModuleId) {
    event.preventDefault();
    leaveModuleView();
  }
}

function handleTodayNavigation(event) {
  if (state.currentModuleId) {
    event.preventDefault();
    studyLayout.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function handleStudyNavigation(event) {
  if (state.currentModuleId) {
    event.preventDefault();
    studyLayout.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || createEmptyProgress();
  } catch {
    return createEmptyProgress();
  }
}

function createEmptyProgress() {
  return {
    version: 3,
    updatedAt: null,
    topics: {},
    quizzes: {},
    flashcards: {},
    notes: {},
    noteIndex: {},
    examPapers: {},
    quizReviews: {},
    lastStudy: null,
    preferences: {
      stage: "as",
      coveredOnly: true,
      allowFuture: false,
    },
  };
}

function normalizeProgress() {
  if (!state.progress || typeof state.progress !== "object") state.progress = createEmptyProgress();
  state.progress.version ??= 3;
  state.progress.updatedAt ??= null;
  state.progress.topics ??= {};
  state.progress.quizzes ??= {};
  state.progress.flashcards ??= {};
  state.progress.notes ??= {};
  state.progress.noteIndex ??= {};
  state.progress.examPapers ??= {};
  state.progress.quizReviews ??= {};
  state.progress.lastStudy ??= null;
  state.progress.preferences ??= {};
  state.progress.preferences.stage ??= "as";
  state.progress.preferences.coveredOnly ??= true;
  state.progress.preferences.allowFuture ??= false;
}

function saveProgress(options = {}) {
  state.progress.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
  if (!options.skipCloudSync) scheduleCloudSave();
}

function getCloudConfig() {
  const root = globalThis.UPLEARN_CLOUD_CONFIG || {};
  return {
    enabled: root.enabled !== false,
    firebase: root.firebase || {},
  };
}

function hasFirebaseConfig(config) {
  return Boolean(config?.apiKey && config?.authDomain && config?.projectId && config?.appId);
}

function renderCloudUi() {
  authPanelTitle.textContent = state.cloud.user ? "Cloud sync is active" : "Cloud sync is local-only right now";
  authStatusText.textContent = state.cloud.status;
  cloudSyncBadge.textContent = state.cloud.syncLabel;
  authUserBadge.textContent = state.cloud.user?.email || "Signed out";

  const signedIn = !!state.cloud.user;
  authForm.hidden = signedIn || !state.cloud.configured;
  authSessionPanel.hidden = !signedIn;

  const actionDisabled = !signedIn;
  pushCloudBtn.disabled = actionDisabled;
  pullCloudBtn.disabled = actionDisabled;
  logOutBtn.disabled = actionDisabled;
  signUpBtn.disabled = !state.cloud.configured;
  logInBtn.disabled = !state.cloud.configured;
}

async function initCloudLayer() {
  const { enabled, firebase } = getCloudConfig();
  state.cloud.available = enabled;
  state.cloud.configured = enabled && hasFirebaseConfig(firebase);

  if (!enabled) {
    state.cloud.status = "Cloud auth is disabled in firebase-config.js.";
    renderCloudUi();
    return;
  }

  if (!state.cloud.configured) {
    state.cloud.status = "Firebase config is missing. Fill in site/firebase-config.js to enable sign up and sync.";
    renderCloudUi();
    return;
  }

  state.cloud.status = "Connecting to Firebase Auth and Firestore...";
  renderCloudUi();

  try {
    const [
      { initializeApp },
      { getAuth, setPersistence, browserLocalPersistence, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut },
      { getFirestore, doc, getDoc, setDoc, serverTimestamp },
    ] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-firestore.js`),
    ]);

    const app = initializeApp(firebase);
    const auth = getAuth(app);
    const db = getFirestore(app);

    await setPersistence(auth, browserLocalPersistence);

    state.cloud.auth = auth;
    state.cloud.db = db;
    state.cloud.firebaseFns = {
      createUserWithEmailAndPassword,
      signInWithEmailAndPassword,
      signOut,
      onAuthStateChanged,
      doc,
      getDoc,
      setDoc,
      serverTimestamp,
    };

    onAuthStateChanged(auth, async (user) => {
      try {
        state.cloud.user = user || null;
        if (!user) {
          state.cloud.status = "Signed out. Progress still saves locally on this browser.";
          state.cloud.syncLabel = "Local only";
          renderCloudUi();
          return;
        }

        state.cloud.status = `Signed in as ${user.email}. Checking cloud save...`;
        state.cloud.syncLabel = "Syncing";
        renderCloudUi();
        await pullCloudProgress(false);
      } catch (error) {
        state.cloud.status = `Cloud sync error: ${error.message || error}`;
        state.cloud.syncLabel = "Sync failed";
        renderCloudUi();
      }
    });
  } catch (error) {
    state.cloud.status = `Firebase failed to initialize: ${error.message || error}`;
    state.cloud.syncLabel = "Unavailable";
    renderCloudUi();
  }
}

function getProgressTimestamp(progress = state.progress) {
  return Date.parse(progress?.updatedAt || "") || 0;
}

function isProgressEmpty(progress = state.progress) {
  return !Object.keys(progress.topics || {}).length
    && !Object.keys(progress.quizzes || {}).length
    && !Object.keys(progress.flashcards || {}).length
    && !Object.keys(progress.notes || {}).length
    && !Object.keys(progress.noteIndex || {}).length
    && !Object.keys(progress.examPapers || {}).length
    && !Object.keys(progress.quizReviews || {}).length
    && !progress.lastStudy;
}

function applyLoadedProgress(progress, options = {}) {
  state.progress = progress;
  normalizeProgress();
  syncPreferenceControls();
  seedFlashcards();
  saveProgress({ skipCloudSync: options.skipCloudSync ?? true });
  applyFilters();
  updateResumeStudyButton();
}

function getCloudProgressDocRef() {
  const { doc } = state.cloud.firebaseFns;
  return doc(state.cloud.db, "users", state.cloud.user.uid, "progress", CLOUD_PROGRESS_DOC_ID);
}

function scheduleCloudSave() {
  if (!state.cloud.user || !state.cloud.db) return;
  clearTimeout(state.cloud.saveTimer);
  state.cloud.syncLabel = "Pending sync";
  renderCloudUi();
  state.cloud.saveTimer = setTimeout(() => {
    pushCloudProgress(false).catch((error) => {
      state.cloud.status = `Cloud sync error: ${error.message || error}`;
      state.cloud.syncLabel = "Sync failed";
      renderCloudUi();
    });
  }, 1200);
}

async function pushCloudProgress(showStatus = false) {
  if (!state.cloud.user || !state.cloud.db) return;
  if (showStatus) {
    state.cloud.status = "Uploading progress to Firestore...";
    state.cloud.syncLabel = "Syncing";
    renderCloudUi();
  }

  const { setDoc, serverTimestamp } = state.cloud.firebaseFns;
  await setDoc(getCloudProgressDocRef(), {
    progress: state.progress,
    updatedAt: serverTimestamp(),
    clientUpdatedAt: state.progress.updatedAt || new Date().toISOString(),
  }, { merge: true });

  state.cloud.status = `Cloud save updated for ${state.cloud.user.email}.`;
  state.cloud.syncLabel = `Synced ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  renderCloudUi();
}

async function pullCloudProgress(showStatus = false) {
  if (!state.cloud.user || !state.cloud.db) return;
  if (showStatus) {
    state.cloud.status = "Checking Firestore progress...";
    state.cloud.syncLabel = "Syncing";
    renderCloudUi();
  }

  const { getDoc } = state.cloud.firebaseFns;
  const snapshot = await getDoc(getCloudProgressDocRef());
  if (!snapshot.exists()) {
    if (isProgressEmpty()) {
      state.cloud.status = `No cloud save exists yet for ${state.cloud.user.email}.`;
      state.cloud.syncLabel = "Cloud empty";
      renderCloudUi();
      return;
    }
    await pushCloudProgress(false);
    return;
  }

  const remoteProgress = snapshot.data()?.progress;
  if (!remoteProgress || typeof remoteProgress !== "object") {
    state.cloud.status = "Cloud save exists, but it does not contain a valid progress payload.";
    state.cloud.syncLabel = "Cloud invalid";
    renderCloudUi();
    return;
  }

  const localTs = getProgressTimestamp(state.progress);
  const remoteTs = getProgressTimestamp(remoteProgress);

  if (!localTs || remoteTs > localTs) {
    applyLoadedProgress(remoteProgress, { skipCloudSync: true });
    state.cloud.status = `Loaded newer cloud progress for ${state.cloud.user.email}.`;
    state.cloud.syncLabel = "Pulled from cloud";
    renderCloudUi();
    return;
  }

  if (localTs > remoteTs) {
    await pushCloudProgress(false);
    return;
  }

  state.cloud.status = `Cloud save already matches this device for ${state.cloud.user.email}.`;
  state.cloud.syncLabel = "Already synced";
  renderCloudUi();
}

async function signUpWithEmail() {
  if (!state.cloud.configured) return;
  const email = authEmailInput.value.trim();
  const password = authPasswordInput.value;
  if (!email || !password) {
    state.cloud.status = "Enter an email address and password to create an account.";
    renderCloudUi();
    return;
  }

  try {
    state.cloud.status = "Creating your account...";
    renderCloudUi();
    const { createUserWithEmailAndPassword } = state.cloud.firebaseFns;
    await createUserWithEmailAndPassword(state.cloud.auth, email, password);
    authPasswordInput.value = "";
  } catch (error) {
    state.cloud.status = `Sign-up failed: ${error.message || error}`;
    renderCloudUi();
  }
}

async function logInWithEmail() {
  if (!state.cloud.configured) return;
  const email = authEmailInput.value.trim();
  const password = authPasswordInput.value;
  if (!email || !password) {
    state.cloud.status = "Enter an email address and password to log in.";
    renderCloudUi();
    return;
  }

  try {
    state.cloud.status = "Signing you in...";
    renderCloudUi();
    const { signInWithEmailAndPassword } = state.cloud.firebaseFns;
    await signInWithEmailAndPassword(state.cloud.auth, email, password);
    authPasswordInput.value = "";
  } catch (error) {
    state.cloud.status = `Login failed: ${error.message || error}`;
    renderCloudUi();
  }
}

async function logOutUser() {
  if (!state.cloud.auth) return;
  try {
    clearTimeout(state.cloud.saveTimer);
    const { signOut } = state.cloud.firebaseFns;
    await signOut(state.cloud.auth);
  } catch (error) {
    state.cloud.status = `Logout failed: ${error.message || error}`;
    renderCloudUi();
  }
}

function updateResumeStudyButton() {
  if (!resumeStudyBtn) return;
  const lastStudy = state.progress.lastStudy;
  if (!lastStudy?.type) {
    resumeStudyBtn.hidden = true;
    resumeStudyBtn.disabled = true;
    resumeStudyBtn.removeAttribute("title");
    return;
  }
  resumeStudyBtn.hidden = false;
  resumeStudyBtn.disabled = false;
  resumeStudyBtn.textContent = "Resume last study";
  resumeStudyBtn.title = [lastStudy.title, lastStudy.meta].filter(Boolean).join(" | ");
}

async function restoreLastStudy() {
  const lastStudy = state.progress.lastStudy;
  if (!lastStudy?.type) return;

  if (lastStudy.type === "paper") {
    const foundPaper = findPaperByJsonPath(lastStudy.paperJsonPath);
    if (foundPaper) {
      await openExamPaperStudy(foundPaper.module, foundPaper.paper);
      return;
    }
  }

  if (lastStudy.type === "video") {
    const topic = findTopicById(lastStudy.topicId);
    const video = topic?.videos.find((item) =>
      item.videoPath === lastStudy.videoPath ||
      item.htmlPath === lastStudy.htmlPath,
    );
    if (topic && video) {
      await openVideoStudy(topic, video);
      return;
    }
  }

  if (lastStudy.type === "html" && lastStudy.path) {
    await openStudyHtml({
      title: lastStudy.title,
      meta: lastStudy.meta,
      path: lastStudy.path,
      notesKey: lastStudy.notesKey,
      topicId: lastStudy.topicId,
      trackKey: lastStudy.trackKey,
      reopenRef: lastStudy,
    });
    return;
  }

  alert("That saved study resource is no longer available in the current catalog.");
}

function syncPreferenceControls() {
  studyStageSelect.value = state.progress.preferences.stage;
  coveredOnlyToggle.checked = !!state.progress.preferences.coveredOnly;
  allowFutureToggle.checked = !!state.progress.preferences.allowFuture;
}

function updatePreferencesFromControls() {
  state.progress.preferences.stage = studyStageSelect.value;
  state.progress.preferences.coveredOnly = coveredOnlyToggle.checked;
  state.progress.preferences.allowFuture = allowFutureToggle.checked;
  saveProgress();
  applyFilters();
}

function populateFilters() {
  const years = [...new Set(state.catalog.modules.map((module) => module.yearFolder))];
  for (const year of years) yearFilter.append(new Option(year, year));
  for (const module of state.catalog.modules) moduleFilter.append(new Option(module.title, module.id));
}

function renderStats(stats) {
  const cards = [
    ["Modules", stats.modules],
    ["Topics", stats.topics],
    ["Videos", stats.videos],
    ["Quizzes", stats.quizzes],
    ["Quiz Questions", stats.quizQuestions],
    ["Definitions", stats.definitions],
    ["Exam Papers", stats.examPapers],
    ["Exam Questions", stats.examQuestions],
  ];
  statsGrid.innerHTML = "";
  for (const [label, value] of cards) {
    const card = document.createElement("article");
    card.className = "stat-card";
    card.innerHTML = `<p class="stat-label">${label}</p><p class="stat-value">${value.toLocaleString()}</p>`;
    statsGrid.append(card);
  }
}

function applyFilters() {
  const openState = captureOpenModuleState();
  const query = searchInput.value.trim().toLowerCase();
  const selectedYear = yearFilter.value;
  const selectedModuleId = moduleFilter.value;

  state.filteredModules = state.catalog.modules.filter((module) => {
    if (selectedYear && module.yearFolder !== selectedYear) return false;
    if (selectedModuleId && module.id !== selectedModuleId) return false;
    if (!query) return true;
    return buildModuleHaystack(module).includes(query);
  });

  renderModules();
  restoreOpenModuleState(openState);
  if (state.currentModuleId) {
    const activeModule = findModuleById(state.currentModuleId);
    if (activeModule) renderModuleView(activeModule);
  }
  renderProgressSummary();
  renderSmartDashboard();
  renderTodayPlan();
  renderSpecMap();
  renderRecentNotes();
  renderMistakeList();
}

function captureOpenModuleState() {
  return {
    modules: [...moduleList.querySelectorAll(".module-card[data-module-id] .module-details[open]")]
      .map((node) => node.closest(".module-card")?.dataset.moduleId)
      .filter(Boolean),
    sections: [...moduleList.querySelectorAll(".module-card[data-module-id] .section-card[open]")]
      .map((node) => {
        const moduleId = node.closest(".module-card")?.dataset.moduleId;
        const sectionName = node.dataset.sectionName;
        return moduleId && sectionName ? `${moduleId}::${sectionName}` : null;
      })
      .filter(Boolean),
  };
}

function restoreOpenModuleState(openState) {
  const openSections = new Set(openState?.sections || []);
  moduleList.querySelectorAll(".module-card[data-module-id]").forEach((card) => {
    const moduleId = card.dataset.moduleId;
    card.querySelectorAll(".section-card").forEach((sectionCard) => {
      sectionCard.open = openSections.has(`${moduleId}::${sectionCard.dataset.sectionName}`);
    });
  });
}

function parseModuleIdFromHash() {
  const match = String(window.location.hash || "").match(/^#module\/(.+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function openModuleView(moduleOrId) {
  const moduleId = typeof moduleOrId === "string" ? moduleOrId : moduleOrId?.id;
  if (!moduleId) return;
  const nextHash = `#module/${encodeURIComponent(moduleId)}`;
  if (window.location.hash === nextHash) {
    syncRouteToView();
    return;
  }
  window.location.hash = nextHash;
}

function leaveModuleView() {
  if (!window.location.hash) {
    syncRouteToView();
    return;
  }
  history.pushState("", document.title, `${window.location.pathname}${window.location.search}`);
  syncRouteToView();
}

function syncRouteToView() {
  const moduleId = parseModuleIdFromHash();
  const activeModule = moduleId ? findModuleById(moduleId) : null;
  if (activeModule) {
    state.currentModuleId = activeModule.id;
    renderModuleView(activeModule);
    pageShell.classList.add("is-module-view");
    heroSection.hidden = true;
    resultsHeader.hidden = true;
    moduleList.hidden = true;
    dashboardDetails.hidden = true;
    moduleView.hidden = false;
    studyLayout.hidden = false;
  } else {
    state.currentModuleId = null;
    pageShell.classList.remove("is-module-view");
    heroSection.hidden = false;
    resultsHeader.hidden = false;
    moduleList.hidden = false;
    dashboardDetails.hidden = false;
    moduleView.hidden = true;
    studyLayout.hidden = true;
  }
  setupNavSync();
}

function renderModuleView(module) {
  const visibleTopics = module.topics.filter((topic) => topicMatchesSearch(topic));
  const progress = getModuleProgress(module);
  moduleViewTitle.textContent = module.title;
  moduleViewMeta.textContent = `${module.yearFolder} | ${module.course?.board?.name || "Board unknown"} | ${visibleTopics.length} visible topics`;
  moduleViewTopicsTitle.textContent = `Browse ${module.title}`;
  moduleViewTopicsMeta.textContent = visibleTopics.length
    ? `${visibleTopics.reduce((sum, topic) => sum + topic.videos.length, 0)} videos | ${visibleTopics.reduce((sum, topic) => sum + topic.quizzes.length, 0)} quizzes | ${progress.score}% ready`
    : "No topics match the current filters in this module.";

  moduleViewActions.innerHTML = "";
  moduleViewActions.append(buttonPill("Back to all modules", leaveModuleView));
  moduleViewActions.append(buttonPill("Today from this module", () => openModulePriority(module)));
  moduleViewActions.append(buttonPill("Drill flashcards", () => startFlashcardSession("module", module.id)));

  moduleViewStats.innerHTML = "";
  moduleViewStats.append(metric(`${visibleTopics.length} topics`));
  moduleViewStats.append(metric(`${module.definitions.length} definition groups`));
  moduleViewStats.append(metric(`${module.examPapers.length} exam papers`));
  moduleViewStats.append(metric(`${visibleTopics.reduce((sum, topic) => sum + topic.videos.length, 0)} videos`));
  moduleViewStats.append(metric(`${visibleTopics.reduce((sum, topic) => sum + topic.quizzes.length, 0)} quizzes`));
  moduleViewStats.append(metric(`${progress.completed}/${progress.total} complete`));

  renderSectionGrid(moduleViewSections, module, visibleTopics);
  renderModuleResourcePanels(module);
}

function renderModuleResourcePanels(module) {
  moduleViewExamList.innerHTML = "";
  moduleViewDefinitionList.innerHTML = "";

  for (const paper of getPreferredPaperOrder(module).slice(0, 6)) {
    const practiceLabel = paper.questionCount > 0 ? "Paper mode" : "Paper notes";
    const detail = paper.questionCount > 0
      ? `${paper.code || "Exam paper"} | ${paper.questionCount} structured questions`
      : `${paper.code || "Exam paper"} | reference-only export`;
    moduleViewExamList.append(
      actionCard(paper.title, detail, [
        { label: practiceLabel, action: () => openExamPaperStudy(module, paper) },
        { label: "Open raw", href: archiveUrl(paper.htmlPath || paper.jsonPath) },
      ], "compact"),
    );
  }
  if (!moduleViewExamList.children.length) moduleViewExamList.append(emptyCard("No exam papers are available for this module."));

  for (const group of module.definitions.slice(0, 8)) {
    moduleViewDefinitionList.append(
      actionCard(group.title, `${group.count} cards`, [
        { label: "Drill group", action: () => startFlashcardSession("group", group.id) },
        { label: "Study notes", action: () => openDefinitionStudy(module, group) },
      ], "compact"),
    );
  }
  if (!moduleViewDefinitionList.children.length) moduleViewDefinitionList.append(emptyCard("No definition packs are available for this module."));
}

function buildModuleHaystack(module) {
  return [
    module.title,
    module.subtitle,
    module.course?.name,
    module.course?.subject?.name,
    module.course?.board?.name,
    ...module.topics.flatMap((topic) => [
      topic.name,
      topic.section,
      ...topic.quizzes.map((quiz) => quiz.title),
      ...topic.videos.map((video) => video.title),
      ...topic.articleLessons.map((lesson) => lesson.title),
    ]),
    ...module.definitions.flatMap((group) => [group.title, ...group.items.slice(0, 5).map((item) => item.prompt)]),
    ...module.examPapers.map((paper) => paper.title),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function renderProgressSummary() {
  const visibleTopics = getRecommendationTopics({ coveredOnly: false, includeFuture: true });
  const tracked = visibleTopics.map(getTopicProgress);
  const completed = tracked.filter((item) => item.completed).length;
  const started = tracked.filter((item) => item.score > 0).length;
  const total = tracked.length;
  const avg = total ? Math.round(tracked.reduce((sum, item) => sum + item.score, 0) / total) : 0;
  progressTitle.textContent = total ? `${completed}/${total} topics fully checked off` : "No visible topics";
  progressMeta.textContent = total
    ? `${started} started | ${avg}% average completion | ${state.progress.updatedAt ? `saved ${new Date(state.progress.updatedAt).toLocaleString()}` : "not saved yet"}`
    : "Adjust the filters to see revision tracking.";
}

function renderSmartDashboard() {
  const dueAll = getDueFlashcards();
  const dueCards = dueAll.slice(0, 8);
  const newCards = getNewFlashcards();
  const weakAll = getWeakTopics();
  const weakTopics = weakAll.slice(0, 8);

  if (dueAll.length) {
    dueTitle.textContent = `${dueAll.length} flashcards due now`;
    dueMeta.textContent = `${Math.min(dueAll.length, 12)} cards is a good session size. ${newCards.length} new cards are waiting behind them.`;
  } else if (newCards.length) {
    dueTitle.textContent = `${newCards.length} new flashcards ready`;
    dueMeta.textContent = "No overdue cards yet. Start with a small batch of new cards.";
  } else {
    dueTitle.textContent = "No flashcards due right now";
    dueMeta.textContent = "Use mixed review to keep memory fresh.";
  }

  focusTitle.textContent = weakAll.length ? `${weakAll.length} weaker topics to target` : "No clear weak topics yet";
  focusMeta.textContent = weakAll.length
    ? "These combine low completion, weak quiz performance, and missing notes within your current study rules."
    : state.progress.preferences.coveredOnly
      ? "Cover a few topics first, then weak-spot recommendations will appear."
      : "Finish a few quizzes or checks and this panel will sharpen.";

  dueList.innerHTML = "";
  if (!dueCards.length && !newCards.length) dueList.append(emptyCard("Nothing due. Mixed review is a good next step."));
  if (!dueCards.length && newCards.length) {
    for (const item of newCards.slice(0, 8)) {
      dueList.append(actionCard(item.prompt, `${item.moduleTitle} | ${item.groupTitle} | new`, [{ label: "Learn card", action: () => startFlashcardSession("single", item.id) }]));
    }
  }
  for (const item of dueCards) {
    dueList.append(actionCard(item.prompt, `${item.moduleTitle} | ${item.groupTitle}`, [{ label: "Review card", action: () => startFlashcardSession("single", item.id) }]));
  }

  weakTopicList.innerHTML = "";
  if (!weakTopics.length) weakTopicList.append(emptyCard("No weak-topic recommendations yet."));
  for (const topic of weakTopics) {
    const progress = getTopicProgress(topic);
    weakTopicList.append(
      actionCard(topic.name, `${topic.section} | ${progress.score}% ready`, [
        { label: "Study topic", action: () => openTopicStudy(topic) },
        topic.quizzes[0] ? { label: "Practice quiz", action: () => openQuiz(topic, topic.quizzes[0]) } : null,
      ].filter(Boolean)),
    );
  }
}

function renderTodayPlan() {
  const plan = buildTodayPlan();
  todayTitle.textContent = plan.length ? `${plan.length} steps ready for today` : "Nothing urgent right now";
  todayMeta.textContent = plan.length
    ? "The order balances spaced recall, weak-topic repair, and active practice."
    : "Use mixed review or open a topic to keep momentum going.";
  todayPlanList.innerHTML = "";
  if (!plan.length) {
    todayPlanList.append(emptyCard("No generated steps yet."));
    return;
  }
  for (const step of plan) {
    todayPlanList.append(actionCard(step.title, step.subtitle, [{ label: step.cta, action: step.action }]));
  }
}

function renderSpecMap() {
  const modules = getRecommendationModules();
  const entries = modules.map((module) => ({ module, blueprint: SPEC_BLUEPRINT[module.id] })).filter((item) => item.blueprint);
  specMapTitle.textContent = entries.length ? `${entries.length} Edexcel theme guides visible` : "No theme guides visible";
  specMapMeta.textContent = entries.length
    ? `Built from the Pearson Edexcel specification themes and revision-note topic structure. Current stage: ${state.progress.preferences.stage === "alevel" ? "A Level" : "AS"}.`
    : "Adjust filters to view the specification map.";
  specMapList.innerHTML = "";
  if (!entries.length) {
    specMapList.append(emptyCard("No visible modules match the current specification map."));
    return;
  }
  for (const { module, blueprint } of entries) {
    const card = document.createElement("article");
    card.className = "spec-map-card";
    card.innerHTML = `
      <p class="eyebrow">${escapeHtml(module.yearFolder)}</p>
      <h4>${escapeHtml(blueprint.theme)}</h4>
      <p>${escapeHtml(blueprint.papers.join(" and "))}</p>
      <ul>${blueprint.revision.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    `;
    specMapList.append(card);
  }
}

function buildTodayPlan() {
  const plan = [];
  const due = getDueFlashcards();
  const fresh = getNewFlashcards();
  const teachingTarget = getTeachingPathCandidate();
  const weak = getWeakTopics();
  const quizTarget = getWorstQuizTopic();
  const paperTarget = getPaperTarget();

  if (teachingTarget) {
    plan.push({
      title: `Continue with ${teachingTarget.name}`,
      subtitle: `${teachingTarget.section} | next best topic in teaching order`,
      cta: "Teach this topic",
      action: () => openTopicStudy(teachingTarget),
    });
  }

  if (weak[0] && (!teachingTarget || weak[0].id !== teachingTarget.id)) {
    plan.push({
      title: `Repair ${weak[0].name}`,
      subtitle: `${weak[0].section} | weak understanding or thin notes`,
      cta: "Repair topic",
      action: () => openTopicStudy(weak[0]),
    });
  }

  if (quizTarget && plan.length < 4) {
    plan.push({
      title: `Retry ${getQuizLabel(quizTarget.topic, quizTarget.quiz)}`,
      subtitle: `${quizTarget.topic.name} | best score ${getQuizProgress(quizTarget.quiz.jsonPath).bestScore || 0}%`,
      cta: "Practice quiz",
      action: () => openQuiz(quizTarget.topic, quizTarget.quiz),
    });
  }

  if (paperTarget && plan.length < 4) {
    plan.push({
      title: `Timed paper: ${paperTarget.paper.title}`,
      subtitle: `${paperTarget.module.title} | exam practice and self-marking`,
      cta: "Open paper mode",
      action: () => openExamPaperStudy(paperTarget.module, paperTarget.paper),
    });
  }

  if ((due.length || fresh.length) && plan.length < 4) {
    plan.push({
      title: due.length ? `Clear ${Math.min(due.length, 12)} due flashcards` : `Learn ${Math.min(fresh.length, 12)} new flashcards`,
      subtitle: due.length ? "Use spaced recall after your main note-taking block." : "Prime your memory with a controlled batch of new cards.",
      cta: "Start flashcards",
      action: () => startFlashcardSession("due"),
    });
  }

  return plan.slice(0, 4);
}

function renderMistakeList() {
  const reviews = Object.values(state.progress.quizReviews)
    .sort((a, b) => Date.parse(b.at || 0) - Date.parse(a.at || 0))
    .slice(0, 6);
  mistakeList.innerHTML = "";
  if (!reviews.length) {
    mistakeList.append(emptyCard("Finish a quiz and your mistake patterns will show up here."));
    return;
  }
  for (const review of reviews) {
    const types = Object.entries(review.wrongByType || {})
      .map(([type, count]) => `${type}: ${count}`)
      .join(" | ");
    const topic = findTopicById(review.topicId);
    mistakeList.append(
      actionCard(review.quizTitle, `${review.score}% | ${types || "review mistakes"}`, [
        topic?.quizzes.find((quiz) => quiz.jsonPath === review.quizPath)
          ? { label: "Retry quiz", action: () => openQuiz(topic, topic.quizzes.find((quiz) => quiz.jsonPath === review.quizPath)) }
          : null,
        topic ? { label: "Study topic", action: () => openTopicStudy(topic) } : null,
      ].filter(Boolean)),
    );
  }
}

function renderRecentNotes() {
  recentNotesList.innerHTML = "";
  const entries = Object.values(state.progress.noteIndex || {})
    .filter((entry) => entry && entry.updatedAt && (state.progress.notes[entry.notesKey] || "").trim())
    .sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0))
    .slice(0, 6);

  if (!entries.length) {
    recentNotesList.append(emptyCard("Your saved topic, video, quiz, and paper notes will appear here."));
    return;
  }

  for (const entry of entries) {
    const noteText = state.progress.notes[entry.notesKey] || "";
    recentNotesList.append(
      actionCard(entry.title, `${entry.meta} | ${Math.max(1, Math.round(noteText.length / 80))} note blocks`, [
        { label: "Reopen", action: () => reopenStudyResource(entry.reopenRef) },
      ]),
    );
  }
}

function renderModules() {
  moduleList.innerHTML = "";
  const modules = state.filteredModules;
  const topicCount = modules.reduce((sum, module) => sum + module.topics.filter((topic) => topicMatchesSearch(topic)).length, 0);
  const quizCount = modules.reduce((sum, module) => sum + module.topics.filter((topic) => topicMatchesSearch(topic)).reduce((acc, topic) => acc + topic.quizzes.length, 0), 0);

  resultTitle.textContent = modules.length ? `${modules.length} modules ready` : "No matching modules";
  resultMeta.textContent = modules.length ? `${topicCount} topics | ${quizCount} quizzes` : "Try widening the filters or search query.";

  if (!modules.length) {
    moduleList.innerHTML = `<div class="empty-state">Nothing matched the current filters.</div>`;
    return;
  }

  for (const module of modules) {
    const visibleTopics = module.topics.filter((topic) => topicMatchesSearch(topic));
    const node = moduleTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.moduleId = module.id;
    node.querySelector(".module-year").textContent = module.yearFolder;
    node.querySelector(".module-title").textContent = module.title;
    node.querySelector(".module-subtitle").textContent = `${module.course?.board?.name || "Board unknown"} | ${module.course?.name || "Course"}`;
    const progress = getModuleProgress(module);
    node.querySelector(".progress-fill").style.width = `${progress.score}%`;

    const links = node.querySelector(".module-links");
    links.append(buttonPill("Open module", () => openModuleView(module)));
    links.append(buttonPill("Today from this module", () => openModulePriority(module)));
    links.append(buttonPill("Drill flashcards", () => startFlashcardSession("module", module.id)));

    const quickActions = node.querySelector(".module-quick-actions");
    const firstTopic = visibleTopics[0];
    if (firstTopic) quickActions.append(buttonPill("Start with first topic", () => {
      openModuleView(module);
      openTopicStudy(firstTopic);
    }));
    const firstVideo = visibleTopics.find((topic) => topic.videos[0]);
    if (firstVideo) quickActions.append(buttonPill("Start a video", () => {
      openModuleView(module);
      openVideoStudy(firstVideo, firstVideo.videos[0]);
    }));
    const firstQuiz = visibleTopics.find((topic) => topic.quizzes[0]);
    if (firstQuiz) quickActions.append(buttonPill("Practice a quiz", () => {
      openModuleView(module);
      openQuiz(firstQuiz, firstQuiz.quizzes[0]);
    }));

    const stats = node.querySelector(".module-stats");
    stats.append(metric(`${visibleTopics.length} topics`));
    stats.append(metric(`${module.definitions.length} definition groups`));
    stats.append(metric(`${module.examPapers.length} exam papers`));
    stats.append(metric(`${visibleTopics.reduce((sum, topic) => sum + topic.videos.length, 0)} videos`));
    stats.append(metric(`${visibleTopics.reduce((sum, topic) => sum + topic.quizzes.length, 0)} quizzes`));
    stats.append(metric(`${progress.completed}/${progress.total} complete`));
    moduleList.append(node);
  }
}

function renderSectionGrid(mount, module, visibleTopics) {
  mount.innerHTML = "";
  const grid = document.createElement("div");
  grid.className = "section-grid";
  const grouped = groupTopicsBySection(module, visibleTopics);
  for (const group of grouped) {
    grid.append(renderSectionCard(group.section, group.topics));
  }
  mount.append(grid);
}

function groupTopicsBySection(module, topics) {
  const ordered = [];
  const map = new Map();
  for (const topic of topics) {
    const key = topic.section || "Other";
    if (!map.has(key)) {
      const entry = { section: key, topics: [] };
      map.set(key, entry);
      ordered.push(entry);
    }
    map.get(key).topics.push(topic);
  }
  for (const entry of ordered) {
    entry.topics.sort((a, b) => Number(a.subsectionNumber || 999) - Number(b.subsectionNumber || 999));
  }
  return ordered;
}

function renderSectionCard(section, topics) {
  const card = document.createElement("details");
  card.className = "section-card";
  card.dataset.sectionName = section;
  const completedCount = topics.filter((topic) => getTopicProgress(topic).completed).length;

  const header = document.createElement("summary");
  header.className = "section-card-head";
  const title = document.createElement("h5");
  title.className = "section-card-title";
  title.textContent = section;
  const meta = document.createElement("span");
  meta.className = "metric";
  meta.textContent = `${completedCount}/${topics.length} complete`;
  const headerMain = document.createElement("div");
  headerMain.className = "section-card-main";
  headerMain.append(title, meta);
  const summaryMeta = document.createElement("div");
  summaryMeta.className = "section-card-summary-meta";
  summaryMeta.textContent = `${topics.length} topics ready to revise`;
  header.append(headerMain, summaryMeta);
  card.append(header);

  const body = document.createElement("div");
  body.className = "section-card-body";
  const list = document.createElement("div");
  list.className = "section-topic-list";
  for (const topic of topics) {
    list.append(renderSectionTopicButton(topic));
  }
  body.append(list);
  card.append(body);
  return card;
}

function renderSectionTopicButton(topic) {
  const progress = getTopicProgress(topic);
  const article = document.createElement("article");
  article.className = `section-topic-row${progress.completed ? " is-complete" : ""}`;
  article.dataset.topicId = topic.id;

  const head = document.createElement("div");
  head.className = "section-topic-main";

  const status = document.createElement("span");
  status.className = `topic-checkmark${progress.completed ? " is-complete" : progress.score >= 50 ? " is-progress" : ""}`;
  status.textContent = progress.completed ? "✓" : progress.score >= 50 ? "•" : "";

  status.tabIndex = 0;
  status.setAttribute("role", "checkbox");
  status.setAttribute("aria-checked", progress.completed ? "true" : "false");
  status.setAttribute("aria-label", `Mark ${topic.name} complete`);
  status.title = progress.completed ? "Mark topic incomplete" : "Mark topic complete";
  status.addEventListener("click", () => {
    setTopicCompletion(topic, !getTopicProgress(topic).completed);
    applyFilters();
  });
  status.addEventListener("keydown", (event) => {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    setTopicCompletion(topic, !getTopicProgress(topic).completed);
    applyFilters();
  });

  const label = document.createElement("div");
  label.className = "section-topic-label";
  label.textContent = `${topic.subsectionNumber || ""}${topic.subsectionNumber ? ". " : ""}${topic.name}`;

  const meta = document.createElement("div");
  meta.className = "section-topic-meta";
  meta.textContent = buildTopicRowMeta(topic, progress);

  const textWrap = document.createElement("div");
  textWrap.className = "section-topic-text";
  textWrap.append(label, meta);
  head.append(status, textWrap);

  const actions = document.createElement("div");
  actions.className = "section-topic-actions";
  actions.append(buttonPill("Open topic", () => openTopicStudy(topic)));
  if (topic.videos[0]) actions.append(buttonPill("Video", () => openVideoStudy(topic, topic.videos[0])));
  if (topic.quizzes[0]) actions.append(buttonPill("Quiz", () => openQuiz(topic, topic.quizzes[0])));

  article.append(head, actions);
  return article;
}

function buildTopicRowMeta(topic, progress) {
  const parts = [`${progress.score}% ready`];
  if (topic.videos.length) parts.push(`${topic.videos.length} video${topic.videos.length !== 1 ? "s" : ""}`);
  if (topic.quizzes.length) parts.push(`${topic.quizzes.length} quiz${topic.quizzes.length !== 1 ? "zes" : ""}`);
  if (topic.articleLessons.length) parts.push(`${topic.articleLessons.length} article${topic.articleLessons.length !== 1 ? "s" : ""}`);
  return parts.join(" | ");
}

function renderTopic(topic) {
  const node = topicTemplate.content.firstElementChild.cloneNode(true);
  const topicProgress = getTopicProgress(topic);
  node.dataset.topicId = topic.id;
  node.querySelector(".topic-section").textContent = topic.section;
  node.querySelector(".topic-name").textContent = `${topic.subsectionNumber || ""}. ${topic.name}`;

  const metrics = node.querySelector(".topic-metrics");
  metrics.append(metric(`${topicProgress.score}% done`));
  if (topic.videos.length) metrics.append(metric(`${topic.videos.length} videos`));
  if (topic.quizzes.length) metrics.append(metric(`${topic.quizzes.length} quizzes`));
  if (topic.articleLessons.length) metrics.append(metric(`${topic.articleLessons.length} articles`));
  if (topic.summaryHtmlPath) metrics.append(metric("summary"));
  if (getTopicNotesLength(topic.id)) metrics.append(metric(`${Math.round(getTopicNotesLength(topic.id) / 20)} note lines`));

  const actions = node.querySelector(".topic-actions");
  actions.append(buttonPill("Study topic", () => openTopicStudy(topic)));
  if (topic.quizzes[0]) actions.append(buttonPill("Quick quiz", () => openQuiz(topic, topic.quizzes[0])));
  actions.append(linkPill(archiveUrl(topic.path), "Folder"));

  const checks = node.querySelector(".topic-checks");
  checks.append(renderCoveredToggle(topic));
  checks.append(renderTopicCheck(topic, "summary", "Summary reviewed", !!topic.summaryHtmlPath));
  checks.append(renderTopicCheck(topic, "videos", "Videos done", topic.videos.length > 0));
  checks.append(renderTopicCheck(topic, "quizzes", "Quizzes done", topic.quizzes.length > 0));
  checks.append(renderTopicCheck(topic, "articles", "Articles done", topic.articleLessons.length > 0));
  checks.append(renderTopicCheck(topic, "confidence", "Confident on this topic", true));

  const quizList = node.querySelector(".quiz-list");
  for (const [quizIndex, quiz] of topic.quizzes.entries()) {
    const progress = getQuizProgress(quiz.jsonPath);
    quizList.append(
      actionCard(getQuizLabel(topic, quiz, quizIndex), `${quiz.questionCount} questions | ${progress.completed ? "completed" : progress.lastScore ? `${progress.lastScore}% best` : "not started"}`, [
        { label: "Practice", action: () => openQuiz(topic, quiz) },
        { label: "Review notes", action: () => openQuizStudyNotes(topic, quiz) },
        quiz.assetFolder ? { label: "Assets", href: archiveUrl(quiz.assetFolder) } : null,
      ].filter(Boolean)),
    );
  }

  const videoList = node.querySelector(".video-list");
  for (const video of topic.videos) {
    videoList.append(
      actionCard(video.displayTitle || video.title, video.kind, [
        { label: "Study video", action: () => openVideoStudy(topic, video) },
        video.htmlPath ? { label: "Lesson notes", action: () => openStudyHtml({ title: video.title, meta: `${topic.name} | Lesson notes`, path: video.htmlPath, notesKey: `videohtml:${video.htmlPath}`, topicId: topic.id, trackKey: "videos" }) } : null,
      ].filter(Boolean)),
    );
  }

  const articleList = node.querySelector(".article-list");
  for (const article of topic.articleLessons) {
    articleList.append(
      actionCard(article.title, "Article lesson", [
        { label: "Study article", action: () => openStudyHtml({ title: article.title, meta: `${topic.name} | Article`, path: article.htmlPath || article.jsonPath, notesKey: `article:${article.htmlPath || article.jsonPath}`, topicId: topic.id, trackKey: "articles" }) },
      ]),
    );
  }

  return node;
}

function renderTopicCheck(topic, key, label, enabled) {
  const wrapper = document.createElement("label");
  wrapper.className = `check-chip${enabled ? "" : " is-disabled"}`;
  const input = document.createElement("input");
  input.type = "checkbox";
  input.disabled = !enabled;
  input.checked = enabled ? !!getTopicState(topic.id).checks[key] : false;
  input.addEventListener("change", () => {
    updateTopicCheck(topic.id, key, input.checked);
    applyFilters();
  });
  const span = document.createElement("span");
  span.textContent = label;
  wrapper.append(input, span);
  return wrapper;
}

function renderCoveredToggle(topic) {
  const wrapper = document.createElement("label");
  wrapper.className = "check-chip";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = !!getTopicState(topic.id).coveredInClass;
  input.addEventListener("change", () => {
    getTopicState(topic.id).coveredInClass = input.checked;
    saveProgress();
    applyFilters();
  });
  const span = document.createElement("span");
  span.textContent = "Covered in class";
  wrapper.append(input, span);
  return wrapper;
}

function actionCard(title, subtitle, actions, tone = "default") {
  const article = document.createElement("article");
  article.className = `revision-card${tone === "compact" ? " revision-card-compact" : ""}`;
  const head = document.createElement("div");
  head.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(subtitle)}</span>`;
  article.append(head);
  const bar = document.createElement("div");
  bar.className = "topic-actions";
  for (const action of actions) {
    if (action.href) bar.append(linkPill(action.href, action.label));
    else if (action.action) bar.append(buttonPill(action.label, action.action));
  }
  article.append(bar);
  return article;
}

function emptyCard(text) {
  const div = document.createElement("div");
  div.className = "empty-state";
  div.textContent = text;
  return div;
}

function linkPill(href, label) {
  const link = document.createElement("a");
  link.className = "pill";
  link.href = href;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = label;
  return link;
}

function buttonPill(label, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pill pill-button";
  button.textContent = label;
  button.addEventListener("click", action);
  return button;
}

function metric(label) {
  const node = document.createElement("span");
  node.className = "metric";
  node.textContent = label;
  return node;
}

function getVisibleTopics() {
  return state.filteredModules.flatMap((module) => module.topics.filter((topic) => topicMatchesSearch(topic)));
}

function getStageModuleIds() {
  return state.progress.preferences.stage === "alevel" ? ["14", "15", "16", "17"] : ["14", "15"];
}

function getRecommendationModules() {
  const allowed = new Set(getStageModuleIds());
  const modules = (state.filteredModules.length ? state.filteredModules : state.catalog.modules).filter((module) => allowed.has(module.id));
  return modules;
}

function getRecommendationTopics({ coveredOnly = null, includeFuture = null } = {}) {
  const useCoveredOnly = coveredOnly ?? state.progress.preferences.coveredOnly;
  const useFuture = includeFuture ?? state.progress.preferences.allowFuture;
  let topics = getRecommendationModules().flatMap((module) => module.topics.filter((topic) => topicMatchesSearch(topic)));
  if (!useFuture) topics = topics.filter(isCoreTeachingTopic);
  if (useCoveredOnly) {
    const covered = hasExplicitCoveredTopics()
      ? topics.filter((topic) => getTopicState(topic.id).coveredInClass)
      : topics.filter(isTopicCoveredByUser);
    if (covered.length) topics = covered;
  }
  return topics;
}

function topicMatchesSearch(topic) {
  const query = searchInput.value.trim().toLowerCase();
  if (!query) return true;
  const haystack = [topic.name, topic.section, ...topic.quizzes.map((quiz) => quiz.title), ...topic.videos.map((video) => video.title), ...topic.articleLessons.map((lesson) => lesson.title)].join(" ").toLowerCase();
  return haystack.includes(query);
}

function getTopicState(topicId) {
  state.progress.topics[topicId] ??= {
    checks: { summary: false, videos: false, quizzes: false, articles: false, confidence: false },
    coveredInClass: false,
    touches: { json: false, summary: false, videos: false, articles: false, quizzes: false, notes: false, exam: false },
    quizScores: [],
  };
  state.progress.topics[topicId].coveredInClass ??= false;
  return state.progress.topics[topicId];
}

function isTopicCoveredByUser(topic) {
  const topicState = getTopicState(topic.id);
  if (topicState.coveredInClass) return true;
  const touched = Object.values(topicState.touches || {}).some(Boolean);
  const checked = Object.values(topicState.checks || {}).some(Boolean);
  const quizAttempted = topic.quizzes.some((quiz) => (getQuizProgress(quiz.jsonPath).attempts || 0) > 0);
  return touched || checked || getTopicNotesLength(topic.id) > 0 || quizAttempted || getTopicProgress(topic).score > 0;
}

function hasExplicitCoveredTopics() {
  return Object.values(state.progress.topics || {}).some((topicState) => !!topicState?.coveredInClass);
}

function updateTopicCheck(topicId, key, value) {
  getTopicState(topicId).checks[key] = value;
  saveProgress();
}

function setTopicCompletion(topic, completed) {
  const topicState = getTopicState(topic.id);
  topicState.checks.summary = completed && !!topic.summaryHtmlPath;
  topicState.checks.videos = completed && topic.videos.length > 0;
  topicState.checks.quizzes = completed && topic.quizzes.length > 0;
  topicState.checks.articles = completed && topic.articleLessons.length > 0;
  topicState.checks.confidence = completed;
  saveProgress();
}

function markTopicTouch(topicId, key) {
  if (!topicId) return;
  getTopicState(topicId).touches[key] = true;
  saveProgress();
}

function getTopicNotesLength(topicId) {
  let total = 0;
  for (const [key, value] of Object.entries(state.progress.notes)) {
    if (key.startsWith(`topic:${topicId}:`)) total += value.length;
  }
  return total;
}

function getTopicProgress(topic) {
  const topicState = getTopicState(topic.id);
  const checks = [];
  if (topic.summaryHtmlPath) checks.push(topicState.checks.summary || topicState.touches.summary);
  if (topic.videos.length) checks.push(topicState.checks.videos || topicState.touches.videos);
  if (topic.quizzes.length) checks.push(topicState.checks.quizzes || topicState.touches.quizzes || topic.quizzes.every((quiz) => getQuizProgress(quiz.jsonPath).completed));
  if (topic.articleLessons.length) checks.push(topicState.checks.articles || topicState.touches.articles);
  checks.push(topicState.checks.confidence);
  const total = checks.length;
  const done = checks.filter(Boolean).length;
  const checkScore = total ? done / total : 0;
  const quizBoost = topicState.quizScores.length ? average(topicState.quizScores.slice(-3)) / 100 : 0;
  const noteBoost = Math.min(0.15, getTopicNotesLength(topic.id) / 1200);
  const score = Math.round(Math.min(1, checkScore * 0.65 + quizBoost * 0.25 + noteBoost) * 100);
  return { completed: total > 0 && done === total, score, done, total, quizBoost, noteBoost };
}

function getModuleProgress(module) {
  const visibleTopics = module.topics.filter((topic) => topicMatchesSearch(topic));
  const progress = visibleTopics.map(getTopicProgress);
  const completed = progress.filter((item) => item.completed).length;
  const total = progress.length;
  const score = total ? Math.round(average(progress.map((item) => item.score))) : 0;
  return { completed, total, score };
}

function getQuizProgress(quizPath) {
  state.progress.quizzes[quizPath] ??= { attempts: 0, bestScore: 0, completed: false, lastScore: 0, answers: {} };
  return state.progress.quizzes[quizPath];
}

function seedFlashcards() {
  for (const module of state.catalog.modules) {
    for (const group of module.definitions) {
      for (const item of group.items) {
        state.progress.flashcards[item.id] ??= {
          prompt: item.prompt,
          answer: item.answer,
          isQuestion: item.isQuestion,
          moduleId: module.id,
          moduleTitle: module.title,
          groupId: group.id,
          groupTitle: group.title,
          dueAt: null,
          intervalDays: 0,
          ease: 2.5,
          reps: 0,
          lapses: 0,
          lastReviewedAt: null,
          history: [],
        };
      }
    }
  }
  saveProgress();
}

function getAllFlashcards() {
  return Object.entries(state.progress.flashcards).map(([id, card]) => ({ id, ...card }));
}

function getDueFlashcards() {
  const now = Date.now();
  return getAllFlashcards()
    .filter((card) => (card.history || []).length > 0 && Date.parse(card.dueAt || 0) <= now)
    .sort((a, b) => Date.parse(a.dueAt || 0) - Date.parse(b.dueAt || 0));
}

function getNewFlashcards() {
  return getAllFlashcards().filter((card) => !(card.history || []).length);
}

function getWeakTopics() {
  return getRecommendationTopics()
    .map((topic) => {
      const progress = getTopicProgress(topic);
      const topicState = getTopicState(topic.id);
      const quizAvg = topicState.quizScores.length ? average(topicState.quizScores.slice(-3)) : null;
      const weakness = Math.round((100 - progress.score) + (quizAvg == null ? 0 : Math.max(0, 75 - quizAvg)));
      return { ...topic, progress, quizAvg, weakness, revisionPriority: getTopicRevisionPriority(topic), teachingOrder: getTopicTeachingOrder(topic) };
    })
    .filter((topic) => topic.progress.score < 75 || (topic.quizAvg != null && topic.quizAvg < 70))
    .sort((a, b) => {
      const aScore = b.weakness + b.revisionPriority;
      const bScore = a.weakness + a.revisionPriority;
      if (aScore !== bScore) return aScore - bScore;
      return a.teachingOrder - b.teachingOrder;
    });
}

function getTopicRevisionPriority(topic) {
  const sourceText = `${topic.name} ${topic.section}`.toLowerCase();
  const optionalPenalty = sourceText.includes("optional") || sourceText.includes("successful learning") ? 28 : 0;
  let priority = 0;
  if (topic.summaryHtmlPath) priority += 18;
  if (topic.articleLessons.length) priority += 12;
  if (topic.quizzes.length) priority += 20;
  if (topic.videos.length) priority += Math.min(10, topic.videos.length);
  if (getTopicNotesLength(topic.id)) priority += 8;
  return priority - optionalPenalty;
}

function getTopicTeachingOrder(topic) {
  const moduleOrder = Number(findModuleByTopicId(topic.id)?.id || 0);
  const sectionOrder = Number(String(topic.sectionFolder || "").match(/^(\d+)/)?.[1] || 999);
  const subsectionOrder = Number(topic.subsectionNumber || String(topic.path || "").match(/\\(\d+)\s*-/)?.[1] || 999);
  const source = `${topic.name} ${topic.section}`.toLowerCase();
  const optionalPenalty = source.includes("optional") ? 500 : 0;
  const metaPenalty = source.includes("successful learning") || source.includes("exam technique") ? 100000 : 0;
  return moduleOrder * 10000 + sectionOrder * 100 + subsectionOrder + optionalPenalty + metaPenalty;
}

function getTeachingPathCandidate(module = null) {
  const sourceTopics = module
    ? module.topics.filter((topic) => getStageModuleIds().includes(module.id) && topicMatchesSearch(topic))
    : getRecommendationTopics({ coveredOnly: false });
  const orderedTopics = sourceTopics
    .slice()
    .sort((a, b) => getTopicTeachingOrder(a) - getTopicTeachingOrder(b));

  const topics = orderedTopics.filter((topic) => state.progress.preferences.allowFuture || isCoreTeachingTopic(topic));
  const pool = topics.length ? topics : orderedTopics;

  const firstUnsecured = pool.find((topic) => {
    const progress = getTopicProgress(topic);
    return progress.score < 85 && !progress.completed;
  });

  return firstUnsecured || pool.find((topic) => getTopicProgress(topic).score < 95) || null;
}

function isCoreTeachingTopic(topic) {
  const source = `${topic.name} ${topic.section}`.toLowerCase();
  return !source.includes("successful learning") && !source.includes("exam technique") && !source.includes("optional");
}

function getWorstQuizTopic() {
  const candidates = [];
  for (const topic of getRecommendationTopics()) {
    for (const quiz of topic.quizzes) {
      const progress = getQuizProgress(quiz.jsonPath);
      const best = progress.bestScore || 0;
      if (!progress.completed || best < 80) candidates.push({ topic, quiz, best });
    }
  }
  candidates.sort((a, b) => a.best - b.best);
  return candidates[0] || null;
}

function getPaperTarget() {
  const modules = getRecommendationModules();
  const ranked = modules.map((module) => ({ module, progress: getModuleProgress(module) })).sort((a, b) => a.progress.score - b.progress.score);
  for (const entry of ranked) {
    const paper = getPreferredPaperOrder(entry.module)[0];
    if (paper) return { module: entry.module, paper };
  }
  return null;
}

function startTodayPlan() {
  const plan = buildTodayPlan();
  if (!plan.length) return;
  plan[0].action();
}

function openModulePriority(module) {
  const nextTopic = getTeachingPathCandidate(module);
  if (nextTopic) openTopicStudy(nextTopic);
}

function getPreferredPaperOrder(module) {
  return module.examPapers
    .slice()
    .sort((a, b) => {
      const aHasData = a.questionCount > 0 ? 1 : 0;
      const bHasData = b.questionCount > 0 ? 1 : 0;
      if (aHasData !== bHasData) return bHasData - aHasData;
      return (b.questionCount || 0) - (a.questionCount || 0);
    });
}

async function openTopicStudy(topic) {
  const module = findModuleByTopicId(topic.id);
  if (module) openModuleView(module);
  const resources = getTopicStudyResources(topic);
  const first = resources[0];
  if (first) await first.open();
}

async function openDefinitionStudy(module, group) {
  await openStudyHtml({
    title: group.title,
    meta: `${module.title} | ${group.count} flashcards`,
    path: group.htmlPath || group.jsonPath,
    notesKey: `definitions:${group.id}`,
    topicId: null,
    trackKey: null,
    reopenRef: {
      type: "html",
      title: group.title,
      meta: `${module.title} | ${group.count} flashcards`,
      path: group.htmlPath || group.jsonPath,
      notesKey: `definitions:${group.id}`,
      topicId: null,
      trackKey: null,
    },
    extraActions: [{ label: "Drill this group", action: () => startFlashcardSession("group", group.id) }],
  });
}

function getTopicStudyResources(topic) {
  const resources = [];

  if (topic.summaryHtmlPath) {
    resources.push({
      id: "summary",
      label: "Summary",
      open: () =>
        openStudyHtml({
          title: topic.name,
          meta: `${topic.section} | Summary`,
          path: topic.summaryHtmlPath,
          notesKey: `topic:${topic.id}:summary`,
          topicId: topic.id,
          trackKey: "summary",
          reopenRef: {
            type: "html",
            title: topic.name,
            meta: `${topic.section} | Summary`,
            path: topic.summaryHtmlPath,
            notesKey: `topic:${topic.id}:summary`,
            topicId: topic.id,
            trackKey: "summary",
          },
          extraActions: buildTopicStudyActions(topic, "summary"),
        }),
    });
  }

  topic.articleLessons.forEach((article, index) => {
    const resourceId = `article:${index}`;
    resources.push({
      id: resourceId,
      label: `Article ${index + 1}`,
      open: () =>
        openStudyHtml({
          title: article.title,
          meta: `${topic.name} | Article lesson`,
          path: article.htmlPath || article.jsonPath,
          notesKey: `topic:${topic.id}:article:${article.title}`,
          topicId: topic.id,
          trackKey: "articles",
          reopenRef: {
            type: "html",
            title: article.title,
            meta: `${topic.name} | Article lesson`,
            path: article.htmlPath || article.jsonPath,
            notesKey: `topic:${topic.id}:article:${article.title}`,
            topicId: topic.id,
            trackKey: "articles",
          },
          extraActions: buildTopicStudyActions(topic, resourceId),
        }),
    });
  });

  topic.videos.forEach((video, index) => {
    const resourceId = `video:${index}`;
    resources.push({
      id: resourceId,
      label: getVideoLabel(video, index),
      open: () => openVideoStudy(topic, video, buildTopicStudyActions(topic, resourceId)),
    });
  });

  topic.quizzes.forEach((quiz, index) => {
    const resourceId = `quiz:${index}`;
    const quizLabel = getQuizMetricLabel(topic, quiz, index);
    resources.push({
      id: resourceId,
      label: `${quizLabel} notes`,
      practiceLabel: quizLabel,
      practice: () => openQuiz(topic, quiz),
      open: () => openQuizStudyNotes(topic, quiz, buildTopicStudyActions(topic, resourceId)),
    });
  });

  return resources;
}

function buildTopicStudyActions(topic, currentId) {
  const actions = [];
  for (const resource of getTopicStudyResources(topic)) {
    if (resource.practice && resource.practiceLabel) {
      actions.push({
        label: `Practice: ${resource.practiceLabel}`,
        action: () => resource.practice(),
      });
    }
    actions.push({
      label: resource.id === currentId ? `Viewing: ${resource.label}` : resource.label,
      action: () => resource.open(),
    });
  }
  return actions;
}

async function openVideoStudy(topic, video, extraActions = []) {
  const module = findModuleByTopicId(topic.id);
  if (module) openModuleView(module);
  markTopicTouch(topic.id, "videos");
  const content = document.createElement("div");
  content.className = "study-view study-video";
  const { previousVideo, nextVideo } = getAdjacentTopicVideos(topic, video);
  const openNextVideo = () => {
    if (nextVideo) openVideoStudy(topic, nextVideo, buildTopicStudyActions(topic, `video:${getTopicVideoIndex(topic, nextVideo)}`));
  };
  const openPreviousVideo = () => {
    if (previousVideo) openVideoStudy(topic, previousVideo, buildTopicStudyActions(topic, `video:${getTopicVideoIndex(topic, previousVideo)}`));
  };
  if (video.videoPath) {
    const playerShell = document.createElement("div");
    playerShell.className = "study-video-player";
    const player = document.createElement("video");
    player.src = archiveUrl(video.videoPath);
    player.controls = true;
    player.preload = "metadata";
    player.setAttribute("playsinline", "true");
    player.setAttribute("aria-label", `${getVideoLabel(video)} video player`);
    player.addEventListener("play", () => markTopicTouch(topic.id, "videos"));
    player.addEventListener("error", async () => {
      if (video.wistiaPath) {
        try {
          const wistiaData = await fetchJson(video.wistiaPath);
          if (wistiaData && wistiaData.media && wistiaData.media.hashedId) {
            const hashedId = wistiaData.media.hashedId;
            const iframe = document.createElement("iframe");
            iframe.src = `https://fast.wistia.net/embed/iframe/${hashedId}?videoFoam=true`;
            iframe.allowTransparency = "true";
            iframe.frameBorder = "0";
            iframe.scrolling = "no";
            iframe.className = "wistia_embed";
            iframe.name = "wistia_embed";
            iframe.allowFullscreen = true;
            iframe.style.width = "100%";
            iframe.style.height = "100%";
            iframe.style.minHeight = "400px";
            iframe.style.borderRadius = "18px";

            const script = document.createElement("script");
            script.src = "https://fast.wistia.net/assets/external/E-v1.js";
            script.async = true;

            const container = document.createElement("div");
            container.append(iframe, script);
            playerShell.replaceChildren(container);
            return;
          }
        } catch (e) {
          console.error("Wistia fallback failed", e);
        }
      }

      const fallback = document.createElement("div");
      fallback.className = "empty-state";
      fallback.style.background = "var(--surface-alt)";
      fallback.style.color = "var(--ink-soft)";
      fallback.style.padding = "40px";
      fallback.style.textAlign = "center";
      fallback.style.border = "1px solid var(--line)";
      fallback.style.borderRadius = "18px";
      fallback.innerHTML = `<h4>Video Unavailable</h4><p style="margin-top:8px">The video file couldn't be loaded. It is likely not included in this offline archive export.</p>`;
      playerShell.replaceChildren(fallback);
    });
    const commandBar = buildVideoCommandBar(player, { nextVideo, onPlayNext: openNextVideo });
    if (previousVideo) {
      commandBar.querySelector(".video-command-group")?.prepend(buttonPill("Previous Video", openPreviousVideo));
    }
    playerShell.append(player);
    content.append(playerShell, commandBar);
  }
  if (video.htmlPath) {
    const html = await fetchStudyHtml(video.htmlPath);
    const notes = document.createElement("div");
    notes.className = "study-html";
    notes.innerHTML = html;
    content.append(notes);
  }
  setStudySession({
    kind: "video",
    title: video.title,
    meta: `${topic.name} | ${video.kind}`,
    notesKey: `topic:${topic.id}:video:${video.videoPath || video.htmlPath || video.title}`,
    topicId: topic.id,
    reopenRef: {
      type: "video",
      topicId: topic.id,
      videoPath: video.videoPath || null,
      htmlPath: video.htmlPath || null,
    },
    actions: [
      previousVideo ? { label: `Previous: ${getVideoLabel(previousVideo)}`, action: openPreviousVideo } : null,
      nextVideo ? { label: `Play next: ${getVideoLabel(nextVideo)}`, action: openNextVideo } : null,
      ...extraActions,
      { label: "Open raw video", href: archiveUrl(video.videoPath) },
      video.htmlPath ? { label: "Open raw notes", href: archiveUrl(video.htmlPath) } : null,
    ].filter((item) => item && (item.href || item.action)),
    content,
  });
}

async function openQuizStudyNotes(topic, quiz, extraActions = []) {
  const module = findModuleByTopicId(topic.id);
  if (module) openModuleView(module);
  markTopicTouch(topic.id, "quizzes");
  const quizData = await fetchJson(quiz.jsonPath);
  const content = renderQuizStudyNotes(topic, quiz, quizData);
  setStudySession({
    kind: "html",
    title: getQuizLabel(topic, quiz),
    meta: `${topic.name} | Quiz notes and explanation`,
    notesKey: `topic:${topic.id}:quiznotes:${quiz.jsonPath}`,
    topicId: topic.id,
    reopenRef: {
      type: "html",
      title: getQuizLabel(topic, quiz),
      meta: `${topic.name} | Quiz notes and explanation`,
      path: quiz.htmlPath || quiz.jsonPath,
      notesKey: `topic:${topic.id}:quiznotes:${quiz.jsonPath}`,
      topicId: topic.id,
      trackKey: "quizzes",
    },
    actions: [
      { label: "Practice this quiz", action: () => openQuiz(topic, quiz) },
      ...extraActions,
      { label: "Open raw", href: archiveUrl(quiz.htmlPath || quiz.jsonPath) },
    ],
    content,
  });
}

async function openStudyHtml({ title, meta, path, notesKey, topicId, trackKey, reopenRef = null, extraActions = [] }) {
  if (topicId) {
    const module = findModuleByTopicId(topicId);
    if (module) openModuleView(module);
  }
  if (topicId && trackKey) markTopicTouch(topicId, trackKey);
  let html;
  if ((path || "").endsWith(".html")) html = await fetchStudyHtml(path);
  else html = `<pre>${escapeHtml(JSON.stringify(await fetchJson(path), null, 2))}</pre>`;
  const content = document.createElement("div");
  content.className = "study-view";
  const body = document.createElement("div");
  body.className = "study-html";
  body.innerHTML = html;
  content.append(body);
  setStudySession({
    kind: "html",
    title,
    meta,
    notesKey,
    topicId,
    reopenRef,
    actions: [...extraActions, { label: "Open raw", href: archiveUrl(path) }],
    content,
  });
}

async function openExamPaperStudy(module, paper) {
  const paperData = await fetchJson(paper.jsonPath);
  const paperState = getExamPaperState(paper.jsonPath, paperData);
  const content = document.createElement("div");
  content.className = "study-view";

  if (!(paperData.questions || []).length) {
    const empty = document.createElement("section");
    empty.className = "paper-question";
    empty.innerHTML = `
      <p class="eyebrow">Paper mode</p>
      <h4>${escapeHtml(paper.title)}</h4>
      <p>This paper does not include structured question data in the export, so use the raw paper view and write notes beside it here.</p>
    `;
    content.append(empty);
    if (paper.htmlPath) {
      const rawHtml = await fetchStudyHtml(paper.htmlPath);
      const rawView = document.createElement("div");
      rawView.className = "study-html";
      rawView.innerHTML = rawHtml;
      content.append(rawView);
    }
  }

  for (const [index, question] of (paperData.questions || []).entries()) {
    const box = document.createElement("article");
    box.className = "paper-question";
    box.innerHTML = `<p class="eyebrow">Question ${index + 1}</p><h4>${escapeHtml(question.name || `Question ${index + 1}`)}</h4><div class="study-html">${question.content || ""}</div>`;

    for (const [partIndex, part] of (question.parts || []).entries()) {
      const partBox = document.createElement("section");
      partBox.className = "paper-question";
      const answers = (part.answers || []).map((answer) => {
        const markPoints = (answer.markPoints || [])
          .map((point) => `<li>${escapeHtml(point.text || "")} <span class="metric">${point.marksAvailable || 0} marks</span></li>`)
          .join("");
        return `
          <details class="quiz-hint">
            <summary>${escapeHtml(answer.title || "Mark scheme")}</summary>
            ${answer.explanation ? `<div class="study-html">${answer.explanation}</div>` : ""}
            ${markPoints ? `<ul>${markPoints}</ul>` : "<p>No bullet points saved for this answer.</p>"}
          </details>
        `;
      }).join("");
      partBox.innerHTML = `
        <p class="eyebrow">${escapeHtml(part.label || `Part ${partIndex + 1}`)}</p>
        <div class="study-html">${part.content || ""}</div>
        <div class="study-sidebar-meta">
          <span class="metric">${part.marksAvailable || 0} marks</span>
          <span class="metric">${escapeHtml((part.answerType || "Answer").replaceAll("_", " ").toLowerCase())}</span>
        </div>
        ${answers || ""}
      `;
      box.append(partBox);
    }

    const row = document.createElement("div");
    row.className = "paper-mark-row";
    const done = document.createElement("label");
    done.className = "check-chip";
    const doneInput = document.createElement("input");
    doneInput.type = "checkbox";
    doneInput.checked = !!paperState.checklist[question.id];
    doneInput.addEventListener("change", () => {
      paperState.checklist[question.id] = doneInput.checked;
      saveProgress();
      renderPaperSidebar(paper, paperData, paperState);
      renderProgressSummary();
    });
    done.append(doneInput, Object.assign(document.createElement("span"), { textContent: "Attempted" }));
    const markInput = document.createElement("input");
    markInput.type = "number";
    markInput.min = "0";
    markInput.max = String(question.marksAvailable || 0);
    markInput.value = paperState.marks[question.id] ?? "";
    markInput.placeholder = `/${question.marksAvailable || 0}`;
    markInput.addEventListener("input", () => {
      const value = markInput.value === "" ? "" : Number(markInput.value);
      paperState.marks[question.id] = value;
      saveProgress();
      renderPaperSidebar(paper, paperData, paperState);
    });
    row.append(done, markInput, metric(`${question.marksAvailable || 0} marks available`));
    box.append(row);
    content.append(box);
  }

  setStudySession({
    kind: "paper",
    title: paper.title,
    meta: `${module.title} | exam paper mode`,
    notesKey: `paper:${paper.jsonPath}`,
    topicId: null,
    paperKey: paper.jsonPath,
    reopenRef: { type: "paper", paperJsonPath: paper.jsonPath },
    actions: [{ label: "Open raw paper", href: archiveUrl(paper.htmlPath || paper.jsonPath) }],
    content,
  });
  renderPaperSidebar(paper, paperData, paperState);
}

function clearStudyWorkspace() {
  state.studySession = null;
  const eyebrow = studyTitle.previousElementSibling;
  if (eyebrow && eyebrow.classList.contains("eyebrow")) {
    eyebrow.textContent = "Study Workspace";
  }
  studyTitle.textContent = "Choose a topic, quiz, video, or paper";
  studyMeta.textContent = "This is where you should spend most of your revision time.";
  studyActions.innerHTML = "";
  studyContent.innerHTML = `<div class="empty-state">Open a Today step, a topic study action, a quiz, or an exam paper to load it here.</div>`;
  notesTitle.textContent = "No resource selected";
  notesMeta.textContent = "Notes save automatically and count toward your revision tracking.";
  studyNotes.value = "";
  notesSavedState.textContent = "Not saved yet";
  notesCount.textContent = "0 chars";
  specTitle.textContent = "No resource selected";
  specMeta.textContent = "Open a topic, video, quiz, or paper to see the theme focus and exam guidance.";
  specTags.innerHTML = "";
  specChecklist.innerHTML = "";
  notePrompt.textContent = "";
  renderPaperSidebar();
}

function setStudySession(session) {
  state.studySession = session;
  const eyebrow = studyTitle.previousElementSibling;
  if (eyebrow && eyebrow.classList.contains("eyebrow")) {
    if (session.topicId) {
      const topic = findTopicById(session.topicId);
      const module = topic ? findModuleByTopicId(session.topicId) : null;
      if (module && topic) {
        eyebrow.innerHTML = `
          <nav class="breadcrumb-nav">
            <a href="#module/${encodeURIComponent(module.id)}" class="breadcrumb-link">${escapeHtml(module.title)}</a>
            <span class="breadcrumb-separator">/</span>
            <span class="breadcrumb-text" style="color: var(--ink-soft);">${escapeHtml(topic.section)}</span>
            <span class="breadcrumb-separator">/</span>
            <span class="breadcrumb-text" style="color: var(--ink); font-weight: 700;">${escapeHtml(topic.name)}</span>
          </nav>
        `;
      } else {
        eyebrow.textContent = "Study Workspace";
      }
    } else {
      eyebrow.textContent = "Study Workspace";
    }
  }
  studyTitle.textContent = session.title;
  studyMeta.textContent = session.meta;
  renderStudyActions(session.actions || []);
  studyContent.innerHTML = "";
  studyContent.append(session.content);
  bindNotesToSession(session);
  renderSpecFocus(session);
  renderPaperSidebar();
  if (session.reopenRef) {
    state.progress.lastStudy = {
      ...session.reopenRef,
      title: session.title,
      meta: session.meta,
      savedAt: new Date().toISOString(),
    };
    saveProgress();
    updateResumeStudyButton();
  }
  scrollStudyWorkspaceIntoView();
}

function renderStudyActions(actions) {
  studyActions.innerHTML = "";
  const board = document.createElement("div");
  board.className = "study-action-board";

  const buckets = [
    { key: "current", title: "Current", items: [] },
    { key: "switch", title: "Switch resource", items: [] },
    { key: "practice", title: "Practice", items: [] },
    { key: "tools", title: "Utilities", items: [] },
  ];

  const bucketFor = (label) => {
    if (/^Viewing:/i.test(label)) return "current";
    if (/^Practice:/i.test(label) || /^Retry/i.test(label)) return "practice";
    if (/^Open raw/i.test(label) || /^Close workspace$/i.test(label) || /^Previous:/i.test(label) || /^Play next:/i.test(label)) return "tools";
    return "switch";
  };

  for (const action of actions) {
    const key = bucketFor(action.label || "");
    buckets.find((bucket) => bucket.key === key)?.items.push(action);
  }
  buckets.find((bucket) => bucket.key === "tools")?.items.push({ label: "Close workspace", action: clearStudyWorkspace });

  for (const bucket of buckets) {
    if (!bucket.items.length) continue;
    const section = document.createElement("section");
    section.className = `study-action-group study-action-group-${bucket.key}`;
    const title = document.createElement("p");
    title.className = "study-action-group-title";
    title.textContent = bucket.title;
    const grid = document.createElement("div");
    grid.className = "study-action-grid";
    for (const action of bucket.items) {
      grid.append(makeStudyActionChip(action, bucket.key));
    }
    section.append(title, grid);
    board.append(section);
  }

  studyActions.append(board);
}

function makeStudyActionChip(action, bucketKey) {
  const node = action.href ? linkPill(action.href, action.label) : buttonPill(action.label, action.action);
  node.classList.add("study-action-chip");
  if (bucketKey === "current") node.classList.add("is-current");
  if (bucketKey === "practice") node.classList.add("is-practice");
  if (bucketKey === "tools") node.classList.add("is-tool");
  return node;
}

function scrollStudyWorkspaceIntoView() {
  if (!studyPanelRoot) return;
  const top = studyPanelRoot.getBoundingClientRect().top;
  if (top < 90 || top > window.innerHeight * 0.45) {
    studyPanelRoot.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function bindNotesToSession(session) {
  notesTitle.textContent = session.title;
  notesMeta.textContent = session.meta;
  studyNotes.disabled = false;
  studyNotes.value = state.progress.notes[session.notesKey] || "";
  notesSavedState.textContent = state.progress.notes[session.notesKey] ? "Saved" : "No notes yet";
  notesCount.textContent = `${studyNotes.value.length} chars`;
  studyNotes.placeholder = buildNoteScaffold(session).split("\n").slice(0, 6).join("\n");
}

function saveStudyNotes() {
  const session = state.studySession;
  if (!session?.notesKey) return;
  state.progress.notes[session.notesKey] = studyNotes.value;
  state.progress.noteIndex[session.notesKey] = {
    notesKey: session.notesKey,
    title: session.title,
    meta: session.meta,
    reopenRef: session.reopenRef || null,
    updatedAt: new Date().toISOString(),
  };
  notesSavedState.textContent = "Saved";
  notesCount.textContent = `${studyNotes.value.length} chars`;
  if (session.topicId) markTopicTouch(session.topicId, "notes");
  saveProgress();
  renderRecentNotes();
  if (session.topicId) renderProgressSummary();
}

function reopenStudyResource(ref) {
  if (!ref) return;
  if (ref.type === "html") {
    openStudyHtml({ ...ref, extraActions: [] });
    return;
  }
  if (ref.type === "video") {
    const topic = findTopicById(ref.topicId);
    const video = topic?.videos.find((item) => (item.videoPath || null) === ref.videoPath && (item.htmlPath || null) === ref.htmlPath);
    if (topic && video) openVideoStudy(topic, video, []);
    return;
  }
  if (ref.type === "paper") {
    const hit = findPaperByJsonPath(ref.paperJsonPath);
    if (hit) openExamPaperStudy(hit.module, hit.paper);
  }
}

function renderSpecFocus(session) {
  const module = getSessionModule(session);
  const blueprint = module ? SPEC_BLUEPRINT[module.id] : null;
  specTags.innerHTML = "";
  specChecklist.innerHTML = "";

  if (!blueprint) {
    specTitle.textContent = "No spec focus available";
    specMeta.textContent = "Open a mapped Edexcel Economics resource to see theme and paper guidance.";
    notePrompt.textContent = "";
    return;
  }

  specTitle.textContent = blueprint.theme;
  specMeta.textContent = `${module.title} | ${blueprint.papers.join(" & ")} | ${getSessionAoFocus(session)}`;
  for (const paper of blueprint.papers) specTags.append(metric(paper));
  for (const item of blueprint.revision) specTags.append(metric(item));

  for (const line of getSessionChecklist(session, blueprint)) {
    specChecklist.append(emptyCard(line));
  }
  notePrompt.textContent = getSessionPrompt(session, blueprint);
}

function getSessionModule(session) {
  if (session.paperKey) return findPaperByJsonPath(session.paperKey)?.module || null;
  if (session.topicId) return findModuleByTopicId(session.topicId);
  return null;
}

function findModuleById(moduleId) {
  return state.catalog.modules.find((module) => module.id === moduleId) || null;
}

function findModuleByTopicId(topicId) {
  for (const module of state.catalog.modules) {
    if (module.topics.some((topic) => topic.id === topicId)) return module;
  }
  return null;
}

function getSessionAoFocus(session) {
  if (session.kind === "paper") return "AO1 + AO2 + AO3 + AO4";
  if (session.kind === "video" || session.kind === "html") return "AO1 knowledge, AO2 application, AO3 analysis, AO4 evaluation";
  return "AO-focused revision";
}

function getSessionChecklist(session, blueprint) {
  if (session.kind === "paper") {
    return [
      "Identify the command word, the context, and the exact line of argument before writing.",
      "Keep diagrams precise and fully labelled when relevant.",
      "Self-mark AO1 knowledge, AO2 application, AO3 analysis, and AO4 evaluation separately.",
      PAPER_GUIDANCE[blueprint.papers[0]] || "Link every point back to the question and evaluate trade-offs.",
    ];
  }
  if (session.kind === "video") {
    return [
      "Write the key definition exactly enough to reproduce under pressure.",
      "Capture one diagram or model from the lesson and what shifts it.",
      "Add one real-world example or policy context.",
      "End with one evaluative trade-off or limitation.",
    ];
  }
  return [
    "Define the core concept in one exam-safe sentence.",
    "Reduce the resource into a 3 to 5 step chain of reasoning.",
    "Add one supporting example, data point, or contextual hook.",
    "Finish with a judgement, condition, or counter-argument.",
  ];
}

function getSessionPrompt(session, blueprint) {
  const paperGuide = blueprint.papers.map((paper) => PAPER_GUIDANCE[paper]).filter(Boolean)[0] || "Keep your notes exam-oriented.";
  if (session.kind === "paper") return `Use this paper note frame: command word, context, diagram/model, 3 analytical links, then a final judgement. ${paperGuide}`;
  if (session.kind === "video") return `Turn this lesson into exam notes: key definition, model or diagram, one application example, then one evaluation point. ${paperGuide}`;
  return `Summarise this resource into active recall notes: definition, chain of reasoning, context/example, and evaluation. ${paperGuide}`;
}

function buildNoteScaffold(session) {
  const module = getSessionModule(session);
  const blueprint = module ? SPEC_BLUEPRINT[module.id] : null;
  const prompt = blueprint ? getSessionPrompt(session, blueprint) : "Capture the main idea, example, and evaluation.";
  return [
    "Definition / core idea:",
    "Chain of reasoning:",
    "Diagram / model:",
    "Context or example:",
    "Evaluation / trade-off:",
    "",
    `Prompt: ${prompt}`,
  ].join("\n");
}

function insertNotePrompt() {
  const session = state.studySession;
  if (!session) return;
  const scaffold = buildNoteScaffold(session);
  studyNotes.value = studyNotes.value.trim() ? `${studyNotes.value}\n\n${scaffold}` : scaffold;
  saveStudyNotes();
  studyNotes.focus();
}

function getExamPaperState(key, paperData = null) {
  state.progress.examPapers[key] ??= {
    checklist: {},
    marks: {},
    elapsedSeconds: 0,
    timerStartedAt: null,
    title: paperData?.name || "",
    totalMarks: totalPaperMarks(paperData),
  };
  return state.progress.examPapers[key];
}

function renderPaperSidebar(paper = null, paperData = null, paperState = null) {
  const session = state.studySession;
  if (!session || session.kind !== "paper") {
    paperTitle.textContent = "No paper open";
    paperMeta.textContent = "Open an exam paper in study mode to time it and self-mark it.";
    paperChecklist.innerHTML = "<div class='empty-state'>Paper controls appear here when a paper is open.</div>";
    paperTimerDisplay.textContent = "00:00:00";
    paperScoreDisplay.textContent = "No score yet";
    setPaperButtonsDisabled(true);
    stopPaperTimerHandle();
    return;
  }

  const currentPaper = paper || findPaperByJsonPath(session.paperKey)?.paper;
  const currentPaperData = paperData || state.resourceCache.get(`json:${session.paperKey}`);
  const currentPaperState = paperState || getExamPaperState(session.paperKey, currentPaperData);
  if (!currentPaperData) return;

  paperTitle.textContent = currentPaper?.title || currentPaperData.name || "Exam paper";
  paperMeta.textContent = `${currentPaperData.questions?.length || 0} structured questions | self-mark as you go`;
  paperChecklist.innerHTML = "";
  for (const [index, question] of (currentPaperData.questions || []).entries()) {
    const attempted = !!currentPaperState.checklist[question.id];
    const score = currentPaperState.marks[question.id];
    paperChecklist.append(actionCard(question.name || `Question ${index + 1}`, `${attempted ? "attempted" : "not attempted"} | ${score === "" || score == null ? "unmarked" : `${score}/${question.marksAvailable || 0}`}`, []));
  }
  paperTimerDisplay.textContent = formatDuration(getPaperElapsedSeconds(session.paperKey));
  paperScoreDisplay.textContent = formatPaperScore(currentPaperData, currentPaperState);
  setPaperButtonsDisabled(false);
}

function setPaperButtonsDisabled(disabled) {
  startPaperTimerBtn.disabled = disabled;
  pausePaperTimerBtn.disabled = disabled;
  resetPaperTimerBtn.disabled = disabled;
}

function totalPaperMarks(paperData) {
  return (paperData?.questions || []).reduce((sum, question) => sum + (question.marksAvailable || 0), 0);
}

function getPaperElapsedSeconds(key) {
  const statePaper = getExamPaperState(key);
  if (!statePaper.timerStartedAt) return statePaper.elapsedSeconds || 0;
  return (statePaper.elapsedSeconds || 0) + Math.floor((Date.now() - Date.parse(statePaper.timerStartedAt)) / 1000);
}

function startPaperTimer() {
  const session = state.studySession;
  if (!session || session.kind !== "paper") return;
  const paperState = getExamPaperState(session.paperKey);
  if (!paperState.timerStartedAt) {
    paperState.timerStartedAt = new Date().toISOString();
    saveProgress();
  }
  stopPaperTimerHandle();
  state.paperTimerHandle = window.setInterval(() => {
    paperTimerDisplay.textContent = formatDuration(getPaperElapsedSeconds(session.paperKey));
  }, 1000);
}

function pausePaperTimer() {
  const session = state.studySession;
  if (!session || session.kind !== "paper") return;
  const paperState = getExamPaperState(session.paperKey);
  if (paperState.timerStartedAt) {
    paperState.elapsedSeconds = getPaperElapsedSeconds(session.paperKey);
    paperState.timerStartedAt = null;
    saveProgress();
  }
  stopPaperTimerHandle();
  renderPaperSidebar();
}

function resetPaperTimer() {
  const session = state.studySession;
  if (!session || session.kind !== "paper") return;
  const paperState = getExamPaperState(session.paperKey);
  paperState.elapsedSeconds = 0;
  paperState.timerStartedAt = null;
  saveProgress();
  stopPaperTimerHandle();
  renderPaperSidebar();
}

function stopPaperTimerHandle() {
  if (state.paperTimerHandle) {
    clearInterval(state.paperTimerHandle);
    state.paperTimerHandle = null;
  }
}

function formatPaperScore(paperData, paperState) {
  const total = totalPaperMarks(paperData);
  let earned = 0;
  for (const question of paperData.questions || []) {
    const value = paperState.marks[question.id];
    if (typeof value === "number") earned += value;
  }
  return total ? `${earned}/${total} marks` : "No score yet";
}

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds || 0));
  const h = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

async function fetchStudyHtml(path) {
  const key = `html:${path}`;
  if (state.resourceCache.has(key)) return state.resourceCache.get(key);
  const response = await fetch(archiveUrl(path));
  if (!response.ok) throw new Error(`Failed to load HTML resource: ${path}`);
  const text = await response.text();
  const body = extractBodyHtml(text);
  state.resourceCache.set(key, body);
  return body;
}

function renderQuizStudyNotes(topic, quiz, quizData) {
  const wrap = document.createElement("div");
  wrap.className = "study-view quiz-study-view";

  const intro = document.createElement("section");
  intro.className = "quiz-study-summary";
  const quizType = (quizData.quizType || "mixed").replaceAll("_", " ").toLowerCase();
  intro.innerHTML = `
    <p class="eyebrow">Quiz Review</p>
    <h4>${escapeHtml(getQuizLabel(topic, quiz))}</h4>
    <div class="study-sidebar-meta">
      <span class="metric">${escapeHtml(topic.section)}</span>
      <span class="metric">${(quizData.progressQuizQuestions || []).length} questions</span>
      <span class="metric">${escapeHtml(quizType)}</span>
    </div>
  `;
  wrap.append(intro);

  const questions = (quizData.progressQuizQuestions || []).filter(Boolean);
  if (!questions.length) {
    wrap.append(emptyCard("No quiz questions were available in the export for this quiz."));
    return wrap;
  }

  questions.forEach((entry, index) => {
    wrap.append(renderQuizStudyQuestion(entry, index));
  });
  return wrap;
}

function renderQuizStudyQuestion(entry, index) {
  const card = document.createElement("article");
  card.className = "quiz-study-card";

  const definition = entry.quizContent?.quizDefinition?.questions?.[0] || null;
  const rawPrompt = definition?.question || entry.question || definition?.description || `Question ${index + 1}`;
  const promptHtml = definition ? formatQuizPromptHtml({raw: definition}) : sanitizeRichText(rawPrompt);
  const marks = entry.quizContent?.marks || 0;

  const top = document.createElement("div");
  top.className = "quiz-study-card-head";
  top.innerHTML = `
    <div>
      <p class="eyebrow">Question ${index + 1}</p>
      <div class="study-html" style="font-size: 1.1rem; font-weight: 500;">${promptHtml}</div>
    </div>
    <span class="metric">${marks} mark${marks === 1 ? "" : "s"}</span>
  `;
  card.append(top);

  if (definition?.topImage) {
    const image = createQuizImage(definition.topImage, "", "quiz-media");
    card.append(image);
  }

  if (definition?.__typename === "MultipleChoiceQuestion") {
    const options = document.createElement("ol");
    options.className = "quiz-study-options";
    (definition.options || []).forEach((option, optionIndex) => {
      const item = document.createElement("li");
      item.className = `quiz-study-option${definition.correctOptionIndex === optionIndex ? " is-correct" : ""}`;
      item.innerHTML = `<strong>${escapeHtml(formatQuizText(option.text || "", quizChoiceLabel(optionIndex)))}</strong>`;
      if (option.image) item.append(createQuizImage(option.image, formatQuizText(option.text || "", quizChoiceLabel(optionIndex)), "quiz-option-image"));
      if (option.explanation) {
        const explanation = document.createElement("div");
        explanation.className = "quiz-study-explanation";
        explanation.innerHTML = sanitizeRichText(option.explanation);
        if (option.explanationImage) explanation.append(createQuizImage(option.explanationImage, "Option explanation", "quiz-explanation-image"));
        item.append(explanation);
      }
      options.append(item);
    });
    card.append(options);
  } else {
    const raw = document.createElement("div");
    raw.className = "study-html";
    let extraHtml = "";
    if (definition?.explanation?.text) {
      extraHtml = `<div class="quiz-study-explanation" style="margin-top: 1rem;"><strong>Explanation:</strong> ${sanitizeRichText(definition.explanation.text)}</div>`;
    } else if (definition?.modelAnswer) {
      extraHtml = `<div class="quiz-study-explanation" style="margin-top: 1rem;"><strong>Model Answer:</strong> ${sanitizeRichText(definition.modelAnswer)}</div>`;
    }
    raw.innerHTML = `<p class="metric" style="margin-bottom: 0.5rem; display: inline-block;">${escapeHtml(formatQuizTypeLabel(definition?.__typename || entry.questionType || "Question"))}</p>${extraHtml}`;
    card.append(raw);
  }

  return card;
}

function formatQuizTypeLabel(value) {
  return String(value)
    .replace(/^NO_TYPE_SPECIFIED$/i, "Question")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .trim();
}

async function fetchJson(path) {
  const key = `json:${path}`;
  if (state.resourceCache.has(key)) return state.resourceCache.get(key);
  const response = await fetch(archiveUrl(path));
  if (!response.ok) throw new Error(`Failed to load JSON resource: ${path}`);
  const data = await response.json();
  state.resourceCache.set(key, data);
  return data;
}

function extractBodyHtml(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  return doc.body?.innerHTML || html;
}

async function openQuiz(topic, quiz) {
  const module = findModuleByTopicId(topic.id);
  if (module) openModuleView(module);
  markTopicTouch(topic.id, "quizzes");
  const quizData = await fetchJson(quiz.jsonPath);
  const questions = (quizData.progressQuizQuestions || []).map(normalizeQuestion).filter(Boolean);
  state.quizSession = {
    topic,
    quiz,
    questions,
    index: 0,
    answers: { ...(getQuizProgress(quiz.jsonPath).answers || {}) },
    finished: false,
  };
  renderQuiz();
  quizDialog.showModal();
}

function normalizeQuestion(question) {
  const definition = question.quizContent?.quizDefinition;
  const actual = definition?.questions?.[0];
  if (!actual) return null;
  return {
    id: String(question.id),
    order: question.questionNumber,
    marks: question.quizContent?.marks ?? 1,
    stem: question.quizContent?.stem || "",
    explanation: definition?.explanation?.text || question.quizContent?.explanation || "",
    type: actual.__typename,
    raw: actual,
  };
}

function renderQuiz() {
  const session = state.quizSession;
  if (!session) return;
  quizTitle.textContent = getQuizLabel(session.topic, session.quiz);
  renderQuizStatus(session);

  if (session.finished) {
    const progress = getQuizProgress(session.quiz.jsonPath);
    const review = state.progress.quizReviews[session.quiz.jsonPath];
    const pending = review?.pendingSelfMarkCount || 0;
    quizMeta.textContent = pending
      ? `${session.topic.name} | Attempt complete - ${pending} self-mark item${pending === 1 ? "" : "s"} still pending`
      : `${session.topic.name} | Attempt complete`;
    const wrongTypes = Object.entries(review?.wrongByType || {}).map(([type, count]) => `${type}: ${count}`).join(" | ");
    const scoreLabel = pending ? `${progress.lastScore}% on auto/self-marked questions` : `${progress.lastScore}% this attempt`;
    const pendingText = pending ? `<p>${pending} long-answer response${pending === 1 ? "" : "s"} still need self-marking. Retry the quiz to review them.</p>` : "";
    quizQuestionMount.innerHTML = `<section class="quiz-question"><p class="eyebrow">Quiz complete</p><h4>${scoreLabel}</h4><p>${wrongTypes || "No wrong answers recorded."}</p>${pendingText}<div class="study-html">${(review?.wrongPrompts || []).slice(0, 5).map((item) => `<p><strong>${escapeHtml(item.type)}</strong>: ${escapeHtml(item.prompt)}</p>`).join("") || "<p>Clean run.</p>"}</div></section>`;
    prevQuizBtn.disabled = true;
    nextQuizBtn.textContent = "Retry quiz";
    return;
  }

  const current = session.questions[session.index];
  quizMeta.textContent = `${session.topic.name} | Question ${session.index + 1} of ${session.questions.length}`;
  quizQuestionMount.innerHTML = "";
  quizQuestionMount.append(renderQuizQuestion(current));
  syncQuizChrome();
}

function renderQuizQuestion(question) {
  const wrapper = document.createElement("section");
  wrapper.className = "quiz-question";
  wrapper.innerHTML = `
    <div class="quiz-question-head">
      <p class="eyebrow">Question ${question.order}</p>
      <span class="metric">${question.marks} mark${question.marks === 1 ? "" : "s"}</span>
    </div>
  `;
  const prompt = document.createElement("div");
  prompt.className = "quiz-prompt";
  prompt.innerHTML = formatQuizPromptHtml(question);
  wrapper.append(prompt);
  appendQuizMedia(wrapper, collectQuestionImages(question), "Question diagram", "quiz-media");
  const mount = document.createElement("div");
  mount.className = "quiz-inputs";
  const answerState = state.quizSession.answers[question.id];

  if (question.type === "MultipleChoiceQuestion") mount.append(renderMultipleChoice(question, answerState, false));
  else if (question.type === "MultiMultipleChoiceQuestion") mount.append(renderMultipleChoice(question, answerState, true));
  else if (question.type === "DropdownQuestion") mount.append(renderDropdown(question, answerState));
  else if (question.type === "TextQuestion") mount.append(renderTextQuestion(question, answerState));
  else if (question.type === "NumericalQuestion") mount.append(renderNumericQuestion(question, answerState));
  else if (question.type === "MultipleInputQuestion") mount.append(renderMultiInputQuestion(question, answerState));
  else if (question.type === "EngageQuestion" || question.type === "DrawQuestion") mount.append(renderLongQuestion(question, answerState));
  else if (question.type === "MathsQuestion" || question.type === "ChemistryQuestion") mount.append(renderShortInputQuestion(question, answerState));
  else mount.append(renderLongQuestion(question, answerState));

  wrapper.append(mount);
  if (question.explanation && hasQuizAnswerValue(answerState)) {
    const hint = document.createElement("details");
    hint.className = "quiz-hint";
    hint.innerHTML = `<summary>Why this answer?</summary><div>${sanitizeRichText(question.explanation)}</div>`;
    wrapper.append(hint);
  }
  return wrapper;
}

function readableQuestionTitle(question) {
  return stripHtml(formatQuizPromptHtml(question) || question.raw.description || question.type);
}

function renderMultipleChoice(question, answerState, multi) {
  const container = document.createElement("div");
  const options = question.raw.options || [];
  const selectedValues = multi ? new Set(answerState?.value || []) : answerState?.value;
  options.forEach((option, index) => {
    const label = document.createElement("label");
    label.className = buildOptionCardClass(question, answerState, index, multi);
    const input = document.createElement("input");
    input.type = multi ? "checkbox" : "radio";
    input.name = `quiz-${question.id}`;
    input.checked = multi ? selectedValues.has(index) : selectedValues === index;
    input.addEventListener("change", () => {
      if (multi) {
        const set = new Set(state.quizSession.answers[question.id]?.value || []);
        if (input.checked) set.add(index); else set.delete(index);
        saveQuizAnswer(question.id, [...set], gradeQuestion(question, [...set]));
      } else {
        saveQuizAnswer(question.id, index, gradeQuestion(question, index));
      }
      renderQuiz();
    });
    const text = document.createElement("div");
    text.className = "option-copy";
    text.innerHTML = `<strong>${escapeHtml(formatQuizText(option.text || "", quizChoiceLabel(index)))}</strong>`;
    if (option.image) text.append(createQuizImage(option.image, formatQuizText(option.text || "", quizChoiceLabel(index)), "quiz-option-image"));
    if (shouldShowOptionExplanation(question, answerState, index, multi)) {
      if (option.explanation) {
        const explanation = document.createElement("span");
        explanation.className = "quiz-option-explanation";
        explanation.innerHTML = sanitizeRichText(option.explanation);
        text.append(explanation);
      }
      if (option.explanationImage) text.append(createQuizImage(option.explanationImage, "Option explanation", "quiz-explanation-image"));
    }
    label.append(input, text);
    container.append(label);
  });
  return container;
}

function renderDropdown(question, answerState) {
  const wrap = document.createElement("div");
  const select = document.createElement("select");
  select.className = "quiz-select";
  select.append(new Option("Choose an answer", ""));
  (question.raw.dropdownOptions || []).forEach((option, index) => select.append(new Option(formatQuizText(option, `Option ${index + 1}`), String(index))));
  const badge = feedbackBadge(question, answerState);
  select.value = answerState?.value ?? "";
  select.addEventListener("change", () => {
    const value = select.value === "" ? "" : Number(select.value);
    saveQuizAnswer(question.id, value, gradeQuestion(question, value));
    replaceFeedbackBadge(wrap, question);
    syncQuizChrome();
  });
  wrap.append(select, badge);
  return wrap;
}

function renderTextQuestion(question, answerState) {
  const wrap = document.createElement("div");
  const input = document.createElement("textarea");
  input.className = "quiz-textarea";
  input.rows = 4;
  input.placeholder = "Type your answer";
  const badge = feedbackBadge(question, answerState);
  input.value = answerState?.value || "";
  input.addEventListener("input", () => {
    saveQuizAnswer(question.id, input.value, gradeQuestion(question, input.value));
    replaceFeedbackBadge(wrap, question);
    syncQuizChrome();
  });
  wrap.append(input, badge);
  return wrap;
}

function renderNumericQuestion(question, answerState) {
  const wrap = document.createElement("div");
  const input = document.createElement("input");
  input.className = "quiz-select";
  input.type = "number";
  input.step = "any";
  const badge = feedbackBadge(question, answerState);
  input.value = answerState?.value ?? "";
  input.placeholder = "Enter a number";
  input.addEventListener("input", () => {
    saveQuizAnswer(question.id, input.value, gradeQuestion(question, input.value));
    replaceFeedbackBadge(wrap, question);
    syncQuizChrome();
  });
  wrap.append(input, badge);
  return wrap;
}

function renderMultiInputQuestion(question, answerState) {
  const wrap = document.createElement("div");
  const badge = feedbackBadge(question, answerState);
  for (const segment of question.raw.questionSegments || []) {
    if (segment.__typename === "MultipleInputQuestionText") {
      const text = document.createElement("span");
      text.className = "inline-segment";
      text.textContent = formatQuizText(segment.text, "");
      wrap.append(text);
    } else if (segment.__typename === "MultipleInputQuestionBlank") {
      const input = document.createElement("input");
      input.className = "inline-input";
      input.type = "text";
      input.value = answerState?.value?.[segment.fieldIndex] || "";
      input.placeholder = `Blank ${segment.fieldIndex + 1}`;
      input.addEventListener("input", () => {
        const next = { ...(state.quizSession.answers[question.id]?.value || {}) };
        next[segment.fieldIndex] = input.value;
        saveQuizAnswer(question.id, next, gradeQuestion(question, next));
        replaceFeedbackBadge(wrap, question);
        syncQuizChrome();
      });
      wrap.append(input);
    }
  }
  wrap.append(badge);
  return wrap;
}

function renderLongQuestion(question, answerState) {
  const wrap = document.createElement("div");
  const textarea = document.createElement("textarea");
  textarea.className = "quiz-textarea";
  textarea.rows = 6;
  textarea.placeholder = "Write your answer";
  const badge = feedbackBadge(question, answerState);
  textarea.value = answerState?.value || "";
  textarea.addEventListener("input", () => {
    saveQuizAnswer(question.id, textarea.value, gradeQuestion(question, textarea.value));
    syncLongAnswerUi(wrap, question);
    replaceFeedbackBadge(wrap, question);
    syncQuizChrome();
  });
  wrap.append(textarea);
  if (question.raw.modelAnswer) {
    const model = document.createElement("details");
    model.className = "quiz-hint";
    model.innerHTML = `<summary>Model answer</summary><div>${sanitizeRichText(question.raw.modelAnswer)}</div>`;
    wrap.append(model);
  }
  if (hasQuizAnswerValue(answerState)) wrap.append(renderSelfMarkPanel(question, answerState));
  wrap.append(badge);
  return wrap;
}

function renderShortInputQuestion(question, answerState) {
  const wrap = document.createElement("div");
  const input = document.createElement("input");
  input.className = "quiz-select";
  input.type = "text";
  const badge = feedbackBadge(question, answerState);
  input.value = answerState?.value || "";
  input.placeholder = "Type your answer";
  input.addEventListener("input", () => {
    saveQuizAnswer(question.id, input.value, gradeQuestion(question, input.value));
    replaceFeedbackBadge(wrap, question);
    syncQuizChrome();
  });
  wrap.append(input, badge);
  return wrap;
}

function feedbackBadge(question, answerState) {
  const badge = document.createElement("div");
  badge.className = "feedback-badge";
  if (!hasQuizAnswerValue(answerState)) badge.textContent = "Answer this to unlock feedback";
  else if (answerState.correct === true) {
    badge.textContent = "Correct";
    badge.classList.add("is-correct");
  } else if (answerState.correct === false) {
    badge.textContent = "Incorrect";
    badge.classList.add("is-wrong");
  } else if (isSelfMarkQuestion(question)) {
    badge.textContent = question.raw.modelAnswer
      ? "Compare with the model answer, then self-mark"
      : "Self-mark this answer";
  } else {
    badge.textContent = "Saved";
  }
  return badge;
}

function saveQuizAnswer(questionId, value, correct, extras = {}) {
  const previous = state.quizSession.answers[questionId] || {};
  state.quizSession.answers[questionId] = { ...previous, value, correct, ...extras };
  getQuizProgress(state.quizSession.quiz.jsonPath).answers = state.quizSession.answers;
  saveProgress();
}

function moveQuiz(delta) {
  const session = state.quizSession;
  if (!session) return;
  if (session.finished) {
    session.finished = false;
    session.index = 0;
    renderQuiz();
    return;
  }
  if (delta > 0 && session.index === session.questions.length - 1) return finishQuiz();
  session.index = Math.max(0, Math.min(session.questions.length - 1, session.index + delta));
  renderQuiz();
}

function finishQuiz() {
  const session = state.quizSession;
  const graded = session.questions.map((question) => ({ question, correct: session.answers[question.id]?.correct })).filter((item) => typeof item.correct === "boolean");
  const correctCount = graded.filter((item) => item.correct).length;
  const score = session.questions.length ? Math.round((correctCount / session.questions.length) * 100) : 0;
  const pendingSelfMark = session.questions.filter((question) => needsSelfMark(question, session.answers[question.id]));
  const progress = getQuizProgress(session.quiz.jsonPath);
  progress.attempts += 1;
  progress.lastScore = score;
  progress.bestScore = Math.max(progress.bestScore, score);
  progress.completed = score === 100 || graded.length === session.questions.length;
  progress.answers = session.answers;

  const wrongItems = graded.filter((item) => !item.correct);
  const wrongByType = {};
  for (const item of wrongItems) wrongByType[item.question.type] = (wrongByType[item.question.type] || 0) + 1;
  state.progress.quizReviews[session.quiz.jsonPath] = {
    at: new Date().toISOString(),
    topicId: session.topic.id,
    quizPath: session.quiz.jsonPath,
    quizTitle: getQuizLabel(session.topic, session.quiz),
    score,
    pendingSelfMarkCount: pendingSelfMark.length,
    wrongByType,
    wrongPrompts: wrongItems.map((item) => ({ type: item.question.type, prompt: readableQuestionTitle(item.question) })).slice(0, 10),
  };

  const topicState = getTopicState(session.topic.id);
  topicState.quizScores.push(score);
  topicState.quizScores = topicState.quizScores.slice(-8);
  updateTopicCheck(session.topic.id, "quizzes", progress.completed || score >= 80);
  saveProgress();
  session.finished = true;
  renderQuiz();
  renderMistakeList();
  applyFilters();
}

function gradeQuestion(question, value) {
  if (value === "" || value == null) return null;
  if (question.type === "MultipleChoiceQuestion") return value === question.raw.correctOptionIndex;
  if (question.type === "MultiMultipleChoiceQuestion") {
    const selected = new Set(value || []);
    const correct = new Set((question.raw.options || []).map((opt, idx) => (opt.correct ? idx : null)).filter((x) => x != null));
    if (selected.size !== correct.size) return false;
    for (const item of correct) if (!selected.has(item)) return false;
    return true;
  }
  if (question.type === "DropdownQuestion") return Number(value) === question.raw.correctOptionIndex;
  if (question.type === "TextQuestion") {
    const normalized = normalizeLooseString(value);
    return (question.raw.requiredAnswers || []).some((answer) => (answer.possibleAnswers || []).some((candidate) => normalizeLooseString(candidate) === normalized));
  }
  if (question.type === "NumericalQuestion") {
    const num = Number(value);
    if (Number.isNaN(num)) return false;
    return (question.raw.possibleAnswers || []).some((answer) => {
      if (answer.__typename === "NumericalQuestionSingleAnswer") return Number(answer.answer) === num;
      if (answer.__typename === "NumericalQuestionRangedAnswer") {
        const range = answer.answer || {};
        return num >= Number(range.first) && num <= Number(range.last);
      }
      return false;
    });
  }
  if (question.type === "MultipleInputQuestion") {
    const submitted = value || {};
    return (question.raw.questionSegments || [])
      .filter((segment) => segment.__typename === "MultipleInputQuestionBlank")
      .every((blank) => (blank.possibleAnswers || []).some((candidate) => normalizeLooseString(candidate) === normalizeLooseString(submitted[blank.fieldIndex] || "")));
  }
  if (question.type === "MathsQuestion" || question.type === "ChemistryQuestion") {
    const evaluation = question.raw.evaluationMethod || {};
    const normalized = normalizeLooseString(value);
    if (evaluation.__typename === "ExactMatchEvaluation") return normalized === normalizeLooseString(evaluation.answer || "");
    if (evaluation.__typename === "PartialMatchesEvaluation") return (evaluation.answers || []).some((candidate) => normalizeLooseString(candidate) === normalized);
    return null;
  }
  if (question.type === "EngageQuestion" || question.type === "DrawQuestion") return value.trim().length > 0 ? null : false;
  return null;
}

function startFlashcardSession(mode, target = null) {
  let cards = [];
  if (mode === "due") cards = getDueFlashcards();
  else if (mode === "mixed") cards = shuffle(getAllFlashcards()).slice(0, 20);
  else if (mode === "single") cards = getAllFlashcards().filter((card) => card.id === target);
  else if (mode === "module") cards = shuffle(getAllFlashcards().filter((card) => card.moduleId === target)).slice(0, 20);
  else if (mode === "group") cards = shuffle(getAllFlashcards().filter((card) => card.groupId === target)).slice(0, 20);
  if (mode === "due" && !cards.length) cards = getNewFlashcards().slice(0, 12);

  if (!cards.length) {
    alert("No flashcards are available for that review mode yet.");
    return;
  }

  state.flashcardSession = { mode, cards, index: 0, revealed: false };
  renderFlashcard();
  flashcardDialog.showModal();
}

function renderFlashcard() {
  const session = state.flashcardSession;
  if (!session) return;
  const card = session.cards[session.index];
  flashcardTitle.textContent = card.moduleTitle;
  flashcardMeta.textContent = `${card.groupTitle} | Card ${session.index + 1} of ${session.cards.length}`;
  flashcardMount.innerHTML = "";
  const panel = document.createElement("section");
  panel.className = "flashcard-card";
  const dueDate = card.dueAt ? new Date(card.dueAt).toLocaleDateString() : "new";
  panel.innerHTML = `
    <p class="eyebrow">${card.isQuestion ? "Question" : "Recall"}</p>
    <h4>${escapeHtml(card.prompt)}</h4>
    <div class="flashcard-meta-row">
      <span class="metric">Due ${escapeHtml(dueDate)}</span>
      <span class="metric">Interval ${escapeHtml(String(card.intervalDays || 0))}d</span>
      <span class="metric">Ease ${Number(card.ease || 2.5).toFixed(2)}</span>
    </div>
  `;
  if (session.revealed) {
    const answer = document.createElement("div");
    answer.className = "flashcard-answer";
    answer.innerHTML = `<strong>Answer</strong><div>${card.answer || "<p>No answer captured.</p>"}</div>`;
    panel.append(answer);
  }
  flashcardMount.append(panel);
  revealFlashcardBtn.disabled = session.revealed;
  flashcardAgainBtn.disabled = !session.revealed;
  flashcardHardBtn.disabled = !session.revealed;
  flashcardGoodBtn.disabled = !session.revealed;
  flashcardEasyBtn.disabled = !session.revealed;
}

function revealFlashcard() {
  if (!state.flashcardSession) return;
  state.flashcardSession.revealed = true;
  renderFlashcard();
}

function rateFlashcard(quality) {
  const session = state.flashcardSession;
  if (!session) return;
  const cardId = session.cards[session.index].id;
  const updated = scheduleReview(state.progress.flashcards[cardId], quality);
  state.progress.flashcards[cardId] = updated;
  saveProgress();
  session.index += 1;
  session.revealed = false;
  if (session.index >= session.cards.length) {
    flashcardDialog.close();
    state.flashcardSession = null;
    applyFilters();
    return;
  }
  session.cards[session.index] = { id: session.cards[session.index].id, ...state.progress.flashcards[session.cards[session.index].id] };
  renderFlashcard();
  renderSmartDashboard();
}

function scheduleReview(card, quality) {
  const now = new Date();
  const next = { ...card };
  next.lastReviewedAt = now.toISOString();
  next.history = [...(next.history || []), { at: next.lastReviewedAt, quality }].slice(-20);
  if (quality < 3) {
    next.reps = 0;
    next.intervalDays = quality === 0 ? 0 : 1;
    next.ease = Math.max(1.3, (next.ease || 2.5) - 0.2);
    next.lapses = (next.lapses || 0) + 1;
  } else {
    next.reps = (next.reps || 0) + 1;
    const easeDelta = 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02);
    next.ease = Math.max(1.3, (next.ease || 2.5) + easeDelta);
    if (next.reps === 1) next.intervalDays = 1;
    else if (next.reps === 2) next.intervalDays = 3;
    else next.intervalDays = Math.max(1, Math.round((next.intervalDays || 1) * next.ease * (quality === 5 ? 1.35 : quality === 4 ? 1 : 0.65)));
  }
  if (quality === 5) next.intervalDays = Math.max(next.intervalDays, 5);
  next.dueAt = new Date(now.getTime() + next.intervalDays * DAY_MS).toISOString();
  return next;
}

function focusWeakTopics() {
  const weak = getWeakTopics()[0];
  if (!weak) return;
  openTopicStudy(weak);
  openTopicById(weak.id);
}

function openTopicById(topicId) {
  const element = document.querySelector(`[data-topic-id="${CSS.escape(topicId)}"]`);
  if (!element) return;
  element.open = true;
  element.scrollIntoView({ behavior: "smooth", block: "start" });
}

function findTopicById(topicId) {
  for (const module of state.catalog.modules) {
    for (const topic of module.topics) {
      if (topic.id === topicId) return topic;
    }
  }
  return null;
}

function findPaperByJsonPath(jsonPath) {
  for (const module of state.catalog.modules) {
    for (const paper of module.examPapers) {
      if (paper.jsonPath === jsonPath) return { module, paper };
    }
  }
  return null;
}

function exportProgress() {
  saveProgress();
  const blob = new Blob([JSON.stringify(state.progress, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "uplearn-econ-progress.json";
  link.click();
  URL.revokeObjectURL(url);
}

function importProgress(event) {
  const [file] = event.target.files || [];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      applyLoadedProgress(JSON.parse(String(reader.result)), { skipCloudSync: false });
    } catch {
      alert("That file could not be imported.");
    }
  };
  reader.readAsText(file);
  importProgressInput.value = "";
}

function resetProgress() {
  if (!confirm("Reset all stored checks, quiz scores, notes, paper tracking, and flashcard schedules for this site?")) return;
  applyLoadedProgress(createEmptyProgress(), { skipCloudSync: false });
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function shuffle(values) {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function normalizeLooseString(value) {
  return String(value).trim().toLowerCase().replace(/\s+/g, " ");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatQuizPromptHtml(question) {
  const parts = [
    normalizeQuizHtmlFragment(question.stem || ""),
    normalizeQuizHtmlFragment(question.raw.question || question.raw.description || ""),
  ].filter(Boolean);
  const uniqueParts = parts.filter((part, index) => parts.indexOf(part) === index);
  if (uniqueParts.length) return uniqueParts.join("");
  if (question.type === "MultipleInputQuestion") return "";
  return `<p>${escapeHtml(question.type)}</p>`;
}

function sanitizeRichText(value) {
  const repaired = repairMojibake(value ?? "");
  return repaired
    .replace(/\$\$\\newline\$\$/gi, "<br /><br />")
    .replace(/\$\$([\s\S]*?)\$\$/g, (_, inner) => {
      const normalized = normalizeMathishContent(inner);
      return normalized ? escapeHtml(normalized) : "";
    })
    .replace(/\\n/g, "<br />")
    .replace(/>\s+</g, "> <");
}

function stripHtml(value) {
  return String(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeQuizHtmlFragment(value) {
  const cleaned = sanitizeRichText(value || "")
    .replace(/(?:<br\s*\/?>\s*){3,}/gi, "<br /><br />")
    .trim();
  const textOnly = stripHtml(cleaned).trim();
  return textOnly ? cleaned : "";
}

function formatQuizText(value, fallback = "") {
  const normalized = stripHtml(sanitizeRichText(value || ""));
  return normalized || fallback;
}

function quizChoiceLabel(index) {
  return `Choice ${String.fromCharCode(65 + index)}`;
}

function createQuizImage(src, alt = "", className = "quiz-media") {
  const image = document.createElement("img");
  image.className = className;
  image.src = src;
  image.alt = alt;
  image.loading = "lazy";
  return image;
}

function appendQuizMedia(container, images, altBase, className) {
  images.forEach((src, index) => {
    container.append(createQuizImage(src, images.length > 1 ? `${altBase} ${index + 1}` : altBase, className));
  });
}

function collectQuestionImages(question) {
  return [...new Set([
    question.raw.topImage,
    question.raw.image,
  ].filter(Boolean))];
}

function hasQuizAnswerValue(answerState) {
  if (!answerState) return false;
  const { value } = answerState;
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.values(value).some((entry) => String(entry || "").trim() !== "");
  return value !== "" && value != null;
}

function isSelfMarkQuestion(question) {
  return question.type === "EngageQuestion" || question.type === "DrawQuestion";
}

function needsSelfMark(question, answerState) {
  return isSelfMarkQuestion(question) && hasQuizAnswerValue(answerState) && typeof answerState?.correct !== "boolean";
}

function renderQuizStatus(session) {
  const progress = getQuizProgress(session.quiz.jsonPath);
  const answeredCount = session.questions.filter((question) => hasQuizAnswerValue(session.answers[question.id])).length;
  const selfMarkPending = session.questions.filter((question) => needsSelfMark(question, session.answers[question.id])).length;
  quizScoreboard.innerHTML = "";
  quizScoreboard.append(metric(`${progress.attempts} attempts`));
  quizScoreboard.append(metric(`${progress.bestScore}% best score`));
  quizScoreboard.append(metric(`${answeredCount}/${session.questions.length} answered`));
  if (selfMarkPending) quizScoreboard.append(metric(`${selfMarkPending} self-mark pending`));
  quizScoreboard.append(metric(progress.completed ? "completed" : "in progress"));
}

function syncQuizChrome() {
  const session = state.quizSession;
  if (!session || session.finished) return;
  const current = session.questions[session.index];
  renderQuizStatus(session);
  prevQuizBtn.disabled = session.index === 0;
  const unanswered = !hasQuizAnswerValue(session.answers[current.id]);
  nextQuizBtn.textContent = session.index === session.questions.length - 1
    ? (unanswered ? "Finish with blanks" : "Finish quiz")
    : (unanswered ? "Skip question" : "Next");
}

function renderSelfMarkPanel(question, answerState) {
  const panel = document.createElement("div");
  panel.className = "quiz-self-mark";
  const prompt = document.createElement("p");
  prompt.className = "quiz-self-mark-copy";
  prompt.textContent = question.raw.modelAnswer
    ? "Your wording does not need to match exactly. Compare the substance of your answer with the model answer, then self-mark it."
    : "Decide whether your answer is strong enough, then self-mark it.";
  panel.append(prompt);

  const actions = document.createElement("div");
  actions.className = "quiz-self-mark-actions";
  const markCorrect = document.createElement("button");
  markCorrect.type = "button";
  markCorrect.className = `button button-ghost${answerState?.correct === true ? " is-active" : ""}`;
  markCorrect.textContent = "Mark as correct";
  markCorrect.addEventListener("click", () => {
    saveQuizAnswer(question.id, state.quizSession.answers[question.id]?.value || "", true);
    renderQuiz();
  });

  const markIncorrect = document.createElement("button");
  markIncorrect.type = "button";
  markIncorrect.className = `button button-ghost${answerState?.correct === false ? " is-active" : ""}`;
  markIncorrect.textContent = "Needs more work";
  markIncorrect.addEventListener("click", () => {
    saveQuizAnswer(question.id, state.quizSession.answers[question.id]?.value || "", false);
    renderQuiz();
  });

  actions.append(markCorrect, markIncorrect);
  panel.append(actions);
  return panel;
}

function replaceFeedbackBadge(container, question) {
  const existing = container.querySelector(".feedback-badge");
  if (!existing) return;
  existing.replaceWith(feedbackBadge(question, state.quizSession.answers[question.id]));
}

function syncLongAnswerUi(container, question) {
  const existing = container.querySelector(".quiz-self-mark");
  if (existing) existing.remove();
  const answerState = state.quizSession.answers[question.id];
  if (!hasQuizAnswerValue(answerState)) return;
  const badge = container.querySelector(".feedback-badge");
  const panel = renderSelfMarkPanel(question, answerState);
  if (badge) container.insertBefore(panel, badge);
  else container.append(panel);
}

function isOptionSelected(answerState, index, multi) {
  if (!hasQuizAnswerValue(answerState)) return false;
  if (multi) return new Set(answerState.value || []).has(index);
  return answerState.value === index;
}

function shouldShowOptionExplanation(question, answerState, index, multi) {
  if (!hasQuizAnswerValue(answerState)) return false;
  if (isOptionSelected(answerState, index, multi)) return true;
  if (multi) return answerState.correct === false && question.raw.options?.[index]?.correct;
  return answerState.correct === false && question.raw.correctOptionIndex === index;
}

function buildOptionCardClass(question, answerState, index, multi) {
  const classes = ["option-card"];
  const selected = isOptionSelected(answerState, index, multi);
  if (selected) classes.push("is-selected");
  if (shouldShowOptionExplanation(question, answerState, index, multi)) classes.push("is-revealed");
  if (!hasQuizAnswerValue(answerState)) return classes.join(" ");
  if (multi) {
    const correct = Boolean(question.raw.options?.[index]?.correct);
    if (selected && correct) classes.push("is-correct");
    else if (selected && !correct) classes.push("is-wrong");
    else if (answerState.correct === false && correct) classes.push("is-correct");
    return classes.join(" ");
  }
  if (question.raw.correctOptionIndex === index) classes.push("is-correct");
  else if (selected && answerState.correct === false) classes.push("is-wrong");
  return classes.join(" ");
}

function repairMojibake(value) {
  const text = String(value ?? "");
  if (!/[ÃÂâ]/.test(text)) return text;
  try {
    const bytes = Uint8Array.from(text, (char) => char.charCodeAt(0) & 0xff);
    const decoded = new TextDecoder("utf-8").decode(bytes);
    if (decoded && !decoded.includes("\uFFFD")) return decoded;
  } catch (_) {
    // Fall through to targeted replacements.
  }
  return text
    .replaceAll("Â£", "£")
    .replaceAll("â€™", "’")
    .replaceAll("â€˜", "‘")
    .replaceAll("â€œ", "“")
    .replaceAll("â€\u009d", "”")
    .replaceAll("â€“", "–")
    .replaceAll("â€”", "—")
    .replaceAll("â€¦", "…")
    .replaceAll("Â", "");
}

function normalizeMathishContent(value) {
  let normalized = repairMojibake(value ?? "");
  normalized = normalized
    .replace(/\\newline/gi, " ")
    .replace(/\\text(?:normal|rm|bf|it|mathrm)\{([^{}]*)\}/gi, "$1")
    .replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/gi, "($1/$2)")
    .replace(/\\pm/gi, "±")
    .replace(/\\times/gi, "×")
    .replace(/\\cdot/gi, "·")
    .replace(/\\leq/gi, "≤")
    .replace(/\\geq/gi, "≥")
    .replace(/\\neq/gi, "≠")
    .replace(/\\approx/gi, "≈")
    .replace(/\\rightarrow/gi, "→")
    .replace(/\\left|\\right/gi, "")
    .replace(/\\%/g, "%")
    .replace(/\\_/g, "_")
    .replace(/\\\s+/g, " ")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized === "$$" ? "" : normalized;
}

boot().catch((error) => {
  resultTitle.textContent = "Failed to load archive";
  resultMeta.textContent = String(error);
});
