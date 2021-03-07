import { parse } from "./deps.ts";

export type IFN = () => Promise<void>;
const COMMANDS: Record<string, IFN> = {};

export function subcommand(command: string, fn: IFN): boolean {
  if (COMMANDS[command]) return false;
  COMMANDS[command] = fn;
  return true;
}

export async function subcommandstart() {
  const ret = parse(Deno.args, { "--": false });
  const command = ret["_"]?.[0];
  if (!command || !COMMANDS[command]) {
    await COMMANDS["*"]();
  } else {
    await COMMANDS[command]();
  }
}
