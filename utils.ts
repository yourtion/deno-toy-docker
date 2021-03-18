export async function exec(...cmds: string[]) {
  let cmd;
  try {
    cmd = Deno.run({ cmd: cmds, stdout: "piped", stderr: "piped" });
    const output = await cmd.output()
    const stdout = new TextDecoder().decode(output);
    const error = await cmd.stderrOutput();
    const stderr = new TextDecoder().decode(error);
    return { stdout, stderr }
  } catch (error) {
    throw error
  } finally {
    cmd && cmd.close();
  }
}


export function cliOut(pre = "", sub = "", num = 1, n = 14) {
  console.log(pre.padEnd(n * num) + sub);
}
