#!/usr/bin/env python3
"""
Booking Finance Backend Test Suite
Tests all booking finance endpoints end-to-end following the 9-step flow.
"""

import requests
import json
import sys
from datetime import datetime, timedelta
from typing import Dict, Any, Optional

# Configuration
BASE_URL = "https://staff-manager-171.preview.emergentagent.com/api"
BOOKING_EMAIL = "booking_fin_test@test.com"
BOOKING_PASSWORD = "booking123"
NON_BOOKING_EMAIL = "ortiz@gmail.com"
NON_BOOKING_PASSWORD = "ortiz123"

# Global state
booking_token = None
non_booking_token = None
test_data = {}

def log(message: str, level: str = "INFO"):
    """Log a message with timestamp"""
    timestamp = datetime.now().strftime("%H:%M:%S")
    print(f"[{timestamp}] [{level}] {message}")

def decode_base64(data: str) -> bytes:
    """Decode base64 with padding fix"""
    missing_padding = len(data) % 4
    if missing_padding:
        data += '=' * (4 - missing_padding)
    import base64
    return base64.b64decode(data)

def login(email: str, password: str) -> Optional[str]:
    """Login and return access token"""
    try:
        log(f"Logging in as {email}...")
        response = requests.post(
            f"{BASE_URL}/auth/signin",
            json={"email": email, "password": password},
            timeout=10
        )
        if response.status_code == 200:
            # Extract access token from Supabase auth cookie
            cookies = response.cookies
            auth_cookie = cookies.get('sb-ydgbqxpehrqfvslcuhqk-auth-token')
            
            if auth_cookie and auth_cookie.startswith('base64-'):
                try:
                    decoded = decode_base64(auth_cookie[7:]).decode('utf-8')
                    session_data = json.loads(decoded)
                    token = session_data.get('access_token')
                    if token:
                        log(f"✅ Login successful for {email}", "SUCCESS")
                        return token
                except Exception as e:
                    log(f"❌ Failed to extract token from cookie: {str(e)}", "ERROR")
                    return None
            
            log(f"❌ No auth cookie found for {email}", "ERROR")
            return None
        else:
            log(f"❌ Login failed for {email}: {response.status_code} - {response.text}", "ERROR")
            return None
    except Exception as e:
        log(f"❌ Login exception for {email}: {str(e)}", "ERROR")
        return None

def api_call(method: str, endpoint: str, token: str, data: Optional[Dict] = None, params: Optional[Dict] = None) -> tuple:
    """Make an API call and return (status_code, response_data)"""
    url = f"{BASE_URL}/{endpoint}"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    try:
        if method == "GET":
            response = requests.get(url, headers=headers, params=params, timeout=10)
        elif method == "POST":
            response = requests.post(url, headers=headers, json=data, timeout=10)
        elif method == "PUT":
            response = requests.put(url, headers=headers, json=data, timeout=10)
        elif method == "DELETE":
            response = requests.delete(url, headers=headers, timeout=10)
        else:
            return (0, {"error": f"Unknown method: {method}"})
        
        try:
            return (response.status_code, response.json())
        except:
            return (response.status_code, {"text": response.text})
    except Exception as e:
        log(f"❌ API call exception: {str(e)}", "ERROR")
        return (0, {"error": str(e)})

def test_step_1_setup():
    """STEP 1: SETUP - Create categories and services"""
    log("\n" + "="*80)
    log("STEP 1: SETUP - Creating service categories and services")
    log("="*80)
    
    # Use timestamp to make names unique
    timestamp = datetime.now().strftime("%H%M%S")
    
    # Create service category
    log("Creating service category 'Cabello'...")
    status, data = api_call("POST", "booking/service-categories", booking_token, {
        "name": f"Cabello-{timestamp}",
        "color": "#f59e0b"
    })
    
    if status == 200 and data.get("id"):
        test_data["category_id"] = data["id"]
        log(f"✅ Category created: {data['id']}", "SUCCESS")
    else:
        log(f"❌ Failed to create category: {status} - {data}", "ERROR")
        return False
    
    # Create service 1: Corte
    log("Creating service 'Corte' (100000, 30min)...")
    status, data = api_call("POST", "booking/services", booking_token, {
        "name": "Corte",
        "category_id": test_data["category_id"],
        "price": 100000,
        "duration_minutes": 30
    })
    
    if status == 200 and data.get("id"):
        test_data["service1_id"] = data["id"]
        log(f"✅ Service 'Corte' created: {data['id']}", "SUCCESS")
    else:
        log(f"❌ Failed to create service 'Corte': {status} - {data}", "ERROR")
        return False
    
    # Create service 2: Color
    log("Creating service 'Color' (200000, 60min)...")
    status, data = api_call("POST", "booking/services", booking_token, {
        "name": "Color",
        "category_id": test_data["category_id"],
        "price": 200000,
        "duration_minutes": 60
    })
    
    if status == 200 and data.get("id"):
        test_data["service2_id"] = data["id"]
        log(f"✅ Service 'Color' created: {data['id']}", "SUCCESS")
    else:
        log(f"❌ Failed to create service 'Color': {status} - {data}", "ERROR")
        return False
    
    return True

