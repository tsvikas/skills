---
name: prune-comments
description: 'Trim comment and docstring bloat over any scope: a diff (against a branch, the last commit, uncommitted changes, since the last cleanup) or whole files and directories. Deletes restatements and edit narration, re-homes facts between comments and docstrings, and rewrites comments that lean on chat or design-doc context. Documentation-only, never changes logic. Use when the user asks to clean up, trim, or review comments or docstrings, or complains about too many comments.'
argument-hint: [scope]
effort: xhigh
---

# Comment & Docstring Cleanup

Documentation-only pass: edit comments and docstrings, never code.
The mission is to fight the failure modes of generated documentation:
- too many comments
- facts in the wrong home: implementation details in docstrings, caller-facing facts in comments
- comments written for the author instead of for a stranger reading the repo in a year
- comments prone to going stale

The enemy is worthless comments, not comments: a missing why costs more than a wordy one, so a borderline why-comment stays.

## Scope

Resolve the scope the user gives before editing anything:

- "uncommitted changes": staged plus unstaged.
- "the last commit": `git show HEAD`.
- "since the last cleanup": diff since the newest commit whose message mentions "comment cleanup" (`git log --grep`). If none exists, ask.
- "since main" / "since <branch>": diff against the merge base with that branch.
- A file, a directory, or the whole repo: every source file in it, skipping generated and vendored code.

If no scope is given, use the uncommitted changes when they exist, otherwise the diff against the default branch. If that is empty too, ask.
In diff scopes, judge only comments and docstrings the diff adds or touches.
In file scopes, judge all of them.
Judgment stays within the scope, destinations need not: a fact may move to its correct home outside it.

## The end state

When the pass is done, the documentation in scope looks like this:

- Docstrings are the caller's contract: everything a caller may rely on without reading the body, and nothing more.
  - It should include only behavior observable from outside.
    For example, it may include: what it does, args, returns, units, valid ranges, side effects, errors raised, gotchas.
    Observable parts of the implementation (like argument mutation or a promised complexity bound) qualify.
  - It may not include behavior unobservable from outside.
    For example, details about the internal algorithm: documenting it couples callers to internals, and rots when the internals change.
    An algorithm worth documenting gets a comment inside the body, at its top when it explains the whole approach.
  - Its form follows the convention the project uses (numpydoc, Google-style, ...).
  - In languages without docstrings, these rules apply to whatever the language or repo uses as its doc-comment layer (Doxygen, Javadoc, `///`, JSDoc), usually above the declaration.
- Comments tell the maintainer what the code cannot, always from a different altitude than the code:
  - Higher, the why: intent, rationale, why this algorithm fits here, bugs guarded against,
    rejected alternatives and present-tense warnings ("don't use a dict here: insertion order breaks replay"),
    and honest uncertainty ("works, but the docs say it shouldn't, cause unknown").
  - Lower, the precision: invariants, exact units, bounds, ownership, edge cases the code leaves implicit.
  - Sideways, the reach: cross-site couplings ("if you change X, also update Y"),
    and pointers to theory the reader needs (a paper, an RFC, a wiki page).
  - At the code's own altitude there is nothing left to say: that is restatement.
- Every fact appears exactly once, next to what it documents.
  - A fact genuinely needed at several distant sites tells its full story once, as a named block (`# Note [Replication ID rotation]`) at the most relevant site.
    Every other dependent site carries a one-line pointer (`# see Note [Replication ID rotation]`): it marks there is something to know, without restating it.
  - Detail about a member lives on the member.
    A container docstring may orient, up to one line per member. Deeper detail at the container goes stale.
  - Docstrings do not restate the signature (repeated types, a description that only echoes a clear parameter name),
    unless the project's convention mandates that element.
- Everything reads correctly to a stranger who has the repo and nothing else:
  no leaning on conversations, design docs, PR threads, or plan files.

And it no longer contains:

- Comments that restate the code or the signature: `# loop over batches`, `"""Get the user."""` on `get_user`.
- Narration of the editing process: `# changed to a set`, `# now handles the empty case`.
- Commented-out code: version control owns history.
- Past-tense history. If a live warning hides inside, rewrite it in present tense.
- Wording longer than the facts require.
  But minimal never means cryptic: when a cut costs clarity, keep the words.

