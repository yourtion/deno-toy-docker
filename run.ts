import { subcommand, subcommandstart } from "./cli.ts";

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

async function cmdPull() {}
async function cmdImages() {}
async function cmdRm() {}
async function cmdRmi() {}
async function cmdPs() {}
async function cmdRun() {}
async function cmdExec() {}
async function cmdLogs() {}
async function cmdHelp() {
  const N = 14;
  console.log();
  console.log("用法: tocker COMMAND");
  console.log();
  console.log("命令:".padEnd(N));
  console.log("  pull".padEnd(N) + "从国内镜像源拉取Docker镜像");
  console.log("  images".padEnd(N) + "列出已下载到本地的镜像");
  console.log("  rmi".padEnd(N) + "删除指定的本地镜像");
  console.log("  rm".padEnd(N) + "删除指定容器");
  console.log("  ps".padEnd(N) + "列出所有容器");
  console.log("  run".padEnd(N) + "启动新容器");
  console.log("  exec".padEnd(N) + "在一个运行中的容器内执行指定命令");
  console.log("  logs".padEnd(N) + "查看指定容器的日志输出");
  console.log("  help".padEnd(N) + "打印本帮助信息");
  console.log();
  await Promise.resolve();
}
