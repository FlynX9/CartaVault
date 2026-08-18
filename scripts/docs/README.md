# CartaVault documentation pipeline

Run from the repository root:

```powershell
backend/.venv/Scripts/python scripts/docs/generate_docs.py
backend/.venv/Scripts/python scripts/docs/generate_docs.py --check
```

The first command refreshes the functional manifest output, coverage report, navigation, OpenAPI, environment, CLI, and feature references. The second command is read-only and fails when committed output is stale or FR/EN page parity is broken.

From `website/`, the durable workflow is:

```powershell
npm run docs:discover   # refresh inventory, functional pages, navigation and coverage
npm run docs:matrix     # expand each product view to FR/EN desktop and mobile scenarios
npm run docs:capture    # reset the isolated demo, capture the real UI and synchronize images
npm run docs:generate   # regenerate every derived page and report
npm run docs:build      # build and index the static documentation
npm run docs:check      # verify generated sources and language parity without writing
npm run docs:refresh    # run the complete pipeline
```

The functional source of truth is `docs/functional/manifest.json`. Screenshots only use the isolated `cartavault_demo` database and fictitious `@cartavault.local` identities.
