# LaTeX to SVG API

Convert LaTeX math equations to SVG with embedded metadata for round-trip editing.

## Quick Start

```bash
pnpm install
pnpm dev              # Start dev server on http://localhost:8787
```

## API Usage

### Plain Text (Simple)

```bash
# Render equation
echo "E=mc^2" | curl -X POST http://localhost:8787/api/v1/render \
  -H "Content-Type: text/plain" --data-binary @-

# With options
curl -X POST "http://localhost:8787/api/v1/render?display=inline&color=%23FF0000" \
  -H "Content-Type: text/plain" -d "x^2"
```

**Query Parameters:**
- `display`: `block` (default) or `inline`
- `engine`: `katex` or `mathjax` (default: `mathjax`)
- `metadata`: `true` (default) or `false`
- `color`: CSS color (e.g., `%23FF0000` for red, leave empty for recolorable SVG)

### JSON (Advanced)

```bash
curl -X POST http://localhost:8787/api/v1/render \
  -H "Content-Type: application/json" \
  -d '{
    "equations": [{"latex": "E=mc^2", "displayMode": "block"}],
    "options": {"engine": "mathjax", "color": "#0000FF"}
  }'
```

### Parse SVG

Extract LaTeX from SVG metadata:

```bash
curl -X POST http://localhost:8787/api/v1/parse \
  -H "Content-Type: application/json" \
  -d '{"svg": "<svg>...</svg>"}'
```

### Validate LaTeX

```bash
curl -X POST http://localhost:8787/api/v1/validate \
  -H "Content-Type: application/json" \
  -d '{"latex": "\\frac{1}{2}"}'
```

## Features

- **Round-trip editing**: SVG embeds original LaTeX in metadata
- **CLI-friendly**: Plain text input/output
- **Dual renderer**: KaTeX (fast) or MathJax (comprehensive)
- **Recolorable SVG**: Leave `color` empty for SVGs that inherit theme colors
- **Edge-deployed**: Fast global response via Cloudflare Workers

## Development

```bash
pnpm test             # Run tests
pnpm type-check       # TypeScript validation
pnpm lint             # Lint code
pnpm deploy           # Deploy to Cloudflare
```

## Stack

- Hono + Zod + MathJax/KaTeX + Cloudflare Workers
