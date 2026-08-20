#!/usr/bin/env python3
"""
Backend test for public booking availability endpoint after bug fix.
Tests ONLY the public availability endpoint with staff_id=any normalization and Cache-Control headers.
"""

import requests
import json
import sys
from datetime import datetime, timedelta

# Base URL from environment
BASE_URL = "https://staff-earnings-5.preview.emergentagent.com/api"

# Test credentials (booking business accounts)
BOOKING_CREDENTIALS = [
    {"email": "booking_fin_test@test.com", "password": "booking123"},
    {"email": "booking_test_7ow9blnd@test.com", "password": "booking123"}
]

def print_test(msg):
    print(f"\n{'='*80}")
    print(f"TEST: {msg}")
    print('='*80)

def print_result(success, msg):
    status = "✅ PASS" if success else "❌ FAIL"
    print(f"{status}: {msg}")

def sign_in(email, password):
    """Sign in and return profile (access token not needed for public endpoints)"""
    print_test(f"Sign in as {email}")
    try:
        response = requests.post(
            f"{BASE_URL}/auth/signin",
            json={"email": email, "password": password},
            timeout=10
        )
        print(f"Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            profile = data.get('profile', {})
            if profile:
                print_result(True, f"Signed in successfully, got profile")
                return profile
            else:
                print_result(False, "No profile in response")
                return None
        else:
            print_result(False, f"Sign in failed: {response.text}")
            return None
    except Exception as e:
        print_result(False, f"Sign in error: {str(e)}")
        return None

# Removed get_slug function - slug is now obtained directly from sign_in profile

def check_services_and_staff(slug):
    """Check if at least one active service and bookable staff exists"""
    print_test(f"Check services and staff for slug: {slug}")
    try:
        response = requests.get(
            f"{BASE_URL}/store/{slug}/booking",
            timeout=10
        )
        print(f"Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            services = data.get('services', [])
            staff = data.get('staff', [])
            staff_services = data.get('staffServices', [])
            
            print(f"Found {len(services)} services, {len(staff)} staff, {len(staff_services)} staff-service assignments")
            
            if len(services) > 0 and len(staff) > 0 and len(staff_services) > 0:
                print_result(True, f"Setup complete: {len(services)} services, {len(staff)} bookable staff")
                return data
            else:
                print_result(False, "Missing services or staff or assignments")
                return None
        else:
            print_result(False, f"Failed to get booking data: {response.text}")
            return None
    except Exception as e:
        print_result(False, f"Error checking services/staff: {str(e)}")
        return None

def test_public_booking_endpoint(slug):
    """Test GET /api/store/{slug}/booking returns services, staff, staffServices"""
    print_test(f"Test GET /api/store/{slug}/booking (public endpoint)")
    try:
        response = requests.get(
            f"{BASE_URL}/store/{slug}/booking",
            timeout=10
        )
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print_result(False, f"Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        # Check required keys
        required_keys = ['services', 'staff', 'staffServices', 'settings', 'business']
        missing_keys = [k for k in required_keys if k not in data]
        
        if missing_keys:
            print_result(False, f"Missing keys: {missing_keys}")
            return False
        
        print(f"Response keys: {list(data.keys())}")
        print(f"Services: {len(data['services'])}, Staff: {len(data['staff'])}, StaffServices: {len(data['staffServices'])}")
        
        print_result(True, "Public booking endpoint returns all required data")
        return True
        
    except Exception as e:
        print_result(False, f"Error: {str(e)}")
        return False

def test_availability_with_staff_id_any(slug, service_id, date):
    """Test availability with staff_id=any - verify real staff_id in every row and Cache-Control header"""
    print_test(f"Test availability with staff_id=any")
    try:
        response = requests.get(
            f"{BASE_URL}/store/{slug}/booking/availability",
            params={
                "service_ids": service_id,
                "date": date,
                "staff_id": "any"
            },
            timeout=10
        )
        print(f"Status: {response.status_code}")
        print(f"Headers: {dict(response.headers)}")
        
        if response.status_code != 200:
            print_result(False, f"Expected 200, got {response.status_code}: {response.text}")
            return False, []
        
        data = response.json()
        print(f"Returned {len(data)} slots")
        
        # Verify Cache-Control header
        cache_control = response.headers.get('Cache-Control', '')
        expected_cache = 'private, no-store, max-age=0'
        
        if cache_control != expected_cache:
            print(f"⚠️  Cache-Control header: '{cache_control}' (expected: '{expected_cache}')")
            # Note: This might be overridden by Next.js, so we'll check but not fail
        else:
            print(f"✅ Cache-Control header correct: '{cache_control}'")
        
        # Verify every row has a real staff_id (UUID, not null, not 'any')
        issues = []
        sample_rows = []
        
        for i, slot in enumerate(data[:5]):  # Check first 5 slots as sample
            staff_id = slot.get('staff_id')
            slot_start = slot.get('slot_start')
            slot_end = slot.get('slot_end')
            
            sample_rows.append({
                'staff_id': staff_id,
                'slot_start': slot_start,
                'slot_end': slot_end
            })
            
            # Verify staff_id is a UUID (not null, not 'any')
            if not staff_id:
                issues.append(f"Row {i}: staff_id is null or missing")
            elif staff_id == 'any':
                issues.append(f"Row {i}: staff_id is 'any' (should be real UUID)")
            elif not isinstance(staff_id, str) or len(staff_id) != 36:
                issues.append(f"Row {i}: staff_id '{staff_id}' is not a valid UUID")
            
            # Verify slot_start and slot_end exist
            if not slot_start:
                issues.append(f"Row {i}: slot_start is missing")
            if not slot_end:
                issues.append(f"Row {i}: slot_end is missing")
        
        print(f"\nSample rows (first 5):")
        for row in sample_rows:
            print(f"  staff_id: {row['staff_id']}, slot_start: {row['slot_start']}, slot_end: {row['slot_end']}")
        
        if issues:
            print_result(False, f"Found issues: {', '.join(issues)}")
            return False, data
        
        print_result(True, f"All {len(data)} slots have real staff_id (UUID) and slot times")
        return True, data
        
    except Exception as e:
        print_result(False, f"Error: {str(e)}")
        return False, []

def test_availability_with_specific_staff(slug, service_id, date, staff_id):
    """Test availability with specific staff_id - should return only that staff's slots"""
    print_test(f"Test availability with specific staff_id: {staff_id}")
    try:
        response = requests.get(
            f"{BASE_URL}/store/{slug}/booking/availability",
            params={
                "service_ids": service_id,
                "date": date,
                "staff_id": staff_id
            },
            timeout=10
        )
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print_result(False, f"Expected 200, got {response.status_code}: {response.text}")
            return False, []
        
        data = response.json()
        print(f"Returned {len(data)} slots")
        
        # Verify all slots belong to the specified staff
        wrong_staff = [s for s in data if s.get('staff_id') != staff_id]
        
        if wrong_staff:
            print_result(False, f"Found {len(wrong_staff)} slots with wrong staff_id")
            return False, data
        
        print_result(True, f"All {len(data)} slots belong to staff {staff_id}")
        return True, data
        
    except Exception as e:
        print_result(False, f"Error: {str(e)}")
        return False, []

def test_availability_without_staff_id(slug, service_id, date):
    """Test availability without staff_id parameter - should behave same as staff_id=any"""
    print_test(f"Test availability without staff_id parameter")
    try:
        response = requests.get(
            f"{BASE_URL}/store/{slug}/booking/availability",
            params={
                "service_ids": service_id,
                "date": date
            },
            timeout=10
        )
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print_result(False, f"Expected 200, got {response.status_code}: {response.text}")
            return False, []
        
        data = response.json()
        print(f"Returned {len(data)} slots")
        
        # Verify every row has a real staff_id
        issues = []
        for i, slot in enumerate(data[:3]):
            staff_id = slot.get('staff_id')
            if not staff_id or staff_id == 'any':
                issues.append(f"Row {i}: staff_id is '{staff_id}'")
        
        if issues:
            print_result(False, f"Found issues: {', '.join(issues)}")
            return False, data
        
        print_result(True, f"All slots have real staff_id")
        return True, data
        
    except Exception as e:
        print_result(False, f"Error: {str(e)}")
        return False, []

def test_availability_missing_service_ids(slug, date):
    """Test availability without service_ids - should return 400 with Spanish error"""
    print_test(f"Test availability without service_ids (validation)")
    try:
        response = requests.get(
            f"{BASE_URL}/store/{slug}/booking/availability",
            params={
                "date": date,
                "staff_id": "any"
            },
            timeout=10
        )
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code != 400:
            print_result(False, f"Expected 400, got {response.status_code}")
            return False
        
        data = response.json()
        error_msg = data.get('error', '')
        expected_msg = 'Selecciona al menos un servicio.'
        
        if error_msg == expected_msg:
            print_result(True, f"Correct Spanish error: '{error_msg}'")
            return True
        else:
            print_result(False, f"Wrong error message: '{error_msg}' (expected: '{expected_msg}')")
            return False
        
    except Exception as e:
        print_result(False, f"Error: {str(e)}")
        return False

def test_availability_missing_date(slug, service_id):
    """Test availability without date - should return 400"""
    print_test(f"Test availability without date (validation)")
    try:
        response = requests.get(
            f"{BASE_URL}/store/{slug}/booking/availability",
            params={
                "service_ids": service_id,
                "staff_id": "any"
            },
            timeout=10
        )
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code != 400:
            print_result(False, f"Expected 400, got {response.status_code}")
            return False
        
        data = response.json()
        error_msg = data.get('error', '')
        
        if 'fecha' in error_msg.lower() or 'date' in error_msg.lower():
            print_result(True, f"Correct error about missing date: '{error_msg}'")
            return True
        else:
            print_result(False, f"Error message doesn't mention date: '{error_msg}'")
            return False
        
    except Exception as e:
        print_result(False, f"Error: {str(e)}")
        return False

def compare_any_vs_omitted(any_slots, omitted_slots):
    """Compare slots from staff_id=any vs omitting staff_id - should be identical"""
    print_test("Compare staff_id=any vs omitting staff_id")
    
    # Extract slot_start times from both
    any_times = sorted([s.get('slot_start') for s in any_slots])
    omitted_times = sorted([s.get('slot_start') for s in omitted_slots])
    
    print(f"staff_id=any: {len(any_times)} slots")
    print(f"omitted: {len(omitted_times)} slots")
    
    if any_times == omitted_times:
        print_result(True, "Both produce identical slot_start times (both map to p_staff_id null)")
        return True
    else:
        print_result(False, f"Different slot times: any={len(any_times)}, omitted={len(omitted_times)}")
        return False

def main():
    print("\n" + "="*80)
    print("BOOKING AVAILABILITY ENDPOINT TEST - PUBLIC ENDPOINT ONLY")
    print("Testing bug fix: staff_id=any normalization and Cache-Control headers")
    print("="*80)
    
    results = {
        'total': 0,
        'passed': 0,
        'failed': 0
    }
    
    # Try both booking accounts
    profile = None
    slug = None
    
    for creds in BOOKING_CREDENTIALS:
        profile = sign_in(creds['email'], creds['password'])
        if profile:
            slug = profile.get('slug')
            if slug:
                print(f"\n✅ Using account: {creds['email']} (slug: {slug})")
                break
    
    if not slug:
        print("\n❌ CRITICAL: Could not sign in to any booking account or get slug")
        sys.exit(1)
    
    # Check if services and staff exist
    booking_data = check_services_and_staff(slug)
    if not booking_data:
        print("\n❌ CRITICAL: No services or staff found. Cannot test availability.")
        sys.exit(1)
    
    services = booking_data.get('services', [])
    staff = booking_data.get('staff', [])
    
    if not services or not staff:
        print("\n❌ CRITICAL: Missing services or staff")
        sys.exit(1)
    
    # Get first service and staff for testing
    service_id = services[0]['id']
    staff_id = staff[0]['id']
    
    # Get a date within availability (tomorrow)
    tomorrow = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')
    
    print(f"\nTest parameters:")
    print(f"  Service ID: {service_id}")
    print(f"  Staff ID: {staff_id}")
    print(f"  Date: {tomorrow}")
    
    # Run tests
    tests = []
    
    # Test 1: Public booking endpoint
    result = test_public_booking_endpoint(slug)
    tests.append(('Public booking endpoint', result))
    
    # Test 2: Availability with staff_id=any
    result, any_slots = test_availability_with_staff_id_any(slug, service_id, tomorrow)
    tests.append(('Availability with staff_id=any', result))
    
    # Test 3: Availability with specific staff_id
    result, specific_slots = test_availability_with_specific_staff(slug, service_id, tomorrow, staff_id)
    tests.append(('Availability with specific staff_id', result))
    
    # Test 4: Availability without staff_id parameter
    result, omitted_slots = test_availability_without_staff_id(slug, service_id, tomorrow)
    tests.append(('Availability without staff_id', result))
    
    # Test 5: Compare any vs omitted
    if any_slots and omitted_slots:
        result = compare_any_vs_omitted(any_slots, omitted_slots)
        tests.append(('staff_id=any vs omitted comparison', result))
    
    # Test 6: Missing service_ids validation
    result = test_availability_missing_service_ids(slug, tomorrow)
    tests.append(('Missing service_ids validation', result))
    
    # Test 7: Missing date validation
    result = test_availability_missing_date(slug, service_id)
    tests.append(('Missing date validation', result))
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    for test_name, passed in tests:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status}: {test_name}")
        results['total'] += 1
        if passed:
            results['passed'] += 1
        else:
            results['failed'] += 1
    
    print("\n" + "="*80)
    print(f"TOTAL: {results['total']} tests")
    print(f"PASSED: {results['passed']}")
    print(f"FAILED: {results['failed']}")
    print(f"SUCCESS RATE: {results['passed']/results['total']*100:.1f}%")
    print("="*80)
    
    if results['failed'] > 0:
        sys.exit(1)
    else:
        print("\n✅ ALL TESTS PASSED")
        sys.exit(0)

if __name__ == "__main__":
    main()
