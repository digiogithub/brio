# Brio IDV Endpoints Extension

Identity Verification (IDV) endpoints for Brio, based on Veridas XpressID and ValiDas services.

## Features
- **ExpressID Integration**: Token generation and session management.
- **ValiDas Polling**: Result extraction, OCR data parsing, and score-based decisioning.
- **Backoffice Management**: Configurations stored in `idv_configs` collection.
- **Audit Logging**: All processes and detailed events logged to `idv_processes` and `idv_logs`.
- **Redis Support**: Optional Redis integration for high-performance session tracking.

## Configuration

Add the following to your Brio `.env`:

```bash
# Veridas Credentials
VERIDAS_API_KEY="your-api-key"
VERIDAS_BASE_URL="https://api.veridas.com/products/veridas/1.0.0"

# Optional: IDV Behavior
IDV_SKIP_SCORE_VALIDATION=false
VERIDAS_HTTP_TIMEOUT_MS=30000

# Optional: Redis Session Store (recommended for production)
REDIS_URL="redis://localhost:6379"
```

## API Endpoints

All endpoints are reachable under `/idv-endpoints/idv/`.

### 1. `POST /start`
Starts a new IDV process.
- **Payload**: `{"processId": "uuid", "configSlug": "slug", "metadata": {}}`
- **Returns**: `{"accessToken": "...", "validationId": "...", "processId": "..."}`

### 2. `POST /status`
Check current state of a process.
- **Payload**: `{"processId": "uuid"}`

### 3. `POST /result`
Fetch and persist final IDV results. Post-processes scores and OCR data.
- **Payload**: `{"processId": "uuid"}`

## Importing Configurations

You can import XpressID JSON configurations via:
1. **API**: `POST /idv-endpoints/idv/config/import`
2. **CLI**: `bun run ./src/cli/import.ts --file config.json --slug my_config --name "My Config"`

---

## Required Database Collections

Before using this extension, ensure the following collections exist in Brio:
- `idv_configs`: Stores XpressID JSON templates.
- `idv_processes`: Main audit trail for verification sessions.
- `idv_logs`: Detailed event logs.
