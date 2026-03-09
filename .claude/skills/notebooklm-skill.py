#!/usr/bin/env python3
"""
NotebookLM Skill for Claude Code
Uses notebooklm-py to create notebooks, add sources, and generate artifacts.
"""

import asyncio
import json
import sys
import argparse

from notebooklm import NotebookLMClient


async def create_notebook(name: str) -> dict:
    """Create a new notebook and return its info."""
    async with await NotebookLMClient.from_storage() as client:
        nb = await client.notebooks.create(name)
        return {"id": nb.id, "name": name, "status": "created"}


async def list_notebooks() -> list[dict]:
    """List all notebooks."""
    async with await NotebookLMClient.from_storage() as client:
        notebooks = await client.notebooks.list()
        return [{"id": nb.id, "name": nb.name} for nb in notebooks]


async def add_youtube_sources(notebook_id: str, urls: list[str]) -> list[dict]:
    """Add YouTube URLs as sources to a notebook."""
    results = []
    async with await NotebookLMClient.from_storage() as client:
        for url in urls:
            try:
                source = await client.sources.add_youtube(notebook_id, url)
                results.append({"url": url, "status": "added", "source_id": getattr(source, "id", "unknown")})
            except Exception as e:
                results.append({"url": url, "status": "error", "error": str(e)})
    return results


async def add_url_source(notebook_id: str, url: str) -> dict:
    """Add a generic URL as a source to a notebook."""
    async with await NotebookLMClient.from_storage() as client:
        source = await client.sources.add_url(notebook_id, url, wait=True)
        return {"url": url, "status": "added", "source_id": getattr(source, "id", "unknown")}


async def ask_notebook(notebook_id: str, question: str) -> str:
    """Ask a question against the notebook's sources."""
    async with await NotebookLMClient.from_storage() as client:
        result = await client.chat.ask(notebook_id, question)
        return result.answer


async def generate_infographic(notebook_id: str, orientation: str = "portrait", detail: str = "medium") -> dict:
    """Generate an infographic from the notebook."""
    async with await NotebookLMClient.from_storage() as client:
        status = await client.artifacts.generate_infographic(notebook_id, orientation=orientation, detail=detail)
        if hasattr(status, "task_id"):
            await client.artifacts.wait_for_completion(notebook_id, status.task_id)
        return {"status": "completed", "type": "infographic"}


async def generate_slide_deck(notebook_id: str, format: str = "detailed") -> dict:
    """Generate a slide deck from the notebook."""
    async with await NotebookLMClient.from_storage() as client:
        status = await client.artifacts.generate_slide_deck(notebook_id, format=format)
        if hasattr(status, "task_id"):
            await client.artifacts.wait_for_completion(notebook_id, status.task_id)
        return {"status": "completed", "type": "slide_deck"}


async def generate_flashcards(notebook_id: str) -> dict:
    """Generate flashcards from the notebook."""
    async with await NotebookLMClient.from_storage() as client:
        status = await client.artifacts.generate_flashcards(notebook_id)
        if hasattr(status, "task_id"):
            await client.artifacts.wait_for_completion(notebook_id, status.task_id)
        return {"status": "completed", "type": "flashcards"}


async def generate_quiz(notebook_id: str) -> dict:
    """Generate a quiz from the notebook."""
    async with await NotebookLMClient.from_storage() as client:
        status = await client.artifacts.generate_quiz(notebook_id)
        if hasattr(status, "task_id"):
            await client.artifacts.wait_for_completion(notebook_id, status.task_id)
        return {"status": "completed", "type": "quiz"}


async def generate_mind_map(notebook_id: str) -> dict:
    """Generate a mind map from the notebook."""
    async with await NotebookLMClient.from_storage() as client:
        status = await client.artifacts.generate_mind_map(notebook_id)
        if hasattr(status, "task_id"):
            await client.artifacts.wait_for_completion(notebook_id, status.task_id)
        return {"status": "completed", "type": "mind_map"}


