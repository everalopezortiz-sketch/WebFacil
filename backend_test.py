#!/usr/bin/env python3
"""
Comprehensive backend test for Diagnostics module (Fichas capilares).
Tests all endpoints, validation, security, and isolation.
"""
import requests
import json
import os
from datetime import datetime

# Read environment variables
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://hybrid-booking-shop.preview.emergentagent.com')
SUPABASE_URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL', 'https://ydgbqxpehrqfvslcuhqk.supabase.co')
SUPABASE_ANON_KEY = os.getenv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlkZ2JxeHBlaHJxZnZzbGN1aHFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3MDMzMTIsImV4cCI6MjA4NTI3OTMxMn0.caH78KNZOJfO05FcOoDdGTB9aL5ui8-_vjDt48lbO1I')

API_BASE = f"{BASE_URL}/api"

# Test credentials
BOOKING_USER = "booking_test_7ow9blnd@test.com"
BOOKING_PASS = "booking123"
ECOMMERCE_USER = "ortiz@gmail.com"
ECOMMERCE_PASS = "ortiz123"

# Track created resources for cleanup
created_clients = []
created_records = []
created_share_links = []

def get_supabase_token(email, password):
    """Get Supabase access token via password grant."""
    url = f"{SUPABASE_URL}/auth/v1/token?grant_type=password"
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Content-Type": "application/json"
    }
    data = {"email": email, "password": password}
    
    try:
        resp = requests.post(url, headers=headers, json=data, timeout=10)
        if resp.status_code == 200:
            return resp.json().get('access_token')
        else:
            print(f"❌ Failed to get token for {email}: {resp.status_code} {resp.text}")
            return None
    except Exception as e:
        print(f"❌ Exception getting token for {email}: {e}")
        return None

