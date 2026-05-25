from __future__ import annotations

import base64
import binascii
import json
import os
import random
import re
import secrets
import shutil
import sys
import unicodedata
from pathlib import Path
from typing import Any

from fastapi import Cookie, FastAPI, HTTPException, Query, Response, status
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

SOURCE_DIR = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))


def runtime_base_dir() -> Path:
    override = os.getenv("TOETSING_BASE_DIR", "").strip()
    if override:
        return Path(override).expanduser().resolve()
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


BASE_DIR = runtime_base_dir()
DATA_DIR = BASE_DIR / "data"
STATIC_DIR = SOURCE_DIR / "static"
CATALOG_FILE = DATA_DIR / "catalog.json"
BUNDLED_CATALOG_FILE = SOURCE_DIR / "data" / "catalog.json"
QUESTION_IMAGE_DIR = DATA_DIR / "question-images"

SESSION_COOKIE = "toetsing_teacher_session"
DEFAULT_TEACHER_PASSWORD = "toetsing123"
TEACHER_PASSWORD = os.getenv("TOETSING_TEACHER_PASSWORD", DEFAULT_TEACHER_PASSWORD)
HTML_HEADERS = {
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
}
ALLOWED_IMAGE_MIME_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
}
MAX_IMAGE_BYTES = 8 * 1024 * 1024

COLOR_OPTIONS = [
    {"id": "red", "label": "Rood", "hex": "#cf3f3f"},
    {"id": "blue", "label": "Blauw", "hex": "#2f63d0"},
    {"id": "green", "label": "Groen", "hex": "#2f8c5a"},
    {"id": "yellow", "label": "Geel", "hex": "#d6ab26"},
    {"id": "purple", "label": "Paars", "hex": "#7553be"},
    {"id": "orange", "label": "Oranje", "hex": "#d77b2b"},
]

SHAPE_OPTIONS = [
    {"id": "circle", "label": "Cirkel"},
    {"id": "triangle", "label": "Driehoek"},
    {"id": "square", "label": "Vierkant"},
    {"id": "rectangle", "label": "Rechthoek"},
    {"id": "diamond", "label": "Ruit"},
    {"id": "parallelogram", "label": "Parallellogram"},
]

YEAR_OPTIONS = [
    {"id": "1e", "label": "1e jaar"},
    {"id": "2e", "label": "2e jaar"},
    {"id": "3e", "label": "3e jaar"},
    {"id": "4e", "label": "4e jaar"},
]

DEFAULT_CATALOG = {
    "subjects": [
        {"id": "nederlands", "name": "Nederlands"},
        {"id": "wiskunde", "name": "Wiskunde"},
    ],
    "questions": [],
}

ALLOWED_YEAR_IDS = {item["id"] for item in YEAR_OPTIONS}

QUESTION_IMAGE_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Toetsing", version="0.3.0")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.mount("/media", StaticFiles(directory=QUESTION_IMAGE_DIR), name="media")
app.state.teacher_sessions = set()
app.state.board_seed = secrets.token_hex(12)


class TeacherLoginRequest(BaseModel):
    password: str = Field(..., min_length=1, max_length=128)


class SubjectPayload(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)


class QuestionPayload(BaseModel):
    subjectId: str = Field(..., min_length=2, max_length=80)
    yearLevel: str = Field(..., min_length=2, max_length=8)
    theme: str = Field(default="", max_length=80)
    prompt: str = Field(default="", max_length=600)
    answer: str = Field(default="", max_length=600)
    promptImageUrl: str = Field(default="", max_length=400)
    answerImageUrl: str = Field(default="", max_length=400)
    active: bool = True


class TeacherImageUploadRequest(BaseModel):
    dataUrl: str = Field(..., min_length=32, max_length=12_000_000)


def normalize_text(value: str) -> str:
    return " ".join(value.strip().split())


def normalize_key(value: str) -> str:
    return normalize_text(value).casefold()


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", normalize_key(value))
    ascii_only = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_only).strip("-")
    return slug or secrets.token_hex(4)


def ensure_choice(value: str, allowed: set[str], field_name: str) -> str:
    cleaned = normalize_key(value)
    if cleaned not in allowed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Onbekende keuze voor {field_name}.",
        )
    return cleaned


def normalize_image_url(value: str) -> str:
    cleaned = normalize_text(value)
    if not cleaned:
        return ""

    lowered = cleaned.casefold()
    if (
        lowered.startswith("/media/")
        or lowered.startswith("/static/")
        or lowered.startswith("http://")
        or lowered.startswith("https://")
    ):
        return cleaned

    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail="Ongeldig afbeeldingspad.",
    )


