# Original Truckly — v91 snapshot

This branch contains the original Truckly app published at https://truckly.hatchable.site/, captured from Hatchable project `proj_MEO518rmLLl0`, deployment **v91** (2026-11-22T01:54:12+00:00).

## What is included

All **97 deployment files**: frontend source, API handlers, shared vendor catalog, schema migrations, platform configuration, vendored Leaflet assets, and four image assets. Each exported file was verified against the deployment's SHA-256 hash before upload. See [the snapshot manifest](../exports/truckly-v91-manifest.json).

This includes The Secret, My Truckly customer accounts and private visits/favorites/bookings, badge progress and digital rewards, large food-truck illustrations, and compact vendor details with credited Los Flippin Tacos food photography.

## Runtime and data

This source targets Hatchable's runtime. API handlers import the platform `hatchable` SDK; this is not a standalone Node server and has no build step. `hatchable.toml` declares end-user auth and private per-user row rules. Migrations recreate the application schema.

**No live customer records, database dump, passwords, session cookies, or environment secret values were exported in this snapshot.** The deployment's generated virtual `AGENTS.md` is not a stored source file and was not exported.

## Branch isolation

The snapshot was added only to the `clone` branch, based on the existing `main` commit `4836520029e91e952fb1817595ee961c67514e6a`. It does not deploy or modify any Hatchable project. Other branches remain separate.

Earlier documentation, tests, and historical archives inherited from `main` are retained as-is; they are not additional v91 deployment files. Use the manifest to distinguish the current published snapshot from those historical materials.
