import { SPEC_BLUEPRINT } from "../config/constants.js";
import { getQuizLabel } from "../utils/labels.js";
import { escapeHtml } from "../utils/text.js";

export function createDashboardFeature({
  state,
  elements,
  helpers,
}) {
  const {
    statsGrid,
    progressTitle,
    progressMeta,
    dueTitle,
    dueMeta,
    focusTitle,
    focusMeta,
    dueList,
    weakTopicList,
    todayTitle,
    todayMeta,
    todayPlanList,
    specMapTitle,
    specMapMeta,
    specMapList,
  } = elements;

  const {
    actionCard,
    emptyCard,
    getNewFlashcards,
    getDueFlashcards,
    getPaperTarget,
    getQuizProgress,
    getRecommendationModules,
    getRecommendationTopics,
    getTeachingPathCandidate,
    getTopicProgress,
    getWeakTopics,
    getWorstQuizTopic,
    openExamPaperStudy,
    openQuiz,
    openTopicStudy,
    startFlashcardSession,
  } = helpers;

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

  return {
    buildTodayPlan,
    renderProgressSummary,
    renderSmartDashboard,
    renderSpecMap,
    renderStats,
    renderTodayPlan,
  };
}
