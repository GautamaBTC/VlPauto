from playwright.sync_api import Page, expect
import os

def test_login_flow(page: Page):
    """
    This test verifies that a user can log in and is redirected to the dashboard.
    It checks for the presence of the dashboard's main title.
    """
    # 1. Arrange: Go to the application's base URL.
    # The server should be running on localhost:3000.
    base_url = os.environ.get("BASE_URL", "http://localhost:3000")
    page.goto(base_url)

    # 2. Act: Fill in the login form and submit.
    # Using the simplified credentials.
    page.get_by_label("Логин:").fill("director")
    page.get_by_label("Пароль:").fill("password")
    page.get_by_role("button", name="Войти").click()

    # 3. Assert: Confirm the navigation to the dashboard was successful.
    # We expect to see the main heading of the application.
    dashboard_heading = page.get_by_role("heading", name="Vip-Auto CRM")
    expect(dashboard_heading).to_be_visible(timeout=10000)

    # 4. Screenshot: Capture the final result for visual verification.
    page.screenshot(path="jules-scratch/verification/verification.png")