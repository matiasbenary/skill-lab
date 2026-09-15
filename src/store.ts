// Persistence layer: gateways in a json file next to the repo.
// ponytail: apiKeys in cleartext. If this stops running locally, it needs a secret store.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import type { Gateway } from "./gateway.ts";

const FILE = new URL("../gateways.json", import.meta.url);

export const list = (): Gateway[] => (existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : []);
export const get = (id: string): Gateway | undefined => list().find((g) => g.id === id);

export function upsert(gw: Omit<Gateway, "id"> & { id?: string }): Gateway {
  const gws = list();
  const saved = { ...gw, id: gw.id ?? crypto.randomUUID() } as Gateway;
  const i = gws.findIndex((g) => g.id === saved.id);
  i < 0 ? gws.push(saved) : (gws[i] = { ...gws[i], ...saved });
  writeFileSync(FILE, JSON.stringify(gws, null, 2));
  return saved;
}

export function remove(id: string): boolean {
  const gws = list();
  const left = gws.filter((g) => g.id !== id);
  writeFileSync(FILE, JSON.stringify(left, null, 2));
  return left.length < gws.length;
}

/** Without the api key: what can be returned over HTTP. */
export const redact = ({ apiKey, ...rest }: Gateway) => ({ ...rest, apiKey: apiKey ? "***" : "" });
