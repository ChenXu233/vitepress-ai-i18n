import crypto from "crypto-js";
import fs from "fs-extra";

export const getFileHash = (content: string) => crypto.MD5(content).toString();
export const loadCache = async (p: string) =>
  (await fs.pathExists(p)) ? fs.readJson(p) : {};
export const saveCache = async (p: string, data: any) => fs.writeJson(p, data, { spaces: 2 });

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
