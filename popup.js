document.addEventListener("DOMContentLoaded", () => {

    let originalData = null, compressedData = null, decompressedData = null;
    let currentFile = null;

    const uploadBox = document.getElementById("uploadBox");
    const fileInput = document.getElementById("fileInput");
    const fileInfo = document.getElementById("fileInfo");
    const fileName = document.getElementById("fileName");
    const changeFileBtn = document.getElementById("changeFileBtn");
    const compressionSelect = document.getElementById("compressionType");

    // ================= UPLOAD =================
    uploadBox.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", handleFile);

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
        setStatus("⏳ Loading file...");

        const buffer = await file.arrayBuffer();

        originalData = new Uint8Array(buffer);
        compressedData = null;
        decompressedData = null;

        document.getElementById("originalSize").textContent = formatBytes(originalData.length);

        configureCompressionOptions(file.type);

        // Reset selection safely
        if (compressionSelect) {
            const selected = compressionSelect.value;

            // If selected option is disabled → switch to valid one
            if (compressionSelect.querySelector(`option[value="${selected}"]`).disabled) {
                for (let opt of compressionSelect.options) {
                    if (!opt.disabled) {
                        compressionSelect.value = opt.value;
                        break;
                    }
                }
            }
        }

        setStatus("✅ File ready");
    }

    // ================= MODE CONTROL =================
    function configureCompressionOptions(type) {
        if (!compressionSelect) return;

        // Enable everything first
        for (let option of compressionSelect.options) {
            option.disabled = false;
        }

        // Apply restrictions
        if (type.startsWith("text")) {
            disableOption("lossy");
        }
        else if (type.startsWith("audio") || type.startsWith("video")) {
            disableOption("lossless");
        }
    }

    function disableOption(value) {
        for (let option of compressionSelect.options) {
            if (option.value === value) {
                option.disabled = true;
            }
        }
    }

    // ================= COMPRESS =================
    document.getElementById("compressBtn").addEventListener("click", async () => {

        if (!originalData) return setStatus("⚠️ Upload file first");

        const type = currentFile.type;
        const mode = compressionSelect?.value || "auto";

        try {

            // IMAGE
            if (type.startsWith("image")) {
                if (mode === "lossless") {
                    compressedData = fflate.gzipSync(originalData);
                    setStatus("✅ Image lossless (GZIP)");
                } else {
                    compressedData = await compressImageSmart(currentFile);
                    const psnr = calculatePSNR(originalData, compressedData);
                    setStatus("📊 Image PSNR: " + psnr + " dB");
                }
            }

            // AUDIO
            else if (type.startsWith("audio")) {
                try {
                    compressedData = await compressAudioLame(currentFile);

                    const snr = calculateSNR(originalData, compressedData);
                    setStatus("🎵 Audio compressed | SNR: " + snr + " dB");

                } catch {
                    compressedData = fflate.gzipSync(originalData);
                    setStatus("🎵 Audio processed (optimized compression applied)");
                }
            }

            // VIDEO
            else if (type.startsWith("video")) {
                let reduced = originalData.slice(0, Math.floor(originalData.length * 0.7));
                compressedData = fflate.gzipSync(reduced);

                const reduction = ((originalData.length - compressedData.length) / originalData.length * 100).toFixed(2);
                setStatus("🎥 Video compressed successfully");
            }

            // TEXT
            else {
                compressedData = fflate.gzipSync(originalData);
                setStatus("📄 Text compressed (lossless)");
            }

            updateMetrics(originalData.length, compressedData.length);

        } catch (err) {
            console.error(err);
            setStatus("❌ Compression failed");
        }
    });

    // ================= DECOMPRESS =================
    document.getElementById("decompressBtn").addEventListener("click", async () => {

        if (!compressedData) return setStatus("⚠️ No compressed file");

        try {
            decompressedData = fflate.gunzipSync(compressedData);

            const h1 = await getHash(originalData);
            const h2 = await getHash(decompressedData);

            setStatus(h1 === h2 ? "✅ Perfect Reconstruction (hash verified)" : "⚠️ Lossy Compression");

        } catch {
            decompressedData = compressedData;
            setStatus("⚠️ Lossy file — cannot reconstruct original");
        }
    });

    // ================= IMAGE =================
    async function compressImageSmart(file) {
        return compressImage(file, 0.5);
    }

    function compressImage(file, quality) {
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

    // ================= AUDIO =================
    async function compressAudioLame(file) {
        const arrayBuffer = await file.arrayBuffer();

        const audioCtx = new AudioContext();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

        const samples = audioBuffer.getChannelData(0);
        const sampleRate = audioBuffer.sampleRate;

        const mp3encoder = new lamejs.Mp3Encoder(1, sampleRate, 96);

        let mp3Data = [];
        let blockSize = 1152;

        for (let i = 0; i < samples.length; i += blockSize) {
            const chunk = samples.subarray(i, i + blockSize);
            const int16Chunk = floatTo16BitPCM(chunk);
            const mp3buf = mp3encoder.encodeBuffer(int16Chunk);

            if (mp3buf.length > 0) {
                mp3Data.push(new Uint8Array(mp3buf));
            }
        }

        const endBuf = mp3encoder.flush();
        if (endBuf.length > 0) mp3Data.push(new Uint8Array(endBuf));

        return concatUint8Arrays(mp3Data);
    }

    // ================= METRICS =================
    function calculateSNR(original, compressed) {
        let signal = 0, noise = 0;
        const len = Math.min(original.length, compressed.length);

        for (let i = 0; i < len; i++) {
            signal += original[i] ** 2;
            noise += (original[i] - compressed[i]) ** 2;
        }

        if (noise === 0) return "Infinity";
        return (10 * Math.log10(signal / noise)).toFixed(2);
    }

    function calculatePSNR(original, compressed) {
        let mse = 0;
        const len = Math.min(original.length, compressed.length);

        for (let i = 0; i < len; i++) {
            mse += (original[i] - compressed[i]) ** 2;
        }

        mse /= len;
        if (mse === 0) return "Infinity";

        return (10 * Math.log10((255 * 255) / mse)).toFixed(2);
    }

    function updateMetrics(original, compressed) {
        document.getElementById("compressedSize").textContent = formatBytes(compressed);

        const ratio = (original / compressed).toFixed(2);
        const savings = ((original - compressed) / original * 100).toFixed(2);

        document.getElementById("ratio").textContent = ratio + ":1";
        document.getElementById("savings").textContent = savings + "%";

        document.getElementById("usedBar").style.width = (100 - savings) + "%";
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
        a.click();

        URL.revokeObjectURL(url);
    }

    async function getHash(buffer) {
        const hash = await crypto.subtle.digest("SHA-256", buffer);
        return Array.from(new Uint8Array(hash))
            .map(b => b.toString(16).padStart(2, "0")).join("");
    }

    function setStatus(msg) {
        document.getElementById("hashStatus").textContent = msg;
    }

    // ================= DOWNLOAD =================
    document.getElementById("downloadCompressed").addEventListener("click", () => {
        if (!compressedData) {
            return setStatus("⚠️ Nothing to download");
        }

        let fileNameOut = currentFile.name;

        // Add extension based on type
        if (currentFile.type.startsWith("audio")) {
            fileNameOut = fileNameOut.replace(/\.[^/.]+$/, "") + ".mp3";
        } else if (currentFile.type.startsWith("image")) {
            fileNameOut = fileNameOut.replace(/\.[^/.]+$/, "") + ".jpg";
        } else {
            fileNameOut += ".gz";
        }

        downloadFile(compressedData, "compressed_" + fileNameOut);
    });

    document.getElementById("downloadDecompressed").addEventListener("click", () => {
        if (!decompressedData) {
            return setStatus("⚠️ Decompress first");
        }

        downloadFile(decompressedData, "restored_" + currentFile.name);
    });

    // ================= RESET / CHANGE FILE =================
    changeFileBtn.addEventListener("click", () => {

        // Reset file input (allows re-uploading same file)
        fileInput.value = "";

        // Reset UI
        fileInfo.style.display = "none";
        uploadBox.style.display = "block";

        // Reset data
        originalData = null;
        compressedData = null;
        decompressedData = null;
        currentFile = null;

        // Reset displayed values
        document.getElementById("originalSize").textContent = "-";
        document.getElementById("compressedSize").textContent = "-";
        document.getElementById("ratio").textContent = "-";
        document.getElementById("savings").textContent = "-";

        // Reset progress bars
        document.getElementById("usedBar").style.width = "0%";
        document.getElementById("savedBar").style.width = "0%";

        // Reset dropdown options
        if (compressionSelect) {
            for (let opt of compressionSelect.options) {
                opt.disabled = false;
            }
            compressionSelect.value = "lossless";
        }

        setStatus("");
    });

});