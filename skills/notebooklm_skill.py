#!/usr/bin/env python3
"""
NotebookLM Skill for Claude Code.

Integrates with the notebooklm-py unofficial API to create notebooks,
add YouTube URLs as sources, chat with the notebook, and generate
deliverables (infographics, slide decks, flashcards, etc.).

Prerequisites:
    pip install "notebooklm-py[browser]"
    playwright install chromium
    notebooklm login  (run in a separate terminal to authenticate)

Usage:
    python3 skills/notebooklm_skill.py create "Notebook Title"
    python3 skills/notebooklm_skill.py add-sources <notebook_id> --urls url1 url2 ...
    python3 skills/notebooklm_skill.py add-sources-from-file <notebook_id> --file skills/yt_research_results.json [--limit N]
    python3 skills/notebooklm_skill.py chat <notebook_id> "Your question"
    python3 skills/notebooklm_skill.py generate <notebook_id> infographic [--style "handwritten / chalkboard"]
    python3 skills/notebooklm_skill.py generate <notebook_id> slide-deck
    python3 skills/notebooklm_skill.py generate <notebook_id> flashcards [--quantity more]
    python3 skills/notebooklm_skill.py list
"""

import argparse
import asyncio
import json
import sys


async def create_notebook(title: str) -> str:
    """Create a new NotebookLM notebook and return its ID."""
    from notebooklm import NotebookLMClient

    async with await NotebookLMClient.from_storage() as client:
        nb = await client.notebooks.create(title)
        print(f"Created notebook: {nb.title}")
        print(f"Notebook ID: {nb.id}")
        return nb.id


async def add_sources(notebook_id: str, urls: list[str]) -> None:
    """Add YouTube URLs (or any URLs) as sources to a notebook."""
    from notebooklm import NotebookLMClient

    async with await NotebookLMClient.from_storage() as client:
        for i, url in enumerate(urls, 1):
            print(f"[{i}/{len(urls)}] Adding source: {url}")
            try:
                await client.sources.add_url(notebook_id, url, wait=True)
                print(f"  -> Added successfully")
            except Exception as e:
                print(f"  -> Failed: {e}", file=sys.stderr)
        print(f"\nDone. Added sources to notebook {notebook_id}")


async def add_sources_from_file(notebook_id: str, filepath: str, limit: int | None = None) -> None:
    """Load YouTube URLs from yt_research_results.json and add them as sources."""
    with open(filepath, "r") as f:
        data = json.load(f)

    results = data.get("results", [])
    if limit:
        results = results[:limit]

    urls = [v["url"] for v in results if v.get("url")]
    print(f"Found {len(urls)} URLs in {filepath}")

    if not urls:
        print("No URLs to add.", file=sys.stderr)
        return

    await add_sources(notebook_id, urls)


async def chat_with_notebook(notebook_id: str, question: str) -> str:
    """Ask a question to the notebook and return the answer."""
    from notebooklm import NotebookLMClient

    async with await NotebookLMClient.from_storage() as client:
        result = await client.chat.ask(notebook_id, question)
        print(f"## NotebookLM Analysis\n")
        print(result.answer)
        return result.answer


