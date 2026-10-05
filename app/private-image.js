const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const maximumBytes = 8 * 1024 * 1024;
const maximumDimension = 4096;

export function privateImageValidationMessage(file) {
  if (!file) return "";
  if (!allowedTypes.has(String(file.type || "").toLowerCase())) {
    return "Use a JPG, PNG, WebP, or GIF photo.";
  }
  if (file.size > maximumBytes) return "Use a photo no larger than 8 MB.";
  return "";
}

function canvasBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("The private photo could not be prepared.")),
      "image/jpeg",
      quality
    );
  });
}

async function decodeImage(file) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close()
      };
    } catch {
      // Older Safari versions may expose createImageBitmap without accepting
      // the orientation option. The image-element path below remains private.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      cleanup: () => URL.revokeObjectURL(url)
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function privateFilename(name) {
  const stem = String(name || "meal-photo")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9_-]/gi, "-")
    .replace(/-+/g, "-")
    .slice(0, 80) || "meal-photo";
  return `${stem}-private.jpg`;
}

// Re-encoding through a canvas removes EXIF/GPS and other source-file metadata
// before a photo reaches private cloud storage or an AI provider.
export async function preparePrivateImage(file) {
  const validationMessage = privateImageValidationMessage(file);
  if (validationMessage) throw new Error(validationMessage);

  const decoded = await decodeImage(file);
  try {
    if (!decoded.width || !decoded.height) throw new Error("The selected photo could not be read.");
    const scale = Math.min(1, maximumDimension / Math.max(decoded.width, decoded.height));
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("The private photo could not be prepared.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(decoded.source, 0, 0, width, height);

    let blob = await canvasBlob(canvas, 0.92);
    if (blob.size > maximumBytes) blob = await canvasBlob(canvas, 0.8);
    if (blob.size > maximumBytes) throw new Error("The prepared photo is still larger than 8 MB. Choose a smaller image.");
    return new File([blob], privateFilename(file.name), {
      type: "image/jpeg",
      lastModified: Date.now()
    });
  } catch (error) {
    throw new Error(error?.message || "The selected photo could not be prepared safely.");
  } finally {
    decoded.cleanup();
  }
}
