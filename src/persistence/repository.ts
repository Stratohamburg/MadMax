import type { Settlement } from "../modes/pve/run";
import { applySettlement, newProfile, validateProfile } from "./profile";
import type { Profile } from "./profile";
import type { AtomicStore, Records } from "./store";
import { CATALOG } from "../loadout/model";
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
export function checksum(value: unknown): string {
  const text = canonical(value); let hash = 2166136261;
  for (const byte of new TextEncoder().encode(text)) { hash ^= byte; hash = Math.imul(hash, 16777619) >>> 0; }
  return hash.toString(16).padStart(8, "0");
}
export const envelope = (payload: unknown, version = 2) => JSON.stringify({ version, payload, checksum: checksum({ version, payload }) });
export class FutureVersionError extends Error { constructor() { super("存档来自更高版本，已保留原数据；请使用更新客户端"); } }
export function unpack(text: string) {
  const value = JSON.parse(text);
  if (Number(value.version) > 2) throw new FutureVersionError();
  if (![1, 2].includes(value.version) || value.checksum !== checksum({ version: value.version, payload: value.payload })) throw new Error("存档完整性校验失败");
  return value as { version: number; payload: unknown };
}
export function migrate(version: number, payload: unknown): Profile {
  if (version > 2) throw new FutureVersionError();
  let current = structuredClone(payload) as Profile;
  if (version === 1) {
    current = { ...current, version: 2, appliedRuns: current.appliedRuns ?? [],
      inventory: Object.fromEntries(Object.entries(current.inventory).map(([id, part]) => [id, { ...part, level: part.level ?? 0, hp: part.hp ?? CATALOG.parts[part.definitionId]?.hp }])) };
    version = 2;
  }
  if (version !== 2) throw new Error("缺少迁移路径");
  validateProfile(current); return current;
}
function read(records: Records): { profile: Profile; notice: string; source: string } {
  if (!records.primary && !records.backup) { const profile = newProfile(); return { profile, notice: "已创建本地档案", source: envelope(profile) }; }
  try { const decoded = unpack(records.primary!); return { profile: migrate(decoded.version, decoded.payload), notice: "", source: records.primary! }; }
  catch (error) {
    if (error instanceof FutureVersionError) throw error;
    if (!records.backup) throw new Error("主存档损坏且没有有效备份，已保留原数据");
    const decoded = unpack(records.backup);
    return { profile: migrate(decoded.version, decoded.payload), notice: "主存档损坏，已恢复最近有效备份", source: records.backup };
  }
}
export class ProfileRepository {
  constructor(readonly store: AtomicStore) {}
  async load(): Promise<{ profile: Profile; notice: string }> {
    return this.store.transaction(records => {
      const loaded = read(records); let profile = loaded.profile, notice = loaded.notice;
      if (records.pending) {
        const pending = unpack(records.pending).payload as Settlement;
        profile = applySettlement(profile, pending); notice += " 已恢复待入档结算";
      }
      return { records: { primary: envelope(profile), backup: loaded.source }, value: { profile, notice: notice.trim() } };
    });
  }
  async update(operation: (profile: Profile) => Profile): Promise<Profile> {
    return this.store.transaction(records => {
      if (records.pending) throw new Error("存在待入档结算，请先恢复");
      const loaded = read(records), profile = operation(loaded.profile); validateProfile(profile);
      return { records: { primary: envelope(profile), backup: loaded.source }, value: profile };
    });
  }
  async stage(result: Settlement): Promise<void> {
    return this.store.transaction(records => {
      const loaded = read(records);
      if (records.pending && (unpack(records.pending).payload as Settlement).runId !== result.runId) throw new Error("上次结算尚未入档");
      applySettlement(loaded.profile, result); // 先校验，失败不写入不可恢复的 pending。
      return { records: { ...records, primary: records.primary ?? loaded.source, pending: envelope(result) }, value: undefined };
    });
  }
  async settle(result: Settlement) { await this.stage(result); return this.load(); }
}
