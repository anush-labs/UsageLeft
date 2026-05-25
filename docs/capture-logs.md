# How to Capture Logs for a Bug Report

Use this when UsageLeft is not working and you need to share debug info.

- Audience: non-technical users
- Time: ~2 minutes
- Platform: Ubuntu

## 1) Reproduce the issue once

1. Open UsageLeft from the Ubuntu status indicator.
2. Do the action that fails.
3. Wait for the failure to happen.
4. Stop after 1-2 attempts (enough data, less noise).

## 2) Find the log file

Default Ubuntu path:

```text
~/.local/share/com.sunstory.usageleft/logs/UsageLeft.log
```

Open Terminal and run:

```bash
find ~/.local/share ~/.config -ipath '*usageleft*' -iname 'usageleft.log*' -print
```

Open the folder shown by that command.

## 3) Attach log files to your GitHub issue

1. Attach `UsageLeft.log`.
2. If you also see files like `UsageLeft.log.1`, attach those too.
3. Drag the files directly into your issue/comment on GitHub.

## 4) Add this context in the same issue comment

Copy/paste and fill:

```text
What I expected:
What happened instead:
When it happened (local time + timezone):
Which provider was affected (Codex / Claude / Cursor / etc.):
UsageLeft version:
```

## Privacy note

Logs are redacted for common secrets, but still review before sharing in public.
