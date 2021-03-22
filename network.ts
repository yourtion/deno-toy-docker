import { exec } from "./utils.ts";

export async function interfaceExists(name: string) {
  const ret = await exec("ip", "addr", "show", name);
  return !ret.stderr;
}
