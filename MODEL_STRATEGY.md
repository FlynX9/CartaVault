# CartaVault — Model strategy

## Default
`opencode-go/gpt-5.6-luna`

## Roles
- exploration: `opencode-go/mimo-v2.5`
- trivial/high-volume: `opencode-go/deepseek-v4-flash`
- normal build: `opencode-go/gpt-5.6-luna`
- review: `opencode-go/minimax-m3`
- difficult code: `opencode-go/kimi-k2.7-code`
- second difficult opinion: `opencode-go/deepseek-v4-pro`
- architecture: `opencode-go/glm-5.2`
- security/critical: `zen-gpt/gpt-5.6-sol`

## Escalation
Luna → Kimi K2.7 Code → DeepSeek V4 Pro or GLM-5.2 → Sol/Kimi K3/Grok only if justified.

## Sessions
One session per coherent workstream. Keep related changes together; start a new session when changing subsystem or when context becomes noisy.
