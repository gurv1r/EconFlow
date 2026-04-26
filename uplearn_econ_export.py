import concurrent.futures
import html
import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


API_URL = "https://web.uplearn.co.uk/api/"
TOKEN = os.environ.get("UPLEARN_TOKEN", "")
BASE_DIR = Path(__file__).resolve().parent / "archive" / "UpLearn Economics"
USER_AGENT = "Mozilla/5.0"

if not TOKEN:
    raise RuntimeError("Set the UPLEARN_TOKEN environment variable before running this export script.")

MODULE_HEADER_QUERY = """
query($id: ID!) {
  module(id: $id) {
    id
    title
    subtitle
    schoolYear
    uniqueCode
    course {
      name
      subject { name }
      board { name }
    }
  }
}
"""

CURRENT_USER_QUERY = """
query {
  currentUser {
    id
    email
    enrolments {
      moduleId
      id
      isTrial
      createdAt
    }
  }
}
"""

MODULE_FULL_QUERY = """
query($id: ID!) {
  module(id: $id) {
    id
    title
    subtitle
    schoolYear
    uniqueCode
    markSchemeGuidanceUrl
    course {
      name
      subject { name }
      board { name }
    }
    definitionGroups {
      id
      title
      uniqueCode
      recallType
      definitions {
        id
        questionOrTerm
        answerOrMeaning
        isQuestion
        definitionNumber
      }
    }
    sectionGroups {
      id
      name
      position
      uniqueCode
      subsections {
        id
        name
        uniqueCode
        subsectionNumber
        preActivitiesNotice
        postActivitiesNotice
        summaryOnly
        summary {
          id
          articleContent
          wistiaVideoId
          wistiaVideoSecondsDuration
          article {
            id
            title
            parts { content }
          }
        }
        articleLessons {
          id
          title
          uniqueCode
          keypoints
          extraContent
        }
        videoLessons {
          id
          title
          uniqueCode
          keypoints
          extraContent
          captions
          wistiaId
        }
        examHowToLessons {
          id
          title
          uniqueCode
          extraContent
          wistiaId
        }
        progressQuizGroups {
          id
          title
          uniqueCode
          quizType
          progressQuizQuestions {
            id
            question
            questionNumber
            challengeQuestionNumber
            questionType
            quizContent {
              id
              stem
              explanation
              marks
              quizType
              quizDefinition {
                explanation {
                  text
                  image
                  topImage
                }
                questions {
                  __typename
                  ... on MultipleChoiceQuestion {
                    question
                    description
                    image
                    topImage
                    correctOptionIndex
                    options {
                      text
                      image
                      explanation
                      explanationImage
                    }
                  }
                  ... on MultiMultipleChoiceQuestion {
                    question
                    description
                    image
                    topImage
                    options {
                      text
                      image
                      explanation
                      explanationImage
                      correct
                    }
                  }
                  ... on DropdownQuestion {
                    question
                    description
                    image
                    topImage
                    correctOptionIndex
                    dropdownOptions
                  }
                  ... on TextQuestion {
                    question
                    description
                    image
                    topImage
                    beforeText
                    afterText
                    requiredAnswers {
                      exact
                      explanation
                      ignoreSpaces
                      possibleAnswers
                      possibleHiddenAnswers
                    }
                    wrongAnswers {
                      exact
                      explanation
                      ignoreSpaces
                      possibleAnswers
                      possibleHiddenAnswers
                    }
                  }
                  ... on NumericalQuestion {
                    question
                    description
                    image
                    topImage
                    beforeText
                    afterText
                    possibleAnswers {
                      __typename
                      ... on NumericalQuestionSingleAnswer {
                        answer
                        explanation
                      }
                      ... on NumericalQuestionRangedAnswer {
                        answer {
                          first
                          last
                        }
                        explanation
                      }
                    }
                  }
                  ... on EngageQuestion {
                    question
                    description
                    image
                    topImage
                    modelAnswer
                  }
                  ... on DrawQuestion {
                    question
                    description
                    image
                    topImage
                    drawOn
                    modelAnswer
                  }
                  ... on MultipleInputQuestion {
                    description
                    image
                    topImage
                    questionSegments {
                      __typename
                      ... on MultipleInputQuestionBlank {
                        exact
                        fieldIndex
                        ignoreSpaces
                        possibleAnswers
                      }
                      ... on MultipleInputQuestionText {
                        text
                      }
                    }
                  }
                  ... on MathsQuestion {
                    question
                    description
                    image
                    topImage
                    evaluationMethod {
                      __typename
                      ... on ExactMatchEvaluation {
                        answer
                      }
                      ... on PartialMatchesEvaluation {
                        answers
                      }
                      ... on SamplingEvaluation {
                        answer
                        sampleCount
                        variables {
                          name
                          lowerBound
                          upperBound
                        }
                      }
                    }
                  }
                  ... on ChemistryQuestion {
                    question
                    description
                    image
                    topImage
                    evaluationMethod {
                      __typename
                      ... on ExactMatchEvaluation {
                        answer
                      }
                      ... on PartialMatchesEvaluation {
                        answers
                      }
                      ... on SamplingEvaluation {
                        answer
                        sampleCount
                        variables {
                          name
                          lowerBound
                          upperBound
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
        subsectionQuizSession {
          id
          currentStep
          correctDiagnosticQuestions
          correctRetestQuestions
          totalDiagnosticQuestions
        }
        diagnosticQuiz {
          id
          questions { __typename }
        }
        strengthenQuiz {
          id
          questions { __typename }
        }
      }
    }
    examPapers {
      id
      name
      code
      paperNumber
      requiresHandwrittenAnswers
      duration
      questions {
        id
        name
        content
        marksAvailable
        parts {
          id
          label
          content
          marksAvailable
          linesForAnswer
          answerType
          multipleChoiceAnswer
          answers {
            id
            title
            explanation
            markPoints {
              id
              text
              marksAvailable
              type
            }
          }
        }
      }
    }
  }
}
"""


