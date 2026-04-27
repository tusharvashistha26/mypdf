FROM python:3.11-slim

RUN apt-get update && apt-get install -y \
    libreoffice \
    ghostscript \
    poppler-utils \
    fonts-dejavu \
    libglib2.0-0 \
    libsm6 \
    libxrender1 \
    libxext6 \
    && apt-get clean

WORKDIR /app

COPY . .

RUN pip install --no-cache-dir -r requirements.txt

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "10001"]