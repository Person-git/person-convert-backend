FROM python:3.11-slim

# mupdf-tools 提供 mutool,用於 PDF -> SVG
# ghostscript 提供 gs,用於 PDF 壓縮
RUN apt-get update && apt-get install -y --no-install-recommends \
    mupdf-tools \
    ghostscript \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

# Render 會注入 PORT 環境變數
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
