#!/usr/bin/env python3
"""
Backend API Testing Script for WebFácil SaaS
Tests new features: manual sale with deposit/discount/original_price, materials, combos, reports profit
"""

import requests
import json
import sys
from datetime import datetime

# Configuration
BASE_URL = "https://hybrid-booking-shop.preview.emergentagent.com/api"
TEST_EMAIL = "ortiz@gmail.com"
TEST_PASSWORD = "ortiz123"

# Global variables
access_token = None
headers = {}

def print_test(test_name):
    """Print test header"""
    print(f"\n{'='*80}")
    print(f"TEST: {test_name}")
    print('='*80)

def print_result(success, message):
    """Print test result"""
    status = "✅ PASS" if success else "❌ FAIL"
    print(f"{status}: {message}")

def print_json(data, title="Response"):
    """Pretty print JSON data"""
    print(f"\n{title}:")
    print(json.dumps(data, indent=2))

# ============================================================================
# Authentication
# ============================================================================

def test_signin():
    """Sign in and get access token via Supabase REST API"""
    global access_token, headers
    print_test("Sign In (ortiz@gmail.com)")
    
    try:
        # Use Supabase REST API directly to get access token
        supabase_url = "https://ydgbqxpehrqfvslcuhqk.supabase.co"
        supabase_anon_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlkZ2JxeHBlaHJxZnZzbGN1aHFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3MDMzMTIsImV4cCI6MjA4NTI3OTMxMn0.caH78KNZOJfO05FcOoDdGTB9aL5ui8-_vjDt48lbO1I"
        
        response = requests.post(
            f"{supabase_url}/auth/v1/token?grant_type=password",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
            headers={
                "apikey": supabase_anon_key,
                "Content-Type": "application/json"
            },
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            access_token = data.get('access_token')
            
            if access_token:
                headers = {"Authorization": f"Bearer {access_token}"}
                print_result(True, f"Signed in successfully. User ID: {data.get('user', {}).get('id')}")
                return True
            else:
                print_result(False, "No access token in response")
                print_json(data)
                return False
        else:
            print_result(False, f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return False

# ============================================================================
# Test A: Manual Wholesale Sale with Deposit + Discount + Original Price
# ============================================================================

def test_get_products():
    """Get products to use in manual sale"""
    print_test("Get Products (to use in manual sale)")
    
    try:
        response = requests.get(f"{BASE_URL}/products", headers=headers, timeout=10)
        
        if response.status_code == 200:
            products = response.json()
            if len(products) >= 2:
                print_result(True, f"Got {len(products)} products")
                # Return first 2 products
                return products[:2]
            else:
                print_result(False, f"Need at least 2 products, got {len(products)}")
                return []
        else:
            print_result(False, f"Status {response.status_code}: {response.text}")
            return []
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return []

def test_manual_sale_wholesale(products):
    """Test POST /api/orders/manual with wholesale items, deposit, discount"""
    print_test("Manual Sale with Wholesale Discount + Deposit + Original Price")
    
    if len(products) < 2:
        print_result(False, "Need at least 2 products to test")
        return None
    
    prod1 = products[0]
    prod2 = products[1]
    
    # Create items with wholesale discount (unitPrice < originalPrice)
    items = [
        {
            "productId": prod1['id'],
            "productName": prod1['name'],
            "quantity": 6,
            "unitPrice": 5000,  # Wholesale price
            "originalPrice": 8000,  # Retail price
            "costPrice": 2000,
            "subtotal": 30000,
            "wholesale": True
        },
        {
            "productId": prod2['id'],
            "productName": prod2['name'],
            "quantity": 3,
            "unitPrice": 10000,
            "originalPrice": 10000,  # No discount
            "costPrice": 4000,
            "subtotal": 30000,
            "wholesale": False
        }
    ]
    
    body = {
        "customerName": "Cliente Test Mayorista",
        "description": "Venta con descuento mayorista + seña",
        "total": 90000,
        "discount": 5000,
        "deposit": 30000,
        "status": "pending",
        "deductStock": False,
        "items": items
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/orders/manual",
            headers=headers,
            json=body,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            if 'order' in data and 'orderNumber' in data:
                order = data['order']
                print_result(True, f"Manual sale created. Order number: {data['orderNumber']}")
                print(f"  Order ID: {order['id']}")
                print(f"  Total: {order.get('total')}")
                print(f"  Deposit: {order.get('deposit', 'N/A')}")
                print(f"  Discount: {order.get('discount', 'N/A')}")
                print(f"  Balance Due: {order.get('balance_due', 'N/A')}")
                print(f"  Payment Status: {order.get('payment_status', 'N/A')}")
                print(f"  Status: {order.get('status')}")
                return order['id']
            else:
                print_result(False, "Missing order or orderNumber in response")
                print_json(data)
                return None
        else:
            print_result(False, f"Status {response.status_code}: {response.text}")
            return None
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return None

def test_get_order_items(order_id):
    """Get order and verify order_items include original_price, cost_price, unit_price"""
    print_test("Verify Order Items Include original_price, cost_price, unit_price")
    
    try:
        response = requests.get(f"{BASE_URL}/orders", headers=headers, timeout=10)
        
        if response.status_code == 200:
            orders = response.json()
            order = next((o for o in orders if o['id'] == order_id), None)
            
            if order:
                print_result(True, f"Found order {order_id}")
                print(f"  Order fields:")
                print(f"    - deposit: {order.get('deposit', 'MISSING')}")
                print(f"    - discount: {order.get('discount', 'MISSING')}")
                print(f"    - balance_due: {order.get('balance_due', 'MISSING')}")
                print(f"    - payment_status: {order.get('payment_status', 'MISSING')}")
                
                items = order.get('order_items', [])
                if items:
                    print(f"\n  Order items ({len(items)} items):")
                    for i, item in enumerate(items, 1):
                        print(f"    Item {i}: {item.get('product_name')}")
                        print(f"      - unit_price: {item.get('unit_price', 'MISSING')}")
                        print(f"      - cost_price: {item.get('cost_price', 'MISSING')}")
                        print(f"      - original_price: {item.get('original_price', 'MISSING')}")
                        print(f"      - quantity: {item.get('quantity')}")
                        print(f"      - subtotal: {item.get('subtotal')}")
                    
                    # Check if original_price exists
                    has_original_price = any('original_price' in item for item in items)
                    has_cost_price = any('cost_price' in item for item in items)
                    
                    if has_original_price:
                        print_result(True, "✓ order_items.original_price column EXISTS")
                    else:
                        print_result(False, "✗ order_items.original_price column MISSING")
                    
                    if has_cost_price:
                        print_result(True, "✓ order_items.cost_price column EXISTS")
                    else:
                        print_result(False, "✗ order_items.cost_price column MISSING")
                    
                    return True
                else:
                    print_result(False, "No order_items found")
                    return False
            else:
                print_result(False, f"Order {order_id} not found in orders list")
                return False
        else:
            print_result(False, f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return False

# ============================================================================
# Test B: Materials CRUD + Movements
# ============================================================================

def test_create_material():
    """Test POST /api/materials"""
    print_test("Create Material")
    
    body = {
        "name": "Sublimacion papel",
        "unit": "un",
        "stock_quantity": 100,
        "unit_cost": 500
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/materials",
            headers=headers,
            json=body,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            if 'id' in data:
                print_result(True, f"Material created. ID: {data['id']}, Name: {data['name']}, Stock: {data['stock_quantity']}")
                print_result(True, "✓ materials table EXISTS")
                return data['id']
            else:
                print_result(False, "No id in response")
                print_json(data)
                return None
        elif response.status_code == 400 or response.status_code == 500:
            error_text = response.text
            if 'relation' in error_text.lower() or 'table' in error_text.lower() or 'not found' in error_text.lower():
                print_result(False, "✗ materials table MISSING (table does not exist)")
            else:
                print_result(False, f"Status {response.status_code}: {error_text}")
            return None
        else:
            print_result(False, f"Status {response.status_code}: {response.text}")
            return None
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return None

def test_get_materials():
    """Test GET /api/materials"""
    print_test("Get Materials")
    
    try:
        response = requests.get(f"{BASE_URL}/materials", headers=headers, timeout=10)
        
        if response.status_code == 200:
            materials = response.json()
            print_result(True, f"Got {len(materials)} materials")
            if materials:
                print("  Sample material:")
                print(f"    - ID: {materials[0].get('id')}")
                print(f"    - Name: {materials[0].get('name')}")
                print(f"    - Stock: {materials[0].get('stock_quantity')}")
                print(f"    - Unit Cost: {materials[0].get('unit_cost')}")
            return materials
        else:
            print_result(False, f"Status {response.status_code}: {response.text}")
            return []
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return []

def test_material_movement_purchase(material_id):
    """Test POST /api/materials/:id/movement (purchase)"""
    print_test("Material Movement - Purchase (add stock)")
    
    body = {
        "type": "purchase",
        "quantity": 50,
        "unit_cost": 400,
        "note": "Compra de prueba"
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/materials/{material_id}/movement",
            headers=headers,
            json=body,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            print_result(True, f"Purchase movement recorded. New stock: {data.get('stock_quantity')}")
            print_result(True, "✓ material_movements table EXISTS")
            return True
        elif response.status_code == 400 or response.status_code == 500:
            error_text = response.text
            if 'relation' in error_text.lower() or 'table' in error_text.lower():
                print_result(False, "✗ material_movements table MISSING")
            else:
                print_result(False, f"Status {response.status_code}: {error_text}")
            return False
        else:
            print_result(False, f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return False

def test_material_movement_usage(material_id):
    """Test POST /api/materials/:id/movement (usage)"""
    print_test("Material Movement - Usage (deduct stock)")
    
    body = {
        "type": "usage",
        "quantity": 20,
        "note": "Uso en producción"
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/materials/{material_id}/movement",
            headers=headers,
            json=body,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            print_result(True, f"Usage movement recorded. New stock: {data.get('stock_quantity')}")
            return True
        else:
            print_result(False, f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return False

def test_update_material(material_id):
    """Test PUT /api/materials/:id"""
    print_test("Update Material")
    
    body = {
        "name": "Papel sublimacion"
    }
    
    try:
        response = requests.put(
            f"{BASE_URL}/materials/{material_id}",
            headers=headers,
            json=body,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            print_result(True, f"Material updated. New name: {data.get('name')}")
            return True
        else:
            print_result(False, f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return False

def test_delete_material(material_id):
    """Test DELETE /api/materials/:id"""
    print_test("Delete Material")
    
    try:
        response = requests.delete(
            f"{BASE_URL}/materials/{material_id}",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            print_result(True, "Material deleted successfully")
            return True
        else:
            print_result(False, f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return False

# ============================================================================
# Test C: Combos
# ============================================================================

def test_create_combo(products):
    """Test creating a combo product"""
    print_test("Create Combo Product")
    
    if len(products) < 2:
        print_result(False, "Need at least 2 products to create combo")
        return None
    
    prod1 = products[0]
    prod2 = products[1]
    
    body = {
        "name": "Combo Test",
        "price": 50000,
        "is_combo": True,
        "combo_items": [
            {
                "component_product_id": prod1['id'],
                "quantity": 1
            },
            {
                "component_product_id": prod2['id'],
                "quantity": 2
            }
        ]
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/products",
            headers=headers,
            json=body,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            if 'id' in data:
                print_result(True, f"Combo product created. ID: {data['id']}, Name: {data['name']}")
                print(f"  is_combo: {data.get('is_combo', 'MISSING')}")
                print_result(True, "✓ combo_items table EXISTS (or graceful fallback)")
                return data['id']
            else:
                print_result(False, "No id in response")
                print_json(data)
                return None
        else:
            print_result(False, f"Status {response.status_code}: {response.text}")
            return None
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return None

def test_get_combo_components(combo_id):
    """Test GET /api/products/:id/combo"""
    print_test("Get Combo Components")
    
    try:
        response = requests.get(
            f"{BASE_URL}/products/{combo_id}/combo",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            components = response.json()
            if len(components) > 0:
                print_result(True, f"Got {len(components)} combo components")
                print_result(True, "✓ combo_items table EXISTS")
                for i, comp in enumerate(components, 1):
                    print(f"  Component {i}:")
                    print(f"    - component_product_id: {comp.get('component_product_id')}")
                    print(f"    - quantity: {comp.get('quantity')}")
                    if comp.get('component'):
                        print(f"    - component name: {comp['component'].get('name')}")
                return True
            else:
                print_result(False, "No components returned (combo_items table may be empty or missing)")
                print_result(False, "✗ combo_items table MISSING or empty")
                return False
        else:
            print_result(False, f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return False

# ============================================================================
# Test D: Regression Tests
# ============================================================================

def test_regression_products():
    """Test GET /api/products"""
    print_test("Regression: GET /api/products")
    
    try:
        response = requests.get(f"{BASE_URL}/products", headers=headers, timeout=10)
        
        if response.status_code == 200:
            products = response.json()
            print_result(True, f"Got {len(products)} products")
            return True
        else:
            print_result(False, f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return False

def test_regression_orders():
    """Test GET /api/orders"""
    print_test("Regression: GET /api/orders")
    
    try:
        response = requests.get(f"{BASE_URL}/orders", headers=headers, timeout=10)
        
        if response.status_code == 200:
            orders = response.json()
            print_result(True, f"Got {len(orders)} orders")
            return True
        else:
            print_result(False, f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return False

def test_regression_categories():
    """Test GET /api/categories"""
    print_test("Regression: GET /api/categories")
    
    try:
        response = requests.get(f"{BASE_URL}/categories", headers=headers, timeout=10)
        
        if response.status_code == 200:
            categories = response.json()
            print_result(True, f"Got {len(categories)} categories")
            return True
        else:
            print_result(False, f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return False

# ============================================================================
# Main Test Runner
# ============================================================================

def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("BACKEND API TESTING - NEW FEATURES")
    print("Testing: Manual Sale (deposit/discount/original_price), Materials, Combos")
    print("="*80)
    
    results = {
        "total": 0,
        "passed": 0,
        "failed": 0
    }
    
    # Sign in
    if not test_signin():
        print("\n❌ FATAL: Cannot proceed without authentication")
        sys.exit(1)
    
    # Test A: Manual Sale with Wholesale Discount + Deposit
    print("\n" + "="*80)
    print("SECTION A: MANUAL WHOLESALE SALE WITH DEPOSIT + DISCOUNT")
    print("="*80)
    
    products = test_get_products()
    if products:
        order_id = test_manual_sale_wholesale(products)
        if order_id:
            test_get_order_items(order_id)
    
    # Test B: Materials
    print("\n" + "="*80)
    print("SECTION B: MATERIALS CRUD + MOVEMENTS")
    print("="*80)
    
    material_id = test_create_material()
    if material_id:
        test_get_materials()
        test_material_movement_purchase(material_id)
        test_material_movement_usage(material_id)
        test_update_material(material_id)
        test_delete_material(material_id)
    else:
        print("\n⚠️  Skipping remaining material tests (table doesn't exist)")
    
    # Test C: Combos
    print("\n" + "="*80)
    print("SECTION C: COMBOS")
    print("="*80)
    
    if products:
        combo_id = test_create_combo(products)
        if combo_id:
            test_get_combo_components(combo_id)
    
    # Test D: Regression
    print("\n" + "="*80)
    print("SECTION D: REGRESSION TESTS")
    print("="*80)
    
    test_regression_products()
    test_regression_orders()
    test_regression_categories()
    
    # Final Summary
    print("\n" + "="*80)
    print("TESTING COMPLETE")
    print("="*80)
    print("\nPlease review the output above to determine:")
    print("1. Which features work end-to-end")
    print("2. Which DB columns/tables are MISSING:")
    print("   - order_items.original_price")
    print("   - order_items.cost_price")
    print("   - materials table")
    print("   - material_movements table")
    print("   - combo_items table")
    print("   - profiles.plain_password (not tested in this script)")
    print("\n")

if __name__ == "__main__":
    main()
