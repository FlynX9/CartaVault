# CartaVault documentation pipeline

Run from the repository root:

```powershell
backend/.venv/Scripts/python scripts/docs/generate_docs.py
backend/.venv/Scripts/python scripts/docs/generate_docs.py --check
```

The first command refreshes OpenAPI, environment, CLI, and feature references. The second command is read-only and fails when committed output is stale or FR/EN page parity is broken.