async def generate_audio(notebook_id: str) -> dict:
    """Generate an audio overview from the notebook."""
    async with await NotebookLMClient.from_storage() as client:
        status = await client.artifacts.generate_audio(notebook_id, format="deep_dive", length="medium")
        if hasattr(status, "task_id"):
            await client.artifacts.wait_for_completion(notebook_id, status.task_id)
        return {"status": "completed", "type": "audio"}


async def download_artifact(notebook_id: str, artifact_type: str, filepath: str) -> dict:
    """Download a generated artifact."""
    async with await NotebookLMClient.from_storage() as client:
        download_fn = getattr(client.artifacts, f"download_{artifact_type}", None)
        if not download_fn:
            return {"status": "error", "error": f"Unknown artifact type: {artifact_type}"}
        await download_fn(notebook_id, filepath)
        return {"status": "downloaded", "filepath": filepath}


def main():
    parser = argparse.ArgumentParser(description="NotebookLM Skill")
    subparsers = parser.add_subparsers(dest="command", help="Command to run")

    # create
    create_p = subparsers.add_parser("create", help="Create a new notebook")
    create_p.add_argument("name", help="Notebook name")

    # list
    subparsers.add_parser("list", help="List all notebooks")

    # add-youtube
    yt_p = subparsers.add_parser("add-youtube", help="Add YouTube URLs as sources")
    yt_p.add_argument("notebook_id", help="Notebook ID")
    yt_p.add_argument("urls", nargs="+", help="YouTube URLs to add")

    # add-url
    url_p = subparsers.add_parser("add-url", help="Add a URL as a source")
    url_p.add_argument("notebook_id", help="Notebook ID")
    url_p.add_argument("url", help="URL to add")

    # ask
    ask_p = subparsers.add_parser("ask", help="Ask a question")
    ask_p.add_argument("notebook_id", help="Notebook ID")
    ask_p.add_argument("question", help="Question to ask")

    # generate
    gen_p = subparsers.add_parser("generate", help="Generate an artifact")
    gen_p.add_argument("notebook_id", help="Notebook ID")
    gen_p.add_argument("type", choices=["infographic", "slide_deck", "flashcards", "quiz", "mind_map", "audio"])
    gen_p.add_argument("--orientation", default="portrait", help="Infographic orientation")
    gen_p.add_argument("--detail", default="medium", help="Infographic detail level")

    # download
    dl_p = subparsers.add_parser("download", help="Download an artifact")
    dl_p.add_argument("notebook_id", help="Notebook ID")
    dl_p.add_argument("type", help="Artifact type to download")
    dl_p.add_argument("filepath", help="Output file path")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    if args.command == "create":
        result = asyncio.run(create_notebook(args.name))
    elif args.command == "list":
        result = asyncio.run(list_notebooks())
    elif args.command == "add-youtube":
        result = asyncio.run(add_youtube_sources(args.notebook_id, args.urls))
    elif args.command == "add-url":
        result = asyncio.run(add_url_source(args.notebook_id, args.url))
    elif args.command == "ask":
        answer = asyncio.run(ask_notebook(args.notebook_id, args.question))
        print(answer)
        return
    elif args.command == "generate":
        gen_fn = {
            "infographic": lambda: generate_infographic(args.notebook_id, args.orientation, args.detail),
            "slide_deck": lambda: generate_slide_deck(args.notebook_id),
            "flashcards": lambda: generate_flashcards(args.notebook_id),
            "quiz": lambda: generate_quiz(args.notebook_id),
            "mind_map": lambda: generate_mind_map(args.notebook_id),
            "audio": lambda: generate_audio(args.notebook_id),
        }
        result = asyncio.run(gen_fn[args.type]())
    elif args.command == "download":
        result = asyncio.run(download_artifact(args.notebook_id, args.type, args.filepath))

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
