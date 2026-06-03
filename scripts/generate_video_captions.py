#!/usr/bin/env python3
import argparse
import concurrent.futures
import datetime as dt
import os
import shutil
import subprocess
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = ROOT / "archive" / "UpLearn Economics"
DEFAULT_BUCKET = "uplearn-economics-study-dashboard-assets-260426"
DEFAULT_PROJECT = "uplearn-econ-dash-260426"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate WebVTT and SRT subtitles for EconFlow archive videos using Google Cloud Speech-to-Text V2.",
    )
    parser.add_argument("--project-id", default=os.environ.get("GOOGLE_CLOUD_PROJECT", DEFAULT_PROJECT))
    parser.add_argument("--bucket", default=os.environ.get("ECONFLOW_GCS_BUCKET", DEFAULT_BUCKET))
    parser.add_argument("--location", default=os.environ.get("ECONFLOW_STT_LOCATION", "global"))
    parser.add_argument("--language-code", default=os.environ.get("ECONFLOW_STT_LANGUAGE", "en-GB"))
    parser.add_argument("--model", default=os.environ.get("ECONFLOW_STT_MODEL", "long"))
    parser.add_argument("--lesson-match", default="", help="Only process lessons whose relative path contains this case-insensitive text.")
    parser.add_argument("--limit", type=int, default=0, help="Stop after this many processed lessons.")
    parser.add_argument("--force", action="store_true", help="Regenerate even if local subtitle files already exist.")
    parser.add_argument("--dry-run", action="store_true", help="Print the work that would be done without calling Google Cloud.")
    parser.add_argument("--keep-staging", action="store_true", help="Keep uploaded staging audio objects in GCS.")
    parser.add_argument(
        "--concurrency",
        type=int,
        default=int(os.environ.get("ECONFLOW_STT_CONCURRENCY", "4")),
        help="How many lessons to process in parallel. Higher improves throughput but does not change audio minutes billed.",
    )
    return parser.parse_args()


def require_google_cloud():
    try:
        from google.api_core import client_options
        from google.cloud import storage
        from google.cloud.speech_v2 import SpeechClient
    except ImportError as exc:
        raise SystemExit(
            "Missing Google Cloud dependencies. Install `google-cloud-speech` and `google-cloud-storage` first."
        ) from exc
    return client_options, storage, SpeechClient


def iter_video_lessons():
    for lesson_dir in sorted(ARCHIVE.glob("Year */*/Videos/*/*")):
        if lesson_dir.is_dir() and any(lesson_dir.glob("video.*")):
            yield lesson_dir


def lesson_has_subtitles(lesson_dir: Path) -> bool:
    return any(lesson_dir.glob("*.vtt")) or any(lesson_dir.glob("*.srt"))


def first_video_path(lesson_dir: Path) -> Path | None:
    for path in sorted(lesson_dir.glob("video.*")):
        return path
    return None


def lesson_rel_path(lesson_dir: Path) -> str:
    return lesson_dir.relative_to(ROOT).as_posix()


def to_gs_uri(bucket: str, object_name: str) -> str:
    cleaned = object_name.strip("/")
    return f"gs://{bucket}/{cleaned}"


