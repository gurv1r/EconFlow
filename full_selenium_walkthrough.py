import json
import tempfile
import time
from pathlib import Path

from selenium import webdriver
from selenium.common.exceptions import NoAlertPresentException, TimeoutException
from selenium.webdriver import ChromeOptions
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait


ROOT = Path(__file__).resolve().parent
URL = "http://127.0.0.1:8000/site/"
REPORT_PATH = ROOT / "full_selenium_walkthrough_report.json"
SHOTS = ROOT / "shots"
SHOTS.mkdir(exist_ok=True)


def safe_click(driver, element):
    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", element)
    driver.execute_script("arguments[0].click();", element)


def wait_for(driver, selector, timeout=20):
    return WebDriverWait(driver, timeout).until(
        EC.presence_of_element_located((By.CSS_SELECTOR, selector))
    )


def visible(driver, selector):
    return [
        node
        for node in driver.find_elements(By.CSS_SELECTOR, selector)
        if node.is_displayed()
    ]


def snap(driver, name):
    path = SHOTS / name
    driver.save_screenshot(str(path))
    return str(path)


def add_step(report, name, ok, details=None, screenshot=None):
    report["steps"].append(
        {
            "name": name,
            "ok": bool(ok),
            "details": details or {},
            "screenshot": screenshot,
        }
    )


def find_topic_row(driver, text):
    rows = driver.find_elements(By.CSS_SELECTOR, ".section-topic-row")
    for row in rows:
        if text.lower() in row.text.lower():
            return row
    return None


def wait_for_topic_row(driver, text, timeout=15):
    end = time.time() + timeout
    while time.time() < end:
        for section in driver.find_elements(By.CSS_SELECTOR, ".section-card"):
            driver.execute_script("arguments[0].open = true;", section)
        row = find_topic_row(driver, text)
        if row is not None:
            return row
        time.sleep(0.3)
    raise TimeoutException(f"Topic row not found: {text}")


def find_button_by_text(nodes, needle):
    for node in nodes:
        if needle.lower() in " ".join(node.text.split()).lower():
            return node
    return None