def test_step_2_staff():
    """STEP 2: STAFF with employment + commission assignments"""
    log("\n" + "="*80)
    log("STEP 2: STAFF - Creating staff with employment fields and commission assignments")
    log("="*80)
    
    # Create staff with employment fields and service assignments
    log("Creating staff 'Ana' with mixed compensation and service assignments...")
    status, data = api_call("POST", "booking/staff", booking_token, {
        "name": "Ana",
        "job_title": "Estilista",
        "is_active": True,
        "is_bookable": True,
        "compensation_type": "mixed",
        "pay_frequency": "weekly",
        "salary_amount": 500000,
        "default_commission_percent": 40,
        "pay_weekday": 5,
        "employment_notes": "test",
        "service_assignments": [
            {"service_id": test_data["service1_id"], "commission_percent": 50},
            {"service_id": test_data["service2_id"], "commission_percent": None}
        ]
    })
    
    if status == 200 and data.get("id"):
        test_data["staff1_id"] = data["id"]
        log(f"✅ Staff 'Ana' created: {data['id']}", "SUCCESS")
    else:
        log(f"❌ Failed to create staff: {status} - {data}", "ERROR")
        return False
    
    # GET staff and verify new fields
    log("Verifying staff fields...")
    status, data = api_call("GET", "booking/staff", booking_token)
    
    if status == 200 and isinstance(data, list):
        staff = next((s for s in data if s.get("id") == test_data["staff1_id"]), None)
        if staff:
            checks = [
                ("compensation_type", "mixed"),
                ("salary_amount", 500000),
                ("default_commission_percent", 40),
                ("is_bookable", True)
            ]
            all_ok = True
            for field, expected in checks:
                actual = staff.get(field)
                if actual == expected:
                    log(f"✅ {field} = {actual}", "SUCCESS")
                else:
                    log(f"❌ {field} mismatch: expected {expected}, got {actual}", "ERROR")
                    all_ok = False
            if not all_ok:
                return False
        else:
            log(f"❌ Staff not found in list", "ERROR")
            return False
    else:
        log(f"❌ Failed to get staff: {status} - {data}", "ERROR")
        return False
    
    # GET staff-services and verify commission assignments
    log("Verifying staff-services assignments...")
    status, data = api_call("GET", "booking/staff-services", booking_token, params={"staff_id": test_data["staff1_id"]})
    
    if status == 200 and isinstance(data, list):
        if len(data) == 2:
            log(f"✅ Found 2 service assignments", "SUCCESS")
            for assignment in data:
                service_id = assignment.get("service_id")
                commission = assignment.get("commission_percent")
                if service_id == test_data["service1_id"]:
                    if commission == 50:
                        log(f"✅ Service1 commission = 50%", "SUCCESS")
                    else:
                        log(f"❌ Service1 commission mismatch: expected 50, got {commission}", "ERROR")
                        return False
                elif service_id == test_data["service2_id"]:
                    if commission is None:
                        log(f"✅ Service2 commission = null (uses default)", "SUCCESS")
                    else:
                        log(f"❌ Service2 commission should be null, got {commission}", "ERROR")
                        return False
        else:
            log(f"❌ Expected 2 assignments, got {len(data)}", "ERROR")
            return False
    else:
        log(f"❌ Failed to get staff-services: {status} - {data}", "ERROR")
        return False
    
    # Test removing Service2 and re-adding
    log("Testing service assignment removal and re-add...")
    status, data = api_call("PUT", f"booking/staff/{test_data['staff1_id']}", booking_token, {
        "name": "Ana",
        "service_assignments": [
            {"service_id": test_data["service1_id"], "commission_percent": 50}
        ]
    })
    
    if status == 200:
        log(f"✅ Updated staff to remove Service2", "SUCCESS")
        # Verify only Service1 remains
        status, data = api_call("GET", "booking/staff-services", booking_token, params={"staff_id": test_data["staff1_id"]})
        if status == 200 and len(data) == 1 and data[0].get("service_id") == test_data["service1_id"]:
            log(f"✅ Only Service1 remains (no duplicates)", "SUCCESS")
        else:
            log(f"❌ Service removal verification failed: {data}", "ERROR")
            return False
    else:
        log(f"❌ Failed to update staff: {status} - {data}", "ERROR")
        return False
    
    # Re-add Service2
    log("Re-adding Service2...")
    status, data = api_call("PUT", f"booking/staff/{test_data['staff1_id']}", booking_token, {
        "name": "Ana",
        "service_assignments": [
            {"service_id": test_data["service1_id"], "commission_percent": 50},
            {"service_id": test_data["service2_id"], "commission_percent": None}
        ]
    })
    
    if status == 200:
        log(f"✅ Re-added Service2", "SUCCESS")
    else:
        log(f"❌ Failed to re-add Service2: {status} - {data}", "ERROR")
        return False
    
    # Validation: invalid commission percent
    log("Testing validation: commission_percent > 100...")
    status, data = api_call("POST", "booking/staff", booking_token, {
        "name": "Invalid Staff",
        "default_commission_percent": 150
    })
    
    if status == 400:
        log(f"✅ Validation rejected commission > 100", "SUCCESS")
    else:
        log(f"❌ Validation should reject commission > 100: {status} - {data}", "ERROR")
        return False
    
    # Validation: empty name
    log("Testing validation: empty name...")
    status, data = api_call("POST", "booking/staff", booking_token, {
        "name": ""
    })
    
    if status == 400:
        log(f"✅ Validation rejected empty name", "SUCCESS")
    else:
        log(f"❌ Validation should reject empty name: {status} - {data}", "ERROR")
        return False
    
    return True

