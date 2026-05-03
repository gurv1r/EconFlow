const STORAGE_BRANCH = "taskFlow"

const STATES = {
  START: "START",
  CHOOSE_MODE: "CHOOSE_MODE",
  CHOOSE_TOPIC: "CHOOSE_TOPIC",
  STUDY: "STUDY",
  PRACTICE: "PRACTICE",
  CONFIDENCE_CHECK: "CONFIDENCE_CHECK",
  SUCCESS: "SUCCESS",
  RECOVERY: "RECOVERY",
  ERROR_CONTENT_NOT_FOUND: "ERROR_CONTENT_NOT_FOUND",
  ERROR_NO_PROGRESS: "ERROR_NO_PROGRESS",
  ERROR_WRONG_TOPIC: "ERROR_WRONG_TOPIC",
}

const STEP_SEQUENCE = [
  STATES.START,
  STATES.CHOOSE_MODE,
  STATES.CHOOSE_TOPIC,
  STATES.STUDY,
  STATES.PRACTICE,
  STATES.CONFIDENCE_CHECK,
  STATES.SUCCESS,
]

const STATE_LABELS = {
  [STATES.START]: "Start",
  [STATES.CHOOSE_MODE]: "Choose mode",
  [STATES.CHOOSE_TOPIC]: "Choose topic",
  [STATES.STUDY]: "Study",
  [STATES.PRACTICE]: "Practice",
  [STATES.CONFIDENCE_CHECK]: "Confidence",
  [STATES.SUCCESS]: "Saved",
  [STATES.RECOVERY]: "Recovery",
  [STATES.ERROR_CONTENT_NOT_FOUND]: "Content issue",
  [STATES.ERROR_NO_PROGRESS]: "No save found",
  [STATES.ERROR_WRONG_TOPIC]: "Switch topic",
}

const MODE_OPTIONS = [
  { id: "learn", label: "Learn the topic", description: "Read clear notes and understand the key theory." },
  { id: "practice", label: "Practise questions", description: "Answer exam-style questions and check understanding." },
  { id: "weakness", label: "Fix weak areas", description: "Focus on topics marked low confidence." },
  { id: "quick", label: "Quick 10-minute revision", description: "Do a short focused revision task." },
]

const CONFIDENCE_OPTIONS = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
]

let ctx = null

function createTaskFlowProgress() {
  return {
    state: STATES.START,
    topicId: "",
    previousTopicId: "",
    revisionMode: "",
    confidenceByTopic: {},
    lastUpdated: null,
    completedSteps: [],
    recovery: null,
    lastIntent: "",
  }
}

function currentRootProgress() {
  if (!ctx?.getRootProgress) throw new Error("Task flow is not initialised")
  return ctx.getRootProgress()
}

function ensureProgress() {
  const root = currentRootProgress()
  root[STORAGE_BRANCH] ??= createTaskFlowProgress()
  const progress = root[STORAGE_BRANCH]
  progress.state ||= STATES.START
  progress.topicId ||= ""
  progress.previousTopicId ||= ""
  progress.revisionMode ||= ""
  progress.confidenceByTopic ??= {}
  progress.lastUpdated ??= null
  progress.completedSteps = Array.isArray(progress.completedSteps) ? progress.completedSteps : []
  progress.recovery ??= null
  progress.lastIntent ||= ""
  return progress
}

function addCompletedStep(step) {
  if (!step) return
  const progress = ensureProgress()
  if (!progress.completedSteps.includes(step)) progress.completedSteps.push(step)
}

function commitProgress() {
  const progress = ensureProgress()
  progress.lastUpdated = new Date().toISOString()
  ctx.persistRootProgress?.()
  return progress
}

function getSelectedMode() {
  const progress = ensureProgress()
  return MODE_OPTIONS.find((mode) => mode.id === progress.revisionMode) || null
}

function getVisibleTopics() {
  const topics = ctx.getRecommendationTopics?.({ coveredOnly: false, includeFuture: true }) || []
  return topics.filter((topic) => ctx.findModuleByTopicId?.(topic.id))
}

function getTopicById(topicId) {
  return topicId ? ctx.findTopicById?.(topicId) || null : null
}

function getTopicModule(topic) {
  return topic ? ctx.findModuleByTopicId?.(topic.id) || null : null
}

function getSelectedTopic() {
  return getTopicById(ensureProgress().topicId)
}

