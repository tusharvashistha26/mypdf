let filesList = []
/* ===============================
   GLOBAL LOADER CONTROL
================================ */
function showLoader() {
    const loader = document.getElementById("globalLoader")
    const tick = document.getElementById("successTick")

    if (loader) loader.classList.remove("hidden")
    if (tick) tick.classList.add("hidden")
}

function showSuccess() {
    const tick = document.getElementById("successTick")

    if (tick) {
        tick.classList.remove("hidden")

        setTimeout(() => {
            hideLoader()
        }, 1200)
    }
}

function hideLoader() {
    const loader = document.getElementById("globalLoader")
    if (loader) loader.classList.add("hidden")
}

/* ===============================
   INIT (SIDEBAR HIDDEN)
================================ */
window.onload = () => {
    document.getElementById("sidebar")?.classList.add("closed")

    // ✅ FORCE RESET LOADER
    const loader = document.getElementById("globalLoader")
    const tick = document.getElementById("successTick")

    if (loader) loader.classList.add("hidden")
    if (tick) tick.classList.add("hidden")
}

/* ===============================
   NAV
================================ */
function toggleSidebar() {
    const sidebar = document.getElementById("sidebar")
    const main = document.querySelector(".main")

    sidebar.classList.toggle("closed")
    main.classList.toggle("full")
}

function showTool(id) {
    document.querySelectorAll(".tool").forEach(t => t.classList.add("hidden"))

    let el = document.getElementById(id)
    if (el) el.classList.remove("hidden")

    const queue = document.getElementById("queueSection")
    queue.classList.toggle("hidden", id !== "dashboard")
}

/* ===============================
   ERROR
================================ */
function showError(msg) {
    showToast(msg, "error")
}

/* ===============================
   IMAGE PREVIEW
================================ */
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

function showToast(message, type = "success") {
    const container = document.getElementById("toastContainer")

    let div = document.createElement("div")
    div.className = `toast ${type}`
    div.innerText = message

    container.appendChild(div)

    setTimeout(() => div.remove(), 3000)
}

/* ===============================
   QUEUE
================================ */
function addJobToUI(jobId, label) {
    const list = document.getElementById("jobList")
    if (!list) return

    let div = document.createElement("div")
    div.className = "job-item"
    div.id = jobId

    div.innerHTML = `
        <strong>${label}</strong><br>
        <span class="status"><span class="loader"></span> Processing...</span>
    `

    list.prepend(div)
}

async function pollJob(jobId, label) {
    addJobToUI(jobId, label)

    let interval = setInterval(async () => {
        showLoader()
        let res = await fetch(`/job-status/${jobId}`)
        let data = await res.json()

        let el = document.getElementById(jobId)
        if (!el) return

        let statusEl = el.querySelector(".status")

        if (data.status === "completed") {
            showSuccess()
            clearInterval(interval)

            statusEl.innerText = "✅ Done"

            // 🔥 IMAGE → PDF (WITH PREVIEW)
            if (label === "Images → PDF") {
                const frame = document.getElementById("imageResultFrame")
                const previewBox = document.getElementById("imageResultPreview")
                const btn = document.getElementById("imageDownloadBtn")

                frame.src = data.download_url
                previewBox.classList.remove("hidden")

                btn.href = data.download_url
                btn.classList.remove("hidden")
            }

            // 🔥 OTHER TOOLS (ONLY DOWNLOAD BUTTON)
            if (label === "Compress PDF") {
                showDownload("compressDownloadBtn", data.download_url)
            }

            if (label === "Merge PDFs") {
                showDownload("mergeDownloadBtn", data.download_url)
            }

            if (label === "Split PDF") {
                showDownload("splitDownloadBtn", data.download_url)
            }

            if (label === "Word → PDF") {
                showDownload("wordDownloadBtn", data.download_url)
            }

            if (label === "PDF → Word") {
                showDownload("pdfWordDownloadBtn", data.download_url)
            }

            showToast("File ready!", "success")
        }

        if (data.status === "failed") {
            hideLoader()
            clearInterval(interval)

            statusEl.innerText = "❌ Failed"
            showToast("Error: " + (data.message || "Something went wrong"), "error")
        }

    }, 2000)
}

/* ===============================
   DOWNLOAD HELPER
================================ */
function showDownload(id, url) {
    const btn = document.getElementById(id)
    if (!btn) return

    btn.href = url
    btn.classList.remove("hidden")
}