def test_step_3_manual_sales():
    """STEP 3: MANUAL SERVICE SALE"""
    log("\n" + "="*80)
    log("STEP 3: MANUAL SERVICE SALE - Creating paid and pending sales")
    log("="*80)
    
    # Create paid sale
    log("Creating PAID sale (mark_paid=true)...")
    now = datetime.utcnow().isoformat() + "Z"
    status, data = api_call("POST", "booking/service-sales", booking_token, {
        "items": [
            {
                "service_id": test_data["service1_id"],
                "staff_id": test_data["staff1_id"],
                "quantity": 1,
                "unit_price": 100000,
                "discount_amount": 0
            }
        ],
        "mark_paid": True,
        "payment_method": "cash",
        "customer_name": "Cliente Uno",
        "completed_at": now
    })
    
    if status == 200 and data.get("saleId"):
        test_data["paid_sale_id"] = data["saleId"]
        payment_status = data.get("paymentStatus")
        if payment_status == "paid":
            log(f"✅ Paid sale created: {data['saleId']}, status={payment_status}", "SUCCESS")
        else:
            log(f"❌ Payment status should be 'paid', got '{payment_status}'", "ERROR")
            return False
    else:
        log(f"❌ Failed to create paid sale: {status} - {data}", "ERROR")
        return False
    
    # Create pending sale
    log("Creating PENDING sale (mark_paid=false)...")
    status, data = api_call("POST", "booking/service-sales", booking_token, {
        "items": [
            {
                "service_id": test_data["service2_id"],
                "staff_id": test_data["staff1_id"],
                "quantity": 1,
                "unit_price": 200000,
                "discount_amount": 20000
            }
        ],
        "mark_paid": False,
        "customer_name": "Cliente Dos",
        "completed_at": now
    })
    
    if status == 200 and data.get("saleId"):
        test_data["pending_sale_id"] = data["saleId"]
        payment_status = data.get("paymentStatus")
        if payment_status == "pending":
            log(f"✅ Pending sale created: {data['saleId']}, status={payment_status}", "SUCCESS")
        else:
            log(f"❌ Payment status should be 'pending', got '{payment_status}'", "ERROR")
            return False
    else:
        log(f"❌ Failed to create pending sale: {status} - {data}", "ERROR")
        return False
    
    # Validation: 0 items
    log("Testing validation: 0 items...")
    status, data = api_call("POST", "booking/service-sales", booking_token, {
        "items": [],
        "mark_paid": False
    })
    
    if status == 400:
        log(f"✅ Validation rejected 0 items", "SUCCESS")
    else:
        log(f"❌ Validation should reject 0 items: {status} - {data}", "ERROR")
        return False
    
    # Validation: mark_paid without payment_method
    log("Testing validation: mark_paid=true without payment_method...")
    status, data = api_call("POST", "booking/service-sales", booking_token, {
        "items": [
            {
                "service_id": test_data["service1_id"],
                "staff_id": test_data["staff1_id"],
                "quantity": 1,
                "unit_price": 100000,
                "discount_amount": 0
            }
        ],
        "mark_paid": True
    })
    
    if status == 400:
        log(f"✅ Validation rejected mark_paid without payment_method", "SUCCESS")
    else:
        log(f"❌ Validation should reject mark_paid without payment_method: {status} - {data}", "ERROR")
        return False
    
    return True