function getModeCopy(modeId) {
  return MODE_OPTIONS.find((mode) => mode.id === modeId) || MODE_OPTIONS[0]
}

function hasMeaningfulProgress() {
  const progress = ensureProgress()
  return Boolean(
    progress.topicId ||
    progress.revisionMode ||
    progress.completedSteps.length ||
    Object.keys(progress.confidenceByTopic).length,
  )
}

function getRecommendationTopic() {
  const chosen = ctx.getTeachingPathCandidate?.()
  if (chosen) return chosen

  const topics = getVisibleTopics()
  const themeOne = topics.filter((topic) => getTopicModule(topic)?.id === "14")
  const namedPick = themeOne.find((topic) =>
    /price elasticity of demand|supply and demand|market failure/i.test(`${topic.name} ${topic.section}`),
  )
  return namedPick || themeOne[0] || topics[0] || null
}

function getWeakTopic() {
  return ctx.getWeakTopics?.()[0] || null
}

function getNextRecommendedTopic(currentTopicId = "") {
  const teachingPick = ctx.getTeachingPathCandidate?.()
  if (teachingPick && teachingPick.id !== currentTopicId) return teachingPick
  return getVisibleTopics().find((topic) => topic.id !== currentTopicId) || null
}

function getTopicLabel(topic) {
  if (!topic) return "No topic selected"
  return topic.name
}

function getTopicMeta(topic) {
  if (!topic) return "Pick a topic to start revising."
  const module = getTopicModule(topic)
  return [module?.title, topic.section].filter(Boolean).join(" | ")
}

function getConfidenceLabel(topicId) {
  const level = ensureProgress().confidenceByTopic?.[topicId] || ""
  return level ? level[0].toUpperCase() + level.slice(1) : "Not marked yet"
}

function getProgressSummary() {
  const progress = ensureProgress()
  const confidenceCount = Object.keys(progress.confidenceByTopic || {}).length
  const startedCount = progress.completedSteps.length
  const currentTopic = getSelectedTopic()
  const topicProgress = currentTopic ? ctx.getTopicProgress?.(currentTopic) : null
  return {
    confidenceCount,
    startedCount,
    topicProgress,
  }
}

function getCurrentStepIndex(state = ensureProgress().state) {
  const directIndex = STEP_SEQUENCE.indexOf(state)
  if (directIndex >= 0) return directIndex
  if (state === STATES.ERROR_CONTENT_NOT_FOUND) return 3
  if (state === STATES.ERROR_NO_PROGRESS) return 0
  if (state === STATES.ERROR_WRONG_TOPIC) return 2
  return Math.max(0, ensureProgress().completedSteps.length - 1)
}

function hasStudyContent(topic) {
  return !!(
    topic?.summaryHtmlPath ||
    topic?.articleLessons?.length ||
    topic?.videos?.length ||
    topic?.quizzes?.length
  )
}

function selectPracticeQuiz(topic, modeId = ensureProgress().revisionMode) {
  if (!topic?.quizzes?.length) return null
  if (modeId === "weakness") {
    return topic.quizzes
      .slice()
      .sort((a, b) => (ctx.getQuizProgress?.(a.jsonPath)?.bestScore || 0) - (ctx.getQuizProgress?.(b.jsonPath)?.bestScore || 0))[0]
  }
  return topic.quizzes[0]
}

function ensureSelectedTopic() {
  const progress = ensureProgress()
  const existing = getSelectedTopic()
  if (existing) return existing

  const fallback = progress.revisionMode === "weakness" ? getWeakTopic() || getRecommendationTopic() : getRecommendationTopic()
  if (!fallback) return null
  progress.topicId = fallback.id
  commitProgress()
  return fallback
}

function setRecoveryState(id, message, nextState = STATES.RECOVERY) {
  const progress = ensureProgress()
  progress.recovery = { id, message }
  progress.state = nextState
  commitProgress()
}

function clearRecovery() {
  const progress = ensureProgress()
  progress.recovery = null
}

function openTopicStudyFlow(topic = ensureSelectedTopic()) {
  if (!topic || !hasStudyContent(topic)) {
    handleMissingContent("content_not_found")
    return false
  }
  const progress = ensureProgress()
  progress.lastIntent = "study"
  progress.state = STATES.STUDY
  addCompletedStep(STATES.CHOOSE_TOPIC)
  addCompletedStep(STATES.STUDY)
  clearRecovery()
  commitProgress()
  ctx.openTopicStudy?.(topic)
  renderTaskFlow()
  return true
}

