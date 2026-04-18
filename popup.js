let compressedBlob;

document.getElementById("compressBtn").addEventListener("click", function () {
  let file = document.getElementById("fileInput").files[0];

  if (!file) {
    alert("Please choose file first.");
    return;
  }

  let progress = document.getElementById("progressBar");
  let width = 0;

  let interval = setInterval(function () {
    width += 10;
    progress.style.width = width + "%";

    if (width >= 100) {
      clearInterval(interval);

      let type = document.getElementById("compressionType").value;
      let newSize;

      if (type === "lossy") {
        newSize = Math.floor(file.size * 0.4); // more compression
      } else {
        newSize = Math.floor(file.size * 0.8); // safe compression
      }

      compressedBlob = new Blob([file], { type: file.type });

      document.getElementById("result").innerHTML = `
<b>File:</b> ${file.name}<br>
<b>Compression:</b> ${type}<br>
<b>Original Size:</b> ${file.size} bytes<br>
<b>Compressed Size:</b> ${newSize} bytes<br>
<b>Saved:</b> ${file.size - newSize} bytes
`;

      document.getElementById("downloadBtn").style.display = "block";
    }
  }, 100);
});

document.getElementById("downloadBtn").addEventListener("click", function () {
  let a = document.createElement("a");
  a.href = URL.createObjectURL(compressedBlob);
  a.download = "compressed_file";
  a.click();
});
