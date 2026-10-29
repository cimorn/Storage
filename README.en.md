# Storage

[中文](README.md)

A self-hosted inventory app for desktop and mobile browsers. Manage photos, hierarchical categories and locations, multiple locations, tags, packaging flags, batch edits, duplicate items, and a private area.

Runs on Linux servers, Docker Desktop, and NAS devices. Images support `amd64` and `arm64`. Deployment requires Docker Compose 2.23.1+ and a private Alibaba Cloud OSS bucket.

## Deploy

```sh
git clone https://github.com/cimorn/Storage.git
cd Storage
cp .env.example .env
```

PowerShell: use `Copy-Item .env.example .env`. Set both passwords and your OSS settings in `.env`. Generate and copy the remaining four secrets:

```sh
docker run --rm node:24-bookworm-slim node -e "const c=require('node:crypto');for(const k of ['STORAGE_SESSION_SECRET','STORAGE_ENCRYPTION_KEY','STORAGE_MONGO_ROOT_PASSWORD','STORAGE_MONGO_PASSWORD'])console.log(k+'='+c.randomBytes(32).toString('hex'))"
docker compose up -d
```

Open [http://localhost:8094](http://localhost:8094).

For phone access, set `STORAGE_BIND_ADDRESS=0.0.0.0` and `STORAGE_PUBLIC_ORIGIN` to the actual LAN URL. For a domain, use an HTTPS reverse proxy, configure that origin, and set `STORAGE_ALLOW_HTTP=false`.

## Usage

Enter the access password to manage items and photos. Combine category, location, tag, and packaging filters. Drag categories and locations to reorder them. Each catalog node and its details show item-card counts including descendants. Shared location ancestors count each card once, and locked views count only ordinary items.

Add color, size, quantity, and packaging rows to each item. A blank quantity means 1; the item total sums all row quantities. Use the + control on a specification row to upload its photo directly; choosing again replaces that photo. Each photo belongs to only one specification. Leave color or size blank when it does not apply. Edit rows or view their photos and quantities in the Information tab. The card shows a packaging icon if any row is packaged. Bulk packaging changes apply to all rows of the selected items.

Cards show the name with a small gray brand beside it, specifications grouped by size (for example `Blue/Red·M | White·L`), and an optional third line for style. The current photo's quantity appears at the bottom-left only when greater than 1; the page counter is at the bottom-right. Both use small text and 75% transparent backgrounds. Click Edit beside Specifications to add a row or open Sort. In Sort, drag the color and size text rows, or use their up/down arrow keys; click Done to return to the fields; the first row with a photo supplies the cover. The dialog header keeps the name, category, locations and total quantity on one line; scroll long paths horizontally. Information opens directly on the variant table. Store up to 20 photos per item. Choose photos within their specification rows and upload only on Save. Removing a specification or photo requires confirmation; Cancel preserves the draft. Confirming removal of a specification also removes its photo. Click a photo in Edit or Information to enlarge the existing preview immediately; the full photo loads in the background without resizing the viewer. Name and brand share a row, style has its own row, and tags have a separate tab to the right of Information. Click a card to edit, or drag horizontally to switch photos. Left and right arrow keys also switch photos.

Uploads become WebP images with a maximum long edge of 1920 pixels, without enlarging the source, and photo metadata is removed. Photos follow category moves, and backups include every photo of each item.

Items are sorted by latest update by default.

New items reuse the most recently added item's category, locations, brand, style and variant settings in the current area. Enter a new name, barcode, tags and photos; the private checkbox is not carried over.

The background moves subtly as you scroll, and item cards slide into view on their first entrance. The first screen appears immediately. Both effects respect the system's reduced-motion preference.

The first visit downloads the interface. If a module fails to load after login, the page reloads once to fetch the current application; if it fails again, use Reload to try again.

Click the app name at the top-left to unlock the private area and show only private items. Click it again to return to ordinary items. Refreshing hides the private area again.

## Development

Requires Node.js 24+ and pnpm 11.

```text
web/        Web frontend, server, and web tests
desktop/    Independent Electron client, icons, and build scripts
scripts/    Docker runtime and backup/restore checks
```

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Development runs at `http://127.0.0.1:5173` with in-memory fixtures. Passwords: `preview-storage` and `preview-private`.

```sh
pnpm test
pnpm build
pnpm desktop:dev
pnpm desktop:build
```

Web output: `web/dist/renderer/`. Windows output: `dist/Desktop-*/`. Configure the client URL in `desktop/src/policy.cjs`; see [client development](desktop/README.md).

## Publish and update

The web app and desktop client share a version in the form `YY.major.minor`. For example, `26.1.1` is the first minor release of the first major series in 2026. Before publishing, update `version` in all three `package.json` files at the root, in `web/`, and in `desktop/`, then push to `main`. Increment the version for each release.

After tests and Docker deployment checks pass, GitHub Actions publishes `ghcr.io/cimorn/storage:latest` and the matching version tag, such as `ghcr.io/cimorn/storage:26.1.6`. The `latest` tag follows `main`. The desktop client has a separate build job; download its EXE, with the version in its filename, from that job's Artifacts.

Update the web service from the deployment directory:

```sh
docker compose pull storage
docker compose up -d --no-deps storage
```

Reopen the client after a web update. Rebuild and replace the EXE when the client itself changes.

## Backups and recovery

Back up **MongoDB, the OSS `Storage/` prefix, and the original `.env`**. Keep the volume and `STORAGE_ENCRYPTION_KEY` when updating.

[Backup and restore commands (Chinese)](docs/backup.md) · [Image pinning and rollback](docs/docker-images.md)

## License

[MIT](LICENSE)