function openPracticeFlow(topic = ensureSelectedTopic(), modeId = ensureProgress().revisionMode) {
  const quiz = selectPracticeQuiz(topic, modeId)
  if (!topic || !quiz) {
    handleMissingContent("content_not_found")
    return false
  }
  const progress = ensureProgress()
  progress.lastIntent = "practice"
  progress.state = STATES.PRACTICE
  addCompletedStep(STATES.CHOOSE_TOPIC)
  addCompletedStep(STATES.PRACTICE)
  clearRecovery()
  commitProgress()
  ctx.openQuiz?.(topic, quiz)
  renderTaskFlow()
  return true
}

function continueFromSuccess() {
  const progress = ensureProgress()
  const topic = getSelectedTopic()
  const confidence = topic ? progress.confidenceByTopic?.[topic.id] : ""
  if (confidence === "low") {
    progress.revisionMode = "weakness"
    commitProgress()
    openTopicStudyFlow(topic)
    return
  }

  const nextTopic = getNextRecommendedTopic(topic?.id || "")
  if (nextTopic) {
    setTopic(nextTopic.id)
    setState(STATES.STUDY, { completedStep: STATES.STUDY })
    openTopicStudyFlow(nextTopic)
    return
  }

  openPracticeFlow(topic, "quick")
}

function describeCurrentState(progress, topic, mode) {
  if (progress.state === STATES.START) return "Choose your first revision step."
  if (progress.state === STATES.CHOOSE_MODE) return "Pick how you want to revise."
  if (progress.state === STATES.CHOOSE_TOPIC) return topic ? "Topic ready. Move into the next revision step." : "Pick a topic to keep the flow clear."
  if (progress.state === STATES.STUDY) return topic ? `Study ${topic.name} before you practise.` : "Study the selected topic first."
  if (progress.state === STATES.PRACTICE) return topic ? `Practice questions for ${topic.name} are next.` : "Practice questions are next."
  if (progress.state === STATES.CONFIDENCE_CHECK) return "Mark how secure this topic feels."
  if (progress.state === STATES.SUCCESS) return "Progress saved on this device."
  if (progress.recovery?.message) return progress.recovery.message
  return "Use the next button to keep your revision moving."
}

function getPrimaryAction() {
  const progress = ensureProgress()
  const topic = getSelectedTopic()
  const mode = getSelectedMode()
  const savedConfidence = topic ? progress.confidenceByTopic?.[topic.id] : ""

  if (progress.state === STATES.START) {
    return { label: "Start revision", action: () => setState(STATES.CHOOSE_MODE, { completedStep: STATES.START }) }
  }

  if (progress.state === STATES.CHOOSE_MODE) {
    return { label: "Choose topic", action: () => setState(STATES.CHOOSE_TOPIC, { completedStep: STATES.CHOOSE_MODE }) }
  }

  if (progress.state === STATES.CHOOSE_TOPIC) {
    if (mode?.id === "practice" || mode?.id === "quick") {
      return { label: "Quick exam questions", action: () => openPracticeFlow(topic, mode.id) }
    }
    return { label: "Study first", action: () => openTopicStudyFlow(topic) }
  }

  if (progress.state === STATES.STUDY) {
    return { label: "Practise questions", action: () => openPracticeFlow(topic, progress.revisionMode) }
  }

  if (progress.state === STATES.PRACTICE) {
    return { label: "Mark confidence", action: () => setState(STATES.CONFIDENCE_CHECK, { completedStep: STATES.PRACTICE }) }
  }

  if (progress.state === STATES.CONFIDENCE_CHECK) {
    return {
      label: "Save and continue",
      action: () => {
        if (!savedConfidence) return
        markConfidence(savedConfidence)
      },
      disabled: !savedConfidence,
    }
  }

  if (progress.state === STATES.SUCCESS) {
    const topicConfidence = topic ? progress.confidenceByTopic?.[topic.id] : ""
    const label = topicConfidence === "low" ? "Fix weak areas" : "Continue to the next step"
    return { label, action: continueFromSuccess }
  }

  if (progress.state === STATES.ERROR_NO_PROGRESS) {
    return {
      label: "Start recommended topic",
      action: () => {
        const recommended = getRecommendationTopic()
        if (recommended) setTopic(recommended.id)
        setRevisionMode("learn")
        setState(STATES.CHOOSE_TOPIC, { completedStep: STATES.CHOOSE_MODE })
      },
    }
  }

  if (progress.state === STATES.ERROR_WRONG_TOPIC) {
    return { label: "Open topic switcher", action: () => setState(STATES.CHOOSE_TOPIC, { recovery: null }) }
  }

  if (progress.state === STATES.ERROR_CONTENT_NOT_FOUND || progress.state === STATES.RECOVERY) {
    return {
      label: "Retry",
      action: () => {
        if (progress.lastIntent === "practice") openPracticeFlow(getSelectedTopic(), progress.revisionMode)
        else openTopicStudyFlow(getSelectedTopic())
      },
    }
  }

  return { label: "Start revision", action: () => setState(STATES.CHOOSE_MODE, { completedStep: STATES.START }) }
}

