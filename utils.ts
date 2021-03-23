import {
  createHash,
  ensureDir,
  ensureFile,
  readerFromStreamReader,
  Untar,
} from "./deps.ts";

/**
 * 执行命令行操作 
 */
export async function exec(...cmds: string[]) {
  let cmd;
  try {
    cmd = Deno.run({ cmd: cmds, stdout: "piped", stderr: "piped" });
    const { success } = await cmd.status();
    const output = await cmd.output();
    const stdout = new TextDecoder().decode(output);
    const error = await cmd.stderrOutput();
    const stderr = new TextDecoder().decode(error);
    if (!success) throw new Error(stderr);
    return { stdout, stderr };
  } catch (error) {
    throw error;
  } finally {
    cmd && cmd.close();
  }
}

/**
 * 执行命令行操作 2
 */
export function exec2(cmds: string) {
  return exec(...cmds.split(" "));
}

/**
 * 通过 cli 输出
 * @param pre 前缀
 * @param sub 后缀
 * @param level padding 层级
 * @param padding padding 字符数
 */
export function cliOut(pre = "", sub = "", level = 1, padding = 14) {
  console.log(pre.padEnd(padding * level) + sub);
}

/**
 * 下载文件
 * @param url 文件地址
 * @param dist 目标文件路径
 */
export async function download(url: string, dist: string) {
  let file;
  try {
    const res = await fetch(url);
    file = await Deno.open(dist, { create: true, write: true });
    const reader = readerFromStreamReader(res.body!.getReader());
    await Deno.copy(reader, file);
  } catch (error) {
    throw error;
  } finally {
    file && file.close();
  }
}

/**
 * 解压文件
 * @param file 文件路径
 */
export async function untarFile(file: string) {
  let reader;
  try {
    reader = await Deno.open(file, { read: true });
    const untar = new Untar(reader);
    for await (const entry of untar) {
      console.log(entry);
      if (entry.type === "directory") {
        await ensureDir(entry.fileName);
        continue;
      }
      await ensureFile(entry.fileName);
      const dist = await Deno.open(entry.fileName, { write: true });
      await Deno.copy(entry, dist);
    }
  } catch (error) {
    throw error;
  } finally {
    reader && reader.close();
  }
}

/**
 * 计算文件 hash
 * @param file 文件路径
 * @param mode hash 模式
 * @param hash 
 * @returns 
 */
export async function getHash(file: string, mode: string) {
  let f;
  try {
    const hasher = createHash(mode as any);
    f = await Deno.open(file, { read: true });
    for await (const chunk of Deno.iter(f)) {
      hasher.update(chunk);
    }
    return hasher.toString();
  } catch (error) {
    throw error;
  } finally {
    f && f.close();
  }
}

/**
 * 从 docker url 获取哈希信息
 * @param url 链接
 */
export function getHashInfo(url: string) {
  const arr = url?.split("/");
  if (arr.length < 1) return;

  const last = arr[arr.length - 1];
  const r = last.split(":", 2);
  if (r.length !== 2) return;

  return { mode: r[0], hash: r[1] };
}

// async function run() {
//   const url = "https://y73hag4a.mirror.aliyuncs.com/v2/library/nginx/blobs/sha256:801bfaa63ef2094d770c809815b9e2b9c1194728e5e754ef7bc764030e140cea";
//   const file = "/tmp/1.tar"
//   // await download(url, file)
//   const { mode, hash } = getHashInfo(url)!;
//   console.log(await getHash(file, mode, hash));
//   await untarFile(file)
// }

// run().then(console.log).catch(console.error)
