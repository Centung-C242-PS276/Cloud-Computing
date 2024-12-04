FROM python:latest

FROM tensorflow/tensorflow:latest

WORKDIR /app

COPY requirements.txt requirements.txt

RUN pip install --upgrade pip && pip install --ignore-installed --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8080

CMD ["gunicorn", "-b", "0.0.0.0:8080", "app:app"]
