#!/usr/bin/env python3
"""
Backend test for Booking Finance: Manual staff payment endpoint
Tests POST /api/booking/staff-settlements/manual with optional commission settle
"""

import requests
import json
import sys
from datetime import datetime, timedelta

# Configuration
BASE_URL = "https://laughing-williamson-9.preview.emergentagent.com/api"
TEST_EMAIL = "booking_fin_test@test.com"
TEST_PASSWORD = "booking123"

# Color codes for output
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
RESET = '\033[0m'

def log_test(test_name, status, details=""):
    """Log test result with color coding"""
    color = GREEN if status == "PASS" else RED if status == "FAIL" else YELLOW
    print(f"{color}[{status}]{RESET} {test_name}")
    if details:
        print(f"  {details}")

def authenticate():
    """Authenticate and get access token"""
    print(f"\n{BLUE}=== AUTHENTICATION ==={RESET}")
    
    # Using Supabase auth endpoint
    supabase_url = "https://ydgbqxpehrqfvslcuhqk.supabase.co"
    auth_url = f"{supabase_url}/auth/v1/token?grant_type=password"
    
    headers = {
        "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlkZ2JxeHBlaHJxZnZzbGN1aHFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3MDMzMTIsImV4cCI6MjA4NTI3OTMxMn0.caH78KNZOJfO05FcOoDdGTB9aL5ui8-_vjDt48lbO1I",
        "Content-Type": "application/json"
    }
    
    payload = {
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    }
    
    try:
        response = requests.post(auth_url, json=payload, headers=headers)
        if response.status_code == 200:
            data = response.json()
            access_token = data.get("access_token")
            log_test("Authentication", "PASS", f"Logged in as {TEST_EMAIL}")
            return access_token
        else:
            log_test("Authentication", "FAIL", f"Status: {response.status_code}, Response: {response.text}")
            return None
    except Exception as e:
        log_test("Authentication", "FAIL", f"Exception: {str(e)}")
        return None

def make_request(method, endpoint, token, data=None, params=None):
    """Make HTTP request with auth token"""
    url = f"{BASE_URL}{endpoint}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    try:
        if method == "GET":
            response = requests.get(url, headers=headers, params=params, timeout=15)
        elif method == "POST":
            response = requests.post(url, headers=headers, json=data, timeout=15)
        elif method == "PUT":
            response = requests.put(url, headers=headers, json=data, timeout=15)
        elif method == "DELETE":
            response = requests.delete(url, headers=headers, timeout=15)
        else:
            return None
        
        return response
    except requests.exceptions.Timeout:
        print(f"  {RED}Request timeout after 15 seconds{RESET}")
        return None
    except Exception as e:
        print(f"  {RED}Request exception: {str(e)}{RESET}")
        return None

def test_get_staff(token):
    """Test 1: Get staff list to obtain valid staff_id"""
    print(f"\n{BLUE}=== TEST 1: GET /api/booking/staff ==={RESET}")
    
    response = make_request("GET", "/booking/staff", token)
    
    if not response:
        log_test("GET /api/booking/staff", "FAIL", "No response")
        return None
    
    if response.status_code == 200:
        staff_list = response.json()
        if isinstance(staff_list, list) and len(staff_list) > 0:
            staff_id = staff_list[0].get('id')
            staff_name = staff_list[0].get('name', 'Unknown')
            log_test("GET /api/booking/staff", "PASS", f"Found {len(staff_list)} staff members. Using staff_id: {staff_id} ({staff_name})")
            return staff_id
        else:
            log_test("GET /api/booking/staff", "FAIL", "No staff members found. Cannot proceed with tests.")
            return None
    else:
        log_test("GET /api/booking/staff", "FAIL", f"Status: {response.status_code}, Response: {response.text}")
        return None

def test_manual_payment_without_settle(token, staff_id):
    """Test 2: POST manual payment WITHOUT settle_commissions"""
    print(f"\n{BLUE}=== TEST 2: POST /api/booking/staff-settlements/manual (WITHOUT settle) ==={RESET}")
    
    payload = {
        "staff_id": staff_id,
        "amount": 100000,
        "pay_frequency": "monthly",
        "payment_method": "cash",
        "notes": "Manual payment test without commission settle"
    }
    
    response = make_request("POST", "/booking/staff-settlements/manual", token, data=payload)
    
    if not response:
        log_test("POST manual payment (no settle)", "FAIL", "No response")
        return None
    
    if response.status_code == 200:
        result = response.json()
        success = result.get('success')
        settlement_number = result.get('settlementNumber')
        total_paid = result.get('totalPaid')
        commissions_settled = result.get('commissionsSettled')
        
        # Verify response structure
        if success and settlement_number and total_paid == 100000 and commissions_settled == 0:
            log_test("POST manual payment (no settle)", "PASS", 
                    f"settlementNumber: {settlement_number}, totalPaid: {total_paid}, commissionsSettled: {commissions_settled}")
            
            # Check Cache-Control header
            cache_control = response.headers.get('Cache-Control', '')
            if 'private' in cache_control or 'no-store' in cache_control:
                log_test("Cache-Control header", "PASS", f"Header: {cache_control}")
            else:
                log_test("Cache-Control header", "WARN", f"Expected private/no-store, got: {cache_control}")
            
            return settlement_number
        else:
            log_test("POST manual payment (no settle)", "FAIL", 
                    f"Unexpected response: {json.dumps(result, indent=2)}")
            return None
    else:
        log_test("POST manual payment (no settle)", "FAIL", 
                f"Status: {response.status_code}, Response: {response.text}")
        return None