function buildSecondaryActions() {
  const progress = ensureProgress()
  const topic = getSelectedTopic()
  const actions = []

  if (progress.state === STATES.ERROR_NO_PROGRESS) {
    actions.push({
      label: "Choose a topic",
      onClick: () => setState(STATES.CHOOSE_TOPIC, { recovery: null }),
      tone: "ghost",
    })
    actions.push({
      label: "Try quick 10-minute revision",
      onClick: () => {
        const recommended = getRecommendationTopic()
        if (recommended) setTopic(recommended.id)
        setRevisionMode("quick")
        openPracticeFlow(recommended, "quick")
      },
      tone: "ghost",
    })
  } else if (progress.state === STATES.ERROR_WRONG_TOPIC) {
    if (progress.previousTopicId) {
      actions.push({
        label: "Return to previous topic",
        onClick: () => setTopic(progress.previousTopicId),
        tone: "ghost",
      })
    }
    actions.push({
      label: "Save current topic and continue",
      onClick: () => {
        clearRecovery()
        commitProgress()
        renderTaskFlow()
      },
      tone: "ghost",
    })
  } else if (progress.state === STATES.ERROR_CONTENT_NOT_FOUND || progress.state === STATES.RECOVERY) {
    actions.push({
      label: "Switch topic",
      onClick: () => setState(STATES.CHOOSE_TOPIC, { recovery: null }),
      tone: "ghost",
    })
    actions.push({
      label: "Start recommended topic",
      onClick: () => {
        const recommended = getRecommendationTopic()
        if (recommended) setTopic(recommended.id)
        setState(STATES.CHOOSE_TOPIC, { recovery: null })
      },
      tone: "ghost",
    })
  } else if (hasMeaningfulProgress()) {
    actions.push({ label: "Continue where I left off", onClick: continueFromSaved, tone: "ghost" })
  }

  actions.push({
    label: "I don't know what to revise",
    onClick: () => {
      const recommended = getRecommendationTopic()
      if (recommended) setTopic(recommended.id)
      if (!ensureProgress().revisionMode) setRevisionMode("learn")
      setState(STATES.CHOOSE_TOPIC, { completedStep: STATES.CHOOSE_MODE })
    },
    tone: "ghost",
  })

  actions.push({
    label: "Quick exam questions",
    onClick: () => {
      const recommended = topic || getWeakTopic() || getRecommendationTopic()
      if (recommended) setTopic(recommended.id)
      setRevisionMode("quick")
      openPracticeFlow(recommended, "quick")
    },
    tone: "ghost",
  })

  if (topic) {
    actions.push({
      label: "Switch topic",
      onClick: () => showRecovery("wrong_topic"),
      tone: "ghost",
    })
  }

  actions.push({
    label: "Back to dashboard",
    onClick: () => ctx.returnToDashboard?.(),
    tone: "ghost",
  })

  return actions
}

function continueFromSaved() {
  const progress = ensureProgress()
  if (!hasMeaningfulProgress()) {
    showRecovery("no_saved_progress")
    return
  }
  if (!progress.revisionMode) {
    setState(STATES.CHOOSE_MODE, { completedStep: STATES.START })
    return
  }
  if (!progress.topicId) {
    setState(STATES.CHOOSE_TOPIC, { completedStep: STATES.CHOOSE_MODE })
    return
  }
  clearRecovery()
  commitProgress()
  const topic = getSelectedTopic()
  if (progress.state === STATES.STUDY) {
    openTopicStudyFlow(topic)
    return
  }
  if (progress.state === STATES.PRACTICE) {
    openPracticeFlow(topic, progress.revisionMode)
    return
  }
  if (progress.state === STATES.ERROR_CONTENT_NOT_FOUND || progress.state === STATES.RECOVERY) {
    if (progress.lastIntent === "practice") openPracticeFlow(topic, progress.revisionMode)
    else openTopicStudyFlow(topic)
    return
  }
  renderTaskFlow()
}

