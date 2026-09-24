import crypto from "crypto-js";
import fs from "fs-extra";
import path from "path";

export const getFileHash = (content: string) => crypto.MD5(content).toString();
export const loadCache = async (p: string) =>
  (await fs.pathExists(p)) ? fs.readJson(p) : {};
export const saveCache = async (p: string, data: any) => fs.writeJson(p, data, { spaces: 2 });

/** 行内相对链接：只取 `](...)` 形式，跳过绝对路径/协议/纯锚点。 */
const RELATIVE_LINK_RE = /\]\((\.\.?\/[^)\s]*?)(#[^)\s]*)?\)/g;

/** 路径是否在 root 之内（含 root 本身）。 */
const isInside = (p: string, root: string) => p === root || p.startsWith(root + path.sep);

/**
 * 将翻译产物中的相对链接从「源空间」重定向到「产物空间」。
 *
 * 产物比源文件多一层语言目录（`src/x.md` → `src/en/x.md`）。AI 会**逐字复制**
 * 源文件的链接，而这些链接是相对于**源文件位置**写的，于是产生两类结果：
 *
 * | 链接指向 | 逐字复制 | 原因 |
 * | --- | --- | --- |
 * | sourceDir 内部 | ✅ 正确 | 源与产物在各自树中相对位置相同 |
 * | sourceDir 之外 | ❌ 指错 | 产物多一层，向上退出的级数不够 |
 *
 * 所以正确做法不是盲目补 `../`（那会把本来就对的链接弄错），而是**重定向**：
 *
 * 1. 把链接按**源文件位置**解析，得到意图目标 `intended`
 * 2. `intended` 在 sourceDir 内 → **逐字保留**（源与产物同构，原链接已正确）
 *    `intended` 在 sourceDir 外（如仓库根的 `CONTRIBUTING.md`）→ 从**产物文件位置**重算
 *
 * 源里本来就写坏的链接会保持「一样坏」——修源是源头的事，不在这里猜。
 *
 * @param content    翻译产物全文
 * @param sourceFile 源文件绝对路径（如 `<root>/docs/src/design/rfc/index.md`）
 * @param targetFile 产物文件绝对路径（如 `<root>/docs/src/en/design/rfc/index.md`）
 * @param sourceDir  sourceDir 绝对路径（如 `<root>/docs/src`）
 * @returns 重定向后的全文，以及被改变的链接数
 */
export function retargetRelativeLinks(
  content: string,
  sourceFile: string,
  targetFile: string,
  sourceDir: string
): { content: string; fixed: number } {
  const srcFile = path.resolve(sourceFile);
  const outFile = path.resolve(targetFile);
  const srcRoot = path.resolve(sourceDir);
  const outRoot = path.dirname(outFile);

  let fixed = 0;
  const out = content.replace(RELATIVE_LINK_RE, (match, rel: string, anchor = "") => {
    const intended = path.resolve(path.dirname(srcFile), rel);
    // 站点内部：源与产物在各自树中相对位置相同，逐字复制已正确，不动。
    // （这一步同时保住了 `../` 这类目录链接的尾斜杠——path.relative 会把它吃掉）
    if (isInside(intended, srcRoot)) return match;

    // 逃出 sourceDir：产物比源多一层，需从产物位置重算。
    const finalTarget = intended;
    let next = path.relative(outRoot, finalTarget).split(path.sep).join("/");
    if (!next.startsWith(".")) next = "./" + next;
    // 链接以 `/` 结尾表示目录，重算会丢掉尾斜杠，手动补回。
    if (rel.endsWith("/") && !next.endsWith("/")) next += "/";
    if (next + anchor === rel + anchor) return match;

    fixed++;
    return `](${next}${anchor})`;
  });

  return { content: out, fixed };
}

/**
 * 创建一个串行化缓存写入器，保证并发环境下缓存写入的原子性。
 * 内部维护一个 Promise 链，每次 update 将读→改→写操作追加到链尾。
 */
/**
 * 创建一个串行化缓存写入器，保证并发环境下缓存写入的原子性。
 * 接收已加载的缓存对象，update 只修改内存，write 串行化写入磁盘。
 */
export function createCacheWriter(cachePath: string, cache: Record<string, string>) {
  let chain: Promise<void> = Promise.resolve();

  return {
    /**
     * 追加一个缓存写入操作。修改内存中的缓存，串行写入磁盘。
     */
    update(cacheKey: string, hash: string): Promise<void> {
      cache[cacheKey] = hash;
      chain = chain.then(() =>
        saveCache(cachePath, cache).catch((err) => {
          console.error(`[cache] write failed: ${cacheKey}`, err);
        })
      );
      return chain;
    },

    /**
     * 等待所有排队写入完成。程序退出前调用。
     */
    wait(): Promise<void> {
      return chain;
    },
  };
}
