from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from pdf2docx import Converter
from PIL import Image
from pypdf import PdfReader, PdfWriter

import subprocess
import uuid
import os
import json

app = FastAPI()

UPLOAD_DIR = "uploads"
OUTPUT_DIR = "outputs"

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

app.mount("/static", StaticFiles(directory="static"), name="static")


# =============================
# HOME (🔥 NO JINJA)
# =============================
@app.get("/", response_class=HTMLResponse)
def home():
    with open("templates/index.html", "r", encoding="utf-8") as f:
        return f.read()


# =============================
# IMAGE → PDF
# =============================
@app.post("/images-to-pdf")
async def images_to_pdf(files: list[UploadFile] = File(...)):

    if len(files) == 0:
        raise HTTPException(400, "No images uploaded")

    images = []

    for file in files:
        path = f"{UPLOAD_DIR}/{uuid.uuid4()}_{file.filename}"

        with open(path, "wb") as f:
            f.write(await file.read())

        img = Image.open(path).convert("RGB")
        images.append(img)

    output = f"{OUTPUT_DIR}/{uuid.uuid4()}_images.pdf"
    images[0].save(output, save_all=True, append_images=images[1:])

    return FileResponse(output, media_type="application/pdf", filename="images.pdf")


# =============================
# COMPRESS PDF
# =============================
@app.post("/compress-pdf")
async def compress_pdf(file: UploadFile = File(...), level: str = Form(...)):

    input_path = f"{UPLOAD_DIR}/{uuid.uuid4()}_{file.filename}"
    output_path = f"{OUTPUT_DIR}/{uuid.uuid4()}_compressed.pdf"

    with open(input_path, "wb") as f:
        f.write(await file.read())

    subprocess.run([
        "gs",
        "-sDEVICE=pdfwrite",
        "-dCompatibilityLevel=1.4",
        f"-dPDFSETTINGS={level}",
        "-dNOPAUSE",
        "-dQUIET",
        "-dBATCH",
        f"-sOutputFile={output_path}",
        input_path
    ])

    return FileResponse(output_path, media_type="application/pdf", filename="compressed.pdf")


# =============================
# MERGE PDF
# =============================
@app.post("/merge-pdf")
async def merge_pdf(files: list[UploadFile] = File(...), order: str = Form(...)):

    order_list = json.loads(order)

    temp_paths = []

    for file in files:
        path = f"{UPLOAD_DIR}/{uuid.uuid4()}_{file.filename}"
        with open(path, "wb") as f:
            f.write(await file.read())
        temp_paths.append(path)

    writer = PdfWriter()

    for item in order_list:
        reader = PdfReader(temp_paths[item["fileIndex"]])
        writer.add_page(reader.pages[item["pageIndex"]])

    output = f"{OUTPUT_DIR}/{uuid.uuid4()}_merged.pdf"

    with open(output, "wb") as f:
        writer.write(f)

    return FileResponse(output, media_type="application/pdf", filename="merged.pdf")


# =============================
# SPLIT PDF
# =============================
@app.post("/split-pdf")
async def split_pdf(file: UploadFile = File(...), page: int = Form(...)):

    path = f"{UPLOAD_DIR}/{uuid.uuid4()}_{file.filename}"

    with open(path, "wb") as f:
        f.write(await file.read())

    reader = PdfReader(path)

    if page < 1 or page > len(reader.pages):
        raise HTTPException(400, "Invalid page number")

    writer = PdfWriter()
    writer.add_page(reader.pages[page - 1])

    output = f"{OUTPUT_DIR}/{uuid.uuid4()}_split.pdf"

    with open(output, "wb") as f:
        writer.write(f)

    return FileResponse(output, media_type="application/pdf", filename="split.pdf")


# =============================
# WORD → PDF
# =============================
@app.post("/word-to-pdf")
async def word_to_pdf(file: UploadFile = File(...)):

    input_path = f"{UPLOAD_DIR}/{uuid.uuid4()}_{file.filename}"

    with open(input_path, "wb") as f:
        f.write(await file.read())

    try:
        result = subprocess.run([
            "soffice",
            "--headless",
            "--convert-to", "pdf",
            "--outdir", OUTPUT_DIR,
            input_path
        ], capture_output=True, text=True)

        if result.returncode != 0:
            raise Exception(result.stderr)

    except Exception as e:
        raise HTTPException(500, f"LibreOffice error: {str(e)}")

    # 🔥 Find actual output file (robust way)
    files = os.listdir(OUTPUT_DIR)
    pdf_files = [f for f in files if f.endswith(".pdf")]

    if not pdf_files:
        raise HTTPException(500, "PDF not generated")

    latest_file = max(
        [os.path.join(OUTPUT_DIR, f) for f in pdf_files],
        key=os.path.getctime
    )

    return FileResponse(latest_file, media_type="application/pdf", filename="converted.pdf")
# =============================
# PDF → WORD
# =============================
@app.post("/pdf-to-word")
async def pdf_to_word(file: UploadFile = File(...)):

    input_path = f"{UPLOAD_DIR}/{uuid.uuid4()}_{file.filename}"
    output_path = f"{OUTPUT_DIR}/{uuid.uuid4()}_converted.docx"

    with open(input_path, "wb") as f:
        f.write(await file.read())

    cv = Converter(input_path)
    cv.convert(output_path)
    cv.close()

    return FileResponse(
        output_path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename="converted.docx"
    )
