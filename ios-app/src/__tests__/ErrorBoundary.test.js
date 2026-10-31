import { Text } from "react-native";
import { act, create } from "react-test-renderer";
import ErrorBoundary from "../ErrorBoundary";

jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let shouldThrow = true;
function Bomb() {
  if (shouldThrow) throw new Error("boom");
  return <Text>recovered</Text>;
}

const texts = (tree) =>
  tree.root.findAllByType(Text).map((n) => [n.props.children].flat().join(""));

describe("ErrorBoundary", () => {
  beforeEach(() => {
    shouldThrow = true;
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  it("renders its children when nothing fails", async () => {
    shouldThrow = false;
    let tree;
    await act(async () => {
      tree = create(
        <ErrorBoundary>
          <Bomb />
        </ErrorBoundary>,
      );
    });
    expect(texts(tree)).toContain("recovered");
  });

  it("shows the fallback when a child throws, and recovers on Try again", async () => {
    let tree;
    await act(async () => {
      tree = create(
        <ErrorBoundary>
          <Bomb />
        </ErrorBoundary>,
      );
    });
    expect(texts(tree)).toContain("Something went wrong");

    shouldThrow = false;
    const retry = tree.root.findByProps({ accessibilityRole: "button" });
    await act(async () => retry.props.onPress());
    expect(texts(tree)).toContain("recovered");
  });
});