def require_text_or_image(text: str, image_url: str, field_name: str) -> None:
    if text or image_url:
        return
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=f"Voeg {field_name}tekst of een {field_name}foto toe.",
    )


def decode_image_data_url(data_url: str) -> tuple[bytes, str]:
    match = re.fullmatch(r"data:(image/[a-zA-Z0-9.+-]+);base64,(.+)", data_url.strip(), re.DOTALL)
    if not match:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Plak een geldige afbeelding.",
        )

    mime_type = match.group(1).casefold()
    extension = ALLOWED_IMAGE_MIME_TYPES.get(mime_type)
    if not extension:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Gebruik een png, jpg, webp of gif.",
        )

    try:
        raw_bytes = base64.b64decode(match.group(2), validate=True)
    except (ValueError, binascii.Error):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="De geplakte afbeelding kon niet gelezen worden.",
        ) from None

    if not raw_bytes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="De geplakte afbeelding is leeg.",
        )
    if len(raw_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="De afbeelding is te groot. Gebruik een foto tot 8 MB.",
        )

    return raw_bytes, extension


def save_pasted_image(data_url: str) -> str:
    raw_bytes, extension = decode_image_data_url(data_url)
    QUESTION_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{secrets.token_hex(12)}{extension}"
    target = QUESTION_IMAGE_DIR / filename
    with target.open("wb") as handle:
        handle.write(raw_bytes)
    return f"/media/{filename}"


def default_catalog() -> dict[str, Any]:
    return {
        "subjects": [dict(subject) for subject in DEFAULT_CATALOG["subjects"]],
        "questions": [],
    }


def ensure_catalog() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not CATALOG_FILE.exists():
        if BUNDLED_CATALOG_FILE.exists():
            shutil.copyfile(BUNDLED_CATALOG_FILE, CATALOG_FILE)
        else:
            write_catalog(default_catalog())


def read_catalog() -> dict[str, Any]:
    ensure_catalog()
    with CATALOG_FILE.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)

    if not isinstance(payload, dict):
        raise HTTPException(status_code=500, detail="Catalogusbestand is ongeldig.")
    if not isinstance(payload.get("subjects"), list) or not isinstance(payload.get("questions"), list):
        raise HTTPException(status_code=500, detail="Catalogusbestand mist vakken of vragen.")
    return payload


def write_catalog(payload: dict[str, Any]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with CATALOG_FILE.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=True)
        handle.write("\n")


def teacher_logged_in(session_token: str | None) -> bool:
    return bool(session_token and session_token in app.state.teacher_sessions)


def require_teacher(session_token: str | None) -> None:
    if not teacher_logged_in(session_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Leerkrachtlogin vereist.",
        )


