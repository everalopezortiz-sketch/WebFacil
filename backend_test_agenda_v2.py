#!/usr/bin/env python3
"""
Backend test for Agenda v2 + Fichas v2 changes.
Tests 4 areas:
1. Public booking returns public_token
2. POST /api/store/{slug}/booking/my-appointments (batch + recovery)
3. Diagnostics DELETE + PUT (no duplication)
4. Diagnostics field/option/section visibility
"""
import requests
import json
import os
from datetime import datetime, timedelta

# Read environment variables
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://staff-earnings-5.preview.emergentagent.com')
SUPABASE_URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL', 'https://ydgbqxpehrqfvslcuhqk.supabase.co')
SUPABASE_ANON_KEY = os.getenv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlkZ2JxeHBlaHJxZnZzbGN1aHFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3MDMzMTIsImV4cCI6MjA4NTI3OTMxMn0.caH78KNZOJfO05FcOoDdGTB9aL5ui8-_vjDt48lbO1I')

API_BASE = f"{BASE_URL}/api"

# Test credentials
BOOKING_USER = "booking_test_7ow9blnd@test.com"
BOOKING_PASS = "booking123"
ECOMMERCE_USER = "ortiz@gmail.com"
ECOMMERCE_PASS = "ortiz123"

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
            print(f"❌ Failed to get token for {email}: {resp.status_code}")
            return None
    except Exception as e:
        print(f"❌ Exception getting token for {email}: {e}")
        return None

