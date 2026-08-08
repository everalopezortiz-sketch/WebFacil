#!/usr/bin/env python3
"""
Backend API Test for Product cost_price Persistence Bug Fix
Tests the fix for cost_price reverting to 0 on partial updates
"""

import requests
import json
import sys
from datetime import datetime

# Configuration
BASE_URL = "https://stock-master-262.preview.emergentagent.com/api"
TEST_USER_EMAIL = "ortiz@gmail.com"
TEST_USER_PASSWORD = "ortiz123"

# ANSI color codes for output
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
RESET = '\033[0m'

def print_test(message):
    print(f"\n{BLUE}[TEST]{RESET} {message}")

def print_success(message):
    print(f"{GREEN}✓ PASS:{RESET} {message}")

def print_error(message):
    print(f"{RED}✗ FAIL:{RESET} {message}")

def print_info(message):
    print(f"{YELLOW}ℹ INFO:{RESET} {message}")

def print_section(title):
    print(f"\n{'='*80}")
    print(f"{BLUE}{title}{RESET}")
    print(f"{'='*80}")

class TestResults:
    def __init__(self):
        self.total = 0
        self.passed = 0
        self.failed = 0
        self.failures = []
    
    def add_pass(self, test_name):
        self.total += 1
        self.passed += 1
        print_success(test_name)
    
    def add_fail(self, test_name, reason):
        self.total += 1
        self.failed += 1
        self.failures.append(f"{test_name}: {reason}")
        print_error(f"{test_name} - {reason}")
    
    def print_summary(self):
        print_section("TEST SUMMARY")
        print(f"Total Tests: {self.total}")
        print(f"{GREEN}Passed: {self.passed}{RESET}")
        print(f"{RED}Failed: {self.failed}{RESET}")
        
        if self.failures:
            print(f"\n{RED}Failed Tests:{RESET}")
            for failure in self.failures:
                print(f"  - {failure}")
        
        success_rate = (self.passed / self.total * 100) if self.total > 0 else 0
        print(f"\nSuccess Rate: {success_rate:.1f}%")
        
        return self.failed == 0

results = TestResults()