## Process: decide, then edit

The unit of judgment is the fact, not the comment: one comment can carry several facts with different fates.
Judgments interact (a fact must reach its correct home before its worth can be judged), so decide everything before editing anything, with the end state as the rulebook.

1. Read the scope and the surrounding code.
2. Break each comment and docstring into the facts it states.
3. Decide each fact's home: the docstring, a `#` comment on the exact lines it explains, a canonical comment with pointers, or nowhere.
   Place each fact fresh, ignoring where it sits now:
   the right home may be far away (a drifted comment returns to its lines) or across the docstring/comment line (in either direction).
4. Judge each fact in its home: does it earn its place in the end state?
   When a fact has several copies, keep one, picking or combining the best phrasing.
5. Edit: rewrite each comment and docstring from its surviving facts, in minimal wording.
   Match the file's existing conventions (docstring format, wrap width, comment tone).
   A fact moving into a docstring joins the right section (Args, Raises, Notes), not a note appended at the end.

For a small scope, hold this in your head.
For a medium scope, write the per-fact decisions down before editing.
For a large scope, split the edit into two rounds: apply the moves from step 3 for real, then judge and polish (steps 4 and 5) on the moved files.
Moving is lossless, so the extra round risks nothing, and the lossy judgments then run on a state you can see instead of one you must imagine.

## Hard limits

- Never change logic, order, names, or formatting of code lines.
- Never invent a fact: rephrase and relocate what the code and repo support, and never write a why from a guess.
- Never author documentation that was not there: missing content (an undocumented return value, an unstated error) is at most a flag.
- Never remove or rewrite a fact because it contradicts the code: either side may be the bug.
- Never reword a fact that already satisfies the end state: it stays byte-identical.
- Leave machine-read comments alone: lint and type pragmas (`# noqa`, `# type: ignore`), coverage and formatter directives, shebangs, encoding lines, license headers.
- Leave every TODO, FIXME, XXX, and HACK untouched.
- Keep doctests runnable, and where a docstring is consumed at runtime (CLI help, framework metadata), keep that content working.
- Remove a whole docstring only when nothing in it survives, the API is internal, and the project does not require docstrings.

## Flag, don't fix

Some findings deserve a fix the limits above forbid. Keep the text as the limits dictate, and record the finding in the report.
Every flag is a by-product of reading the pass already did: never hunt for one. Focus your attention on the cleanup process.

- A comment or docstring contradicting the code, or contradicting another doc: flag it as a contradiction.
  Also, mark it in place with `FIXME: <specific part, if relevant> contradicts <the code below | the docstring (which?)>`.
  For a docstring, the mark goes in a `#` comment beside it: rendered help is not the place for a FIXME.
  Relocation still applies: a contradicting fact that also sits in the wrong home moves together with its FIXME.
- A comment stating a checkable condition (an invariant, a precondition, a bound): an assertion cannot rot silently, so flag an assert candidate.
- Code that needs reverse-engineering to understand: flag a missing-why candidate.
- A docstring whose contract is visibly incomplete (a return value or raised error the caller would need): flag an incomplete contract.
- Section-title comments holding a long function together: keep them, and flag the function as a split candidate.
- A TODO that drifted from its code, or clumped with unrelated TODOs.

## Output

Apply the edits directly.
Exception: when the user asked for a review rather than a cleanup, stop after step 4 and present the per-fact verdicts in the template's shape (verdicts in place of changes), then offer to apply them.

Then report in exactly this shape:

```
# Cleaned comments and docstrings in <scope>
## Docstrings
<report briefly what changed. if needed, group by pattern or in another way. or say "Nothing to clean">

## Comments
<report briefly what changed. if needed, group by pattern or in another way. or say "Nothing to clean">

{* for each flag type with non-empty report: *}
## <flag type>
- <path:line>: <one sentence>
- <path:line>: <one sentence>

## <flag type>
- <path:line>: <one sentence>

---

{* if relevant: *} Would you like to apply any of the flags?
{* if relevant: *} Would you like to commit?
```

If the user wants to commit, use a message containing "comment cleanup", so a future "since the last cleanup" run can find it.
