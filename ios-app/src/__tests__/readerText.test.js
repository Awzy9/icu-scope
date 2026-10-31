import AsyncStorage from "@react-native-async-storage/async-storage";
import { clearFullTextCache, loadFullText, parseJats, pmcidOf } from "../readerText";

const paras = (n) => Array.from({ length: n }, (_, i) => `<p>Paragraph ${i + 1} with <italic>emphasis</italic> and a citation <xref ref-type="bibr" rid="B1">[1, 2]</xref>.</p>`).join("");

const xml = (license = true, body = paras(4)) => `<?xml version="1.0"?>
<!DOCTYPE article
  PUBLIC "-//NLM//DTD JATS (Z39.96) Journal Archiving and Interchange DTD with MathML3 v1.4 20241031//EN" "JATS-archivearticle1-4-mathml3.dtd">
<article xmlns:xlink="http://www.w3.org/1999/xlink"><front><article-meta>
${license ? '<permissions><license><license-p>Licensed under <ext-link ext-link-type="uri" xlink:href="https://creativecommons.org/licenses/by/4.0/">CC BY</ext-link>.</license-p></license></permissions>' : ""}
</article-meta></front><body>
<sec><title>Introduction</title>${body}
  <sec><title>Methods</title><p>We did a thing.</p>
    <list list-type="bullet"><list-item><p>First item</p></list-item><list-item><p>Second item</p></list-item></list>
    <table-wrap id="T1"><caption><p>Table caption</p></caption></table-wrap>
    <fig id="F1"><caption><p>Figure caption</p></caption></fig>
  </sec></sec>
</body></article>`;

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.restoreAllMocks();
});

describe("pmcidOf", () => {
  it("extracts the PMC id from a PMC url", () => {
    expect(pmcidOf({ pmc_url: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC13433540/" })).toBe("PMC13433540");
    expect(pmcidOf({})).toBeNull();
    expect(pmcidOf(null)).toBeNull();
  });
});

describe("parseJats", () => {
  it("returns headings, paragraphs and list items in order", () => {
    const r = parseJats(xml());
    const types = r.blocks.map((b) => b.type);
    expect(types.slice(0, 2)).toEqual(["h1", "p"]);
    expect(r.blocks.some((b) => b.type === "h2" && b.text === "Methods")).toBe(true);
    expect(r.blocks.filter((b) => b.type === "li").map((b) => b.text)).toEqual(["First item", "Second item"]);
  });

  it("drops reference markers and keeps inline formatting text", () => {
    const first = parseJats(xml()).blocks.find((b) => b.type === "p");
    expect(first.text).toBe("Paragraph 1 with emphasis and a citation.");
  });

  it("keeps text inside key-point boxes", () => {
    const boxed = xml(true, `<boxed-text><p>Key point: act early.</p></boxed-text>${paras(3)}`);
    expect(parseJats(boxed).blocks.some((b) => b.text === "Key point: act early.")).toBe(true);
  });

  it("counts omitted tables and figures instead of rendering them", () => {
    const r = parseJats(xml());
    expect(r.omitted).toEqual({ tables: 1, figures: 1 });
    expect(r.blocks.some((b) => /caption/i.test(b.text))).toBe(false);
  });

  it("reads the Creative Commons licence", () => {
    expect(parseJats(xml()).license).toBe("https://creativecommons.org/licenses/by/4.0/");
  });

  it("is unusable without a licence or without real body text", () => {
    expect(parseJats(xml(false)).usable).toBe(false);
    expect(parseJats(xml(true, "<p>Only one</p>")).usable).toBe(false);
    expect(parseJats(xml()).usable).toBe(true);
  });
});

describe("loadFullText", () => {
  const article = { pmc_url: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC1/" };

  it("fetches, parses and caches for offline reading", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => xml() });
    const first = await loadFullText(article);
    expect(first.usable).toBe(true);
    expect(global.fetch.mock.calls[0][0]).toContain("/PMC1/fullTextXML");
    global.fetch = jest.fn().mockRejectedValue(new Error("offline"));
    const second = await loadFullText(article);
    expect(second.id).toBe("PMC1");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("explains an unavailable article", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 });
    await expect(loadFullText(article)).rejects.toThrow("isn't available");
  });

  it("rejects papers that have no usable licence", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => xml(false) });
    await expect(loadFullText(article)).rejects.toThrow("Use Source");
  });

  it("rejects articles without a PMC id", async () => {
    await expect(loadFullText({})).rejects.toThrow("no open-access");
  });

  it("clears only the full-text cache", async () => {
    await AsyncStorage.multiSet([
      ["ft:PMC1", "{}"],
      ["settings:v1", "{}"],
    ]);
    await clearFullTextCache();
    expect(await AsyncStorage.getAllKeys()).toEqual(["settings:v1"]);
  });
});
