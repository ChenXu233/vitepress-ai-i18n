import { test } from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { retargetRelativeLinks } from "../src/utils.js";

const ROOT = path.resolve("/repo/docs/src");
const zh = (rel: string) => path.join(ROOT, rel);
const bot = (rel: string) => path.join(ROOT, "en", rel);

/** 从产物位置解析结果，必须落在「源链接意图」在产物树的镜像上。 */
function expectTarget(link: string, zhRel: string, botRel: string, out: string) {
  const want = path.resolve(path.dirname(zh(zhRel)), link);
  const srcRoot = ROOT;
  const mirrored =
    want === srcRoot || want.startsWith(srcRoot + path.sep)
      ? path.join(ROOT, "en", path.relative(ROOT, want))
      : want;
  const now = out.match(/\]\(([^)]+)\)/)![1];
  return { got: path.resolve(path.dirname(bot(botRel)), now), want: mirrored, now };
}

test("站点内链接逐字保留（两边树同构，复制即正确）", () => {
  const cases: [string, string, string][] = [
    ["design/rfc/index.md", "design/rfc/accepted/027.md", "./accepted/027.md"],
    ["design/rfc/accepted/009.md", "design/manifesto.md", "../../manifesto.md"],
    ["reference/index.md", "reference/language-spec/syntax.md", "language-spec/syntax.md"],
  ];
  for (const [zhRel, , link] of cases) {
    const r = retargetRelativeLinks(`x](${link})`, zh(zhRel), bot(zhRel), ROOT);
    assert.equal(r.fixed, 0, `${link} 不该被改动`);
    assert.equal(r.content, `x](${link})`);
  }
});

test("逃出 sourceDir 的链接补退一级", () => {
  const zhRel = "design/rfc/index.md";
  const r = retargetRelativeLinks(`x](../../../../CONTRIBUTING.md)`, zh(zhRel), bot(zhRel), ROOT);
  assert.equal(r.fixed, 1);
  assert.equal(r.content, "x](../../../../../CONTRIBUTING.md)");
});

test("深度随目录层级变化，不是固定补一级", () => {
  const deep = "design/rfc/accepted/011.md";
  const r = retargetRelativeLinks(`x](../../../../../tutorial/index.md)`, zh(deep), bot(deep), ROOT);
  assert.equal(r.fixed, 1);
  assert.equal(r.content, "x](../../../../../../tutorial/index.md)");
});

test("锚点原样保留", () => {
  const zhRel = "design/rfc/deprecated/023.md";
  const link = "../accepted/009-ownership-model.md#设计决策记录";
  const r = retargetRelativeLinks(`x](${link})`, zh(zhRel), bot(zhRel), ROOT);
  assert.equal(r.content, `x](${link})`);
});

test("重定向后从产物位置可解析到镜像目标", () => {
  const cases: [string, string, string][] = [
    ["design/rfc/index.md", "design/rfc/index.md", "../../../../CONTRIBUTING.md"],
    ["design/rfc/accepted/011.md", "design/rfc/accepted/011.md", "../../../../../tutorial/index.md"],
    ["design/rfc/accepted/009.md", "design/rfc/accepted/009.md", "../../manifesto.md"],
  ];
  for (const [zhRel, botRel, link] of cases) {
    const r = retargetRelativeLinks(`x](${link})`, zh(zhRel), bot(botRel), ROOT);
    const { got, want } = expectTarget(link, zhRel, botRel, r.content);
    assert.equal(got, want, `${link}: 解析到 ${got}，期望 ${want}`);
  }
});

test("链接总数不变（不得增删链接）", () => {
  const cases: [string, string][] = [
    ["design/rfc/index.md", "[a](../rfc/)\n[b](../)\n[c](./x.md)\n"],
    ["design/rfc/accepted/009.md", "[a](../../manifesto.md)\n[b](./x.md)\n"],
    ["a/b/c/d.md", "[x](../../../../CONTRIBUTING.md)\n"],
  ];
  const rel = /\]\((\\.\\.?\/[^)\\s]*?)(#[^)\\s]*)?\)/g;
  const count = (s: string) => [...s.matchAll(rel)].length;
  for (const [relPath, md] of cases) {
    const r = retargetRelativeLinks(md, zh(relPath), bot(relPath), ROOT);
    assert.equal(count(r.content), count(md), `${relPath}: 链接数变了`);
  }
});

test("站点内链接一律逐字保留（含目录尾斜杠，不做归一化）", () => {
  const md = "[a](../rfc/)\n[b](../)\n[c](d.md)\n[d](./e.md)\n";
  const r = retargetRelativeLinks(md, zh("design/rfc/accepted/README.md"), bot("design/rfc/accepted/README.md"), ROOT);
  assert.equal(r.content, md);
  assert.equal(r.fixed, 0);
});

test("非相对链接与代码块内容不受影响", () => {
  const md = [
    "[a](https://example.com/x.md)",
    "[b](/abs/path.md)",
    "[c](#anchor)",
    "`[d](../not-a-link.md)`",
  ].join("\n");
  const r = retargetRelativeLinks(md, zh("design/rfc/index.md"), bot("design/rfc/index.md"), ROOT);
  assert.equal(r.content, md);
  assert.equal(r.fixed, 0);
});
