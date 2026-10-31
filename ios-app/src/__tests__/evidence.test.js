import { IMPACT_LABELS, impactScore } from "../evidence";

describe("impactScore", () => {
  it("returns null for blog posts and trial registrations", () => {
    expect(impactScore({ study_type: "FOAMed/Blog" })).toBeNull();
    expect(impactScore({ study_type: "Clinical Trial (Recruiting)" })).toBeNull();
    expect(impactScore({})).toBeNull();
  });

  it("rates preprints as hypothesis generating", () => {
    expect(impactScore({ study_type: "Preprint" })).toBe(1);
  });

  it("rates guidelines as practice changing", () => {
    expect(impactScore({ study_type: "Practice Guideline" })).toBe(5);
  });

  it("scores RCTs by journal tier or citations", () => {
    expect(impactScore({ study_type: "Randomized Controlled Trial", is_top_journal: true })).toBe(5);
    expect(impactScore({ study_type: "Randomized Controlled Trial", citation_count: 10 })).toBe(5);
    expect(impactScore({ study_type: "Randomized Controlled Trial", citation_count: 9 })).toBe(4);
  });

  it("scores meta-analyses like RCTs", () => {
    expect(impactScore({ study_type: "Meta-Analysis", is_top_journal: true })).toBe(5);
    expect(impactScore({ study_type: "Systematic Review" })).toBe(4);
  });

  it("scores other trials, observational studies and reviews lower", () => {
    expect(impactScore({ study_type: "Clinical Trial", is_top_journal: true })).toBe(4);
    expect(impactScore({ study_type: "Clinical Trial" })).toBe(3);
    expect(impactScore({ study_type: "Observational Study" })).toBe(3);
    expect(impactScore({ study_type: "Multicenter Study" })).toBe(3);
    expect(impactScore({ study_type: "Review" })).toBe(2);
    expect(impactScore({ study_type: "Case Reports" })).toBe(2);
  });

  it("has a label for every score it can return", () => {
    [1, 2, 3, 4, 5].forEach((n) => expect(IMPACT_LABELS[n]).toBeTruthy());
  });
});