function createButton(label, onClick, options = {}) {
  const button = document.createElement("button")
  button.type = "button"
  button.className = options.tone === "ghost" ? "button button-ghost" : "button"
  if (options.extraClass) button.classList.add(options.extraClass)
  button.textContent = label
  button.disabled = !!options.disabled
  button.addEventListener("click", onClick)
  return button
}

function createMetricCard(label, value, detail = "") {
  const card = document.createElement("article")
  card.className = "task-flow-metric"
  const title = document.createElement("span")
  title.className = "task-flow-metric-label"
  title.textContent = label
  const body = document.createElement("strong")
  body.className = "task-flow-metric-value"
  body.textContent = value
  card.append(title, body)
  if (detail) {
    const meta = document.createElement("span")
    meta.className = "task-flow-metric-detail"
    meta.textContent = detail
    card.append(meta)
  }
  return card
}

function createSelectorField(id, labelText, options, selectedValue, onChange) {
  const label = document.createElement("label")
  label.className = "field task-flow-field"
  label.setAttribute("for", id)
  const labelSpan = document.createElement("span")
  labelSpan.textContent = labelText
  const select = document.createElement("select")
  select.id = id
  for (const optionConfig of options) {
    const option = document.createElement("option")
    option.value = optionConfig.value
    option.textContent = optionConfig.label
    if (optionConfig.description) option.title = optionConfig.description
    select.append(option)
  }
  select.value = selectedValue || options[0]?.value || ""
  select.addEventListener("change", onChange)
  label.append(labelSpan, select)
  return label
}

function createStepPills(state) {
  const wrapper = document.createElement("div")
  wrapper.className = "task-flow-steps"
  const currentIndex = getCurrentStepIndex(state)
  STEP_SEQUENCE.forEach((step, index) => {
    const pill = document.createElement("span")
    pill.className = "task-flow-step"
    if (index < currentIndex) pill.classList.add("is-complete")
    if (index === currentIndex) pill.classList.add("is-current")
    pill.textContent = STATE_LABELS[step]
    wrapper.append(pill)
  })
  return wrapper
}

function createRecoveryBanner() {
  const progress = ensureProgress()
  const topic = getSelectedTopic()
  const recovery = progress.recovery
  if (!recovery && progress.state !== STATES.ERROR_CONTENT_NOT_FOUND && progress.state !== STATES.ERROR_NO_PROGRESS && progress.state !== STATES.ERROR_WRONG_TOPIC) return null

  const banner = document.createElement("section")
  banner.className = "task-flow-recovery"
  const title = document.createElement("strong")
  title.className = "task-flow-recovery-title"
  title.textContent = recovery?.message || describeCurrentState(progress, topic, getSelectedMode())
  const copy = document.createElement("p")
  copy.className = "result-meta"
  if (progress.state === STATES.ERROR_CONTENT_NOT_FOUND) copy.textContent = "Try again, switch topic, or jump back to a recommended topic."
  else if (progress.state === STATES.ERROR_NO_PROGRESS) copy.textContent = "No progress has been saved for this flow yet, so EconFlow will guide you into a fresh start."
  else if (progress.state === STATES.ERROR_WRONG_TOPIC) copy.textContent = "No problem. Switching topic will not delete your progress."
  else copy.textContent = "Use one of the actions below to keep your revision moving."
  banner.append(title, copy)
  return banner
}

function renderStickyAction(primaryAction) {
  const sticky = ctx.elements?.taskFlowSticky
  if (!sticky) return
  sticky.innerHTML = ""
  if (ctx.isModuleView?.()) {
    sticky.hidden = true
    return
  }
  sticky.hidden = false
  const shell = document.createElement("div")
  shell.className = "task-flow-sticky-inner"
  const text = document.createElement("span")
  text.className = "task-flow-sticky-copy"
  text.textContent = "Use the button below to continue your revision."
  const actions = document.createElement("div")
  actions.className = "task-flow-sticky-actions"
  actions.append(
    createButton(primaryAction.label, primaryAction.action, { disabled: primaryAction.disabled, extraClass: "task-flow-sticky-primary" }),
    createButton("Back to dashboard", () => ctx.returnToDashboard?.(), { tone: "ghost", extraClass: "task-flow-sticky-secondary" }),
  )
  shell.append(text, actions)
  sticky.append(shell)
}