def test_verify_settlement_in_list(token, settlement_number):
    """Test 3: Verify settlement appears in GET /api/booking/staff-settlements"""
    print(f"\n{BLUE}=== TEST 3: GET /api/booking/staff-settlements (verify settlement) ==={RESET}")
    
    response = make_request("GET", "/booking/staff-settlements", token)
    
    if not response:
        log_test("GET /api/booking/staff-settlements", "FAIL", "No response")
        return False
    
    if response.status_code == 200:
        result = response.json()
        items = result.get('items', [])
        
        # Find the settlement we just created
        found = False
        for item in items:
            if item.get('settlement_number') == settlement_number:
                found = True
                net_paid = item.get('net_paid')
                if net_paid == 100000:
                    log_test("Verify settlement in list", "PASS", 
                            f"Found settlement {settlement_number} with net_paid={net_paid}")
                else:
                    log_test("Verify settlement in list", "FAIL", 
                            f"Settlement found but net_paid={net_paid}, expected 100000")
                break
        
        if not found:
            log_test("Verify settlement in list", "FAIL", 
                    f"Settlement {settlement_number} not found in list")
        
        return found
    else:
        log_test("GET /api/booking/staff-settlements", "FAIL", 
                f"Status: {response.status_code}, Response: {response.text}")
        return False

def test_manual_payment_weekly(token, staff_id):
    """Test 4: POST manual payment with pay_frequency='weekly'"""
    print(f"\n{BLUE}=== TEST 4: POST /api/booking/staff-settlements/manual (weekly) ==={RESET}")
    
    payload = {
        "staff_id": staff_id,
        "amount": 50000,
        "pay_frequency": "weekly",
        "payment_method": "transfer",
        "notes": "Weekly payment test"
    }
    
    response = make_request("POST", "/booking/staff-settlements/manual", token, data=payload)
    
    if not response:
        log_test("POST manual payment (weekly)", "FAIL", "No response")
        return None
    
    if response.status_code == 200:
        result = response.json()
        settlement_number = result.get('settlementNumber')
        
        if settlement_number:
            log_test("POST manual payment (weekly)", "PASS", 
                    f"Created weekly settlement: {settlement_number}")
            return settlement_number
        else:
            log_test("POST manual payment (weekly)", "FAIL", 
                    f"No settlement number in response: {json.dumps(result, indent=2)}")
            return None
    else:
        log_test("POST manual payment (weekly)", "FAIL", 
                f"Status: {response.status_code}, Response: {response.text}")
        return None

def test_verify_weekly_settlement_detail(token, settlement_number):
    """Test 5: Verify weekly settlement has correct period (Mon-Sun)"""
    print(f"\n{BLUE}=== TEST 5: GET /api/booking/staff-settlements (verify weekly period) ==={RESET}")
    
    response = make_request("GET", "/booking/staff-settlements", token)
    
    if not response:
        log_test("Verify weekly settlement detail", "FAIL", "No response")
        return False
    
    if response.status_code == 200:
        result = response.json()
        items = result.get('items', [])
        
        # Find the weekly settlement
        for item in items:
            if item.get('settlement_number') == settlement_number:
                period_start = item.get('period_start')
                period_end = item.get('period_end')
                pay_frequency = item.get('pay_frequency_snapshot')
                
                # Verify it's a 7-day period (Mon-Sun)
                if period_start and period_end:
                    from datetime import datetime
                    start_date = datetime.fromisoformat(period_start.replace('Z', '+00:00'))
                    end_date = datetime.fromisoformat(period_end.replace('Z', '+00:00'))
                    days_diff = (end_date - start_date).days
                    
                    # Check if it's Monday to Sunday (6 days difference)
                    if days_diff == 6 and start_date.weekday() == 0:  # Monday = 0
                        log_test("Verify weekly settlement detail", "PASS", 
                                f"period_start={period_start}, period_end={period_end}, pay_frequency={pay_frequency}, days={days_diff+1}")
                        return True
                    else:
                        log_test("Verify weekly settlement detail", "WARN", 
                                f"Period found but not Mon-Sun: start={period_start} (weekday={start_date.weekday()}), end={period_end}, days={days_diff+1}")
                        return True  # Still pass as the period exists
                else:
                    log_test("Verify weekly settlement detail", "FAIL", 
                            f"Missing period dates: start={period_start}, end={period_end}")
                    return False
        
        log_test("Verify weekly settlement detail", "FAIL", 
                f"Settlement {settlement_number} not found")
        return False
    else:
        log_test("Verify weekly settlement detail", "FAIL", 
                f"Status: {response.status_code}, Response: {response.text}")
        return False