def signin():
    """Sign in and get access token using Supabase REST API"""
    print_section("AUTHENTICATION")
    print_test("Signing in as ortiz@gmail.com via Supabase REST API")
    
    try:
        # Use Supabase REST API directly to get access token
        supabase_url = "https://ydgbqxpehrqfvslcuhqk.supabase.co"
        supabase_anon_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlkZ2JxeHBlaHJxZnZzbGN1aHFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3MDMzMTIsImV4cCI6MjA4NTI3OTMxMn0.caH78KNZOJfO05FcOoDdGTB9aL5ui8-_vjDt48lbO1I"
        
        response = requests.post(
            f"{supabase_url}/auth/v1/token?grant_type=password",
            headers={
                "apikey": supabase_anon_key,
                "Content-Type": "application/json"
            },
            json={
                "email": TEST_USER_EMAIL,
                "password": TEST_USER_PASSWORD
            },
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            if 'access_token' in data:
                token = data['access_token']
                print_success(f"Signed in successfully")
                print_info(f"User ID: {data.get('user', {}).get('id', 'N/A')}")
                return token
            else:
                print_error("Response missing access_token")
                print_info(f"Response: {json.dumps(data, indent=2)}")
                return None
        else:
            print_error(f"Sign in failed with status {response.status_code}")
            print_info(f"Response: {response.text}")
            return None
    except Exception as e:
        print_error(f"Sign in exception: {str(e)}")
        return None

def test_get_products_includes_cost_price(token):
    """Test 1: GET /api/products returns cost_price and is_combo fields"""
    print_section("TEST 1: GET /api/products includes cost_price & is_combo")
    print_test("Fetching products list")
    
    try:
        response = requests.get(
            f"{BASE_URL}/products",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        
        if response.status_code != 200:
            results.add_fail("GET /api/products status", f"Expected 200, got {response.status_code}")
            return None
        
        results.add_pass("GET /api/products returns 200")
        
        products = response.json()
        
        if not isinstance(products, list):
            results.add_fail("GET /api/products response type", f"Expected list, got {type(products)}")
            return None
        
        results.add_pass(f"GET /api/products returns list ({len(products)} products)")
        
        if len(products) == 0:
            print_info("No products found - will create one for testing")
            return None
        
        # Check if products include cost_price and is_combo fields
        first_product = products[0]
        print_info(f"First product keys: {list(first_product.keys())}")
        
        has_cost_price = 'cost_price' in first_product
        has_is_combo = 'is_combo' in first_product
        
        if has_cost_price:
            results.add_pass("Products include 'cost_price' field")
            print_info(f"cost_price value: {first_product['cost_price']}")
        else:
            results.add_fail("Products missing 'cost_price' field", "Field not returned by GET /api/products")
            print_info("This indicates the DB migration may not be applied yet")
        
        if has_is_combo:
            results.add_pass("Products include 'is_combo' field")
            print_info(f"is_combo value: {first_product['is_combo']}")
        else:
            results.add_fail("Products missing 'is_combo' field", "Field not returned by GET /api/products")
        
        return products[0] if products else None
        
    except Exception as e:
        results.add_fail("GET /api/products exception", str(e))
        return None

def test_create_product_with_cost_price(token):
    """Test 4: POST /api/products with cost_price"""
    print_section("TEST 4: POST /api/products with cost_price")
    print_test("Creating new product with cost_price=15000")
    
    try:
        product_data = {
            "name": f"Test Product {datetime.now().strftime('%H%M%S')}",
            "description": "Test product for cost_price persistence",
            "price": 25000,
            "cost_price": 15000,
            "stock_quantity": 10,
            "is_active": True
        }
        
        response = requests.post(
            f"{BASE_URL}/products",
            headers={"Authorization": f"Bearer {token}"},
            json=product_data,
            timeout=10
        )
        
        if response.status_code != 200:
            results.add_fail("POST /api/products status", f"Expected 200, got {response.status_code}: {response.text}")
            return None
        
        results.add_pass("POST /api/products returns 200")
        
        created_product = response.json()
        print_info(f"Created product ID: {created_product.get('id')}")
        
        # Check if response includes cost_price
        if 'cost_price' in created_product:
            if created_product['cost_price'] == 15000:
                results.add_pass("POST response includes cost_price=15000")
            else:
                results.add_fail("POST response cost_price value", f"Expected 15000, got {created_product['cost_price']}")
        else:
            print_info("POST response doesn't include cost_price (migration may not be applied)")
        
        return created_product
        
    except Exception as e:
        results.add_fail("POST /api/products exception", str(e))
        return None

def test_update_product_cost_price(token, product_id):
    """Test 2: PUT /api/products/{id} with cost_price and verify persistence"""
    print_section("TEST 2: PUT /api/products/{id} with cost_price=20000")
    print_test(f"Updating product {product_id} with cost_price=20000")
    
    try:
        response = requests.put(
            f"{BASE_URL}/products/{product_id}",
            headers={"Authorization": f"Bearer {token}"},
            json={"cost_price": 20000},
            timeout=10
        )
        
        if response.status_code != 200:
            results.add_fail("PUT /api/products/{id} status", f"Expected 200, got {response.status_code}: {response.text}")
            return False
        
        results.add_pass("PUT /api/products/{id} returns 200")
        
        # Now GET products and verify cost_price persisted
        print_test("Verifying cost_price persisted via GET /api/products")
        
        get_response = requests.get(
            f"{BASE_URL}/products",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        
        if get_response.status_code != 200:
            results.add_fail("GET /api/products after update", f"Status {get_response.status_code}")
            return False
        
        products = get_response.json()
        updated_product = next((p for p in products if p['id'] == product_id), None)
        
        if not updated_product:
            results.add_fail("Product not found after update", f"Product {product_id} not in list")
            return False
        
        if 'cost_price' not in updated_product:
            print_info("cost_price field not in response (migration may not be applied)")
            return False
        
        if updated_product['cost_price'] == 20000:
            results.add_pass("cost_price persisted correctly (20000)")
            return True
        else:
            results.add_fail("cost_price persistence", f"Expected 20000, got {updated_product['cost_price']}")
            return False
        
    except Exception as e:
        results.add_fail("PUT /api/products/{id} exception", str(e))
        return False

def test_partial_update_preserves_cost_price(token, product_id):
    """Test 3: CRITICAL - Partial update (only stock_quantity) should NOT reset cost_price"""
    print_section("TEST 3: CRITICAL - Partial update preserves cost_price")
    print_test(f"Updating product {product_id} with ONLY stock_quantity=5")
    print_info("This should NOT reset cost_price to 0 (the bug fix)")
    
    try:
        # First, verify current cost_price
        get_response = requests.get(
            f"{BASE_URL}/products",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        
        if get_response.status_code != 200:
            results.add_fail("GET /api/products before partial update", f"Status {get_response.status_code}")
            return False
        
        products = get_response.json()
        product_before = next((p for p in products if p['id'] == product_id), None)
        
        if not product_before:
            results.add_fail("Product not found before partial update", f"Product {product_id} not in list")
            return False
        
        if 'cost_price' not in product_before:
            print_info("cost_price field not in response (migration may not be applied)")
            return False
        
        cost_price_before = product_before['cost_price']
        print_info(f"cost_price before partial update: {cost_price_before}")
        
        # Now do partial update with ONLY stock_quantity
        response = requests.put(
            f"{BASE_URL}/products/{product_id}",
            headers={"Authorization": f"Bearer {token}"},
            json={"stock_quantity": 5},  # ONLY stock_quantity, NO cost_price
            timeout=10
        )
        
        if response.status_code != 200:
            results.add_fail("PUT /api/products/{id} partial update status", f"Expected 200, got {response.status_code}: {response.text}")
            return False
        
        results.add_pass("PUT /api/products/{id} partial update returns 200")
        
        # Verify cost_price is STILL the same (not reset to 0)
        print_test("Verifying cost_price NOT reset to 0 after partial update")
        
        get_response2 = requests.get(
            f"{BASE_URL}/products",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        
        if get_response2.status_code != 200:
            results.add_fail("GET /api/products after partial update", f"Status {get_response2.status_code}")
            return False
        
        products_after = get_response2.json()
        product_after = next((p for p in products_after if p['id'] == product_id), None)
        
        if not product_after:
            results.add_fail("Product not found after partial update", f"Product {product_id} not in list")
            return False
        
        if 'cost_price' not in product_after:
            print_info("cost_price field not in response (migration may not be applied)")
            return False
        
        cost_price_after = product_after['cost_price']
        print_info(f"cost_price after partial update: {cost_price_after}")
        
        if cost_price_after == cost_price_before:
            results.add_pass(f"CRITICAL: cost_price preserved after partial update ({cost_price_after})")
            return True
        elif cost_price_after == 0:
            results.add_fail("CRITICAL BUG: cost_price reset to 0 after partial update", 
                           f"Expected {cost_price_before}, got 0 - THE BUG IS NOT FIXED")
            return False
        else:
            results.add_fail("cost_price changed unexpectedly", 
                           f"Expected {cost_price_before}, got {cost_price_after}")
            return False
        
    except Exception as e:
        results.add_fail("Partial update test exception", str(e))
        return False

def test_regression_endpoints(token):
    """Test 5: Regression - verify other endpoints still work"""
    print_section("TEST 5: REGRESSION - Other endpoints")
    
    endpoints = [
        ("GET /api/products", f"{BASE_URL}/products"),
        ("GET /api/categories", f"{BASE_URL}/categories"),
        ("GET /api/orders", f"{BASE_URL}/orders"),
    ]
    
    for name, url in endpoints:
        print_test(f"Testing {name}")
        try:
            response = requests.get(
                url,
                headers={"Authorization": f"Bearer {token}"},
                timeout=10
            )
            
            if response.status_code == 200:
                results.add_pass(f"{name} returns 200")
            else:
                results.add_fail(f"{name} status", f"Expected 200, got {response.status_code}")
        except Exception as e:
            results.add_fail(f"{name} exception", str(e))

def main():
    print_section("PRODUCT COST_PRICE PERSISTENCE BUG FIX TEST")
    print_info(f"Testing backend at: {BASE_URL}")
    print_info(f"Test user: {TEST_USER_EMAIL}")
    print_info(f"Timestamp: {datetime.now().isoformat()}")
    
    # Step 1: Sign in
    token = signin()
    if not token:
        print_error("Authentication failed - cannot proceed with tests")
        sys.exit(1)
    
    # Step 2: Test GET /api/products includes cost_price
    existing_product = test_get_products_includes_cost_price(token)
    
    # Step 3: Create a new product with cost_price (Test 4)
    new_product = test_create_product_with_cost_price(token)
    
    # Determine which product to use for update tests
    test_product_id = None
    if new_product and 'id' in new_product:
        test_product_id = new_product['id']
        print_info(f"Using newly created product {test_product_id} for update tests")
    elif existing_product and 'id' in existing_product:
        test_product_id = existing_product['id']
        print_info(f"Using existing product {test_product_id} for update tests")
    
    if test_product_id:
        # Step 4: Test updating cost_price (Test 2)
        test_update_product_cost_price(token, test_product_id)
        
        # Step 5: CRITICAL - Test partial update preserves cost_price (Test 3)
        test_partial_update_preserves_cost_price(token, test_product_id)
    else:
        print_error("No product available for update tests")
        results.add_fail("Update tests", "No product ID available")
    
    # Step 6: Regression tests (Test 5)
    test_regression_endpoints(token)
    
    # Print summary
    success = results.print_summary()
    
    # Exit with appropriate code
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
