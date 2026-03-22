#!/usr/bin/env python3
"""
YouTube Research Skill for Claude Code.

Uses yt-dlp to search YouTube and scrape video metadata including
titles, views, author, duration, and URLs for a given search query.

Usage:
    python3 skills/yt_research.py "search query" [--limit N]
"""

import argparse
import json
import sys
import subprocess
import shutil


def search_youtube(query: str, limit: int = 25) -> list[dict]:
    """Search YouTube and return video metadata using yt-dlp."""
    yt_dlp_path = shutil.which("yt-dlp")
    if not yt_dlp_path:
        print("Error: yt-dlp is not installed. Run: pip install yt-dlp", file=sys.stderr)
        sys.exit(1)

    search_url = f"ytsearch{limit}:{query}"

    cmd = [
        yt_dlp_path,
        "--dump-json",
        "--flat-playlist",
        "--no-warnings",
        "--quiet",
        search_url,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)

    if result.returncode != 0:
        print(f"Error running yt-dlp: {result.stderr}", file=sys.stderr)
        sys.exit(1)

    videos = []
    for line in result.stdout.strip().split("\n"):
        if not line:
            continue
        try:
            data = json.loads(line)
        except json.JSONDecodeError:
            continue

        duration_secs = data.get("duration") or 0
        minutes, seconds = divmod(int(duration_secs), 60)
        hours, minutes = divmod(minutes, 60)
        if hours:
            duration_str = f"{hours}:{minutes:02d}:{seconds:02d}"
        else:
            duration_str = f"{minutes}:{seconds:02d}"

        video_id = data.get("id", "")
        videos.append({
            "title": data.get("title", "N/A"),
            "url": data.get("url") or data.get("webpage_url") or f"https://www.youtube.com/watch?v={video_id}",
            "author": data.get("uploader") or data.get("channel") or "N/A",
            "views": data.get("view_count", 0),
            "duration": duration_str,
            "duration_seconds": duration_secs,
            "description": (data.get("description") or "")[:200],
        })

    return videos


def format_results(videos: list[dict], query: str) -> str:
    """Format video results into a readable report."""
    lines = [
        f"# YouTube Research Results: \"{query}\"",
        f"Found {len(videos)} videos.\n",
    ]

    for i, v in enumerate(videos, 1):
        view_str = f"{v['views']:,}" if isinstance(v['views'], int) and v['views'] else "N/A"
        lines.append(f"## {i}. {v['title']}")
        lines.append(f"- **Author:** {v['author']}")
        lines.append(f"- **Views:** {view_str}")
        lines.append(f"- **Duration:** {v['duration']}")
        lines.append(f"- **URL:** {v['url']}")
        if v['description']:
            lines.append(f"- **Description:** {v['description']}...")
        lines.append("")

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="YouTube Research Skill")
    parser.add_argument("query", help="Search query for YouTube")
    parser.add_argument("--limit", type=int, default=25, help="Number of results (default: 25)")
    parser.add_argument("--json", action="store_true", help="Output raw JSON instead of formatted text")
    args = parser.parse_args()

    videos = search_youtube(args.query, args.limit)

    if args.json:
        print(json.dumps(videos, indent=2))
    else:
        print(format_results(videos, args.query))

    # Also write JSON to a file for downstream consumption
    output_file = "skills/yt_research_results.json"
    with open(output_file, "w") as f:
        json.dump({"query": args.query, "results": videos}, f, indent=2)
    print(f"\n[Results saved to {output_file}]", file=sys.stderr)


if __name__ == "__main__":
    main()
