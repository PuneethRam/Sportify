/**
 * Glicko-2 (Glickman, "Example of the Glicko-2 system", 2013), on the
 * familiar 1500 scale. Pure maths, no database: lib/ratings.ts applies it.
 *
 * Sportify uses one rating period per confirmed match. Players who don't play
 * are not touched (their RD does not grow with inactivity).
 */

export const RATING_CONFIG = {
  /** Starting rating, rating deviation (RD) and volatility for a new player. */
  initialRating: 1500,
  initialRd: 350,
  initialVolatility: 0.06,
  /** System constant: how much volatility may change. Glickman suggests 0.3–1.2. */
  tau: 0.5,
  /** Convergence tolerance for the volatility iteration. */
  epsilon: 0.000001,
  /** A player is "Provisional" until they have this many rated matches... */
  provisionalMatches: 10,
  /** ...or their RD drops below this. */
  provisionalRd: 110,
} as const;

const SCALE = 173.7178;

export interface Rating {
  rating: number;
  rd: number;
  volatility: number;
}

export interface Game {
  opponent: Pick<Rating, "rating" | "rd">;
  /** 1 win, 0 loss, 0.5 draw. */
  score: number;
}

export const newRating = (): Rating => ({
  rating: RATING_CONFIG.initialRating,
  rd: RATING_CONFIG.initialRd,
  volatility: RATING_CONFIG.initialVolatility,
});

const g = (phi: number) => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
const E = (mu: number, muJ: number, phiJ: number) => 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));

/** One Glicko-2 rating period for `player` against `games`. */
export function update(player: Rating, games: Game[], tau: number = RATING_CONFIG.tau): Rating {
  const mu = (player.rating - 1500) / SCALE;
  const phi = player.rd / SCALE;
  const sigma = player.volatility;

  if (!games.length) {
    const phiStar = Math.sqrt(phi * phi + sigma * sigma);
    return { rating: player.rating, rd: phiStar * SCALE, volatility: sigma };
  }

  const opp = games.map(gm => ({
    mu: (gm.opponent.rating - 1500) / SCALE,
    phi: gm.opponent.rd / SCALE,
    s: gm.score,
  }));

  // Step 3: estimated variance; step 4: estimated improvement
  let vInv = 0;
  let deltaSum = 0;
  for (const o of opp) {
    const gPhi = g(o.phi);
    const e = E(mu, o.mu, o.phi);
    vInv += gPhi * gPhi * e * (1 - e);
    deltaSum += gPhi * (o.s - e);
  }
  const v = 1 / vInv;
  const delta = v * deltaSum;

  // Step 5: new volatility (Illinois algorithm)
  const a = Math.log(sigma * sigma);
  const f = (x: number) => {
    const ex = Math.exp(x);
    const d = phi * phi + v + ex;
    return (ex * (delta * delta - phi * phi - v - ex)) / (2 * d * d) - (x - a) / (tau * tau);
  };
  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * tau) < 0) k++;
    B = a - k * tau;
  }
  let fA = f(A);
  let fB = f(B);
  while (Math.abs(B - A) > RATING_CONFIG.epsilon) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA /= 2;
    }
    B = C;
    fB = fC;
  }
  const newSigma = Math.exp(A / 2);

  // Steps 6–8: new RD and rating
  const phiStar = Math.sqrt(phi * phi + newSigma * newSigma);
  const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const newMu = mu + newPhi * newPhi * deltaSum;

  return { rating: newMu * SCALE + 1500, rd: newPhi * SCALE, volatility: newSigma };
}

/**
 * Doubles: each pair is treated as one player whose rating is the mean of the
 * partners' ratings and whose RD is the root-mean-square of their RDs
 * (sqrt((rd1² + rd2²) / 2); volatility is the mean). That composite plays one
 * Glicko-2 period against the other pair's composite. Each partner then gets:
 *   - rating: their own rating plus the pair's rating change (both partners
 *     move by the same number of points);
 *   - RD and volatility: their own, scaled by the same factor as the pair's
 *     (so a new player paired with a veteran keeps a higher RD than the
 *     veteran, instead of both being set to the pair's value).
 */
export function teamComposite(partners: Rating[]): Rating {
  const n = partners.length;
  return {
    rating: partners.reduce((s, p) => s + p.rating, 0) / n,
    rd: Math.sqrt(partners.reduce((s, p) => s + p.rd * p.rd, 0) / n),
    volatility: partners.reduce((s, p) => s + p.volatility, 0) / n,
  };
}

/**
 * Rates one match between two sides (one player each for singles, two for
 * doubles). `score` is side 1's result: 1 win, 0 loss, 0.5 draw. Returns the
 * new ratings in the same shape as the input.
 */
export function rateMatch(side1: Rating[], side2: Rating[], score: number): [Rating[], Rating[]] {
  const t1 = teamComposite(side1);
  const t2 = teamComposite(side2);
  const n1 = update(t1, [{ opponent: t2, score }]);
  const n2 = update(t2, [{ opponent: t1, score: 1 - score }]);
  const apply = (players: Rating[], before: Rating, after: Rating) =>
    players.length === 1
      ? [after]
      : players.map(p => ({
          rating: p.rating + (after.rating - before.rating),
          rd: p.rd * (after.rd / before.rd),
          volatility: p.volatility * (after.volatility / before.volatility),
        }));
  return [apply(side1, t1, n1), apply(side2, t2, n2)];
}

/** "Provisional" until 10 rated matches or RD below 110. */
export function isProvisional(r: { rd: number; matches: number }) {
  return r.matches < RATING_CONFIG.provisionalMatches && r.rd >= RATING_CONFIG.provisionalRd;
}
