FROM python:3.13-slim
LABEL org.opencontainers.image.source="https://github.com/Sawtaytoes/castkit"
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PLAYWRIGHT_BROWSERS_PATH=/opt/browsers
COPY device-client/remote-display/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt && python -m playwright install --with-deps chromium && rm -rf /var/lib/apt/lists/*
COPY device-client/remote-display/ ./
RUN useradd --uid 10001 --create-home display && chmod -R a+rX /opt/browsers
USER display
ENTRYPOINT ["python", "/app/worker.py"]
CMD ["--config", "/config/display.yaml"]
