import { CATALOG, compareId, validateLoadout } from "./model";
import type { Loadout, Result } from "./types";

export function serializeLoadout(loadout: Loadout, catalog = CATALOG): string {
  const errors = validateLoadout(loadout, catalog);
  if (errors.length) throw new Error(errors.map(e => `${e.code}: ${e.message}`).join("; "));
  return JSON.stringify({ version: loadout.version, chassisId: loadout.chassisId,
    parts: [...loadout.parts].sort((a, b) => compareId(a.instanceId, b.instanceId)).map(p => ({
      instanceId: p.instanceId, partId: p.partId, layer: p.layer, x: p.x, y: p.y, rotation: p.rotation, facing: p.facing,
    })),
  });
}
export function deserializeLoadout(text: string, catalog = CATALOG): Result<Loadout> {
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { return { ok: false, errors: [{ code: "FORMAT", message: "装配JSON无效" }] }; }
  const errors = validateLoadout(value, catalog);
  return errors.length ? { ok: false, errors } : { ok: true, value: structuredClone(value as Loadout) };
}
