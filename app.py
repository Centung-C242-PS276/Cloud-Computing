import numpy as np
import pandas as pd
from flask import Flask, request, jsonify
from tensorflow.keras.models import load_model
from sklearn.preprocessing import StandardScaler, LabelEncoder

# Inisialisasi Flask
app = Flask(__name__)

# Load model dan konfigurasi preprocessing
model = load_model("model_balita.h5")

# Label encoding untuk jenis kelamin
gender_mapping = {"laki-laki": 1, "perempuan": 0}
label_encoder = LabelEncoder()
label_encoder.fit(["laki-laki", "perempuan"])

# Standarisasi data (gunakan scaler yang sama seperti saat pelatihan)
scaler = StandardScaler()
scaler.fit([[14, 1, 73]])  # Contoh data dummy untuk inisialisasi scaler

# Mapping hasil prediksi
class_labels = ["Normal", "Severely Stunting", "Stunting", "Tinggi"]

@app.route("/", methods=["GET"])
def home():
    return "Hello from Flask on Google Cloud Run!"

@app.route("/predict", methods=["POST"])
def predict():
    try:
        # Ambil data dari request
        data = request.get_json()

        # Validasi input
        umur_bulan = data.get("umur_bulan")
        jenis_kelamin = data.get("jenis_kelamin")
        tinggi = data.get("tinggi")

        if None in [umur_bulan, jenis_kelamin, tinggi]:
            return jsonify({"error": "Input tidak lengkap. Pastikan umur_bulan, jenis_kelamin, dan tinggi diisi!"}), 400

        # Konversi jenis kelamin
        if jenis_kelamin not in gender_mapping:
            return jsonify({"error": "Jenis kelamin harus 'laki-laki' atau 'perempuan'."}), 400
        jenis_kelamin_numeric = gender_mapping[jenis_kelamin]

        # Siapkan data input
        input_data = pd.DataFrame([{
            "umur_bulan": umur_bulan,
            "jenis_kelamin": jenis_kelamin_numeric,
            "tinggi": tinggi
        }])

        # Lakukan scaling
        input_array = scaler.transform(input_data)

        # Prediksi dengan model
        prediction = model.predict(input_array)
        predicted_class_index = np.argmax(prediction[0])
        predicted_class_label = class_labels[predicted_class_index]

        # Respons prediksi
        return jsonify({
            "predicted_class": predicted_class_label,
            "user_input": {
                "umur_bulan": umur_bulan,
                "jenis_kelamin": jenis_kelamin,
                "tinggi": tinggi
            },
            "prediction_raw": prediction[0].tolist()
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)
