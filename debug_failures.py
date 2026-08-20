#!/usr/bin/env python3
"""
Debug specific API failures
"""

import requests
import json

BASE_URL = "https://staff-manager-171.preview.emergentagent.com/api"

USER_CREDENTIALS = {
    "email": "testuser@test.com", 
    "password": "test123456"
}

def debug_failures():
    session = requests.Session()
    
    # Login first
    print("🔐 Logging in...")
    response = session.post(f"{BASE_URL}/auth/signin", json=USER_CREDENTIALS)
    if response.status_code != 200:
        print(f"❌ Login failed: {response.status_code}")
        return
    
    print("✅ Login successful")
    
    # Debug settings update
    print("\n🔧 Testing settings update...")
    update_data = {"currency": "EUR", "theme": "dark"}
    response = session.post(f"{BASE_URL}/settings", json=update_data)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")
    
    # Debug product creation
    print("\n📦 Testing product creation...")
    new_product = {
        "name": "Test Product",
        "description": "Test product description", 
        "price": 29.99,
        "is_active": True,
        "stock_quantity": 100
    }
    response = session.post(f"{BASE_URL}/products", json=new_product)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")
    
    # Debug signout
    print("\n🚪 Testing signout...")
    response = session.post(f"{BASE_URL}/auth/signout")
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")

if __name__ == "__main__":
    debug_failures()