import { parse } from "./deps.ts";

export type IFN = (args?: any) => Promise<void>;
const COMMANDS: Record<string, IFN> = {};

export function subcommand(command: string, fn: IFN): boolean {
  if (COMMANDS[command]) return false;
  COMMANDS[command] = fn;
  return true;
}

export async function subcommandstart() {
  const ret = parse(Deno.args, { "--": false });
  const command = ret["_"]?.[0];
  try {
    if (!command || !COMMANDS[command]) {
      await COMMANDS["*"](ret["_"]);
    } else {
      await COMMANDS[command](ret["_"]);
    }
  } catch (error) {
    if (error.message) console.error(error.message)
  }
}
