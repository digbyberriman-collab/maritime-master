#!/usr/bin/env python3
"""
YouTube Research Skill for Claude Code
Uses yt-dlp to search YouTube and extract video metadata.
"""

import json
import sys
import argparse
import yt_dlp


def search_youtube(query: str, max_results: int = 25) -> list[dict]:
    """Search YouTube for videos matching the query and return metadata."""
    search_url = f"ytsearch{max_results}:{query}"

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "extract_flat": False,
        "skip_download": True,
        "ignoreerrors": True,
    }

    results = []

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(search_url, download=False)
        if not info or "entries" not in info:
            return results

        for entry in info["entries"]:
            if entry is None:
                continue
            results.append({
                "title": entry.get("title", "N/A"),
                "url": entry.get("webpage_url") or f"https://www.youtube.com/watch?v={entry.get('id', '')}",
                "author": entry.get("uploader") or entry.get("channel", "N/A"),
                "views": entry.get("view_count", 0),
                "duration_seconds": entry.get("duration", 0),
                "duration_string": entry.get("duration_string", "N/A"),
                "upload_date": entry.get("upload_date", "N/A"),
                "description": (entry.get("description") or "")[:200],
            })

    return results


def format_results(results: list[dict]) -> str:
    """Format results as a readable summary."""
    if not results:
        return "No results found."

    lines = [f"Found {len(results)} videos:\n"]
    for i, v in enumerate(results, 1):
        views = f"{v['views']:,}" if isinstance(v["views"], int) and v["views"] else "N/A"
        lines.append(
            f"{i}. **{v['title']}**\n"
            f"   Author: {v['author']} | Views: {views} | Duration: {v['duration_string']}\n"
            f"   URL: {v['url']}\n"
        )
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="YouTube Research Skill")
    parser.add_argument("query", nargs="?", help="Search query")
    parser.add_argument("-n", "--num-results", type=int, default=25, help="Number of results (default: 25)")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    args = parser.parse_args()

    if not args.query:
        print("Error: No search query provided. Please specify a topic to research.")
        sys.exit(1)

    results = search_youtube(args.query, args.num_results)

    if args.json:
        print(json.dumps(results, indent=2))
    else:
        print(format_results(results))


if __name__ == "__main__":
    main()
