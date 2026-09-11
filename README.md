# helium-services-worker

Self-host Helium's browser services on Cloudflare's free tier. One Worker covers search bangs, uBlock filter updates, and privacy-preserving extension downloads and updates — no servers to run.

This is a port of [imputnet/helium-services](https://github.com/imputnet/helium-services) (AGPL-3.0). Spellcheck dictionaries and macOS update proxying are not included.

## Host it

1. Fork this repo.
2. Add these repository secrets:
   - `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (from your Cloudflare dashboard)
   - `HMAC_SECRET` (any random string, 32+ characters — protects extension downloads)
   - `PROXY_BASE_URL` and `UBO_PROXY_BASE_URL` (your Worker URL plus `/ext` and `/ubo`, e.g. `https://helium-services-worker.<you>.workers.dev/ext`)
3. Push to `main`. GitHub Actions deploys automatically.

## Point Helium at it

In Helium, set your services origin to your Worker URL (e.g. `https://helium-services-worker.<you>.workers.dev`). Bangs, filter lists, and extension downloads/updates will flow through your own deployment.

## Tinker

```sh
pnpm install
pnpm dev            # local server on http://localhost:8787
pnpm typecheck
pnpm fetch-bangs    # refresh the bang list from upstream
```

Copy `.dev.vars` from the required secrets above for local runs. To follow a new uBlock release, bump the version pin and checksum in `src/ubo/assets-info.ts`.

## License

AGPL-3.0 or later, see `LICENSE`. If you run this publicly, share your source as the license requires.
