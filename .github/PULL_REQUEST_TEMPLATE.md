<!--
Thanks for contributing to @sedis-ab/mcp! Please keep PRs small and focused.
See CONTRIBUTING.md for the full workflow.
-->

## Summary

<!-- What does this PR change, and why? -->

## Type of change

- [ ] Bug fix (non-breaking)
- [ ] New tool / feature (non-breaking, additive)
- [ ] Documentation / repo hygiene
- [ ] Refactor / internal (no behavior change)
- [ ] Breaking change (explain below)

## Checklist

- [ ] PR title follows [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `chore:`, `test:`, `ci:`)
- [ ] `npm test` passes locally — **including the security suites** (`test/security/*`)
- [ ] `npm run build` is green
- [ ] A [changeset](https://github.com/changesets/changesets) was added (`npm run changeset`) for any user-facing change
- [ ] Change is **additive** and does not break the existing tool surface or argument shapes
- [ ] The thin-wrapper inertness invariant is preserved — **no** caching, tenant/auth/billing, or translation logic added to `src/`
- [ ] No secret, API key, or `SEDIS_API_KEY` value appears anywhere in the diff, tests, or fixtures

## Notes for reviewers

<!-- Anything reviewers should pay special attention to. -->