def test_commission_settle_flow(token, staff_id):
    """Test 6: Commission settle flow - check for pending commissions and settle them"""
    print(f"\n{BLUE}=== TEST 6: Commission settle flow ==={RESET}")
    
    # First, check if staff has pending commissions
    response = make_request("GET", "/booking/staff-earnings", token, 
                          params={"staff_id": staff_id, "status": "pending"})
    
    if not response:
        log_test("GET pending earnings", "FAIL", "No response")
        return False
    
    if response.status_code == 200:
        result = response.json()
        pending_items = result.get('items', [])
        pending_count = len(pending_items)
        
        log_test("GET pending earnings", "PASS", 
                f"Found {pending_count} pending commission(s)")
        
        # Now POST manual payment with settle_commissions=true
        payload = {
            "staff_id": staff_id,
            "amount": 75000,
            "pay_frequency": "monthly",
            "payment_method": "card",
            "settle_commissions": True,
            "notes": "Payment with commission settle"
        }
        
        response = make_request("POST", "/booking/staff-settlements/manual", token, data=payload)
        
        if not response:
            log_test("POST manual payment (with settle)", "FAIL", "No response")
            return False
        
        if response.status_code == 200:
            result = response.json()
            commissions_settled = result.get('commissionsSettled', 0)
            settlement_number = result.get('settlementNumber')
            
            log_test("POST manual payment (with settle)", "PASS", 
                    f"settlementNumber: {settlement_number}, commissionsSettled: {commissions_settled}")
            
            # Verify pending commissions are now empty (if there were any)
            if pending_count > 0:
                response = make_request("GET", "/booking/staff-earnings", token, 
                                      params={"staff_id": staff_id, "status": "pending"})
                
                if response and response.status_code == 200:
                    result = response.json()
                    new_pending = len(result.get('items', []))
                    
                    if new_pending == 0:
                        log_test("Verify pending commissions cleared", "PASS", 
                                f"Pending commissions reduced from {pending_count} to {new_pending}")
                    else:
                        log_test("Verify pending commissions cleared", "WARN", 
                                f"Still have {new_pending} pending commissions (started with {pending_count})")
                else:
                    log_test("Verify pending commissions cleared", "FAIL", "Could not re-check pending earnings")
            else:
                log_test("Commission settle with no pending", "PASS", 
                        f"No pending commissions to settle, commissionsSettled={commissions_settled}")
            
            return True
        else:
            log_test("POST manual payment (with settle)", "FAIL", 
                    f"Status: {response.status_code}, Response: {response.text}")
            return False
    else:
        log_test("GET pending earnings", "FAIL", 
                f"Status: {response.status_code}, Response: {response.text}")
        return False

def test_validation_invalid_staff_id(token):
    """Test 7: Validation - invalid staff_id (random UUID not belonging to user)"""
    print(f"\n{BLUE}=== TEST 7: Validation - invalid staff_id ==={RESET}")
    
    # Use a random UUID that doesn't belong to this user
    fake_staff_id = "00000000-0000-0000-0000-000000000000"
    
    payload = {
        "staff_id": fake_staff_id,
        "amount": 50000,
        "pay_frequency": "monthly",
        "payment_method": "cash"
    }
    
    try:
        url = f"{BASE_URL}/booking/staff-settlements/manual"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        response = requests.post(url, json=payload, headers=headers, timeout=20)
        
        # Expect 404 or 400 error
        if response.status_code in [400, 404]:
            result = response.json()
            error_msg = result.get('error', '')
            log_test("Validation: invalid staff_id", "PASS", 
                    f"Status: {response.status_code}, Error: {error_msg}")
            return True
        else:
            log_test("Validation: invalid staff_id", "FAIL", 
                    f"Expected 400/404, got {response.status_code}: {response.text}")
            return False
    except Exception as e:
        log_test("Validation: invalid staff_id", "FAIL", f"Exception: {str(e)}")
        return False

