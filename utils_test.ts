import { assertEquals } from "./deps.ts";
import { download, getHash, getHashInfo } from "./utils.ts";

const demoUrl =
  "https://y73hag4a.mirror.aliyuncs.com/v2/library/nginx/blobs/sha256:a3ed95caeb02ffe68cdd9fd84406680ae93d633cb16422d00e8a7c22955b46d4";

Deno.test("utils - download and verify", async () => {
  const tmp = await Deno.makeTempFile();
  await download(demoUrl, tmp);
  const { mode, hash } = getHashInfo(demoUrl)!;
  const fileHash = await getHash(tmp, mode);
  assertEquals(hash, fileHash);
});