export function getProgress() {
  return ensureProgress()
}

export function saveProgress() {
  return commitProgress()
}

export function clearProgress() {
  currentRootProgress()[STORAGE_BRANCH] = createTaskFlowProgress()
  commitProgress()
  renderTaskFlow()
}

export function setState(nextState, options = {}) {
  const progress = ensureProgress()
  progress.state = nextState
  if (options.completedStep) addCompletedStep(options.completedStep)
  if (Object.prototype.hasOwnProperty.call(options, "recovery")) progress.recovery = options.recovery
  if (nextState !== STATES.RECOVERY && !String(nextState).startsWith("ERROR_") && !Object.prototype.hasOwnProperty.call(options, "recovery")) {
    clearRecovery()
  }
  commitProgress()
  renderTaskFlow()
  return progress
}

export function setRevisionMode(modeId) {
  const progress = ensureProgress()
  progress.revisionMode = modeId
  addCompletedStep(STATES.CHOOSE_MODE)
  if (progress.state === STATES.START || progress.state === STATES.CHOOSE_MODE) progress.state = STATES.CHOOSE_TOPIC
  commitProgress()
  renderTaskFlow()
  return progress
}

export function setTopic(topicId) {
  const progress = ensureProgress()
  if (progress.topicId && progress.topicId !== topicId) progress.previousTopicId = progress.topicId
  progress.topicId = topicId
  addCompletedStep(STATES.CHOOSE_TOPIC)
  if (progress.state === STATES.ERROR_WRONG_TOPIC) progress.state = STATES.CHOOSE_TOPIC
  commitProgress()
  renderTaskFlow()
  return progress
}

export function markConfidence(level) {
  const progress = ensureProgress()
  const topicId = progress.topicId
  if (!topicId) return progress
  progress.confidenceByTopic[topicId] = level
  addCompletedStep(STATES.CONFIDENCE_CHECK)
  addCompletedStep(STATES.SUCCESS)
  progress.state = STATES.SUCCESS
  clearRecovery()
  ctx.markTopicConfidence?.(topicId, true)
  commitProgress()
  renderTaskFlow()
  return progress
}

export function showRecovery(kind) {
  if (kind === "content_not_found") {
    setRecoveryState("content_not_found", "We couldn't load this topic.", STATES.ERROR_CONTENT_NOT_FOUND)
  } else if (kind === "no_saved_progress") {
    setRecoveryState("no_saved_progress", "No saved progress found yet.", STATES.ERROR_NO_PROGRESS)
  } else if (kind === "wrong_topic") {
    setRecoveryState("wrong_topic", "No problem - switch topic without losing your progress.", STATES.ERROR_WRONG_TOPIC)
  } else {
    setRecoveryState("recovery", "Use the options below to get back on track.", STATES.RECOVERY)
  }
  renderTaskFlow()
}

export function handleMissingContent(kind = "content_not_found") {
  showRecovery(kind)
}

