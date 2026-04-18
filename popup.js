document.getElementById("compressBtn").addEventListener("click", function(){

    let file = document.getElementById("fileInput").files[0];

    if(!file){
        document.getElementById("result").innerHTML = "Please select a file.";
        return;
    }

    document.getElementById("result").innerHTML =
    "File Name: " + file.name + "<br>" +
    "Original Size: " + file.size + " bytes";

});