// Parity check: the browser calculation (simulate) must give exactly the same results as the
// database function private.containment_results, which computes saved plans. The SQL is read
// from the managed migration and run in an isolated in-memory PGlite; no hosted data is touched.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { demoModel, simulate, type ContainmentModel, type Edge } from "@/lib/containment-graph";

let db: PGlite;

function containmentResultsSql() {
  const folder = `${process.cwd()}/supabase/migrations/`;
  for (const name of readdirSync(folder).sort()) {
    const sql = readFileSync(`${folder}${name}`, "utf8");
    const start = sql.indexOf("CREATE FUNCTION private.containment_results(");
    if (start === -1) continue;
    const body = sql.indexOf("AS $$", start);
    const end = sql.indexOf("$$;", body + 5);
    return sql.slice(start, end + 3);
  }
  throw new Error("private.containment_results is missing from the migrations");
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec("CREATE SCHEMA private;");
  await db.exec(containmentResultsSql());
}, 30000);
afterAll(async () => {
  await db.close();
});

async function sqlResults(model: ContainmentModel, isolated: string) {
  const res = await db.query<{ r: unknown }>(
    "SELECT private.containment_results($1::jsonb, $2::uuid) AS r",
    [JSON.stringify(model), isolated],
  );
  return res.rows[0]!.r;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
}
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function randomModel(r: () => number): ContainmentModel {
  const n = 2 + Math.floor(r() * 7);
  const systems = Array.from({ length: n }, (_, i) => uid(i + 1));
  const edges = (p: number) => {
    const out: Edge[] = [];
    for (const from of systems)
      for (const to of systems) if (from !== to && r() < p) out.push({ from, to });
    return out;
  };
  const pick = (p: number) => systems.filter(() => r() < p);
  return {
    systems,
    spread: edges(0.3),
    dependencies: edges(0.15),
    starts: pick(0.3),
    critical: pick(0.3),
  };
}

describe("simulate matches the database containment_results function", () => {
  it("for every isolation choice in the synthetic scenario", async () => {
    for (const isolated of demoModel.systems) {
      expect(simulate(demoModel, isolated)).toEqual(await sqlResults(demoModel, isolated));
    }
  });

  it("for 150 generated models, including cycles and isolated starting points", async () => {
    const r = rng(42);
    for (let i = 0; i < 150; i++) {
      const model = randomModel(r);
      const isolated = model.systems[Math.floor(r() * model.systems.length)]!;
      expect(simulate(model, isolated)).toEqual(await sqlResults(model, isolated));
    }
  }, 30000);
});