export function renderTaskFlow() {
  const mount = ctx?.elements?.taskFlowMount
  if (!mount) return

  const progress = ensureProgress()
  const topic = getSelectedTopic()
  const mode = getSelectedMode()
  const summary = getProgressSummary()
  const primaryAction = getPrimaryAction()

  mount.innerHTML = ""

  const card = document.createElement("div")
  card.className = "task-flow-card"

  const header = document.createElement("div")
  header.className = "task-flow-header"
  header.innerHTML = `
    <div>
      <p class="eyebrow">Zero-Confusion Task Flow</p>
      <h3 id="taskFlowTitle">Start revising without getting lost</h3>
      <p class="task-flow-intro">Choose a topic, study the key ideas, practise questions, and save your confidence.</p>
    </div>
  `

  const stateBadge = document.createElement("span")
  stateBadge.className = "metric task-flow-state-badge"
  stateBadge.textContent = `Current state: ${STATE_LABELS[progress.state] || progress.state}`
  header.append(stateBadge)

  const steps = createStepPills(progress.state)

  const overview = document.createElement("div")
  overview.className = "task-flow-overview"
  overview.append(
    createMetricCard("Current topic", getTopicLabel(topic), getTopicMeta(topic)),
    createMetricCard("Revision mode", mode?.label || "Pick a mode", mode?.description || "Learn, practise, repair weak areas, or do a quick sprint."),
    createMetricCard(
      "Progress summary",
      topic && summary.topicProgress ? `${summary.topicProgress.score}% ready` : `${summary.startedCount} steps started`,
      topic && summary.topicProgress
        ? `${summary.topicProgress.done}/${summary.topicProgress.total} tracked checks | Confidence: ${topic ? getConfidenceLabel(topic.id) : "Not marked yet"}`
        : `${summary.confidenceCount} topic confidence saves`,
    ),
    createMetricCard("Next action", primaryAction.label, describeCurrentState(progress, topic, mode)),
  )

  const selectorGrid = document.createElement("div")
  selectorGrid.className = "task-flow-selector-grid"
  selectorGrid.append(
    createSelectorField(
      "taskFlowModeSelect",
      "Choose mode",
      MODE_OPTIONS.map((option) => ({ value: option.id, label: option.label, description: option.description })),
      progress.revisionMode || "learn",
      (event) => setRevisionMode(event.target.value),
    ),
    createSelectorField(
      "taskFlowTopicSelect",
      progress.topicId ? "Switch topic" : "Choose topic",
      [
        { value: "", label: "Choose topic" },
        ...getVisibleTopics().map((topicOption) => {
          const module = getTopicModule(topicOption)
          return {
            value: topicOption.id,
            label: `${topicOption.name} - ${module?.title || "Topic"} - ${topicOption.section}`,
          }
        }),
      ],
      progress.topicId,
      (event) => {
        if (!event.target.value) return
        setTopic(event.target.value)
      },
    ),
  )

  const helper = document.createElement("p")
  helper.className = "task-flow-helper result-meta"
  helper.textContent = topic
    ? "Switching topic will not delete your progress."
    : "Not sure what to revise? Start with a recommended Theme 1 topic."

  const recoveryBanner = createRecoveryBanner()

  const confidence = document.createElement("div")
  confidence.className = "task-flow-confidence"
  const confidenceTitle = document.createElement("p")
  confidenceTitle.className = "task-flow-confidence-title"
  confidenceTitle.textContent = "Mark confidence"
  confidence.append(confidenceTitle)
  const confidenceButtons = document.createElement("div")
  confidenceButtons.className = "task-flow-confidence-buttons"
  const activeConfidence = topic ? progress.confidenceByTopic?.[topic.id] : ""
  for (const option of CONFIDENCE_OPTIONS) {
    const button = createButton(option.label, () => {
      if (!topic) return
      const flow = ensureProgress()
      flow.confidenceByTopic[topic.id] = option.id
      commitProgress()
      renderTaskFlow()
    }, {
      tone: activeConfidence === option.id ? undefined : "ghost",
      extraClass: "task-flow-confidence-button",
    })
    if (activeConfidence === option.id) button.classList.add("is-selected")
    confidenceButtons.append(button)
  }
  confidence.append(confidenceButtons)

  const primaryRow = document.createElement("div")
  primaryRow.className = "task-flow-primary"
  primaryRow.append(createButton(primaryAction.label, primaryAction.action, { disabled: primaryAction.disabled, extraClass: "task-flow-primary-button" }))

  const secondaryRow = document.createElement("div")
  secondaryRow.className = "task-flow-secondary"
  for (const action of buildSecondaryActions()) {
    secondaryRow.append(createButton(action.label, action.onClick, { tone: action.tone, extraClass: "task-flow-secondary-button" }))
  }

  card.append(header, steps, overview, selectorGrid, helper)
  if (recoveryBanner) card.append(recoveryBanner)
  card.append(confidence, primaryRow, secondaryRow)
  mount.append(card)

  renderStickyAction(primaryAction)
}

export function initTaskFlow(config) {
  ctx = config
  ensureProgress()
  renderTaskFlow()
  return {
    getProgress,
    saveProgress,
    clearProgress,
    setState,
    setRevisionMode,
    setTopic,
    markConfidence,
    renderTaskFlow,
    showRecovery,
    handleMissingContent,
    initTaskFlow,
  }
}
