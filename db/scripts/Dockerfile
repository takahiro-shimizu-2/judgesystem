FROM python:3.12-slim
WORKDIR /app
COPY db/scripts/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY db/scripts/fetch_partners_from_sheets.py ./fetch_partners_from_sheets.py
ENTRYPOINT ["python", "fetch_partners_from_sheets.py"]
