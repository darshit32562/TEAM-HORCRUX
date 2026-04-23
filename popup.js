document.addEventListener("DOMContentLoaded", () => {

let originalData = null, compressedData = null, decompressedData = null;
let currentFile = null;

const uploadBox = document.getElementById("uploadBox");
const fileInput = document.getElementById("fileInput");
const fileInfo = document.getElementById("fileInfo");
const fileName = document.getElementById("fileName");
const changeFileBtn = document.getElementById("changeFileBtn");

// Upload click
uploadBox.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", handleFile);

// Drag & drop
uploadBox.addEventListener("dragover", e => e.preventDefault());
uploadBox.addEventListener("drop", e => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    handleFile({ target: { files: [file] } });
});

// ================= FILE HANDLER =================
async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    currentFile = file;

    fileName.textContent = `${file.name} (${formatBytes(file.size)})`;
    fileInfo.style.display = "block";
    uploadBox.style.display = "none";

    document.getElementById("fileType").textContent = file.type || "Unknown";
    document.getElementById("hashStatus").textContent = "⏳ Loading file...";

    const buffer = await file.arrayBuffer();

    // If compressed file
    if (file.name.endsWith(".gz")) {
        compressedData = new Uint8Array(buffer);
        originalData = null;

        document.getElementById("hashStatus").textContent = "📦 Compressed file ready for decompression";
        return;
    }

    // Normal file
    originalData = new Uint8Array(buffer);
    compressedData = null;
    decompressedData = null;

    document.getElementById("originalSize").textContent = formatBytes(originalData.length);
    document.getElementById("hashStatus").textContent = "✅ File ready";
}

// ================= COMPRESS =================
document.getElementById("compressBtn").addEventListener("click", async () => {

    if (!originalData) {
        document.getElementById("hashStatus").textContent = "⚠️ Upload file first";
        return;
    }

    if (currentFile.type.startsWith("image")) {
        compressedData = await compressImageSmart(currentFile);

        // PSNR for lossy compression
        const psnr = calculatePSNR(originalData, compressedData);
        document.getElementById("hashStatus").textContent = "📊 PSNR: " + psnr + " dB";

    } else {
        // Text, audio, video → gzip
        compressedData = fflate.gzipSync(originalData);
        document.getElementById("hashStatus").textContent = "✅ Compression done";
    }

    updateMetrics(originalData.length, compressedData.length);
});

// ================= DECOMPRESS =================
document.getElementById("decompressBtn").addEventListener("click", async () => {

    if (!compressedData) {
        document.getElementById("hashStatus").textContent = "⚠️ No compressed file loaded";
        return;
    }

    try {
        decompressedData = fflate.gunzipSync(compressedData);

        // If original exists → verify hash
        if (originalData) {
            const h1 = await getHash(originalData);
            const h2 = await getHash(decompressedData);

            document.getElementById("hashStatus").textContent =
                (h1 === h2) ? "✅ Perfect Reconstruction" : "⚠️ Data mismatch";
        } else {
            document.getElementById("hashStatus").textContent = "✅ Decompressed file ready";
        }

    } catch {
        document.getElementById("hashStatus").textContent = "⚠️ Cannot decompress this file";
    }
});

// ================= DOWNLOAD =================
document.getElementById("downloadCompressed").addEventListener("click", () => {
    if (!compressedData) {
        document.getElementById("hashStatus").textContent = "⚠️ Nothing to download";
        return;
    }
    downloadFile(compressedData, currentFile.name + ".gz");
});

document.getElementById("downloadDecompressed").addEventListener("click", () => {
    if (!decompressedData) {
        document.getElementById("hashStatus").textContent = "⚠️ Decompress first";
        return;
    }
    downloadFile(decompressedData, "restored_" + currentFile.name.replace(".gz",""));
});

// ================= IMAGE COMPRESSION =================
async function compressImageSmart(file) {
    const qualities = [0.6, 0.5, 0.4, 0.3, 0.2];

    const originalBuffer = new Uint8Array(await file.arrayBuffer());

    for (let q of qualities) {
        const compressed = await compressWithQuality(file, q);

        if (compressed.length < originalBuffer.length) {
            document.getElementById("qualityValue").textContent = q;
            return compressed;
        }
    }

    // If nothing worked → return smallest anyway
    return await compressWithQuality(file, 0.2);
}

// ================= METRICS =================
function updateMetrics(original, compressed) {
    document.getElementById("compressedSize").textContent = formatBytes(compressed);

    const ratio = (original / compressed).toFixed(2);
    const savings = ((original - compressed) / original * 100).toFixed(2);

    document.getElementById("ratio").textContent = ratio + ":1";
    document.getElementById("savings").textContent = savings + "%";

    const used = 100 - savings;

    document.getElementById("usedBar").style.width = used + "%";
    document.getElementById("savedBar").style.width = savings + "%";
}

// ================= HELPERS =================
function formatBytes(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

function downloadFile(data, name) {
    const blob = new Blob([data]);
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();

    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

async function getHash(buffer) {
    const hash = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, "0")).join("");
}

function compressWithQuality(file, quality) {
    return new Promise(resolve => {
        const img = new Image();
        img.src = URL.createObjectURL(file);

        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;

            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);

            canvas.toBlob(blob => {
                blob.arrayBuffer().then(buffer => {
                    resolve(new Uint8Array(buffer));
                });
            }, "image/jpeg", quality);
        };
    });
}

// ================= PSNR =================
function calculatePSNR(original, compressed) {
    let mse = 0;
    const len = Math.min(original.length, compressed.length);

    for (let i = 0; i < len; i++) {
        mse += (original[i] - compressed[i]) ** 2;
    }

    mse /= len;

    if (mse === 0) return "Infinity";

    const psnr = 10 * Math.log10((255 * 255) / mse);
    return psnr.toFixed(2);
}

// ================= RESET =================
changeFileBtn.addEventListener("click", () => {
    fileInput.value = "";
    fileInfo.style.display = "none";
    uploadBox.style.display = "block";

    originalData = null;
    compressedData = null;
    decompressedData = null;

    document.getElementById("hashStatus").textContent = "";
});

});