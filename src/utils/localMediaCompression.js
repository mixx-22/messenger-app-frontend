const IMAGE_MAX_EDGE = 1920;
const IMAGE_QUALITY = 0.82;
const VIDEO_BITRATE = 1_500_000;
const AUDIO_BITRATE = 96_000;

const SKIP_IMAGE_TYPES = new Set(["image/gif", "image/svg+xml"]);

function extensionForMime(type, fallback = "bin") {
  if (type === "image/jpeg") return "jpg";
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "video/webm") return "webm";
  if (type === "video/mp4") return "mp4";
  return fallback;
}

function renamedFile(file, blob, mimeType) {
  const currentExtension = file.name.includes(".")
    ? file.name.split(".").pop()
    : extensionForMime(file.type);
  const nextExtension = extensionForMime(mimeType, currentExtension);
  const baseName = file.name.replace(/\.[^/.]+$/, "");

  return new File([blob], `${baseName}-compressed.${nextExtension}`, {
    type: mimeType,
    lastModified: Date.now(),
  });
}

function smallerOrOriginal(file, blob, mimeType) {
  if (!blob || blob.size <= 0 || blob.size >= file.size) return file;
  return renamedFile(file, blob, mimeType);
}

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image could not be loaded"));
    };
    image.src = url;
  });
}

async function decodeImage(file) {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      return loadImageElement(file);
    }
  }

  return loadImageElement(file);
}

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, mimeType, quality);
  });
}

async function compressImage(file) {
  if (SKIP_IMAGE_TYPES.has(file.type)) return file;

  const image = await decodeImage(file);
  const width = image.width || image.naturalWidth;
  const height = image.height || image.naturalHeight;
  if (!width || !height) return file;

  const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext("2d", { alpha: true });
  if (!context) return file;

  context.drawImage(image, 0, 0, targetWidth, targetHeight);
  if ("close" in image && typeof image.close === "function") image.close();

  const mimeType = file.type === "image/png" ? "image/webp" : "image/jpeg";
  const blob = await canvasToBlob(canvas, mimeType, IMAGE_QUALITY);
  return smallerOrOriginal(file, blob, mimeType);
}

function videoMimeType() {
  const options = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];

  return options.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function loadVideo(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.onloadedmetadata = () => resolve({ video, url });
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Video could not be loaded"));
    };
    video.src = url;
  });
}

async function compressVideo(file) {
  if (!("MediaRecorder" in window)) return file;

  const mimeType = videoMimeType();
  if (!mimeType) return file;

  const { video, url } = await loadVideo(file);
  const capture = video.captureStream || video.mozCaptureStream;
  if (!capture) {
    URL.revokeObjectURL(url);
    return file;
  }

  const stream = capture.call(video);

  try {
    const chunks = [];
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: VIDEO_BITRATE,
      audioBitsPerSecond: AUDIO_BITRATE,
    });

    const blob = await new Promise((resolve, reject) => {
      const timeoutMs = Number.isFinite(video.duration)
        ? Math.max(10_000, video.duration * 1000 + 8000)
        : 60_000;
      const timeout = window.setTimeout(() => {
        if (recorder.state !== "inactive") recorder.stop();
        reject(new Error("Video compression timed out"));
      }, timeoutMs);

      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunks.push(event.data);
      };
      recorder.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error("Video compression failed"));
      };
      recorder.onstop = () => {
        window.clearTimeout(timeout);
        resolve(new Blob(chunks, { type: mimeType.split(";")[0] }));
      };

      video.onended = () => {
        if (recorder.state !== "inactive") recorder.stop();
      };

      recorder.start(1000);
      video.currentTime = 0;
      video.play().catch((error) => {
        window.clearTimeout(timeout);
        if (recorder.state !== "inactive") recorder.stop();
        reject(error);
      });
    });

    return smallerOrOriginal(file, blob, blob.type || "video/webm");
  } finally {
    stream.getTracks().forEach((track) => track.stop());
    URL.revokeObjectURL(url);
    video.remove();
  }
}

export async function compressAttachmentFile(file) {
  try {
    if (file?.type?.startsWith("image/")) return await compressImage(file);
    if (file?.type?.startsWith("video/")) return await compressVideo(file);
  } catch (error) {
    if (import.meta.env?.DEV) {
      console.warn("[localMediaCompression] Falling back to original file", error);
    }
  }

  return file;
}