def test_step_4_list_and_pay():
    """STEP 4: LIST + PAY"""
    log("\n" + "="*80)
    log("STEP 4: LIST + PAY - Listing sales and paying pending sale")
    log("="*80)
    
    # GET all sales
    log("Getting all service sales...")
    status, data = api_call("GET", "booking/service-sales", booking_token)
    
    if status == 200 and data.get("items"):
        items = data["items"]
        log(f"✅ Retrieved {len(items)} sales", "SUCCESS")
        
        # Verify both sales are present
        paid_found = any(s.get("id") == test_data["paid_sale_id"] for s in items)
        pending_found = any(s.get("id") == test_data["pending_sale_id"] for s in items)
        
        if paid_found and pending_found:
            log(f"✅ Both paid and pending sales found", "SUCCESS")
        else:
            log(f"❌ Sales not found: paid={paid_found}, pending={pending_found}", "ERROR")
            return False
        
        # Check for embedded items
        for sale in items:
            if sale.get("id") in [test_data["paid_sale_id"], test_data["pending_sale_id"]]:
                sale_items = sale.get("booking_service_sale_items", [])
                if sale_items:
                    item = sale_items[0]
                    if all(k in item for k in ["service_name_snapshot", "staff_name_snapshot", "commission_amount"]):
                        log(f"✅ Sale {sale['id'][:8]}... has embedded items with snapshots", "SUCCESS")
                    else:
                        log(f"❌ Sale items missing required fields", "ERROR")
                        return False
    else:
        log(f"❌ Failed to get sales: {status} - {data}", "ERROR")
        return False
    
    # GET pending sales only
    log("Getting pending sales only...")
    status, data = api_call("GET", "booking/service-sales", booking_token, params={"payment_status": "pending"})
    
    if status == 200 and data.get("items"):
        items = data["items"]
        if all(s.get("payment_status") == "pending" for s in items):
            log(f"✅ All returned sales are pending ({len(items)} items)", "SUCCESS")
        else:
            log(f"❌ Non-pending sales in results", "ERROR")
            return False
    else:
        log(f"❌ Failed to get pending sales: {status} - {data}", "ERROR")
        return False
    
    # GET sales by staff
    log("Getting sales by staff...")
    status, data = api_call("GET", "booking/service-sales", booking_token, params={"staff_id": test_data["staff1_id"]})
    
    if status == 200 and data.get("items"):
        log(f"✅ Retrieved sales for staff ({len(data['items'])} items)", "SUCCESS")
    else:
        log(f"❌ Failed to get sales by staff: {status} - {data}", "ERROR")
        return False
    
    # GET sales by search
    log("Searching sales by customer name...")
    status, data = api_call("GET", "booking/service-sales", booking_token, params={"search": "Cliente"})
    
    if status == 200 and data.get("items"):
        log(f"✅ Search returned {len(data['items'])} results", "SUCCESS")
    else:
        log(f"❌ Failed to search sales: {status} - {data}", "ERROR")
        return False
    
    # Pay the pending sale
    log("Paying the pending sale...")
    status, data = api_call("PUT", f"booking/service-sales/{test_data['pending_sale_id']}/pay", booking_token, {
        "payment_method": "transfer"
    })
    
    if status == 200:
        log(f"✅ Sale marked as paid", "SUCCESS")
        
        # Verify it's now paid
        status, data = api_call("GET", "booking/service-sales", booking_token)
        if status == 200 and data.get("items"):
            sale = next((s for s in data["items"] if s.get("id") == test_data["pending_sale_id"]), None)
            if sale and sale.get("payment_status") == "paid":
                log(f"✅ Sale payment status confirmed as 'paid'", "SUCCESS")
            else:
                log(f"❌ Sale payment status not updated", "ERROR")
                return False
    else:
        log(f"❌ Failed to pay sale: {status} - {data}", "ERROR")
        return False
    
    # Validation: invalid payment method
    log("Testing validation: invalid payment_method...")
    status, data = api_call("PUT", f"booking/service-sales/{test_data['pending_sale_id']}/pay", booking_token, {
        "payment_method": "foo"
    })
    
    if status == 400:
        log(f"✅ Validation rejected invalid payment_method", "SUCCESS")
    else:
        log(f"❌ Validation should reject invalid payment_method: {status} - {data}", "ERROR")
        return False
    
    return True