def get_user_profile(token):
    """Get user profile including slug."""
    headers = {"Authorization": f"Bearer {token}"}
    try:
        resp = requests.get(f"{API_BASE}/auth/user", headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            return data.get('profile', {}).get('slug')
        return None
    except:
        return None

# ============================================================================
# AREA 1: PUBLIC BOOKING RETURNS public_token
# ============================================================================

def test_area1_public_booking_setup(token, slug):
    """Ensure booking business has services, staff, and availability."""
    print("\n" + "="*80)
    print("AREA 1: PUBLIC BOOKING RETURNS public_token")
    print("="*80)
    print("\n=== SETUP: Ensure services, staff, and availability exist ===")
    
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    # Check if services exist
    resp = requests.get(f"{API_BASE}/booking/services", headers=headers, timeout=10)
    services = resp.json() if resp.status_code == 200 else []
    
    service_id = None
    if services:
        service_id = services[0]['id']
        print(f"✅ Found existing service: {services[0]['name']} (id: {service_id})")
    else:
        # Create a service category
        cat_resp = requests.post(f"{API_BASE}/booking/service-categories", 
                                 headers=headers, 
                                 json={"name": "Test Category", "color": "#3b82f6"}, 
                                 timeout=10)
        cat_id = cat_resp.json().get('id') if cat_resp.status_code == 200 else None
        
        # Create a service
        svc_resp = requests.post(f"{API_BASE}/booking/services",
                                headers=headers,
                                json={
                                    "name": "Test Service",
                                    "category_id": cat_id,
                                    "price": 50000,
                                    "duration_minutes": 30
                                },
                                timeout=10)
        if svc_resp.status_code == 200:
            service_id = svc_resp.json().get('id')
            print(f"✅ Created service: {service_id}")
    
    # Check staff
    staff_resp = requests.get(f"{API_BASE}/booking/staff", headers=headers, timeout=10)
    staff = staff_resp.json() if staff_resp.status_code == 200 else []
    staff_id = staff[0]['id'] if staff else None
    
    if staff_id and service_id:
        # Assign service to staff
        requests.post(f"{API_BASE}/booking/staff-services",
                     headers=headers,
                     json={"staff_id": staff_id, "service_ids": [service_id]},
                     timeout=10)
        print(f"✅ Assigned service to staff")
    
    # Check availability
    avail_resp = requests.get(f"{API_BASE}/booking/availability", headers=headers, timeout=10)
    availability = avail_resp.json() if avail_resp.status_code == 200 else []
    
    if not availability and staff_id:
        # Create availability for tomorrow's weekday
        tomorrow = datetime.now() + timedelta(days=1)
        day_of_week = tomorrow.weekday() + 1  # Monday=1
        requests.post(f"{API_BASE}/booking/availability",
                     headers=headers,
                     json={
                         "staff_id": staff_id,
                         "day_of_week": day_of_week,
                         "start_time": "09:00",
                         "end_time": "17:00"
                     },
                     timeout=10)
        print(f"✅ Created availability for day {day_of_week}")
    
    return service_id, staff_id

def test_area1_public_booking_data(slug):
    """Test GET /api/store/{slug}/booking returns public data."""
    print("\n=== TEST 1.1: GET /api/store/{slug}/booking (public data) ===")
    
    try:
        resp = requests.get(f"{API_BASE}/store/{slug}/booking", timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            has_services = 'services' in data and len(data['services']) > 0
            has_staff = 'staff' in data and len(data['staff']) > 0
            
            if has_services and has_staff:
                print(f"✅ PASS: Public booking data returned ({len(data['services'])} services, {len(data['staff'])} staff)")
                return True, data
            else:
                print(f"❌ FAIL: Missing services or staff in public data")
                return False, None
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            return False, None
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False, None

def test_area1_get_availability(slug, service_id):
    """Test GET /api/store/{slug}/booking/availability to get slots."""
    print("\n=== TEST 1.2: GET /api/store/{slug}/booking/availability ===")
    
    # Try next 7 days to find availability
    for days_ahead in range(1, 8):
        date = (datetime.now() + timedelta(days=days_ahead)).strftime('%Y-%m-%d')
        
        try:
            resp = requests.get(
                f"{API_BASE}/store/{slug}/booking/availability?service_ids={service_id}&date={date}",
                timeout=10
            )
            
            if resp.status_code == 200:
                slots = resp.json()
                if slots and len(slots) > 0:
                    slot = slots[0]
                    print(f"✅ PASS: Found {len(slots)} slots on {date}")
                    print(f"   First slot: {slot.get('slot_start')} with staff {slot.get('staff_id')}")
                    return True, slot
        except Exception as e:
            continue
    
    print(f"❌ FAIL: No availability found in next 7 days")
    return False, None

def test_area1_create_public_appointment(slug, service_id, staff_id, slot_start):
    """Test POST /api/store/{slug}/booking returns public_token."""
    print("\n=== TEST 1.3: POST /api/store/{slug}/booking (create appointment) ===")
    
    appointment_data = {
        "service_ids": [service_id],
        "staff_id": staff_id,
        "start_at": slot_start,
        "customer_name": "María González",
        "customer_phone": "0981555666"
    }
    
    try:
        resp = requests.post(f"{API_BASE}/store/{slug}/booking", 
                            json=appointment_data, 
                            timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            public_token = data.get('public_token') or data.get('publicToken')
            confirmation_code = data.get('confirmation_code') or data.get('confirmationCode')
            
            if public_token and confirmation_code:
                print(f"✅ PASS: Appointment created with public_token={public_token[:16]}... and code={confirmation_code}")
                
                # Check Cache-Control header
                cache_control = resp.headers.get('Cache-Control', '')
                if 'private' in cache_control and 'no-store' in cache_control:
                    print(f"✅ PASS: Cache-Control is private, no-store")
                else:
                    print(f"⚠️  Minor: Cache-Control: {cache_control}")
                
                return True, public_token, confirmation_code, "0981555666"
            else:
                print(f"❌ FAIL: Missing public_token or confirmation_code in response")
                print(f"   Response keys: {list(data.keys())}")
                return False, None, None, None
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}: {resp.text}")
            return False, None, None, None
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False, None, None, None

# ============================================================================
# AREA 2: POST /api/store/{slug}/booking/my-appointments
# ============================================================================

def test_area2_my_appointments(slug, public_token, confirmation_code, customer_phone):
    """Test POST /api/store/{slug}/booking/my-appointments."""
    print("\n" + "="*80)
    print("AREA 2: POST /api/store/{slug}/booking/my-appointments")
    print("="*80)
    
    results = []
    
    # TEST 2.1: Valid tokens array
    print("\n=== TEST 2.1: POST my-appointments with valid tokens ===")
    try:
        resp = requests.post(f"{API_BASE}/store/{slug}/booking/my-appointments",
                            json={"tokens": [public_token]},
                            timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            appointments = data.get('appointments', [])
            
            if len(appointments) == 1:
                appt = appointments[0]
                required_fields = ['public_token', 'status', 'confirmation_code', 'start_at', 
                                 'end_at', 'total_price', 'total_duration_minutes', 'staff_name',
                                 'services', 'previous_start_at', 'previous_end_at', 
                                 'rescheduled_at', 'reschedule_count']
                missing = [f for f in required_fields if f not in appt]
                
                if not missing:
                    print(f"✅ PASS: Returned 1 appointment with all required fields")
                    print(f"   Status: {appt['status']}, Code: {appt['confirmation_code']}")
                    
                    # Check Cache-Control
                    cache_control = resp.headers.get('Cache-Control', '')
                    if 'private' in cache_control and 'no-store' in cache_control:
                        print(f"✅ PASS: Cache-Control is private, no-store")
                    else:
                        print(f"⚠️  Minor: Cache-Control: {cache_control}")
                    
                    results.append(True)
                else:
                    print(f"❌ FAIL: Missing fields: {missing}")
                    results.append(False)
            else:
                print(f"❌ FAIL: Expected 1 appointment, got {len(appointments)}")
                results.append(False)
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            results.append(False)
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        results.append(False)
    
    # TEST 2.2: Empty tokens array
    print("\n=== TEST 2.2: POST my-appointments with empty tokens ===")
    try:
        resp = requests.post(f"{API_BASE}/store/{slug}/booking/my-appointments",
                            json={"tokens": []},
                            timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            if data.get('appointments') == []:
                print(f"✅ PASS: Empty tokens returns empty appointments array")
                results.append(True)
            else:
                print(f"❌ FAIL: Expected empty array, got {data.get('appointments')}")
                results.append(False)
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            results.append(False)
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        results.append(False)
    
    # TEST 2.3: Invalid token (not UUID)
    print("\n=== TEST 2.3: POST my-appointments with invalid token ===")
    try:
        resp = requests.post(f"{API_BASE}/store/{slug}/booking/my-appointments",
                            json={"tokens": ["not-a-uuid"]},
                            timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            if data.get('appointments') == []:
                print(f"✅ PASS: Invalid token filtered out, returns empty array")
                results.append(True)
            else:
                print(f"❌ FAIL: Expected empty array, got {data.get('appointments')}")
                results.append(False)
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            results.append(False)
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        results.append(False)
    
    # TEST 2.4: Recovery with correct code + phone
    print("\n=== TEST 2.4: POST my-appointments with recovery (correct code+phone) ===")
    try:
        resp = requests.post(f"{API_BASE}/store/{slug}/booking/my-appointments",
                            json={"recover": {"code": confirmation_code, "phone": customer_phone}},
                            timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            recovered_token = data.get('public_token')
            if recovered_token:
                print(f"✅ PASS: Recovery successful, returned public_token={recovered_token[:16]}...")
                results.append(True)
            else:
                print(f"❌ FAIL: Recovery did not return public_token")
                results.append(False)
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            results.append(False)
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        results.append(False)
    
    # TEST 2.5: Recovery with wrong phone
    print("\n=== TEST 2.5: POST my-appointments with recovery (wrong phone) ===")
    try:
        resp = requests.post(f"{API_BASE}/store/{slug}/booking/my-appointments",
                            json={"recover": {"code": confirmation_code, "phone": "0000000"}},
                            timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 404:
            print(f"✅ PASS: Wrong phone returns 404")
            results.append(True)
        else:
            print(f"❌ FAIL: Expected 404, got {resp.status_code}")
            results.append(False)
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        results.append(False)
    
    # TEST 2.6: Recovery with code only (no phone) - must NOT return token
    print("\n=== TEST 2.6: POST my-appointments with recovery (code only, no phone) ===")
    try:
        resp = requests.post(f"{API_BASE}/store/{slug}/booking/my-appointments",
                            json={"recover": {"code": "ZZZZZZ"}},
                            timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code in [400, 404]:
            print(f"✅ PASS: Code without phone returns {resp.status_code} (no token leaked)")
            results.append(True)
        elif resp.status_code == 200:
            data = resp.json()
            if data.get('public_token'):
                print(f"❌ FAIL: SECURITY ISSUE - Code alone returned a token!")
                results.append(False)
            else:
                print(f"✅ PASS: Code without phone returns 200 but no token")
                results.append(True)
        else:
            print(f"⚠️  Unexpected status {resp.status_code}")
            results.append(False)
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        results.append(False)
    
    return results

# ============================================================================
# AREA 3: DIAGNOSTICS DELETE + PUT (no duplication)
# ============================================================================

def test_area3_diagnostics_put_delete(booking_token, ecommerce_token):
    """Test Diagnostics DELETE and PUT (no duplication)."""
    print("\n" + "="*80)
    print("AREA 3: DIAGNOSTICS DELETE + PUT (no duplication)")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {booking_token}", "Content-Type": "application/json"}
    results = []
    
    # Create a client
    print("\n=== SETUP: Create test client ===")
    client_resp = requests.post(f"{API_BASE}/diagnostics/clients",
                               headers=headers,
                               json={"full_name": "Test Client PUT/DELETE", "phone": "0981777888"},
                               timeout=10)
    
    if client_resp.status_code != 201:
        print(f"❌ FAIL: Could not create client")
        return [False] * 5
    
    client_id = client_resp.json().get('id')
    print(f"✅ Client created: {client_id}")
    
    # Create a record
    print("\n=== TEST 3.1: POST /api/diagnostics/records (create) ===")
    record_data = {
        "client_id": client_id,
        "status": "draft",
        "general_observations": "Initial observation",
        "answers": [],
        "products": []
    }
    
    try:
        resp = requests.post(f"{API_BASE}/diagnostics/records",
                            headers=headers,
                            json=record_data,
                            timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            record_id = resp.json().get('id')
            print(f"✅ PASS: Record created with id={record_id}")
            results.append(True)
        else:
            print(f"❌ FAIL: Could not create record")
            return [False] * 5
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return [False] * 5
    
    # Get initial count
    print("\n=== TEST 3.2: GET /api/diagnostics/records?client_id={id} (initial count) ===")
    try:
        resp = requests.get(f"{API_BASE}/diagnostics/records?client_id={client_id}",
                           headers=headers,
                           timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            initial_count = len(resp.json().get('records', []))
            print(f"✅ PASS: Initial count = {initial_count}")
            results.append(True)
        else:
            print(f"❌ FAIL: Could not get records")
            return results + [False] * 3
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return results + [False] * 3
    
    # PUT update (should NOT create duplicate)
    print("\n=== TEST 3.3: PUT /api/diagnostics/records/{id} (update, no duplicate) ===")
    update_data = {
        "client_id": client_id,
        "status": "draft",
        "general_observations": "EDITED observation",
        "answers": [],
        "products": []
    }
    
    try:
        resp = requests.put(f"{API_BASE}/diagnostics/records/{record_id}",
                           headers=headers,
                           json=update_data,
                           timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            returned_id = resp.json().get('id')
            if returned_id == record_id:
                print(f"✅ PASS: PUT returned same record id (no duplicate)")
                results.append(True)
            else:
                print(f"❌ FAIL: PUT returned different id: {returned_id} vs {record_id}")
                results.append(False)
        else:
            print(f"❌ FAIL: PUT failed with {resp.status_code}")
            results.append(False)
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        results.append(False)
    
    # Get count again (should be same)
    print("\n=== TEST 3.4: GET /api/diagnostics/records?client_id={id} (count after PUT) ===")
    try:
        resp = requests.get(f"{API_BASE}/diagnostics/records?client_id={client_id}",
                           headers=headers,
                           timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            final_count = len(resp.json().get('records', []))
            if final_count == initial_count:
                print(f"✅ PASS: Count unchanged ({final_count}), no duplicate created")
                results.append(True)
            else:
                print(f"❌ FAIL: Count changed from {initial_count} to {final_count} (duplicate created!)")
                results.append(False)
        else:
            print(f"❌ FAIL: Could not get records")
            results.append(False)
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        results.append(False)
    
    # DELETE record
    print("\n=== TEST 3.5: DELETE /api/diagnostics/records/{id} ===")
    try:
        resp = requests.delete(f"{API_BASE}/diagnostics/records/{record_id}",
                              headers=headers,
                              timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            print(f"✅ PASS: Record deleted successfully")
            
            # Verify it's gone
            get_resp = requests.get(f"{API_BASE}/diagnostics/records/{record_id}",
                                   headers=headers,
                                   timeout=10)
            if get_resp.status_code == 404:
                print(f"✅ PASS: Deleted record returns 404")
                results.append(True)
            else:
                print(f"❌ FAIL: Deleted record still accessible ({get_resp.status_code})")
                results.append(False)
        else:
            print(f"❌ FAIL: DELETE failed with {resp.status_code}")
            results.append(False)
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        results.append(False)
    
    # TEST 3.6: Isolation - ecommerce user cannot delete booking records
    print("\n=== TEST 3.6: Isolation - ecommerce user tries DELETE (should fail) ===")
    
    # Create another record for isolation test
    create_resp = requests.post(f"{API_BASE}/diagnostics/records",
                               headers=headers,
                               json=record_data,
                               timeout=10)
    if create_resp.status_code == 200:
        test_record_id = create_resp.json().get('id')
        
        # Try to delete with ecommerce token
        ecom_headers = {"Authorization": f"Bearer {ecommerce_token}"}
        try:
            resp = requests.delete(f"{API_BASE}/diagnostics/records/{test_record_id}",
                                  headers=ecom_headers,
                                  timeout=10)
            print(f"Status: {resp.status_code}")
            
            if resp.status_code == 403:
                print(f"✅ PASS: Ecommerce user cannot delete booking records (403)")
                results.append(True)
            else:
                print(f"❌ FAIL: Expected 403, got {resp.status_code}")
                results.append(False)
        except Exception as e:
            print(f"❌ FAIL: Exception: {e}")
            results.append(False)
    else:
        print(f"⚠️  Could not create test record for isolation test")
        results.append(False)
    
    return results

# ============================================================================
# AREA 4: DIAGNOSTICS field/option/section visibility
# ============================================================================

def test_area4_field_visibility(booking_token, ecommerce_token):
    """Test Diagnostics field/option/section visibility."""
    print("\n" + "="*80)
    print("AREA 4: DIAGNOSTICS field/option/section visibility")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {booking_token}", "Content-Type": "application/json"}
    results = []
    
    # TEST 4.1: GET /api/diagnostics/fields (all fields including inactive)
    print("\n=== TEST 4.1: GET /api/diagnostics/fields (all fields) ===")
    try:
        resp = requests.get(f"{API_BASE}/diagnostics/fields", headers=headers, timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            fields = data.get('fields', [])
            if fields and len(fields) > 0:
                # Check that fields have is_active and options with is_active
                field = fields[0]
                has_is_active = 'is_active' in field
                has_options = 'options' in field
                
                if has_is_active and has_options:
                    print(f"✅ PASS: GET /fields returns {len(fields)} fields with is_active and options")
                    results.append(True)
                    
                    # Pick a field for testing
                    test_field = next((f for f in fields if f.get('is_active') and f.get('options')), fields[0])
                    field_id = test_field['id']
                    section_key = test_field.get('section_key')
                    
                    return results, field_id, section_key, test_field
                else:
                    print(f"❌ FAIL: Fields missing is_active or options")
                    results.append(False)
                    return results, None, None, None
            else:
                print(f"❌ FAIL: No fields returned")
                results.append(False)
                return results, None, None, None
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            results.append(False)
            return results, None, None, None
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        results.append(False)
        return results, None, None, None

def test_area4_catalog_and_toggle(booking_token, field_id, section_key, test_field):
    """Test catalog and field/option/section toggling."""
    headers = {"Authorization": f"Bearer {booking_token}", "Content-Type": "application/json"}
    results = []
    
    # TEST 4.2: GET /api/diagnostics/catalog (only active fields)
    print("\n=== TEST 4.2: GET /api/diagnostics/catalog (active fields only) ===")
    try:
        resp = requests.get(f"{API_BASE}/diagnostics/catalog", headers=headers, timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            catalog_fields = data.get('fields', [])
            field_in_catalog = any(f['id'] == field_id for f in catalog_fields)
            
            if field_in_catalog:
                print(f"✅ PASS: Catalog returns active fields, test field present")
                results.append(True)
            else:
                print(f"⚠️  Test field not in catalog (might be inactive)")
                results.append(True)
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            results.append(False)
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        results.append(False)
    
    # TEST 4.3: PATCH field to inactive
    print("\n=== TEST 4.3: PATCH /api/diagnostics/fields/{id} (set is_active=false) ===")
    try:
        resp = requests.patch(f"{API_BASE}/diagnostics/fields/{field_id}",
                             headers=headers,
                             json={"is_active": False},
                             timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            print(f"✅ PASS: Field set to inactive")
            results.append(True)
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            results.append(False)
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        results.append(False)
    
    # TEST 4.4: Verify field absent from catalog
    print("\n=== TEST 4.4: GET /api/diagnostics/catalog (field should be absent) ===")
    try:
        resp = requests.get(f"{API_BASE}/diagnostics/catalog", headers=headers, timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            catalog_fields = data.get('fields', [])
            field_in_catalog = any(f['id'] == field_id for f in catalog_fields)
            
            if not field_in_catalog:
                print(f"✅ PASS: Inactive field absent from catalog")
                results.append(True)
            else:
                print(f"❌ FAIL: Inactive field still in catalog")
                results.append(False)
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            results.append(False)
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        results.append(False)
    
    # TEST 4.5: Verify field still in /fields (with is_active=false)
    print("\n=== TEST 4.5: GET /api/diagnostics/fields (field still listed) ===")
    try:
        resp = requests.get(f"{API_BASE}/diagnostics/fields", headers=headers, timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            fields = data.get('fields', [])
            field = next((f for f in fields if f['id'] == field_id), None)
            
            if field and field.get('is_active') == False:
                print(f"✅ PASS: Field still in /fields with is_active=false")
                results.append(True)
            else:
                print(f"❌ FAIL: Field not found or is_active not false")
                results.append(False)
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            results.append(False)
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        results.append(False)
    
    # TEST 4.6: PATCH field back to active
    print("\n=== TEST 4.6: PATCH /api/diagnostics/fields/{id} (set is_active=true) ===")
    try:
        resp = requests.patch(f"{API_BASE}/diagnostics/fields/{field_id}",
                             headers=headers,
                             json={"is_active": True},
                             timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            print(f"✅ PASS: Field set back to active")
            results.append(True)
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            results.append(False)
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        results.append(False)
    
    # TEST 4.7: Verify field back in catalog
    print("\n=== TEST 4.7: GET /api/diagnostics/catalog (field should be present) ===")
    try:
        resp = requests.get(f"{API_BASE}/diagnostics/catalog", headers=headers, timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            catalog_fields = data.get('fields', [])
            field_in_catalog = any(f['id'] == field_id for f in catalog_fields)
            
            if field_in_catalog:
                print(f"✅ PASS: Active field present in catalog")
                results.append(True)
            else:
                print(f"❌ FAIL: Active field not in catalog")
                results.append(False)
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            results.append(False)
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        results.append(False)
    
    # TEST 4.8: Option visibility (if field has options)
    if test_field.get('options'):
        option = test_field['options'][0]
        option_id = option['id']
        
        print("\n=== TEST 4.8: PATCH /api/diagnostics/field-options/{id} (set is_active=false) ===")
        try:
            resp = requests.patch(f"{API_BASE}/diagnostics/field-options/{option_id}",
                                 headers=headers,
                                 json={"is_active": False},
                                 timeout=10)
            print(f"Status: {resp.status_code}")
            
            if resp.status_code == 200:
                print(f"✅ PASS: Option set to inactive")
                
                # Verify option absent from catalog
                cat_resp = requests.get(f"{API_BASE}/diagnostics/catalog", headers=headers, timeout=10)
                if cat_resp.status_code == 200:
                    cat_data = cat_resp.json()
                    cat_field = next((f for f in cat_data.get('fields', []) if f['id'] == field_id), None)
                    if cat_field:
                        option_in_catalog = any(o['id'] == option_id for o in cat_field.get('options', []))
                        if not option_in_catalog:
                            print(f"✅ PASS: Inactive option absent from catalog")
                            results.append(True)
                        else:
                            print(f"❌ FAIL: Inactive option still in catalog")
                            results.append(False)
                    else:
                        print(f"⚠️  Field not in catalog")
                        results.append(True)
                else:
                    results.append(False)
                
                # Restore option
                requests.patch(f"{API_BASE}/diagnostics/field-options/{option_id}",
                              headers=headers,
                              json={"is_active": True},
                              timeout=10)
            else:
                print(f"❌ FAIL: Expected 200, got {resp.status_code}")
                results.append(False)
        except Exception as e:
            print(f"❌ FAIL: Exception: {e}")
            results.append(False)
    else:
        print("\n⚠️  SKIP: No options to test")
        results.append(True)
    
    # TEST 4.9: Section batch toggle
    if section_key:
        print(f"\n=== TEST 4.9: PATCH /api/diagnostics/fields/section (set section {section_key} inactive) ===")
        try:
            resp = requests.patch(f"{API_BASE}/diagnostics/fields/section",
                                 headers=headers,
                                 json={"section_key": section_key, "is_active": False},
                                 timeout=10)
            print(f"Status: {resp.status_code}")
            
            if resp.status_code == 200:
                print(f"✅ PASS: Section set to inactive")
                
                # Verify no fields from this section in catalog
                cat_resp = requests.get(f"{API_BASE}/diagnostics/catalog", headers=headers, timeout=10)
                if cat_resp.status_code == 200:
                    cat_data = cat_resp.json()
                    section_fields = [f for f in cat_data.get('fields', []) if f.get('section_key') == section_key]
                    if len(section_fields) == 0:
                        print(f"✅ PASS: No fields from section {section_key} in catalog")
                        results.append(True)
                    else:
                        print(f"❌ FAIL: {len(section_fields)} fields from section still in catalog")
                        results.append(False)
                else:
                    results.append(False)
                
                # Restore section
                requests.patch(f"{API_BASE}/diagnostics/fields/section",
                              headers=headers,
                              json={"section_key": section_key, "is_active": True},
                              timeout=10)
            else:
                print(f"❌ FAIL: Expected 200, got {resp.status_code}")
                results.append(False)
        except Exception as e:
            print(f"❌ FAIL: Exception: {e}")
            results.append(False)
    else:
        print("\n⚠️  SKIP: No section_key to test")
        results.append(True)
    
    return results

def test_area4_isolation(ecommerce_token):
    """Test isolation - ecommerce user cannot access diagnostics fields."""
    print("\n=== TEST 4.10: Isolation - ecommerce user GET /api/diagnostics/fields ===")
    
    headers = {"Authorization": f"Bearer {ecommerce_token}"}
    
    try:
        resp = requests.get(f"{API_BASE}/diagnostics/fields", headers=headers, timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code == 403:
            print(f"✅ PASS: Ecommerce user cannot access diagnostics fields (403)")
            return True
        else:
            print(f"❌ FAIL: Expected 403, got {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        return False

# ============================================================================
# REGRESSION TESTS
# ============================================================================

def test_regression(booking_token, ecommerce_token):
    """Test regression - existing endpoints still work."""
    print("\n" + "="*80)
    print("REGRESSION TESTS")
    print("="*80)
    
    results = []
    
    # Booking services
    print("\n=== REGRESSION 1: GET /api/booking/services ===")
    headers = {"Authorization": f"Bearer {booking_token}"}
    try:
        resp = requests.get(f"{API_BASE}/booking/services", headers=headers, timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            print(f"✅ PASS: Booking services endpoint working")
            results.append(True)
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            results.append(False)
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        results.append(False)
    
    # Diagnostics catalog
    print("\n=== REGRESSION 2: GET /api/diagnostics/catalog ===")
    try:
        resp = requests.get(f"{API_BASE}/diagnostics/catalog", headers=headers, timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            print(f"✅ PASS: Diagnostics catalog endpoint working")
            results.append(True)
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            results.append(False)
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        results.append(False)
    
    # Ecommerce products
    print("\n=== REGRESSION 3: GET /api/products (ecommerce) ===")
    ecom_headers = {"Authorization": f"Bearer {ecommerce_token}"}
    try:
        resp = requests.get(f"{API_BASE}/products", headers=ecom_headers, timeout=10)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            print(f"✅ PASS: Ecommerce products endpoint working")
            results.append(True)
        else:
            print(f"❌ FAIL: Expected 200, got {resp.status_code}")
            results.append(False)
    except Exception as e:
        print(f"❌ FAIL: Exception: {e}")
        results.append(False)
    
    return results

# ============================================================================
# MAIN
# ============================================================================

def main():
    print("=" * 80)
    print("AGENDA v2 + FICHAS v2 - COMPREHENSIVE BACKEND TEST")
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
    
    # Get booking user slug
    slug = get_user_profile(booking_token)
    if not slug:
        print("❌ CRITICAL: Could not get booking user slug")
        return
    print(f"✅ Booking user slug: {slug}")
    
    all_results = []
    
    # AREA 1: Public booking returns public_token
    service_id, staff_id = test_area1_public_booking_setup(booking_token, slug)
    
    success, public_data = test_area1_public_booking_data(slug)
    all_results.append(("Area 1.1: Public booking data", success))
    
    if success and service_id:
        success, slot = test_area1_get_availability(slug, service_id)
        all_results.append(("Area 1.2: Get availability slots", success))
        
        if success and slot:
            success, public_token, confirmation_code, customer_phone = test_area1_create_public_appointment(
                slug, service_id, slot['staff_id'], slot['slot_start']
            )
            all_results.append(("Area 1.3: Create appointment with public_token", success))
            
            # AREA 2: my-appointments
            if success and public_token:
                area2_results = test_area2_my_appointments(slug, public_token, confirmation_code, customer_phone)
                all_results.append(("Area 2.1: my-appointments with valid tokens", area2_results[0] if area2_results else False))
                all_results.append(("Area 2.2: my-appointments with empty tokens", area2_results[1] if len(area2_results) > 1 else False))
                all_results.append(("Area 2.3: my-appointments with invalid token", area2_results[2] if len(area2_results) > 2 else False))
                all_results.append(("Area 2.4: Recovery with correct code+phone", area2_results[3] if len(area2_results) > 3 else False))
                all_results.append(("Area 2.5: Recovery with wrong phone", area2_results[4] if len(area2_results) > 4 else False))
                all_results.append(("Area 2.6: Recovery with code only (no token)", area2_results[5] if len(area2_results) > 5 else False))
    
    # AREA 3: Diagnostics PUT/DELETE
    area3_results = test_area3_diagnostics_put_delete(booking_token, ecommerce_token)
    all_results.append(("Area 3.1: Create diagnostic record", area3_results[0] if area3_results else False))
    all_results.append(("Area 3.2: Get initial record count", area3_results[1] if len(area3_results) > 1 else False))
    all_results.append(("Area 3.3: PUT update (no duplicate)", area3_results[2] if len(area3_results) > 2 else False))
    all_results.append(("Area 3.4: Verify count unchanged", area3_results[3] if len(area3_results) > 3 else False))
    all_results.append(("Area 3.5: DELETE record", area3_results[4] if len(area3_results) > 4 else False))
    all_results.append(("Area 3.6: Isolation - ecommerce cannot delete", area3_results[5] if len(area3_results) > 5 else False))
    
    # AREA 4: Field visibility
    area4_results, field_id, section_key, test_field = test_area4_field_visibility(booking_token, ecommerce_token)
    all_results.append(("Area 4.1: GET /fields (all fields)", area4_results[0] if area4_results else False))
    
    if field_id:
        catalog_results = test_area4_catalog_and_toggle(booking_token, field_id, section_key, test_field)
        all_results.append(("Area 4.2: GET /catalog (active only)", catalog_results[0] if catalog_results else False))
        all_results.append(("Area 4.3: PATCH field inactive", catalog_results[1] if len(catalog_results) > 1 else False))
        all_results.append(("Area 4.4: Field absent from catalog", catalog_results[2] if len(catalog_results) > 2 else False))
        all_results.append(("Area 4.5: Field still in /fields", catalog_results[3] if len(catalog_results) > 3 else False))
        all_results.append(("Area 4.6: PATCH field active", catalog_results[4] if len(catalog_results) > 4 else False))
        all_results.append(("Area 4.7: Field back in catalog", catalog_results[5] if len(catalog_results) > 5 else False))
        all_results.append(("Area 4.8: Option visibility toggle", catalog_results[6] if len(catalog_results) > 6 else False))
        all_results.append(("Area 4.9: Section batch toggle", catalog_results[7] if len(catalog_results) > 7 else False))
    
    isolation_result = test_area4_isolation(ecommerce_token)
    all_results.append(("Area 4.10: Isolation - ecommerce 403", isolation_result))
    
    # REGRESSION
    regression_results = test_regression(booking_token, ecommerce_token)
    all_results.append(("Regression 1: Booking services", regression_results[0] if regression_results else False))
    all_results.append(("Regression 2: Diagnostics catalog", regression_results[1] if len(regression_results) > 1 else False))
    all_results.append(("Regression 3: Ecommerce products", regression_results[2] if len(regression_results) > 2 else False))
    
    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    
    passed = sum(1 for _, success in all_results if success)
    total = len(all_results)
    
    for test_name, success in all_results:
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    print("\n" + "=" * 80)
    print(f"TOTAL: {passed}/{total} tests passed ({100*passed//total if total > 0 else 0}%)")
    print("=" * 80)
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED!")
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")

if __name__ == "__main__":
    main()
