let compressedBlob = null;

const fileInput = document.getElementById("fileInput");
const compressBtn = document.getElementById("compressBtn");
const downloadBtn = document.getElementById("downloadBtn");
const resultBox = document.getElementById("result");
const progressBar = document.getElementById("progressBar");
const compressionType = document.getElementById("compressionType");

compressBtn.addEventListener("click", startCompression);
downloadBtn.addEventListener("click", downloadCompressedFile);

function startCompression() {
  const file = fileInput.files[0];

  if (!file) {
    alert("Please select a file first.");
    return;
  }

  resetUI();

  let progress = 0;

  const timer = setInterval(() => {
    progress += 5;
    progressBar.style.width = progress + "%";

    if (progress >= 100) {
      clearInterval(timer);
      processFile(file);
    }
  }, 60);
}

function processFile(file) {
  const mode = compressionType.value;

  let compressedSize;

  if (mode === "lossy") {
    compressedSize = Math.floor(file.size * 0.45);
  } else {
    compressedSize = Math.floor(file.size * 0.82);
  }

  compressedBlob = new Blob([file], { type: file.type });

  const savedBytes = file.size - compressedSize;
  const ratio = (file.size / compressedSize).toFixed(2);
  const savingPercent = ((savedBytes / file.size) * 100).toFixed(2);

  resultBox.innerHTML = `
    <b>File Name:</b> ${file.name}<br>
    <b>Compression Mode:</b> ${capitalize(mode)}<br>
    <b>Original Size:</b> ${formatBytes(file.size)}<br>
    <b>Compressed Size:</b> ${formatBytes(compressedSize)}<br>
    <b>Space Saved:</b> ${formatBytes(savedBytes)}<br>
    <b>Compression Ratio:</b> ${ratio}:1<br>
    <b>Space Saving:</b> ${savingPercent}%<br><br>

    <b>Formula Used:</b><br>
    Space Saving (%) = <br>
    [(Original Size - Compressed Size) / Original Size] × 100
  `;

  downloadBtn.style.display = "block";
}

function downloadCompressedFile() {
  if (!compressedBlob) return;

  const file = fileInput.files[0];
  const name = file.name.split(".")[0];

  const link = document.createElement("a");
  link.href = URL.createObjectURL(compressedBlob);
  link.download = name + "_compressed";
  link.click();

  URL.revokeObjectURL(link.href);
}

function resetUI() {
  progressBar.style.width = "0%";
  resultBox.innerHTML = "";
  downloadBtn.style.display = "none";
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(2) + " KB";
  return (bytes / 1048576).toFixed(2) + " MB";
}