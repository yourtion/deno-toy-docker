import { path } from "./deps.ts"
import { subcommand, subcommandstart } from "./cli.ts";
import { cliOut, exec } from "./utils.ts";
import * as log from "./log.ts"

// Docker镜像源地址
const registryMirror = Deno.env.get("TOCKER_REGISTRY_MIRROR") || "https://y73hag4a.mirror.aliyuncs.com";
// 数据根目录
const tockerRoot = Deno.env.get("TOCKER_DATA_PATH") || path.join(Deno.env.get("HOME") || "~/", ".tocker");
// 镜像本地存储目录
const imageDataPath = path.join(tockerRoot, "images");
// 容器本地存储目录
const containerDataPath = path.join(tockerRoot, "containers");
// cgroups限制分组
const cgroups = "cpu,cpuacct,memory";

subcommand("pull", cmdPull);
subcommand("images", cmdImages);
subcommand("rm", cmdRm);
subcommand("rmi", cmdRmi);
subcommand("ps", cmdPs);
subcommand("run", cmdRun);
subcommand("exec", cmdExec);
subcommand("logs", cmdLogs);
subcommand("*", cmdHelp);
subcommandstart();

async function cmdPull(args: any) {
  const { longName, tag } = parseImageName(args[1])!;
  const fullName = getImageFullName(longName, tag);
  const { id, info, raw } = await getImageManifests(longName, tag);
  console.log(fullName, { id, info, raw })
  const imageDir = path.join(imageDataPath, id);
  const rootfs = path.join(imageDir, "rootfs");
  await exec("mkdir", "-p", rootfs);

  const tmpTar = path.join(imageDataPath, `tmp_${id}.tar`);

  for (const item of info.fsLayers) {
    const url = `${registryMirror}/v2/${longName}/blobs/${item.blobSum}`;
    await exec("curl", "-L", "-o", tmpTar, url);
    await exec("tar", "-xf", tmpTar, "-C", rootfs);
  }
  await exec("rm", "-f", tmpTar);
  await Deno.writeTextFile(path.join(imageDir, "img.source"), fullName);
  await Deno.writeTextFile(path.join(imageDir, "img.manifests"), JSON.stringify(info));
  log.info(`已成功拉取镜像${fullName}`);
}
async function cmdImages() { }
async function cmdRm() { }
async function cmdRmi() { }
async function cmdPs() { }
async function cmdRun() { }
async function cmdExec() { }
async function cmdLogs() { }
async function cmdHelp() {
  cliOut();
  cliOut("用法: tocker COMMAND");
  cliOut();
  cliOut("命令:");
  cliOut("  pull", "从国内镜像源拉取Docker镜像");
  cliOut("  images", "列出已下载到本地的镜像");
  cliOut("  rmi", "删除指定的本地镜像");
  cliOut("  rm", "删除指定容器");
  cliOut("  ps", "列出所有容器");
  cliOut("  run", "启动新容器");
  cliOut("  exec", "在一个运行中的容器内执行指定命令");
  cliOut("  logs", "查看指定容器的日志输出");
  cliOut("  help", "打印本帮助信息");
  cliOut();
  await Promise.resolve();
}

function getImageFullName(longName: string, tag: string) {
  return `${longName}:${tag}`;
}

function parseImageName(image: string) {
  if (!image) log.fatal("用法: tocker pull IMAGE");
  const name = image.split(":")[0];
  const tag = image.split(":")[1] || "latest";
  const longName = getImageLongName(name);
  return { longName, tag };
}

function getImageLongName(name: string) {
  return name.includes("/") ? name : `library/${name}`;
}

async function getImageManifests(longName: string, tag: string) {
  const url = `${registryMirror}/v2/${longName}/manifests/${tag}`;
  log.debug(url)
  const res = await fetch(url);
  if (res.status !== 200) {
    log.fatal(`无法获取镜像元数据：status ${res.status}: ${res.body}`);
  }
  const info = await res.json();
  const id = (res.headers.get("docker-content-digest") || "").replace("sha256:", "");
  if (!id) {
    log.fatal(`无法获取镜像元数据：无法获取docker-content-digest响应头`);
  }
  return { id, info, raw: res.body! };
}
