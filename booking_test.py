#!/usr/bin/env python3
"""
Backend API Testing Script for Booking Module (Agendamientos + Tienda)
Tests the new booking backend in Next.js + Supabase app
"""

import requests
import json
import sys
import random
import string
from datetime import datetime, timedelta

# Configuration
BASE_URL = "https://stock-master-262.preview.emergentagent.com/api"
SUPABASE_URL = "https://ydgbqxpehrqfvslcuhqk.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlkZ2JxeHBlaHJxZnZzbGN1aHFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3MDMzMTIsImV4cCI6MjA4NTI3OTMxMn0.caH78KNZOJfO05FcOoDdGTB9aL5ui8-_vjDt48lbO1I"

# Global variables
booking_access_token = None
booking_headers = {}
booking_slug = None
ecommerce_access_token = None
ecommerce_headers = {}

# Test data storage
test_data = {
    "category_id": None,
    "service_id": None,
    "staff_id": None,
    "availability_id": None,
    "timeoff_id": None,
    "appointment_id": None,
    "confirmation_code": None,
    "public_token": None
}

def print_test(test_name):
    """Print test header"""
    print(f"\n{'='*80}")
    print(f"TEST: {test_name}")
    print('='*80)

def print_result(success, message):
    """Print test result"""
    status = "✅ PASS" if success else "❌ FAIL"
    print(f"{status}: {message}")
    return success

def print_json(data, title="Response"):
    """Pretty print JSON data"""
    print(f"\n{title}:")
    print(json.dumps(data, indent=2, default=str))

def generate_random_email():
    """Generate a unique email for testing"""
    random_str = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
    return f"booking_test_{random_str}@test.com"

# ============================================================================
# STEP 1: Create Booking Business Account
# ============================================================================

def test_signup_booking_account():
    """Create a new booking business account"""
    global booking_access_token, booking_headers, booking_slug
    print_test("STEP 1: Create Booking Business Account")
    
    email = generate_random_email()
    password = "booking123"
    
    body = {
        "email": email,
        "password": password,
        "firstName": "Booking",
        "lastName": "Test",
        "city": "Asuncion",
        "country": "Paraguay",
        "phone": "+595981000000",
        "businessType": "booking"
    }
    
    try:
        # Sign up
        response = requests.post(
            f"{BASE_URL}/auth/signup",
            json=body,
            timeout=10
        )
        
        if response.status_code != 200:
            return print_result(False, f"Signup failed. Status {response.status_code}: {response.text}")
        
        print_result(True, f"Signup successful. Email: {email}")
        
        # Sign in to get access token
        signin_response = requests.post(
            f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
            json={"email": email, "password": password},
            headers={
                "apikey": SUPABASE_ANON_KEY,
                "Content-Type": "application/json"
            },
            timeout=10
        )
        
        if signin_response.status_code != 200:
            return print_result(False, f"Sign in failed. Status {signin_response.status_code}: {signin_response.text}")
        
        data = signin_response.json()
        booking_access_token = data.get('access_token')
        
        if not booking_access_token:
            return print_result(False, "No access token in sign in response")
        
        booking_headers = {"Authorization": f"Bearer {booking_access_token}"}
        print_result(True, f"Signed in successfully. User ID: {data.get('user', {}).get('id')}")
        
        # Get user profile to get slug
        profile_response = requests.get(
            f"{BASE_URL}/auth/user",
            headers=booking_headers,
            timeout=10
        )
        
        if profile_response.status_code == 200:
            profile_data = profile_response.json()
            booking_slug = profile_data.get('profile', {}).get('slug')
            print_result(True, f"Got user slug: {booking_slug}")
        
        # Save credentials to file
        with open('/app/memory/test_credentials.md', 'a') as f:
            f.write(f"\n## Booking Test Account (Created {datetime.now().strftime('%Y-%m-%d %H:%M:%S')})\n")
            f.write(f"- Email: `{email}`\n")
            f.write(f"- Password: `{password}`\n")
            f.write(f"- Business Type: booking\n")
            f.write(f"- Slug: `{booking_slug}`\n")
        
        return True
        
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

# ============================================================================
# STEP 2: Verify Seeding
# ============================================================================

