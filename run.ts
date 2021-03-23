import { datetime, exists, path } from "./deps.ts";
import { subcommand, subCommandStart } from "./cli.ts";
import { cliOut, exec, exec2 } from "./utils.ts";
import { interfaceExists } from "./network.ts";
import * as log from "./log.ts";

// Docker镜像源地址
const registryMirror = Deno.env.get("TOCKER_REGISTRY_MIRROR") ||
  "https://y73hag4a.mirror.aliyuncs.com";
// 数据根目录
const tockerRoot = Deno.env.get("TOCKER_DATA_PATH") ||
  path.join(Deno.env.get("HOME") || "~/", ".tocker");
// 镜像本地存储目录
const imageDataPath = path.join(tockerRoot, "images");
// 容器本地存储目录
const containerDataPath = path.join(tockerRoot, "containers");
// cgroups限制分组
const cgroups = "cpu,cpuacct,memory";

async function init() {
  if (!(await interfaceExists("tocker0"))) {
    const tmpFile = await Deno.makeTempFile();
    await Deno.writeTextFile(
      tmpFile,
      `
# 配置tocker网桥
ip link del tocker0
ip link add name tocker0 type bridge
ip link set tocker0 up
ip addr add 172.15.0.1/16 dev tocker0

# 设置IP转发
echo 1 > /proc/sys/net/ipv4/ip_forward

# 将源地址为172.15.0.0/16并且不是tocker0网卡发出的数据进行源地址转换
# iptables -F && iptables -X
iptables -t nat -A POSTROUTING -o tocker0 -j MASQUERADE
iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
iptables -t nat -L -n
    `.trim(),
    );
    console.log(await exec("sh", tmpFile));
  }
}

subcommand("pull", cmdPull);
subcommand("images", cmdImages);
subcommand("rm", cmdRm);
subcommand("rmi", cmdRmi);
subcommand("ps", cmdPs);
subcommand("run", cmdRun);
subcommand("exec", cmdExec);
subcommand("logs", cmdLogs);
subcommand("*", cmdHelp);
subCommandStart(init);

