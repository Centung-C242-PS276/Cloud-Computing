# Gunakan image Python sebagai base
FROM python:latest
# Gunakan TensorFlow resmi sebagai base image
FROM tensorflow/tensorflow:latest

# Atur direktori kerja
WORKDIR /app

# Salin file ke dalam container
COPY requirements.txt requirements.txt

# Perbarui pip dan instal dependensi tambahan
RUN pip install --upgrade pip && pip install --ignore-installed --no-cache-dir -r requirements.txt

# 5. Salin semua file dari proyek ke dalam container
COPY . .

# 6. Tentukan port yang akan digunakan
EXPOSE 8080

# Jalankan aplikasi Flask menggunakan Gunicorn
CMD ["gunicorn", "-b", "0.0.0.0:8080", "app:app"]
