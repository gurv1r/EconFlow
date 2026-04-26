import json
import time
from pathlib import Path

from selenium import webdriver
from selenium.common.exceptions import TimeoutException
from selenium.webdriver import ChromeOptions
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait


ROOT = Path(__file__).resolve().parent
URL = "http://127.0.0.1:8000/site/"
OUTPUT = ROOT / "selenium_audit_report.json"


def text(driver, selector):
    return driver.find_element(By.CSS_SELECTOR, selector).text.strip()


def safe_click(driver, element):
    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", element)
    driver.execute_script("arguments[0].click();", element)


def visible_elements(driver, selector):
    return [
        node
        for node in driver.find_elements(By.CSS_SELECTOR, selector)
        if node.is_displayed()
    ]


def wait_for(driver, selector, timeout=20):
    return WebDriverWait(driver, timeout).until(
        EC.presence_of_element_located((By.CSS_SELECTOR, selector))
    )


def run_audit():
    options = ChromeOptions()
    options.add_argument("--headless=new")
    options.add_argument("--window-size=1440,1400")
    options.set_capability("goog:loggingPrefs", {"browser": "ALL"})

    driver = webdriver.Chrome(options=options)
    wait = WebDriverWait(driver, 20)
    report = {"steps": {}, "issues": [], "browserLogs": []}

    try:
        driver.get(URL)
        wait.until(EC.presence_of_element_located((By.ID, "moduleList")))
        time.sleep(1)

        report["steps"]["landing"] = {
            "todayTitle": text(driver, "#todayTitle"),
            "resultTitle": text(driver, "#resultTitle"),
            "moduleCards": len(visible_elements(driver, ".module-card")),
        }

        start_today = driver.find_element(By.ID, "startTodayPlanBtn")
        safe_click(driver, start_today)
        time.sleep(1)
        today_actions = [node.text.strip() for node in visible_elements(driver, "#studyActions .pill")]
        report["steps"]["today"] = {
            "studyTitle": text(driver, "#studyTitle"),
            "notesMeta": text(driver, "#notesMeta"),
            "actions": today_actions[:12],
        }

        if not today_actions:
            report["issues"].append("Today page opened a study session without resource navigation.")

        module_details = visible_elements(driver, ".module-details")
        if module_details:
            driver.execute_script("arguments[0].open = true;", module_details[0])
        time.sleep(0.3)

        topic_cards = visible_elements(driver, ".topic-card")
        if topic_cards:
            driver.execute_script("arguments[0].open = true;", topic_cards[0])
        time.sleep(0.3)

        topic_actions = visible_elements(driver, ".topic-card .topic-actions .pill-button")
        if topic_actions:
            safe_click(driver, topic_actions[0])
            time.sleep(1)

        report["steps"]["topicStudy"] = {
            "studyTitle": text(driver, "#studyTitle"),
            "studyMeta": text(driver, "#studyMeta"),
            "notesMeta": text(driver, "#notesMeta"),
        }

        nav_buttons = visible_elements(driver, "#studyActions button")
        nav_texts = [node.text.strip() for node in nav_buttons]
        report["steps"]["topicStudy"]["navButtons"] = nav_texts[:12]

        note_box = driver.find_element(By.ID, "studyNotes")
        note_box.clear()
        note_box.send_keys("Selenium audit note. Key diagram, formula, and mistake cue.")
        time.sleep(0.5)
        report["steps"]["notes"] = {
            "savedState": text(driver, "#notesSavedState"),
            "count": text(driver, "#notesCount"),
        }

        quiz_opened = False
        quiz_title = ""
        for topic_card in visible_elements(driver, ".topic-card"):
            driver.execute_script("arguments[0].open = true;", topic_card)
            time.sleep(0.15)
            quick_buttons = [
                node for node in topic_card.find_elements(By.CSS_SELECTOR, ".topic-actions .pill-button")
                if "quiz" in node.text.lower()
            ]
            if quick_buttons:
                safe_click(driver, quick_buttons[0])
                quiz_opened = True
                break

        if quiz_opened:
            wait.until(EC.visibility_of_element_located((By.ID, "quizDialog")))
            time.sleep(0.5)
            quiz_title = text(driver, "#quizTitle")
            option_inputs = visible_elements(driver, "#quizQuestionMount .option-card input")
            if option_inputs:
                safe_click(driver, option_inputs[0])
                time.sleep(0.25)
            next_button = driver.find_element(By.ID, "nextQuizBtn")
            safe_click(driver, next_button)
            time.sleep(0.6)
            safe_click(driver, driver.find_element(By.ID, "closeQuizBtn"))
            time.sleep(0.3)
        else:
            report["issues"].append("No quiz could be opened from visible topic actions.")

        report["steps"]["quiz"] = {
            "opened": quiz_opened,
            "title": quiz_title,
            "mistakeCards": len(visible_elements(driver, "#mistakeList .revision-card")),
        }

        paper_buttons = visible_elements(driver, ".exam-list .pill-button")
        chosen_paper = None
        for button in paper_buttons:
            if "paper mode" in button.text.lower():
                safe_click(driver, button)
                chosen_paper = button.text.strip()
                break
        time.sleep(1)

        report["steps"]["paper"] = {
            "button": chosen_paper,
            "paperTitle": text(driver, "#paperTitle"),
            "paperMeta": text(driver, "#paperMeta"),
            "renderedQuestions": len(visible_elements(driver, "#studyContent .paper-question")),
            "scoreDisplay": text(driver, "#paperScoreDisplay"),
        }

        if report["steps"]["paper"]["renderedQuestions"] == 0:
            report["issues"].append("Paper mode opened without rendering any question content.")

        timer_start = driver.find_element(By.ID, "startPaperTimerBtn")
        safe_click(driver, timer_start)
        time.sleep(1.2)
        safe_click(driver, driver.find_element(By.ID, "pausePaperTimerBtn"))
        report["steps"]["paper"]["timer"] = text(driver, "#paperTimerDisplay")

        search = driver.find_element(By.ID, "searchInput")
        search.clear()
        search.send_keys("elasticity")
        time.sleep(0.6)
        report["steps"]["search"] = {
            "resultTitle": text(driver, "#resultTitle"),
            "moduleCards": len(visible_elements(driver, ".module-card")),
        }
        search.send_keys(Keys.CONTROL, "a")
        search.send_keys(Keys.DELETE)

        report["browserLogs"] = driver.get_log("browser")
        severe_logs = [entry for entry in report["browserLogs"] if entry.get("level") == "SEVERE"]
        if severe_logs:
            report["issues"].append(f"Browser console had {len(severe_logs)} severe error(s).")

    except TimeoutException as exc:
        report["issues"].append(f"Timed out during Selenium audit: {exc.msg}")
    finally:
        driver.quit()

    OUTPUT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    run_audit()