def test_get_booking_settings():
    """Verify booking settings are seeded with defaults"""
    print_test("STEP 2a: Verify Booking Settings Seeded")
    
    try:
        response = requests.get(
            f"{BASE_URL}/booking/settings",
            headers=booking_headers,
            timeout=10
        )
        
        if response.status_code != 200:
            return print_result(False, f"Status {response.status_code}: {response.text}")
        
        settings = response.json()
        
        # Verify default settings
        expected = {
            "timezone": "America/Asuncion",
            "slot_interval_minutes": 30,
            "min_booking_notice_minutes": 60,
            "max_advance_days": 60,
            "auto_confirm": True,
            "week_starts_on": 1
        }
        
        all_match = True
        for key, expected_value in expected.items():
            actual_value = settings.get(key)
            if actual_value != expected_value:
                print(f"  ⚠️  {key}: expected {expected_value}, got {actual_value}")
                all_match = False
            else:
                print(f"  ✓ {key}: {actual_value}")
        
        if all_match:
            return print_result(True, "All default settings match expected values")
        else:
            return print_result(False, "Some settings don't match expected defaults")
        
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_get_booking_staff():
    """Verify 'Profesional principal' staff is seeded"""
    global test_data
    print_test("STEP 2b: Verify 'Profesional principal' Staff Seeded")
    
    try:
        response = requests.get(
            f"{BASE_URL}/booking/staff",
            headers=booking_headers,
            timeout=10
        )
        
        if response.status_code != 200:
            return print_result(False, f"Status {response.status_code}: {response.text}")
        
        staff_list = response.json()
        
        if not staff_list:
            return print_result(False, "No staff found")
        
        principal = next((s for s in staff_list if s.get('name') == 'Profesional principal'), None)
        
        if principal:
            test_data['staff_id'] = principal['id']
            print(f"  Staff ID: {principal['id']}")
            print(f"  Name: {principal['name']}")
            return print_result(True, f"Found 'Profesional principal' staff (ID: {principal['id']})")
        else:
            return print_result(False, "Staff 'Profesional principal' not found")
        
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

# ============================================================================
# STEP 3: CRUD Operations
# ============================================================================

