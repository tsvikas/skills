# Research notes: comments and docstrings

Distilled from a five-agent research sweep (July 2026) over practitioner essays, style guides, empirical studies, docstring philosophy, and the agent-skill ecosystem.
Background behind the prune-comments skill's rules, kept for provenance and future revisions.
It records what the sweep concluded, not the skill's current wording, so it need not change when SKILL.md does.

## Key sources

- antirez, "Writing system software: code comments" (http://antirez.com/news/124).
  Nine comment types from auditing Redis.
  Good: function, design, why, teacher, checklist, guide. Bad: trivial, debt, backup.
- Ousterhout, "A Philosophy of Software Design" ch. 12-16, and the public debate with Robert Martin (https://github.com/johnousterhout/aposd-vs-clean-code).
  Comments enable abstraction. Missing comments cost 10-100x more than imperfect ones.
- Kevlin Henney, "Comment Only What the Code Cannot Say" (97 Things, ch. 17).
  "Cannot say", not "does not say". A wrong comment is worse than none (Kernighan & Plauger).
- Google style guides, C++ comments and Python 3.8 (https://google.github.io/styleguide/).
  "Never describe the code. Assume the person reading the code knows the language better than you do."
  "Do not duplicate comments in both the .h and the .cc. Duplicated comments diverge."
  Docstring test: enough information to write a call without reading the function's code.
- Go doc comments (https://go.dev/doc/comment), Javadoc spec (spec vs implementation contract), Rust RFC 1574 + API guidelines, PEP 257, numpydoc, Linux kernel style ch. 8, LLVM standards.
- Empirics: iComment (SOSP 2007) found 33 real bugs from comment-code divergence in Linux/Mozilla/Apache.
  Commits with code-comment inconsistencies are ~1.5x more likely to introduce bugs within 7 days (arXiv 2409.10781).
- michaelpj, "On Commenting Code" (https://www.michaelpj.com/blog/2022/04/24/on-commenting-code.html).
  Comments preserve intellectual labour. GHC `Note [Title]` convention. Knowledge-debt and road-not-travelled comments.
- TigerBeetle TigerStyle: where a surprising condition is critical, a blatantly true assertion documents better than a comment (it executes).

## Findings

- Why over what is universal consensus, even Martin agrees in principle.
- Duplication diverges into real bugs (Google rule + iComment evidence).
- Restating the signature is explicitly forbidden by kernel, LLVM, PEP 257, Google.
- Needing section comments inside a function is a refactor signal (kernel doctrine).
- Ecosystems disagree on docstring mood (Python imperative, Rust/C++ third person), so guidance must defer to the file's conventions.
- The docstring/comment audience split matches Google C++ declaration-vs-definition comments, Javadoc spec-vs-implementation, and Go's doc-comment rules.
  Framing it as the organizing axis is our own synthesis, not directly attested anywhere.
- Ousterhout's altitude test: a keepable comment sits at a different level of abstraction than the code.
  Higher = intent and rationale.
  Lower = precision the code omits (units, bounds, ownership, null behavior).
  Same level = restatement, delete.
- Google's docstring test (write a call without reading the body) is the operational bar.
- Caller-relevance: implementation facts a caller can observe (mutation, side effects) belong in the docstring.
  Facts a caller cannot observe stay in comments (Javadoc: "native or synchronized" does not belong in the spec).
- Commented-out code is deleted on sight (antirez backup comments, Henney, Martin all agree, VCS owns history).
- Checklist comments ("if you touch X, update Y") are a keepable maintainer fact.
- Documented uncertainty (knowledge-debt) is keepable.
- The Note pattern: a fact needed at several distant sites gets one canonical home plus short named references.
- One-line-per-member summaries at container level are fine (PEP 257, Rust RFC 1574).
  The anti-pattern is full detail at a distance, not orientation.
- The enemy is worthless comments, not comments (Ousterhout's 10-100x): a guardrail against over-deletion.
- Assert candidates (TigerBeetle): a comment stating a checkable condition is better as an assertion.
  Report-only, since adding an assert is a code change.

## Ideas considered and rejected

- Contract completion (authoring missing Returns/Raises entries from code-visible behavior).
  Declined hard: the pass edits only documentation that exists, and absences are stumble-only flags.
  Otherwise the model assigns attention to hunting absences and the pass diverges into a code audit.
- Guide comments with zero technical content (antirez): legitimate in hand-written system code, but in generated code they are usually noise, and the section-title rule already covers the defensible case.
- Comment-first as a design practice (Ousterhout ch. 15): a writing-time practice, out of scope for a cleanup pass.
- Machine-checkable comment grammars (Trail of Bits dimensional-analysis): powerful, separate tool territory.

## Open leads

- Fluri et al. 2009 co-evolution numbers (paywalled, unverified: method comments co-evolve with code in ~7% of relevant changes).
- "Comment Traps" (arXiv 2512.20334) on AI commented-out code, unread, fetch failed.
- No comparable comment-cleanup skill was found published in the agent-skill ecosystem during the sweep.