def test_step_5_staff_earnings():
    """STEP 5: STAFF EARNINGS"""
    log("\n" + "="*80)
    log("STEP 5: STAFF EARNINGS - Verifying commission calculations")
    log("="*80)
    
    # GET staff earnings
    log("Getting staff earnings...")
    status, data = api_call("GET", "booking/staff-earnings", booking_token, params={"staff_id": test_data["staff1_id"]})
    
    if status == 200 and data.get("items"):
        items = data["items"]
        log(f"✅ Retrieved {len(items)} earning items", "SUCCESS")
        
        # All should be pending initially
        if all(item.get("settlement_status") == "pending" for item in items):
            log(f"✅ All earnings have settlement_status='pending'", "SUCCESS")
        else:
            log(f"❌ Some earnings not marked as pending", "ERROR")
            return False
        
        # Verify commission math
        # Service1: net 100000 * 50% = 50000
        # Service2: net 180000 (200000 - 20000) * 40% = 72000
        for item in items:
            service_name = item.get("service_name")
            commission = item.get("commission_amount")
            net = item.get("net_amount")
            percent = item.get("commission_percent")
            
            if "Corte" in service_name:
                expected_commission = 50000
                if commission == expected_commission and net == 100000 and percent == 50:
                    log(f"✅ Service1 commission correct: {net} * {percent}% = {commission}", "SUCCESS")
                else:
                    log(f"❌ Service1 commission wrong: expected {expected_commission}, got {commission} (net={net}, percent={percent})", "ERROR")
                    return False
            elif "Color" in service_name:
                expected_commission = 72000
                if commission == expected_commission and net == 180000 and percent == 40:
                    log(f"✅ Service2 commission correct: {net} * {percent}% = {commission}", "SUCCESS")
                else:
                    log(f"❌ Service2 commission wrong: expected {expected_commission}, got {commission} (net={net}, percent={percent})", "ERROR")
                    return False
    else:
        log(f"❌ Failed to get staff earnings: {status} - {data}", "ERROR")
        return False
    
    # GET paid earnings (should be empty)
    log("Getting paid earnings (should be empty)...")
    status, data = api_call("GET", "booking/staff-earnings", booking_token, params={"staff_id": test_data["staff1_id"], "status": "paid"})
    
    if status == 200 and data.get("items") is not None:
        if len(data["items"]) == 0:
            log(f"✅ No paid earnings yet (correct)", "SUCCESS")
        else:
            log(f"❌ Should have no paid earnings, got {len(data['items'])}", "ERROR")
            return False
    else:
        log(f"❌ Failed to get paid earnings: {status} - {data}", "ERROR")
        return False
    
    return True

