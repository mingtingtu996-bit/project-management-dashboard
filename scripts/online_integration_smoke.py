import json
import os
import sys
import time
from dataclasses import dataclass, asdict
from typing import Any

from playwright.sync_api import sync_playwright


DEFAULT_APP_BASE = "http://127.0.0.1:5173/#"
HTTP_TIMEOUT = 20


def pick_project_id(projects_payload: Any) -> str | None:
    if isinstance(projects_payload, list) and projects_payload:
        candidate = projects_payload[0]
        if isinstance(candidate, dict):
            return candidate.get("id")

    if isinstance(projects_payload, dict):
        for key in ("data", "projects", "items"):
            value = projects_payload.get(key)
            if isinstance(value, list) and value:
                candidate = value[0]
                if isinstance(candidate, dict):
                    return candidate.get("id")

    return None


@dataclass
class PageResult:
    name: str
    url: str
    ok: bool
    title: str
    console_errors: list[str]
    page_errors: list[str]
    failed_requests: list[str]
    main_text_excerpt: str


def normalize_text(text: str) -> str:
    return " ".join(text.split())


def inspect_page(page, name: str, url: str) -> PageResult:
    console_errors: list[str] = []
    page_errors: list[str] = []
    failed_requests: list[str] = []

    page.on(
        "console",
        lambda message: console_errors.append(message.text)
        if message.type == "error"
        else None,
    )
    page.on("pageerror", lambda error: page_errors.append(str(error)))
    page.on(
        "requestfailed",
        lambda request: failed_requests.append(
            f"{request.method} {request.url} :: {request.failure}"
        ),
    )

    page.goto(url, wait_until="domcontentloaded", timeout=45000)
    page.wait_for_timeout(2500)

    try:
        page.wait_for_load_state("networkidle", timeout=8000)
    except Exception:  # noqa: BLE001
        pass

    main_text = ""
    try:
        main = page.locator("main")
        if main.count() > 0:
            main_text = normalize_text(main.first.inner_text(timeout=3000))
    except Exception:  # noqa: BLE001
        main_text = ""

    excerpt = main_text[:240]
    return PageResult(
        name=name,
        url=url,
        ok=not console_errors and not page_errors,
        title=page.title(),
        console_errors=console_errors[:10],
        page_errors=page_errors[:10],
        failed_requests=failed_requests[:10],
        main_text_excerpt=excerpt,
    )


def main() -> int:
    project_id = os.environ.get("SMOKE_PROJECT_ID") or None
    skip_api = os.environ.get("SMOKE_SKIP_API") == "1"
    app_base = os.environ.get("SMOKE_APP_BASE") or DEFAULT_APP_BASE
    report: dict[str, Any] = {"api": [], "pages": [], "project_id": project_id}

    with sync_playwright() as playwright:
        request_context = None
        if not skip_api:
            request_context = playwright.request.new_context(
                base_url="http://127.0.0.1:3001",
                extra_http_headers={"Connection": "close"},
            )

            def safe_fetch_json(path: str) -> dict[str, Any]:
                started_at = time.time()
                try:
                    response = request_context.get(f"/api{path}", timeout=HTTP_TIMEOUT * 1000)
                    payload_text = response.text()
                    try:
                        payload = json.loads(payload_text)
                    except json.JSONDecodeError:
                        payload = payload_text
                    return {
                        "path": path,
                        "ok": response.ok,
                        "status": response.status,
                        "elapsed_ms": round((time.time() - started_at) * 1000),
                        "payload": payload,
                    }
                except Exception as exc:  # noqa: BLE001
                    return {
                        "path": path,
                        "ok": False,
                        "status": None,
                        "elapsed_ms": round((time.time() - started_at) * 1000),
                        "error": str(exc),
                    }

            api_checks = [
                "/health",
                "/projects",
                "/dashboard/projects-summary",
                "/notifications",
                "/notifications/unread",
                "/jobs",
            ]

            for path in api_checks:
                report["api"].append(safe_fetch_json(path))

            if not project_id:
                projects_result = next((item for item in report["api"] if item["path"] == "/projects"), None)
                project_id = pick_project_id(projects_result.get("payload") if projects_result else None)
                report["project_id"] = project_id

            if project_id:
                project_checks = [
                    f"/dashboard/project-summary?projectId={project_id}",
                    f"/task-summaries/projects/{project_id}/task-summary",
                    f"/risks?projectId={project_id}",
                    f"/issues?projectId={project_id}",
                    f"/warnings?projectId={project_id}",
                    f"/acceptance-plans?projectId={project_id}",
                    f"/pre-milestones?projectId={project_id}",
                    f"/projects/{project_id}/certificate-work-items",
                    f"/projects/{project_id}/drawing-packages",
                ]
                for path in project_checks:
                    report["api"].append(safe_fetch_json(path))

        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 960})

        page_routes = [("company", f"{app_base}/company"), ("notifications", f"{app_base}/notifications")]
        if project_id:
            page_routes.extend(
                [
                    ("dashboard", f"{app_base}/projects/{project_id}/dashboard"),
                    ("gantt", f"{app_base}/projects/{project_id}/gantt"),
                    ("risks", f"{app_base}/projects/{project_id}/risks"),
                    ("acceptance", f"{app_base}/projects/{project_id}/acceptance"),
                    ("pre-milestones", f"{app_base}/projects/{project_id}/pre-milestones"),
                    ("drawings", f"{app_base}/projects/{project_id}/drawings"),
                ]
            )

        for name, url in page_routes:
            report["pages"].append(asdict(inspect_page(page, name, url)))

        browser.close()
        if request_context is not None:
            request_context.dispose()

    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
