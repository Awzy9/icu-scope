import { Text } from "react-native";
import { act, create } from "react-test-renderer";
import * as LocalAuthentication from "expo-local-authentication";
import { LockGate, authenticate, lockMessage } from "../AppLock";

jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("expo-local-authentication", () => ({ authenticateAsync: jest.fn() }));
jest.mock("../store", () => ({ useStore: () => ({ settings: { appearance: "light" } }) }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const texts = (tree) => tree.root.findAllByType(Text).map((n) => [n.props.children].flat().join(""));
const render = async (enabled) => {
  let tree;
  await act(async () => {
    tree = create(
      <LockGate enabled={enabled}>
        <Text>app content</Text>
      </LockGate>,
    );
  });
  return tree;
};

beforeEach(() => jest.clearAllMocks());

describe("authenticate", () => {
  it("reports success and failure reasons", async () => {
    LocalAuthentication.authenticateAsync.mockResolvedValueOnce({ success: true });
    await expect(authenticate()).resolves.toEqual({ ok: true, reason: null });
    LocalAuthentication.authenticateAsync.mockResolvedValueOnce({ success: false, error: "user_cancel" });
    await expect(authenticate()).resolves.toEqual({ ok: false, reason: "user_cancel" });
  });
  it("treats a thrown error as unavailable", async () => {
    LocalAuthentication.authenticateAsync.mockRejectedValueOnce(new Error("boom"));
    await expect(authenticate()).resolves.toEqual({ ok: false, reason: "unavailable" });
  });
  it("explains a missing passcode", () => {
    expect(lockMessage("not_enrolled")).toMatch(/passcode/);
    expect(lockMessage("user_cancel")).toMatch(/still off/);
  });
});

describe("LockGate", () => {
  it("never prompts or covers the app when the lock is off", async () => {
    const tree = await render(false);
    expect(LocalAuthentication.authenticateAsync).not.toHaveBeenCalled();
    expect(texts(tree)).toEqual(["app content"]);
  });

  it("covers the app while locked and keeps it mounted underneath", async () => {
    LocalAuthentication.authenticateAsync.mockResolvedValue({ success: false, error: "user_cancel" });
    const tree = await render(true);
    expect(LocalAuthentication.authenticateAsync).toHaveBeenCalledTimes(1);
    expect(texts(tree)).toContain("app content");
    expect(texts(tree)).toContain("ICU Scope is locked");
  });

  it("removes the cover after a successful unlock", async () => {
    LocalAuthentication.authenticateAsync.mockResolvedValue({ success: true });
    const tree = await render(true);
    expect(texts(tree)).not.toContain("ICU Scope is locked");
    expect(texts(tree)).toContain("app content");
  });
});