def test_step_6_advances():
    """STEP 6: ADVANCES"""
    log("\n" + "="*80)
    log("STEP 6: ADVANCES - Creating and managing staff advances")
    log("="*80)
    
    # Create advance
    log("Creating advance (30000)...")
    today = datetime.utcnow().strftime("%Y-%m-%d")
    status, data = api_call("POST", "booking/staff-advances", booking_token, {
        "staff_id": test_data["staff1_id"],
        "amount": 30000,
        "advance_date": today,
        "payment_method": "cash",
        "notes": "adelanto"
    })
    
    if status == 200 and (data.get("id") or data.get("advanceId")):
        test_data["advance_id"] = data.get("id") or data.get("advanceId")
        log(f"✅ Advance created: {test_data['advance_id']}", "SUCCESS")
    else:
        log(f"❌ Failed to create advance: {status} - {data}", "ERROR")
        return False
    
    # GET advances
    log("Getting advances...")
    status, data = api_call("GET", "booking/staff-advances", booking_token, params={"staff_id": test_data["staff1_id"]})
    
    if status == 200 and data.get("items"):
        advance = next((a for a in data["items"] if a.get("id") == test_data["advance_id"]), None)
        if advance:
            if advance.get("amount") == 30000 and advance.get("applied_amount") == 0 and advance.get("status") == "pending":
                log(f"✅ Advance found with correct values: amount=30000, applied=0, status=pending", "SUCCESS")
            else:
                log(f"❌ Advance values incorrect: {advance}", "ERROR")
                return False
        else:
            log(f"❌ Advance not found in list", "ERROR")
            return False
    else:
        log(f"❌ Failed to get advances: {status} - {data}", "ERROR")
        return False
    
    # Update advance (pending, applied=0)
    log("Updating advance amount to 40000...")
    status, data = api_call("PUT", f"booking/staff-advances/{test_data['advance_id']}", booking_token, {
        "amount": 40000
    })
    
    if status == 200:
        log(f"✅ Advance updated", "SUCCESS")
        
        # Verify update
        status, data = api_call("GET", "booking/staff-advances", booking_token, params={"staff_id": test_data["staff1_id"]})
        if status == 200 and data.get("items"):
            advance = next((a for a in data["items"] if a.get("id") == test_data["advance_id"]), None)
            if advance and advance.get("amount") == 40000:
                log(f"✅ Advance amount updated to 40000", "SUCCESS")
            else:
                log(f"❌ Advance amount not updated", "ERROR")
                return False
    else:
        log(f"❌ Failed to update advance: {status} - {data}", "ERROR")
        return False
    
    return True

def test_step_7_settlement():
    """STEP 7: SETTLEMENT"""
    log("\n" + "="*80)
    log("STEP 7: SETTLEMENT - Creating staff settlement and verifying advance application")
    log("="*80)
    
    # Create settlement
    log("Creating settlement...")
    today = datetime.utcnow().strftime("%Y-%m-%d")
    week_ago = (datetime.utcnow() - timedelta(days=7)).strftime("%Y-%m-%d")
    
    status, data = api_call("POST", "booking/staff-settlements", booking_token, {
        "staff_id": test_data["staff1_id"],
        "period_start": week_ago,
        "period_end": today,
        "payment_method": "cash",
        "notes": "pago semanal"
    })
    
    if status == 200 and (data.get("settlementId") or data.get("id")):
        test_data["settlement_id"] = data.get("settlementId") or data.get("id")
        log(f"✅ Settlement created: {test_data['settlement_id']}", "SUCCESS")
        
        # Check totals
        if "commissions" in data or "commission_total" in data:
            log(f"✅ Settlement includes commission totals", "SUCCESS")
        if "advances" in data or "advances_total" in data:
            log(f"✅ Settlement includes advances", "SUCCESS")
        if "totalPaid" in data or "net_paid" in data:
            log(f"✅ Settlement includes net paid amount", "SUCCESS")
    else:
        log(f"❌ Failed to create settlement: {status} - {data}", "ERROR")
        return False
    
    # GET settlements list
    log("Getting settlements list...")
    status, data = api_call("GET", "booking/staff-settlements", booking_token, params={"staff_id": test_data["staff1_id"]})
    
    if status == 200 and data.get("items"):
        settlement = next((s for s in data["items"] if s.get("id") == test_data["settlement_id"]), None)
        if settlement:
            log(f"✅ Settlement found in list", "SUCCESS")
        else:
            log(f"❌ Settlement not found in list", "ERROR")
            return False
    else:
        log(f"❌ Failed to get settlements: {status} - {data}", "ERROR")
        return False
    
    # GET settlement detail
    log("Getting settlement detail...")
    status, data = api_call("GET", f"booking/staff-settlements/{test_data['settlement_id']}", booking_token)
    
    if status == 200:
        if data.get("settlement") and data.get("staff"):
            log(f"✅ Settlement detail includes settlement and staff", "SUCCESS")
        if data.get("lines") and len(data["lines"]) > 0:
            log(f"✅ Settlement has {len(data['lines'])} commission lines", "SUCCESS")
        else:
            log(f"❌ Settlement should have commission lines", "ERROR")
            return False
        if data.get("advances"):
            log(f"✅ Settlement includes advances applied", "SUCCESS")
    else:
        log(f"❌ Failed to get settlement detail: {status} - {data}", "ERROR")
        return False
    
    # Verify earnings are now marked as paid
    log("Verifying earnings are marked as paid...")
    status, data = api_call("GET", "booking/staff-earnings", booking_token, params={"staff_id": test_data["staff1_id"], "status": "paid"})
    
    if status == 200 and data.get("items"):
        if len(data["items"]) > 0:
            log(f"✅ Found {len(data['items'])} paid earnings", "SUCCESS")
        else:
            log(f"❌ Should have paid earnings after settlement", "ERROR")
            return False
    else:
        log(f"❌ Failed to get paid earnings: {status} - {data}", "ERROR")
        return False
    
    # Test 409: try to edit applied advance
    log("Testing 409: editing applied advance...")
    status, data = api_call("PUT", f"booking/staff-advances/{test_data['advance_id']}", booking_token, {
        "amount": 99999
    })
    
    if status == 409:
        log(f"✅ Cannot edit applied advance (409)", "SUCCESS")
    else:
        log(f"❌ Should return 409 for applied advance edit: {status} - {data}", "ERROR")
        return False
    
    # Test 409: try to delete applied advance
    log("Testing 409: deleting applied advance...")
    status, data = api_call("DELETE", f"booking/staff-advances/{test_data['advance_id']}", booking_token)
    
    if status == 409:
        log(f"✅ Cannot delete applied advance (409)", "SUCCESS")
    else:
        log(f"❌ Should return 409 for applied advance delete: {status} - {data}", "ERROR")
        return False
    
    return True

