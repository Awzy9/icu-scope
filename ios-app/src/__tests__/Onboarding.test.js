import { hiddenFromSelection } from "../Onboarding";

jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

const categories = [{ id: "renal" }, { id: "neuro" }, { id: "cardio" }];

describe("hiddenFromSelection", () => {
  it("hides nothing when every organ system is selected", () => {
    expect(hiddenFromSelection(categories, new Set(["renal", "neuro", "cardio"]))).toEqual([]);
  });

  it("hides the organ systems that were not picked", () => {
    expect(hiddenFromSelection(categories, new Set(["neuro"]))).toEqual(["renal", "cardio"]);
  });

  it("handles a feed that has not loaded", () => {
    expect(hiddenFromSelection([], new Set())).toEqual([]);
  });
});
