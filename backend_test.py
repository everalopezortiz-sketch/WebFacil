#!/usr/bin/env python3
"""
Backend API Testing Script for WebFacil Bug Fix Verification
Tests the defensive fix for public store caching of broken/empty responses
"""

import requests
import json
import sys
from typing import Dict, Any

# Load environment variables
BASE_URL = "https://performance-launch.preview.emergentagent.com/api"

# Test credentials
ADMIN_EMAIL = "everlopez@gmail.com"
ADMIN_PASSWORD = "ever123"
USER_EMAIL = "ortiz@gmail.com"
USER_PASSWORD = "ortiz123"

# Store slugs for testing
VALID_STORE_SLUG = "monserrat-pereira-mphih60x"  # Has ~134 products
INVALID_STORE_SLUG = "nonexistent-slug-xyz"

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    END = '\033[0m'

def print_test(name: str):
    print(f"\n{Colors.BLUE}{'='*80}{Colors.END}")
    print(f"{Colors.BLUE}TEST: {name}{Colors.END}")
    print(f"{Colors.BLUE}{'='*80}{Colors.END}")

def print_success(msg: str):
    print(f"{Colors.GREEN}✓ {msg}{Colors.END}")

def print_error(msg: str):
    print(f"{Colors.RED}✗ {msg}{Colors.END}")

def print_info(msg: str):
    print(f"{Colors.YELLOW}ℹ {msg}{Colors.END}")