def test_step_8_finance_dashboard():
    """STEP 8: FINANCE DASHBOARD + SUMMARY + PENDING CHECKOUTS"""
    log("\n" + "="*80)
    log("STEP 8: FINANCE DASHBOARD + SUMMARY + PENDING CHECKOUTS")
    log("="*80)
    
    # GET finance dashboard
    log("Getting finance dashboard...")
    today = datetime.utcnow().strftime("%Y-%m-%d")
    month_start = datetime.utcnow().replace(day=1).strftime("%Y-%m-%d")
    
    status, data = api_call("GET", "booking/finance/dashboard", booking_token, params={"from": month_start, "to": today})
    
    if status == 200:
        required_keys = ["serviceRevenue", "pendingServiceCollection", "servicesPerformedCount", "paidServiceSalesCount", "commissionsGenerated", "servicePaymentMethods"]
        missing = [k for k in required_keys if k not in data]
        if not missing:
            log(f"✅ Dashboard has all required keys", "SUCCESS")
        else:
            log(f"❌ Dashboard missing keys: {missing}", "ERROR")
            return False
    else:
        log(f"❌ Failed to get dashboard: {status} - {data}", "ERROR")
        return False
    
    # GET staff summary
    log("Getting staff finance summary...")
    status, data = api_call("GET", "booking/finance/staff-summary", booking_token, params={"from": month_start, "to": today})
    
    if status == 200 and isinstance(data, list):
        if len(data) > 0:
            staff = data[0]
            required_keys = ["commissionPending", "advancesRemaining", "salaryAmount", "compensationType"]
            missing = [k for k in required_keys if k not in staff]
            if not missing:
                log(f"✅ Staff summary has all required keys", "SUCCESS")
            else:
                log(f"❌ Staff summary missing keys: {missing}", "ERROR")
                return False
        else:
            log(f"⚠️  Staff summary returned empty array (may be OK if no data)", "WARNING")
    else:
        log(f"❌ Failed to get staff summary: {status} - {data}", "ERROR")
        return False
    
    # GET pending checkouts
    log("Getting pending checkouts...")
    status, data = api_call("GET", "booking/checkouts/pending", booking_token, params={"limit": 50, "offset": 0})
    
    if status == 200:
        if "items" in data and "limit" in data and "offset" in data:
            log(f"✅ Pending checkouts returned correct structure (items={len(data.get('items', []))})", "SUCCESS")
        else:
            log(f"❌ Pending checkouts missing required keys", "ERROR")
            return False
    else:
        log(f"❌ Failed to get pending checkouts: {status} - {data}", "ERROR")
        return False
    
    # Test validation: dashboard without from/to
    log("Testing validation: dashboard without from/to...")
    status, data = api_call("GET", "booking/finance/dashboard", booking_token)
    
    if status == 400:
        log(f"✅ Dashboard requires from/to parameters", "SUCCESS")
    else:
        log(f"❌ Dashboard should require from/to: {status} - {data}", "ERROR")
        return False
    
    return True

