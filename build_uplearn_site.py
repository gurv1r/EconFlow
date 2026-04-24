import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parent
ARCHIVE = ROOT / "archive" / "UpLearn Economics"
SITE = ROOT / "site"


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def slug(value: str) -> str:
    value = (value or "").lower()
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value or "item"


def prettify_title(value: str, fallback_prefix: str, index: int) -> str:
    value = (value or "").strip()
    if not value:
      return f"{fallback_prefix} {index}"
    if re.fullmatch(r"group-\d+-definitions", value.lower()):
      return f"{fallback_prefix} {index}"
    return value


def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def first_or_none(paths):
    for path in paths:
        return path
    return None


def build_catalog():
    summary = read_json(ARCHIVE / "summary.json")
    modules = []
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

    for module_dir in sorted(ARCHIVE.glob("Year */*")):
        if not module_dir.is_dir():
            continue
        module_json = module_dir / "module.json"
        if not module_json.exists():
            continue
        module = read_json(module_json)
        module_id = str(module["id"])
        module_entry = {
            "id": module_id,
            "slug": f"{module_id}-{slug(module['title'])}",
            "title": module["title"],
            "subtitle": module.get("subtitle"),
            "schoolYear": module.get("schoolYear"),
            "yearFolder": module_dir.parent.name,
            "course": module.get("course", {}),
            "path": rel(module_dir),
            "readmePath": rel(module_dir / "README.md"),
            "topics": [],
            "definitions": [],
            "examPapers": [],
        }
        stats["modules"] += 1

        definition_dir = module_dir / "Definitions"
        if definition_dir.exists():
            for def_index, def_json in enumerate(sorted(definition_dir.glob("*.json")), start=1):
                if def_json.name == "module.json":
                    continue
                definition_group = read_json(def_json)
                defs = definition_group.get("definitions") or []
                group_title = prettify_title(definition_group.get("title") or def_json.stem, "Definition Set", def_index)
                module_entry["definitions"].append(
                    {
                        "id": def_json.stem,
                        "title": group_title,
                        "count": len(defs),
                        "jsonPath": rel(def_json),
                        "htmlPath": rel(def_json.with_suffix(".html")) if def_json.with_suffix(".html").exists() else None,
                        "items": [
                            {
                                "id": str(item.get("id")),
                                "prompt": item.get("questionOrTerm") or "",
                                "answer": item.get("answerOrMeaning") or "",
                                "isQuestion": bool(item.get("isQuestion")),
                                "definitionNumber": item.get("definitionNumber"),
                            }
                            for item in defs
                        ],
                    }
                )
                stats["definitions"] += len(defs)

        exam_dir = module_dir / "Exam Papers"
        if exam_dir.exists():
            for paper_dir in sorted(p for p in exam_dir.iterdir() if p.is_dir()):
                paper_json = paper_dir / "paper.json"
                if not paper_json.exists():
                    continue
                paper = read_json(paper_json)
                question_count = len(paper.get("questions") or [])
                module_entry["examPapers"].append(
                    {
                        "title": paper.get("name") or paper_dir.name,
                        "code": paper.get("code"),
                        "questionCount": question_count,
                        "jsonPath": rel(paper_json),
                        "htmlPath": rel(paper_dir / "index.html") if (paper_dir / "index.html").exists() else None,
                    }
                )
                stats["examPapers"] += 1
                stats["examQuestions"] += question_count

        topics_root = module_dir / "Topics"
        if topics_root.exists():
            for section_dir in sorted(p for p in topics_root.iterdir() if p.is_dir()):
                section_name = re.sub(r"^\d+\s*-\s*", "", section_dir.name)
                for topic_dir in sorted(p for p in section_dir.iterdir() if p.is_dir()):
                    subsection_json = topic_dir / "subsection.json"
                    if not subsection_json.exists():
                        continue
                    subsection = read_json(subsection_json)
                    topic_entry = {
                        "id": str(subsection["id"]),
                        "section": section_name,
                        "sectionFolder": section_dir.name,
                        "name": subsection["name"],
                        "subsectionNumber": subsection.get("subsectionNumber"),
                        "path": rel(topic_dir),
                        "jsonPath": rel(subsection_json),
                        "summaryHtmlPath": rel(topic_dir / "summary.html") if (topic_dir / "summary.html").exists() else None,
                        "summaryJsonPath": rel(topic_dir / "summary.json") if (topic_dir / "summary.json").exists() else None,
                        "articleLessons": [],
                        "quizzes": [],
                        "videos": [],
                        "videoCount": len(subsection.get("videoLessons") or []) + len(subsection.get("examHowToLessons") or []),
                    }
                    stats["topics"] += 1

                    article_dir = topic_dir / "Article Lessons"
                    if article_dir.exists():
                        for article_html in sorted(article_dir.glob("*.html")):
                            topic_entry["articleLessons"].append(
                                {
                                    "title": article_html.stem,
                                    "htmlPath": rel(article_html),
                                    "jsonPath": rel(article_html.with_suffix(".json")) if article_html.with_suffix(".json").exists() else None,
                                }
                            )

                    quiz_dir = topic_dir / "Quiz Content"
                    if quiz_dir.exists():
                        for quiz_json in sorted(quiz_dir.glob("*.json")):
                            quiz = read_json(quiz_json)
                            question_count = len(quiz.get("progressQuizQuestions") or [])
                            asset_dir = quiz_dir / f"{quiz_json.stem} Assets"
                            topic_entry["quizzes"].append(
                                {
                                    "title": quiz.get("title") or quiz_json.stem,
                                    "questionCount": question_count,
                                    "jsonPath": rel(quiz_json),
                                    "htmlPath": rel(quiz_json.with_suffix(".html")) if quiz_json.with_suffix(".html").exists() else None,
                                    "assetFolder": rel(asset_dir) if asset_dir.exists() else None,
                                }
                            )
                            stats["quizzes"] += 1
                            stats["quizQuestions"] += question_count

                    video_root = module_dir / "Videos" / topic_dir.name
                    if video_root.exists():
                        for lesson_dir in sorted(p for p in video_root.iterdir() if p.is_dir()):
                            video_path = first_or_none(lesson_dir.glob("video.*"))
                            topic_entry["videos"].append(
                                {
                                    "title": re.sub(r"^(Video Lesson|Exam How-To)\s*-\s*", "", lesson_dir.name),
                                    "kind": "Exam How-To" if lesson_dir.name.startswith("Exam How-To") else "Video Lesson",
                                    "folder": rel(lesson_dir),
                                    "videoPath": rel(video_path) if video_path else None,
                                    "htmlPath": rel(lesson_dir / "index.html") if (lesson_dir / "index.html").exists() else None,
                                    "jsonPath": rel(lesson_dir / "lesson.json") if (lesson_dir / "lesson.json").exists() else None,
                                    "wistiaPath": rel(lesson_dir / "wistia.json") if (lesson_dir / "wistia.json").exists() else None,
                                }
                            )
                            stats["videos"] += 1

                    module_entry["topics"].append(topic_entry)

        modules.append(module_entry)

    return {
        "summary": summary,
        "stats": stats,
        "modules": modules,
    }


def write_catalog():
    SITE.mkdir(exist_ok=True)
    catalog = build_catalog()
    (SITE / "catalog.json").write_text(json.dumps(catalog, indent=2, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    write_catalog()
    print(f"Catalog written to {SITE / 'catalog.json'}")