def log(message: str) -> None:
    print(message, flush=True)


def slugify(value: str) -> str:
    value = re.sub(r"[<>:\"/\\\\|?*]+", " ", value or "")
    value = re.sub(r"\s+", " ", value).strip().rstrip(".")
    return value[:140] if value else "untitled"


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def write_json(path: Path, payload) -> None:
    ensure_dir(path.parent)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def write_text(path: Path, content: str) -> None:
    ensure_dir(path.parent)
    path.write_text(content, encoding="utf-8")


def graphql(query: str, variables=None):
    data = json.dumps({"query": query, "variables": variables or {}}).encode("utf-8")
    request = urllib.request.Request(
        API_URL,
        data=data,
        headers={
            "accept": "*/*",
            "authorization": f"Bearer {TOKEN}",
            "content-type": "application/json",
            "origin": "https://web.uplearn.co.uk",
            "referer": "https://web.uplearn.co.uk/learn",
            "user-agent": USER_AGENT,
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if payload.get("errors"):
        raise RuntimeError(payload["errors"])
    return payload["data"]


def html_shell(title: str, body_html: str) -> str:
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{html.escape(title)}</title>
  <style>
    body {{
      font-family: Arial, sans-serif;
      line-height: 1.6;
      margin: 40px auto;
      max-width: 1000px;
      padding: 0 24px;
    }}
    h1, h2, h3 {{ line-height: 1.2; }}
    pre {{ white-space: pre-wrap; }}
    code {{ white-space: pre-wrap; }}
    img, video, iframe {{ max-width: 100%; }}
    table {{ border-collapse: collapse; width: 100%; }}
    th, td {{ border: 1px solid #ccc; padding: 8px; vertical-align: top; }}
  </style>
</head>
<body>
{body_html}
</body>
</html>
"""


def safe_stem(html_value: str | None) -> str:
    if not html_value:
        return ""
    stripped = re.sub(r"<[^>]+>", " ", html_value)
    return re.sub(r"\s+", " ", stripped).strip()


def collect_quiz_asset_urls(value, found=None):
    if found is None:
        found = set()
    if isinstance(value, dict):
        for item in value.values():
            collect_quiz_asset_urls(item, found)
    elif isinstance(value, list):
        for item in value:
            collect_quiz_asset_urls(item, found)
    elif isinstance(value, str) and value.startswith("http"):
        lower = value.lower()
        if any(ext in lower for ext in [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"]):
            found.add(value)
    return found


def render_quiz_definition(question: dict) -> str:
    quiz_content = question.get("quizContent") or {}
    quiz_definition = quiz_content.get("quizDefinition") or {}
    sections = []
    explanation = quiz_definition.get("explanation") or {}
    if explanation.get("text"):
        sections.append(f"<h3>Quiz Explanation</h3>{explanation['text']}")
    for idx, item in enumerate(quiz_definition.get("questions") or [], start=1):
        qtype = item.get("__typename", "Question")
        header = safe_stem(item.get("question")) or f"{qtype} {idx}"
        sections.append(f"<h3>{html.escape(qtype)} {idx}: {html.escape(header)}</h3>")
        if item.get("question"):
            sections.append(item["question"])
        if item.get("description"):
            sections.append(f"<div>{item['description']}</div>")
        if qtype == "MultipleChoiceQuestion":
            rows = []
            for opt_idx, opt in enumerate(item.get("options") or []):
                marker = " correct" if opt_idx == item.get("correctOptionIndex") else ""
                rows.append(
                    f"<li><strong>{html.escape(opt.get('text') or '')}</strong>{marker}"
                    + (f"<div>{opt['explanation']}</div>" if opt.get("explanation") else "")
                    + "</li>"
                )
            sections.append("<ol>" + "".join(rows) + "</ol>")
        elif qtype == "MultiMultipleChoiceQuestion":
            rows = []
            for opt in item.get("options") or []:
                marker = " correct" if opt.get("correct") else ""
                rows.append(
                    f"<li><strong>{html.escape(opt.get('text') or '')}</strong>{marker}"
                    + (f"<div>{opt['explanation']}</div>" if opt.get("explanation") else "")
                    + "</li>"
                )
            sections.append("<ul>" + "".join(rows) + "</ul>")
        elif qtype == "DropdownQuestion":
            sections.append(
                "<ol>" + "".join(
                    f"<li>{html.escape(opt or '')}"
                    + (" correct" if idx2 == item.get("correctOptionIndex") else "")
                    + "</li>"
                    for idx2, opt in enumerate(item.get("dropdownOptions") or [])
                ) + "</ol>"
            )
        elif qtype == "TextQuestion":
            reqs = item.get("requiredAnswers") or []
            wrongs = item.get("wrongAnswers") or []
            if reqs:
                sections.append("<h4>Accepted Answers</h4><ul>" + "".join(
                    f"<li>{html.escape(', '.join(ans.get('possibleAnswers') or []))}"
                    + (f"<div>{ans['explanation']}</div>" if ans.get("explanation") else "")
                    + "</li>"
                    for ans in reqs
                ) + "</ul>")
            if wrongs:
                sections.append("<h4>Rejected / Wrong Answers</h4><ul>" + "".join(
                    f"<li>{html.escape(', '.join(ans.get('possibleAnswers') or []))}"
                    + (f"<div>{ans['explanation']}</div>" if ans.get("explanation") else "")
                    + "</li>"
                    for ans in wrongs
                ) + "</ul>")
        elif qtype == "NumericalQuestion":
            answers = item.get("possibleAnswers") or []
            sections.append("<h4>Accepted Numerical Answers</h4><ul>" + "".join(
                (
                    f"<li>{html.escape(str(ans.get('answer')))}"
                    if ans.get("__typename") == "NumericalQuestionSingleAnswer"
                    else f"<li>{html.escape(str((ans.get('answer') or {}).get('first')))} to {html.escape(str((ans.get('answer') or {}).get('last')))}"
                ) + (f"<div>{ans['explanation']}</div>" if ans.get("explanation") else "") + "</li>"
                for ans in answers
            ) + "</ul>")
        elif qtype == "MultipleInputQuestion":
            parts = []
            for seg in item.get("questionSegments") or []:
                if seg.get("__typename") == "MultipleInputQuestionText":
                    parts.append(html.escape(seg.get("text") or ""))
                elif seg.get("__typename") == "MultipleInputQuestionBlank":
                    parts.append(f"[{html.escape(', '.join(seg.get('possibleAnswers') or []))}]")
            sections.append("<p>" + " ".join(parts) + "</p>")
        elif qtype in {"MathsQuestion", "ChemistryQuestion"}:
            evalm = item.get("evaluationMethod") or {}
            sections.append(f"<p><strong>Evaluation:</strong> {html.escape(evalm.get('__typename') or '')}</p>")
            if evalm.get("answer"):
                sections.append(f"<p><strong>Answer:</strong> {html.escape(str(evalm['answer']))}</p>")
            if evalm.get("answers"):
                sections.append("<ul>" + "".join(f"<li>{html.escape(str(a))}</li>" for a in (evalm.get("answers") or [])) + "</ul>")
            if evalm.get("variables"):
                sections.append("<ul>" + "".join(
                    f"<li>{html.escape(v.get('name') or '')}: {v.get('lowerBound')} to {v.get('upperBound')}</li>"
                    for v in evalm.get("variables") or []
                ) + "</ul>")
        elif qtype in {"EngageQuestion", "DrawQuestion"}:
            if item.get("modelAnswer"):
                sections.append(f"<h4>Model Answer</h4>{item['modelAnswer']}")
            if item.get("drawOn"):
                sections.append(f"<p><strong>Draw On:</strong> {html.escape(item['drawOn'])}</p>")
    return "\n".join(sections)


def download_file(url: str, destination: Path, retries: int = 3) -> dict:
    ensure_dir(destination.parent)
    if destination.exists() and destination.stat().st_size > 0:
        return {"path": str(destination), "status": "skipped", "size": destination.stat().st_size}
    last_error = None
    for attempt in range(1, retries + 1):
        try:
            request = urllib.request.Request(url, headers={"user-agent": USER_AGENT})
            with urllib.request.urlopen(request, timeout=300) as response, destination.open("wb") as handle:
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    handle.write(chunk)
            return {"path": str(destination), "status": "downloaded", "size": destination.stat().st_size}
        except Exception as exc:  # noqa: BLE001
            last_error = str(exc)
            if destination.exists():
                try:
                    destination.unlink()
                except OSError:
                    pass
            time.sleep(min(attempt * 2, 6))
    return {"path": str(destination), "status": "failed", "error": last_error}


def wistia_metadata(wistia_id: str):
    url = f"https://fast.wistia.com/embed/medias/{wistia_id}.json"
    request = urllib.request.Request(url, headers={"user-agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.loads(response.read().decode("utf-8"))


def best_video_asset(media: dict):
    assets = media.get("assets", [])
    ranked = []
    for asset in assets:
        if not asset.get("public"):
            continue
        asset_url = asset.get("url")
        if not asset_url:
            continue
        ext = asset.get("ext")
        container = asset.get("container")
        width = asset.get("width") or 0
        height = asset.get("height") or 0
        size = asset.get("size") or 0
        asset_type = asset.get("type") or ""
        is_video = ext in {"mp4", "mov", "m4v"} or container in {"mp4", "mov"} or "video" in asset_type or asset_type == "original"
        if not is_video:
            continue
        score = 0
        if asset_type == "original":
            score += 1000000
        score += width * height
        score += min(size, 2_000_000_000) // 1024
        ranked.append((score, asset))
    if not ranked:
        return None
    ranked.sort(key=lambda item: item[0], reverse=True)
    return ranked[0][1]


def caption_assets(media: dict):
    results = []
    for asset in media.get("assets", []):
        asset_type = (asset.get("type") or "").lower()
        ext = (asset.get("ext") or "").lower()
        if "caption" in asset_type or ext in {"vtt", "srt"}:
            if asset.get("url"):
                results.append(asset)
    for caption in media.get("captions", []) or []:
        if caption.get("url"):
            results.append(caption)
    return results


def export_video_lesson(module_dir: Path, section_name: str, subsection_name: str, subsection_number: int, lesson: dict, lesson_kind: str, manifest: list) -> None:
    wistia_id = lesson.get("wistiaId")
    if not wistia_id:
        return
    video_dir = (
        module_dir
        / "Videos"
        / f"{subsection_number:02d} - {slugify(subsection_name)}"
        / f"{lesson_kind} - {slugify(lesson.get('title') or lesson.get('uniqueCode') or wistia_id)}"
    )
    ensure_dir(video_dir)
    meta = wistia_metadata(wistia_id)
    write_json(video_dir / "wistia.json", meta)
    media = meta.get("media", {})
    write_json(video_dir / "lesson.json", lesson)

    title_html = html.escape(lesson.get("title") or wistia_id)
    body = [
        f"<h1>{title_html}</h1>",
        f"<p><strong>Section:</strong> {html.escape(section_name)}</p>",
        f"<p><strong>Subsection:</strong> {html.escape(subsection_name)}</p>",
        f"<p><strong>Wistia ID:</strong> {html.escape(wistia_id)}</p>",
    ]
    if lesson.get("keypoints"):
        body.append(f"<h2>Keypoints</h2>{lesson['keypoints']}")
    if lesson.get("extraContent"):
        body.append(f"<h2>Extra Content</h2>{lesson['extraContent']}")
    if lesson.get("captions"):
        body.append(f"<h2>Captions (Inline)</h2><pre>{html.escape(lesson['captions'])}</pre>")
    write_text(video_dir / "index.html", html_shell(lesson.get("title") or wistia_id, "\n".join(body)))

    asset = best_video_asset(media)
    if asset:
        ext = asset.get("ext") or "mp4"
        file_name = f"video.{ext}"
        result = download_file(asset["url"], video_dir / file_name)
        manifest.append(
            {
                "type": "video",
                "title": lesson.get("title"),
                "module": str(module_dir.name),
                "subsection": subsection_name,
                "wistiaId": wistia_id,
                "assetType": asset.get("type"),
                "file": str((video_dir / file_name).relative_to(BASE_DIR)),
                **result,
            }
        )
    for idx, asset in enumerate(caption_assets(media), start=1):
        ext = asset.get("ext") or "txt"
        caption_path = video_dir / f"captions_{idx}.{ext}"
        result = download_file(asset["url"], caption_path)
        manifest.append(
            {
                "type": "caption",
                "title": lesson.get("title"),
                "module": str(module_dir.name),
                "subsection": subsection_name,
                "wistiaId": wistia_id,
                "file": str(caption_path.relative_to(BASE_DIR)),
                **result,
            }
        )
    thumbnail_url = media.get("thumbnail", {}).get("url") or media.get("thumbnail_url")
    if thumbnail_url:
        thumb_path = video_dir / "thumbnail.jpg"
        result = download_file(thumbnail_url, thumb_path)
        manifest.append(
            {
                "type": "thumbnail",
                "title": lesson.get("title"),
                "module": str(module_dir.name),
                "subsection": subsection_name,
                "wistiaId": wistia_id,
                "file": str(thumb_path.relative_to(BASE_DIR)),
                **result,
            }
        )


def export_subsection(module_dir: Path, section: dict, subsection: dict) -> dict:
    subsection_dir = (
        module_dir
        / "Topics"
        / f"{section['position']:02d} - {slugify(section['name'])}"
        / f"{subsection['subsectionNumber']:02d} - {slugify(subsection['name'])}"
    )
    ensure_dir(subsection_dir)
    write_json(subsection_dir / "subsection.json", subsection)
    summary = subsection.get("summary")
    if summary:
        write_json(subsection_dir / "summary.json", summary)
        summary_parts = []
        summary_title = subsection["name"]
        if summary.get("article", {}).get("title"):
            summary_title = summary["article"]["title"]
        summary_parts.append(f"<h1>{html.escape(summary_title)}</h1>")
        if summary.get("articleContent"):
            summary_parts.append(summary["articleContent"])
        article = summary.get("article") or {}
        if article.get("parts"):
            summary_parts.append("<h2>Article Parts</h2>")
            for part in article["parts"]:
                if part.get("content"):
                    summary_parts.append(part["content"])
        if summary.get("wistiaVideoId"):
            summary_parts.append(f"<p><strong>Summary Video Wistia ID:</strong> {html.escape(summary['wistiaVideoId'])}</p>")
        write_text(subsection_dir / "summary.html", html_shell(summary_title, "\n".join(summary_parts)))
    article_lessons = subsection.get("articleLessons") or []
    if article_lessons:
        article_dir = subsection_dir / "Article Lessons"
        ensure_dir(article_dir)
        for idx, lesson in enumerate(article_lessons, start=1):
            lesson_name = f"{idx:02d} - {slugify(lesson['title'])}"
            payload = [
                f"<h1>{html.escape(lesson['title'])}</h1>",
                f"<p><strong>Unique Code:</strong> {html.escape(lesson['uniqueCode'])}</p>",
            ]
            if lesson.get("keypoints"):
                payload.append(f"<h2>Keypoints</h2>{lesson['keypoints']}")
            if lesson.get("extraContent"):
                payload.append(f"<h2>Extra Content</h2>{lesson['extraContent']}")
            write_json(article_dir / f"{lesson_name}.json", lesson)
            write_text(article_dir / f"{lesson_name}.html", html_shell(lesson["title"], "\n".join(payload)))
    progress_quiz_groups = subsection.get("progressQuizGroups") or []
    if progress_quiz_groups:
        quiz_dir = subsection_dir / "Quiz Content"
        ensure_dir(quiz_dir)
        for idx, group in enumerate(progress_quiz_groups, start=1):
            group_name = f"{idx:02d} - {slugify(group['title'])}"
            write_json(quiz_dir / f"{group_name}.json", group)
            asset_dir = quiz_dir / f"{group_name} Assets"
            asset_urls = sorted(collect_quiz_asset_urls(group))
            if asset_urls:
                ensure_dir(asset_dir)
                for asset_idx, url in enumerate(asset_urls, start=1):
                    parsed = urllib.parse.urlparse(url)
                    ext = Path(parsed.path).suffix or ".bin"
                    download_file(url, asset_dir / f"{asset_idx:03d}{ext}")
            body = [
                f"<h1>{html.escape(group['title'])}</h1>",
                f"<p><strong>Quiz Type:</strong> {html.escape(str(group.get('quizType')))}</p>",
            ]
            for question in sorted(group.get("progressQuizQuestions") or [], key=lambda item: item.get("questionNumber") or 0):
                question_label = question.get("question") or question.get("quizContent", {}).get("stem") or ""
                body.append(
                    f"<h2>Question {question.get('questionNumber')} ({html.escape(str(question.get('questionType')))}): "
                    f"{html.escape(question_label)}</h2>"
                )
                quiz_content = question.get("quizContent") or {}
                if quiz_content.get("stem") and quiz_content.get("stem") != question_label:
                    body.append(quiz_content["stem"])
                if quiz_content.get("explanation"):
                    body.append(f"<h3>Explanation</h3>{quiz_content['explanation']}")
                if quiz_content.get("marks") is not None:
                    body.append(f"<p><strong>Marks:</strong> {quiz_content['marks']}</p>")
                detailed = render_quiz_definition(question)
                if detailed:
                    body.append(detailed)
            write_text(quiz_dir / f"{group_name}.html", html_shell(group["title"], "\n".join(body)))
    return {
        "path": str(subsection_dir.relative_to(BASE_DIR)),
        "videoLessons": len(subsection.get("videoLessons") or []),
        "examHowToLessons": len(subsection.get("examHowToLessons") or []),
        "articleLessons": len(article_lessons),
        "progressQuizGroups": len(progress_quiz_groups),
        "progressQuizQuestions": sum(len(group.get("progressQuizQuestions") or []) for group in progress_quiz_groups),
        "hasSummary": bool(summary),
    }


def export_exam_papers(module_dir: Path, exam_papers: list) -> dict:
    exam_dir = module_dir / "Exam Papers"
    ensure_dir(exam_dir)
    counts = {"papers": 0, "questions": 0, "parts": 0}
    for paper in exam_papers:
        counts["papers"] += 1
        paper_dir = exam_dir / f"{paper['paperNumber']:02d} - {slugify(paper['name'])}"
        ensure_dir(paper_dir)
        write_json(paper_dir / "paper.json", paper)
        body = [
            f"<h1>{html.escape(paper['name'])}</h1>",
            f"<p><strong>Code:</strong> {html.escape(paper['code'])}</p>",
            f"<p><strong>Duration:</strong> {html.escape(str(paper.get('duration')))}</p>",
        ]
        for q_index, question in enumerate(paper.get("questions") or [], start=1):
            counts["questions"] += 1
            body.append(f"<h2>Question {q_index}: {html.escape(question['name'])}</h2>")
            if question.get("content"):
                body.append(question["content"])
            body.append(f"<p><strong>Marks:</strong> {question['marksAvailable']}</p>")
            for part in question.get("parts") or []:
                counts["parts"] += 1
                part_label = part.get("label") or f"Part {counts['parts']}"
                body.append(f"<h3>{html.escape(part_label)} ({part['marksAvailable']} marks)</h3>")
                if part.get("content"):
                    body.append(part["content"])
                if part.get("multipleChoiceAnswer"):
                    body.append(f"<p><strong>Multiple Choice Answer:</strong> {html.escape(part['multipleChoiceAnswer'])}</p>")
                for answer in part.get("answers") or []:
                    body.append(f"<h4>{html.escape(answer.get('title') or 'Mark Scheme')}</h4>")
                    if answer.get("explanation"):
                        body.append(answer["explanation"])
                    mark_points = answer.get("markPoints") or []
                    if mark_points:
                        body.append(
                            "<ul>"
                            + "".join(
                                f"<li>{html.escape(point.get('text') or '')}"
                                f" ({point.get('marksAvailable', 0)} marks)</li>"
                                for point in mark_points
                            )
                            + "</ul>"
                        )
        write_text(paper_dir / "index.html", html_shell(paper["name"], "\n".join(body)))
    return counts


def export_definitions(module_dir: Path, definition_groups: list) -> int:
    if not definition_groups:
        return 0
    defs_dir = module_dir / "Definitions"
    ensure_dir(defs_dir)
    total = 0
    for idx, group in enumerate(definition_groups, start=1):
        total += len(group.get("definitions") or [])
        group_name = f"{idx:02d} - {slugify(group['title'])}"
        write_json(defs_dir / f"{group_name}.json", group)
        rows = []
        for definition in group.get("definitions") or []:
            term = html.escape(definition.get("questionOrTerm") or "")
            meaning = html.escape(definition.get("answerOrMeaning") or "")
            rows.append(f"<tr><td>{term}</td><td>{meaning}</td></tr>")
        body = [
            f"<h1>{html.escape(group['title'])}</h1>",
            "<table><thead><tr><th>Term / Question</th><th>Meaning / Answer</th></tr></thead><tbody>",
            "".join(rows),
            "</tbody></table>",
        ]
        write_text(defs_dir / f"{group_name}.html", html_shell(group["title"], "\n".join(body)))
    return total


def export_module(module: dict, manifest: list) -> dict:
    year_label = "Year 12" if module.get("schoolYear") == "Y12" else "Year 13"
    module_dir = BASE_DIR / year_label / f"{module['id']} - {slugify(module['title'])}"
    ensure_dir(module_dir)
    write_json(module_dir / "module.json", module)

    section_manifest = []
    video_jobs = []
    for section in sorted(module.get("sectionGroups") or [], key=lambda item: item.get("position") or 0):
        for subsection in sorted(section.get("subsections") or [], key=lambda item: item.get("subsectionNumber") or 0):
            section_manifest.append(export_subsection(module_dir, section, subsection))
            for lesson in subsection.get("videoLessons") or []:
                video_jobs.append((section["name"], subsection["name"], subsection["subsectionNumber"], lesson, "Video Lesson"))
            for lesson in subsection.get("examHowToLessons") or []:
                video_jobs.append((section["name"], subsection["name"], subsection["subsectionNumber"], lesson, "Exam How-To"))

    video_errors = []
    manifest_lock = threading.Lock()

    def worker(job):
        section_name, subsection_name, subsection_number, lesson, kind = job
        try:
            local_manifest = []
            export_video_lesson(module_dir, section_name, subsection_name, subsection_number, lesson, kind, local_manifest)
            with manifest_lock:
                manifest.extend(local_manifest)
        except Exception as exc:  # noqa: BLE001
            video_errors.append({"title": lesson.get("title"), "wistiaId": lesson.get("wistiaId"), "error": str(exc)})

    if video_jobs:
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
            list(pool.map(worker, video_jobs))

    exam_counts = export_exam_papers(module_dir, module.get("examPapers") or [])
    definition_count = export_definitions(module_dir, module.get("definitionGroups") or [])

    readme_lines = [
        f"# {module['title']}",
        "",
        f"- Course: {module['course']['name']}",
        f"- Year: {year_label}",
        f"- Board: {module['course']['board']['name']}",
        f"- Subject: {module['course']['subject']['name']}",
        f"- Sections: {len(module.get('sectionGroups') or [])}",
        f"- Topic folders: {len(section_manifest)}",
        f"- Definition groups: {len(module.get('definitionGroups') or [])}",
        f"- Definitions: {definition_count}",
        f"- Exam papers: {exam_counts['papers']}",
        f"- Exam questions: {exam_counts['questions']}",
        f"- Exam parts: {exam_counts['parts']}",
        f"- Video lessons queued: {len(video_jobs)}",
        f"- Video export errors: {len(video_errors)}",
    ]
    if module.get("markSchemeGuidanceUrl"):
        readme_lines.append(f"- Mark scheme guidance URL: {module['markSchemeGuidanceUrl']}")
    if video_errors:
        readme_lines.append("")
        readme_lines.append("## Video Export Errors")
        for error in video_errors:
            readme_lines.append(f"- {error['title']} ({error['wistiaId']}): {error['error']}")
        write_json(module_dir / "video_errors.json", video_errors)
    write_text(module_dir / "README.md", "\n".join(readme_lines) + "\n")

    return {
        "id": module["id"],
        "title": module["title"],
        "year": year_label,
        "sections": len(module.get("sectionGroups") or []),
        "topics": len(section_manifest),
        "definitionGroups": len(module.get("definitionGroups") or []),
        "definitions": definition_count,
        "examPapers": exam_counts["papers"],
        "examQuestions": exam_counts["questions"],
        "examParts": exam_counts["parts"],
        "videos": len(video_jobs),
        "videoErrors": len(video_errors),
        "path": str(module_dir.relative_to(BASE_DIR)),
    }


def discover_economics_modules() -> list:
    user = graphql(CURRENT_USER_QUERY)["currentUser"]
    module_ids = sorted({entry["moduleId"] for entry in user.get("enrolments") or []})
    modules = []
    for module_id in module_ids:
        header = graphql(MODULE_HEADER_QUERY, {"id": module_id})["module"]
        if not header:
            continue
        if (header.get("course") or {}).get("subject", {}).get("name") == "Economics":
            modules.append(header)
    return modules


def build_root_readme(summary: dict) -> None:
    lines = [
        "# Up Learn Economics Export",
        "",
        f"- Exported at: {time.strftime('%Y-%m-%d %H:%M:%S')}",
        f"- Modules exported: {len(summary['modules'])}",
        f"- Video files tracked: {summary['videoFiles']}",
        f"- Other downloaded files tracked: {summary['otherFiles']}",
        "",
        "## Modules",
    ]
    for module in summary["modules"]:
        lines.append(
            f"- {module['year']} | {module['title']} | topics: {module['topics']} | videos: {module['videos']} | path: {module['path']}"
        )
    write_text(BASE_DIR / "README.md", "\n".join(lines) + "\n")


def main() -> int:
    ensure_dir(BASE_DIR)
    manifest = []
    log(f"Exporting into: {BASE_DIR}")
    modules = discover_economics_modules()
    if not modules:
        log("No Economics modules were found on the current account.")
        return 1
    module_summaries = []
    for header in modules:
        log(f"Fetching module {header['id']} - {header['title']}")
        full_module = graphql(MODULE_FULL_QUERY, {"id": header["id"]})["module"]
        module_summaries.append(export_module(full_module, manifest))
    summary = {
        "modules": module_summaries,
        "videoFiles": sum(1 for item in manifest if item["type"] == "video"),
        "otherFiles": sum(1 for item in manifest if item["type"] != "video"),
    }
    write_json(BASE_DIR / "download_manifest.json", manifest)
    write_json(BASE_DIR / "summary.json", summary)
    build_root_readme(summary)
    log("Finished.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        log("Interrupted.")
        raise
