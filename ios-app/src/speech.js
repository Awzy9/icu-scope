import * as Speech from "expo-speech";

// Reads text aloud with the device's voices.
// `useApplicationAudioSession: false` gives speech its own audio session on iOS. With the app's
// default session, iPhone Silent mode mutes it and the button looks like it did nothing.
export function speak(text, { onDone, onError } = {}) {
  Speech.stop();
  Speech.speak(text, {
    language: "en-US",
    useApplicationAudioSession: false,
    onDone,
    onStopped: onDone,
    onError,
  });
}

export const stopSpeaking = () => Speech.stop();

export const SPEECH_HINT = "Can't hear it? Turn up the volume and check the iPhone isn't on Silent mode.";