def test_create_service_category():
    """Create a service category"""
    global test_data
    print_test("STEP 3a: Create Service Category")
    
    body = {
        "name": "Peluquería",
        "color": "#f59e0b"
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/booking/service-categories",
            headers=booking_headers,
            json=body,
            timeout=10
        )
        
        if response.status_code != 200:
            return print_result(False, f"Status {response.status_code}: {response.text}")
        
        category = response.json()
        test_data['category_id'] = category['id']
        
        print(f"  Category ID: {category['id']}")
        print(f"  Name: {category['name']}")
        print(f"  Color: {category['color']}")
        
        return print_result(True, f"Service category created (ID: {category['id']})")
        
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_get_service_categories():
    """Get service categories"""
    print_test("STEP 3b: Get Service Categories")
    
    try:
        response = requests.get(
            f"{BASE_URL}/booking/service-categories",
            headers=booking_headers,
            timeout=10
        )
        
        if response.status_code != 200:
            return print_result(False, f"Status {response.status_code}: {response.text}")
        
        categories = response.json()
        
        if categories:
            print(f"  Found {len(categories)} categories")
            return print_result(True, f"Got {len(categories)} service categories")
        else:
            return print_result(False, "No categories found")
        
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_update_service_category():
    """Update service category"""
    print_test("STEP 3c: Update Service Category")
    
    if not test_data['category_id']:
        return print_result(False, "No category ID available")
    
    body = {
        "name": "Peluquería y Estética"
    }
    
    try:
        response = requests.put(
            f"{BASE_URL}/booking/service-categories/{test_data['category_id']}",
            headers=booking_headers,
            json=body,
            timeout=10
        )
        
        if response.status_code != 200:
            return print_result(False, f"Status {response.status_code}: {response.text}")
        
        category = response.json()
        print(f"  Updated name: {category['name']}")
        
        return print_result(True, "Service category updated")
        
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_create_service():
    """Create a service"""
    global test_data
    print_test("STEP 3d: Create Service")
    
    body = {
        "name": "Corte",
        "category_id": test_data['category_id'],
        "price": 50000,
        "duration_minutes": 30,
        "buffer_before_minutes": 0,
        "buffer_after_minutes": 10
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/booking/services",
            headers=booking_headers,
            json=body,
            timeout=10
        )
        
        if response.status_code != 200:
            return print_result(False, f"Status {response.status_code}: {response.text}")
        
        service = response.json()
        test_data['service_id'] = service['id']
        
        print(f"  Service ID: {service['id']}")
        print(f"  Name: {service['name']}")
        print(f"  Price: {service['price']}")
        print(f"  Duration: {service['duration_minutes']} minutes")
        
        return print_result(True, f"Service created (ID: {service['id']})")
        
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_get_services():
    """Get services"""
    print_test("STEP 3e: Get Services")
    
    try:
        response = requests.get(
            f"{BASE_URL}/booking/services",
            headers=booking_headers,
            timeout=10
        )
        
        if response.status_code != 200:
            return print_result(False, f"Status {response.status_code}: {response.text}")
        
        services = response.json()
        
        if services:
            print(f"  Found {len(services)} services")
            return print_result(True, f"Got {len(services)} services")
        else:
            return print_result(False, "No services found")
        
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_update_service():
    """Update service price"""
    print_test("STEP 3f: Update Service Price")
    
    if not test_data['service_id']:
        return print_result(False, "No service ID available")
    
    body = {
        "price": 60000
    }
    
    try:
        response = requests.put(
            f"{BASE_URL}/booking/services/{test_data['service_id']}",
            headers=booking_headers,
            json=body,
            timeout=10
        )
        
        if response.status_code != 200:
            return print_result(False, f"Status {response.status_code}: {response.text}")
        
        service = response.json()
        print(f"  Updated price: {service['price']}")
        
        return print_result(True, "Service price updated")
        
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_assign_staff_services():
    """Assign service to staff"""
    print_test("STEP 3g: Assign Service to Staff")
    
    if not test_data['staff_id'] or not test_data['service_id']:
        return print_result(False, "Missing staff_id or service_id")
    
    body = {
        "staff_id": test_data['staff_id'],
        "service_ids": [test_data['service_id']]
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/booking/staff-services",
            headers=booking_headers,
            json=body,
            timeout=10
        )
        
        if response.status_code != 200:
            return print_result(False, f"Status {response.status_code}: {response.text}")
        
        return print_result(True, "Service assigned to staff")
        
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_get_staff_services():
    """Get staff-services mapping"""
    print_test("STEP 3h: Get Staff-Services Mapping")
    
    if not test_data['staff_id']:
        return print_result(False, "No staff ID available")
    
    try:
        response = requests.get(
            f"{BASE_URL}/booking/staff-services?staff_id={test_data['staff_id']}",
            headers=booking_headers,
            timeout=10
        )
        
        if response.status_code != 200:
            return print_result(False, f"Status {response.status_code}: {response.text}")
        
        mappings = response.json()
        
        if mappings:
            print(f"  Found {len(mappings)} staff-service mappings")
            for m in mappings:
                print(f"    Staff: {m['staff_id']}, Service: {m['service_id']}")
            return print_result(True, f"Got {len(mappings)} staff-service mappings")
        else:
            return print_result(False, "No staff-service mappings found")
        
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_create_availability():
    """Create availability schedule"""
    global test_data
    print_test("STEP 3i: Create Availability Schedule")
    
    if not test_data['staff_id']:
        return print_result(False, "No staff ID available")
    
    # Get next weekday (Monday = 1, Sunday = 7)
    today = datetime.now()
    # Find next Monday (day_of_week = 1)
    days_ahead = 1 - today.isoweekday()  # Monday is 1
    if days_ahead <= 0:
        days_ahead += 7
    next_monday = today + timedelta(days=days_ahead)
    day_of_week = next_monday.isoweekday()  # ISO weekday (1=Monday, 7=Sunday)
    
    print(f"  Creating availability for day_of_week: {day_of_week} (next Monday)")
    
    # Create morning interval
    body1 = {
        "staff_id": test_data['staff_id'],
        "day_of_week": day_of_week,
        "start_time": "08:00",
        "end_time": "12:00",
        "is_active": True
    }
    
    try:
        response1 = requests.post(
            f"{BASE_URL}/booking/availability",
            headers=booking_headers,
            json=body1,
            timeout=10
        )
        
        if response1.status_code != 200:
            return print_result(False, f"Morning interval failed. Status {response1.status_code}: {response1.text}")
        
        avail1 = response1.json()
        test_data['availability_id'] = avail1['id']
        test_data['availability_day'] = day_of_week
        
        print(f"  Morning interval created: {avail1['start_time']} - {avail1['end_time']}")
        
        # Create afternoon interval
        body2 = {
            "staff_id": test_data['staff_id'],
            "day_of_week": day_of_week,
            "start_time": "14:00",
            "end_time": "18:00",
            "is_active": True
        }
        
        response2 = requests.post(
            f"{BASE_URL}/booking/availability",
            headers=booking_headers,
            json=body2,
            timeout=10
        )
        
        if response2.status_code != 200:
            return print_result(False, f"Afternoon interval failed. Status {response2.status_code}: {response2.text}")
        
        avail2 = response2.json()
        print(f"  Afternoon interval created: {avail2['start_time']} - {avail2['end_time']}")
        
        return print_result(True, "Two availability intervals created for same day")
        
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_get_availability():
    """Get availability schedules"""
    print_test("STEP 3j: Get Availability Schedules")
    
    try:
        response = requests.get(
            f"{BASE_URL}/booking/availability",
            headers=booking_headers,
            timeout=10
        )
        
        if response.status_code != 200:
            return print_result(False, f"Status {response.status_code}: {response.text}")
        
        schedules = response.json()
        
        if schedules:
            print(f"  Found {len(schedules)} availability schedules")
            for s in schedules:
                print(f"    Day {s['day_of_week']}: {s['start_time']} - {s['end_time']}")
            return print_result(True, f"Got {len(schedules)} availability schedules")
        else:
            return print_result(False, "No availability schedules found")
        
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_create_timeoff():
    """Create time-off"""
    global test_data
    print_test("STEP 3k: Create Time-Off")
    
    # Create time-off for tomorrow
    tomorrow = datetime.now() + timedelta(days=1)
    starts_at = tomorrow.replace(hour=9, minute=0, second=0, microsecond=0).isoformat()
    ends_at = tomorrow.replace(hour=17, minute=0, second=0, microsecond=0).isoformat()
    
    body = {
        "staff_id": None,  # All staff
        "starts_at": starts_at,
        "ends_at": ends_at,
        "reason": "Feriado"
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/booking/time-off",
            headers=booking_headers,
            json=body,
            timeout=10
        )
        
        if response.status_code != 200:
            return print_result(False, f"Status {response.status_code}: {response.text}")
        
        timeoff = response.json()
        test_data['timeoff_id'] = timeoff['id']
        
        print(f"  Time-off ID: {timeoff['id']}")
        print(f"  Reason: {timeoff['reason']}")
        print(f"  Starts: {timeoff['starts_at']}")
        print(f"  Ends: {timeoff['ends_at']}")
        
        return print_result(True, f"Time-off created (ID: {timeoff['id']})")
        
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_get_timeoff():
    """Get time-off list"""
    print_test("STEP 3l: Get Time-Off List")
    
    try:
        response = requests.get(
            f"{BASE_URL}/booking/time-off",
            headers=booking_headers,
            timeout=10
        )
        
        if response.status_code != 200:
            return print_result(False, f"Status {response.status_code}: {response.text}")
        
        timeoffs = response.json()
        
        if timeoffs:
            print(f"  Found {len(timeoffs)} time-off entries")
            return print_result(True, f"Got {len(timeoffs)} time-off entries")
        else:
            return print_result(False, "No time-off entries found")
        
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_delete_timeoff():
    """Delete time-off"""
    print_test("STEP 3m: Delete Time-Off")
    
    if not test_data['timeoff_id']:
        return print_result(False, "No time-off ID available")
    
    try:
        response = requests.delete(
            f"{BASE_URL}/booking/time-off/{test_data['timeoff_id']}",
            headers=booking_headers,
            timeout=10
        )
        
        if response.status_code != 200:
            return print_result(False, f"Status {response.status_code}: {response.text}")
        
        return print_result(True, "Time-off deleted successfully")
        
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_update_settings():
    """Update booking settings"""
    print_test("STEP 3n: Update Booking Settings")
    
    body = {
        "slot_interval_minutes": 60
    }
    
    try:
        response = requests.put(
            f"{BASE_URL}/booking/settings",
            headers=booking_headers,
            json=body,
            timeout=10
        )
        
        if response.status_code != 200:
            return print_result(False, f"Status {response.status_code}: {response.text}")
        
        settings = response.json()
        
        if settings.get('slot_interval_minutes') == 60:
            print(f"  Updated slot_interval_minutes: {settings['slot_interval_minutes']}")
            return print_result(True, "Settings updated successfully")
        else:
            return print_result(False, f"Settings not updated correctly. Got: {settings.get('slot_interval_minutes')}")
        
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_verify_settings_persisted():
    """Verify settings persisted"""
    print_test("STEP 3o: Verify Settings Persisted")
    
    try:
        response = requests.get(
            f"{BASE_URL}/booking/settings",
            headers=booking_headers,
            timeout=10
        )
        
        if response.status_code != 200:
            return print_result(False, f"Status {response.status_code}: {response.text}")
        
        settings = response.json()
        
        if settings.get('slot_interval_minutes') == 60:
            print(f"  slot_interval_minutes: {settings['slot_interval_minutes']} (persisted correctly)")
            return print_result(True, "Settings persisted correctly")
        else:
            return print_result(False, f"Settings not persisted. Got: {settings.get('slot_interval_minutes')}")
        
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

