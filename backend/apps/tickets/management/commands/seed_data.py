"""
Seed command — creates 5 client organisations × 10 users × 2 tickets for a tenant.

Usage:
    python manage.py seed_data                    # defaults to slug='netamate'
    python manage.py seed_data --tenant=myslug
    python manage.py seed_data --flush            # delete existing seed data first
"""
from datetime import timedelta

from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

# ── Static seed data ──────────────────────────────────────────────────────────

CLIENT_ORGS = [
    {'name': 'Netswitch Technologies', 'domain': 'netswitch.io',     'contact_name': 'Marcus Reed',    'contact_email': 'it@netswitch.io',     'phone': '+1 (312) 555-0142', 'address': '200 W Madison St, Chicago, IL 60606'},
    {'name': 'ApexNova Solutions',     'domain': 'apexnova.com',     'contact_name': 'Priya Nair',     'contact_email': 'helpdesk@apexnova.com','phone': '+1 (415) 555-0287', 'address': '1 Market St, Suite 300, San Francisco, CA 94105'},
    {'name': 'BluePeak Systems',       'domain': 'bluepeaksys.com',  'contact_name': 'Trevor Okafor',  'contact_email': 'support@bluepeaksys.com','phone': '+1 (212) 555-0374','address': '30 Rockefeller Plaza, New York, NY 10112'},
    {'name': 'VertexCore IT',          'domain': 'vertexcore.net',   'contact_name': 'Cynthia Lam',    'contact_email': 'admin@vertexcore.net', 'phone': '+1 (512) 555-0461', 'address': '500 W 2nd St, Austin, TX 78701'},
    {'name': 'OrionStack Technologies','domain': 'orionstack.io',    'contact_name': 'Brendan Walsh',  'contact_email': 'ops@orionstack.io',    'phone': '+1 (206) 555-0539', 'address': '1201 3rd Ave, Seattle, WA 98101'},
]

# 10 user templates — same names reused across orgs; emails differ by domain
USERS = [
    {'first': 'James',   'last': 'Carter',    'role': 'client_owner', 'title': 'IT Manager',            'dept': 'Information Technology', 'phone': '+1 (312) 555-1001'},
    {'first': 'Sarah',   'last': 'Mitchell',  'role': 'end_user',     'title': 'Systems Administrator', 'dept': 'Information Technology', 'phone': '+1 (312) 555-1002'},
    {'first': 'David',   'last': 'Thompson',  'role': 'end_user',     'title': 'Network Engineer',      'dept': 'Infrastructure',         'phone': '+1 (312) 555-1003'},
    {'first': 'Emily',   'last': 'Rodriguez', 'role': 'end_user',     'title': 'Help Desk Technician',  'dept': 'Support',                'phone': '+1 (312) 555-1004'},
    {'first': 'Michael', 'last': 'Chen',      'role': 'end_user',     'title': 'Database Administrator','dept': 'Information Technology', 'phone': '+1 (312) 555-1005'},
    {'first': 'Jessica', 'last': 'Brown',     'role': 'end_user',     'title': 'Software Developer',    'dept': 'Engineering',            'phone': '+1 (312) 555-1006'},
    {'first': 'Robert',  'last': 'Kim',       'role': 'end_user',     'title': 'DevOps Engineer',       'dept': 'Engineering',            'phone': '+1 (312) 555-1007'},
    {'first': 'Amanda',  'last': 'Walsh',     'role': 'vip_manager',  'title': 'Security Analyst',      'dept': 'Security',               'phone': '+1 (312) 555-1008'},
    {'first': 'Daniel',  'last': 'Nguyen',    'role': 'end_user',     'title': 'Cloud Architect',       'dept': 'Infrastructure',         'phone': '+1 (312) 555-1009'},
    {'first': 'Laura',   'last': 'Patel',     'role': 'end_user',     'title': 'Operations Manager',    'dept': 'Operations',             'phone': '+1 (312) 555-1010'},
]

