let filesList = []

/* ===============================
   SAFE FETCH (🔥 FIXES YOUR ERROR)
================================ */
async function safeFetchJSON(url, options = {}) {
    try {
        const res = await fetch(url, options)

        if (!res.ok) {
            throw new Error(`Server error: ${res.status}`)
        }

        const text = await res.text()

        try {
            return JSON.parse(text)
        } catch {
            throw new Error("Invalid server response")
        }

    } catch (err) {
        console.error("Fetch error:", err)
        showToast(err.message || "Network error", "error")
        return null
    }
}

/* ===============================
   LOADER
================================ */
function showLoader() {
    document.getElementById("globalLoader")?.classList.remove("hidden")
    document.getElementById("successTick")?.classList.add("hidden")
}

function showSuccess() {
    const tick = document.getElementById("successTick")
    if (!tick) return

    tick.classList.remove("hidden")

    setTimeout(() => hideLoader(), 1000)
}

function hideLoader() {
    document.getElementById("globalLoader")?.classList.add("hidden")
}

/* ===============================
   INIT
================================ */
window.onload = () => {
    document.getElementById("sidebar")?.classList.add("closed")
    hideLoader()
}

/* ===============================
   NAV
================================ */
function toggleSidebar() {
    document.getElementById("sidebar")?.classList.toggle("closed")
    document.querySelector(".main")?.classList.toggle("full")
}

function showTool(id) {
    document.querySelectorAll(".tool").forEach(t => t.classList.add("hidden"))

    document.getElementById(id)?.classList.remove("hidden")

    const queue = document.getElementById("queueSection")
    queue.classList.toggle("hidden", id !== "dashboard")
}

/* ===============================
   TOAST
================================ */
function showToast(message, type = "success") {
    const container = document.getElementById("toastContainer")

    let div = document.createElement("div")
    div.className = `toast ${type}`
    div.innerText = message

    container.appendChild(div)

    setTimeout(() => div.remove(), 3000)
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

/* ===============================
   QUEUE SYSTEM (🔥 IMPROVED)
================================ */
function addJobToUI(jobId, label) {
    const list = document.getElementById("jobList")
    if (!list) return

    let div = document.createElement("div")
    div.className = "job-item"
    div.id = jobId

    div.innerHTML = `
        <strong>${label}</strong><br>
        <span class="status">⏳ Processing...</span>
    `

    list.prepend(div)
}

async function pollJob(jobId, label) {
    addJobToUI(jobId, label)

    let attempts = 0

    const interval = setInterval(async () => {
        attempts++

        const data = await safeFetchJSON(`/job-status/${jobId}`)
        if (!data) return

        let el = document.getElementById(jobId)
        if (!el) return

        let statusEl = el.querySelector(".status")

        if (data.status === "completed") {
            clearInterval(interval)
            showSuccess()

            statusEl.innerText = "✅ Done"

            handleDownload(label, data.download_url)

            showToast("File ready!", "success")
        }

        if (data.status === "failed") {
            clearInterval(interval)
            hideLoader()

            statusEl.innerText = "❌ Failed"
            showToast(data.message || "Failed", "error")
        }

        // 🔥 AUTO STOP (avoid infinite loop)
        if (attempts > 60) {
            clearInterval(interval)
            hideLoader()
            statusEl.innerText = "⚠ Timeout"
            showToast("Server timeout. Try smaller file.", "error")
        }

    }, 2000)
}

/* ===============================
   DOWNLOAD HANDLER
================================ */
function handleDownload(label, url) {
    if (!url) return

    const map = {
        "Compress PDF": "compressDownloadBtn",
        "Merge PDFs": "mergeDownloadBtn",
        "Split PDF": "splitDownloadBtn",
        "Word → PDF": "wordDownloadBtn",
        "PDF → Word": "pdfWordDownloadBtn"
    }

    if (label === "Images → PDF") {
        document.getElementById("imageResultFrame").src = url
        document.getElementById("imageResultPreview").classList.remove("hidden")

        const btn = document.getElementById("imageDownloadBtn")
        btn.href = url
        btn.classList.remove("hidden")
        return
    }

    const btnId = map[label]
    if (!btnId) return

    const btn = document.getElementById(btnId)
    if (!btn) return

    btn.href = url
    btn.classList.remove("hidden")
}

/* ===============================
   THEME
================================ */
function toggleTheme() {
    document.body.classList.toggle("light")

    localStorage.setItem(
        "theme",
        document.body.classList.contains("light") ? "light" : "dark"
    )
}

window.addEventListener("DOMContentLoaded", () => {
    if (localStorage.getItem("theme") === "light") {
        document.body.classList.add("light")
    }
})

/* ===============================
   ACTIONS (🔥 USING SAFE FETCH)
================================ */
async function uploadImages() {
    let input = document.getElementById("imageInput")
    if (!input.files.length) return showToast("Select images", "error")

    let formData = new FormData()
    for (let f of input.files) formData.append("files", f)

    showLoader()

    const data = await safeFetchJSON("/enqueue/images-to-pdf", {
        method: "POST",
        body: formData
    })

    if (!data) return hideLoader()

    pollJob(data.job_id, "Images → PDF")
}

async function compressPDF() {
    let file = document.getElementById("compressFile").files[0]
    if (!file) return showToast("Select file", "error")

    let formData = new FormData()
    formData.append("file", file)
    formData.append("level", document.getElementById("compressLevel").value)

    showLoader()

    const data = await safeFetchJSON("/enqueue/compress-pdf", {
        method: "POST",
        body: formData
    })

    if (!data) return hideLoader()

    pollJob(data.job_id, "Compress PDF")
}

async function mergePDF() {
    const input = document.getElementById("mergeFiles")
    if (!input.files.length) return showToast("Select PDFs", "error")

    let formData = new FormData()
    for (let f of input.files) formData.append("files", f)

    showLoader()

    const data = await safeFetchJSON("/enqueue/merge-pdf", {
        method: "POST",
        body: formData
    })

    if (!data) return hideLoader()

    pollJob(data.job_id, "Merge PDFs")
}

async function splitPDF() {
    let file = document.getElementById("splitFile").files[0]
    let page = document.getElementById("splitPage").value

    if (!file || !page) return showToast("Select file & page", "error")

    let formData = new FormData()
    formData.append("file", file)
    formData.append("page", page)

    showLoader()

    const data = await safeFetchJSON("/enqueue/split-pdf", {
        method: "POST",
        body: formData
    })

    if (!data) return hideLoader()

    pollJob(data.job_id, "Split PDF")
}

async function convertWord() {
    let file = document.getElementById("wordFile").files[0]
    if (!file) return showToast("Select file", "error")

    let formData = new FormData()
    formData.append("file", file)

    showLoader()

    const data = await safeFetchJSON("/enqueue/word-to-pdf", {
        method: "POST",
        body: formData
    })

    if (!data) return hideLoader()

    pollJob(data.job_id, "Word → PDF")
}

async function convertPDF() {
    let file = document.getElementById("pdfWordFile").files[0]
    if (!file) return showToast("Select file", "error")

    let formData = new FormData()
    formData.append("file", file)

    showLoader()

    const data = await safeFetchJSON("/enqueue/pdf-to-word", {
        method: "POST",
        body: formData
    })

    if (!data) return hideLoader()

    pollJob(data.job_id, "PDF → Word")
}

/* ===============================
   CLEAR
================================ */
function clearImages() {
    imageInput.value = ""
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
    document.getElementById(id)?.classList.add("hidden")
}