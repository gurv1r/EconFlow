import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
CATALOG = SITE / "catalog.json"


def fail(message: str) -> None:
    print(f"[validate_site] ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


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
        SITE / "js" / "config" / "constants.js",
        SITE / "js" / "config" / "env.js",
        SITE / "js" / "config" / "spec-map.js",
        SITE / "js" / "services" / "archive-resources.js",
        SITE / "js" / "services" / "cloud-config.js",
        SITE / "js" / "services" / "progress-storage.js",
        SITE / "js" / "features" / "dashboard.js",
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


def validate_catalog(catalog: dict) -> None:
    for key in ("summary", "stats", "modules"):
        if key not in catalog:
            fail(f"Catalog missing top-level key: {key}")

    modules = catalog["modules"]
    if not isinstance(modules, list) or not modules:
        fail("Catalog modules must be a non-empty list")

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

            for article in topic.get("articleLessons", []):
                ensure_path(article.get("htmlPath"), f"article lesson {article.get('title')}")
                if article.get("jsonPath"):
                    ensure_path(article.get("jsonPath"), f"article lesson {article.get('title')} json")

            for quiz in topic.get("quizzes", []):
                ensure_path(quiz.get("jsonPath"), f"quiz {quiz.get('title')}")
                if quiz.get("htmlPath"):
                    ensure_path(quiz.get("htmlPath"), f"quiz {quiz.get('title')} html")
                if quiz.get("assetFolder"):
                    ensure_path(quiz.get("assetFolder"), f"quiz {quiz.get('title')} assets")
                stats["quizzes"] += 1
                stats["quizQuestions"] += int(quiz.get("questionCount") or 0)

            videos = topic.get("videos", [])
            stats["videos"] += len(videos)
            for video in videos:
                if video.get("videoPath"):
                    ensure_path(video.get("videoPath"), f"video {video.get('title')}")
                if video.get("htmlPath"):
                    ensure_path(video.get("htmlPath"), f"video {video.get('title')} html")
                if video.get("jsonPath"):
                    ensure_path(video.get("jsonPath"), f"video {video.get('title')} json")
                if video.get("wistiaPath"):
                    ensure_path(video.get("wistiaPath"), f"video {video.get('title')} wistia")

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
    validate_catalog(load_catalog())
    print("[validate_site] OK")


if __name__ == "__main__":
    main()