def test_step_9_403_guard():
    """STEP 9: 403 GUARD - Test non-booking account access"""
    log("\n" + "="*80)
    log("STEP 9: 403 GUARD - Testing non-booking account restrictions")
    log("="*80)
    
    # Login as non-booking account
    global non_booking_token
    non_booking_token = login(NON_BOOKING_EMAIL, NON_BOOKING_PASSWORD)
    if not non_booking_token:
        log(f"❌ Failed to login as non-booking account", "ERROR")
        return False
    
    # Try to access finance dashboard
    log("Testing 403: non-booking account accessing finance dashboard...")
    today = datetime.utcnow().strftime("%Y-%m-%d")
    status, data = api_call("GET", "booking/finance/dashboard", non_booking_token, params={"from": "2026-01-01", "to": "2026-12-31"})
    
    if status == 403:
        error_msg = data.get("error", "")
        if "agendamientos" in error_msg.lower():
            log(f"✅ Non-booking account blocked with correct message: '{error_msg}'", "SUCCESS")
        else:
            log(f"✅ Non-booking account blocked (403)", "SUCCESS")
    else:
        log(f"❌ Should return 403 for non-booking account: {status} - {data}", "ERROR")
        return False
    
    # Try to access service-sales
    log("Testing 403: non-booking account accessing service-sales...")
    status, data = api_call("GET", "booking/service-sales", non_booking_token)
    
    if status == 403:
        log(f"✅ Non-booking account blocked from service-sales", "SUCCESS")
    else:
        log(f"❌ Should return 403 for service-sales: {status} - {data}", "ERROR")
        return False
    
    return True

def main():
    """Main test runner"""
    global booking_token
    
    log("="*80)
    log("BOOKING FINANCE BACKEND TEST SUITE")
    log("="*80)
    
    # Login
    booking_token = login(BOOKING_EMAIL, BOOKING_PASSWORD)
    if not booking_token:
        log("❌ Failed to login as booking account. Cannot proceed.", "ERROR")
        sys.exit(1)
    
    # Run all test steps
    steps = [
        ("STEP 1: SETUP", test_step_1_setup),
        ("STEP 2: STAFF", test_step_2_staff),
        ("STEP 3: MANUAL SALES", test_step_3_manual_sales),
        ("STEP 4: LIST + PAY", test_step_4_list_and_pay),
        ("STEP 5: STAFF EARNINGS", test_step_5_staff_earnings),
        ("STEP 6: ADVANCES", test_step_6_advances),
        ("STEP 7: SETTLEMENT", test_step_7_settlement),
        ("STEP 8: FINANCE DASHBOARD", test_step_8_finance_dashboard),
        ("STEP 9: 403 GUARD", test_step_9_403_guard),
    ]
    
    results = []
    for name, test_func in steps:
        try:
            result = test_func()
            results.append((name, result))
        except Exception as e:
            log(f"❌ {name} EXCEPTION: {str(e)}", "ERROR")
            results.append((name, False))
    
    # Print summary
    log("\n" + "="*80)
    log("TEST SUMMARY")
    log("="*80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        log(f"{status} - {name}")
    
    log("="*80)
    log(f"TOTAL: {passed}/{total} steps passed ({passed*100//total}%)")
    log("="*80)
    
    if passed == total:
        log("🎉 ALL TESTS PASSED!", "SUCCESS")
        sys.exit(0)
    else:
        log("❌ SOME TESTS FAILED", "ERROR")
        sys.exit(1)

if __name__ == "__main__":
    main()