def run_ffmpeg_extract(video_path: Path, output_path: Path) -> None:
    command = [
        shutil.which("ffmpeg") or "ffmpeg",
        "-y",
        "-i",
        str(video_path),
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "flac",
        str(output_path),
    ]
    subprocess.run(command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def upload_file(storage_client, bucket_name: str, object_name: str, local_path: Path) -> str:
    bucket = storage_client.bucket(bucket_name)
    blob = bucket.blob(object_name)
    blob.upload_from_filename(str(local_path))
    return to_gs_uri(bucket_name, object_name)


def download_uri(storage_client, uri: str, destination: Path) -> None:
    if not uri or not uri.startswith("gs://"):
        raise ValueError(f"Unsupported GCS URI: {uri}")
    bucket_name, object_name = uri[5:].split("/", 1)
    bucket = storage_client.bucket(bucket_name)
    blob = bucket.blob(object_name)
    destination.parent.mkdir(parents=True, exist_ok=True)
    blob.download_to_filename(str(destination))


def delete_uri(storage_client, uri: str) -> None:
    if not uri or not uri.startswith("gs://"):
        return
    bucket_name, object_name = uri[5:].split("/", 1)
    storage_client.bucket(bucket_name).blob(object_name).delete()


def log(message: str) -> None:
    timestamp = dt.datetime.now().strftime("%H:%M:%S")
    print(f"[{timestamp}] {message}", flush=True)


def restore_existing_remote_subtitles(storage_client, bucket_name: str, output_prefix_object: str, lesson_dir: Path) -> bool:
    bucket = storage_client.bucket(bucket_name)
    prefix = f"{output_prefix_object}/"
    vtt_blob = None
    srt_blob = None
    for blob in bucket.list_blobs(prefix=prefix):
        if blob.name.endswith(".vtt") and vtt_blob is None:
            vtt_blob = blob
        elif blob.name.endswith(".srt") and srt_blob is None:
            srt_blob = blob
        if vtt_blob and srt_blob:
            break
    if not vtt_blob or not srt_blob:
        return False
    (lesson_dir / "captions.auto.vtt").parent.mkdir(parents=True, exist_ok=True)
    vtt_blob.download_to_filename(str(lesson_dir / "captions.auto.vtt"))
    srt_blob.download_to_filename(str(lesson_dir / "captions.auto.srt"))
    return True


def build_batch_request(project_id: str, location: str, audio_uri: str, output_prefix_uri: str, language_code: str, model: str) -> dict:
    return {
        "recognizer": f"projects/{project_id}/locations/{location}/recognizers/_",
        "config": {
            "features": {
                "enable_automatic_punctuation": True,
                "enable_word_time_offsets": True,
            },
            "auto_decoding_config": {},
            "model": model,
            "language_codes": [language_code],
        },
        "files": [{"uri": audio_uri}],
        "recognition_output_config": {
            "gcs_output_config": {"uri": output_prefix_uri},
            "output_format_config": {
                "vtt": {},
                "srt": {},
            },
        },
    }


def process_lesson(args: argparse.Namespace, lesson_dir: Path) -> str:
    client_options, storage, SpeechClient = require_google_cloud()
    storage_client = storage.Client(project=args.project_id)
    speech_client = SpeechClient(
        client_options=client_options.ClientOptions(
            api_endpoint="speech.googleapis.com" if args.location == "global" else f"{args.location}-speech.googleapis.com"
        )
    )

    video_path = first_video_path(lesson_dir)
    rel_dir = lesson_rel_path(lesson_dir)
    if not video_path:
        return f"skip: {rel_dir} (no video file)"

    output_prefix_object = f"{rel_dir}/captions.auto"
    if restore_existing_remote_subtitles(storage_client, args.bucket, output_prefix_object, lesson_dir):
        return f"restored: {rel_dir}"

    log(f"transcribing: {rel_dir}")
    with tempfile.TemporaryDirectory(prefix="econflow-captions-") as temp_dir:
        local_audio_path = Path(temp_dir) / "audio.flac"
        run_ffmpeg_extract(video_path, local_audio_path)

        staging_object = f"speech-inputs/{rel_dir}/audio.flac"
        audio_uri = upload_file(storage_client, args.bucket, staging_object, local_audio_path)
        output_prefix_uri = to_gs_uri(args.bucket, output_prefix_object)

        operation = speech_client.batch_recognize(
            request=build_batch_request(
                project_id=args.project_id,
                location=args.location,
                audio_uri=audio_uri,
                output_prefix_uri=output_prefix_uri,
                language_code=args.language_code,
                model=args.model,
            )
        )
        response = operation.result(timeout=60 * 60)
        file_result = response.results.get(audio_uri)
        cloud_output = getattr(file_result, "cloud_storage_result", None) if file_result else None
        if not file_result:
            raise RuntimeError(f"Speech-to-Text returned no file result for {audio_uri}")
        if getattr(file_result, "error", None) and getattr(file_result.error, "code", 0):
            raise RuntimeError(f"Speech-to-Text failed for {rel_dir}: {file_result.error.message}")

        vtt_uri = getattr(cloud_output, "vtt_format_uri", "")
        srt_uri = getattr(cloud_output, "srt_format_uri", "")
        if not vtt_uri or not srt_uri:
            raise RuntimeError(f"Speech-to-Text did not return subtitle URIs for {rel_dir}")

        download_uri(storage_client, vtt_uri, lesson_dir / "captions.auto.vtt")
        download_uri(storage_client, srt_uri, lesson_dir / "captions.auto.srt")

        if not args.keep_staging:
            delete_uri(storage_client, audio_uri)

    return f"done: {rel_dir}"


def main() -> None:
    args = parse_args()
    if args.concurrency < 1:
        raise SystemExit("--concurrency must be at least 1")
    lesson_match = args.lesson_match.lower().strip()
    selected = []
    for lesson_dir in iter_video_lessons():
        rel_path = lesson_rel_path(lesson_dir)
        if lesson_match and lesson_match not in rel_path.lower():
            continue
        if lesson_has_subtitles(lesson_dir) and not args.force:
            continue
        selected.append(lesson_dir)
        if args.limit and len(selected) >= args.limit:
            break

    if not selected:
        print("No video lessons need subtitle generation.")
        return

    for lesson_dir in selected:
        log(f"queued: {lesson_rel_path(lesson_dir)}")

    if args.dry_run:
        log(f"Dry run only. Selected {len(selected)} lesson(s).")
        return

    processed = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.concurrency) as executor:
        futures = {executor.submit(process_lesson, args, lesson_dir): lesson_dir for lesson_dir in selected}
        for future in concurrent.futures.as_completed(futures):
            lesson_dir = futures[future]
            rel_dir = lesson_rel_path(lesson_dir)
            try:
                message = future.result()
            except Exception as exc:
                log(f"error: {rel_dir} :: {exc}")
                continue
            log(message)
            if message.startswith("done: ") or message.startswith("restored: "):
                processed += 1

    log(f"Generated subtitles for {processed} lesson(s).")


if __name__ == "__main__":
    main()