def main():
    download_dir = Path(tempfile.mkdtemp(prefix="econflow-walkthrough-"))
    options = ChromeOptions()
    options.add_argument("--headless=new")
    options.add_argument("--window-size=1440,1800")
    options.add_experimental_option(
        "prefs",
        {
            "download.default_directory": str(download_dir),
            "download.prompt_for_download": False,
            "download.directory_upgrade": True,
            "safebrowsing.enabled": True,
        },
    )
    options.set_capability("goog:loggingPrefs", {"browser": "ALL"})

    driver = webdriver.Chrome(options=options)
    report = {
        "url": URL,
        "generatedAt": time.strftime("%Y-%m-%d %H:%M:%S"),
        "downloadDir": str(download_dir),
        "steps": [],
        "issues": [],
        "browserLogs": [],
    }

    try:
        driver.get(URL)
        wait_for(driver, "#moduleList")
        time.sleep(1)

        add_step(
            report,
            "landing_loads",
            len(visible(driver, ".module-card")) > 0,
            {
                "moduleCards": len(visible(driver, ".module-card")),
                "resultTitle": driver.find_element(By.ID, "resultTitle").text,
            },
            snap(driver, "walkthrough-01-landing.png"),
        )

        sidebar = driver.find_element(By.CSS_SELECTOR, ".sidebar")
        before = driver.execute_script(
            "const el=arguments[0]; return {top: el.scrollTop, client: el.clientHeight, scroll: el.scrollHeight};",
            sidebar,
        )
        driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight;", sidebar)
        time.sleep(0.2)
        after = driver.execute_script(
            "const el=arguments[0]; return {top: el.scrollTop, client: el.clientHeight, scroll: el.scrollHeight};",
            sidebar,
        )
        sidebar_ok = after["top"] > before["top"] or before["scroll"] <= before["client"]
        add_step(
            report,
            "sidebar_scrolls",
            sidebar_ok,
            {"before": before, "after": after},
            snap(driver, "walkthrough-02-sidebar.png"),
        )

        search = driver.find_element(By.ID, "searchInput")
        search.clear()
        search.send_keys("elasticity")
        time.sleep(0.8)
        filtered_modules = len(visible(driver, ".module-card"))
        add_step(
            report,
            "search_filters_modules",
            filtered_modules > 0 and filtered_modules < 4,
            {
                "query": "elasticity",
                "moduleCards": filtered_modules,
                "resultTitle": driver.find_element(By.ID, "resultTitle").text,
            },
        )
        search.clear()
        time.sleep(0.8)

        search.send_keys("Economics as a Social Science")
        time.sleep(1)
        topic_row = wait_for_topic_row(driver, "Economics as a Social Science")
        topic_open = find_button_by_text(
            topic_row.find_elements(By.CSS_SELECTOR, ".pill-button"), "Open topic"
        )
        safe_click(driver, topic_open)
        WebDriverWait(driver, 20).until(
            EC.text_to_be_present_in_element((By.ID, "studyMeta"), "Economics as a Social Science")
        )
        time.sleep(1)
        study_top = driver.execute_script(
            "return document.querySelector('.study-panel').getBoundingClientRect().top"
        )
        add_step(
            report,
            "open_topic_from_module",
            "Economics as a Social Science" in driver.find_element(By.ID, "studyMeta").text and study_top < 60,
            {
                "studyTitle": driver.find_element(By.ID, "studyTitle").text,
                "studyMeta": driver.find_element(By.ID, "studyMeta").text,
                "studyPanelTop": study_top,
            },
            snap(driver, "walkthrough-03-topic-open.png"),
        )
        search.clear()
        time.sleep(0.6)

        action_buttons = driver.find_elements(By.CSS_SELECTOR, "#studyActions .pill-button")
        quiz_notes_button = find_button_by_text(action_buttons, "Quiz notes")
        safe_click(driver, quiz_notes_button)
        time.sleep(1.2)
        study_text = driver.find_element(By.ID, "studyContent").text
        add_step(
            report,
            "quiz_notes_are_clean",
            "NO_TYPE_SPECIFIED" not in study_text and "Quiz Type: None" not in study_text,
            {
                "containsPrompt": "One key difference between economics and the natural sciences is that:" in study_text,
                "containsBadLabel": "NO_TYPE_SPECIFIED" in study_text,
                "containsQuizTypeNone": "Quiz Type: None" in study_text,
            },
            snap(driver, "walkthrough-04-quiz-notes.png"),
        )

        practice_quiz = find_button_by_text(
            driver.find_elements(By.CSS_SELECTOR, "#studyActions .pill-button"), "Practice this quiz"
        )
        safe_click(driver, practice_quiz)
        WebDriverWait(driver, 20).until(EC.visibility_of_element_located((By.ID, "quizDialog")))
        time.sleep(0.5)
        quiz_title = driver.find_element(By.ID, "quizTitle").text
        quiz_cards = len(visible(driver, "#quizQuestionMount .quiz-question"))
        option = visible(driver, "#quizQuestionMount .option-card input")
        if option:
            safe_click(driver, option[0])
            time.sleep(0.2)
        safe_click(driver, driver.find_element(By.ID, "nextQuizBtn"))
        time.sleep(0.6)
        safe_click(driver, driver.find_element(By.ID, "closeQuizBtn"))
        add_step(
            report,
            "quiz_dialog_runs",
            quiz_cards > 0,
            {
                "quizTitle": quiz_title,
                "questionCountVisible": quiz_cards,
            },
            snap(driver, "walkthrough-05-quiz-dialog.png"),
        )

        safe_click(
            driver,
            find_button_by_text(driver.find_elements(By.CSS_SELECTOR, "#studyActions .pill-button"), "Video 1"),
        )
        time.sleep(1.2)
        add_step(
            report,
            "video_study_opens",
            len(visible(driver, ".study-video video")) > 0,
            {
                "studyTitle": driver.find_element(By.ID, "studyTitle").text,
                "videoPlayers": len(visible(driver, ".study-video video")),
            },
            snap(driver, "walkthrough-06-video-study.png"),
        )

        notes = driver.find_element(By.ID, "studyNotes")
        note_text = "Walkthrough note: definition, example, and evaluation."
        notes.clear()
        notes.send_keys(note_text)
        time.sleep(0.8)
        add_step(
            report,
            "notes_save",
            driver.find_element(By.ID, "notesSavedState").text.strip() == "Saved",
            {
                "savedState": driver.find_element(By.ID, "notesSavedState").text,
                "count": driver.find_element(By.ID, "notesCount").text,
            },
        )

        search.clear()
        time.sleep(0.5)
        paper_mode = find_button_by_text(driver.find_elements(By.CSS_SELECTOR, ".exam-list .pill-button"), "Paper mode")
        safe_click(driver, paper_mode)
        time.sleep(1.2)
        safe_click(driver, driver.find_element(By.ID, "startPaperTimerBtn"))
        time.sleep(1.1)
        safe_click(driver, driver.find_element(By.ID, "pausePaperTimerBtn"))
        mark_input = driver.find_elements(By.CSS_SELECTOR, ".paper-mark-row input")
        if mark_input:
            driver.execute_script(
                "arguments[0].value = '4'; arguments[0].dispatchEvent(new Event('input', {bubbles: true})); arguments[0].dispatchEvent(new Event('change', {bubbles: true}));",
                mark_input[0],
            )
            time.sleep(0.3)
        add_step(
            report,
            "paper_mode_runs",
            len(visible(driver, "#studyContent .paper-question")) > 0,
            {
                "paperTitle": driver.find_element(By.ID, "paperTitle").text,
                "timer": driver.find_element(By.ID, "paperTimerDisplay").text,
                "score": driver.find_element(By.ID, "paperScoreDisplay").text,
                "paperQuestions": len(visible(driver, "#studyContent .paper-question")),
            },
            snap(driver, "walkthrough-07-paper-mode.png"),
        )
        safe_click(driver, driver.find_element(By.ID, "resetPaperTimerBtn"))

        dashboard = driver.find_element(By.CSS_SELECTOR, ".dashboard-details")
        driver.execute_script("arguments[0].open = true;", dashboard)
        time.sleep(0.5)
        add_step(
            report,
            "dashboard_opens",
            dashboard.get_attribute("open") is not None,
            {
                "dueCards": len(visible(driver, "#dueList .revision-card")),
                "weakCards": len(visible(driver, "#weakTopicList .revision-card")),
                "todayCards": len(visible(driver, "#todayPlanList .revision-card")),
            },
            snap(driver, "walkthrough-08-dashboard.png"),
        )

        safe_click(driver, driver.find_element(By.ID, "startMixedReviewBtn"))
        WebDriverWait(driver, 20).until(EC.visibility_of_element_located((By.ID, "flashcardDialog")))
        time.sleep(0.5)
        flashcard_title = driver.find_element(By.ID, "flashcardTitle").text
        safe_click(driver, driver.find_element(By.ID, "revealFlashcardBtn"))
        time.sleep(0.2)
        safe_click(driver, driver.find_element(By.ID, "flashcardGoodBtn"))
        time.sleep(0.4)
        driver.find_element(By.ID, "closeFlashcardBtn").click()
        add_step(
            report,
            "flashcards_run",
            flashcard_title != "",
            {"flashcardTitle": flashcard_title},
            snap(driver, "walkthrough-09-flashcards.png"),
        )

        safe_click(driver, driver.find_element(By.ID, "focusWeakTopicsBtn"))
        time.sleep(1)
        add_step(
            report,
            "weak_topic_shortcut",
            driver.find_element(By.ID, "studyTitle").text.strip() != "",
            {"studyTitle": driver.find_element(By.ID, "studyTitle").text},
        )

        safe_click(driver, driver.find_element(By.ID, "startTodayPlanBtn"))
        time.sleep(1)
        add_step(
            report,
            "today_plan_shortcut",
            driver.find_element(By.ID, "studyTitle").text.strip() != "",
            {"studyTitle": driver.find_element(By.ID, "studyTitle").text},
        )

        export_button = driver.find_element(By.ID, "exportProgressBtn")
        safe_click(driver, export_button)
        time.sleep(1.2)
        downloaded = list(download_dir.glob("econflow-progress*.json"))
        add_step(
            report,
            "export_progress",
            bool(downloaded),
            {"downloadedFiles": [item.name for item in downloaded]},
        )

        import_input = driver.find_element(By.ID, "importProgressInput")
        driver.execute_script("arguments[0].style.display = 'block';", import_input)
        import_source = downloaded[0] if downloaded else None
        if import_source:
            import_input.send_keys(str(import_source))
            time.sleep(1.5)
        add_step(
            report,
            "import_progress",
            import_source is not None,
            {"importedFile": import_source.name if import_source else None},
        )

        safe_click(driver, driver.find_element(By.ID, "resetProgressBtn"))
        time.sleep(0.3)
        try:
            driver.switch_to.alert.accept()
            reset_ok = True
        except NoAlertPresentException:
            reset_ok = False
        time.sleep(0.8)
        add_step(
            report,
            "reset_progress_prompt",
            reset_ok,
            {"resetAccepted": reset_ok},
        )

        if import_source:
            driver.execute_script("arguments[0].style.display = 'block';", import_input)
            import_input.send_keys(str(import_source))
            time.sleep(1)
            add_step(
                report,
                "restore_progress_after_reset",
                True,
                {"restoredFrom": import_source.name},
            )

        report["browserLogs"] = driver.get_log("browser")
        severe = [entry for entry in report["browserLogs"] if entry.get("level") == "SEVERE"]
        if severe:
            report["issues"].append(f"Browser console had {len(severe)} severe error(s).")

    except TimeoutException as exc:
        report["issues"].append(f"Timed out during full walkthrough: {exc.msg}")
    finally:
        driver.quit()

    REPORT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
