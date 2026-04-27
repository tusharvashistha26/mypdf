from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles

from pdf2docx import Converter
from PIL import Image
from pypdf import PdfReader, PdfWriter

import subprocess
import os
import uuid
import shutil
import threading
import queue
import time

# =============================
# AUTO DETECT BINARIES (IMPORTANT)
# =============================
LIBREOFFICE = shutil.which("libreoffice") or shutil.which("soffice")
GHOSTSCRIPT = shutil.which("gs")

print("LibreOffice Path:", LIBREOFFICE)
print("Ghostscript Path:", GHOSTSCRIPT)

# =============================
# APP INIT
# =============================
app = FastAPI()

templates = Jinja2Templates(directory="templates")

UPLOAD_DIR = "uploads"
OUTPUT_DIR = "outputs"

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

app.mount("/static", StaticFiles(directory="static"), name="static")

jobs = {}
lock = threading.Lock()
job_queue = queue.Queue()

# =============================
# RATE LIMIT (FIXED)
# =============================
RATE_LIMIT = {}
MAX_REQUESTS = 10
WINDOW = 60

def check_rate_limit(ip):
    ip = str(ip)  # ✅ FIX

    now = time.time()

    if ip not in RATE_LIMIT:
        RATE_LIMIT[ip] = []

    RATE_LIMIT[ip] = [t for t in RATE_LIMIT[ip] if now - t < WINDOW]

    if len(RATE_LIMIT[ip]) >= MAX_REQUESTS:
        return False

    RATE_LIMIT[ip].append(now)
    return True

# =============================
# SAVE FILE
# =============================
def save_file(file: UploadFile):
    path = f"{UPLOAD_DIR}/{uuid.uuid4()}_{file.filename}"
    with open(path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return path

# =============================
# PROGRESS UPDATE
# =============================
def update_progress(job_id, value):
    with lock:
        if job_id in jobs:
            jobs[job_id]["progress"] = value

# =============================
# WORKER QUEUE
# =============================
def worker():
    while True:
        job_id, func, args = job_queue.get()

        try:
            output = func(job_id, *args)

            with lock:
                jobs[job_id] = {
                    "status": "completed",
                    "progress": 100,
                    "file": output,
                    "download_url": f"/download/{job_id}"
                }

        except Exception as e:
            print("ERROR:", str(e))
            with lock:
                jobs[job_id] = {
                    "status": "failed",
                    "message": str(e)
                }

        job_queue.task_done()

# start workers
for _ in range(3):
    threading.Thread(target=worker, daemon=True).start()

# =============================
# HOME
# =============================
@app.get("/")
def home(request: Request):
    return templates.TemplateResponse(request=request, name="index.html", context={"request": request})

# =============================
# PROCESS FUNCTIONS
# =============================
def process_word(job_id, path):
    if not LIBREOFFICE:
        raise Exception("LibreOffice not installed")

    update_progress(job_id, 20)

    cmd = [
        LIBREOFFICE,
        "--headless",
        "--convert-to", "pdf",
        "--outdir", OUTPUT_DIR,
        path
    ]

    print("Running:", cmd)

    result = subprocess.run(cmd, capture_output=True, text=True)

    print("STDERR:", result.stderr)

    if result.returncode != 0:
        raise Exception(result.stderr or "LibreOffice failed")

    output = os.path.join(
        OUTPUT_DIR,
        os.path.splitext(os.path.basename(path))[0] + ".pdf"
    )

    if not os.path.exists(output):
        raise Exception("PDF not generated")

    update_progress(job_id, 100)
    return output


def process_compress(job_id, path, level):
    if not GHOSTSCRIPT:
        raise Exception("Ghostscript not installed")

    update_progress(job_id, 30)

    output = f"{OUTPUT_DIR}/{uuid.uuid4()}.pdf"

    cmd = [
        GHOSTSCRIPT,
        "-sDEVICE=pdfwrite",
        "-dCompatibilityLevel=1.4",
        f"-dPDFSETTINGS={level}",
        "-dNOPAUSE",
        "-dQUIET",
        "-dBATCH",
        f"-sOutputFile={output}",
        path
    ]

    print("Running:", cmd)

    result = subprocess.run(cmd, capture_output=True, text=True)

    print("STDERR:", result.stderr)

    if result.returncode != 0:
        raise Exception(result.stderr or "Ghostscript failed")

    return output


def process_pdf_to_word(job_id, path):
    update_progress(job_id, 30)

    output = f"{OUTPUT_DIR}/{uuid.uuid4()}.docx"

    cv = Converter(path)
    cv.convert(output)
    cv.close()

    return output


# =============================
# ENQUEUE APIs
# =============================
@app.post("/enqueue/word-to-pdf")
async def enqueue_word(request: Request, file: UploadFile = File(...)):
    ip = request.headers.get("x-forwarded-for") or (
        request.client.host if request.client else "anonymous"
    )
    ip = str(ip)

    if not check_rate_limit(ip):
        raise HTTPException(429, "Too many requests")

    job_id = str(uuid.uuid4())
    path = save_file(file)

    jobs[job_id] = {"status": "processing", "progress": 0}

    job_queue.put((job_id, process_word, (path,)))

    return {"job_id": job_id}


@app.post("/enqueue/compress-pdf")
async def enqueue_compress(request: Request, file: UploadFile = File(...), level: str = Form(...)):
    ip = request.headers.get("x-forwarded-for") or (
        request.client.host if request.client else "anonymous"
    )
    ip = str(ip)

    if not check_rate_limit(ip):
        raise HTTPException(429, "Too many requests")

    job_id = str(uuid.uuid4())
    path = save_file(file)

    jobs[job_id] = {"status": "processing", "progress": 0}

    job_queue.put((job_id, process_compress, (path, level)))

    return {"job_id": job_id}


@app.post("/enqueue/pdf-to-word")
async def enqueue_pdf(request: Request, file: UploadFile = File(...)):
    ip = request.headers.get("x-forwarded-for") or (
        request.client.host if request.client else "anonymous"
    )
    ip = str(ip)

    if not check_rate_limit(ip):
        raise HTTPException(429, "Too many requests")

    job_id = str(uuid.uuid4())
    path = save_file(file)

    jobs[job_id] = {"status": "processing", "progress": 0}

    job_queue.put((job_id, process_pdf_to_word, (path,)))

    return {"job_id": job_id}


# =============================
# STATUS
# =============================
@app.get("/job-status/{job_id}")
def job_status(job_id: str):
    return JSONResponse(jobs.get(job_id, {"status": "not_found"}))


# =============================
# DOWNLOAD
# =============================
@app.get("/download/{job_id}")
def download(job_id: str):
    job = jobs.get(job_id)

    if not job or job["status"] != "completed":
        raise HTTPException(400, "Not ready")

    return FileResponse(job["file"], filename=os.path.basename(job["file"]))


# =============================
# GLOBAL ERROR HANDLER
# =============================
@app.exception_handler(Exception)
def global_exception(request: Request, exc: Exception):
    print("GLOBAL ERROR:", str(exc))
    return JSONResponse(
        status_code=500,
        content={"status": "error", "message": str(exc)}
    )
