# Issue tracker: Local Markdown

Issues and PRDs for this repo live as local markdown files under `.scratch/<feature>/`.

## Conventions

- **Create an issue**: Create a file `.scratch/<feature>/YYYYMMDD-short-title.md` with frontmatter (`title`, `status`) and a body describing the problem.
- **Status values**: `backlog`, `active`, `done`, `wontfix`. Update the `status` field to move tickets along.
- **Read an issue**: Just read the markdown file — no CLI needed.
- **List issues**: `ls .scratch/<feature>/` or grep across `.scratch/` for keywords.
- **Link related issues**: Use relative links like `[issue](./20260115-fix-login-bug.md)` in the feature's index or parent issue.

## When a skill says "publish to the issue tracker"

Create a markdown file under `.scratch/<feature>/` with a descriptive name and frontmatter.

## When a skill says "fetch the relevant ticket"

Read the relevant file from `.scratch/<feature>/`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single markdown file holding the Notes / Decisions-so-far / Fog.

- **Map**: A file (e.g., `.scratch/my-feature/README.md`) labelled with a frontmatter tag `map: true`, holding the Notes / Decisions-so-far / Fog body.
- **Child ticket**: A markdown file in the same directory linked from the map. Labels via frontmatter tags: `type: research`, `type: prototype`, `type: task`. Once claimed, add `assigned: @me` to the frontmatter.
- **Blocking**: Document blocking relationships as a `Blocked by:` line at the top of the child file, listing the relevant issue filenames. A ticket is unblocked when every blocker is resolved.
- **Frontier query**: List open child files, drop any with a `blocked-by` reference that hasn't been resolved yet; first in filesystem order wins.
- **Claim**: Add `assigned: @me` to the frontmatter — the session's first write.
- **Resolve**: Write your answer into the file, set `status: done`, then append a context pointer to the map's Decisions-so-far section.
