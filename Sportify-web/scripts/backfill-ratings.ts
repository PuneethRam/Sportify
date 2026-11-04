// Rebuilds every Glicko-2 rating from confirmed match history, in time order.
// Idempotent: run it as often as you like; it gives the same result as the
// live updates did (tests/ratings.test.ts checks that).
//
//   npm run ratings:backfill        (uses the MYSQL_* env vars, like db:migrate)
import { pool } from "@/lib/db";
import { recomputeRatings } from "@/lib/ratings";

recomputeRatings()
  .then(r => console.log(`Rated ${r.matches} matches; ${r.players} player ratings.`))
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(() => pool.end());
