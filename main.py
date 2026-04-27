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

print("LibreOffice:", LIBREOFFICE)
print("Ghostscript:", GHOSTSCRIPT)

if not LIBREOFFICE:
    raise Exception("LibreOffice NOT FOUND")

if not GHOSTSCRIPT:
    raise Exception("Ghostscript NOT FOUND")

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
# RATE LIMIT
# =============================
RATE_LIMIT = {}
MAX_REQUESTS = 10
WINDOW = 60

def check_rate_limit(ip):
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
# UPDATE PROGRESS
# =============================
def update_progress(job_id, value):
    with lock:
        if job_id in jobs:
            jobs[job_id]["progress"] = value

# =============================
# WORKER THREAD
# =============================
def worker():
    while True:
        job = job_queue.get()

        job_id = job["id"]
        func = job["func"]
        args = job["args"]

        try:
            output = func(job_id, *args)

            with lock:
                jobs[job_id]["status"] = "completed"
                jobs[job_id]["progress"] = 100
                jobs[job_id]["file"] = output
                jobs[job_id]["download_url"] = f"/download/{job_id}"

        except Exception as e:
            with lock:
                jobs[job_id]["status"] = "failed"
                jobs[job_id]["error"] = str(e)

        job_queue.task_done()

# start workers
for _ in range(2):  # keep low for Render
    threading.Thread(target=worker, daemon=True).start()

# =============================
# HOME
# =============================
@app.get("/")
def home(request: Request):
    try:
        return templates.TemplateResponse("index.html", {"request": request})
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)})

# =============================
# PROCESS FUNCTIONS
# =============================
def process_word(job_id, path):
    update_progress(job_id, 20)

    result = subprocess.run([
        LIBREOFFICE,
        "--headless",
        "--convert-to", "pdf",
        "--outdir", OUTPUT_DIR,
        path
    ], capture_output=True)

    if result.returncode != 0:
        raise Exception(result.stderr.decode())

    update_progress(job_id, 80)

    output = os.path.join(
        OUTPUT_DIR,
        os.path.splitext(os.path.basename(path))[0] + ".pdf"
    )

    if not os.path.exists(output):
        raise Exception("PDF not created")

    return output


def process_compress(job_id, path, level):
    update_progress(job_id, 30)

    output = f"{OUTPUT_DIR}/{uuid.uuid4()}.pdf"

    result = subprocess.run([
        GHOSTSCRIPT,
        "-sDEVICE=pdfwrite",
        "-dCompatibilityLevel=1.4",
        f"-dPDFSETTINGS={level}",
        "-dNOPAUSE",
        "-dQUIET",
        "-dBATCH",
        f"-sOutputFile={output}",
        path
    ], capture_output=True)

    if result.returncode != 0:
        raise Exception(result.stderr.decode())

    return output


def process_pdf_to_word(job_id, path):
    update_progress(job_id, 30)

    output = f"{OUTPUT_DIR}/{uuid.uuid4()}.docx"

    cv = Converter(path)
    cv.convert(output)
    cv.close()

    return output


# =============================
# ENQUEUE
# =============================
def add_job(job_id, func, args):
    job_queue.put({
        "id": job_id,
        "func": func,
        "args": args
    })


@app.post("/enqueue/word-to-pdf")
async def enqueue_word(request: Request, file: UploadFile = File(...)):
    if not check_rate_limit(request.client.host):
        raise HTTPException(429, "Too many requests")

    job_id = str(uuid.uuid4())
    path = save_file(file)

    jobs[job_id] = {"status": "processing", "progress": 0}

    add_job(job_id, process_word, (path,))

    return {"job_id": job_id}


@app.post("/enqueue/compress-pdf")
async def enqueue_compress(request: Request, file: UploadFile = File(...), level: str = Form(...)):
    if not check_rate_limit(request.client.host):
        raise HTTPException(429, "Too many requests")

    job_id = str(uuid.uuid4())
    path = save_file(file)

    jobs[job_id] = {"status": "processing", "progress": 0}

    add_job(job_id, process_compress, (path, level))

    return {"job_id": job_id}


@app.post("/enqueue/pdf-to-word")
async def enqueue_pdf(request: Request, file: UploadFile = File(...)):
    if not check_rate_limit(request.client.host):
        raise HTTPException(429, "Too many requests")

    job_id = str(uuid.uuid4())
    path = save_file(file)

    jobs[job_id] = {"status": "processing", "progress": 0}

    add_job(job_id, process_pdf_to_word, (path,))

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
