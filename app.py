import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel
from tensorflow.keras.models import load_model
from sklearn.preprocessing import StandardScaler, LabelEncoder
import logging

# Create a logger
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Create a file handler and a stream handler
file_handler = logging.FileHandler("app.log")
stream_handler = logging.StreamHandler()

# Create a formatter and set it for the handlers
formatter = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
file_handler.setFormatter(formatter)
stream_handler.setFormatter(formatter)

# Add the handlers to the logger
logger.addHandler(file_handler)
logger.addHandler(stream_handler)

# Initialize FastAPI
app = FastAPI()

# Load model and preprocessing configuration
model = load_model("model_balita.h5")

# Label encoding for gender
gender_mapping = {"laki-laki": 1, "perempuan": 0}
label_encoder = LabelEncoder()
label_encoder.fit(["laki-laki", "perempuan"])

# Standardization (use the same scaler as during training)
scaler = StandardScaler()
scaler.fit([[14, 1, 73]])  # Example dummy data for scaler initialization

# Class labels for predictions
class_labels = ["Normal", "Severely Stunting", "Stunting", "Tinggi"]

# Input schema
class PredictionInput(BaseModel):
    umur_bulan: int
    jenis_kelamin: str
    tinggi: float


@app.get("/")
def read_root():
    return {"message": "Hello from FastAPI on Google Cloud Run!"}


@app.post("/predict")
def predict(data: PredictionInput):
    try:
        logger.info("Received request with data: %s", data.dict())

        # Validate gender
        if data.jenis_kelamin not in gender_mapping:
            logger.error("Jenis kelamin harus 'laki-laki' atau 'perempuan'.")
            raise HTTPException(status_code=400, detail="Jenis kelamin harus 'laki-laki' atau 'perempuan'.")

        # Convert gender to numeric
        jenis_kelamin_numeric = gender_mapping[data.jenis_kelamin]

        # Prepare input data
        input_data = pd.DataFrame([{
            "umur_bulan": data.umur_bulan,
            "jenis_kelamin": jenis_kelamin_numeric,
            "tinggi": data.tinggi
        }])

        # Scale input data
        input_array = scaler.transform(input_data)

        # Predict with the model
        prediction = model.predict(input_array)
        predicted_class_index = np.argmax(prediction[0])
        predicted_class_label = class_labels[predicted_class_index]

        logger.info("Prediction result: %s", predicted_class_label)

        # Return response
        return {
            "prediction_raw": prediction[0].tolist(),
            "predicted_class": predicted_class_label
        }

    except Exception as e:
        logger.error("Error occurred: %s", str(e))
        raise HTTPException(status_code=500, detail=f"An error occurred: {str(e)}")
