import crypto from "crypto-js";
import fs from "fs-extra";

export const getFileHash = (content: string) => crypto.MD5(content).toString();
export const loadCache = async (p: string) =>
  (await fs.pathExists(p)) ? fs.readJson(p) : {};
export const saveCache = async (p: string, data: any) => fs.writeJson(p, data, { spaces: 2 });
