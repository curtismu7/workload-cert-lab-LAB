#!/bin/bash
# Owner rule 2026-11-07: no AI-attribution credit anywhere in the tree or recent commits.
fail=0
if grep -rInE 'Generated with \[?Claude Code|Co-[A]uthored-[B]y:.*(Claude|Anthropic|Copilot|GPT|Gemini|Codex|Cursor|opencode)' --exclude-dir=node_modules --exclude-dir=.git . 2>/dev/null; then
  echo "AI attribution found in tree"; fail=1
fi
if [ -d .git ]; then
  if git log --since=2026-11-07 -p --format= 2>/dev/null | grep -E 'Generated with \[?Claude Code|Co-[A]uthored-[B]y:.*(Claude|Anthropic|Copilot|GPT|Gemini|Codex|Cursor|opencode)' >/dev/null; then
    echo "AI attribution found in commit history"; fail=1
  fi
fi
exit $fail
