import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
CATALOG = SITE / "catalog.json"


def fail(message: str) -> None:
    print(f"[validate_site] ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def read_text(path: Path) -> str:
    if not path.exists():
        fail(f"Missing file: {path.relative_to(ROOT)}")
    return path.read_text(encoding="utf-8")


def load_catalog() -> dict:
    if not CATALOG.exists():
        fail(f"Missing catalog: {CATALOG}")
    try:
        return json.loads(CATALOG.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        fail(f"Invalid JSON in {CATALOG}: {exc}")


def ensure_static_files() -> None:
    required = [
        SITE / "index.html",
        SITE / "app.js",
        SITE / "styles.css",
        SITE / "firebase-config.js",
        SITE / ".nojekyll",
        SITE / "robots.txt",
        SITE / "sitemap.xml",
        SITE / "a-level-economics-notes.html",
        SITE / "a-level-economics-diagrams.html",
        SITE / "a-level-economics-questions.html",
        SITE / "a-level-economics-revision.html",
        SITE / "edexcel-a-level-economics-revision.html",
        SITE / "js" / "config" / "constants.js",
        SITE / "js" / "config" / "env.js",
        SITE / "js" / "config" / "seo.js",
        SITE / "js" / "config" / "spec-map.js",
        SITE / "js" / "features" / "access-control.js",
        SITE / "js" / "features" / "dashboard.js",
        SITE / "js" / "features" / "task-flow.js",
        SITE / "js" / "fixes" / "play-next.js",
        SITE / "js" / "services" / "archive-resources.js",
        SITE / "js" / "services" / "cloud-config.js",
        SITE / "js" / "services" / "progress-storage.js",
        SITE / "js" / "ui" / "dom.js",
        SITE / "js" / "utils" / "labels.js",
        SITE / "js" / "utils" / "text.js",
    ]
    missing = [str(path.relative_to(ROOT)) for path in required if not path.exists()]
    if missing:
        fail(f"Missing required site files: {', '.join(missing)}")


def ensure_path(value: str, context: str) -> None:
    if not value:
        fail(f"Missing path for {context}")
    if "\\" in value:
        fail(f"Backslashes are not allowed in catalog paths: {context} -> {value}")
    if value.startswith("/"):
        fail(f"Catalog paths must stay repo-relative: {context} -> {value}")


def validate_html_pages() -> None:
    page_requirements = {
        "index.html": [
            'id="searchInput"',
            'id="yearFilter"',
            'id="moduleFilter"',
            'id="statsGrid"',
            'id="resumeStudyBtn"',
            'id="taskFlowSection"',
            'id="taskFlowMount"',
            'id="taskFlowSticky"',
            'id="accessGate"',
            'id="protectedMainContent"',
            'id="protectedSidebarContent"',
            'id="accessStateBadge"',
            'id="adminAccessPanel"',
            'id="adminAccessList"',
            'id="moduleList"',
            'id="moduleView"',
            'id="studyTitle"',
            'id="studyContent"',
            'id="studyNotes"',
            'id="quizDialog"',
            'id="flashcardDialog"',
            'type="module" src="./app.js',
            'href="./styles.css',
            'src="./firebase-config.js',
        ],
        "a-level-economics-notes.html": ['href="./styles.css'],
        "a-level-economics-diagrams.html": ['href="./styles.css'],
        "a-level-economics-questions.html": ['href="./styles.css'],
        "a-level-economics-revision.html": ['href="./styles.css'],
        "edexcel-a-level-economics-revision.html": ['href="./styles.css'],
    }

    for page_name, snippets in page_requirements.items():
        content = read_text(SITE / page_name)
        for snippet in snippets:
            if snippet not in content:
                fail(f"{page_name} is missing required markup: {snippet}")


def validate_dom_wiring() -> None:
    dom_js = read_text(SITE / "js" / "ui" / "dom.js")
    for key in (
        "taskFlowSection",
        "taskFlowMount",
        "taskFlowSticky",
        "protectedSidebarContent",
        "accessGate",
        "accessGateTitle",
        "accessGateText",
        "accessGateActions",
        "protectedMainContent",
        "resumeStudyBtn",
        "moduleList",
        "moduleView",
        "studyContent",
        "studyNotes",
        "quizDialog",
        "flashcardDialog",
        "accessStateBadge",
        "adminAccessPanel",
        "adminAccessMeta",
        "adminAccessSearch",
        "refreshAccessListBtn",
        "adminAccessList",
    ):
        if f"{key}:" not in dom_js:
            fail(f"DOM registry is missing expected element mapping: {key}")


def validate_frontend_wiring() -> None:
    app_js = read_text(SITE / "app.js")
    access_control_js = read_text(SITE / "js" / "features" / "access-control.js")
    task_flow_js = read_text(SITE / "js" / "features" / "task-flow.js")
    progress_storage_js = read_text(SITE / "js" / "services" / "progress-storage.js")
    constants_js = read_text(SITE / "js" / "config" / "constants.js")
    labels_js = read_text(SITE / "js" / "utils" / "labels.js")

    required_app_snippets = [
        'import { createDashboardFeature } from "./js/features/dashboard.js";',
        'import { createAccessControlFeature } from "./js/features/access-control.js";',
        'import { initTaskFlow } from "./js/features/task-flow.js";',
        'getTopicVideoIndex',
        'window.addEventListener("hashchange", syncRouteToView);',
        'const nextHash = `#module/${encodeURIComponent(moduleId)}`;',
        'state.progress.taskFlow ??= {',
        "accessControlFeature = createAccessControlFeature({",
        'taskFlow = initTaskFlow({',
        'taskFlow?.renderTaskFlow();',
        'async function openTopicStudy(topic) {',
        'async function openQuiz(topic, quiz) {',
    ]
    for snippet in required_app_snippets:
        if snippet not in app_js:
            fail(f"site/app.js is missing expected wiring: {snippet}")

    required_task_flow_exports = [
        "export function getProgress()",
        "export function saveProgress()",
        "export function clearProgress()",
        "export function setState(",
        "export function setRevisionMode(",
        "export function setTopic(",
        "export function markConfidence(",
        "export function renderTaskFlow()",
        "export function showRecovery(",
        "export function handleMissingContent(",
        "export function initTaskFlow(",
    ]
    for snippet in required_task_flow_exports:
        if snippet not in task_flow_js:
            fail(f"site/js/features/task-flow.js is missing required export: {snippet}")

    required_access_exports = [
        "export function createAccessControlFeature(",
        "function createEmptyAccessRecord(",
        "function renderAccessGateUi(",
        "function renderAdminList(",
        "function renderAuthUi(",
    ]
    for snippet in required_access_exports:
        if snippet not in access_control_js:
            fail(f"site/js/features/access-control.js is missing expected access-control logic: {snippet}")

    if 'import { STORAGE_KEY } from "../config/constants.js";' not in progress_storage_js:
        fail("Progress storage no longer imports STORAGE_KEY from constants.js")

    if 'export const STORAGE_KEY = "uplearn-econ-progress-v3";' not in constants_js:
        fail("Progress storage key changed unexpectedly; local progress compatibility would break")

    for snippet in (
        "export function getVideoLabel(",
        "export function getTopicVideoIndex(",
        "export function getAdjacentTopicVideos(",
    ):
        if snippet not in labels_js:
            fail(f"site/js/utils/labels.js is missing required video helper: {snippet}")


def validate_catalog(catalog: dict) -> None:
    for key in ("summary", "stats", "modules"):
        if key not in catalog:
            fail(f"Catalog missing top-level key: {key}")

    modules = catalog["modules"]
    if not isinstance(modules, list) or not modules:
        fail("Catalog modules must be a non-empty list")

    summary_modules = catalog.get("summary", {}).get("modules", [])
    if len(summary_modules) != len(modules):
        fail(
            f"Catalog summary/modules mismatch: summary has {len(summary_modules)} modules, "
            f"main modules list has {len(modules)}"
        )

    seen_module_ids = set()
    seen_topic_ids = set()
    stats = {
        "modules": 0,
        "topics": 0,
        "videos": 0,
        "quizzes": 0,
        "quizQuestions": 0,
        "definitions": 0,
        "examPapers": 0,
        "examQuestions": 0,
    }

    for module in modules:
        module_id = str(module.get("id", ""))
        if not module_id:
            fail("Found module without id")
        if module_id in seen_module_ids:
            fail(f"Duplicate module id: {module_id}")
        seen_module_ids.add(module_id)
        stats["modules"] += 1

        ensure_path(module.get("path"), f"module {module_id} path")
        ensure_path(module.get("readmePath"), f"module {module_id} readmePath")

        if not module.get("title"):
            fail(f"Module {module_id} is missing title")
        if not isinstance(module.get("topics"), list):
            fail(f"Module {module_id} topics must be a list")
        module_has_study_resource = False

        for definition_group in module.get("definitions", []):
            ensure_path(definition_group.get("jsonPath"), f"definition group {definition_group.get('id')}")
            if definition_group.get("htmlPath"):
                ensure_path(definition_group.get("htmlPath"), f"definition group {definition_group.get('id')} html")
            stats["definitions"] += len(definition_group.get("items", []))

        for paper in module.get("examPapers", []):
            ensure_path(paper.get("jsonPath"), f"exam paper {paper.get('title')}")
            if paper.get("htmlPath"):
                ensure_path(paper.get("htmlPath"), f"exam paper {paper.get('title')} html")
            stats["examPapers"] += 1
            stats["examQuestions"] += int(paper.get("questionCount") or 0)

        for topic in module.get("topics", []):
            topic_id = str(topic.get("id", ""))
            if not topic_id:
                fail(f"Found topic without id in module {module_id}")
            if topic_id in seen_topic_ids:
                fail(f"Duplicate topic id: {topic_id}")
            seen_topic_ids.add(topic_id)
            stats["topics"] += 1

            ensure_path(topic.get("path"), f"topic {topic_id} path")
            ensure_path(topic.get("jsonPath"), f"topic {topic_id} jsonPath")
            if topic.get("summaryHtmlPath"):
                ensure_path(topic.get("summaryHtmlPath"), f"topic {topic_id} summaryHtmlPath")
            if topic.get("summaryJsonPath"):
                ensure_path(topic.get("summaryJsonPath"), f"topic {topic_id} summaryJsonPath")

            if not topic.get("name"):
                fail(f"Topic {topic_id} is missing name")
            if not isinstance(topic.get("videos", []), list):
                fail(f"Topic {topic_id} videos must be a list")
            if not isinstance(topic.get("quizzes", []), list):
                fail(f"Topic {topic_id} quizzes must be a list")
            if not isinstance(topic.get("articleLessons", []), list):
                fail(f"Topic {topic_id} articleLessons must be a list")

            if (
                topic.get("summaryHtmlPath")
                or topic.get("summaryJsonPath")
                or topic.get("videos")
                or topic.get("quizzes")
                or topic.get("articleLessons")
            ):
                module_has_study_resource = True

            for article in topic.get("articleLessons", []):
                ensure_path(article.get("htmlPath"), f"article lesson {article.get('title')}")
                if article.get("jsonPath"):
                    ensure_path(article.get("jsonPath"), f"article lesson {article.get('title')} json")

            seen_video_orders = set()
            stats["videos"] += len(topic.get("videos", []))
            for video in topic.get("videos", []):
                if video.get("videoPath"):
                    ensure_path(video.get("videoPath"), f"video {video.get('title')}")
                if video.get("htmlPath"):
                    ensure_path(video.get("htmlPath"), f"video {video.get('title')} html")
                if video.get("jsonPath"):
                    ensure_path(video.get("jsonPath"), f"video {video.get('title')} json")
                if video.get("wistiaPath"):
                    ensure_path(video.get("wistiaPath"), f"video {video.get('title')} wistia")

                display_order = int(video.get("displayOrder") or 0)
                if display_order > 0:
                    if display_order in seen_video_orders:
                        fail(f"Topic {topic_id} has duplicate video displayOrder {display_order}")
                    seen_video_orders.add(display_order)

                display_title = str(video.get("displayTitle") or "")
                if display_title and not re.match(r"^Video\s+\d+\s+-\s+.+", display_title):
                    fail(f"Unexpected video displayTitle format in topic {topic_id}: {display_title}")

            for quiz in topic.get("quizzes", []):
                ensure_path(quiz.get("jsonPath"), f"quiz {quiz.get('title')}")
                if quiz.get("htmlPath"):
                    ensure_path(quiz.get("htmlPath"), f"quiz {quiz.get('title')} html")
                if quiz.get("assetFolder"):
                    ensure_path(quiz.get("assetFolder"), f"quiz {quiz.get('title')} assets")
                stats["quizzes"] += 1
                stats["quizQuestions"] += int(quiz.get("questionCount") or 0)

        visible_topic_count = len(module.get("topics", []))
        if visible_topic_count == 0:
            fail(f"Module {module_id} has no topics")
        if not module_has_study_resource:
            fail(f"Module {module_id} has no usable study resources across its topics")

    catalog_stats = catalog["stats"]
    mismatched = [
        f"{key}: expected {stats[key]}, found {catalog_stats.get(key)}"
        for key in stats
        if int(catalog_stats.get(key) or 0) != stats[key]
    ]
    if mismatched:
        fail("Catalog stats mismatch: " + "; ".join(mismatched))


def main() -> None:
    ensure_static_files()
    validate_html_pages()
    validate_dom_wiring()
    validate_frontend_wiring()
    validate_catalog(load_catalog())
    print("[validate_site] OK")


if __name__ == "__main__":
    main()
