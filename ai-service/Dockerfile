# ResQMe AI service — FastAPI + OpenRouter
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8100

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app ./app
RUN useradd --create-home --uid 10001 resqme
USER resqme

EXPOSE 8100
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8100/health', timeout=4).status == 200 else 1)"
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
