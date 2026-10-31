import AsyncStorage from "@react-native-async-storage/async-storage";
import { XMLParser } from "fast-xml-parser";

// Open-access full text from Europe PMC (JATS XML). Only papers with a Creative Commons licence are shown.
const EPMC = "https://www.ebi.ac.uk/europepmc/webservices/rest";
const CACHE_PREFIX = "ft:";
const SKIPPED = new Set(["table-wrap", "fig", "disp-formula", "supplementary-material", "graphic", "media", "xref"]);
const MIN_BODY_BLOCKS = 3;

export const pmcidOf = (article) => (String(article?.pmc_url || "").match(/PMC\d+/) || [])[0] || null;

const parser = new XMLParser({ preserveOrder: true, ignoreAttributes: false, attributeNamePrefix: "@_", trimValues: false });

const tagOf = (node) => Object.keys(node).find((k) => k !== ":@" && k !== "#text");
const kids = (node) => (tagOf(node) ? node[tagOf(node)] : []);

// Plain text of a node, leaving out tables, figures, formulas and citation markers.
function textOf(nodes) {
  return nodes
    .map((n) => {
      if (n["#text"] !== undefined) return String(n["#text"]);
      const tag = tagOf(n);
      return tag && !SKIPPED.has(tag) ? textOf(kids(n)) : "";
    })
    .join("")
    .replace(/\s*[[(][\s,;–—-]*[\])]/g, "") // citation markers left empty once the reference numbers are removed
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:])/g, "$1")
    .trim();
}

function findAll(nodes, tag, out = []) {
  nodes.forEach((n) => {
    if (tagOf(n) === tag) out.push(n);
    if (tagOf(n)) findAll(kids(n), tag, out);
  });
  return out;
}

function licenceOf(tree) {
  const href = findAll(tree, "ext-link")
    .map((n) => n[":@"]?.["@_xlink:href"])
    .filter(Boolean)
    .find((h) => /creativecommons\.org\/licenses\//.test(h));
  return href || null;
}

// Turns JATS XML into readable blocks: { type: "h1" | "h2" | "p" | "li", text }.
export function parseJats(xml) {
  const cleaned = String(xml).replace(/<!DOCTYPE[\s\S]*?>\s*(?=<article)/i, "");
  const tree = parser.parse(cleaned);
  const license = licenceOf(tree);
  const body = findAll(tree, "body")[0];
  const blocks = [];
  const omitted = { tables: 0, figures: 0 };

  const walk = (nodes, depth) =>
    nodes.forEach((n) => {
      const tag = tagOf(n);
      if (tag === "sec") {
        const children = kids(n);
        const title = children.find((c) => tagOf(c) === "title");
        if (title && textOf(kids(title))) blocks.push({ type: depth === 0 ? "h1" : "h2", text: textOf(kids(title)) });
        walk(children.filter((c) => tagOf(c) !== "title"), depth + 1);
      } else if (tag === "p") {
        const text = textOf(kids(n));
        if (text) blocks.push({ type: "p", text });
        omitted.tables += findAll(kids(n), "table-wrap").length;
        omitted.figures += findAll(kids(n), "fig").length;
      } else if (tag === "list") {
        findAll(kids(n), "list-item").forEach((li) => {
          const text = textOf(kids(li));
          if (text) blocks.push({ type: "li", text });
        });
      } else if (tag === "boxed-text") {
        walk(kids(n).filter((c) => tagOf(c) !== "caption"), depth); // key-point boxes, e.g. "Take-home message"
      } else if (tag === "table-wrap") omitted.tables += 1;
      else if (tag === "fig") omitted.figures += 1;
    });

  if (body) walk(kids(body), 0);
  return { license, blocks, omitted, usable: Boolean(license) && blocks.filter((b) => b.type === "p").length >= MIN_BODY_BLOCKS };
}

// Reads from the device cache first, so papers you have opened work offline.
export async function loadFullText(article) {
  const id = pmcidOf(article);
  if (!id) throw new Error("This article has no open-access full text.");
  try {
    const cached = await AsyncStorage.getItem(CACHE_PREFIX + id);
    if (cached) return JSON.parse(cached);
  } catch {
    // fall through to the network
  }
  const res = await fetch(`${EPMC}/${id}/fullTextXML`);
  if (!res.ok) throw new Error(res.status === 404 ? "Full text isn't available for this article." : `Couldn't load full text (HTTP ${res.status}).`);
  const parsed = parseJats(await res.text());
  if (!parsed.usable) throw new Error("This article's full text isn't available to read in the app. Use Source to open it.");
  const result = { id, ...parsed };
  AsyncStorage.setItem(CACHE_PREFIX + id, JSON.stringify(result)).catch(() => {});
  return result;
}

export async function clearFullTextCache() {
  const keys = await AsyncStorage.getAllKeys().catch(() => []);
  await AsyncStorage.multiRemove(keys.filter((k) => k.startsWith(CACHE_PREFIX))).catch(() => {});
}