def subject_map(subjects: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {subject["id"]: subject for subject in subjects if subject.get("id")}


def serialize_subject(subject: dict[str, Any]) -> dict[str, str]:
    return {"id": subject["id"], "name": subject["name"]}


def serialize_question(
    question: dict[str, Any],
    subjects_by_id: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    subject = subjects_by_id.get(question["subjectId"], {})
    return {
        "id": question["id"],
        "subjectId": question["subjectId"],
        "subjectName": subject.get("name", question["subjectId"]),
        "yearLevel": question["yearLevel"],
        "theme": question.get("theme", ""),
        "prompt": question["prompt"],
        "answer": question["answer"],
        "promptImageUrl": question.get("promptImageUrl", ""),
        "answerImageUrl": question.get("answerImageUrl", ""),
        "active": bool(question.get("active", True)),
    }


def next_subject_id(subjects: list[dict[str, Any]], name: str) -> str:
    base_id = slugify(name)
    used_ids = {subject["id"] for subject in subjects}
    if base_id not in used_ids:
        return base_id

    counter = 2
    while f"{base_id}-{counter}" in used_ids:
        counter += 1
    return f"{base_id}-{counter}"


def ensure_subject_exists(subject_id: str, subjects_by_id: dict[str, dict[str, Any]]) -> str:
    cleaned = normalize_key(subject_id)
    if cleaned not in subjects_by_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Onbekend vak.",
        )
    return cleaned


def theme_key(value: str) -> str:
    return normalize_key(value)


def available_themes(questions: list[dict[str, Any]]) -> list[str]:
    names = {
        normalize_text(question.get("theme", ""))
        for question in questions
        if normalize_text(question.get("theme", ""))
    }
    return sorted(names, key=str.casefold)


def question_index(questions: list[dict[str, Any]], question_id: str) -> int:
    for index, question in enumerate(questions):
        if question.get("id") == question_id:
            return index
    raise HTTPException(status_code=404, detail="Vraag niet gevonden.")


def coerce_question(
    payload: QuestionPayload,
    *,
    subjects_by_id: dict[str, dict[str, Any]],
    question_id: str | None = None,
) -> dict[str, Any]:
    subject_id = ensure_subject_exists(payload.subjectId, subjects_by_id)
    year_level = ensure_choice(payload.yearLevel, ALLOWED_YEAR_IDS, "jaar")
    prompt = normalize_text(payload.prompt)
    answer = normalize_text(payload.answer)
    prompt_image_url = normalize_image_url(payload.promptImageUrl)
    answer_image_url = normalize_image_url(payload.answerImageUrl)

    require_text_or_image(prompt, prompt_image_url, "vraag")
    require_text_or_image(answer, answer_image_url, "antwoord")

    return {
        "id": question_id or secrets.token_hex(6),
        "subjectId": subject_id,
        "yearLevel": year_level,
        "theme": normalize_text(payload.theme),
        "prompt": prompt,
        "answer": answer,
        "promptImageUrl": prompt_image_url,
        "answerImageUrl": answer_image_url,
        "active": bool(payload.active),
    }


def filtered_active_questions(
    catalog: dict[str, Any],
    *,
    subject_id: str,
    year_level: str,
) -> list[dict[str, Any]]:
    return [
        question
        for question in catalog["questions"]
        if bool(question.get("active", True))
        and question.get("subjectId") == subject_id
        and question.get("yearLevel") == year_level
    ]


def token_pool() -> list[dict[str, str]]:
    return [
        {"color": color["id"], "shape": shape["id"]}
        for color in COLOR_OPTIONS
        for shape in SHAPE_OPTIONS
    ]


def with_board_tokens(
    questions: list[dict[str, Any]],
    *,
    subjects_by_id: dict[str, dict[str, Any]],
    seed_key: str,
) -> list[dict[str, Any]]:
    ordered_questions = sorted(questions, key=lambda item: item["id"])
    question_rng = random.Random(f"{app.state.board_seed}|questions|{seed_key}")
    question_rng.shuffle(ordered_questions)

    tokens = token_pool()
    token_rng = random.Random(f"{app.state.board_seed}|tokens|{seed_key}")
    token_rng.shuffle(tokens)

    result: list[dict[str, Any]] = []
    for index, question in enumerate(ordered_questions):
        token = tokens[index % len(tokens)]
        item = serialize_question(question, subjects_by_id)
        item["tokenColor"] = token["color"]
        item["tokenShape"] = token["shape"]
        result.append(item)
    return result


@app.get("/")
def serve_index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html", headers=HTML_HEADERS)


@app.get("/api/meta")
def get_meta(
    session_token: str | None = Cookie(default=None, alias=SESSION_COOKIE),
) -> dict[str, Any]:
    catalog = read_catalog()
    subjects = sorted(catalog["subjects"], key=lambda item: item["name"].casefold())
    return {
        "project": "Toetsing",
        "colors": COLOR_OPTIONS,
        "shapes": SHAPE_OPTIONS,
        "years": YEAR_OPTIONS,
        "subjects": [serialize_subject(subject) for subject in subjects],
        "teacherLoggedIn": teacher_logged_in(session_token),
        "defaultPasswordHint": (
            DEFAULT_TEACHER_PASSWORD if TEACHER_PASSWORD == DEFAULT_TEACHER_PASSWORD else None
        ),
    }


@app.get("/api/questions")
def get_questions(
    subject_id: str | None = Query(default=None),
    year_level: str | None = Query(default=None),
    scope: str = Query(default="all"),
    theme: str | None = Query(default=None),
) -> dict[str, Any]:
    catalog = read_catalog()
    subjects_by_id = subject_map(catalog["subjects"])

    if not subject_id or not year_level:
        return {"questions": [], "availableThemes": []}

    subject_id = ensure_subject_exists(subject_id, subjects_by_id)
    year_level = ensure_choice(year_level, ALLOWED_YEAR_IDS, "jaar")
    scope = normalize_key(scope)
    if scope not in {"all", "theme"}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Onbekende leerstofkeuze.",
        )

    subject_year_questions = filtered_active_questions(
        catalog,
        subject_id=subject_id,
        year_level=year_level,
    )
    themes = available_themes(subject_year_questions)

    filtered = list(subject_year_questions)
    normalized_theme = normalize_text(theme or "")
    if scope == "theme":
        if not normalized_theme:
            return {"questions": [], "availableThemes": themes}
        filtered = [
            question
            for question in filtered
            if theme_key(question.get("theme", "")) == theme_key(normalized_theme)
        ]

    seed_key = f"{subject_id}|{year_level}|{scope}|{normalized_theme or 'all'}"
    return {
        "questions": with_board_tokens(filtered, subjects_by_id=subjects_by_id, seed_key=seed_key),
        "availableThemes": themes,
    }