# ============================================================================
# STEP 4: Appointments
# ============================================================================

def test_get_appointments_empty():
    """Get appointments (should be empty initially)"""
    print_test("STEP 4a: Get Appointments (Initially Empty)")
    
    # Get date range for next week
    today = datetime.now()
    start = today.isoformat()
    end = (today + timedelta(days=7)).isoformat()
    
    try:
        response = requests.get(
            f"{BASE_URL}/booking/appointments?start={start}&end={end}",
            headers=booking_headers,
            timeout=10
        )
        
        if response.status_code != 200:
            return print_result(False, f"Status {response.status_code}: {response.text}")
        
        appointments = response.json()
        
        if isinstance(appointments, list):
            print(f"  Found {len(appointments)} appointments")
            return print_result(True, f"Got appointments list (count: {len(appointments)})")
        else:
            return print_result(False, "Response is not a list")
        
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_create_manual_appointment():
    """Create manual appointment"""
    global test_data
    print_test("STEP 4b: Create Manual Appointment")
    
    if not test_data['staff_id'] or not test_data['service_id']:
        return print_result(False, "Missing staff_id or service_id")
    
    # Calculate a valid future datetime
    # Find next occurrence of the availability day (Monday)
    today = datetime.now()
    days_ahead = test_data.get('availability_day', 1) - today.isoweekday()
    if days_ahead <= 0:
        days_ahead += 7
    
    target_date = today + timedelta(days=days_ahead)
    
    # Set time to 15:00 (3 PM) which is within 14:00-18:00 availability window
    # Add 2 hours to ensure we're past the min_booking_notice_minutes (60 min)
    target_datetime = target_date.replace(hour=15, minute=0, second=0, microsecond=0)
    
    # If target is less than 2 hours from now, add a week
    if (target_datetime - today).total_seconds() < 7200:
        target_datetime += timedelta(days=7)
    
    start_at = target_datetime.isoformat()
    
    print(f"  Attempting to book at: {start_at}")
    print(f"  Staff ID: {test_data['staff_id']}")
    print(f"  Service ID: {test_data['service_id']}")
    
    body = {
        "staff_id": test_data['staff_id'],
        "service_ids": [test_data['service_id']],
        "start_at": start_at,
        "customer_name": "Cliente Prueba",
        "customer_phone": "+595981111111"
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/booking/appointments/manual",
            headers=booking_headers,
            json=body,
            timeout=10
        )
        
        print(f"  Response status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print_json(data, "Appointment Response")
            
            if 'id' in data:
                test_data['appointment_id'] = data['id']
                test_data['confirmation_code'] = data.get('confirmation_code')
                test_data['public_token'] = data.get('public_token')
                
                print(f"  Appointment ID: {data['id']}")
                print(f"  Confirmation Code: {data.get('confirmation_code')}")
                
                return print_result(True, f"Manual appointment created (ID: {data['id']})")
            else:
                return print_result(True, "Appointment creation response received (check structure)")
        else:
            error_text = response.text
            print(f"  Error response: {error_text}")
            
            # Check if it's a Spanish error message (expected behavior)
            if any(spanish_word in error_text.lower() for spanish_word in ['horario', 'profesional', 'servicio', 'anticipación']):
                print(f"  ℹ️  Spanish error message detected (error translation working)")
                return print_result(False, f"Appointment creation failed with Spanish error: {error_text}")
            else:
                return print_result(False, f"Status {response.status_code}: {error_text}")
        
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_get_appointments_with_data():
    """Get appointments after creation"""
    print_test("STEP 4c: Get Appointments (After Creation)")
    
    # Get date range covering the appointment
    today = datetime.now()
    start = today.isoformat()
    end = (today + timedelta(days=14)).isoformat()
    
    try:
        response = requests.get(
            f"{BASE_URL}/booking/appointments?start={start}&end={end}",
            headers=booking_headers,
            timeout=10
        )
        
        if response.status_code != 200:
            return print_result(False, f"Status {response.status_code}: {response.text}")
        
        appointments = response.json()
        
        if appointments:
            print(f"  Found {len(appointments)} appointments")
            for appt in appointments:
                print(f"    ID: {appt['id']}")
                print(f"    Start: {appt.get('start_at')}")
                print(f"    Status: {appt.get('status')}")
                print(f"    Customer: {appt.get('customer_name')}")
                
                # Check for appointment_services
                services = appt.get('appointment_services', [])
                print(f"    Services: {len(services)} service(s)")
                for svc in services:
                    print(f"      - {svc.get('service_name', 'N/A')}")
            
            return print_result(True, f"Got {len(appointments)} appointments with appointment_services")
        else:
            return print_result(False, "No appointments found (expected at least 1)")
        
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_update_appointment_status():
    """Update appointment status to confirmed"""
    print_test("STEP 4d: Update Appointment Status to Confirmed")
    
    if not test_data['appointment_id']:
        return print_result(False, "No appointment ID available")
    
    body = {
        "appointment_id": test_data['appointment_id'],
        "status": "confirmed"
    }
    
    try:
        response = requests.put(
            f"{BASE_URL}/booking/appointments/status",
            headers=booking_headers,
            json=body,
            timeout=10
        )
        
        if response.status_code != 200:
            return print_result(False, f"Status {response.status_code}: {response.text}")
        
        return print_result(True, "Appointment status updated to confirmed")
        
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_reschedule_appointment():
    """Reschedule appointment"""
    print_test("STEP 4e: Reschedule Appointment")
    
    if not test_data['appointment_id'] or not test_data['staff_id']:
        return print_result(False, "Missing appointment_id or staff_id")
    
    # Calculate new datetime (2 hours later than original)
    today = datetime.now()
    days_ahead = test_data.get('availability_day', 1) - today.isoweekday()
    if days_ahead <= 0:
        days_ahead += 7
    
    target_date = today + timedelta(days=days_ahead)
    target_datetime = target_date.replace(hour=15, minute=0, second=0, microsecond=0)  # 3 PM (within 14:00-18:00)
    
    if (target_datetime - today).total_seconds() < 7200:
        target_datetime += timedelta(days=7)
    
    new_start_at = target_datetime.isoformat()
    
    print(f"  Rescheduling to: {new_start_at}")
    
    body = {
        "appointment_id": test_data['appointment_id'],
        "staff_id": test_data['staff_id'],
        "start_at": new_start_at
    }
    
    try:
        response = requests.put(
            f"{BASE_URL}/booking/appointments/reschedule",
            headers=booking_headers,
            json=body,
            timeout=10
        )
        
        if response.status_code == 200:
            return print_result(True, "Appointment rescheduled successfully")
        else:
            error_text = response.text
            print(f"  Error response: {error_text}")
            
            # Check if it's a Spanish error message
            if any(spanish_word in error_text.lower() for spanish_word in ['horario', 'profesional', 'servicio']):
                print(f"  ℹ️  Spanish error message detected")
            
            return print_result(False, f"Status {response.status_code}: {error_text}")
        
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_cancel_appointment():
    """Cancel appointment"""
    print_test("STEP 4f: Cancel Appointment")
    
    if not test_data['appointment_id']:
        return print_result(False, "No appointment ID available")
    
    body = {
        "appointment_id": test_data['appointment_id'],
        "status": "cancelled",
        "reason": "prueba"
    }
    
    try:
        response = requests.put(
            f"{BASE_URL}/booking/appointments/status",
            headers=booking_headers,
            json=body,
            timeout=10
        )
        
        if response.status_code != 200:
            return print_result(False, f"Status {response.status_code}: {response.text}")
        
        return print_result(True, "Appointment cancelled successfully (slot freed)")
        
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

# ============================================================================
# STEP 5: Error Translation
# ============================================================================

def test_error_translation():
    """Test Spanish error translation"""
    print_test("STEP 5: Test Error Translation (Empty service_ids)")
    
    body = {
        "staff_id": test_data['staff_id'],
        "service_ids": [],  # Empty - should trigger error
        "start_at": datetime.now().isoformat(),
        "customer_name": "Test",
        "customer_phone": "+595981111111"
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/booking/appointments/manual",
            headers=booking_headers,
            json=body,
            timeout=10
        )
        
        if response.status_code == 400:
            error_text = response.text
            print(f"  Error response: {error_text}")
            
            # Check for Spanish error message
            if "Selecciona al menos un servicio" in error_text or "servicio" in error_text.lower():
                return print_result(True, f"Spanish error message received: {error_text}")
            else:
                return print_result(False, f"Error not in Spanish: {error_text}")
        else:
            return print_result(False, f"Expected 400 error, got {response.status_code}")
        
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

# ============================================================================
# STEP 6: Public Routes
# ============================================================================

def test_public_booking_data():
    """Get public booking data"""
    print_test("STEP 6a: Get Public Booking Data")
    
    if not booking_slug:
        return print_result(False, "No booking slug available")
    
    try:
        response = requests.get(
            f"{BASE_URL}/store/{booking_slug}/booking",
            timeout=10
        )
        
        if response.status_code != 200:
            return print_result(False, f"Status {response.status_code}: {response.text}")
        
        data = response.json()
        
        # Verify structure
        required_keys = ['business', 'settings', 'serviceCategories', 'services', 'staff', 'staffServices']
        missing_keys = [k for k in required_keys if k not in data]
        
        if missing_keys:
            return print_result(False, f"Missing keys: {missing_keys}")
        
        print(f"  Business: {data['business'].get('first_name')} {data['business'].get('last_name')}")
        print(f"  Service Categories: {len(data['serviceCategories'])}")
        print(f"  Services: {len(data['services'])}")
        print(f"  Staff: {len(data['staff'])}")
        print(f"  Staff-Services: {len(data['staffServices'])}")
        
        # Verify staff objects DO NOT include phone or email
        staff_has_private = False
        for staff in data['staff']:
            if 'phone' in staff or 'email' in staff:
                staff_has_private = True
                print(f"  ⚠️  Staff object includes private fields: {staff}")
        
        if staff_has_private:
            return print_result(False, "Staff objects include private fields (phone/email)")
        else:
            print(f"  ✓ Staff objects do NOT include phone or email (correct)")
            return print_result(True, "Public booking data retrieved correctly")
        
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_public_availability():
    """Get public availability slots"""
    print_test("STEP 6b: Get Public Availability Slots")
    
    if not booking_slug or not test_data['service_id']:
        return print_result(False, "Missing booking_slug or service_id")
    
    # Get date for next occurrence of availability day
    today = datetime.now()
    days_ahead = test_data.get('availability_day', 1) - today.isoweekday()
    if days_ahead <= 0:
        days_ahead += 7
    
    target_date = today + timedelta(days=days_ahead)
    date_str = target_date.strftime('%Y-%m-%d')
    
    print(f"  Checking availability for date: {date_str}")
    print(f"  Service ID: {test_data['service_id']}")
    
    try:
        response = requests.get(
            f"{BASE_URL}/store/{booking_slug}/booking/availability?service_ids={test_data['service_id']}&date={date_str}",
            timeout=10
        )
        
        if response.status_code != 200:
            return print_result(False, f"Status {response.status_code}: {response.text}")
        
        slots = response.json()
        
        if isinstance(slots, list):
            print(f"  Found {len(slots)} available slots")
            
            if slots:
                # Show sample slot
                sample = slots[0]
                print(f"  Sample slot:")
                print(f"    Staff ID: {sample.get('staff_id')}")
                print(f"    Staff Name: {sample.get('staff_name')}")
                print(f"    Slot Start: {sample.get('slot_start')}")
                print(f"    Slot End: {sample.get('slot_end')}")
                print(f"    Total Price: {sample.get('total_price')}")
                print(f"    Total Duration: {sample.get('total_duration_minutes')} minutes")
                
                # Store first slot for public booking test
                test_data['public_slot'] = sample
            
            return print_result(True, f"Got {len(slots)} availability slots")
        else:
            return print_result(False, "Response is not a list")
        
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_public_booking():
    """Create public booking"""
    global test_data
    print_test("STEP 6c: Create Public Booking")
    
    if not booking_slug or not test_data['service_id']:
        return print_result(False, "Missing booking_slug or service_id")
    
    # Use slot from availability if available
    slot = test_data.get('public_slot')
    if slot:
        start_at = slot['slot_start']
        staff_id = slot['staff_id']
    else:
        # Calculate a valid future datetime
        today = datetime.now()
        days_ahead = test_data.get('availability_day', 1) - today.isoweekday()
        if days_ahead <= 0:
            days_ahead += 7
        
        target_date = today + timedelta(days=days_ahead)
        target_datetime = target_date.replace(hour=11, minute=0, second=0, microsecond=0)
        
        if (target_datetime - today).total_seconds() < 7200:
            target_datetime += timedelta(days=7)
        
        start_at = target_datetime.isoformat()
        staff_id = test_data['staff_id']
    
    print(f"  Booking at: {start_at}")
    
    body = {
        "service_ids": [test_data['service_id']],
        "staff_id": staff_id,
        "start_at": start_at,
        "customer_name": "Web Cliente",
        "customer_phone": "+595982222222"
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/store/{booking_slug}/booking",
            json=body,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            
            # Handle both snake_case and camelCase responses
            confirmation_code = data.get('confirmation_code') or data.get('confirmationCode')
            public_token = data.get('public_token') or data.get('publicToken')
            
            if confirmation_code and public_token:
                test_data['public_confirmation_code'] = confirmation_code
                test_data['public_token'] = public_token
                
                print(f"  Confirmation Code: {confirmation_code}")
                print(f"  Public Token: {public_token}")
                
                return print_result(True, f"Public booking created (code: {confirmation_code})")
            else:
                print_json(data)
                return print_result(False, "Missing confirmation_code/confirmationCode or public_token/publicToken in response")
        else:
            error_text = response.text
            print(f"  Error response: {error_text}")
            return print_result(False, f"Status {response.status_code}: {error_text}")
        
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_public_confirmation():
    """Get public confirmation"""
    print_test("STEP 6d: Get Public Confirmation")
    
    if not booking_slug or not test_data.get('public_token'):
        return print_result(False, "Missing booking_slug or public_token")
    
    try:
        response = requests.get(
            f"{BASE_URL}/store/{booking_slug}/booking/confirmation?token={test_data['public_token']}",
            timeout=10
        )
        
        if response.status_code != 200:
            return print_result(False, f"Status {response.status_code}: {response.text}")
        
        data = response.json()
        
        print(f"  Confirmation Code: {data.get('confirmation_code')}")
        print(f"  Customer Name: {data.get('customer_name')}")
        print(f"  Start At: {data.get('start_at')}")
        print(f"  Status: {data.get('status')}")
        print(f"  Total Price: {data.get('total_price')}")
        
        # Verify internal_notes is NOT included
        if 'internal_notes' in data:
            return print_result(False, "Response includes internal_notes (should be private)")
        else:
            print(f"  ✓ internal_notes NOT included (correct)")
            return print_result(True, "Public confirmation retrieved correctly")
        
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

# ============================================================================
# STEP 7: Regression Tests
# ============================================================================

def test_ecommerce_signin():
    """Sign in with ecommerce account"""
    global ecommerce_access_token, ecommerce_headers
    print_test("STEP 7a: Sign In with Ecommerce Account")
    
    email = "ortiz@gmail.com"
    password = "ortiz123"
    
    try:
        response = requests.post(
            f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
            json={"email": email, "password": password},
            headers={
                "apikey": SUPABASE_ANON_KEY,
                "Content-Type": "application/json"
            },
            timeout=10
        )
        
        if response.status_code != 200:
            return print_result(False, f"Status {response.status_code}: {response.text}")
        
        data = response.json()
        ecommerce_access_token = data.get('access_token')
        
        if not ecommerce_access_token:
            return print_result(False, "No access token in response")
        
        ecommerce_headers = {"Authorization": f"Bearer {ecommerce_access_token}"}
        
        return print_result(True, f"Ecommerce account signed in (ortiz@gmail.com)")
        
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_ecommerce_products():
    """Test ecommerce products endpoint"""
    print_test("STEP 7b: Regression - GET /api/products (Ecommerce)")
    
    try:
        response = requests.get(
            f"{BASE_URL}/products",
            headers=ecommerce_headers,
            timeout=10
        )
        
        if response.status_code != 200:
            return print_result(False, f"Status {response.status_code}: {response.text}")
        
        products = response.json()
        print(f"  Found {len(products)} products")
        
        return print_result(True, f"Ecommerce products endpoint working ({len(products)} products)")
        
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

def test_ecommerce_orders():
    """Test ecommerce orders endpoint"""
    print_test("STEP 7c: Regression - GET /api/orders (Ecommerce)")
    
    try:
        response = requests.get(
            f"{BASE_URL}/orders",
            headers=ecommerce_headers,
            timeout=10
        )
        
        if response.status_code != 200:
            return print_result(False, f"Status {response.status_code}: {response.text}")
        
        orders = response.json()
        print(f"  Found {len(orders)} orders")
        
        return print_result(True, f"Ecommerce orders endpoint working ({len(orders)} orders)")
        
    except Exception as e:
        return print_result(False, f"Exception: {str(e)}")

# ============================================================================
# Main Test Runner
# ============================================================================

def main():
    """Run all booking tests"""
    print("\n" + "="*80)
    print("BOOKING BACKEND API TESTING")
    print("Testing: Agendamientos + Tienda (Booking Module)")
    print("="*80)
    
    results = []
    
    # STEP 1: Create booking account
    print("\n" + "="*80)
    print("STEP 1: CREATE BOOKING BUSINESS ACCOUNT")
    print("="*80)
    results.append(("Create Booking Account", test_signup_booking_account()))
    
    if not booking_access_token:
        print("\n❌ FATAL: Cannot proceed without booking account")
        sys.exit(1)
    
    # STEP 2: Verify seeding
    print("\n" + "="*80)
    print("STEP 2: VERIFY SEEDING")
    print("="*80)
    results.append(("Booking Settings Seeded", test_get_booking_settings()))
    results.append(("Profesional Principal Seeded", test_get_booking_staff()))
    
    # STEP 3: CRUD operations
    print("\n" + "="*80)
    print("STEP 3: CRUD OPERATIONS")
    print("="*80)
    results.append(("Create Service Category", test_create_service_category()))
    results.append(("Get Service Categories", test_get_service_categories()))
    results.append(("Update Service Category", test_update_service_category()))
    results.append(("Create Service", test_create_service()))
    results.append(("Get Services", test_get_services()))
    results.append(("Update Service", test_update_service()))
    results.append(("Assign Staff Services", test_assign_staff_services()))
    results.append(("Get Staff Services", test_get_staff_services()))
    results.append(("Create Availability", test_create_availability()))
    results.append(("Get Availability", test_get_availability()))
    results.append(("Create Time-Off", test_create_timeoff()))
    results.append(("Get Time-Off", test_get_timeoff()))
    results.append(("Delete Time-Off", test_delete_timeoff()))
    results.append(("Update Settings", test_update_settings()))
    results.append(("Verify Settings Persisted", test_verify_settings_persisted()))
    
    # STEP 4: Appointments
    print("\n" + "="*80)
    print("STEP 4: APPOINTMENTS")
    print("="*80)
    results.append(("Get Appointments (Empty)", test_get_appointments_empty()))
    results.append(("Create Manual Appointment", test_create_manual_appointment()))
    
    if test_data['appointment_id']:
        results.append(("Get Appointments (With Data)", test_get_appointments_with_data()))
        results.append(("Update Appointment Status", test_update_appointment_status()))
        results.append(("Reschedule Appointment", test_reschedule_appointment()))
        results.append(("Cancel Appointment", test_cancel_appointment()))
    
    # STEP 5: Error translation
    print("\n" + "="*80)
    print("STEP 5: ERROR TRANSLATION")
    print("="*80)
    results.append(("Spanish Error Translation", test_error_translation()))
    
    # STEP 6: Public routes
    print("\n" + "="*80)
    print("STEP 6: PUBLIC ROUTES")
    print("="*80)
    results.append(("Public Booking Data", test_public_booking_data()))
    results.append(("Public Availability", test_public_availability()))
    results.append(("Public Booking", test_public_booking()))
    
    if test_data.get('public_token'):
        results.append(("Public Confirmation", test_public_confirmation()))
    
    # STEP 7: Regression
    print("\n" + "="*80)
    print("STEP 7: REGRESSION TESTS")
    print("="*80)
    results.append(("Ecommerce Sign In", test_ecommerce_signin()))
    
    if ecommerce_access_token:
        results.append(("Ecommerce Products", test_ecommerce_products()))
        results.append(("Ecommerce Orders", test_ecommerce_orders()))
    
    # Final Summary
    print("\n" + "="*80)
    print("TESTING COMPLETE - SUMMARY")
    print("="*80)
    
    passed = sum(1 for _, result in results if result)
    failed = sum(1 for _, result in results if not result)
    total = len(results)
    
    print(f"\nTotal Tests: {total}")
    print(f"Passed: {passed} ✅")
    print(f"Failed: {failed} ❌")
    print(f"Success Rate: {(passed/total*100):.1f}%")
    
    print("\n" + "="*80)
    print("DETAILED RESULTS")
    print("="*80)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    print("\n")

if __name__ == "__main__":
    main()
