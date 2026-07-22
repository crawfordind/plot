# Plot

A map-first farm and homestead manager. Draw your land, track plantings and
events, log work in plain language, and run an NRCS-style rotational grazing
plan — all on top of a local-first SQLite database.

## Features

- **Map your land** — draw fields, beds, zones, and paddocks on an interactive
  [MapLibre](https://maplibre.org/) map, or drop pins and tap-to-place from any form.
- **Plantings & events** — create plantings, track their lifecycle, and record
  harvests, sales, costs, and notes against locations.
- **Natural-language logging** — type "harvested 12 lb of tomatoes from Row 1"
  and let the LLM parse it into structured, auto-linked events.
- **Rotational grazing (NRCS)** — build a grazing plan, subdivide fields into
  paddocks, move herds, and get deterministic next-move / rest / overgraze
  advice, with CSV export and a printable NRCS-528 record.
- **Photo insights** — attach photos (HEIC supported) and pull EXIF/location data.
- **Coach** — streaks, completeness prompts, and quick-start suggestions.

## Tech stack

- [Next.js](https://nextjs.org) (App Router) + React 19 + TypeScript
- [Drizzle ORM](https://orm.drizzle.team) over libSQL / SQLite (local file or [Turso](https://turso.tech))
- [OpenRouter](https://openrouter.ai) for natural-language parsing and vision
- MapLibre GL + react-map-gl for mapping
- Tailwind CSS v4

## Requirements

- Node.js 20+
- An [OpenRouter](https://openrouter.ai) API key (for NL parsing and photo analysis)

## Getting started

```bash
npm install
cp .env.example .env      # then fill in the values below
npm run db:setup          # create + migrate + seed the local SQLite database
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

By default the app uses a local SQLite file (`local.db`) — no cloud account
needed. Point `TURSO_DATABASE_URL` at a Turso database when you're ready to deploy.

## Environment

See [`.env.example`](.env.example) for the full annotated list. The essentials:

| Variable | Purpose |
|----------|---------|
| `TURSO_DATABASE_URL` | Database URL (`file:./local.db` for local dev, or a `libsql://` Turso URL) |
| `TURSO_AUTH_TOKEN` | Turso auth token (cloud only) |
| `OPENROUTER_API_KEY` | Required for natural-language logging and photo analysis |
| `OPENROUTER_MODEL` / `OPENROUTER_VISION_MODEL` | Model routing (sensible defaults provided) |
| `S3_*` | S3-compatible object storage for photo attachments (required in production) |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the development server |
| `npm run build` | Production build |
| `npm run db:setup` | Create, migrate, and seed the local database |
| `npm run db:migrate` | Apply migrations |
| `npm run db:generate` | Regenerate migrations after a schema change |
| `npm run db:studio` | Open Drizzle Studio |
| `npm run db:seed` | Seed sample data |

## Project status

Plot is an active work in progress. The core loop (onboarding, mapping,
plantings, NL logging, and the grazing plan → advisor chain) works end-to-end;
some peripheral areas are still being built out. See [QA-REPORT.md](QA-REPORT.md)
for a detailed, honest breakdown of what's solid and what's rough.

## Contributing

Contributions, bug reports, and ideas are very welcome — this project is shared
in the hope of getting help from the community. Please open an issue to discuss
larger changes before starting a pull request.

## License

Released under the [GNU Affero General Public License v3.0 or later](LICENSE).
© 2026 Daniel Crawford.

AGPL means you're free to use, study, modify, and share this software — but if
you run a modified version as a network service, you must make your source
available to its users under the same license.