/* ===============================
   THEME TOGGLE
================================ */
function toggleTheme() {
    const body = document.body

    body.classList.toggle("light")

    // save preference
    if (body.classList.contains("light")) {
        localStorage.setItem("theme", "light")
    } else {
        localStorage.setItem("theme", "dark")
    }
}

// LOAD SAVED THEME
window.addEventListener("DOMContentLoaded", () => {
    const saved = localStorage.getItem("theme")

    if (saved === "light") {
        document.body.classList.add("light")
    }
})
/* ===============================
   ACTIONS
================================ */
async function uploadImages() {
    let input = document.getElementById("imageInput")
    if (!input.files.length) return showError("Select images")

    let formData = new FormData()
    for (let f of input.files) formData.append("files", f)

    try {
        showLoader()
        let res = await fetch("/enqueue/images-to-pdf", {
            method: "POST",
            body: formData
        })

        let data = await res.json()
        pollJob(data.job_id, "Images → PDF")

    } catch {
        showError("Upload failed")
    }
}

async function compressPDF() {
    let file = document.getElementById("compressFile").files[0]
    if (!file) return showError("Select file")

    let formData = new FormData()
    formData.append("file", file)
    formData.append("level", document.getElementById("compressLevel").value)

    try {
        showLoader()
        let res = await fetch("/enqueue/compress-pdf", {
            method: "POST",
            body: formData
        })

        let data = await res.json()
        pollJob(data.job_id, "Compress PDF")

    } catch {
        showError("Compression failed")
    }
}

async function mergePDF() {
    const input = document.getElementById("mergeFiles")
    if (!input.files.length) return showError("Select PDFs")

    let formData = new FormData()
    for (let f of input.files) formData.append("files", f)

    try {
        showLoader()
        let res = await fetch("/enqueue/merge-pdf", {
            method: "POST",
            body: formData
        })

        let data = await res.json()
        pollJob(data.job_id, "Merge PDFs")

    } catch {
        showError("Merge failed")
    }
}

async function splitPDF() {
    let file = document.getElementById("splitFile").files[0]
    let page = document.getElementById("splitPage").value

    if (!file || !page) return showError("Select file & page")

    let formData = new FormData()
    formData.append("file", file)
    formData.append("page", page)

    try {
        showLoader()
        let res = await fetch("/enqueue/split-pdf", {
            method: "POST",
            body: formData
        })

        let data = await res.json()
        pollJob(data.job_id, "Split PDF")

    } catch {
        showError("Split failed")
    }
}

async function convertWord() {
    let file = document.getElementById("wordFile").files[0]
    if (!file) return showError("Select file")

    let formData = new FormData()
    formData.append("file", file)

    try {
        showLoader()
        let res = await fetch("/enqueue/word-to-pdf", {
            method: "POST",
            body: formData
        })

        let data = await res.json()
        pollJob(data.job_id, "Word → PDF")

    } catch {
        showError("Conversion failed")
    }
}

async function convertPDF() {
    let file = document.getElementById("pdfWordFile").files[0]
    if (!file) return showError("Select file")

    let formData = new FormData()
    formData.append("file", file)

    try {
        showLoader()
        let res = await fetch("/enqueue/pdf-to-word", {
            method: "POST",
            body: formData
        })

        let data = await res.json()
        pollJob(data.job_id, "PDF → Word")

    } catch {
        showError("Conversion failed")
    }
}

/* ===============================
   CLEAR
================================ */
function clearImages() {
    document.getElementById("imageInput").value = ""
    document.getElementById("preview").innerHTML = ""

    document.getElementById("imageResultPreview").classList.add("hidden")
    document.getElementById("imageDownloadBtn").classList.add("hidden")
}

function clearMerge() {
    document.getElementById("mergeFiles").value = ""
    hideDownload("mergeDownloadBtn")
}

function clearCompress() {
    document.getElementById("compressFile").value = ""
    hideDownload("compressDownloadBtn")
}

function clearSplit() {
    document.getElementById("splitFile").value = ""
    document.getElementById("splitPage").value = ""
    hideDownload("splitDownloadBtn")
}

function clearWord() {
    document.getElementById("wordFile").value = ""
    hideDownload("wordDownloadBtn")
}

function clearPDFWord() {
    document.getElementById("pdfWordFile").value = ""
    hideDownload("pdfWordDownloadBtn")
}

function hideDownload(id) {
    const btn = document.getElementById(id)
    if (btn) btn.classList.add("hidden")
}