def signin(email: str, password: str) -> Dict[str, Any]:
    """Sign in and return session data"""
    import base64
    import urllib.parse
    
    try:
        response = requests.post(
            f"{BASE_URL}/auth/signin",
            json={"email": email, "password": password},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            
            # Extract access_token from Set-Cookie header
            access_token = None
            set_cookie = response.headers.get('Set-Cookie', '')
            if 'auth-token' in set_cookie:
                parts = set_cookie.split(';')
                for part in parts:
                    if 'auth-token=' in part:
                        cookie_value = part.split('=', 1)[1]
                        cookie_value = urllib.parse.unquote(cookie_value)
                        
                        # Remove 'base64-' prefix if present
                        if cookie_value.startswith('base64-'):
                            cookie_value = cookie_value[7:]
                        
                        try:
                            # Add padding if needed
                            missing_padding = len(cookie_value) % 4
                            if missing_padding:
                                cookie_value += '=' * (4 - missing_padding)
                            
                            # Decode base64
                            decoded = base64.b64decode(cookie_value)
                            session_data = json.loads(decoded)
                            access_token = session_data.get("access_token")
                        except Exception as e:
                            print_error(f"Failed to decode session cookie: {str(e)}")
                        break
            
            return {
                "access_token": access_token,
                "user": data.get("user"),
                "profile": data.get("profile")
            }
        else:
            print_error(f"Sign in failed: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print_error(f"Sign in error: {str(e)}")
        return None

def test_public_store_valid_slug():
    """
    TEST 1: GET /api/store/monserrat-pereira-mphih60x (PUBLIC, no auth)
    MUST return 200 with JSON keys: profile, settings, categories, products, checkoutFields
    products array MUST be non-empty (this store has ~134 products)
    On SUCCESS case, response headers MUST include Vercel-CDN-Cache-Control (public, max-age=60...)
    """
    print_test("Public Store GET - Valid Slug (monserrat-pereira-mphih60x)")
    
    try:
        # Use longer timeout for stores with many products
        response = requests.get(
            f"{BASE_URL}/store/{VALID_STORE_SLUG}",
            timeout=30
        )
        
        print_info(f"Status Code: {response.status_code}")
        print_info(f"Response Headers: {dict(response.headers)}")
        
        # Check status code
        if response.status_code != 200:
            print_error(f"Expected 200, got {response.status_code}")
            print_error(f"Response: {response.text}")
            return False
        
        print_success("Status code is 200")
        
        # Parse JSON
        try:
            data = response.json()
        except Exception as e:
            print_error(f"Failed to parse JSON: {str(e)}")
            return False
        
        # Check required keys
        required_keys = ["profile", "settings", "categories", "products", "checkoutFields"]
        for key in required_keys:
            if key not in data:
                print_error(f"Missing required key: {key}")
                return False
            print_success(f"Key '{key}' present")
        
        # Check products array is non-empty
        products = data.get("products", [])
        if not isinstance(products, list):
            print_error(f"products is not a list: {type(products)}")
            return False
        
        products_count = len(products)
        print_info(f"Products count: {products_count}")
        
        if products_count == 0:
            print_error("Products array is EMPTY - this is the bug!")
            return False
        
        print_success(f"Products array is non-empty with {products_count} products")
        
        # Check cache headers (must be present on success)
        cache_control = response.headers.get("Cache-Control", "")
        cdn_cache_control = response.headers.get("CDN-Cache-Control", "")
        vercel_cdn_cache = response.headers.get("Vercel-CDN-Cache-Control", "")
        
        print_info(f"Cache-Control: {cache_control}")
        print_info(f"CDN-Cache-Control: {cdn_cache_control}")
        print_info(f"Vercel-CDN-Cache-Control: {vercel_cdn_cache}")
        
        # The fix should ensure Vercel-CDN-Cache-Control is present on success
        if not vercel_cdn_cache:
            print_error("Vercel-CDN-Cache-Control header is missing on success case")
            return False
        
        if "public" not in vercel_cdn_cache.lower():
            print_error(f"Vercel-CDN-Cache-Control should contain 'public': {vercel_cdn_cache}")
            return False
        
        print_success(f"Vercel-CDN-Cache-Control header present with public caching: {vercel_cdn_cache}")
        
        return True
        
    except Exception as e:
        print_error(f"Test failed with exception: {str(e)}")
        return False

def test_public_store_invalid_slug():
    """
    TEST 2: GET /api/store/nonexistent-slug-xyz
    Should return 404 (store not found) and NOT have public cache headers
    """
    print_test("Public Store GET - Invalid Slug (nonexistent-slug-xyz)")
    
    try:
        response = requests.get(
            f"{BASE_URL}/store/{INVALID_STORE_SLUG}",
            timeout=10
        )
        
        print_info(f"Status Code: {response.status_code}")
        print_info(f"Response Headers: {dict(response.headers)}")
        
        # Check status code
        if response.status_code != 404:
            print_error(f"Expected 404, got {response.status_code}")
            return False
        
        print_success("Status code is 404 (store not found)")
        
        # Parse JSON
        try:
            data = response.json()
            print_info(f"Response: {data}")
        except Exception as e:
            print_error(f"Failed to parse JSON: {str(e)}")
            return False
        
        # Check that public cache headers are NOT present (or set to no-store)
        vercel_cdn_cache = response.headers.get("Vercel-CDN-Cache-Control", "")
        
        if vercel_cdn_cache and "public" in vercel_cdn_cache.lower():
            print_error(f"404 response should NOT have public cache headers: {vercel_cdn_cache}")
            return False
        
        print_success("404 response does not have public cache headers (correct)")
        
        return True
        
    except Exception as e:
        print_error(f"Test failed with exception: {str(e)}")
        return False

def test_admin_users(admin_token: str):
    """
    TEST 3: GET /api/admin/users (auth as everlopez admin)
    MUST return 200 with an array of ~10 user profiles (each with user_settings, user_plans joins)
    """
    print_test("Admin Users GET (authenticated as everlopez)")
    
    try:
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(
            f"{BASE_URL}/admin/users",
            headers=headers,
            timeout=10
        )
        
        print_info(f"Status Code: {response.status_code}")
        
        # Check status code
        if response.status_code != 200:
            print_error(f"Expected 200, got {response.status_code}")
            print_error(f"Response: {response.text}")
            return False
        
        print_success("Status code is 200")
        
        # Parse JSON
        try:
            data = response.json()
        except Exception as e:
            print_error(f"Failed to parse JSON: {str(e)}")
            return False
        
        # Check it's an array
        if not isinstance(data, list):
            print_error(f"Response is not an array: {type(data)}")
            return False
        
        users_count = len(data)
        print_info(f"Users count: {users_count}")
        
        if users_count == 0:
            print_error("Users array is EMPTY - this is the bug!")
            return False
        
        print_success(f"Users array is non-empty with {users_count} users")
        
        # Check first user has expected joins
        if users_count > 0:
            first_user = data[0]
            if "user_settings" not in first_user:
                print_error("First user missing 'user_settings' join")
                return False
            if "user_plans" not in first_user:
                print_error("First user missing 'user_plans' join")
                return False
            print_success("Users have expected joins (user_settings, user_plans)")
        
        return True
        
    except Exception as e:
        print_error(f"Test failed with exception: {str(e)}")
        return False

def test_regression_products(user_token: str):
    """
    TEST 4a: GET /api/products (authenticated)
    Should return 200
    """
    print_test("Regression: GET /api/products")
    
    try:
        headers = {"Authorization": f"Bearer {user_token}"}
        response = requests.get(
            f"{BASE_URL}/products",
            headers=headers,
            timeout=10
        )
        
        print_info(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print_error(f"Expected 200, got {response.status_code}")
            print_error(f"Response: {response.text}")
            return False
        
        print_success("GET /api/products returns 200")
        return True
        
    except Exception as e:
        print_error(f"Test failed with exception: {str(e)}")
        return False

def test_regression_settings(user_token: str):
    """
    TEST 4b: GET /api/settings (authenticated)
    Should return 200
    """
    print_test("Regression: GET /api/settings")
    
    try:
        headers = {"Authorization": f"Bearer {user_token}"}
        response = requests.get(
            f"{BASE_URL}/settings",
            headers=headers,
            timeout=10
        )
        
        print_info(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print_error(f"Expected 200, got {response.status_code}")
            print_error(f"Response: {response.text}")
            return False
        
        print_success("GET /api/settings returns 200")
        return True
        
    except Exception as e:
        print_error(f"Test failed with exception: {str(e)}")
        return False

def test_regression_dashboard_stats(user_token: str):
    """
    TEST 4c: GET /api/dashboard-stats (authenticated)
    Should return 200
    """
    print_test("Regression: GET /api/dashboard-stats")
    
    try:
        headers = {"Authorization": f"Bearer {user_token}"}
        response = requests.get(
            f"{BASE_URL}/dashboard-stats",
            headers=headers,
            timeout=10
        )
        
        print_info(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print_error(f"Expected 200, got {response.status_code}")
            print_error(f"Response: {response.text}")
            return False
        
        print_success("GET /api/dashboard-stats returns 200")
        return True
        
    except Exception as e:
        print_error(f"Test failed with exception: {str(e)}")
        return False

def main():
    print(f"\n{Colors.BLUE}{'='*80}{Colors.END}")
    print(f"{Colors.BLUE}WebFacil Bug Fix Verification - Backend API Tests{Colors.END}")
    print(f"{Colors.BLUE}Testing defensive fix for public store caching{Colors.END}")
    print(f"{Colors.BLUE}{'='*80}{Colors.END}")
    
    results = {}
    
    # Sign in as admin
    print_info("Signing in as admin (everlopez@gmail.com)...")
    admin_session = signin(ADMIN_EMAIL, ADMIN_PASSWORD)
    if not admin_session or not admin_session.get("access_token"):
        print_error("Failed to sign in as admin")
        sys.exit(1)
    print_success(f"Admin signed in successfully")
    admin_token = admin_session["access_token"]
    
    # Sign in as regular user
    print_info("Signing in as user (ortiz@gmail.com)...")
    user_session = signin(USER_EMAIL, USER_PASSWORD)
    if not user_session or not user_session.get("access_token"):
        print_error("Failed to sign in as user")
        sys.exit(1)
    print_success(f"User signed in successfully")
    user_token = user_session["access_token"]
    
    # Run tests
    results["test_1_public_store_valid"] = test_public_store_valid_slug()
    results["test_2_public_store_invalid"] = test_public_store_invalid_slug()
    results["test_3_admin_users"] = test_admin_users(admin_token)
    results["test_4a_regression_products"] = test_regression_products(user_token)
    results["test_4b_regression_settings"] = test_regression_settings(user_token)
    results["test_4c_regression_dashboard_stats"] = test_regression_dashboard_stats(user_token)
    
    # Summary
    print(f"\n{Colors.BLUE}{'='*80}{Colors.END}")
    print(f"{Colors.BLUE}TEST SUMMARY{Colors.END}")
    print(f"{Colors.BLUE}{'='*80}{Colors.END}")
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, result in results.items():
        status = f"{Colors.GREEN}PASS{Colors.END}" if result else f"{Colors.RED}FAIL{Colors.END}"
        print(f"{test_name}: {status}")
    
    print(f"\n{Colors.BLUE}Total: {passed}/{total} tests passed{Colors.END}")
    
    if passed == total:
        print(f"{Colors.GREEN}{'='*80}{Colors.END}")
        print(f"{Colors.GREEN}ALL TESTS PASSED ✓{Colors.END}")
        print(f"{Colors.GREEN}{'='*80}{Colors.END}")
        sys.exit(0)
    else:
        print(f"{Colors.RED}{'='*80}{Colors.END}")
        print(f"{Colors.RED}SOME TESTS FAILED ✗{Colors.END}")
        print(f"{Colors.RED}{'='*80}{Colors.END}")
        sys.exit(1)

if __name__ == "__main__":
    main()
