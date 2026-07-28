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
export function createCacheWriter(cachePath: string) {
  let chain: Promise<void> = Promise.resolve();

  return {
    /**
     * 追加一个缓存写入操作。
     * 返回 Promise 但不阻塞调用方，调用方可以 await 确保写入完成（用于退出前）。
     */
    async update(cacheKey: string, hash: string): Promise<void> {
      chain = chain.then(async () => {
        const cache = await loadCache(cachePath);
        cache[cacheKey] = hash;
        await saveCache(cachePath, cache);
      });
      return chain;
    },

    /**
     * 等待所有排队写入完成。程序退出前调用。
     */
    async wait(): Promise<void> {
      await chain;
    },
  };
}
