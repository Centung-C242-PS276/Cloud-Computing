import os
import requests
import uuid
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import numpy as np
import pandas as pd
import tensorflow as tf
from sklearn.preprocessing import StandardScaler, LabelEncoder
from google.cloud import firestore
from fastapi import Form

# Variabel untuk URL model
MODEL_URL = os.getenv("MODEL_URL", "https://storage.googleapis.com/coba-model-ml/model_ml_centung/model_balita.h5")
MODEL_PATH = "app/model_balita.h5"

# Fungsi untuk mengunduh model
def download_model():
    try:
        print(f"Downloading model from {MODEL_URL}...")
        response = requests.get(MODEL_URL)
        response.raise_for_status()
        with open(MODEL_PATH, "wb") as file:
            file.write(response.content)
        print("Model downloaded successfully.")
    except Exception as e:
        print(f"Failed to download model: {e}")
        raise

# Inisialisasi aplikasi
app = FastAPI()

# Unduh model saat aplikasi dimulai
download_model()

# Load model TensorFlow
model = tf.keras.models.load_model(MODEL_PATH)

# Inisialisasi scaler dan label encoder
scaler = StandardScaler()
scaler.mean_ = [24.0, 0.5, 80.0]
scaler.scale_ = [12.0, 1.0, 10.0]

label_encoder = LabelEncoder()
label_encoder.classes_ = np.array(["Laki-Laki", "Perempuan"])

# Hanya dua label output yang akan digunakan
class_labels = ["Stunting", "Normal"]

# Setup Firestore client
db = firestore.Client()

# Model untuk menerima input data
class InputData(BaseModel):
    umur_bulan: int
    jenis_kelamin: str
    tinggi: float

@app.get("/")
async def home():
    return {"message": "FastAPI is running! Send a POST request to /predict for prediction."}

@app.post("/predict")
async def predicts(
    umur_bulan: int = Form(...),
    jenis_kelamin: str = Form(...),
    tinggi: float = Form(...)
):
    try:
        # Konversi data ke dalam format yang diharapkan
        input_data = InputData(
            umur_bulan=umur_bulan,
            jenis_kelamin=jenis_kelamin,
            tinggi=tinggi
        )
        
        # Generate a unique UUID for the request
        request_uuid = str(uuid.uuid4())  # UUID tambahan untuk request
        prediction_id = str(uuid.uuid4())  # UUID untuk prediksi
        
        # Prepare input data for prediction
        input_df = pd.DataFrame([input_data.dict()])
        input_df['jenis_kelamin'] = label_encoder.transform(input_df['jenis_kelamin'])
        input_df = input_df[["umur_bulan", "jenis_kelamin", "tinggi"]]
        input_scaled = scaler.transform(input_df)
        
        # Get the prediction from the model
        predictions = model.predict(input_scaled)
        predicted_class_index = np.argmax(predictions)
        predicted_class_label = class_labels[predicted_class_index]
        
        # Prepare response data in desired format
        response_data = {
            "prediction_id": prediction_id,
            "hasil_klasifikasi": predicted_class_label,
            "berdasarkan": {
                "jenis_kelamin": input_data.jenis_kelamin,
                "tinggi_badan": f"{input_data.tinggi} cm",
                "umur": f"{input_data.umur_bulan} bulan"
            }
        }
        
        # Store prediction in Firestore
        prediction_ref = db.collection("predictions").document(prediction_id)
        prediction_ref.set({
            "request_uuid": request_uuid,  # UUID tambahan untuk request
            "input_data": input_data.dict(),
            "response_data": response_data,
            "timestamp": firestore.SERVER_TIMESTAMP
        })
        
        return response_data
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# Endpoint untuk melihat label klasifikasi
@app.get("/class_labels")
async def get_class_labels():
    return {"class_labels": class_labels}

# Endpoint untuk melihat informasi scaler
@app.get("/scaler_info")
async def get_scaler_info():
    return {
        "mean": scaler.mean_.tolist(),
        "scale": scaler.scale_.tolist()
    }

# Endpoint untuk melihat deskripsi model
@app.get("/model_summary")
async def get_model_summary():
    try:
        # Menyimpan summary model ke string
        stringlist = []
        model.summary(print_fn=lambda x: stringlist.append(x))
        summary = "\n".join(stringlist)
        return {"model_summary": summary}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Menentukan host dan port saat menjalankan aplikasi
if __name__ == "__main__":
    import uvicorn

    # Gunakan port dari variabel lingkungan (default 8080 untuk Cloud Run)
    port = int(os.getenv("PORT", 8080))
    uvicorn.run("app:app", host="0.0.0.0", port=port)
