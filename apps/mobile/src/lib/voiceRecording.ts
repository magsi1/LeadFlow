/**
 * Cross-platform voice capture: expo-av on native, MediaRecorder on web.
 */
import { Platform } from "react-native";
import * as FileSystem from "expo-file-system";

type WebRecorderState = {
  mediaRecorder: MediaRecorder;
  chunks: Blob[];
  stream: MediaStream;
};

let nativeRecording: import("expo-av").Audio.Recording | null = null;
let webState: WebRecorderState | null = null;

export type StoppedRecording =
  | { platform: "web"; blob: Blob; mimeType: string }
  | { platform: "native"; base64: string; mimeType: string };

export async function requestVoiceRecordingPermission(): Promise<boolean> {
  if (Platform.OS === "web") {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      console.warn("[voiceRecording] getUserMedia not available");
      return false;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
      return true;
    } catch (e) {
      console.warn("[voiceRecording] mic permission denied", e);
      return false;
    }
  }
  const { Audio } = await import("expo-av");
  const { status } = await Audio.requestPermissionsAsync();
  return status === "granted";
}

export async function startVoiceRecording(): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof MediaRecorder === "undefined") {
      throw new Error("Recording is not supported in this browser.");
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
    let mime = "";
    for (const m of mimeTypes) {
      if (MediaRecorder.isTypeSupported(m)) {
        mime = m;
        break;
      }
    }
    const mediaRecorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    const chunks: Blob[] = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunks.push(e.data);
        console.log("[voiceRecording] web chunk", e.data.size, e.data.type);
      }
    };
    /** Timeslice so browsers emit data during recording (not only at stop). */
    mediaRecorder.start(250);
    console.log("[voiceRecording] web started", mime || "default", "state=", mediaRecorder.state);
    webState = { mediaRecorder, chunks, stream };
    return;
  }

  const { Audio } = await import("expo-av");
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    shouldDuckAndroid: true,
  });

  const recording = new Audio.Recording();
  await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
  await recording.startAsync();
  nativeRecording = recording;
  console.log("[voiceRecording] native recording started");
}

/** Stop and discard recording without reading bytes (e.g. user cancelled). */
export async function discardVoiceRecording(): Promise<void> {
  if (Platform.OS === "web") {
    if (!webState) return;
    const { mediaRecorder, stream } = webState;
    webState = null;
    try {
      if (mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      }
    } catch (e) {
      console.warn("[voiceRecording] discard web stop", e);
    }
    stream.getTracks().forEach((t) => t.stop());
    return;
  }
  if (!nativeRecording) return;
  const rec = nativeRecording;
  nativeRecording = null;
  try {
    await rec.stopAndUnloadAsync();
  } catch (e) {
    console.warn("[voiceRecording] discard native", e);
  }
}

export async function stopVoiceRecording(): Promise<StoppedRecording> {
  if (Platform.OS === "web") {
    if (!webState) {
      throw new Error("Not recording.");
    }
    const { mediaRecorder, chunks, stream } = webState;
    webState = null;

    await new Promise<void>((resolve, reject) => {
      const done = () => {
        stream.getTracks().forEach((t) => t.stop());
        resolve();
      };
      mediaRecorder.onerror = (ev) => {
        console.error("[voiceRecording] MediaRecorder error", ev);
        reject(new Error("MediaRecorder error"));
      };
      mediaRecorder.onstop = () => {
        console.log("[voiceRecording] web onstop, chunks=", chunks.length);
        done();
      };
      try {
        if (mediaRecorder.state === "recording") {
          /** Flush any buffered audio before stop (important for short clips). */
          mediaRecorder.requestData();
        }
        if (mediaRecorder.state !== "inactive") {
          mediaRecorder.stop();
        } else {
          done();
        }
      } catch (e) {
        console.error("[voiceRecording] stop() failed", e);
        stream.getTracks().forEach((t) => t.stop());
        reject(e instanceof Error ? e : new Error("stop failed"));
      }
    });

    const mime = mediaRecorder.mimeType || "audio/webm";
    const blob = new Blob(chunks, { type: mime });
    console.log("[voiceRecording] web blob", blob.size, blob.type, "parts=", chunks.length);

    if (blob.size === 0) {
      throw new Error("No audio was captured. Try a longer recording or another browser.");
    }

    return { platform: "web", blob, mimeType: blob.type || mime };
  }

  if (!nativeRecording) {
    throw new Error("Not recording.");
  }
  const rec = nativeRecording;
  nativeRecording = null;
  await rec.stopAndUnloadAsync();
  const uri = rec.getURI();
  if (!uri) {
    throw new Error("No recording file.");
  }
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  console.log("[voiceRecording] native base64 length", base64?.length ?? 0);
  return { platform: "native", base64, mimeType: "audio/m4a" };
}