# 20 ticket templates — 2 per user position across all orgs.
# Each entry: subject, description, priority, level, category, tags, status, days_until_due
TICKETS = [
    # ── User 0 (IT Manager) ───────────────────────────────────────────────────
    {
        'subject': 'VPN connection drops intermittently throughout the working day',
        'description': (
            'Remote workers are reporting that the VPN disconnects randomly, approximately 4–6 times per day.\n\n'
            'Affected users: All remote staff (~15 employees)\n'
            'Frequency: 4–6 disconnects/day, each lasting 2–5 minutes\n'
            'First reported: This morning — may have started yesterday afternoon\n\n'
            'Steps already attempted:\n'
            '1. Restarted the VPN client on affected machines — issue persists\n'
            '2. Verified internet connectivity — stable on all affected machines\n'
            '3. Reviewed VPN gateway logs — seeing repeated "TLS handshake timeout" errors\n\n'
            'Impact: High — remote employees cannot access the CRM and ERP systems during disconnects. '
            'The sales team is most affected and has a major client presentation tomorrow.\n\n'
            'Please treat as priority. We need stable remote access before 09:00 AM tomorrow.'
        ),
        'priority': 'high', 'level': 'L2', 'category': 'Network',
        'tags': ['vpn', 'connectivity', 'remote-work'],
        'status': 'open', 'days_due': 1,
    },
    {
        'subject': 'Request to review and update firewall rules for new cloud applications',
        'description': (
            'The operations team has deployed two new SaaS platforms (Tableau Cloud and Salesforce CPQ) '
            'and requires firewall policy updates to permit outbound traffic.\n\n'
            'Required changes:\n'
            '1. Add allow rule: Internal VLANs 10/20 → *.tableau.com, *.salesforce.com on TCP 443\n'
            '2. Exclude *.tableau.com and *.salesforce.com from SSL deep inspection\n'
            '3. Reclassify tableau.com from "Uncategorized" to "Business Applications" in the web filter\n\n'
            'Affected VLANs: VLAN 10 (Corporate), VLAN 20 (Servers)\n'
            'Guest VLAN (VLAN 30): must remain blocked\n\n'
            'Business justification: Tableau Cloud replaces our on-premise BI platform. '
            '35 analyst users need access from Monday.\n\n'
            'Change approval: CAB sign-off obtained (Change Request #CR-2047).\n'
            'Deadline: Friday EOD to allow weekend testing before Monday go-live.'
        ),
        'priority': 'normal', 'level': 'L2', 'category': 'Network',
        'tags': ['firewall', 'change-request', 'cloud', 'tableau'],
        'status': 'in_progress', 'days_due': 3,
    },

    # ── User 1 (Systems Administrator) ───────────────────────────────────────
    {
        'subject': 'Primary file server disk utilization at 91% — immediate cleanup required',
        'description': (
            'Monitoring has flagged FS01 (primary file server) for critically high disk utilization. '
            'Disk C: is at 91% and is projected to hit 95% (auto-shutdown threshold) within 3 days.\n\n'
            'Server: FS01 | OS: Windows Server 2019\n'
            'Disk C: 500 GB total, 455 GB used\n'
            'Disk D: (Data) 4 TB total, 3.1 TB used (78%)\n\n'
            'Growth rate: ~2 GB/day on C: (elevated from normal ~200 MB/day)\n\n'
            'Identified causes:\n'
            '1. Application logs in C:\\Logs\\AppServer not rotated — 38 GB of log files\n'
            '2. Windows Update cache (SoftwareDistribution) consuming 12 GB\n'
            '3. VSS shadow copies using 22 GB\n\n'
            'Requested actions:\n'
            '1. Clear logs older than 30 days\n'
            '2. Flush Windows Update cache\n'
            '3. Reduce VSS snapshot retention to 5 snapshots\n'
            '4. Evaluate archiving old project data to Disk D:\n\n'
            'This is a production server. Schedule maintenance window during off-peak hours.'
        ),
        'priority': 'critical', 'level': 'L2', 'category': 'Infrastructure',
        'tags': ['server', 'disk-space', 'monitoring'],
        'status': 'open', 'days_due': 2,
    },
    {
        'subject': 'Request for dual-monitor setup for increased productivity',
        'description': (
            'Requesting a second monitor to improve multitasking efficiency.\n\n'
            'Current setup:\n'
            '- Workstation: CORP-PC-041\n'
            '- Monitor: Dell 24" P2419H (DisplayPort in use)\n'
            '- Available ports: 1× HDMI, 2× USB-A\n\n'
            'Request:\n'
            '- 1× additional 24" monitor (Dell P2419H to match existing)\n'
            '- HDMI cable (1.5 m)\n'
            '- Dual monitor stand or individual arm mount\n\n'
            'Business justification:\n'
            'I regularly run Salesforce CRM, Outlook, Excel dashboards, and Microsoft Teams '
            'simultaneously. Constant application switching on a single screen reduces efficiency '
            'by approximately 25% compared to my previous dual-monitor setup at a prior employer.\n\n'
            'Manager has verbally approved. Please confirm if monitors are available in IT stock '
            'before raising a purchase order.'
        ),
        'priority': 'low', 'level': 'L1', 'category': 'Hardware',
        'tags': ['hardware-request', 'monitor', 'workstation'],
        'status': 'pending', 'days_due': 14,
    },

    # ── User 2 (Network Engineer) ─────────────────────────────────────────────
    {
        'subject': 'Nightly SQL Server backup job failing — third consecutive night',
        'description': (
            'The SQL Server Agent backup job on DB-PROD-01 has failed for the third consecutive night. '
            'Last successful backup: Sunday 11:00 PM (3 days ago).\n\n'
            'Environment:\n'
            '- SQL Server 2019 (15.0.4375.4) on DB-PROD-01\n'
            '- Backup destination: \\\\backup-nas\\sqlbackups\n'
            '- Backup type: Full database backup (all 3 production databases)\n\n'
            'Error from SQL Agent log:\n'
            '"BackupDiskFile::CreateMedia: Backup device failed to create.\n'
            ' Operating system error 112 (There is not enough space on the disk.)"\n\n'
            'Backup NAS status:\n'
            '- Total: 8 TB | Used: 7.8 TB (97.5%) | Available: 200 GB\n\n'
            'Databases affected: CustomerDB (580 GB), OrdersDB (220 GB), ReportsDB (45 GB)\n\n'
            'Retention policy requires 7 daily backups. NAS is undersized for current database growth.\n\n'
            'Immediate actions required:\n'
            '1. Remove backups beyond 7-day retention manually to free space\n'
            '2. Verify integrity of last successful backup (3 days ago)\n'
            '3. Run manual backup tonight once space is freed\n'
            '4. Raise capacity expansion request for NAS\n\n'
            'Compliance risk: our SLA mandates daily backups with 7-day retention.'
        ),
        'priority': 'critical', 'level': 'L3', 'category': 'Database',
        'tags': ['backup', 'sql-server', 'storage', 'compliance'],
        'status': 'open', 'days_due': 0,
    },
    {
        'subject': 'Office printer on 2nd floor (Finance) not responding to print jobs',
        'description': (
            'The HP LaserJet Pro M404dn on the 2nd floor (Finance wing) has stopped processing '
            'print jobs. The printer shows "Online" in the queue but all jobs remain in "Pending" state.\n\n'
            'Device details:\n'
            '- Model: HP LaserJet Pro M404dn\n'
            '- IP: 192.168.1.45 (static)\n'
            '- Location: 2nd Floor, Finance Wing, Bay 3\n\n'
            'Error observed:\n'
            '- Jobs queue but never start printing\n'
            '- Printer display reads "Ready" with no error indicators\n'
            '- Restarting the print spooler clears the queue temporarily but printing still fails\n\n'
            'Affected users: Finance team (8 employees) processing end-of-month invoices today\n\n'
            'Already attempted:\n'
            '- Restarted print spooler on multiple workstations — no change\n'
            '- Deleted stuck jobs from the queue — new jobs still pend\n'
            '- Restarted the printer — issue persists\n\n'
            'This is time-sensitive: invoice batch must be printed before 5:00 PM today.'
        ),
        'priority': 'normal', 'level': 'L1', 'category': 'Hardware',
        'tags': ['printer', 'hardware', 'finance'],
        'status': 'solved', 'days_due': None,
    },

    # ── User 3 (Help Desk Technician) ─────────────────────────────────────────
    {
        'subject': 'Outlook not syncing new emails — 12 users affected since 09:00 AM',
        'description': (
            'Outlook 365 desktop client has stopped downloading new emails for multiple users since '
            'approximately 09:00 AM. New mail is visible in Outlook Web App but not the desktop client.\n\n'
            'Environment:\n'
            '- Outlook 2019 (version 1808, Build 10730)\n'
            '- Windows 10 Pro (22H2)\n\n'
            'Symptoms:\n'
            '- New emails visible in OWA; not appearing in desktop Outlook\n'
            '- Send/Receive runs without errors but no mail downloads\n'
            '- Sent mail from desktop IS being delivered to recipients (confirmed)\n'
            '- Calendar sync appears unaffected\n\n'
            'Affected departments: Primarily Sales (7 users) and HR (5 users)\n\n'
            'Troubleshooting completed:\n'
            '1. Disabled and re-enabled Exchange account — no change\n'
            '2. Created a new Outlook profile — same issue\n'
            '3. Verified autodiscover DNS — appears correct\n'
            '4. No Windows updates installed in last 48 hours\n\n'
            'Impact: Sales team is expecting critical client deal confirmations that cannot be '
            'accessed on desktop. HR is waiting for candidate documents for interviews today.\n\n'
            'Requesting urgent resolution.'
        ),
        'priority': 'high', 'level': 'L2', 'category': 'Email',
        'tags': ['outlook', 'email-sync', 'microsoft365'],
        'status': 'in_progress', 'days_due': 1,
    },
    {
        'subject': 'User account locked — cannot access workstation or systems',
        'description': (
            'Account is locked after multiple failed login attempts. User cannot log in to workstation '
            'or any company applications.\n\n'
            'User: Finance department, Workstation FINANCE-PC-07\n\n'
            'User reports:\n'
            '- Changed password last week via self-service portal\n'
            '- New password worked for 2 days, then started failing\n'
            '- Account locked after 5 failed attempts this morning\n\n'
            'Likely cause: iPhone with company email is configured with the old password and '
            'is generating repeated failed authentication attempts against Active Directory.\n\n'
            'Urgency: An external audit begins in 1 hour. User must have access before then.\n\n'
            'Requested actions:\n'
            '1. Unlock the Active Directory account immediately\n'
            '2. Reset to a temporary password and require change on first login\n'
            '3. Remote into workstation to update saved credentials\n'
            '4. Help user update credentials on iPhone and any other enrolled devices\n'
            '5. Review account policy — lockout threshold may be too aggressive (currently 5 attempts)'
        ),
        'priority': 'high', 'level': 'L1', 'category': 'Access',
        'tags': ['account-lock', 'password', 'active-directory'],
        'status': 'solved', 'days_due': None,
    },

    # ── User 4 (Database Administrator) ──────────────────────────────────────
    {
        'subject': 'Suspicious login activity — possible account compromise from foreign IP',
        'description': (
            'Security monitoring has flagged suspicious login activity on a user account. '
            'Multiple attempts from an unrecognised geographic location were detected overnight.\n\n'
            'Alert details:\n'
            '- Alert type: Anomalous geographic login (Azure AD Identity Protection)\n'
            '- Normal login location: Chicago, IL, USA\n'
            '- Suspicious location: Lagos, Nigeria (IP: 102.89.45.231)\n'
            '- Time window: 02:14 AM – 02:47 AM (12 attempts over 33 minutes)\n'
            '- Result: 2 successful logins, 10 failed\n\n'
            'MFA note: Successful logins completed MFA — unclear if user was travelling or if '
            'MFA device was also compromised.\n\n'
            'Current status:\n'
            '- Account auto-flagged as high-risk by Conditional Access\n'
            '- No data exfiltration detected in DLP logs (so far)\n'
            '- No new email forwarding rules detected\n\n'
            'Requested actions (in order):\n'
            '1. Contact user via phone to confirm if they were travelling\n'
            '2. If travel NOT confirmed: revoke all active sessions and MFA devices immediately\n'
            '3. Reset password and force re-enroll MFA\n'
            '4. Pull audit logs for the last 24 hours — check SharePoint and OneDrive access\n'
            '5. Escalate to security team for full incident review\n\n'
            'Do NOT notify user via email until account is confirmed secure.'
        ),
        'priority': 'critical', 'level': 'L3', 'category': 'Security',
        'tags': ['security', 'account-compromise', 'azure-ad', 'incident'],
        'status': 'in_progress', 'days_due': 0,
    },
    {
        'subject': 'SSL certificate expiring in 14 days — customer portal at risk',
        'description': (
            'The TLS certificate for our customer-facing portal is expiring in 14 days. '
            'Renewal is required to prevent browser security warnings and payment processor validation failures.\n\n'
            'Certificate details:\n'
            '- Domain: portal.[org-domain]\n'
            '- Certificate Authority: DigiCert\n'
            '- Expiry: 14 days from today\n'
            '- Type: Standard DV SSL\n'
            '- Installed on: IIS 10 (web server) + HAProxy (load balancer)\n\n'
            'Auto-renewal: NOT configured — manual process required\n\n'
            'Renewal procedure:\n'
            '1. Generate new CSR on the web server (IIS)\n'
            '2. Submit CSR to DigiCert — credentials in IT Vault (#SSL-PORTAL)\n'
            '3. Complete domain validation via DNS TXT record\n'
            '4. Download and install full chain on IIS and HAProxy\n'
            '5. Verify HTTPS connectivity with chain validation tool\n'
            '6. Update monitoring with new expiry date\n\n'
            'Note from previous renewal: intermediate certificate chain was incorrectly installed — '
            'ensure full chain (leaf + intermediates + root) is exported this time.\n\n'
            'Impact if missed: Payment processing through Stripe will fail (they validate SSL at checkout). '
            'Customer trust damage from browser warnings.'
        ),
        'priority': 'high', 'level': 'L2', 'category': 'Security',
        'tags': ['ssl', 'certificate', 'web-portal', 'renewal'],
        'status': 'pending', 'days_due': 14,
    },

    # ── User 5 (Software Developer) ───────────────────────────────────────────
    {
        'subject': 'SAP ERP system running extremely slow — transaction times 10× normal',
        'description': (
            'SAP ERP has been running at approximately 10% of normal performance for 3 days. '
            'Transactions that normally take 2–3 seconds now take 25–35 seconds.\n\n'
            'Environment:\n'
            '- SAP ERP 6.0 (EHP8) on SAP-APP-01\n'
            '- Database: SQL Server 2019 on DB-SAP-01\n\n'
            'Performance data:\n'
            '- Normal DB CPU: 30–40% | Current DB CPU: 88% average\n'
            '- Transactions most affected: ME21N, MIGO, VA01, VF01 (write operations)\n'
            '- Read-only transactions (ME23N, VA03) less affected\n\n'
            'Context:\n'
            '- Month-end processing completed 3 days ago (elevated load expected, but should have normalised)\n'
            '- SAP Basis ran a transport import on Monday evening\n'
            '- No OS-level changes on either server\n\n'
            'Initial findings from SQL Server Activity Monitor:\n'
            '- One MIGO-related query has been running for 47 minutes (blocking other sessions)\n'
            '- SQL Server Database Engine Tuning Advisor suggests 3 missing indexes\n\n'
            'Requested actions:\n'
            '1. Identify and kill the blocking long-running query (if safe)\n'
            '2. Create the 3 missing indexes (off-hours if table locks required)\n'
            '3. Review Monday transport import for rogue full-table scans\n'
            '4. Check SAP kernel version — may require patching\n\n'
            'Finance and Supply Chain productivity is severely impacted. Month-end close may be delayed.'
        ),
        'priority': 'critical', 'level': 'L3', 'category': 'Software',
        'tags': ['sap', 'erp', 'performance', 'database'],
        'status': 'in_progress', 'days_due': 2,
    },
    {
        'subject': 'Request to install AutoCAD 2024 on engineering workstation ENG-WS-14',
        'description': (
            'The engineering team requires AutoCAD 2024 installed on workstation ENG-WS-14 '
            'for a new infrastructure design project starting Monday.\n\n'
            'Workstation details:\n'
            '- Hostname: ENG-WS-14\n'
            '- OS: Windows 11 Pro (23H2)\n'
            '- RAM: 32 GB | CPU: Intel Core i9-13900K | GPU: NVIDIA RTX 4070\n\n'
            'Software requirements:\n'
            '- AutoCAD 2024 (Full, not LT)\n'
            '- License: Procurement will provide the license key upon ticket assignment\n'
            '- Deployment: Single workstation, no network license server needed\n\n'
            'Installation checklist:\n'
            '1. Uninstall existing AutoCAD 2020 cleanly (use Autodesk Uninstall Tool)\n'
            '2. Install AutoCAD 2024 with default component selection\n'
            '3. Apply company workspace profile from \\\\FS01\\IT\\AutoCAD\\profile_2024.cuix\n'
            '4. Test with sample DWG from \\\\FS01\\Engineering\\test_files\\sample.dwg\n'
            '5. Verify plot/print settings match 2020 configuration\n\n'
            'Notes: User has local admin rights but prefers IT to handle the migration '
            'to ensure the workspace template is applied correctly.\n\n'
            'Timeline: Must be complete by Friday so the user can set up their workspace over the weekend.'
        ),
        'priority': 'normal', 'level': 'L1', 'category': 'Software',
        'tags': ['software-install', 'autocad', 'engineering'],
        'status': 'pending', 'days_due': 5,
    },

    # ── User 6 (DevOps Engineer) ──────────────────────────────────────────────
    {
        'subject': 'Wi-Fi dead zone on 4th floor — conference rooms CR-401, CR-402, CR-403',
        'description': (
            'The 4th floor conference rooms have very poor Wi-Fi signal, causing dropped video calls '
            'and slow connectivity during meetings.\n\n'
            'Current infrastructure:\n'
            '- AP-4F-01: Cisco Aironet 2800 in hallway near elevator (too far from conference rooms)\n'
            '- AP-4F-02: Reported offline 2 weeks ago — hardware failure suspected\n\n'
            'Signal measurements (taken today with Wi-Fi Analyzer):\n'
            '- CR-401: −78 dBm (Poor — below −67 dBm reliable threshold)\n'
            '- CR-402: −82 dBm (Very poor)\n'
            '- CR-403: −85 dBm (Critical)\n\n'
            'Impact:\n'
            '- Weekly all-hands meeting (CR-402, 50+ attendees) sees MS Teams drops every 15 min\n'
            '- Client presentations in CR-401 suffer visible video freezing\n'
            '- Workaround in place: Ethernet cable run through the corridor for critical meetings\n\n'
            'Requested actions:\n'
            '1. Investigate AP-4F-02 — restore or replace\n'
            '2. Evaluate adding a 3rd AP near CR-403\n'
            '3. Check channel utilisation — adjacent office may cause 2.4 GHz interference\n'
            '4. Review power settings on AP-4F-01 (may need output increase)\n\n'
            'Timeline: Board meeting in CR-402 is scheduled in 10 days — must be resolved before then.'
        ),
        'priority': 'high', 'level': 'L2', 'category': 'Network',
        'tags': ['wifi', 'wireless', 'access-point', 'conference-room'],
        'status': 'open', 'days_due': 10,
    },
    {
        'subject': 'MFA setup required for AWS Console, GitHub Enterprise, and Jira Cloud',
        'description': (
            'As part of our ISO 27001 compliance initiative, MFA must be enabled on three cloud '
            'platforms. Requesting IT assistance with configuration.\n\n'
            'Platform 1 — AWS Console:\n'
            '- Account role: Read-only (S3 + CloudWatch)\n'
            '- Required MFA type: TOTP (via Microsoft Authenticator)\n'
            '- Steps: Enable virtual MFA device in IAM, scan QR, verify\n\n'
            'Platform 2 — GitHub Enterprise:\n'
            '- Organisation: company/tech\n'
            '- Current auth: username/password\n'
            '- Required: TOTP for web login + SSH key for git CLI operations\n'
            '- Steps: Enable TOTP in GitHub settings, generate Ed25519 SSH key, add to GitHub\n\n'
            'Platform 3 — Jira Cloud (company.atlassian.net):\n'
            '- Auth: Microsoft 365 SSO (already MFA-enabled for basic login)\n'
            '- Required: Step-up MFA for admin-level operations in Jira\n'
            '- Steps: Enable step-up authentication in Atlassian Access admin panel\n\n'
            'Current device: iPhone 14 Pro with Microsoft Authenticator installed\n\n'
            'Please schedule a 30-minute remote session. Available Mon–Thu, 9 AM–5 PM.\n\n'
            'Compliance deadline: End of this month. Non-compliance will block our ISO 27001 audit.'
        ),
        'priority': 'normal', 'level': 'L1', 'category': 'Security',
        'tags': ['mfa', 'compliance', 'aws', 'github', 'iso27001'],
        'status': 'closed', 'days_due': None,
    },

    # ── User 7 (Security Analyst) ─────────────────────────────────────────────
    {
        'subject': 'CRITICAL — Ransomware activity detected and partially blocked on FS01',
        'description': (
            'SECURITY INCIDENT — P1\n\n'
            'CrowdStrike Falcon detected and blocked ransomware activity on the primary file server '
            'at 14:32 today.\n\n'
            'Timeline:\n'
            '- 14:15 — User in Finance opened a malicious Excel attachment: "Invoice_2024_final.xlsm"\n'
            '- 14:29 — CrowdStrike detected mass file rename operations (appending .locked extension)\n'
            '- 14:32 — Automatic process kill triggered. Network isolation activated.\n'
            '- 847 files renamed before the kill. Pattern matches LockBit 3.0.\n\n'
            'Current server status:\n'
            '- FS01: Powered on, network-ISOLATED (CrowdStrike automatic response)\n'
            '- Unknown whether encryption completed on the 847 flagged files\n\n'
            'Context:\n'
            '- Source: Finance user workstation FINANCE-PC-07\n'
            '- Email came through as an external message bypassing spam filter\n'
            '- No prior indicators on this user account\n\n'
            'IMMEDIATE REQUIRED ACTIONS:\n'
            '1. DO NOT reconnect FS01 to the network\n'
            '2. Isolate FINANCE-PC-07 from the network now\n'
            '3. Identify all accounts that touched FINANCE-PC-07 in the last 4 hours\n'
            '4. Initiate incident response procedure IR-02\n'
            '5. Contact cyber insurance carrier to open a claim\n'
            '6. Assess affected files — begin restore from last clean backup (3 days ago)\n'
            '7. Preserve all logs for forensic analysis\n\n'
            'ALL TEAMS STAND BY.'
        ),
        'priority': 'critical', 'level': 'L3', 'category': 'Security',
        'tags': ['ransomware', 'p1', 'incident-response', 'crowdstrike'],
        'status': 'in_progress', 'days_due': 0,
    },
    {
        'subject': 'New employee IT onboarding setup required by Friday',
        'description': (
            'New team member is joining on Monday and requires full IT setup completed by Friday COB.\n\n'
            'Employee details:\n'
            '- Department: Marketing\n'
            '- Manager: Sandra Lee (ext. 2205)\n'
            '- Location: Main office, 2nd Floor, Desk 2-047\n\n'
            '1. Hardware\n'
            '   - Assign Dell Latitude 5540 (IT stock, asset tag #IT-0112)\n'
            '   - Docking station, 24" Dell monitor, keyboard, mouse\n'
            '   - Phone extension: 2047 (pre-reserved)\n\n'
            '2. Accounts and Access\n'
            '   - Active Directory account\n'
            '   - Microsoft 365 Business Premium license\n'
            '   - Email: [firstname.lastname@domain]\n'
            '   - Add to Marketing distribution list and Teams channel\n'
            '   - VPN access: Corporate VLAN 10\n'
            '   - Access to Marketing shared drive: \\\\FS01\\Marketing\n\n'
            '3. Software\n'
            '   - Office 365 (standard)\n'
            '   - Adobe Creative Cloud (check license availability with IT)\n'
            '   - Slack desktop app\n'
            '   - Salesforce CRM (Marketing licence — coordinate with Salesforce admin)\n\n'
            '4. Security\n'
            '   - MFA enrolled before first login\n'
            '   - Security awareness training link sent to personal email\n\n'
            'HR has been notified. Please coordinate desk setup with the facilities team.'
        ),
        'priority': 'normal', 'level': 'L1', 'category': 'Onboarding',
        'tags': ['new-employee', 'onboarding', 'hardware', 'setup'],
        'status': 'open', 'days_due': 4,
    },

    # ── User 8 (Cloud Architect) ──────────────────────────────────────────────
    {
        'subject': 'OneDrive for Business storage quota exceeded — design team sync failing',
        'description': (
            'Six members of the Design team are receiving "Storage quota exceeded" errors in '
            'OneDrive for Business, blocking file sync and collaboration.\n\n'
            'Affected users: 6 (Design team)\n'
            'Average storage per user: ~800 GB (across project video and 3D render assets)\n'
            'Current quota: 1 TB per user (Microsoft 365 Business Premium)\n\n'
            'Errors:\n'
            '- "OneDrive is full. Free up space or increase your storage quota."\n'
            '- Files saved locally are not syncing — version control is breaking down\n'
            '- Shared collaboration on active project files failing due to out-of-sync copies\n\n'
            'Root cause:\n'
            'The Brand Refresh Campaign generated ~2.3 TB of raw video and 3D render files that '
            'were synced to individual OneDrives instead of the designated SharePoint document library.\n\n'
            'Requested actions:\n'
            '1. Increase OneDrive quota for the 6 design users to 5 TB (available under E3 plan)\n'
            '2. Migrate Brand Refresh project files to SharePoint library \\\\company.sharepoint.com\\Design\n'
            '3. Configure OneDrive Known Folder Move to exclude the Renders/ subdirectory\n'
            '4. Brief design team on proper SharePoint collaboration — large assets go to SharePoint, '
            'not individual OneDrives\n\n'
            'Timeline: Brand Refresh deliverables are due to the client Friday. '
            'Files must be accessible for the final review meeting Thursday 3 PM.'
        ),
        'priority': 'high', 'level': 'L2', 'category': 'Cloud',
        'tags': ['onedrive', 'storage', 'sharepoint', 'microsoft365'],
        'status': 'open', 'days_due': 3,
    },
    {
        'subject': 'Network performance severely degraded — internal traffic at 10% normal speed',
        'description': (
            'Internet and internal network speeds have dropped to approximately 10% of baseline '
            'since this morning. File server transfers and cloud applications are heavily impacted.\n\n'
            'Baseline: ~500 Mbps down / ~200 Mbps up\n'
            'Current: ~50 Mbps down / ~20 Mbps up\n\n'
            'Infrastructure:\n'
            '- Core switch: Cisco Catalyst 3850\n'
            '- Edge router/firewall: Fortinet FortiGate 60F\n'
            '- ISP: Comcast Business (1 Gbps fibre)\n\n'
            'Symptoms:\n'
            '- Mapped network drives (\\\\FS01\\) loading very slowly\n'
            '- MS Teams video calls dropping or heavily pixelated\n'
            '- Salesforce and SAP timeouts\n\n'
            'What is NOT affected:\n'
            '- Internet ping latency (< 5 ms to 8.8.8.8) — connection is up\n'
            '- VoIP phones (calls are clear — isolated VLAN)\n\n'
            'Suspicious findings:\n'
            '- Core uplink utilisation: 85–90% (normal: 20–30%)\n'
            '- Unknown device generating high traffic: MAC 00:1A:2B:3C:4D:5E\n'
            '  This MAC does not appear in our asset inventory\n\n'
            'Possible causes: rogue device, broadcast storm, or misconfigured switch port.\n\n'
            'Requesting immediate investigation and isolation of the unknown device.'
        ),
        'priority': 'critical', 'level': 'L3', 'category': 'Network',
        'tags': ['network', 'bandwidth', 'performance', 'rogue-device'],
        'status': 'solved', 'days_due': None,
    },

    # ── User 9 (Operations Manager) ───────────────────────────────────────────
    {
        'subject': 'Microsoft 365 license provisioning required for 8 new starters on Monday',
        'description': (
            'Eight new employees are joining on Monday and require Microsoft 365 Business Premium '
            'licenses and account setup before their first day.\n\n'
            'New starters:\n'
            '1. Alice Johnson — Marketing\n'
            '2. Brian Peters — Sales\n'
            '3. Carol Wu — Engineering\n'
            '4. Derek Moore — Finance\n'
            '5. Elena Vasquez — HR\n'
            '6. Frank Ibrahim — Operations\n'
            '7. Grace Okonkwo — Legal\n'
            '8. Harry Singh — Customer Success\n\n'
            'Required per user:\n'
            '- Microsoft 365 Business Premium license\n'
            '- Exchange Online mailbox (50 GB)\n'
            '- Teams + OneDrive (1 TB)\n'
            '- Azure AD account + MFA enrolment email to personal address\n'
            '- Add to relevant department distribution lists\n\n'
            'Current license status: 87 assigned, 3 available — 5 additional licenses needed.\n'
            'Procurement has been notified. IT needs to confirm the request to release the PO.\n\n'
            'Deadline: All accounts live and credentials delivered by Friday EOD so new '
            'starters can complete MFA setup before Monday orientation at 9:00 AM.\n\n'
            'Contact for any queries: HR Director Jenny Walsh (ext. 1001).'
        ),
        'priority': 'normal', 'level': 'L1', 'category': 'Licensing',
        'tags': ['microsoft365', 'onboarding', 'licensing'],
        'status': 'closed', 'days_due': None,
    },
    {
        'subject': 'Remote desktop connection failing from home — workstation unreachable over VPN',
        'description': (
            'Cannot establish an RDP connection to the office workstation from home. '
            'The connection was working normally until 3 days ago.\n\n'
            'Connection details:\n'
            '- Target workstation: CORP-PC-023\n'
            '- Internal IP: 10.10.5.23 (static DHCP reservation)\n'
            '- VPN: Connected and confirmed working (ping to 10.10.5.1 gateway: successful)\n'
            '- RDP client: mstsc.exe (Windows built-in)\n\n'
            'Error message:\n'
            '"Remote Desktop cannot connect to the remote computer. Verify that Remote Desktop is '
            'enabled, the computer is powered on, and is accessible on the network."\n\n'
            'Troubleshooting done:\n'
            '1. VPN confirmed working — can reach 10.10.0.1 (DC), 10.10.1.10 (file server)\n'
            '2. Attempting to RDP to CORP-PC-023 specifically fails\n'
            '3. RDP to another workstation (CORP-PC-019) succeeds from same VPN session\n'
            '4. Colleague confirmed CORP-PC-023 is powered on and logged in as screensaver\n\n'
            'Possible root cause:\n'
            '- A Group Policy update 3 days ago may have reset Windows Firewall remote desktop exception\n'
            '- A recent Windows Update may have disabled the RDP service on that specific machine\n\n'
            'I am on approved WFH and cannot physically attend the office to fix this. '
            'Can IT remotely access CORP-PC-023 via another method (e.g. SCCM remote tools) '
            'to investigate and re-enable RDP?'
        ),
        'priority': 'normal', 'level': 'L1', 'category': 'Remote Access',
        'tags': ['rdp', 'remote-desktop', 'vpn', 'wfh'],
        'status': 'open', 'days_due': 2,
    },
]

