import { create, act } from "react-test-renderer";
import { EvidenceBanner, EvidenceChips, ArticleCard } from "../components";

jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("expo-haptics", () => ({ selectionAsync: () => Promise.resolve() }));
jest.mock("../store", () => ({ useStore: () => ({ settings: { appearance: "light", textScale: 1 }, seen: new Set(), savedKeys: new Set() }) }));

const text = (node) => JSON.stringify(node.toJSON());
const ev = (o) => ({ state: "published", class_label: "Original research", source_verified: true, last_verified: "2026-10-31", ai_status: "auto_validated", retraction_status: "none", notices: [], ...o });
const render = (el) => { let r; act(() => { r = create(el); }); return r; };

describe("evidence UI", () => {
  it("shows a retraction banner with the warning text", () => {
    const r = render(<EvidenceBanner article={{ evidence: ev({ state: "retracted", retraction_status: "retracted" }) }} />);
    expect(text(r)).toContain("Retracted publication");
    expect(text(r)).toContain("must not be used to support clinical decisions");
  });

  it("renders nothing for a clean article", () => {
    expect(render(<EvidenceBanner article={{ evidence: ev({}) }} />).toJSON()).toBeNull();
  });

  it("shows Source verified with date, and 'Verification pending' without an evidence block", () => {
    expect(text(render(<EvidenceChips article={{ study_type: "Review", evidence: ev({}) }} />))).toContain("Source verified · 2026-10-31");
    const pending = text(render(<EvidenceChips article={{ study_type: "Review" }} />));
    expect(pending).toContain("Verification pending");
    expect(pending).not.toContain("Source verified");
  });

  it("list card marks a retracted article so it cannot be missed while browsing", () => {
    const a = { pmid: "1", title: "Some trial", study_type: "Randomized Controlled Trial", evidence: ev({ state: "retracted", retraction_status: "retracted" }) };
    expect(text(render(<ArticleCard article={a} onPress={() => {}} />))).toContain("Retracted");
  });
});
