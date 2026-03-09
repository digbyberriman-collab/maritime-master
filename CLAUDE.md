# Claude Code Configuration

## Custom Skills

### yt-research — YouTube Research Skill
**Trigger**: When the user asks to research YouTube videos, find trending videos, or search YouTube for a topic.
**Script**: `.claude/skills/yt-research.py`
**Usage**:
```bash
python .claude/skills/yt-research.py "search query" -n 25
python .claude/skills/yt-research.py "search query" --json
```
**Capabilities**:
- Search YouTube for videos matching a query
- Extract metadata: title, author, views, duration, upload date, URL
- Return results as formatted text or JSON
- Default: 25 results

**Important**: If the user requests YouTube research without specifying a topic, ask them what topic they want to research before proceeding.

### notebooklm — NotebookLM Skill
**Trigger**: When the user asks to create a notebook, upload sources to NotebookLM, generate analysis, infographics, slide decks, flashcards, quizzes, mind maps, or audio overviews.
**Script**: `.claude/skills/notebooklm-skill.py`
**Usage**:
```bash
# Create a notebook
python .claude/skills/notebooklm-skill.py create "Notebook Name"

# List notebooks
python .claude/skills/notebooklm-skill.py list

# Add YouTube URLs as sources
python .claude/skills/notebooklm-skill.py add-youtube <notebook_id> "https://youtube.com/watch?v=..." "https://youtube.com/watch?v=..."

# Add a generic URL as a source
python .claude/skills/notebooklm-skill.py add-url <notebook_id> "https://example.com"

# Ask a question against sources
python .claude/skills/notebooklm-skill.py ask <notebook_id> "What are the top findings?"

# Generate artifacts
python .claude/skills/notebooklm-skill.py generate <notebook_id> infographic
python .claude/skills/notebooklm-skill.py generate <notebook_id> slide_deck
python .claude/skills/notebooklm-skill.py generate <notebook_id> flashcards
python .claude/skills/notebooklm-skill.py generate <notebook_id> quiz
python .claude/skills/notebooklm-skill.py generate <notebook_id> mind_map
python .claude/skills/notebooklm-skill.py generate <notebook_id> audio

# Download artifacts
python .claude/skills/notebooklm-skill.py download <notebook_id> <type> <filepath>
```

**Prerequisites**: Run `notebooklm login` in a separate terminal to authenticate with your Google account before first use.

## Pipeline Workflow: YouTube Research → NotebookLM

When the user asks to research a topic and send results to NotebookLM, follow this workflow:

1. **Validate topic**: If no topic is specified, ask the user what topic to research.
2. **Search YouTube**: Run the yt-research skill with `--json` to get structured results.
3. **Create notebook**: Create a new NotebookLM notebook named after the topic.
4. **Upload sources**: Add the YouTube video URLs as sources to the notebook.
5. **Analyze**: Ask NotebookLM to analyze the sources and summarize top findings.
6. **Generate deliverables**: Generate any requested artifacts (infographic, slides, flashcards, etc.).
7. **Report back**: Present the analysis and confirm artifact generation to the user.