async function cmdPull(args: any) {
  const { longName, tag } = parseImageName(args[1])!;
  const fullName = getImageFullName(longName, tag);
  const { id, info, raw } = await getImageManifests(longName, tag);
  log.debug(fullName, { id, info, raw });
  const imageDir = path.join(imageDataPath, id);
  const rootfs = path.join(imageDir, "rootfs");
  await Deno.mkdirSync(rootfs, { recursive: true });

  const tmpTar = path.join(imageDataPath, `tmp_${id}.tar`);

  for (const item of info.fsLayers) {
    const url = `${registryMirror}/v2/${longName}/blobs/${item.blobSum}`;
    console.log(url);
    // TODO: 替换为原生方法，同时校验哈希
    await exec("curl", "-L", "-o", tmpTar, url);
    await exec("tar", "-xf", tmpTar, "-C", rootfs);
  }
  await Deno.remove(tmpTar, { recursive: true });
  await Deno.writeTextFile(path.join(imageDir, "img.source"), fullName);
  await Deno.writeTextFile(
    path.join(imageDir, "img.manifests"),
    JSON.stringify(info),
  );
  log.info(`已成功拉取镜像${fullName}`);
}
async function cmdImages() {
  const images = await loadLocalImages();
  const list = Object.keys(images)
    .map((n) => ({ ...images[n], id: n }))
    .sort((a, b) => a.time - b.time);

  cliOut("ID\t\t\t\t\t\t\t\t\t修改时间\t\t完整名称");
  cliOut("-".repeat(130));
  list.forEach((item) => {
    console.log(
      "%s\t%s\t%s",
      item.id,
      datetime.format(new Date(item.time!), "yyyy-MM-dd HH:mm:ss"),
      item.fullName,
    );
  });
}
async function cmdRm(args: any) {
}
async function cmdRmi(args: any) {
  const name = args[1];
  const imageInfo = await findImage(name);
  if (imageInfo) {
    await Deno.remove(imageInfo.path, { recursive: true });
    return log.info(`已删除镜像${name}`);
  }
  return log.fatal(`镜像${name}不存在`);
}
async function cmdPs() {}
async function cmdRun(args: any) {
  const imageName = args[1];
  const cmd = args[2];

  const imageInfo = await findImage(imageName);
  if (!imageInfo) {
    return log.fatal(`镜像${imageName}不存在`);
  }

  const imageManifestsF = await Deno.readFile(
    path.join(imageInfo.path, "img.manifests"),
  );
  const imageManifests = JSON.parse(new TextDecoder().decode(imageManifestsF));
  const imageConfig = JSON.parse(
    (imageManifests.history && imageManifests.history[0] &&
      imageManifests.history[0].v1Compatibility) || "{}",
  ).config;
  const imageRootfs = path.join(imageInfo.path, "rootfs");

  const id = Math.random().toString(36).substring(7).toLowerCase();
  const dir = path.join(containerDataPath, id);
  const rootfs = path.join(dir, "rootfs");
  const mountDir = path.join(dir, "mount");
  const workDir = path.join(dir, "work");
  await Deno.mkdir(dir, { recursive: true });
  await Deno.writeTextFile(
    path.join(dir, "image.json"),
    JSON.stringify(imageInfo),
  );

  // 挂载虚拟文件系统
  await Deno.mkdir(mountDir, { recursive: true });
  await Deno.mkdir(rootfs, { recursive: true });
  await Deno.mkdir(workDir, { recursive: true });

  const mountRet = await exec2(
    `mount -t overlay -o lowerdir="${imageRootfs}",upperdir="${rootfs}",workdir="${workDir}" "tocker_${id}" "${mountDir}"`,
  );
  log.debug({ mountRet });

  if (imageConfig && imageConfig.Volumes) {
    const keys = Object.keys(imageConfig.Volumes);
    for (const n of keys) {
      await Deno.mkdir(rootfs + n, { recursive: true });
    }
  }

  // 配置虚拟网络
  const ip = `${parseInt(String(Math.random() * 254), 10) +
    1}.${parseInt(String(Math.random() * 254), 10) + 1}`;
  await exec2(`ip link add dev veth0_${id} type veth peer name veth1_${id}`);
  await exec2(`ip link set dev veth0_${id} up`);
  await exec2(`ip link set veth0_${id} master tocker0`);
  await exec2(`ip netns add netns_${id}`);
  await exec2(`ip link set veth1_${id} netns netns_${id}`);
  await exec2(`ip netns exec netns_${id} ip link set dev lo up`);
  // await exec2(`ip netns exec netns_${id} ip link set veth1_${id} address 02:42:ac:11:00"${mac}"`);
  await exec2(
    `ip netns exec netns_${id} ip addr add 172.15.${ip}/16 dev veth1_${id}`,
  );
  await exec2(`ip netns exec netns_${id} ip link set dev veth1_${id} up`);
  await exec2(`ip netns exec netns_${id} ip route add default via 172.15.0.1`);

  // cgroups启动程序
  await exec2(`cgcreate -g "${cgroups}:/${id}"`);
  await exec2(`cgset -r cpu.shares="512" "${id}"`);
  await exec2(`cgset -r memory.limit_in_bytes="${512 * 1000000}" "${id}"`);
  await exec2(`mkdir -p "${mountDir}/etc"`);
  await exec2(
    `echo "nameserver 114.114.114.114" > "${mountDir}/etc/resolv.conf"`,
  );
  const cgCmd = [
    `cgexec -g "${cgroups}:${id}"`,
    `ip netns exec netns_${id}`,
    `unshare -fmuip --mount-proc`,
    `/usr/bin/env -i`,
  ];
  if (Deno.env.get("TERM")) cgCmd.push(`TERM=${Deno.env.get("TERM")}`);
  if (imageConfig.Env) {
    imageConfig.Env.forEach((line: string) => cgCmd.push(line));
  }
  cgCmd.push(`chroot "${mountDir}"`);

  // 进入之后启动的命令
  let entryCmd = cmd;
  if (!entryCmd) {
    if (imageConfig.Cmd) {
      entryCmd = imageConfig.Cmd.join(" ");
    } else {
      log.fatal("缺少入口命令");
    }
  }
  if (await exists(path.join(mountDir, "bin", "sh"))) {
    cgCmd.push(
      `/bin/sh -c "/bin/mount -t proc proc /proc && hostname ${id} && ${entryCmd}"`,
    );
  } else {
    // 不存在/bin/sh文件从情况下，直接执行命令，但是不支持一些初始化配置
    cgCmd.push(entryCmd);
  }

  const finalCmd = cgCmd.join(" ");
  log.info(`RUN: ${finalCmd}`);
  // pty(finalCmd);
}
async function cmdExec() {}
async function cmdLogs() {}
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
  log.debug(url);
  const res = await fetch(url);
  if (res.status !== 200) {
    log.fatal(`无法获取镜像元数据：status ${res.status}: ${res.body}`);
  }
  const info = await res.json();
  const id = (res.headers.get("docker-content-digest") || "").replace(
    "sha256:",
    "",
  );
  if (!id) {
    log.fatal(`无法获取镜像元数据：无法获取docker-content-digest响应头`);
  }
  return { id, info, raw: res.body! };
}

async function loadLocalImages() {
  const images: Record<string, any> = {};
  const files = await Deno.readDir(imageDataPath);
  log.debug({ files });
  for await (const file of files) {
    if (!file.isDirectory) continue;
    const p = path.join(imageDataPath, file.name);
    const s = await Deno.stat(p);
    const item = { id: file.name, path: p, fullName: "", time: s.mtime };
    const imgSource = path.join(item.path, "img.source");
    if (await exists(imgSource)) {
      const fullName = await Deno.readTextFile(imgSource);
      item.fullName = fullName;
      images[item.id] = item;
    } else {
      // 如果目录内不存在img.source文件，则认为格式有异常，自动清理
      console.debug("删除：" + item.path);
      await Deno.remove(item.path, { recursive: true });
    }
  }
  return images;
}

async function findImage(name: string) {
  const { longName, tag } = parseImageName(name);
  const images = await loadLocalImages();
  return Object.keys(images)
    .map((id) => images[id])
    .find((item) =>
      item.id === name || item.fullName === getImageFullName(longName, tag)
    );
}
