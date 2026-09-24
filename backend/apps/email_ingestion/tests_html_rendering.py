from email.message import EmailMessage

from django.test import SimpleTestCase

from .email_html import extract_sanitized_html


class EmailHtmlRenderingTests(SimpleTestCase):
    def test_preserves_signature_and_removes_quoted_history(self):
        message = EmailMessage()
        message.set_content("Hello,\n\nThanks for your response.\n\nRegards,\nSheikh Farid")
        message.add_alternative(
            """
            <div>Hello,</div>
            <div>Thanks for your response.</div>
            <table style="color:#144396;font-size:13px">
              <tr>
                <td><img src="https://example.com/logo.png" width="90"></td>
                <td><strong>Sheikh Farid</strong><br>
                    <a href="mailto:info@example.com">info@example.com</a></td>
              </tr>
            </table>
            <script>alert('xss')</script>
            <div class="zmail_extra">
              <blockquote id="blockquote_zmail">Old quoted conversation</blockquote>
            </div>
            """,
            subtype="html",
        )

        rendered = extract_sanitized_html(message)

        self.assertIn("Sheikh Farid", rendered)
        self.assertIn("https://example.com/logo.png", rendered)
        self.assertIn('referrerpolicy="no-referrer"', rendered)
        self.assertIn("mailto:info@example.com", rendered)
        self.assertNotIn("Old quoted conversation", rendered)
        self.assertNotIn("<script", rendered)
        self.assertNotIn("alert(", rendered)

    def test_plain_text_only_email_has_no_html_copy(self):
        message = EmailMessage()
        message.set_content("Plain text only")
        self.assertEqual(extract_sanitized_html(message), "")
