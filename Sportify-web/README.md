# Sportify web

Next.js app and API routes for Sportify, backed by Firebase Auth and Azure MySQL.

```bash
npm install
npm run dev          # http://localhost:3000
npm run lint
npm run typecheck
npm test             # API tests — needs a MySQL 8 database, see below
```

## Database schema and migrations

The schema lives in `db/migrations` and is applied with `npm run db:migrate`
(`npm run db:status` lists applied / pending). Routes never create or alter
tables at request time.

- Files run once each, in filename order, and are recorded in `schema_migrations`.
- `.sql` files run as-is; `.mjs` files export `up(db, { columnExists })` for
  conditional changes (MySQL 8 has no `ADD COLUMN IF NOT EXISTS`).
- Keep migrations idempotent: DDL auto-commits, so a failure part-way leaves
  earlier statements applied.
- Use the canonical table casing from `0001_baseline.sql` (`ClanLeaderboard`,
  `InternalSinglesMatches`, …). Azure MySQL is case-insensitive, Linux MySQL
  (CI, local Docker) is not.

Connection settings come from `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`,
`MYSQL_PASSWORD`, `MYSQL_DATABASE`; set `MYSQL_SSL=false` for a local database.

**Production:** `0001_baseline.sql` only uses `CREATE TABLE IF NOT EXISTS` and
`0002` only adds missing columns, so running `npm run db:migrate` against the
existing Azure database is safe. Run it before deploying code that needs a new
migration.

## Authorization

Every route authenticates with `getUserFromRequest` (`lib/auth.ts`, Firebase ID
token). Every mutating route then checks membership/role with the predicates in
`lib/authz.ts` and returns `forbidden()` (403) on failure:

| Check | Who passes |
|---|---|
| `isClanMember` | any member of the clan / batch |
| `isClanAdmin` | clan role Admin / Coach / Owner, or the owner of the batch's organisation |
| `getManagedTournament` | clan admin of the tournament's clan, or the user who created it |
| `isOrgOwner` / `isOrgStaff` / `isOrgMember` | org owner / owner or any batch coach / anyone in the org |

Roles are always read from the database, never taken from the request. The
`tests/authz.test.ts` suite checks that every POST/PUT/PATCH/DELETE route returns
401 without a token, plus a role matrix for the sensitive routes.

## Match results and scoring

- A clan match submitted by a player is stored in `MatchSubmissions` as
  *pending*. It only becomes an `InternalSinglesMatches` / `InternalDoublesMatches`
  row, and only changes `ClanLeaderboard`, when a player on the other side
  confirms it (`POST /api/clans/matches/confirm`) or a clan admin does. A clan
  admin's own submission is confirmed immediately. Pending items:
  `GET /api/clans/matches/pending?clanId=`.
- Tournament results are recorded by the host / clan admin, and only once per match.
- All leaderboard points come from `lib/scoring.ts` (`applyResult`). The points
  rule is a `ScoringModel`, so it can be replaced (e.g. Glicko-2) in one place.

## Tests

`npm test` drops and recreates the database named in `MYSQL_DATABASE` (it must
contain "test"), runs the migrations twice, then calls route handlers directly.
Firebase is stubbed: tests authenticate with `Authorization: Bearer uid:<id>`.

```bash
docker run -d --name sportify-mysql -e MYSQL_ROOT_PASSWORD=test -p 3306:3306 mysql:8.0
npm test
```

## Monitoring

Sentry is wired in `instrumentation.ts` (server) and `instrumentation-client.ts`
(browser). It is inactive until `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` are set.