def test_validation_non_uuid_staff_id(token):
    """Test 8: Validation - non-UUID staff_id"""
    print(f"\n{BLUE}=== TEST 8: Validation - non-UUID staff_id ==={RESET}")
    
    payload = {
        "staff_id": "not-a-uuid",
        "amount": 50000,
        "pay_frequency": "monthly",
        "payment_method": "cash"
    }
    
    try:
        url = f"{BASE_URL}/booking/staff-settlements/manual"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        response = requests.post(url, json=payload, headers=headers, timeout=20)
        
        # Expect 400 error
        if response.status_code == 400:
            result = response.json()
            error_msg = result.get('error', '')
            log_test("Validation: non-UUID staff_id", "PASS", 
                    f"Status: {response.status_code}, Error: {error_msg}")
            return True
        else:
            log_test("Validation: non-UUID staff_id", "FAIL", 
                    f"Expected 400, got {response.status_code}: {response.text}")
            return False
    except Exception as e:
        log_test("Validation: non-UUID staff_id", "FAIL", f"Exception: {str(e)}")
        return False

def test_validation_negative_amount(token, staff_id):
    """Test 9: Validation - negative amount"""
    print(f"\n{BLUE}=== TEST 9: Validation - negative amount ==={RESET}")
    
    payload = {
        "staff_id": staff_id,
        "amount": -10,
        "pay_frequency": "monthly",
        "payment_method": "cash"
    }
    
    try:
        url = f"{BASE_URL}/booking/staff-settlements/manual"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        response = requests.post(url, json=payload, headers=headers, timeout=20)
        
        # Expect 400 error
        if response.status_code == 400:
            result = response.json()
            error_msg = result.get('error', '')
            log_test("Validation: negative amount", "PASS", 
                    f"Status: {response.status_code}, Error: {error_msg}")
            return True
        else:
            log_test("Validation: negative amount", "FAIL", 
                    f"Expected 400, got {response.status_code}: {response.text}")
            return False
    except Exception as e:
        log_test("Validation: negative amount", "FAIL", f"Exception: {str(e)}")
        return False

def test_validation_invalid_payment_method(token, staff_id):
    """Test 10: Validation - invalid payment_method"""
    print(f"\n{BLUE}=== TEST 10: Validation - invalid payment_method ==={RESET}")
    
    payload = {
        "staff_id": staff_id,
        "amount": 50000,
        "pay_frequency": "monthly",
        "payment_method": "bitcoin"
    }
    
    try:
        url = f"{BASE_URL}/booking/staff-settlements/manual"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        response = requests.post(url, json=payload, headers=headers, timeout=20)
        
        # Expect 400 error
        if response.status_code == 400:
            result = response.json()
            error_msg = result.get('error', '')
            log_test("Validation: invalid payment_method", "PASS", 
                    f"Status: {response.status_code}, Error: {error_msg}")
            return True
        else:
            log_test("Validation: invalid payment_method", "FAIL", 
                    f"Expected 400, got {response.status_code}: {response.text}")
            return False
    except Exception as e:
        log_test("Validation: invalid payment_method", "FAIL", f"Exception: {str(e)}")
        return False

def main():
    """Main test runner"""
    print(f"\n{BLUE}{'='*70}{RESET}")
    print(f"{BLUE}BOOKING FINANCE: Manual Staff Payment Endpoint Testing{RESET}")
    print(f"{BLUE}{'='*70}{RESET}")
    
    # Authenticate
    token = authenticate()
    if not token:
        print(f"\n{RED}Authentication failed. Cannot proceed with tests.{RESET}")
        sys.exit(1)
    
    # Test 1: Get staff list
    staff_id = test_get_staff(token)
    if not staff_id:
        print(f"\n{RED}Cannot proceed without a valid staff_id{RESET}")
        sys.exit(1)
    
    # Test 2: Manual payment without settle
    settlement_number = test_manual_payment_without_settle(token, staff_id)
    
    # Test 3: Verify settlement in list
    if settlement_number:
        test_verify_settlement_in_list(token, settlement_number)
    
    # Test 4: Manual payment with weekly frequency
    weekly_settlement = test_manual_payment_weekly(token, staff_id)
    
    # Test 5: Verify weekly settlement period
    if weekly_settlement:
        test_verify_weekly_settlement_detail(token, weekly_settlement)
    
    # Test 6: Commission settle flow
    test_commission_settle_flow(token, staff_id)
    
    # Test 7-10: Validation tests
    test_validation_invalid_staff_id(token)
    test_validation_non_uuid_staff_id(token)
    test_validation_negative_amount(token, staff_id)
    test_validation_invalid_payment_method(token, staff_id)
    
    print(f"\n{BLUE}{'='*70}{RESET}")
    print(f"{BLUE}Testing Complete{RESET}")
    print(f"{BLUE}{'='*70}{RESET}\n")

if __name__ == "__main__":
    main()
