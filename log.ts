export function debug(...data: any[]) {
  console.log(...data);
}

export function fatal(...data: any[]): never {
  console.log(...data);
  throw new Error();
}

export function info(...data: any[]) {
  console.log(...data);
}