# Status distribution for the 100 tickets: pair (user_idx*2, user_idx*2+1)
# The TICKETS list already defines a status per template — we use it as-is.


class Command(BaseCommand):
    help = 'Seed database with 5 client organisations, 50 users, and 100 tickets for a tenant'

    def add_arguments(self, parser):
        parser.add_argument(
            '--tenant', default='netamate', metavar='SLUG',
            help='Target tenant slug (default: netamate)',
        )
        parser.add_argument(
            '--flush', action='store_true',
            help='Delete previously seeded data for this tenant before creating new data',
        )
        parser.add_argument(
            '--password', default='TestPass123!', metavar='PASS',
            help='Password for all seeded user accounts (default: TestPass123!)',
        )

    def handle(self, *args, **options):
        from apps.tenants.models import Tenant, ClientOrganization
        from apps.users.models import User
        from apps.tickets.models import Ticket, Reply

        slug = options['tenant']
        try:
            tenant = Tenant.objects.get(slug=slug, is_active=True)
        except Tenant.DoesNotExist:
            raise CommandError(f'Tenant "{slug}" not found or inactive.')

        self.stdout.write(f'Target tenant: {tenant.name} ({tenant.slug})')

        if options['flush']:
            self._flush(tenant)

        password = options['password']
        created_orgs  = 0
        created_users = 0
        created_tickets = 0

        with transaction.atomic():
            orgs = []
            for org_data in CLIENT_ORGS:
                org, created = ClientOrganization.objects.get_or_create(
                    tenant=tenant,
                    name=org_data['name'],
                    defaults={
                        'domain':        org_data['domain'],
                        'contact_name':  org_data['contact_name'],
                        'contact_email': org_data['contact_email'],
                        'phone':         org_data['phone'],
                        'address':       org_data['address'],
                        'is_active':     True,
                    },
                )
                orgs.append(org)
                if created:
                    created_orgs += 1
                    self.stdout.write(f'  + Org: {org.name}')
                else:
                    self.stdout.write(f'  ~ Org exists: {org.name}')

            # Create 10 users per org, then their 2 tickets
            for org, org_data in zip(orgs, CLIENT_ORGS):
                domain = org_data['domain']
                self.stdout.write(f'\n  [{org.name}]')

                for ui, user_tmpl in enumerate(USERS):
                    email = f"{user_tmpl['first'].lower()}.{user_tmpl['last'].lower()}@{domain}"

                    user, u_created = User.objects.get_or_create(
                        tenant=tenant,
                        email=email,
                        defaults={
                            'first_name': user_tmpl['first'],
                            'last_name':  user_tmpl['last'],
                            'password':   make_password(password),
                            'role':       user_tmpl['role'],
                            'client_org': org,
                            'job_title':  user_tmpl['title'],
                            'department': user_tmpl['dept'],
                            'phone':      user_tmpl['phone'],
                            'is_active':  True,
                        },
                    )
                    if u_created:
                        created_users += 1
                    label = '+' if u_created else '~'
                    self.stdout.write(f'    {label} {user.full_name} ({user.email})')

                    # 2 tickets per user — positions ui*2 and ui*2+1 in TICKETS list
                    for ti_offset in range(2):
                        tmpl = TICKETS[ui * 2 + ti_offset]

                        # Resolve due_by
                        if tmpl['days_due'] is None:
                            due_by = None
                        elif tmpl['days_due'] == 0:
                            due_by = timezone.now() + timedelta(hours=2)
                        else:
                            due_by = timezone.now() + timedelta(days=tmpl['days_due'])

                        # Pre-backdate overdue cases (days_due=0 with solved/closed)
                        if tmpl['status'] in ('solved', 'closed') and due_by:
                            due_by = timezone.now() - timedelta(days=2)

                        seq = Ticket.next_seq(tenant)
                        ref = f"T{timezone.now().strftime('%d%m%Y')}-{seq:04d}"

                        resolved_at = None
                        if tmpl['status'] in ('solved', 'closed'):
                            resolved_at = timezone.now() - timedelta(hours=3 + ui)

                        ticket = Ticket.objects.create(
                            tenant=tenant,
                            ticket_ref=ref,
                            seq=seq,
                            subject=tmpl['subject'],
                            description=tmpl['description'],
                            status=tmpl['status'],
                            priority=tmpl['priority'],
                            level=tmpl['level'],
                            category=tmpl['category'],
                            tags=tmpl['tags'],
                            client_org=org,
                            requester=user,
                            requester_name=user.full_name,
                            due_by=due_by,
                            resolved_at=resolved_at,
                        )

                        # Opening system event
                        Reply.objects.create(
                            ticket=ticket,
                            author=None,
                            type='system_event',
                            body=f'Ticket submitted by {user.full_name} ({user.email})',
                        )

                        # Add a follow-up reply for in_progress/solved/closed tickets
                        if tmpl['status'] in ('in_progress', 'solved', 'closed', 'pending'):
                            Reply.objects.create(
                                ticket=ticket,
                                author=None,
                                type='public_reply',
                                body=(
                                    f'Hi {user_tmpl["first"]}, thank you for submitting this ticket. '
                                    'We have reviewed your request and are now actively investigating. '
                                    'We will keep you updated as we progress. '
                                    'Please do not hesitate to reply here if you have additional details.'
                                ),
                            )

                        if tmpl['status'] in ('solved', 'closed'):
                            Reply.objects.create(
                                ticket=ticket,
                                author=None,
                                type='system_event',
                                body=f'Status changed to {tmpl["status"].replace("_"," ").title()} by support team',
                            )
                            Reply.objects.create(
                                ticket=ticket,
                                author=None,
                                type='public_reply',
                                body=(
                                    f'Hi {user_tmpl["first"]}, we are pleased to confirm that this issue has been '
                                    'resolved. Please let us know if you encounter any further problems. '
                                    'You can reopen this ticket at any time by replying to this message.'
                                ),
                            )

                        created_tickets += 1
                        self.stdout.write(
                            f'      [{ref}] {ticket.subject[:55]}… ({ticket.status})'
                        )

        self.stdout.write(self.style.SUCCESS(
            f'\nDone — {created_orgs} org(s), {created_users} user(s), {created_tickets} ticket(s) created.'
        ))
        self.stdout.write(f'  Login with: [user-email] / {password}')

    def _flush(self, tenant):
        from apps.tenants.models import ClientOrganization
        from apps.users.models import User
        from apps.tickets.models import Ticket

        seed_domains = {o['domain'] for o in CLIENT_ORGS}
        seed_org_names = {o['name'] for o in CLIENT_ORGS}

        tickets_del = Ticket.objects.filter(
            tenant=tenant,
            client_org__name__in=seed_org_names,
        ).count()
        Ticket.objects.filter(tenant=tenant, client_org__name__in=seed_org_names).delete()

        users_del = User.objects.filter(
            tenant=tenant,
            email__regex=r'@(' + '|'.join(d.replace('.', r'\.') for d in seed_domains) + r')$',
        ).count()
        User.objects.filter(
            tenant=tenant,
            email__regex=r'@(' + '|'.join(d.replace('.', r'\.') for d in seed_domains) + r')$',
        ).delete()

        orgs_del = ClientOrganization.objects.filter(
            tenant=tenant, name__in=seed_org_names
        ).count()
        ClientOrganization.objects.filter(tenant=tenant, name__in=seed_org_names).delete()

        self.stdout.write(
            self.style.WARNING(
                f'Flushed: {orgs_del} org(s), {users_del} user(s), {tickets_del} ticket(s)'
            )
        )
