import { allTopics } from "../../src/content/index";
import { writeFileSync } from "fs";
import { mkdirSync } from "fs";
const OUT = process.argv[2] ?? "voiceover-out/txt";
mkdirSync(OUT, { recursive: true });
const clean = (s: string) => s
  .replace(/\bIAP\b/g, "I A P").replace(/\bIAH\b/g, "I A H").replace(/\bACS\b/g, "A C S")
  .replace(/\bAPP\b/g, "A P P").replace(/\bICU\b/g, "I C U").replace(/\bWSACS\b/g, "W S A C S")
  .replace(/\bARDS\b/g, "A R D S").replace(/\bECMO\b/g, "E C M O").replace(/\bPEEP\b/g, "peep")
  .replace(/\bCVP\b/g, "C V P").replace(/\bMAP\b/g, "M A P").replace(/\bRSI\b/g, "R S I")
  .replace(/mmHg/g, " millimeters of mercury").replace(/≥/g, " at least ").replace(/≤/g, " at most ")
  .replace(/>/g, " greater than ").replace(/</g, " less than ").replace(/[–—]/g, " to ")
  .replace(/\s*\(([^)]{0,60})\)/g, ", $1,")
  .replace(/[*_`#]/g, "").replace(/\s+/g, " ").trim();
for (const t of allTopics as any[]) {
  const out: string[] = [];
  const block = (b: any) => {
    if (b.type === "paragraph") out.push(clean(b.text));
    else if (b.type === "list") b.items.forEach((i: string, n: number) => out.push((b.ordered ? `Step ${n+1}. ` : "") + clean(i)));
    else if (b.type === "key-value-table") b.rows.forEach((r: any) => out.push(`${clean(r.label)}: ${clean(r.value)}.`));
    else if (b.type === "callout") out.push(clean(b.text));
  };
  const sec = (s: any) => { out.push(`${clean(s.title)}.`); s.body.forEach(block); (s.children || []).forEach(sec); };
  out.push(`${clean(t.title)}. ${clean(t.oneLiner)}`);
  t.sections.forEach(sec);
  writeFileSync(`${OUT}/${t.slug}.txt`, out.map(l => /[.!?:]$/.test(l.trim()) ? l : l + ".").join("\n"));
}