async def generate_deliverable(notebook_id: str, deliverable_type: str, **kwargs) -> None:
    """Generate a deliverable (infographic, slide-deck, flashcards, etc.)."""
    from notebooklm import NotebookLMClient

    async with await NotebookLMClient.from_storage() as client:
        style = kwargs.get("style", "")
        quantity = kwargs.get("quantity", "")

        if deliverable_type == "infographic":
            prompt = f"Create an infographic"
            if style:
                prompt += f" in a {style} style"
            orientation = kwargs.get("orientation", "portrait")
            print(f"Generating infographic ({orientation})...")
            await client.generate.infographic(notebook_id, prompt=prompt, orientation=orientation)
            print("Infographic generated. Downloading...")
            await client.download.infographic(notebook_id, "./notebooklm_infographic.png")
            print("Saved to: ./notebooklm_infographic.png")

        elif deliverable_type == "slide-deck":
            print("Generating slide deck...")
            await client.generate.slide_deck(notebook_id)
            print("Slide deck generated. Downloading...")
            await client.download.slide_deck(notebook_id, "./notebooklm_slides.pdf")
            print("Saved to: ./notebooklm_slides.pdf")

        elif deliverable_type == "flashcards":
            qty = quantity or "default"
            print(f"Generating flashcards (quantity: {qty})...")
            await client.generate.flashcards(notebook_id, quantity=quantity or None)
            print("Flashcards generated. Downloading...")
            await client.download.flashcards(notebook_id, format="json", path="./notebooklm_flashcards.json")
            print("Saved to: ./notebooklm_flashcards.json")

        elif deliverable_type == "audio":
            print("Generating audio podcast...")
            await client.generate.audio(notebook_id, wait=True)
            print("Audio generated. Downloading...")
            await client.download.audio(notebook_id, "./notebooklm_podcast.mp3")
            print("Saved to: ./notebooklm_podcast.mp3")

        elif deliverable_type == "mind-map":
            print("Generating mind map...")
            await client.generate.mind_map(notebook_id)
            print("Mind map generated.")

        else:
            print(f"Unknown deliverable type: {deliverable_type}", file=sys.stderr)
            print(f"Supported: infographic, slide-deck, flashcards, audio, mind-map")
            sys.exit(1)


async def list_notebooks() -> None:
    """List all notebooks."""
    from notebooklm import NotebookLMClient

    async with await NotebookLMClient.from_storage() as client:
        notebooks = await client.notebooks.list()
        print("# Your NotebookLM Notebooks\n")
        for nb in notebooks:
            print(f"- **{nb.title}** (ID: {nb.id})")
        if not notebooks:
            print("No notebooks found.")


def main():
    parser = argparse.ArgumentParser(description="NotebookLM Skill for Claude Code")
    subparsers = parser.add_subparsers(dest="command", help="Command to run")

    # create
    create_parser = subparsers.add_parser("create", help="Create a new notebook")
    create_parser.add_argument("title", help="Notebook title")

    # add-sources
    add_parser = subparsers.add_parser("add-sources", help="Add URLs as sources")
    add_parser.add_argument("notebook_id", help="Notebook ID")
    add_parser.add_argument("--urls", nargs="+", required=True, help="URLs to add")

    # add-sources-from-file
    file_parser = subparsers.add_parser("add-sources-from-file", help="Add sources from yt_research_results.json")
    file_parser.add_argument("notebook_id", help="Notebook ID")
    file_parser.add_argument("--file", default="skills/yt_research_results.json", help="Path to results JSON")
    file_parser.add_argument("--limit", type=int, default=None, help="Max number of URLs to add")

    # chat
    chat_parser = subparsers.add_parser("chat", help="Ask a question")
    chat_parser.add_argument("notebook_id", help="Notebook ID")
    chat_parser.add_argument("question", help="Question to ask")

    # generate
    gen_parser = subparsers.add_parser("generate", help="Generate a deliverable")
    gen_parser.add_argument("notebook_id", help="Notebook ID")
    gen_parser.add_argument("type", choices=["infographic", "slide-deck", "flashcards", "audio", "mind-map"])
    gen_parser.add_argument("--style", default="", help="Style description (for infographics)")
    gen_parser.add_argument("--orientation", default="portrait", help="Orientation (for infographics)")
    gen_parser.add_argument("--quantity", default="", help="Quantity (for flashcards: more/less)")

    # list
    subparsers.add_parser("list", help="List all notebooks")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    if args.command == "create":
        asyncio.run(create_notebook(args.title))
    elif args.command == "add-sources":
        asyncio.run(add_sources(args.notebook_id, args.urls))
    elif args.command == "add-sources-from-file":
        asyncio.run(add_sources_from_file(args.notebook_id, args.file, args.limit))
    elif args.command == "chat":
        asyncio.run(chat_with_notebook(args.notebook_id, args.question))
    elif args.command == "generate":
        asyncio.run(generate_deliverable(
            args.notebook_id, args.type,
            style=args.style,
            orientation=args.orientation,
            quantity=args.quantity,
        ))
    elif args.command == "list":
        asyncio.run(list_notebooks())


if __name__ == "__main__":
    main()
