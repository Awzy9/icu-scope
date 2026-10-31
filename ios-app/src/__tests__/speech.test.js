import * as Speech from "expo-speech";
import { speak, stopSpeaking } from "../speech";

jest.mock("expo-speech", () => ({ speak: jest.fn(), stop: jest.fn() }));

beforeEach(() => jest.clearAllMocks());

describe("speak", () => {
  it("uses its own audio session so Silent mode does not mute it", () => {
    speak("Hello");
    const [text, options] = Speech.speak.mock.calls[0];
    expect(text).toBe("Hello");
    expect(options.useApplicationAudioSession).toBe(false);
    expect(options.language).toBe("en-US");
  });

  it("stops anything already speaking first", () => {
    speak("Hello");
    expect(Speech.stop).toHaveBeenCalledTimes(1);
  });

  it("reports done, stopped and error through the same callbacks", () => {
    const onDone = jest.fn();
    const onError = jest.fn();
    speak("Hello", { onDone, onError });
    const options = Speech.speak.mock.calls[0][1];
    options.onDone();
    options.onStopped();
    options.onError(new Error("x"));
    expect(onDone).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe("stopSpeaking", () => {
  it("stops the synthesizer", () => {
    stopSpeaking();
    expect(Speech.stop).toHaveBeenCalledTimes(1);
  });
});
