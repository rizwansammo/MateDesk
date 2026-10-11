"""Source level checks for the shared Platform Admin MateDesk splash."""

import unittest
from pathlib import Path

APP = Path(__file__).resolve().parent
TEMPLATES = APP / "templates" / "platform_admin"
STATIC = APP / "static" / "platform_admin"
FRONTEND_LAYOUT = APP.parents[2] / "frontend" / "src" / "app" / "layout.tsx"


class PlatformAdminSplashTests(unittest.TestCase):
    def test_dashboard_and_login_use_one_shared_splash(self):
        for screen in ("base.html", "login.html"):
            with self.subTest(screen=screen):
                text = (TEMPLATES / screen).read_text()
                self.assertIn('{% include "platform_admin/_splash.html" %}', text)
                self.assertIn("platform_admin/splash.css", text)
                self.assertIn("platform_admin/splash.js", text)
                self.assertNotIn('<div id="pto"', text)

    def test_matedesk_brand_and_main_app_geometry(self):
        splash = (TEMPLATES / "_splash.html").read_text()
        css = (STATIC / "splash.css").read_text()
        main_app = FRONTEND_LAYOUT.read_text()
        self.assertIn('id="pto"', splash)
        self.assertIn('class="md-splash-wordmark">Mate<span>Desk</span>', splash)
        self.assertIn("Loading workspace…", splash)
        self.assertNotIn("NetaMate.png", splash)
        for size in ("88px", "48px", "0.9s", "0.38s"):
            self.assertIn(size, css)
        self.assertIn("width: 88, height: 88", main_app)
        self.assertIn("width: 48, height: 48", main_app)
        self.assertIn("animation: _md-spin 0.9s", main_app)
        self.assertIn("transition: opacity 0.38s", main_app)
        self.assertIn("M3 4h18v9.5l-4.5 0-1.8 2.5", splash)
        self.assertIn("M3 4h18v9.5l-4.5 0-1.8 2.5", main_app)

    def test_previous_splash_is_not_active_but_assets_are_preserved(self):
        self.assertNotIn("#pto", (STATIC / "admin.css").read_text())
        self.assertNotIn("initPageTransition", (STATIC / "admin.js").read_text())
        self.assertNotIn("pto-arc", (TEMPLATES / "login.html").read_text())
        self.assertTrue((STATIC / "img" / "NetaMate.png").is_file())

    def test_js_retains_navigation_and_modal_helper(self):
        js = (STATIC / "splash.js").read_text()
        self.assertIn("window._ptoShow = showSplash", js)
        self.assertIn("setTimeout(resolve, 700)", js)
        self.assertIn("document.fonts.ready", js)
        self.assertIn("event.defaultPrevented", js)
        self.assertIn("event.persisted", js)


if __name__ == "__main__":
    unittest.main()
