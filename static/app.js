let filesList = []

function toggleSidebar() {
    document.getElementById("sidebar").classList.toggle("open")
    document.getElementById("overlay").classList.toggle("active")
}

function showTool(id) {

    document.querySelectorAll(".tool").forEach(t => t.classList.add("hidden"))

    let el = document.getElementById(id)

    if (el) {
        el.classList.remove("hidden")
    }

    // auto close sidebar
    document.getElementById("sidebar").classList.remove("open")
    document.getElementById("overlay").classList.remove("active")
}

/* IMAGE PREVIEW */
const imageInput = document.getElementById("imageInput")

if (imageInput) {
    imageInput.addEventListener("change", function () {

        const preview = document.getElementById("preview")
        preview.innerHTML = ""

        filesList = [...this.files]

        filesList.forEach(file => {
            let img = document.createElement("img")
            img.src = URL.createObjectURL(file)
            preview.appendChild(img)
        })

        new Sortable(preview, { animation: 150 })
    })
}

/* DRAG DROP */
const dropZone = document.getElementById("dropZone")

if (dropZone && imageInput) {

    dropZone.addEventListener("click", () => imageInput.click())

    dropZone.addEventListener("dragover", e => {
        e.preventDefault()
        dropZone.classList.add("dragover")
    })

    dropZone.addEventListener("dragleave", () => {
        dropZone.classList.remove("dragover")
    })

    dropZone.addEventListener("drop", e => {
        e.preventDefault()
        dropZone.classList.remove("dragover")

        imageInput.files = e.dataTransfer.files
        imageInput.dispatchEvent(new Event("change"))
    })
}
