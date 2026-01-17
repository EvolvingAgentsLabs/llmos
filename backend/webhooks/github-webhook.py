"""
GitHub Webhook Handler

Receives and processes GitHub webhook events for:
- Push events (new commits to volumes)
- Pull request events (collaborative changes)
- Issues events (bug reports, feature requests)
- Release events (new skill/tool versions)
"""

import hashlib
import hmac
import json
import logging
from typing import Dict, Optional
from fastapi import FastAPI, Request, HTTPException, Header
from fastapi.responses import JSONResponse

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="LLMos-Lite GitHub Webhook Handler")

# Webhook secret for signature validation
WEBHOOK_SECRET = None  # Set from environment variable


def verify_signature(payload_body: bytes, signature_header: Optional[str]) -> bool:
    """Verify GitHub webhook signature"""
    if not WEBHOOK_SECRET:
        logger.warning("Webhook secret not configured, skipping verification")
        return True

    if not signature_header:
        return False

    # Extract the signature
    try:
        algorithm, signature = signature_header.split('=')
    except ValueError:
        return False

    if algorithm != 'sha256':
        return False

    # Calculate expected signature
    mac = hmac.new(
        WEBHOOK_SECRET.encode('utf-8'),
        msg=payload_body,
        digestmod=hashlib.sha256
    )
    expected_signature = mac.hexdigest()

    # Compare signatures
    return hmac.compare_digest(expected_signature, signature)


@app.post("/webhook/github")
async def github_webhook(
    request: Request,
    x_github_event: str = Header(None),
    x_hub_signature_256: str = Header(None),
):
    """Handle GitHub webhook events"""

    # Get raw payload
    payload_body = await request.body()

    # Verify signature
    if not verify_signature(payload_body, x_hub_signature_256):
        logger.error("Invalid webhook signature")
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse payload
    try:
        payload = json.loads(payload_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Log event
    logger.info(f"Received GitHub event: {x_github_event}")

    # Route to handler
    if x_github_event == "push":
        await handle_push_event(payload)
    elif x_github_event == "pull_request":
        await handle_pull_request_event(payload)
    elif x_github_event == "issues":
        await handle_issues_event(payload)
    elif x_github_event == "release":
        await handle_release_event(payload)
    elif x_github_event == "ping":
        logger.info("Ping event received")
    else:
        logger.warning(f"Unhandled event type: {x_github_event}")

    return JSONResponse({"status": "ok"})


async def handle_push_event(payload: Dict):
    """Handle push event - new commits to volume"""
    repository = payload.get("repository", {})
    repo_name = repository.get("full_name")
    commits = payload.get("commits", [])

    logger.info(f"Push to {repo_name}: {len(commits)} commits")

    # Check if this is a volume repository
    if not is_volume_repository(repo_name):
        logger.info(f"Not a volume repository: {repo_name}")
        return

    # Process commits
    for commit in commits:
        commit_sha = commit.get("id")
        message = commit.get("message")
        author = commit.get("author", {}).get("name")
        added = commit.get("added", [])
        modified = commit.get("modified", [])
        removed = commit.get("removed", [])

        logger.info(f"Commit {commit_sha[:7]} by {author}: {message}")

        # Check if skills/tools/agents were modified
        skill_files = [f for f in added + modified if f.startswith("skills/")]
        tool_files = [f for f in added + modified if f.startswith("tools/")]
        agent_files = [f for f in added + modified if f.startswith("agents/")]

        # Trigger reindexing if artifacts changed
        if skill_files or tool_files or agent_files:
            logger.info(f"Artifacts changed, triggering reindex")
            await trigger_reindex(repo_name, commit_sha)

        # Trigger evolution cron if traces changed
        trace_files = [f for f in added + modified if f.startswith("traces/")]
        if trace_files:
            logger.info(f"Traces changed, triggering evolution")
            await trigger_evolution(repo_name)


async def handle_pull_request_event(payload: Dict):
    """Handle pull request event - collaborative changes"""
    action = payload.get("action")
    pull_request = payload.get("pull_request", {})
    pr_number = pull_request.get("number")
    pr_title = pull_request.get("title")
    repository = payload.get("repository", {})
    repo_name = repository.get("full_name")

    logger.info(f"PR #{pr_number} {action} in {repo_name}: {pr_title}")

    if action == "opened":
        # New pull request - notify team
        await notify_team_pr_opened(repo_name, pr_number, pr_title)
    elif action == "closed":
        if pull_request.get("merged"):
            # PR merged - trigger updates
            logger.info(f"PR #{pr_number} merged")
            await trigger_reindex(repo_name, pull_request.get("merge_commit_sha"))
        else:
            logger.info(f"PR #{pr_number} closed without merging")


async def handle_issues_event(payload: Dict):
    """Handle issues event - bug reports and feature requests"""
    action = payload.get("action")
    issue = payload.get("issue", {})
    issue_number = issue.get("number")
    issue_title = issue.get("title")
    repository = payload.get("repository", {})
    repo_name = repository.get("full_name")

    logger.info(f"Issue #{issue_number} {action} in {repo_name}: {issue_title}")

    if action == "opened":
        # New issue - notify maintainers
        await notify_maintainers_issue_opened(repo_name, issue_number, issue_title)


async def handle_release_event(payload: Dict):
    """Handle release event - new skill/tool versions"""
    action = payload.get("action")
    release = payload.get("release", {})
    tag_name = release.get("tag_name")
    release_name = release.get("name")
    repository = payload.get("repository", {})
    repo_name = repository.get("full_name")

    logger.info(f"Release {tag_name} {action} in {repo_name}: {release_name}")

    if action == "published":
        # New release - update marketplace
        await update_marketplace_version(repo_name, tag_name, release)


def is_volume_repository(repo_name: str) -> bool:
    """Check if repository is a volume"""
    return (
        repo_name.startswith("llmunix-user-") or
        repo_name.startswith("llmunix-team-") or
        repo_name == "llmunix/system-volumes"
    )


async def trigger_reindex(repo_name: str, commit_sha: str):
    """Trigger reindexing of volume artifacts"""
    # TODO: Call vector search indexing API
    logger.info(f"Reindexing {repo_name} at {commit_sha}")


async def trigger_evolution(repo_name: str):
    """Trigger evolution cron for volume"""
    # TODO: Call evolution cron API
    logger.info(f"Triggering evolution for {repo_name}")


async def notify_team_pr_opened(repo_name: str, pr_number: int, pr_title: str):
    """Notify team about new pull request"""
    # TODO: Send notification via WebSocket or push notification
    logger.info(f"Notifying team: PR #{pr_number} in {repo_name}")


async def notify_maintainers_issue_opened(repo_name: str, issue_number: int, issue_title: str):
    """Notify maintainers about new issue"""
    # TODO: Send notification
    logger.info(f"Notifying maintainers: Issue #{issue_number} in {repo_name}")


async def update_marketplace_version(repo_name: str, tag_name: str, release: Dict):
    """Update marketplace with new version"""
    # TODO: Update marketplace API
    logger.info(f"Updating marketplace: {repo_name} {tag_name}")


@app.get("/health")
async def health():
    """Health check endpoint"""
    return {"status": "ok", "service": "GitHub Webhook Handler"}


if __name__ == "__main__":
    import os
    import uvicorn

    # Load webhook secret from environment
    WEBHOOK_SECRET = os.getenv("GITHUB_WEBHOOK_SECRET")

    if not WEBHOOK_SECRET:
        logger.warning("GITHUB_WEBHOOK_SECRET not set, webhook signatures will not be validated")

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=3002,
        log_level="info",
    )