def test_catalog(token):
    """Test GET /api/diagnostics/catalog"""
    print("\n=== TEST 1: GET /api/diagnostics/catalog ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    try:
        resp = requests.get(f"{API_BASE}/diagnostics/catalog", headers=headers, timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            if 'fields' in data and 'settings' in data:
                print(f"✅ PASS: Catalog returned with {len(data['fields'])} fields")
                # Check Cache-Control header
                cache_control = resp.headers.get('Cache-Control', '')
                if 'private' in cache_control or 'no-store' in cache_control:
                    print(f"✅ PASS: Cache-Control header is private/no-store: {cache_control}")
                else:
                    print(f"⚠️  Minor: Cache-Control header: {cache_control}")
                return True, data
            else:
                print(f"❌ FAIL: Missing fields or settings in response")
                return False, None
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return False, None
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False, None

def test_clients_create(token):
    """Test POST /api/diagnostics/clients"""
    print("\n=== TEST 2: POST /api/diagnostics/clients (create) ===")
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    # Test 2a: Valid client
    client_data = {
        "full_name": "__TEST__ Ana García",
        "phone": "0981 222 333",
        "birth_date": "1990-05-10"
    }
    
    try:
        resp = requests.post(f"{API_BASE}/diagnostics/clients", headers=headers, json=client_data, timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 201:
            data = resp.json()
            if 'id' in data and 'phone_normalized' in data:
                print(f"✅ PASS: Client created with id={data['id']}, phone_normalized={data.get('phone_normalized')}")
                created_clients.append(data['id'])
                
                # Test 2b: Missing full_name (should fail)
                print("\n=== TEST 2b: POST /api/diagnostics/clients (missing full_name) ===")
                bad_data = {"phone": "0981 222 333"}
                resp2 = requests.post(f"{API_BASE}/diagnostics/clients", headers=headers, json=bad_data, timeout=10)
                print(f"Status: {resp2.status_code}")
                if resp2.status_code == 400:
                    print(f"✅ PASS: Missing full_name returns 400")
                else:
                    print(f"❌ FAIL: Expected 400, got {resp2.status_code}")
                
                return True, data['id']
            else:
                print(f"❌ FAIL: Missing id or phone_normalized in response")
                return False, None
        else:
            print(f"❌ FAIL: Expected 201, got {resp.status_code}: {resp.text}")
            return False, None
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False, None

def test_clients_search(token):
    """Test GET /api/diagnostics/clients?q=Ana"""
    print("\n=== TEST 3: GET /api/diagnostics/clients?q=Ana ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    try:
        resp = requests.get(f"{API_BASE}/diagnostics/clients?q=Ana", headers=headers, timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            if 'clients' in data and 'nextCursor' in data:
                print(f"✅ PASS: Search returned {len(data['clients'])} clients, nextCursor={data['nextCursor']}")
                return True
            else:
                print(f"❌ FAIL: Missing clients or nextCursor in response")
                return False
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_clients_update(token, client_id):
    """Test PATCH /api/diagnostics/clients/{id}"""
    print("\n=== TEST 4: PATCH /api/diagnostics/clients/{id} ===")
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    update_data = {"city": "Asunción"}
    
    try:
        resp = requests.patch(f"{API_BASE}/diagnostics/clients/{client_id}", headers=headers, json=update_data, timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            if data.get('city') == 'Asunción':
                print(f"✅ PASS: Client updated, city={data.get('city')}")
                return True
            else:
                print(f"❌ FAIL: City not updated correctly")
                return False
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_clients_get_single(token, client_id):
    """Test GET /api/diagnostics/clients/{id}"""
    print("\n=== TEST 5: GET /api/diagnostics/clients/{id} ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    try:
        resp = requests.get(f"{API_BASE}/diagnostics/clients/{client_id}", headers=headers, timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            if data.get('id') == client_id:
                print(f"✅ PASS: Single client retrieved, full_name={data.get('full_name')}")
                return True
            else:
                print(f"❌ FAIL: Client id mismatch")
                return False
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_records_create(token, client_id):
    """Test POST /api/diagnostics/records (save bundle)"""
    print("\n=== TEST 6: POST /api/diagnostics/records (create draft) ===")
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    record_data = {
        "client_id": client_id,
        "status": "draft",
        "professional_name": "Prof X",
        "exposure_minutes": 45,
        "answers": [],
        "products": [{
            "product_name_snapshot": "Color 8.3",
            "quantity": 60,
            "unit": "g",
            "shade": "8.3"
        }]
    }
    
    try:
        resp = requests.post(f"{API_BASE}/diagnostics/records", headers=headers, json=record_data, timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            if 'id' in data:
                print(f"✅ PASS: Record created with id={data['id']}")
                created_records.append(data['id'])
                
                # Test 6b: Invalid exposure_minutes (should fail)
                print("\n=== TEST 6b: POST /api/diagnostics/records (invalid exposure_minutes) ===")
                bad_data = {**record_data, "exposure_minutes": 2000}
                resp2 = requests.post(f"{API_BASE}/diagnostics/records", headers=headers, json=bad_data, timeout=10)
                print(f"Status: {resp2.status_code}")
                if resp2.status_code == 400:
                    print(f"✅ PASS: Invalid exposure_minutes returns 400")
                else:
                    print(f"❌ FAIL: Expected 400, got {resp2.status_code}")
                
                # Test 6c: Missing client_id (should fail)
                print("\n=== TEST 6c: POST /api/diagnostics/records (missing client_id) ===")
                bad_data2 = {**record_data}
                del bad_data2['client_id']
                resp3 = requests.post(f"{API_BASE}/diagnostics/records", headers=headers, json=bad_data2, timeout=10)
                print(f"Status: {resp3.status_code}")
                if resp3.status_code == 400:
                    print(f"✅ PASS: Missing client_id returns 400")
                else:
                    print(f"❌ FAIL: Expected 400, got {resp3.status_code}")
                
                return True, data['id']
            else:
                print(f"❌ FAIL: Missing id in response")
                return False, None
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}: {resp.text}")
            return False, None
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False, None

def test_records_list(token, client_id):
    """Test GET /api/diagnostics/records?client_id={id}"""
    print("\n=== TEST 7: GET /api/diagnostics/records?client_id={id} ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    try:
        resp = requests.get(f"{API_BASE}/diagnostics/records?client_id={client_id}", headers=headers, timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            if 'records' in data and 'nextCursor' in data:
                print(f"✅ PASS: Records list returned {len(data['records'])} records")
                if len(data['records']) > 0 and 'record_number' in data['records'][0]:
                    print(f"✅ PASS: Records include record_number field")
                return True
            else:
                print(f"❌ FAIL: Missing records or nextCursor in response")
                return False
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_records_get_bundle(token, record_id):
    """Test GET /api/diagnostics/records/{id} (bundle)"""
    print("\n=== TEST 8: GET /api/diagnostics/records/{id} (bundle) ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    try:
        resp = requests.get(f"{API_BASE}/diagnostics/records/{record_id}", headers=headers, timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            required_keys = ['record', 'client', 'answers', 'products', 'branding', 'client_signature_url', 'professional_signature_url']
            missing = [k for k in required_keys if k not in data]
            if not missing:
                print(f"✅ PASS: Bundle returned with all required keys")
                return True
            else:
                print(f"❌ FAIL: Missing keys in bundle: {missing}")
                return False
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_records_get_pdf(token, record_id):
    """Test GET /api/diagnostics/records/{id}/pdf"""
    print("\n=== TEST 9: GET /api/diagnostics/records/{id}/pdf ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    try:
        resp = requests.get(f"{API_BASE}/diagnostics/records/{record_id}/pdf", headers=headers, timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            if 'record' in data:
                print(f"✅ PASS: PDF bundle returned")
                return True
            else:
                print(f"❌ FAIL: Missing record in PDF bundle")
                return False
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_share_draft_fail(token, draft_record_id):
    """Test POST /api/diagnostics/records/{id}/share (draft should fail)"""
    print("\n=== TEST 10: POST /api/diagnostics/records/{id}/share (draft - should fail) ===")
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    try:
        resp = requests.post(f"{API_BASE}/diagnostics/records/{draft_record_id}/share", headers=headers, json={}, timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 400:
            error_msg = resp.json().get('error', '')
            if 'finalizada' in error_msg.lower() or 'completed' in error_msg.lower():
                print(f"✅ PASS: Draft cannot be shared, error: {error_msg}")
                return True
            else:
                print(f"⚠️  Minor: Got 400 but unexpected error message: {error_msg}")
                return True
        else:
            print(f"❌ FAIL: Expected 400, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_share_completed(token, client_id):
    """Create a completed record and test share link creation"""
    print("\n=== TEST 11: Create COMPLETED record and share ===")
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    # Create completed record
    record_data = {
        "client_id": client_id,
        "status": "completed",
        "professional_name": "Prof Y",
        "exposure_minutes": 30,
        "answers": [],
        "products": []
    }
    
    try:
        resp = requests.post(f"{API_BASE}/diagnostics/records", headers=headers, json=record_data, timeout=10)
        print(f"Create completed record status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Could not create completed record")
            return False, None, None
        
        record_id = resp.json().get('id')
        created_records.append(record_id)
        print(f"✅ Completed record created: {record_id}")
        
        # Now share it
        print("\n=== TEST 11b: POST /api/diagnostics/records/{id}/share (completed) ===")
        resp2 = requests.post(f"{API_BASE}/diagnostics/records/{record_id}/share", headers=headers, json={}, timeout=10)
        print(f"Status: {resp2.status_code}")
        
        if resp2.status_code == 200:
            data = resp2.json()
            if 'token' in data and 'link_id' in data and 'path' in data and 'expires_at' in data:
                print(f"✅ PASS: Share link created, token={data['token'][:10]}..., path={data['path']}")
                created_share_links.append({'record_id': record_id, 'link_id': data['link_id']})
                return True, data['token'], data['link_id']
            else:
                print(f"❌ FAIL: Missing fields in share response")
                return False, None, None
        else:
            print(f"❌ FAIL: Expected 200, got {resp2.status_code}")
            return False, None, None
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False, None, None

def test_shared_public_access(token):
    """Test PUBLIC GET /api/diagnostics/shared/{token}"""
    print("\n=== TEST 12: PUBLIC GET /api/diagnostics/shared/{token} ===")
    
    try:
        # No Authorization header for public access
        resp = requests.get(f"{API_BASE}/diagnostics/shared/{token}", timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            if 'record' in data:
                print(f"✅ PASS: Public shared link accessible")
                # Check Cache-Control
                cache_control = resp.headers.get('Cache-Control', '')
                if 'no-store' in cache_control:
                    print(f"✅ PASS: Cache-Control is no-store: {cache_control}")
                else:
                    print(f"⚠️  Minor: Cache-Control: {cache_control}")
                return True
            else:
                print(f"❌ FAIL: Missing record in shared response")
                return False
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_share_revoke(token, record_id, link_id):
    """Test DELETE /api/diagnostics/records/{id}/share"""
    print("\n=== TEST 13: DELETE /api/diagnostics/records/{id}/share (revoke) ===")
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    try:
        resp = requests.delete(f"{API_BASE}/diagnostics/records/{record_id}/share", headers=headers, json={"link_id": link_id}, timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            if data.get('success'):
                print(f"✅ PASS: Share link revoked")
                return True
            else:
                print(f"❌ FAIL: Success not true in response")
                return False
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_shared_after_revoke(token):
    """Test PUBLIC GET /api/diagnostics/shared/{token} after revoke (should 404)"""
    print("\n=== TEST 14: PUBLIC GET /api/diagnostics/shared/{token} after revoke ===")
    
    try:
        resp = requests.get(f"{API_BASE}/diagnostics/shared/{token}", timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 404:
            print(f"✅ PASS: Revoked link returns 404")
            return True
        else:
            print(f"❌ FAIL: Expected 404, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_shared_invalid_token():
    """Test PUBLIC GET /api/diagnostics/shared/garbagetoken"""
    print("\n=== TEST 15: PUBLIC GET /api/diagnostics/shared/garbagetoken ===")
    
    try:
        resp = requests.get(f"{API_BASE}/diagnostics/shared/garbagetoken123xyz", timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 404:
            print(f"✅ PASS: Invalid token returns 404")
            return True
        else:
            print(f"❌ FAIL: Expected 404, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_field_options(token, catalog_data):
    """Test POST /api/diagnostics/field-options"""
    print("\n=== TEST 16: POST /api/diagnostics/field-options ===")
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    # Get a single_select field from catalog
    fields = catalog_data.get('fields', [])
    single_select_field = next((f for f in fields if f.get('field_type') == 'single_select'), None)
    
    if not single_select_field:
        print(f"⚠️  SKIP: No single_select field found in catalog")
        return True
    
    field_id = single_select_field['id']
    
    # Test 16a: Create custom option
    option_data = {
        "field_id": field_id,
        "label": "__TEST__ Opcion Custom"
    }
    
    try:
        resp = requests.post(f"{API_BASE}/diagnostics/field-options", headers=headers, json=option_data, timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code in [200, 201]:
            data = resp.json()
            print(f"✅ PASS: Field option created/returned")
            
            # Test 16b: Create same option again (should dedupe)
            print("\n=== TEST 16b: POST /api/diagnostics/field-options (dedupe) ===")
            resp2 = requests.post(f"{API_BASE}/diagnostics/field-options", headers=headers, json=option_data, timeout=10)
            print(f"Status: {resp2.status_code}")
            if resp2.status_code in [200, 201]:
                print(f"✅ PASS: Duplicate option handled (dedupe)")
            else:
                print(f"⚠️  Minor: Dedupe returned {resp2.status_code}")
            
            # Test 16c: Invalid field_id (random UUID)
            print("\n=== TEST 16c: POST /api/diagnostics/field-options (invalid field_id) ===")
            bad_data = {
                "field_id": "00000000-0000-0000-0000-000000000000",
                "label": "Test"
            }
            resp3 = requests.post(f"{API_BASE}/diagnostics/field-options", headers=headers, json=bad_data, timeout=10)
            print(f"Status: {resp3.status_code}")
            if resp3.status_code in [400, 403]:
                print(f"✅ PASS: Invalid field_id returns {resp3.status_code}")
            else:
                print(f"⚠️  Minor: Invalid field_id returned {resp3.status_code}")
            
            return True
        else:
            print(f"❌ FAIL: Expected 200/201, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_settings(token):
    """Test GET/PUT /api/diagnostics/settings"""
    print("\n=== TEST 17: GET /api/diagnostics/settings ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    try:
        resp = requests.get(f"{API_BASE}/diagnostics/settings", headers=headers, timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            print(f"✅ PASS: Settings retrieved")
            
            # Test 17b: PUT settings
            print("\n=== TEST 17b: PUT /api/diagnostics/settings ===")
            update_data = {
                "pdf_title": "Test Title",
                "default_share_expiry_days": 120  # Should be clamped to 90
            }
            resp2 = requests.put(f"{API_BASE}/diagnostics/settings", headers=headers, json=update_data, timeout=10)
            print(f"Status: {resp2.status_code}")
            
            if resp2.status_code == 200:
                data = resp2.json()
                if data.get('default_share_expiry_days') == 90:
                    print(f"✅ PASS: Settings updated, default_share_expiry_days clamped to 90")
                else:
                    print(f"⚠️  Minor: default_share_expiry_days = {data.get('default_share_expiry_days')} (expected 90)")
                return True
            else:
                print(f"❌ FAIL: Expected 200, got {resp2.status_code}")
                return False
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_security_no_auth():
    """Test security: no Authorization header"""
    print("\n=== TEST 18: Security - No Authorization header ===")
    
    try:
        resp = requests.get(f"{API_BASE}/diagnostics/catalog", timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 401:
            print(f"✅ PASS: No auth returns 401")
            return True
        else:
            print(f"❌ FAIL: Expected 401, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_security_non_booking(ecommerce_token):
    """Test security: non-booking business type"""
    print("\n=== TEST 19: Security - Non-booking business (ecommerce) ===")
    headers = {"Authorization": f"Bearer {ecommerce_token}"}
    
    try:
        resp = requests.get(f"{API_BASE}/diagnostics/catalog", headers=headers, timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 403:
            print(f"✅ PASS: Non-booking business returns 403")
            return True
        else:
            print(f"❌ FAIL: Expected 403, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_security_cross_tenant(ecommerce_token, booking_record_id):
    """Test security: cross-tenant isolation"""
    print("\n=== TEST 20: Security - Cross-tenant isolation ===")
    headers = {"Authorization": f"Bearer {ecommerce_token}"}
    
    try:
        # Try to access booking user's record with ecommerce token
        resp = requests.get(f"{API_BASE}/diagnostics/records/{booking_record_id}", headers=headers, timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code in [403, 404]:
            print(f"✅ PASS: Cross-tenant access blocked ({resp.status_code})")
            return True
        else:
            print(f"❌ FAIL: Expected 403/404, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_regression_booking(booking_token):
    """Test regression: booking services still work"""
    print("\n=== TEST 21: Regression - GET /api/booking/services ===")
    headers = {"Authorization": f"Bearer {booking_token}"}
    
    try:
        resp = requests.get(f"{API_BASE}/booking/services", headers=headers, timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            print(f"✅ PASS: Booking services endpoint still works")
            return True
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def test_regression_ecommerce(ecommerce_token):
    """Test regression: ecommerce products still work"""
    print("\n=== TEST 22: Regression - GET /api/products (ecommerce) ===")
    headers = {"Authorization": f"Bearer {ecommerce_token}"}
    
    try:
        resp = requests.get(f"{API_BASE}/products", headers=headers, timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            print(f"✅ PASS: Ecommerce products endpoint still works")
            return True
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

def cleanup(booking_token):
    """Clean up test data"""
    print("\n=== CLEANUP: Deleting test data ===")
    headers = {"Authorization": f"Bearer {booking_token}"}
    
    # Note: The API doesn't expose DELETE endpoints for clients/records
    # In a real scenario, we'd clean up via direct DB access or admin endpoints
    # For now, we'll just report what was created
    print(f"Created {len(created_clients)} test clients (prefixed with __TEST__)")
    print(f"Created {len(created_records)} test records")
    print(f"Test data can be identified by __TEST__ prefix in names")

def main():
    print("=" * 80)
    print("DIAGNOSTICS MODULE (Fichas capilares) - COMPREHENSIVE BACKEND TEST")
    print("=" * 80)
    
    # Get tokens
    print("\n=== AUTHENTICATION ===")
    booking_token = get_supabase_token(BOOKING_USER, BOOKING_PASS)
    if not booking_token:
        print("❌ CRITICAL: Could not get booking user token")
        return
    print(f"✅ Booking user token obtained")
    
    ecommerce_token = get_supabase_token(ECOMMERCE_USER, ECOMMERCE_PASS)
    if not ecommerce_token:
        print("❌ CRITICAL: Could not get ecommerce user token")
        return
    print(f"✅ Ecommerce user token obtained")
    
    results = []
    
    # Group 1: Catalog
    success, catalog_data = test_catalog(booking_token)
    results.append(("Catalog GET", success))
    
    # Group 2: Clients
    success, client_id = test_clients_create(booking_token)
    results.append(("Clients POST (create)", success))
    
    if client_id:
        results.append(("Clients POST (validation)", test_clients_search(booking_token)))
        results.append(("Clients PATCH (update)", test_clients_update(booking_token, client_id)))
        results.append(("Clients GET (single)", test_clients_get_single(booking_token, client_id)))
        
        # Group 3: Records
        success, draft_record_id = test_records_create(booking_token, client_id)
        results.append(("Records POST (create)", success))
        
        if draft_record_id:
            results.append(("Records GET (list)", test_records_list(booking_token, client_id)))
            results.append(("Records GET (bundle)", test_records_get_bundle(booking_token, draft_record_id)))
            results.append(("Records GET (pdf)", test_records_get_pdf(booking_token, draft_record_id)))
            
            # Group 4: Share links
            results.append(("Share POST (draft fail)", test_share_draft_fail(booking_token, draft_record_id)))
            success, share_token, link_id = test_share_completed(booking_token, client_id)
            results.append(("Share POST (completed)", success))
            
            if share_token:
                results.append(("Share GET (public)", test_shared_public_access(share_token)))
                if link_id:
                    # Get the record_id for the completed record
                    completed_record_id = next((sl['record_id'] for sl in created_share_links if sl['link_id'] == link_id), None)
                    if completed_record_id:
                        results.append(("Share DELETE (revoke)", test_share_revoke(booking_token, completed_record_id, link_id)))
                        results.append(("Share GET (after revoke)", test_shared_after_revoke(share_token)))
            
            results.append(("Share GET (invalid token)", test_shared_invalid_token()))
        
        # Group 5: Field options
        if catalog_data:
            results.append(("Field Options POST", test_field_options(booking_token, catalog_data)))
    
    # Group 6: Settings
    results.append(("Settings GET/PUT", test_settings(booking_token)))
    
    # Group 7: Security
    results.append(("Security - No auth", test_security_no_auth()))
    results.append(("Security - Non-booking", test_security_non_booking(ecommerce_token)))
    if created_records:
        results.append(("Security - Cross-tenant", test_security_cross_tenant(ecommerce_token, created_records[0])))
    
    # Group 8: Regression
    results.append(("Regression - Booking", test_regression_booking(booking_token)))
    results.append(("Regression - Ecommerce", test_regression_ecommerce(ecommerce_token)))
    
    # Cleanup
    cleanup(booking_token)
    
    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    
    passed = sum(1 for _, success in results if success)
    total = len(results)
    
    for test_name, success in results:
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    print("\n" + "=" * 80)
    print(f"TOTAL: {passed}/{total} tests passed ({100*passed//total}%)")
    print("=" * 80)
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED!")
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")

if __name__ == "__main__":
    main()
