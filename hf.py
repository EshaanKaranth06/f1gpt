import requests
import os

# Replace with your actual token or set via environment variable
HF_TOKEN = os.getenv("HF_TOKEN", "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")

def check_token(token):
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get("https://huggingface.co/api/whoami-v2", headers=headers)

    if response.status_code == 200:
        data = response.json()
        print("✅ Token is valid!")
        print(f"👤 Username: {data.get('name')}")
        print(f"📦 HF Org: {data.get('orgs')}")
        print(f"🔧 Can use Inference API: {data.get('can_use_inference_api')}")
    elif response.status_code == 401:
        print("❌ Invalid token (401 Unauthorized).")
    else:
        print(f"⚠️ Unexpected response: {response.status_code}")
        print(response.text)

if __name__ == "__main__":
    check_token(HF_TOKEN)
