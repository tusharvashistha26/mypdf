console.log("APP JS LOADED ✅")

let filesList = []

function toggleSidebar() {
    let sidebar = document.getElementById("sidebar")
    let overlay = document.getElementById("overlay")

    if (sidebar) sidebar.classList.toggle("open")
    if (overlay) overlay.classList.toggle("active")
}

function showTool(id) {

    document.querySelectorAll(".tool").forEach(t => t.classList.add("hidden"))

    let el = document.getElementById(id)
    if (el) el.classList.remove("hidden")

    // auto close sidebar
    let sidebar = document.getElementById("sidebar")
    let overlay = document.getElementById("overlay")

    if (sidebar) sidebar.classList.remove("open")
    if (overlay) overlay.classList.remove("active")
}


/* ================= IMAGE PREVIEW ================= */

const imageInput = document.getElementById("imageInput")

if (imageInput) {
    imageInput.addEventListener("change", function () {

        const preview = document.getElementById("preview")
        if (!preview) return

        preview.innerHTML = ""

        filesList = [...this.files]

        filesList.forEach(file => {
            let img = document.createElement("img")
            img.src = URL.createObjectURL(file)
            preview.appendChild(img)
        })

        if (typeof Sortable !== "undefined") {
            new Sortable(preview, { animation: 150 })
        }
    })
}


/* ================= DRAG DROP ================= */

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


/* ================= PDF PREVIEW (MERGE) ================= */

const mergeInput = document.getElementById("mergeFiles")

if (mergeInput) {

    mergeInput.addEventListener("change", async function () {

        const container = document.getElementById("pdfPreview")
        if (!container) return

        container.innerHTML = ""

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

                wrapper.onclick = () => {
                    let selected = wrapper.dataset.selected === "true"
                    wrapper.dataset.selected = (!selected).toString()
                    wrapper.classList.toggle("selected")
                }

                let label = document.createElement("p")
                label.innerText = `Page ${i}`

                wrapper.appendChild(canvas)
                wrapper.appendChild(label)

                container.appendChild(wrapper)
            }

            fileIndex++
        }

        if (typeof Sortable !== "undefined") {
            new Sortable(container, { animation: 150 })
        }
    })
}


/* ================= MERGE ================= */

async function mergePDF() {

    const input = document.getElementById("mergeFiles")

    if (!input || input.files.length === 0) {
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

    let a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = "merged.pdf"
    a.click()
}


/* ================= IMAGE → PDF ================= */

async function uploadImages() {

    const input = document.getElementById("imageInput")

    if (!input || input.files.length === 0) {
        alert("Select images")
        return
    }

    const formData = new FormData()

    for (let file of input.files) {
        formData.append("files", file)
    }

    document.getElementById("loader").classList.remove("hidden")

    const res = await fetch("/images-to-pdf", {
        method: "POST",
        body: formData
    })

    const blob = await res.blob()

    document.getElementById("loader").classList.add("hidden")

    let a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = "images.pdf"
    a.click()
}


/* ================= COMPRESS ================= */

async function compressPDF() {

    const fileInput = document.getElementById("compressFile")
    const level = document.getElementById("compressLevel").value

    if (!fileInput || fileInput.files.length === 0) {
        alert("Select PDF")
        return
    }

    const formData = new FormData()
    formData.append("file", fileInput.files[0])
    formData.append("level", level)

    document.getElementById("loader").classList.remove("hidden")

    const res = await fetch("/compress-pdf", {
        method: "POST",
        body: formData
    })

    const blob = await res.blob()

    document.getElementById("loader").classList.add("hidden")

    let a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = "compressed.pdf"
    a.click()
}


/* ================= SPLIT ================= */

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

    const res = await fetch("/split-pdf", {
        method: "POST",
        body: formData
    })

    const blob = await res.blob()

    document.getElementById("loader").classList.add("hidden")

    let a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = "split.pdf"
    a.click()
}


/* ================= WORD ================= */

async function convertWord() {

    const file = document.getElementById("wordFile").files[0]

    if (!file) {
        alert("Select Word file")
        return
    }

    const formData = new FormData()
    formData.append("file", file)

    document.getElementById("loader").classList.remove("hidden")

    const res = await fetch("/word-to-pdf", {
        method: "POST",
        body: formData
    })

    const blob = await res.blob()

    document.getElementById("loader").classList.add("hidden")

    let a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = "converted.pdf"
    a.click()
}


/* ================= PDF → WORD ================= */

async function convertPDF() {

    const file = document.getElementById("pdfWordFile").files[0]

    if (!file) {
        alert("Select PDF")
        return
    }

    const formData = new FormData()
    formData.append("file", file)

    document.getElementById("loader").classList.remove("hidden")

    const res = await fetch("/pdf-to-word", {
        method: "POST",
        body: formData
    })

    const blob = await res.blob()

    document.getElementById("loader").classList.add("hidden")

    let a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = "converted.docx"
    a.click()
}


/* ================= CLEAR ================= */

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
