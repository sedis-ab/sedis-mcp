# Changesets

This directory holds [changesets](https://github.com/changesets/changesets) — one
markdown file per pending change that records the semver bump and a human-readable
release-note line. The release pipeline (`.github/workflows/release.yml`) turns the
accumulated changesets into a version bump, a `CHANGELOG.md` entry, and a GitHub
Release when a `v*` tag is pushed.

Add a changeset for any user-facing change:

```bash
npx changeset
```

See the [changesets docs](https://github.com/changesets/changesets/blob/main/docs/intro-to-using-changesets.md)
for the full workflow.
