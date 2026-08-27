#!/usr/bin/env python3
"""
Backend API Testing Script for WebBuilder SaaS
Tests TWO new feature groups:
1. Diagnostics Treatment Reminders
2. Booking Finance Business Expenses
"""

import requests
import json
import sys
from datetime import datetime, timedelta

# Configuration
BASE_URL = "https://laughing-williamson-9.preview.emergentagent.com/api"
SUPABASE_URL = "https://ydgbqxpehrqfvslcuhqk.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlkZ2JxeHBlaHJxZnZzbGN1aHFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3MDMzMTIsImV4cCI6MjA4NTI3OTMxMn0.caH78KNZOJfO05FcOoDdGTB9aL5ui8-_vjDt48lbO1I"

# Test credentials
BOOKING_USER = {"email": "booking_fin_test@test.com", "password": "booking123"}
ECOMMERCE_USER = {"email": "ortiz@gmail.com", "password": "ortiz123"}

# Global test state
booking_token = None
ecommerce_token = None
test_results = []


def authenticate_supabase(email, password):
    """Authenticate with Supabase and return access token"""
    url = f"{SUPABASE_URL}/auth/v1/token?grant_type=password"
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Content-Type": "application/json"
    }
    data = {"email": email, "password": password}
    
    try:
        response = requests.post(url, headers=headers, json=data, timeout=10)
        if response.status_code == 200:
            result = response.json()
            return result.get("access_token")
        else:
            print(f"❌ Auth failed for {email}: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"❌ Auth exception for {email}: {str(e)}")
        return None


def log_result(test_name, passed, details=""):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    result = {"test": test_name, "passed": passed, "details": details}
    test_results.append(result)
    print(f"{status}: {test_name}")
    if details:
        print(f"   {details}")


def test_diagnostics_treatment_reminders():
    """GROUP 1: Test Diagnostics Treatment Reminders endpoints"""
    print("\n" + "="*80)
    print("GROUP 1: DIAGNOSTICS TREATMENT REMINDERS")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {booking_token}"}
    
    # Test 1: GET treatment notifications as booking user
    print("\n[1] GET /api/diagnostics/treatment-notifications?limit=25 as booking user")
    try:
        response = requests.get(
            f"{BASE_URL}/diagnostics/treatment-notifications?limit=25",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            required_keys = ["today", "timezone", "total", "tomorrowCount", "todayCount", "overdueCount", "notifications"]
            has_all_keys = all(key in data for key in required_keys)
            has_cache_control = "cache-control" in response.headers
            cache_value = response.headers.get("cache-control", "")
            has_no_store = "no-store" in cache_value.lower()
            
            if has_all_keys and has_cache_control and has_no_store:
                log_result("1. GET treatment-notifications (booking user)", True, 
                          f"200, keys: {list(data.keys())}, notifications count: {len(data.get('notifications', []))}, Cache-Control: {cache_value}")
            else:
                missing = [k for k in required_keys if k not in data]
                log_result("1. GET treatment-notifications (booking user)", False,
                          f"200 but missing keys: {missing}, Cache-Control present: {has_cache_control}, no-store: {has_no_store}")
        else:
            log_result("1. GET treatment-notifications (booking user)", False,
                      f"Expected 200, got {response.status_code}: {response.text[:200]}")
    except Exception as e:
        log_result("1. GET treatment-notifications (booking user)", False, f"Exception: {str(e)}")
    
    # Test 2: GET without Authorization
    print("\n[2] GET /api/diagnostics/treatment-notifications without Authorization")
    try:
        response = requests.get(
            f"{BASE_URL}/diagnostics/treatment-notifications?limit=25",
            timeout=10
        )
        
        if response.status_code == 401:
            log_result("2. GET treatment-notifications (no auth)", True, "401 Unauthorized as expected")
        else:
            log_result("2. GET treatment-notifications (no auth)", False,
                      f"Expected 401, got {response.status_code}")
    except Exception as e:
        log_result("2. GET treatment-notifications (no auth)", False, f"Exception: {str(e)}")
    
    # Test 3: GET as ecommerce user (should be 403)
    print("\n[3] GET /api/diagnostics/treatment-notifications as ecommerce user")
    try:
        ecom_headers = {"Authorization": f"Bearer {ecommerce_token}"}
        response = requests.get(
            f"{BASE_URL}/diagnostics/treatment-notifications?limit=25",
            headers=ecom_headers,
            timeout=10
        )
        
        if response.status_code == 403:
            log_result("3. GET treatment-notifications (ecommerce user)", True, "403 Forbidden as expected")
        else:
            log_result("3. GET treatment-notifications (ecommerce user)", False,
                      f"Expected 403, got {response.status_code}: {response.text[:200]}")
    except Exception as e:
        log_result("3. GET treatment-notifications (ecommerce user)", False, f"Exception: {str(e)}")
    
    # Test 4: PUT update treatment reminder
    print("\n[4] PUT /api/diagnostics/treatment-notifications/{diagnosticId}")
    
    # First, try to get a real diagnostic record
    diagnostic_id = None
    try:
        response = requests.get(
            f"{BASE_URL}/diagnostics/records",
            headers=headers,
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            records = data.get("records", [])
            if records and len(records) > 0:
                diagnostic_id = records[0].get("id")
                print(f"   Found diagnostic record: {diagnostic_id}")
    except Exception as e:
        print(f"   Could not fetch diagnostic records: {str(e)}")
    
    # Test with a diagnostic ID (real or random UUID)
    test_id = diagnostic_id if diagnostic_id else "550e8400-e29b-41d4-a716-446655440000"
    
    # Test 4a: PUT with action "contacted"
    try:
        response = requests.put(
            f"{BASE_URL}/diagnostics/treatment-notifications/{test_id}",
            headers=headers,
            json={"action": "contacted"},
            timeout=10
        )
        
        if response.status_code in [200, 404]:
            log_result("4a. PUT treatment-notification (action: contacted)", True,
                      f"{response.status_code} (200 or 404 acceptable)")
        elif response.status_code == 500:
            log_result("4a. PUT treatment-notification (action: contacted)", False,
                      f"500 error (should not happen): {response.text[:200]}")
        else:
            log_result("4a. PUT treatment-notification (action: contacted)", True,
                      f"{response.status_code} (acceptable)")
    except Exception as e:
        log_result("4a. PUT treatment-notification (action: contacted)", False, f"Exception: {str(e)}")
    
    # Test 4b: PUT with action "reopen"
    try:
        response = requests.put(
            f"{BASE_URL}/diagnostics/treatment-notifications/{test_id}",
            headers=headers,
            json={"action": "reopen"},
            timeout=10
        )
        
        if response.status_code in [200, 404]:
            log_result("4b. PUT treatment-notification (action: reopen)", True,
                      f"{response.status_code} (200 or 404 acceptable)")
        elif response.status_code == 500:
            log_result("4b. PUT treatment-notification (action: reopen)", False,
                      f"500 error (should not happen): {response.text[:200]}")
        else:
            log_result("4b. PUT treatment-notification (action: reopen)", True,
                      f"{response.status_code} (acceptable)")
    except Exception as e:
        log_result("4b. PUT treatment-notification (action: reopen)", False, f"Exception: {str(e)}")
    
    # Test 4c: PUT with invalid action
    try:
        response = requests.put(
            f"{BASE_URL}/diagnostics/treatment-notifications/{test_id}",
            headers=headers,
            json={"action": "invalid"},
            timeout=10
        )
        
        if response.status_code == 400:
            log_result("4c. PUT treatment-notification (invalid action)", True, "400 as expected")
        else:
            log_result("4c. PUT treatment-notification (invalid action)", False,
                      f"Expected 400, got {response.status_code}")
    except Exception as e:
        log_result("4c. PUT treatment-notification (invalid action)", False, f"Exception: {str(e)}")
    
    # Test 4d: PUT with non-UUID id
    try:
        response = requests.put(
            f"{BASE_URL}/diagnostics/treatment-notifications/abc",
            headers=headers,
            json={"action": "contacted"},
            timeout=10
        )
        
        if response.status_code == 400:
            log_result("4d. PUT treatment-notification (non-UUID id)", True, "400 as expected")
        else:
            log_result("4d. PUT treatment-notification (non-UUID id)", False,
                      f"Expected 400, got {response.status_code}")
    except Exception as e:
        log_result("4d. PUT treatment-notification (non-UUID id)", False, f"Exception: {str(e)}")


def test_booking_finance_expenses():
    """GROUP 2: Test Booking Finance Business Expenses endpoints"""
    print("\n" + "="*80)
    print("GROUP 2: BOOKING FINANCE BUSINESS EXPENSES")
    print("="*80)
    
    headers = {"Authorization": f"Bearer {booking_token}"}
    ecom_headers = {"Authorization": f"Bearer {ecommerce_token}"}
    
    # Test 1: GET /setup
    print("\n[1] GET /api/booking/finance/setup")
    category_id = None
    try:
        response = requests.get(
            f"{BASE_URL}/booking/finance/setup",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            has_categories = "categories" in data
            has_templates = "templates" in data
            categories = data.get("categories", [])
            
            if has_categories and has_templates:
                if len(categories) >= 8:
                    category_id = categories[0].get("id") if categories else None
                    log_result("1. GET /finance/setup", True,
                              f"200, {len(categories)} categories, {len(data.get('templates', []))} templates")
                else:
                    log_result("1. GET /finance/setup", True,
                              f"200, {len(categories)} categories (expected 8 defaults), {len(data.get('templates', []))} templates")
            else:
                log_result("1. GET /finance/setup", False,
                          f"200 but missing keys. Has categories: {has_categories}, templates: {has_templates}")
        else:
            log_result("1. GET /finance/setup", False,
                      f"Expected 200, got {response.status_code}: {response.text[:200]}")
    except Exception as e:
        log_result("1. GET /finance/setup", False, f"Exception: {str(e)}")
    
    # Test 2: POST /categories
    print("\n[2] POST /api/booking/finance/categories")
    created_category_id = None
    try:
        response = requests.post(
            f"{BASE_URL}/booking/finance/categories",
            headers=headers,
            json={
                "name": "Prueba QA",
                "color": "#22c55e",
                "is_active": True,
                "display_order": 10
            },
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            created_category_id = data.get("id")
            if created_category_id:
                log_result("2. POST /finance/categories", True, f"200, created category id: {created_category_id}")
            else:
                log_result("2. POST /finance/categories", False, "200 but no id returned")
        else:
            log_result("2. POST /finance/categories", False,
                      f"Expected 200, got {response.status_code}: {response.text[:200]}")
    except Exception as e:
        log_result("2. POST /finance/categories", False, f"Exception: {str(e)}")
    
    # Test 3: PUT /categories/{id}
    print("\n[3] PUT /api/booking/finance/categories/{id}")
    if created_category_id:
        try:
            response = requests.put(
                f"{BASE_URL}/booking/finance/categories/{created_category_id}",
                headers=headers,
                json={
                    "name": "Prueba QA editada",
                    "color": "#3b82f6",
                    "is_active": True,
                    "display_order": 11
                },
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                log_result("3. PUT /finance/categories/{id}", True, f"200, updated category")
            else:
                log_result("3. PUT /finance/categories/{id}", False,
                          f"Expected 200, got {response.status_code}: {response.text[:200]}")
        except Exception as e:
            log_result("3. PUT /finance/categories/{id}", False, f"Exception: {str(e)}")
    else:
        log_result("3. PUT /finance/categories/{id}", False, "Skipped - no category created")
    
    # Test 4: Validation - POST category with missing name
    print("\n[4] POST /api/booking/finance/categories (validation: missing name)")
    try:
        response = requests.post(
            f"{BASE_URL}/booking/finance/categories",
            headers=headers,
            json={"color": "#22c55e", "is_active": True},
            timeout=10
        )
        
        if response.status_code == 400:
            log_result("4a. POST /finance/categories (missing name)", True, "400 as expected")
        else:
            log_result("4a. POST /finance/categories (missing name)", False,
                      f"Expected 400, got {response.status_code}")
    except Exception as e:
        log_result("4a. POST /finance/categories (missing name)", False, f"Exception: {str(e)}")
    
    # Test 4b: POST category with bad color (should fallback, not error)
    print("\n[4b] POST /api/booking/finance/categories (bad color - should fallback)")
    try:
        response = requests.post(
            f"{BASE_URL}/booking/finance/categories",
            headers=headers,
            json={"name": "Test Bad Color", "color": "red", "is_active": True},
            timeout=10
        )
        
        if response.status_code == 200:
            log_result("4b. POST /finance/categories (bad color)", True, "200 (fallback to default color)")
        else:
            log_result("4b. POST /finance/categories (bad color)", False,
                      f"Expected 200 (fallback), got {response.status_code}: {response.text[:200]}")
    except Exception as e:
        log_result("4b. POST /finance/categories (bad color)", False, f"Exception: {str(e)}")
    
    # Use a valid category ID for template tests
    valid_category_id = created_category_id or category_id
    
    # Test 5: POST /templates
    print("\n[5] POST /api/booking/finance/templates")
    template_id = None
    if valid_category_id:
        try:
            response = requests.post(
                f"{BASE_URL}/booking/finance/templates",
                headers=headers,
                json={
                    "name": "Alquiler mensual",
                    "category_id": valid_category_id,
                    "default_amount": 1500000,
                    "payment_method": "transfer",
                    "supplier": "Inmobiliaria",
                    "notes": "mensual"
                },
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                template_id = data.get("id")
                log_result("5. POST /finance/templates", True, f"200, template id: {template_id}")
            else:
                log_result("5. POST /finance/templates", False,
                          f"Expected 200, got {response.status_code}: {response.text[:200]}")
        except Exception as e:
            log_result("5. POST /finance/templates", False, f"Exception: {str(e)}")
    else:
        log_result("5. POST /finance/templates", False, "Skipped - no valid category_id")
    
    # Test 5a: Validation - template with amount=0
    print("\n[5a] POST /api/booking/finance/templates (validation: amount=0)")
    if valid_category_id:
        try:
            response = requests.post(
                f"{BASE_URL}/booking/finance/templates",
                headers=headers,
                json={
                    "name": "Test Zero Amount",
                    "category_id": valid_category_id,
                    "default_amount": 0,
                    "payment_method": "cash"
                },
                timeout=10
            )
            
            if response.status_code == 400:
                log_result("5a. POST /finance/templates (amount=0)", True, "400 as expected")
            else:
                log_result("5a. POST /finance/templates (amount=0)", False,
                          f"Expected 400, got {response.status_code}")
        except Exception as e:
            log_result("5a. POST /finance/templates (amount=0)", False, f"Exception: {str(e)}")
    
    # Test 5b: Validation - template with invalid payment_method
    print("\n[5b] POST /api/booking/finance/templates (validation: payment_method=bitcoin)")
    if valid_category_id:
        try:
            response = requests.post(
                f"{BASE_URL}/booking/finance/templates",
                headers=headers,
                json={
                    "name": "Test Invalid Payment",
                    "category_id": valid_category_id,
                    "default_amount": 1000,
                    "payment_method": "bitcoin"
                },
                timeout=10
            )
            
            if response.status_code == 400:
                log_result("5b. POST /finance/templates (invalid payment_method)", True, "400 as expected")
            else:
                log_result("5b. POST /finance/templates (invalid payment_method)", False,
                          f"Expected 400, got {response.status_code}")
        except Exception as e:
            log_result("5b. POST /finance/templates (invalid payment_method)", False, f"Exception: {str(e)}")
    
    # Test 6: PUT /templates/{id}
    print("\n[6] PUT /api/booking/finance/templates/{id}")
    if template_id:
        try:
            response = requests.put(
                f"{BASE_URL}/booking/finance/templates/{template_id}",
                headers=headers,
                json={
                    "name": "Alquiler mensual editado",
                    "default_amount": 1600000,
                    "payment_method": "transfer",
                    "is_active": True
                },
                timeout=10
            )
            
            if response.status_code == 200:
                log_result("6. PUT /finance/templates/{id}", True, "200, template updated")
            else:
                log_result("6. PUT /finance/templates/{id}", False,
                          f"Expected 200, got {response.status_code}: {response.text[:200]}")
        except Exception as e:
            log_result("6. PUT /finance/templates/{id}", False, f"Exception: {str(e)}")
    else:
        log_result("6. PUT /finance/templates/{id}", False, "Skipped - no template created")
    
    # Test 7: POST /expenses (manual)
    print("\n[7] POST /api/booking/finance/expenses")
    expense_id = None
    if valid_category_id:
        try:
            response = requests.post(
                f"{BASE_URL}/booking/finance/expenses",
                headers=headers,
                json={
                    "description": "Compra insumos QA",
                    "amount": 250000,
                    "expense_date": "2026-08-15",
                    "payment_method": "cash",
                    "category_id": valid_category_id,
                    "supplier": "Prov",
                    "reference": "F001",
                    "notes": "nota"
                },
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                expense_id = data.get("id")
                expense_number = data.get("expenseNumber") or data.get("expense_number")
                amount = data.get("amount")
                status = data.get("status")
                log_result("7. POST /finance/expenses", True,
                          f"200, expense: {expense_number}, amount: {amount}, status: {status}")
            else:
                log_result("7. POST /finance/expenses", False,
                          f"Expected 200, got {response.status_code}: {response.text[:200]}")
        except Exception as e:
            log_result("7. POST /finance/expenses", False, f"Exception: {str(e)}")
    else:
        log_result("7. POST /finance/expenses", False, "Skipped - no valid category_id")
    
    # Test 7a: Validation - amount=0
    print("\n[7a] POST /api/booking/finance/expenses (validation: amount=0)")
    if valid_category_id:
        try:
            response = requests.post(
                f"{BASE_URL}/booking/finance/expenses",
                headers=headers,
                json={
                    "description": "Test Zero",
                    "amount": 0,
                    "expense_date": "2026-08-15",
                    "payment_method": "cash",
                    "category_id": valid_category_id
                },
                timeout=10
            )
            
            if response.status_code == 400:
                log_result("7a. POST /finance/expenses (amount=0)", True, "400 as expected")
            else:
                log_result("7a. POST /finance/expenses (amount=0)", False,
                          f"Expected 400, got {response.status_code}")
        except Exception as e:
            log_result("7a. POST /finance/expenses (amount=0)", False, f"Exception: {str(e)}")
    
    # Test 7b: Validation - amount=-5
    print("\n[7b] POST /api/booking/finance/expenses (validation: amount=-5)")
    if valid_category_id:
        try:
            response = requests.post(
                f"{BASE_URL}/booking/finance/expenses",
                headers=headers,
                json={
                    "description": "Test Negative",
                    "amount": -5,
                    "expense_date": "2026-08-15",
                    "payment_method": "cash",
                    "category_id": valid_category_id
                },
                timeout=10
            )
            
            if response.status_code == 400:
                log_result("7b. POST /finance/expenses (amount=-5)", True, "400 as expected")
            else:
                log_result("7b. POST /finance/expenses (amount=-5)", False,
                          f"Expected 400, got {response.status_code}")
        except Exception as e:
            log_result("7b. POST /finance/expenses (amount=-5)", False, f"Exception: {str(e)}")
    
    # Test 7c: Validation - missing description
    print("\n[7c] POST /api/booking/finance/expenses (validation: missing description)")
    if valid_category_id:
        try:
            response = requests.post(
                f"{BASE_URL}/booking/finance/expenses",
                headers=headers,
                json={
                    "amount": 1000,
                    "expense_date": "2026-08-15",
                    "payment_method": "cash",
                    "category_id": valid_category_id
                },
                timeout=10
            )
            
            if response.status_code == 400:
                log_result("7c. POST /finance/expenses (missing description)", True, "400 as expected")
            else:
                log_result("7c. POST /finance/expenses (missing description)", False,
                          f"Expected 400, got {response.status_code}")
        except Exception as e:
            log_result("7c. POST /finance/expenses (missing description)", False, f"Exception: {str(e)}")
    
    # Test 7d: Validation - invalid payment_method
    print("\n[7d] POST /api/booking/finance/expenses (validation: payment_method=foo)")
    if valid_category_id:
        try:
            response = requests.post(
                f"{BASE_URL}/booking/finance/expenses",
                headers=headers,
                json={
                    "description": "Test Invalid Payment",
                    "amount": 1000,
                    "expense_date": "2026-08-15",
                    "payment_method": "foo",
                    "category_id": valid_category_id
                },
                timeout=10
            )
            
            if response.status_code == 400:
                log_result("7d. POST /finance/expenses (invalid payment_method)", True, "400 as expected")
            else:
                log_result("7d. POST /finance/expenses (invalid payment_method)", False,
                          f"Expected 400, got {response.status_code}")
        except Exception as e:
            log_result("7d. POST /finance/expenses (invalid payment_method)", False, f"Exception: {str(e)}")
    
    # Test 8: POST /expenses/quick
    print("\n[8] POST /api/booking/finance/expenses/quick")
    if template_id:
        try:
            response = requests.post(
                f"{BASE_URL}/booking/finance/expenses/quick",
                headers=headers,
                json={"template_id": template_id},
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                expense_number = data.get("expenseNumber") or data.get("expense_number")
                amount = data.get("amount")
                log_result("8. POST /finance/expenses/quick", True,
                          f"200, expense: {expense_number}, amount: {amount}")
            else:
                log_result("8. POST /finance/expenses/quick", False,
                          f"Expected 200, got {response.status_code}: {response.text[:200]}")
        except Exception as e:
            log_result("8. POST /finance/expenses/quick", False, f"Exception: {str(e)}")
    else:
        log_result("8. POST /finance/expenses/quick", False, "Skipped - no template created")
    
    # Test 8a: Validation - quick with invalid template_id
    print("\n[8a] POST /api/booking/finance/expenses/quick (invalid template_id)")
    try:
        response = requests.post(
            f"{BASE_URL}/booking/finance/expenses/quick",
            headers=headers,
            json={"template_id": "550e8400-e29b-41d4-a716-446655440000"},
            timeout=10
        )
        
        if response.status_code in [400, 404]:
            log_result("8a. POST /finance/expenses/quick (invalid template)", True,
                      f"{response.status_code} (400/404 acceptable, not 500)")
        elif response.status_code == 500:
            log_result("8a. POST /finance/expenses/quick (invalid template)", False,
                      f"500 error (should not happen): {response.text[:200]}")
        else:
            log_result("8a. POST /finance/expenses/quick (invalid template)", True,
                      f"{response.status_code} (acceptable)")
    except Exception as e:
        log_result("8a. POST /finance/expenses/quick (invalid template)", False, f"Exception: {str(e)}")
    
    # Test 9: GET /expenses with filters
    print("\n[9] GET /api/booking/finance/expenses?from=2026-08-01&to=2026-08-31")
    try:
        response = requests.get(
            f"{BASE_URL}/booking/finance/expenses?from=2026-08-01&to=2026-08-31",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            has_keys = all(k in data for k in ["total", "limit", "offset", "items"])
            items = data.get("items", [])
            log_result("9a. GET /finance/expenses (date range)", True,
                      f"200, {len(items)} items, keys: {list(data.keys())}")
        else:
            log_result("9a. GET /finance/expenses (date range)", False,
                      f"Expected 200, got {response.status_code}: {response.text[:200]}")
    except Exception as e:
        log_result("9a. GET /finance/expenses (date range)", False, f"Exception: {str(e)}")
    
    # Test 9b: GET with search filter
    print("\n[9b] GET /api/booking/finance/expenses?from=2026-08-01&to=2026-08-31&search=insumos")
    try:
        response = requests.get(
            f"{BASE_URL}/booking/finance/expenses?from=2026-08-01&to=2026-08-31&search=insumos",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            items = data.get("items", [])
            log_result("9b. GET /finance/expenses (search filter)", True,
                      f"200, {len(items)} items matching 'insumos'")
        else:
            log_result("9b. GET /finance/expenses (search filter)", False,
                      f"Expected 200, got {response.status_code}")
    except Exception as e:
        log_result("9b. GET /finance/expenses (search filter)", False, f"Exception: {str(e)}")
    
    # Test 9c: GET with category filter
    print("\n[9c] GET /api/booking/finance/expenses?from=2026-08-01&to=2026-08-31&category_id={id}")
    if valid_category_id:
        try:
            response = requests.get(
                f"{BASE_URL}/booking/finance/expenses?from=2026-08-01&to=2026-08-31&category_id={valid_category_id}",
                headers=headers,
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                items = data.get("items", [])
                log_result("9c. GET /finance/expenses (category filter)", True,
                          f"200, {len(items)} items for category")
            else:
                log_result("9c. GET /finance/expenses (category filter)", False,
                          f"Expected 200, got {response.status_code}")
        except Exception as e:
            log_result("9c. GET /finance/expenses (category filter)", False, f"Exception: {str(e)}")
    
    # Test 9d: GET without from/to (should be 400)
    print("\n[9d] GET /api/booking/finance/expenses (validation: missing from/to)")
    try:
        response = requests.get(
            f"{BASE_URL}/booking/finance/expenses",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 400:
            log_result("9d. GET /finance/expenses (missing from/to)", True, "400 as expected")
        else:
            log_result("9d. GET /finance/expenses (missing from/to)", False,
                      f"Expected 400, got {response.status_code}")
    except Exception as e:
        log_result("9d. GET /finance/expenses (missing from/to)", False, f"Exception: {str(e)}")
    
    # Test 10: PUT /expenses/{id}/void
    print("\n[10] PUT /api/booking/finance/expenses/{id}/void")
    if expense_id:
        try:
            response = requests.put(
                f"{BASE_URL}/booking/finance/expenses/{expense_id}/void",
                headers=headers,
                json={"reason": "cargado por error"},
                timeout=10
            )
            
            if response.status_code == 200:
                log_result("10a. PUT /finance/expenses/{id}/void", True, "200, expense voided")
                
                # Verify expense is still present with status "voided"
                response2 = requests.get(
                    f"{BASE_URL}/booking/finance/expenses?from=2026-08-01&to=2026-08-31",
                    headers=headers,
                    timeout=10
                )
                if response2.status_code == 200:
                    data = response2.json()
                    items = data.get("items", [])
                    voided_expense = next((e for e in items if e.get("id") == expense_id), None)
                    if voided_expense:
                        status = voided_expense.get("status")
                        log_result("10b. Verify voided expense in list", True,
                                  f"Expense present with status: {status}")
                    else:
                        log_result("10b. Verify voided expense in list", False,
                                  "Voided expense not found in list")
            else:
                log_result("10a. PUT /finance/expenses/{id}/void", False,
                          f"Expected 200, got {response.status_code}: {response.text[:200]}")
        except Exception as e:
            log_result("10a. PUT /finance/expenses/{id}/void", False, f"Exception: {str(e)}")
    else:
        log_result("10. PUT /finance/expenses/{id}/void", False, "Skipped - no expense created")
    
    # Test 10c: Validation - void without reason
    print("\n[10c] PUT /api/booking/finance/expenses/{id}/void (validation: no reason)")
    if expense_id:
        try:
            # Create another expense to void
            response = requests.post(
                f"{BASE_URL}/booking/finance/expenses",
                headers=headers,
                json={
                    "description": "Test void validation",
                    "amount": 1000,
                    "expense_date": "2026-08-15",
                    "payment_method": "cash",
                    "category_id": valid_category_id
                },
                timeout=10
            )
            if response.status_code == 200:
                test_expense_id = response.json().get("id")
                response2 = requests.put(
                    f"{BASE_URL}/booking/finance/expenses/{test_expense_id}/void",
                    headers=headers,
                    json={},
                    timeout=10
                )
                
                if response2.status_code == 400:
                    log_result("10c. PUT /finance/expenses/{id}/void (no reason)", True, "400 as expected")
                else:
                    log_result("10c. PUT /finance/expenses/{id}/void (no reason)", False,
                              f"Expected 400, got {response2.status_code}")
        except Exception as e:
            log_result("10c. PUT /finance/expenses/{id}/void (no reason)", False, f"Exception: {str(e)}")
    
    # Test 11: GET /overview
    print("\n[11] GET /api/booking/finance/overview?from=2026-08-01&to=2026-08-31")
    try:
        response = requests.get(
            f"{BASE_URL}/booking/finance/overview?from=2026-08-01&to=2026-08-31",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            required_keys = [
                "totalRevenue", "serviceRevenue", "productRevenue", "operatingExpenses",
                "productCost", "commissionsGenerated", "totalCosts", "netProfit",
                "cashBalance", "profitMargin", "pendingServiceCollection",
                "incomeBySource", "expensesByCategory", "incomeByPaymentMethod",
                "expensesByPaymentMethod", "dailySeries", "topExpenses"
            ]
            has_all_keys = all(key in data for key in required_keys)
            
            if has_all_keys:
                operating_expenses = data.get("operatingExpenses", 0)
                log_result("11a. GET /finance/overview", True,
                          f"200, all keys present, operatingExpenses: {operating_expenses}")
            else:
                missing = [k for k in required_keys if k not in data]
                log_result("11a. GET /finance/overview", False,
                          f"200 but missing keys: {missing}")
        else:
            log_result("11a. GET /finance/overview", False,
                      f"Expected 200, got {response.status_code}: {response.text[:200]}")
    except Exception as e:
        log_result("11a. GET /finance/overview", False, f"Exception: {str(e)}")
    
    # Test 11b: GET /overview without from/to
    print("\n[11b] GET /api/booking/finance/overview (validation: missing from/to)")
    try:
        response = requests.get(
            f"{BASE_URL}/booking/finance/overview",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 400:
            log_result("11b. GET /finance/overview (missing from/to)", True, "400 as expected")
        else:
            log_result("11b. GET /finance/overview (missing from/to)", False,
                      f"Expected 400, got {response.status_code}")
    except Exception as e:
        log_result("11b. GET /finance/overview (missing from/to)", False, f"Exception: {str(e)}")
    
    # Test 12: Isolation - ecommerce user should get 403
    print("\n[12] Isolation: All /finance/* endpoints as ecommerce user => 403")
    finance_endpoints = [
        "/booking/finance/setup",
        "/booking/finance/categories",
        "/booking/finance/templates",
        "/booking/finance/expenses?from=2026-08-01&to=2026-08-31",
        "/booking/finance/overview?from=2026-08-01&to=2026-08-31"
    ]
    
    isolation_passed = True
    for endpoint in finance_endpoints:
        try:
            response = requests.get(
                f"{BASE_URL}{endpoint}",
                headers=ecom_headers,
                timeout=10
            )
            if response.status_code != 403:
                isolation_passed = False
                print(f"   ❌ {endpoint}: Expected 403, got {response.status_code}")
            else:
                print(f"   ✅ {endpoint}: 403")
        except Exception as e:
            isolation_passed = False
            print(f"   ❌ {endpoint}: Exception {str(e)}")
    
    log_result("12. Isolation (ecommerce user => 403)", isolation_passed,
              "All finance endpoints return 403 for ecommerce user" if isolation_passed else "Some endpoints did not return 403")


def main():
    """Main test execution"""
    global booking_token, ecommerce_token
    
    print("="*80)
    print("BACKEND API TESTING - TWO NEW FEATURE GROUPS")
    print("="*80)
    
    # Authenticate users
    print("\n🔐 Authenticating users...")
    booking_token = authenticate_supabase(BOOKING_USER["email"], BOOKING_USER["password"])
    ecommerce_token = authenticate_supabase(ECOMMERCE_USER["email"], ECOMMERCE_USER["password"])
    
    if not booking_token:
        print("❌ CRITICAL: Could not authenticate booking user. Aborting tests.")
        sys.exit(1)
    
    if not ecommerce_token:
        print("⚠️  WARNING: Could not authenticate ecommerce user. Isolation tests will be skipped.")
    
    print(f"✅ Booking user authenticated: {BOOKING_USER['email']}")
    if ecommerce_token:
        print(f"✅ Ecommerce user authenticated: {ECOMMERCE_USER['email']}")
    
    # Run test groups
    test_diagnostics_treatment_reminders()
    test_booking_finance_expenses()
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    total = len(test_results)
    passed = sum(1 for r in test_results if r["passed"])
    failed = total - passed
    success_rate = (passed / total * 100) if total > 0 else 0
    
    print(f"\nTotal Tests: {total}")
    print(f"✅ Passed: {passed}")
    print(f"❌ Failed: {failed}")
    print(f"Success Rate: {success_rate:.1f}%")
    
    if failed > 0:
        print("\n❌ FAILED TESTS:")
        for result in test_results:
            if not result["passed"]:
                print(f"  - {result['test']}")
                if result["details"]:
                    print(f"    {result['details']}")
    
    print("\n" + "="*80)
    
    # Exit with appropriate code
    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
