# tsvikas/skills

A personal [Claude Code](https://code.claude.com/docs) plugin marketplace.
Each plugin ships one focused skill.

## Install

Add the marketplace, then install the plugins you want:

```shell
/plugin marketplace add tsvikas/skills
/plugin install prune-comments@tsvikas
```

Skills from a plugin are namespaced by the plugin name, so `prune-comments` is invoked as `/prune-comments:prune-comments`.
It also auto-triggers when the model decides the task fits, based on the skill's description.

## Plugins

### prune-comments

A documentation-only pass that trims comment and docstring bloat.
It deletes restatements and edit narration, re-homes facts between comments and docstrings, and rewrites comments that lean on chat or design-doc context.
It never changes logic.

It exists because the skill ecosystem had no strong published comment-cleanup skill.
Most cleanup tools either delete comments indiscriminately or leave the judgment entirely to an unguided model.
This one encodes a specific philosophy: keep the load-bearing comments (a why, an invariant, a workaround), cut the rest, and put every surviving fact in its correct home.

Works over a diff (a branch, the last commit, uncommitted changes) or whole files and directories.
Run it with a scope, for example:

```shell
/prune-comments:prune-comments since main
/prune-comments:prune-comments the last commit
```

See [`plugins/prune-comments/skills/prune-comments/SKILL.md`](plugins/prune-comments/skills/prune-comments/SKILL.md) for the full behavior, and `references.md` beside it for the research that shaped the rules.

## License

MIT. See [LICENSE](LICENSE).
