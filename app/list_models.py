import os
from dotenv import load_dotenv
from google import genai

def list_live_models():
    load_dotenv()
    client = genai.Client()
    for model in client.models.list():
        methods = getattr(model, "supported_generation_methods", [])
        if methods and "bidiGenerateContent" in methods:
            print(f"bidiGenerateContent SUPPORTED = {model.name}")

if __name__ == "__main__":
    list_live_models()
