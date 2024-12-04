*  *
docker buildx build -t gcr.io/capstone-project-centung/api-model-centung .

docker push gcr.io/capstone-project-centung/api-model-centung

gcloud run deploy api-model-ml /
--image gcr.io/capstone-project-centung/api-model-centung /
--platform managed /
--region asia-southeast1 /
--allow-unauthenticated /
--project=capstone-project-centung

API Model Endpoint
https://coba-flask-254069370868.asia-southeast1.run.app/

Perhitungan 
- url 
	/predict

- method 
	- POST

- Request Body (raw)
	{
   		 "umur_bulan": 14 (int),
   		 "jenis_kelamin": "laki-laki"(string),
   		 "tinggi": 73(float)
	}

- Response JSON
	{
    "predicted_class": "Tinggi",
    "prediction_raw": [
        0.0,
        0.0,
        0.0,
        1.0
    ],
    "user_input": {
        "jenis_kelamin": "laki-laki",
        "tinggi": 120,
        "umur_bulan": 18
    }
}
