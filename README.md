# helium-services-worker

Stateless Cloudflare Workers port of the browser-facing services from [imputnet/helium-services](https://github.com/imputnet/helium-services) (AGPL-3.0), which provides backend services for the Helium browser at `services.helium.imput.net`.

The Worker serves search bang data, uBlock Origin filter assets, and the Chrome Web Store extension proxy (Omaha protocol, store snippets, signed CRX downloads) from a single deployment with edge caching. No containers, reverse proxy, certificate automation, database, or key-value store is required.

Out of scope by design: spellcheck dictionaries (`/dict`), macOS update proxying (`/updates/mac`), crash reporting, and push services.

## Routes

| Path | Behavior |
| ---- | -------- |
| `GET /` | 302 redirect to `https://helium.computer` |
| `GET /robots.txt` | `Disallow: /` for all agents |
| `GET /connectivitycheck` | 204, no body |
| `GET /bangs.json` | Static bang manifest, `Cache-Control: public, max-age=86400, stale-if-error=604800`, CORS `*` |
| `GET /com`, `POST /com` | Omaha update protocol (component updates) |
| `/ext/proxy` | Signed CRX payload proxy (GET, HMAC-verified, 1-hour expiry, store-host allowlist) |
| `/ext/cws_snippet?id=...` | Chrome Web Store item snippet proxy (GET/POST) |
| `/ext/`, `/ext/com` | Omaha update protocol (extension updates) |
| `GET /ubo/assets.json` | Rewritten uBO asset manifest, Brotli-only, `max-age=3600`, ETag/`304` support |
| `GET /ubo/<list>/<hash>/<file>` | Proxied filter lists with include/diff resolution, same caching semantics |

All other paths return 404. The uBO endpoints require Brotli (`Accept-Encoding: br`) and return 406 otherwise, matching upstream behavior.

## Configuration

Set the public base URLs in `wrangler.jsonc` to the deployed hostname:

```jsonc
{
  "vars": {
    "PROXY_BASE_URL": "https://services.example.com/ext",
    "UBO_PROXY_BASE_URL": "https://services.example.com/ubo"
  }
}
```

Set the signing secret (minimum 32 characters) via Wrangler; it is never committed:

```sh
wrangler secret put HMAC_SECRET
```

Without `HMAC_SECRET`, CRX proxying is disabled and `/ext/proxy` returns 404. Signed download URLs expire one hour after issuance.

### Optional variables

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `UBO_USE_ORIGINAL_UBLOCK_ASSETS` | unset (Helium fork) | Set to `1`/`true` to serve upstream gorhill/uBlock assets instead of the Helium filter set |
| `UBO_ASSETS_JSON_URL` / `UBO_ASSETS_JSON_SHA256` | unset | Serve a fully custom `assets.json`; both must be set together and cannot be combined with the previous option |
| `CHROMIUM_FALLBACK_VERSION` | `151.0.7922.71` | Chromium stable version advertised to the update service when the version feed is unreachable |

## Development

```sh
pnpm install
pnpm dev            # local server on http://localhost:8787
pnpm typecheck      # tsc --noEmit
pnpm deploy         # deploy to Cloudflare
pnpm fetch-bangs    # refresh public/bangs.json from upstream
```

Local development reads `.dev.vars` for secrets and variable overrides. The uBO version pin and checksum in `src/ubo/assets-info.ts` track upstream releases and must be bumped together when following a new uBlock release.

## Architecture notes

- Omaha requests are translated and forwarded to Google's update service with a randomized Chromium stable version and filtered request/response headers; extension IDs are validated (`/^[a-p]{32}$/`, duplicate and version checks) and component updates are restricted to an allowlist (CRLSet).
- Request mixing (decoy extensions) is disabled: Worker isolates share no memory, and a self-hosted deployment gains no herd privacy from it. The passthrough path preserves response filtering of download URLs into signed proxy URLs.
- uBO manifests are checksum-verified against the pinned SHA-256 before rewriting. Filter bodies are Brotli-compressed once per edge-cache miss and stored in the datacenter-local edge cache (`caches.default`) plus CDN fetch caching for upstream origin reads. The in-isolate URL allowlist rebuilds itself from the cached manifest and parent lists, so cold isolates resolve nested includes without a 404 cycle.
- Static files are served through the `ASSETS` binding from `public/`.

## License

GNU Affero General Public License v3.0 or later, see `LICENSE`. A public deployment of this network service must offer all users access to its Corresponding Source as required by AGPL-3.0 §13.