@app.post("/api/teacher/login")
def teacher_login(payload: TeacherLoginRequest, response: Response) -> dict[str, Any]:
    if not secrets.compare_digest(payload.password, TEACHER_PASSWORD):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Onjuist paswoord.",
        )

    session_token = secrets.token_urlsafe(24)
    app.state.teacher_sessions.add(session_token)
    response.set_cookie(
        key=SESSION_COOKIE,
        value=session_token,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=12 * 60 * 60,
    )
    return {"ok": True}


@app.post("/api/teacher/logout")
def teacher_logout(
    response: Response,
    session_token: str | None = Cookie(default=None, alias=SESSION_COOKIE),
) -> dict[str, Any]:
    if session_token:
        app.state.teacher_sessions.discard(session_token)
    response.delete_cookie(SESSION_COOKIE)
    return {"ok": True}


@app.post("/api/teacher/subjects", status_code=status.HTTP_201_CREATED)
def create_teacher_subject(
    payload: SubjectPayload,
    session_token: str | None = Cookie(default=None, alias=SESSION_COOKIE),
) -> dict[str, Any]:
    require_teacher(session_token)
    catalog = read_catalog()
    cleaned_name = normalize_text(payload.name)
    existing_names = {normalize_key(subject["name"]) for subject in catalog["subjects"]}
    if normalize_key(cleaned_name) in existing_names:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Dit vak bestaat al.",
        )

    subject = {
        "id": next_subject_id(catalog["subjects"], cleaned_name),
        "name": cleaned_name,
    }
    catalog["subjects"].append(subject)
    write_catalog(catalog)
    return serialize_subject(subject)


@app.post("/api/teacher/images", status_code=status.HTTP_201_CREATED)
def upload_teacher_image(
    payload: TeacherImageUploadRequest,
    session_token: str | None = Cookie(default=None, alias=SESSION_COOKIE),
) -> dict[str, str]:
    require_teacher(session_token)
    return {"imageUrl": save_pasted_image(payload.dataUrl)}


@app.get("/api/teacher/questions")
def get_teacher_questions(
    session_token: str | None = Cookie(default=None, alias=SESSION_COOKIE),
) -> dict[str, Any]:
    require_teacher(session_token)
    catalog = read_catalog()
    subjects_by_id = subject_map(catalog["subjects"])
    questions = [serialize_question(question, subjects_by_id) for question in catalog["questions"]]
    questions.sort(
        key=lambda item: (
            item["subjectName"].casefold(),
            item["yearLevel"],
            item["theme"].casefold(),
            item["prompt"].casefold(),
        )
    )
    return {"questions": questions}


@app.post("/api/teacher/questions", status_code=status.HTTP_201_CREATED)
def create_teacher_question(
    payload: QuestionPayload,
    session_token: str | None = Cookie(default=None, alias=SESSION_COOKIE),
) -> dict[str, Any]:
    require_teacher(session_token)
    catalog = read_catalog()
    subjects_by_id = subject_map(catalog["subjects"])
    question = coerce_question(payload, subjects_by_id=subjects_by_id)
    catalog["questions"].append(question)
    write_catalog(catalog)
    return serialize_question(question, subjects_by_id)


@app.put("/api/teacher/questions/{question_id}")
def update_teacher_question(
    question_id: str,
    payload: QuestionPayload,
    session_token: str | None = Cookie(default=None, alias=SESSION_COOKIE),
) -> dict[str, Any]:
    require_teacher(session_token)
    catalog = read_catalog()
    subjects_by_id = subject_map(catalog["subjects"])
    index = question_index(catalog["questions"], question_id)
    question = coerce_question(payload, subjects_by_id=subjects_by_id, question_id=question_id)
    catalog["questions"][index] = question
    write_catalog(catalog)
    return serialize_question(question, subjects_by_id)


@app.delete("/api/teacher/questions/{question_id}")
def delete_teacher_question(
    question_id: str,
    session_token: str | None = Cookie(default=None, alias=SESSION_COOKIE),
) -> dict[str, Any]:
    require_teacher(session_token)
    catalog = read_catalog()
    index = question_index(catalog["questions"], question_id)
    removed = catalog["questions"].pop(index)
    write_catalog(catalog)
    return {"ok": True, "removedId": removed["id"]}
