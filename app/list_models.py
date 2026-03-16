import os
from dotenv import load_dotenv
from google import genai

def list_live_models():
    load_dotenv()
    client = genai.Client()
    for model in client.models.list():
        print(model.name)

if __name__ == "__main__":
    list_live_models()
