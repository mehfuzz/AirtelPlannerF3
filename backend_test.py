#!/usr/bin/env python3

import requests
import sys
import json
from datetime import datetime

class AirtelPPOTrackerTester:
    def __init__(self, base_url="https://airtel-portal-sync.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.session = requests.Session()
        self.session.headers.update({'Content-Type': 'application/json'})
        self.tests_run = 0
        self.tests_passed = 0
        self.user_token = None
        self.admin_user = None

    def log_test(self, name, success, details=""):
        """Log test results"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name}")
        else:
            print(f"❌ {name} - {details}")
        return success

    def test_api_health(self):
        """Test if API is accessible"""
        try:
            response = self.session.get(f"{self.api_url}/")
            success = response.status_code == 200
            return self.log_test("API Health Check", success, 
                               f"Status: {response.status_code}" if not success else "")
        except Exception as e:
            return self.log_test("API Health Check", False, str(e))

    def test_admin_login(self):
        """Test admin login functionality"""
        try:
            login_data = {
                "email": "admin@airtel.com",
                "password": "airtel123"
            }
            response = self.session.post(f"{self.api_url}/auth/login", json=login_data)
            
            if response.status_code == 200:
                self.admin_user = response.json()
                # Check if cookies are set
                cookies_set = 'access_token' in response.cookies
                success = cookies_set and self.admin_user.get('role') == 'admin'
                return self.log_test("Admin Login", success, 
                                   "Missing cookies or admin role" if not success else "")
            else:
                return self.log_test("Admin Login", False, 
                                   f"Status: {response.status_code}, Response: {response.text}")
        except Exception as e:
            return self.log_test("Admin Login", False, str(e))

    def test_auth_me(self):
        """Test getting current user info"""
        try:
            response = self.session.get(f"{self.api_url}/auth/me")
            success = response.status_code == 200 and response.json().get('email') == 'admin@airtel.com'
            return self.log_test("Auth Me Endpoint", success, 
                               f"Status: {response.status_code}" if not success else "")
        except Exception as e:
            return self.log_test("Auth Me Endpoint", False, str(e))

    def test_get_weeks(self):
        """Test fetching weeks data"""
        try:
            response = self.session.get(f"{self.api_url}/weeks")
            if response.status_code == 200:
                weeks = response.json()
                success = len(weeks) == 8 and all('tasks' in week for week in weeks)
                details = f"Found {len(weeks)} weeks" if not success else ""
                return self.log_test("Get Weeks", success, details)
            else:
                return self.log_test("Get Weeks", False, f"Status: {response.status_code}")
        except Exception as e:
            return self.log_test("Get Weeks", False, str(e))

    def test_update_week_title(self):
        """Test updating week title"""
        try:
            # First get weeks to find a week ID
            weeks_response = self.session.get(f"{self.api_url}/weeks")
            if weeks_response.status_code != 200:
                return self.log_test("Update Week Title", False, "Could not fetch weeks")
            
            weeks = weeks_response.json()
            if not weeks:
                return self.log_test("Update Week Title", False, "No weeks found")
            
            week_id = weeks[0]['id']
            original_title = weeks[0]['title']
            test_title = f"Test Title - {datetime.now().strftime('%H:%M:%S')}"
            
            # Update title
            response = self.session.put(f"{self.api_url}/weeks/{week_id}", 
                                      json={"title": test_title})
            
            if response.status_code == 200:
                updated_week = response.json()
                success = updated_week['title'] == test_title
                
                # Restore original title
                self.session.put(f"{self.api_url}/weeks/{week_id}", 
                               json={"title": original_title})
                
                return self.log_test("Update Week Title", success, 
                                   "Title not updated correctly" if not success else "")
            else:
                return self.log_test("Update Week Title", False, f"Status: {response.status_code}")
        except Exception as e:
            return self.log_test("Update Week Title", False, str(e))

    def test_task_operations(self):
        """Test task CRUD operations"""
        try:
            # Get first week
            weeks_response = self.session.get(f"{self.api_url}/weeks")
            if weeks_response.status_code != 200:
                return self.log_test("Task Operations", False, "Could not fetch weeks")
            
            weeks = weeks_response.json()
            if not weeks:
                return self.log_test("Task Operations", False, "No weeks found")
            
            week_id = weeks[0]['id']
            
            # Add a task
            new_task_data = {
                "title": f"Test Task - {datetime.now().strftime('%H:%M:%S')}",
                "due_date": "2024-12-31"
            }
            
            add_response = self.session.post(f"{self.api_url}/weeks/{week_id}/tasks", 
                                           json=new_task_data)
            
            if add_response.status_code != 200:
                return self.log_test("Task Operations", False, 
                                   f"Add task failed: {add_response.status_code}")
            
            new_task = add_response.json()
            task_id = new_task['id']
            
            # Update task
            update_response = self.session.put(f"{self.api_url}/weeks/{week_id}/tasks/{task_id}",
                                             json={"completed": True})
            
            if update_response.status_code != 200:
                return self.log_test("Task Operations", False, 
                                   f"Update task failed: {update_response.status_code}")
            
            # Delete task
            delete_response = self.session.delete(f"{self.api_url}/weeks/{week_id}/tasks/{task_id}")
            
            success = delete_response.status_code == 200
            return self.log_test("Task Operations", success, 
                               f"Delete failed: {delete_response.status_code}" if not success else "")
            
        except Exception as e:
            return self.log_test("Task Operations", False, str(e))

    def test_comment_operations(self):
        """Test comment operations"""
        try:
            # Get first week and task
            weeks_response = self.session.get(f"{self.api_url}/weeks")
            if weeks_response.status_code != 200:
                return self.log_test("Comment Operations", False, "Could not fetch weeks")
            
            weeks = weeks_response.json()
            if not weeks or not weeks[0].get('tasks'):
                return self.log_test("Comment Operations", False, "No weeks or tasks found")
            
            week_id = weeks[0]['id']
            task_id = weeks[0]['tasks'][0]['id']
            
            # Add comment
            comment_data = {"text": f"Test comment - {datetime.now().strftime('%H:%M:%S')}"}
            add_response = self.session.post(
                f"{self.api_url}/weeks/{week_id}/tasks/{task_id}/comments",
                json=comment_data
            )
            
            if add_response.status_code != 200:
                return self.log_test("Comment Operations", False, 
                                   f"Add comment failed: {add_response.status_code}")
            
            comment = add_response.json()
            comment_id = comment['id']
            
            # Delete comment
            delete_response = self.session.delete(
                f"{self.api_url}/weeks/{week_id}/tasks/{task_id}/comments/{comment_id}"
            )
            
            success = delete_response.status_code == 200
            return self.log_test("Comment Operations", success, 
                               f"Delete failed: {delete_response.status_code}" if not success else "")
            
        except Exception as e:
            return self.log_test("Comment Operations", False, str(e))

    def test_user_management(self):
        """Test user management operations (admin only)"""
        try:
            # Get users
            users_response = self.session.get(f"{self.api_url}/users")
            if users_response.status_code != 200:
                return self.log_test("User Management", False, 
                                   f"Get users failed: {users_response.status_code}")
            
            users = users_response.json()
            admin_found = any(user['email'] == 'admin@airtel.com' for user in users)
            
            if not admin_found:
                return self.log_test("User Management", False, "Admin user not found")
            
            # Add test user
            test_user_data = {
                "email": f"test.user.{datetime.now().strftime('%H%M%S')}@airtel.com",
                "password": "testpass123",
                "name": "Test User"
            }
            
            add_response = self.session.post(f"{self.api_url}/users", json=test_user_data)
            
            if add_response.status_code != 200:
                return self.log_test("User Management", False, 
                                   f"Add user failed: {add_response.status_code}")
            
            new_user = add_response.json()
            user_id = new_user['id']
            
            # Delete test user
            delete_response = self.session.delete(f"{self.api_url}/users/{user_id}")
            
            success = delete_response.status_code == 200
            return self.log_test("User Management", success, 
                               f"Delete user failed: {delete_response.status_code}" if not success else "")
            
        except Exception as e:
            return self.log_test("User Management", False, str(e))

    def test_task_reordering(self):
        """Test task reordering functionality (drag-and-drop feature)"""
        try:
            # Get first week with tasks
            weeks_response = self.session.get(f"{self.api_url}/weeks")
            if weeks_response.status_code != 200:
                return self.log_test("Task Reordering", False, "Could not fetch weeks")
            
            weeks = weeks_response.json()
            if not weeks:
                return self.log_test("Task Reordering", False, "No weeks found")
            
            # Find a week with multiple tasks
            target_week = None
            for week in weeks:
                if len(week.get('tasks', [])) >= 2:
                    target_week = week
                    break
            
            if not target_week:
                return self.log_test("Task Reordering", False, "No week with multiple tasks found")
            
            week_id = target_week['id']
            original_tasks = target_week['tasks']
            
            # Create reversed order of task IDs
            task_ids = [task['id'] for task in original_tasks]
            reversed_task_ids = list(reversed(task_ids))
            
            # Test reordering
            reorder_data = {"task_ids": reversed_task_ids}
            response = self.session.put(f"{self.api_url}/weeks/{week_id}/tasks/reorder", 
                                      json=reorder_data)
            
            if response.status_code != 200:
                return self.log_test("Task Reordering", False, 
                                   f"Reorder failed: {response.status_code}")
            
            # Verify the order was changed
            updated_weeks_response = self.session.get(f"{self.api_url}/weeks")
            if updated_weeks_response.status_code != 200:
                return self.log_test("Task Reordering", False, "Could not verify reorder")
            
            updated_weeks = updated_weeks_response.json()
            updated_week = next((w for w in updated_weeks if w['id'] == week_id), None)
            
            if not updated_week:
                return self.log_test("Task Reordering", False, "Updated week not found")
            
            updated_task_ids = [task['id'] for task in updated_week['tasks']]
            success = updated_task_ids == reversed_task_ids
            
            # Restore original order
            self.session.put(f"{self.api_url}/weeks/{week_id}/tasks/reorder", 
                           json={"task_ids": task_ids})
            
            return self.log_test("Task Reordering", success, 
                               "Task order not updated correctly" if not success else "")
            
        except Exception as e:
            return self.log_test("Task Reordering", False, str(e))

    def test_logout(self):
        """Test logout functionality"""
        try:
            response = self.session.post(f"{self.api_url}/auth/logout")
            success = response.status_code == 200
            return self.log_test("Logout", success, 
                               f"Status: {response.status_code}" if not success else "")
        except Exception as e:
            return self.log_test("Logout", False, str(e))

    def run_all_tests(self):
        """Run all backend tests"""
        print("🚀 Starting Airtel PPO Tracker Backend Tests")
        print("=" * 50)
        
        # Test sequence
        tests = [
            self.test_api_health,
            self.test_admin_login,
            self.test_auth_me,
            self.test_get_weeks,
            self.test_update_week_title,
            self.test_task_operations,
            self.test_task_reordering,
            self.test_comment_operations,
            self.test_user_management,
            self.test_logout
        ]
        
        for test in tests:
            test()
        
        print("=" * 50)
        print(f"📊 Tests completed: {self.tests_passed}/{self.tests_run} passed")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All backend tests passed!")
            return True
        else:
            print(f"⚠️  {self.tests_run - self.tests_passed} tests failed")
            return False

def main():
    tester = AirtelPPOTrackerTester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())