# Claude Code Project Configuration

## Custom Skills

### yt-research
**YouTube Research Skill** — Searches YouTube for videos on a given topic and returns metadata (title, views, author, duration, URL).

**How to use:**
```bash
python3 skills/yt_research.py "SEARCH QUERY" --limit 25
```

**Outputs:**
- Formatted report printed to stdout
- JSON results saved to `skills/yt_research_results.json` for downstream use

**Important:** If the user gives a research command without specifying a topic, ask what topic they want to research before proceeding.

---

### notebooklm
**NotebookLM Skill** — Interfaces with Google's NotebookLM via the unofficial notebooklm-py API.

**How to use:**
```bash
# List existing notebooks
python3 skills/notebooklm_skill.py list

# Create a new notebook
python3 skills/notebooklm_skill.py create "Notebook Title"

# Add YouTube URLs from research results
python3 skills/notebooklm_skill.py add-sources-from-file NOTEBOOK_ID --file skills/yt_research_results.json

# Add specific URLs directly
python3 skills/notebooklm_skill.py add-sources NOTEBOOK_ID --urls "https://youtube.com/watch?v=..." "https://youtube.com/watch?v=..."

# Ask NotebookLM to analyze the sources
python3 skills/notebooklm_skill.py chat NOTEBOOK_ID "Summarize the top findings and key themes across all sources"

# Generate deliverables
python3 skills/notebooklm_skill.py generate NOTEBOOK_ID infographic --style "handwritten / chalkboard"
python3 skills/notebooklm_skill.py generate NOTEBOOK_ID slide-deck
python3 skills/notebooklm_skill.py generate NOTEBOOK_ID flashcards --quantity more
python3 skills/notebooklm_skill.py generate NOTEBOOK_ID audio
```

**Authentication required:** User must run `notebooklm login` in a separate terminal first.

---

## Research Pipeline Workflow

When the user asks to research a topic and send it to NotebookLM, follow this pipeline:

1. **Ask for topic** if not specified
2. **Run yt-research** — `python3 skills/yt_research.py "TOPIC" --limit 25`
3. **Create a NotebookLM notebook** — `python3 skills/notebooklm_skill.py create "TOPIC Research"`
4. **Add sources from results** — `python3 skills/notebooklm_skill.py add-sources-from-file NOTEBOOK_ID`
5. **Chat for analysis** — `python3 skills/notebooklm_skill.py chat NOTEBOOK_ID "Analyze the top findings..."`
6. **Generate deliverables** as requested (infographic, slides, flashcards, etc.)

## Dependencies

- `yt-dlp` — YouTube metadata scraping
- `notebooklm-py[browser]` — NotebookLM API client
- `playwright` + chromium — Browser automation for NotebookLM auth
