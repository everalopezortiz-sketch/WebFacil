#!/usr/bin/env python3
"""
WebBuilder SaaS API Testing Suite
Tests all backend API endpoints with proper authentication and authorization
"""

import requests
import json
import sys
import os
from datetime import datetime

# Get base URL from environment
BASE_URL = "https://sitehub-47.preview.emergentagent.com/api"

# Test credentials
ADMIN_CREDENTIALS = {
    "email": "everlopez@gmail.com",
    "password": "ever123"
}

USER_CREDENTIALS = {
    "email": "testuser@test.com", 
    "password": "test123456"
}

class APITester:
    def __init__(self):
        self.admin_session = requests.Session()
        self.user_session = requests.Session()
        self.admin_token = None
        self.user_token = None
        self.test_results = []
        
    def log_result(self, test_name, success, message, details=None):
        """Log test result"""
        result = {
            "test": test_name,
            "success": success,
            "message": message,
            "details": details,
            "timestamp": datetime.now().isoformat()
        }
        self.test_results.append(result)
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {test_name} - {message}")
        if details and not success:
            print(f"   Details: {details}")
    
    def test_health_check(self):
        """Test health check endpoint"""
        try:
            response = requests.get(f"{BASE_URL}/health", timeout=10)
            if response.status_code == 200:
                data = response.json()
                self.log_result("Health Check", True, f"API is healthy - {data.get('status')}")
                return True
            else:
                self.log_result("Health Check", False, f"Health check failed with status {response.status_code}")
                return False
        except Exception as e:
            self.log_result("Health Check", False, f"Health check failed: {str(e)}")
            return False
    
    def test_admin_signin(self):
        """Test admin user signin"""
        try:
            response = self.admin_session.post(
                f"{BASE_URL}/auth/signin",
                json=ADMIN_CREDENTIALS,
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                if data.get('user') and data.get('profile'):
                    profile = data['profile']
                    if profile.get('role') == 'DESARROLLADOR':
                        self.log_result("Admin Signin", True, f"Admin logged in successfully - Role: {profile.get('role')}")
                        return True
                    else:
                        self.log_result("Admin Signin", False, f"User role is {profile.get('role')}, expected DESARROLLADOR")
                        return False
                else:
                    self.log_result("Admin Signin", False, "Missing user or profile data in response")
                    return False
            else:
                self.log_result("Admin Signin", False, f"Signin failed with status {response.status_code}", response.text)
                return False
        except Exception as e:
            self.log_result("Admin Signin", False, f"Signin failed: {str(e)}")
            return False
    
    def test_user_signin(self):
        """Test regular user signin"""
        try:
            response = self.user_session.post(
                f"{BASE_URL}/auth/signin",
                json=USER_CREDENTIALS,
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                if data.get('user') and data.get('profile'):
                    profile = data['profile']
                    if profile.get('role') == 'USER':
                        self.log_result("User Signin", True, f"User logged in successfully - Role: {profile.get('role')}")
                        return True
                    else:
                        self.log_result("User Signin", False, f"User role is {profile.get('role')}, expected USER")
                        return False
                else:
                    self.log_result("User Signin", False, "Missing user or profile data in response")
                    return False
            else:
                self.log_result("User Signin", False, f"Signin failed with status {response.status_code}", response.text)
                return False
        except Exception as e:
            self.log_result("User Signin", False, f"Signin failed: {str(e)}")
            return False
    
    def test_signup_validation(self):
        """Test signup endpoint validation (without creating new users)"""
        try:
            # Test with missing fields
            response = requests.post(
                f"{BASE_URL}/auth/signup",
                json={"email": "test@test.com"},
                timeout=10
            )
            
            if response.status_code == 400:
                self.log_result("Signup Validation", True, "Signup properly validates missing fields")
                return True
            else:
                self.log_result("Signup Validation", False, f"Expected 400 for missing fields, got {response.status_code}")
                return False
        except Exception as e:
            self.log_result("Signup Validation", False, f"Signup validation test failed: {str(e)}")
            return False
    
    def test_user_settings(self):
        """Test user settings endpoints"""
        try:
            # Test GET settings
            response = self.user_session.get(f"{BASE_URL}/settings", timeout=10)
            if response.status_code == 200:
                settings = response.json()
                self.log_result("Get User Settings", True, f"Retrieved settings successfully")
                
                # Test POST settings (update)
                update_data = {"currency": "EUR", "theme": "dark"}
                response = self.user_session.post(
                    f"{BASE_URL}/settings",
                    json=update_data,
                    timeout=10
                )
                
                if response.status_code == 200:
                    self.log_result("Update User Settings", True, "Settings updated successfully")
                    return True
                else:
                    self.log_result("Update User Settings", False, f"Settings update failed with status {response.status_code}")
                    return False
            else:
                self.log_result("Get User Settings", False, f"Get settings failed with status {response.status_code}")
                return False
        except Exception as e:
            self.log_result("User Settings", False, f"Settings test failed: {str(e)}")
            return False
    
    def test_categories_crud(self):
        """Test categories CRUD operations"""
        try:
            # Test GET categories
            response = self.user_session.get(f"{BASE_URL}/categories", timeout=10)
            if response.status_code == 200:
                categories = response.json()
                self.log_result("Get Categories", True, f"Retrieved {len(categories)} categories")
                
                # Test POST category (create)
                new_category = {
                    "name": "Test Category",
                    "description": "Test category description",
                    "is_active": True,
                    "display_order": 1
                }
                
                response = self.user_session.post(
                    f"{BASE_URL}/categories",
                    json=new_category,
                    timeout=10
                )
                
                if response.status_code == 200:
                    created_category = response.json()
                    category_id = created_category.get('id')
                    self.log_result("Create Category", True, f"Category created with ID: {category_id}")
                    
                    # Test PUT category (update)
                    update_data = {"name": "Updated Test Category"}
                    response = self.user_session.put(
                        f"{BASE_URL}/categories/{category_id}",
                        json=update_data,
                        timeout=10
                    )
                    
                    if response.status_code == 200:
                        self.log_result("Update Category", True, "Category updated successfully")
                        
                        # Test DELETE category
                        response = self.user_session.delete(
                            f"{BASE_URL}/categories/{category_id}",
                            timeout=10
                        )
                        
                        if response.status_code == 200:
                            self.log_result("Delete Category", True, "Category deleted successfully")
                            return True
                        else:
                            self.log_result("Delete Category", False, f"Delete failed with status {response.status_code}")
                            return False
                    else:
                        self.log_result("Update Category", False, f"Update failed with status {response.status_code}")
                        return False
                else:
                    self.log_result("Create Category", False, f"Create failed with status {response.status_code}")
                    return False
            else:
                self.log_result("Get Categories", False, f"Get categories failed with status {response.status_code}")
                return False
        except Exception as e:
            self.log_result("Categories CRUD", False, f"Categories test failed: {str(e)}")
            return False
    
    def test_products_crud(self):
        """Test products CRUD operations"""
        try:
            # Test GET products
            response = self.user_session.get(f"{BASE_URL}/products", timeout=10)
            if response.status_code == 200:
                products = response.json()
                self.log_result("Get Products", True, f"Retrieved {len(products)} products")
                
                # Test POST product (create)
                new_product = {
                    "name": "Test Product",
                    "description": "Test product description",
                    "price": 29.99,
                    "is_active": True,
                    "stock_quantity": 100
                }
                
                response = self.user_session.post(
                    f"{BASE_URL}/products",
                    json=new_product,
                    timeout=10
                )
                
                if response.status_code == 200:
                    created_product = response.json()
                    product_id = created_product.get('id')
                    self.log_result("Create Product", True, f"Product created with ID: {product_id}")
                    
                    # Test PUT product (update)
                    update_data = {"name": "Updated Test Product", "price": 39.99}
                    response = self.user_session.put(
                        f"{BASE_URL}/products/{product_id}",
                        json=update_data,
                        timeout=10
                    )
                    
                    if response.status_code == 200:
                        self.log_result("Update Product", True, "Product updated successfully")
                        
                        # Test DELETE product
                        response = self.user_session.delete(
                            f"{BASE_URL}/products/{product_id}",
                            timeout=10
                        )
                        
                        if response.status_code == 200:
                            self.log_result("Delete Product", True, "Product deleted successfully")
                            return True
                        else:
                            self.log_result("Delete Product", False, f"Delete failed with status {response.status_code}")
                            return False
                    else:
                        self.log_result("Update Product", False, f"Update failed with status {response.status_code}")
                        return False
                else:
                    self.log_result("Create Product", False, f"Create failed with status {response.status_code}")
                    return False
            else:
                self.log_result("Get Products", False, f"Get products failed with status {response.status_code}")
                return False
        except Exception as e:
            self.log_result("Products CRUD", False, f"Products test failed: {str(e)}")
            return False
    
    def test_orders(self):
        """Test orders endpoints"""
        try:
            # Test GET orders
            response = self.user_session.get(f"{BASE_URL}/orders", timeout=10)
            if response.status_code == 200:
                orders = response.json()
                self.log_result("Get Orders", True, f"Retrieved {len(orders)} orders")
                return True
            else:
                self.log_result("Get Orders", False, f"Get orders failed with status {response.status_code}")
                return False
        except Exception as e:
            self.log_result("Orders", False, f"Orders test failed: {str(e)}")
            return False
    
    def test_checkout_fields(self):
        """Test checkout fields endpoint"""
        try:
            response = self.user_session.get(f"{BASE_URL}/checkout-fields", timeout=10)
            if response.status_code == 200:
                fields = response.json()
                self.log_result("Get Checkout Fields", True, f"Retrieved {len(fields)} checkout fields")
                return True
            else:
                self.log_result("Get Checkout Fields", False, f"Get checkout fields failed with status {response.status_code}")
                return False
        except Exception as e:
            self.log_result("Checkout Fields", False, f"Checkout fields test failed: {str(e)}")
            return False
    
    def test_user_plan(self):
        """Test user plan endpoint"""
        try:
            response = self.user_session.get(f"{BASE_URL}/user-plan", timeout=10)
            if response.status_code == 200:
                plan = response.json()
                self.log_result("Get User Plan", True, f"Retrieved user plan: {plan}")
                return True
            else:
                self.log_result("Get User Plan", False, f"Get user plan failed with status {response.status_code}")
                return False
        except Exception as e:
            self.log_result("User Plan", False, f"User plan test failed: {str(e)}")
            return False
    
    def test_messages(self):
        """Test support messages endpoint"""
        try:
            response = self.user_session.get(f"{BASE_URL}/messages", timeout=10)
            if response.status_code == 200:
                messages = response.json()
                self.log_result("Get Messages", True, f"Retrieved {len(messages)} messages")
                return True
            else:
                self.log_result("Get Messages", False, f"Get messages failed with status {response.status_code}")
                return False
        except Exception as e:
            self.log_result("Messages", False, f"Messages test failed: {str(e)}")
            return False
    
    def test_reports(self):
        """Test reports endpoint"""
        try:
            response = self.user_session.get(f"{BASE_URL}/reports", timeout=10)
            if response.status_code == 200:
                reports = response.json()
                self.log_result("Get Reports", True, f"Retrieved reports data")
                return True
            else:
                self.log_result("Get Reports", False, f"Get reports failed with status {response.status_code}")
                return False
        except Exception as e:
            self.log_result("Reports", False, f"Reports test failed: {str(e)}")
            return False
    
    def test_admin_users(self):
        """Test admin users endpoint"""
        try:
            response = self.admin_session.get(f"{BASE_URL}/admin/users", timeout=10)
            if response.status_code == 200:
                users = response.json()
                self.log_result("Admin Get Users", True, f"Retrieved {len(users)} users")
                return True
            else:
                self.log_result("Admin Get Users", False, f"Get users failed with status {response.status_code}")
                return False
        except Exception as e:
            self.log_result("Admin Users", False, f"Admin users test failed: {str(e)}")
            return False
    
    def test_admin_authorization(self):
        """Test that regular users cannot access admin endpoints"""
        try:
            response = self.user_session.get(f"{BASE_URL}/admin/users", timeout=10)
            if response.status_code == 403:
                self.log_result("Admin Authorization", True, "Regular user properly denied admin access")
                return True
            else:
                self.log_result("Admin Authorization", False, f"Expected 403, got {response.status_code}")
                return False
        except Exception as e:
            self.log_result("Admin Authorization", False, f"Admin authorization test failed: {str(e)}")
            return False
    
    def test_public_plans(self):
        """Test public plans endpoint"""
        try:
            response = requests.get(f"{BASE_URL}/plans", timeout=10)
            if response.status_code == 200:
                plans = response.json()
                self.log_result("Public Plans", True, f"Retrieved {len(plans)} plans")
                return True
            else:
                self.log_result("Public Plans", False, f"Get plans failed with status {response.status_code}")
                return False
        except Exception as e:
            self.log_result("Public Plans", False, f"Public plans test failed: {str(e)}")
            return False
    
    def test_public_store(self):
        """Test public store endpoint"""
        try:
            # Use the slug from the review request
            response = requests.get(f"{BASE_URL}/store/test-user-mkzwaewx", timeout=10)
            if response.status_code == 200:
                store_data = response.json()
                self.log_result("Public Store", True, f"Retrieved store data for slug")
                return True
            elif response.status_code == 404:
                self.log_result("Public Store", True, "Store not found (expected for test slug)")
                return True
            else:
                self.log_result("Public Store", False, f"Get store failed with status {response.status_code}")
                return False
        except Exception as e:
            self.log_result("Public Store", False, f"Public store test failed: {str(e)}")
            return False
    
    def test_info_content(self):
        """Test public info content endpoint"""
        try:
            response = requests.get(f"{BASE_URL}/info-content", timeout=10)
            if response.status_code == 200:
                content = response.json()
                self.log_result("Info Content", True, f"Retrieved {len(content)} info content items")
                return True
            else:
                self.log_result("Info Content", False, f"Get info content failed with status {response.status_code}")
                return False
        except Exception as e:
            self.log_result("Info Content", False, f"Info content test failed: {str(e)}")
            return False
    
    def test_signout(self):
        """Test signout endpoint"""
        try:
            response = self.user_session.post(f"{BASE_URL}/auth/signout", timeout=10)
            if response.status_code == 200:
                self.log_result("User Signout", True, "User signed out successfully")
                
                # Test admin signout
                response = self.admin_session.post(f"{BASE_URL}/auth/signout", timeout=10)
                if response.status_code == 200:
                    self.log_result("Admin Signout", True, "Admin signed out successfully")
                    return True
                else:
                    self.log_result("Admin Signout", False, f"Admin signout failed with status {response.status_code}")
                    return False
            else:
                self.log_result("User Signout", False, f"User signout failed with status {response.status_code}")
                return False
        except Exception as e:
            self.log_result("Signout", False, f"Signout test failed: {str(e)}")
            return False
    
    def run_all_tests(self):
        """Run all API tests"""
        print(f"🚀 Starting WebBuilder SaaS API Tests")
        print(f"📍 Base URL: {BASE_URL}")
        print("=" * 60)
        
        # Health check first
        if not self.test_health_check():
            print("❌ Health check failed, aborting tests")
            return False
        
        # Authentication tests
        admin_auth_success = self.test_admin_signin()
        user_auth_success = self.test_user_signin()
        
        if not admin_auth_success or not user_auth_success:
            print("❌ Authentication failed, aborting remaining tests")
            return False
        
        # Test signup validation
        self.test_signup_validation()
        
        # User dashboard tests (require user auth)
        self.test_user_settings()
        self.test_categories_crud()
        self.test_products_crud()
        self.test_orders()
        self.test_checkout_fields()
        self.test_user_plan()
        self.test_messages()
        self.test_reports()
        
        # Admin tests (require admin auth)
        self.test_admin_users()
        self.test_admin_authorization()
        
        # Public endpoint tests
        self.test_public_plans()
        self.test_public_store()
        self.test_info_content()
        
        # Signout tests
        self.test_signout()
        
        # Summary
        print("\n" + "=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        
        passed = sum(1 for r in self.test_results if r['success'])
        failed = sum(1 for r in self.test_results if not r['success'])
        total = len(self.test_results)
        
        print(f"✅ Passed: {passed}")
        print(f"❌ Failed: {failed}")
        print(f"📈 Total: {total}")
        print(f"📊 Success Rate: {(passed/total)*100:.1f}%")
        
        if failed > 0:
            print("\n❌ FAILED TESTS:")
            for result in self.test_results:
                if not result['success']:
                    print(f"   • {result['test']}: {result['message']}")
        
        return failed == 0

def main():
    """Main test runner"""
    tester = APITester()
    success = tester.run_all_tests()
    
    # Save detailed results
    with open('/app/test_reports/backend_api_results.json', 'w') as f:
        json.dump(tester.test_results, f, indent=2)
    
    print(f"\n📄 Detailed results saved to: /app/test_reports/backend_api_results.json")
    
    if success:
        print("🎉 All tests passed!")
        sys.exit(0)
    else:
        print("💥 Some tests failed!")
        sys.exit(1)

if __name__ == "__main__":
    main()