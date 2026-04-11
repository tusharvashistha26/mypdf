from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks, Request
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles

from pdf2docx import Converter
from PIL import Image
from pypdf import PdfReader, PdfWriter

import subprocess
import os
import uuid
import platform

app = FastAPI()

templates = Jinja2Templates(directory="templates")

UPLOAD_DIR = "uploads"
OUTPUT_DIR = "outputs"

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

app.mount("/static", StaticFiles(directory="static"), name="static")

jobs = {}

# =============================
# SYSTEM DETECTION
# =============================
IS_WINDOWS = platform.system() == "Windows"

GS_CMD = "gswin64c" if IS_WINDOWS else "gs"
LIBRE_CMD = (
    r"C:\Program Files\LibreOffice\program\soffice.exe"
    if IS_WINDOWS else "libreoffice"
)

# =============================
# HOME
# =============================
@app.get("/")
def home(request: Request):
    try:
        return templates.TemplateResponse(request=request, name="index.html")
    except TypeError:
        return templates.TemplateResponse("index.html", {"request": request})


# =============================
# JOB RUNNER
# =============================
def run_job(job_id, func, *args):
    try:
        print(f"Running job: {job_id}")

        output_path = func(*args)

        if not os.path.exists(output_path):
            raise Exception("Output file missing")

        jobs[job_id] = {
            "status": "completed",
            "file": output_path,
            "download_url": f"/download/{job_id}"
        }

    except Exception as e:
        print("ERROR:", str(e))
        jobs[job_id] = {
            "status": "failed",
            "message": str(e)
        }


# =============================
# PROCESS FUNCTIONS
# =============================

def process_images(paths):
    images = [Image.open(p).convert("RGB") for p in paths]

    output = f"{OUTPUT_DIR}/{uuid.uuid4()}.pdf"
    images[0].save(output, save_all=True, append_images=images[1:])

    return output


def process_compress(path, level):
    output = f"{OUTPUT_DIR}/{uuid.uuid4()}.pdf"

    try:
        result = subprocess.run([
            GS_CMD,
            "-sDEVICE=pdfwrite",
            "-dCompatibilityLevel=1.4",
            f"-dPDFSETTINGS={level}",
            "-dNOPAUSE",
            "-dQUIET",
            "-dBATCH",
            f"-sOutputFile={output}",
            path
        ], capture_output=True, text=True)

    except FileNotFoundError:
        raise Exception("Ghostscript not installed or not in PATH")

    if result.returncode != 0:
        raise Exception(result.stderr or "Compression failed")

    return output


def process_merge(paths):
    writer = PdfWriter()

    for p in paths:
        reader = PdfReader(p)
        for page in reader.pages:
            writer.add_page(page)

    output = f"{OUTPUT_DIR}/{uuid.uuid4()}.pdf"

    with open(output, "wb") as f:
        writer.write(f)

    return output


def process_split(path, page):
    reader = PdfReader(path)

    if page < 1 or page > len(reader.pages):
        raise Exception("Invalid page number")

    writer = PdfWriter()
    writer.add_page(reader.pages[page - 1])

    output = f"{OUTPUT_DIR}/{uuid.uuid4()}.pdf"

    with open(output, "wb") as f:
        writer.write(f)

    return output


def process_word(path):
    try:
        result = subprocess.run([
            LIBRE_CMD,
            "--headless",
            "--convert-to", "pdf",
            "--outdir", OUTPUT_DIR,
            path
        ], capture_output=True, text=True)

    except FileNotFoundError:
        raise Exception("LibreOffice not installed")

    output = os.path.join(
        OUTPUT_DIR,
        os.path.splitext(os.path.basename(path))[0] + ".pdf"
    )

    if not os.path.exists(output):
        raise Exception(result.stderr or "Word → PDF failed")

    return output


def process_pdf_to_word(path):
    output = f"{OUTPUT_DIR}/{uuid.uuid4()}.docx"

    cv = Converter(path)
    cv.convert(output)
    cv.close()

    return output


# =============================
# ENQUEUE APIs
# =============================

def save_file(file: UploadFile):
    path = f"{UPLOAD_DIR}/{uuid.uuid4()}_{file.filename}"
    with open(path, "wb") as f:
        f.write(file.file.read())
    return path


@app.post("/enqueue/images-to-pdf")
async def enqueue_images(background_tasks: BackgroundTasks, files: list[UploadFile] = File(...)):
    job_id = str(uuid.uuid4())

    paths = [save_file(file) for file in files]

    jobs[job_id] = {"status": "processing"}
    background_tasks.add_task(run_job, job_id, process_images, paths)

    return {"job_id": job_id}


@app.post("/enqueue/compress-pdf")
async def enqueue_compress(background_tasks: BackgroundTasks, file: UploadFile = File(...), level: str = Form(...)):
    job_id = str(uuid.uuid4())

    path = save_file(file)

    jobs[job_id] = {"status": "processing"}
    background_tasks.add_task(run_job, job_id, process_compress, path, level)

    return {"job_id": job_id}


@app.post("/enqueue/merge-pdf")
async def enqueue_merge(background_tasks: BackgroundTasks, files: list[UploadFile] = File(...)):
    job_id = str(uuid.uuid4())

    paths = [save_file(file) for file in files]

    jobs[job_id] = {"status": "processing"}
    background_tasks.add_task(run_job, job_id, process_merge, paths)

    return {"job_id": job_id}


@app.post("/enqueue/split-pdf")
async def enqueue_split(background_tasks: BackgroundTasks, file: UploadFile = File(...), page: int = Form(...)):
    job_id = str(uuid.uuid4())

    path = save_file(file)

    jobs[job_id] = {"status": "processing"}
    background_tasks.add_task(run_job, job_id, process_split, path, page)

    return {"job_id": job_id}


@app.post("/enqueue/word-to-pdf")
async def enqueue_word(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    job_id = str(uuid.uuid4())

    path = save_file(file)

    jobs[job_id] = {"status": "processing"}
    background_tasks.add_task(run_job, job_id, process_word, path)

    return {"job_id": job_id}


@app.post("/enqueue/pdf-to-word")
async def enqueue_pdf(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    job_id = str(uuid.uuid4())

    path = save_file(file)

    jobs[job_id] = {"status": "processing"}
    background_tasks.add_task(run_job, job_id, process_pdf_to_word, path)

    return {"job_id": job_id}


# =============================
# STATUS
# =============================
@app.get("/job-status/{job_id}")
def job_status(job_id: str):
    return jobs.get(job_id, {"status": "not_found"})


# =============================
# DOWNLOAD
# =============================
@app.get("/download/{job_id}")
def download(job_id: str):
    job = jobs.get(job_id)

    if not job or job["status"] != "completed":
        raise HTTPException(400, "Not ready")

    return FileResponse(
        job["file"],
        media_type="application/octet-stream",
        filename=os.path.basename(job["file"])
    )


# =============================
# ERROR PAGES
# =============================
@app.exception_handler(404)
def not_found(request, exc):
    return HTMLResponse("<h1>404 - Page Not Found</h1>", status_code=404)


@app.exception_handler(500)
def server_error(request, exc):
    return HTMLResponse("<h1>500 - Server Error</h1>", status_code=500)