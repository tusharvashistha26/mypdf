let filesList = []

function toggleSidebar() {
    document.getElementById("sidebar").classList.toggle("open")
}

function showTool(id) {

    document.querySelectorAll(".tool").forEach(t => t.classList.add("hidden"))

    document.getElementById(id).classList.remove("hidden")

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

if (dropZone) {

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


let pageMap = [] // stores mapping of pages

/* PDF THUMBNAILS WITH SELECTION */

const mergeInput = document.getElementById("mergeFiles")

if (mergeInput) {

    mergeInput.addEventListener("change", async function () {

        const container = document.getElementById("pdfPreview")
        container.innerHTML = ""
        pageMap = []

        let fileIndex = 0

        for (let file of this.files) {

            let url = URL.createObjectURL(file)
            let pdf = await pdfjsLib.getDocument(url).promise

            for (let i = 1; i <= pdf.numPages; i++) {

                let page = await pdf.getPage(i)

                let canvas = document.createElement("canvas")
                let ctx = canvas.getContext("2d")

                let viewport = page.getViewport({ scale: 0.4 })

                canvas.width = viewport.width
                canvas.height = viewport.height

                await page.render({
                    canvasContext: ctx,
                    viewport
                }).promise

                let wrapper = document.createElement("div")
                wrapper.className = "pdf-item"
                wrapper.dataset.fileIndex = fileIndex
                wrapper.dataset.pageIndex = i - 1
                wrapper.dataset.selected = "true"

                // CLICK SELECT
                wrapper.onclick = () => {
                    let selected = wrapper.dataset.selected === "true"
                    wrapper.dataset.selected = (!selected).toString()
                    wrapper.classList.toggle("selected")
                }

                let label = document.createElement("p")
                label.innerText = `Page ${i}`
                label.style.color = "black"
                label.style.fontSize = "12px"

                wrapper.appendChild(canvas)
                wrapper.appendChild(label)

                container.appendChild(wrapper)
            }

            fileIndex++
        }

        new Sortable(container, { animation: 150 })
    })
}


/* MERGE WITH ORDER + SELECTION */

async function mergePDF() {

    const input = document.getElementById("mergeFiles")

    if (input.files.length < 1) {
        alert("Select PDFs")
        return
    }

    const container = document.getElementById("pdfPreview")
    const pages = container.querySelectorAll(".pdf-item")

    let order = []

    pages.forEach(el => {
        if (el.dataset.selected === "true") {
            order.push({
                fileIndex: parseInt(el.dataset.fileIndex),
                pageIndex: parseInt(el.dataset.pageIndex)
            })
        }
    })

    if (order.length === 0) {
        alert("Select at least one page")
        return
    }

    const formData = new FormData()

    for (let file of input.files) {
        formData.append("files", file)
    }

    formData.append("order", JSON.stringify(order))

    document.getElementById("loader").classList.remove("hidden")

    const res = await fetch("/merge-pdf", {
        method: "POST",
        body: formData
    })

    const blob = await res.blob()

    document.getElementById("loader").classList.add("hidden")

    const url = URL.createObjectURL(blob)

    let a = document.createElement("a")
    a.href = url
    a.download = "merged.pdf"
    a.click()
}


/* PROGRESS */

function updateProgress(percent) {
    document.getElementById("uploadProgress").style.width = percent + "%"
}


/* IMAGE → PDF */

async function uploadImages() {

    const input = document.getElementById("imageInput")

    if (input.files.length === 0) {
        alert("Select images")
        return
    }

    const formData = new FormData()

    for (let file of input.files) {
        formData.append("files", file)
    }

    let xhr = new XMLHttpRequest()

    xhr.open("POST", "/images-to-pdf")

    xhr.upload.onprogress = e => {

        let percent = (e.loaded / e.total) * 100
        updateProgress(percent)

    }

    xhr.responseType = "blob"

    document.getElementById("loader").classList.remove("hidden")

    xhr.onload = () => {

        document.getElementById("loader").classList.add("hidden")

        let url = URL.createObjectURL(xhr.response)

        let a = document.createElement("a")

        a.href = url
        a.download = "images.pdf"
        a.click()

    }

    xhr.send(formData)

}


/* COMPRESS */

async function compressPDF() {

    const fileInput = document.getElementById("compressFile")
    const level = document.getElementById("compressLevel").value

    if (fileInput.files.length === 0) {
        alert("Select a PDF")
        return
    }

    const formData = new FormData()

    formData.append("file", fileInput.files[0])
    formData.append("level", level)

    document.getElementById("loader").classList.remove("hidden")

    const res = await fetch("/compress-pdf", { method: "POST", body: formData })

    const blob = await res.blob()

    document.getElementById("loader").classList.add("hidden")

    const url = URL.createObjectURL(blob)

    let a = document.createElement("a")

    a.href = url
    a.download = "compressed.pdf"
    a.click()

}



async function splitPDF() {

    const file = document.getElementById("splitFile").files[0]
    const page = document.getElementById("splitPage").value

    if (!file || !page) {
        alert("Select file and page")
        return
    }

    const formData = new FormData()

    formData.append("file", file)
    formData.append("page", page)

    document.getElementById("loader").classList.remove("hidden")

    const res = await fetch("/split-pdf", { method: "POST", body: formData })

    const blob = await res.blob()

    document.getElementById("loader").classList.add("hidden")

    const url = URL.createObjectURL(blob)

    let a = document.createElement("a")

    a.href = url
    a.download = "split.pdf"
    a.click()

}

async function convertWord() {

    const file = document.getElementById("wordFile").files[0]

    if (!file) {
        alert("Select Word file")
        return
    }

    const formData = new FormData()

    formData.append("file", file)

    document.getElementById("loader").classList.remove("hidden")

    const res = await fetch("/word-to-pdf", { method: "POST", body: formData })

    const blob = await res.blob()

    document.getElementById("loader").classList.add("hidden")

    const url = URL.createObjectURL(blob)

    let a = document.createElement("a")

    a.href = url
    a.download = "converted.pdf"
    a.click()

}

async function convertPDF() {

    const file = document.getElementById("pdfWordFile").files[0]

    if (!file) {
        alert("Select PDF")
        return
    }

    const formData = new FormData()

    formData.append("file", file)

    document.getElementById("loader").classList.remove("hidden")

    const res = await fetch("/pdf-to-word", { method: "POST", body: formData })

    const blob = await res.blob()

    document.getElementById("loader").classList.add("hidden")

    const url = URL.createObjectURL(blob)

    let a = document.createElement("a")

    a.href = url
    a.download = "converted.docx"
    a.click()

}

function clearImages() {
    document.getElementById("imageInput").value = ""
    document.getElementById("preview").innerHTML = ""
}

function clearMerge() {
    document.getElementById("mergeFiles").value = ""
    document.getElementById("pdfPreview").innerHTML = ""
}

function clearCompress() {
    document.getElementById("compressFile").value = ""
    document.getElementById("sizeInfo").innerHTML = ""
    document.getElementById("compressionResult").innerHTML = ""
}

function clearSplit() {
    document.getElementById("splitFile").value = ""
    document.getElementById("splitPage").value = ""
}

function clearWord() {
    document.getElementById("wordFile").value = ""
}

function clearPDFWord() {
    document.getElementById("pdfWordFile").value = ""
}