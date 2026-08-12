from io import BytesIO
from html import escape as _esc

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.enums import TA_RIGHT, TA_CENTER


DARK   = colors.HexColor('#111827')
MID    = colors.HexColor('#6b7280')
ACCENT = colors.HexColor('#2563eb')
LIGHT  = colors.HexColor('#f3f4f6')
WHITE  = colors.white
BORDER = colors.HexColor('#e5e7eb')


def _styles():
    base = getSampleStyleSheet()
    def s(name, **kw):
        return ParagraphStyle(name, parent=base['Normal'], **kw)
    return {
        'h1':    s('h1',    fontSize=22, textColor=DARK,   leading=28, fontName='Helvetica-Bold'),
        'h2':    s('h2',    fontSize=12, textColor=DARK,   leading=16, fontName='Helvetica-Bold'),
        'sm':    s('sm',    fontSize=9,  textColor=MID,    leading=14),
        'body':  s('body',  fontSize=9,  textColor=DARK,   leading=13),
        'right': s('right', fontSize=9,  textColor=DARK,   leading=13, alignment=TA_RIGHT),
        'inv':   s('inv',   fontSize=28, textColor=ACCENT, alignment=TA_RIGHT, fontName='Helvetica-Bold'),
        'num':   s('num',   fontSize=12, textColor=DARK,   alignment=TA_RIGHT),
        'th':    s('th',    fontSize=9,  textColor=WHITE,  fontName='Helvetica-Bold', alignment=TA_CENTER),
        'mono':  s('mono',  fontSize=9,  textColor=ACCENT, fontName='Helvetica-Bold'),
        'total': s('total', fontSize=11, textColor=ACCENT, fontName='Helvetica-Bold', alignment=TA_RIGHT),
        'label': s('label', fontSize=9,  textColor=MID,    alignment=TA_RIGHT),
    }


def _fmt_dur(minutes):
    if not minutes:
        return '0m'
    h, m = divmod(int(minutes), 60)
    return f'{h}h {m}m' if m else f'{h}h'


def _addr(text: str) -> str:
    """Escape user text for ReportLab Paragraph, preserving newlines as <br/>."""
    return _esc(text).replace('\n', '<br/>')


def generate_invoice_pdf(invoice) -> bytes:
    buf    = BytesIO()
    W, _H  = A4
    margin = 18 * mm
    usable = W - 2 * margin

    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        rightMargin=margin, leftMargin=margin,
        topMargin=margin,   bottomMargin=margin,
    )

    profile       = getattr(invoice.tenant, 'billing_profile', None)
    company_name  = _esc((profile and profile.company_name)  or invoice.tenant.name)
    company_addr  = _addr((profile and profile.address)       or '')
    company_email = _esc((profile and profile.email)         or '')
    company_phone = _esc((profile and profile.phone)         or '')
    payment_terms = _esc((profile and profile.payment_terms) or '')

    ST = _styles()
    story = []

    # ── Header: company left, INVOICE right ────────────────────────────────────
    header = Table([[
        [Paragraph(company_name, ST['h1']),
         Spacer(1, 4),
         *([Paragraph(company_addr, ST['sm'])] if company_addr else []),
         *([Paragraph(company_email, ST['sm'])] if company_email else []),
         *([Paragraph(company_phone, ST['sm'])] if company_phone else []),
        ],
        [Paragraph('INVOICE', ST['inv']),
         Paragraph(f'<b>#{_esc(invoice.invoice_number)}</b>', ST['num']),
        ],
    ]], colWidths=[usable - 55*mm, 55*mm])
    header.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('LEFTPADDING',  (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
    ]))
    story += [header, Spacer(1, 6*mm),
              HRFlowable(width='100%', thickness=1.5, color=ACCENT),
              Spacer(1, 5*mm)]

    # ── Bill To + Invoice meta ──────────────────────────────────────────────────
    org      = invoice.org
    org_addr = _addr(org.address) if org.address else ''
    meta = Table([[
        [Paragraph('<b>BILL TO</b>', ST['sm']),
         Spacer(1, 3),
         Paragraph(_esc(org.name), ST['h2']),
         *([Paragraph(org_addr, ST['sm'])] if org_addr else []),
         *([Paragraph(_esc(org.contact_email), ST['sm'])] if org.contact_email else []),
        ],
        '',
        [Paragraph('<b>Invoice Date</b>', ST['sm']),
         Paragraph(invoice.created_at.strftime('%B %d, %Y'), ST['body']),
         Spacer(1, 5),
         Paragraph('<b>Period</b>', ST['sm']),
         Paragraph(
             f'{invoice.period_from.strftime("%b %d, %Y")}  –  {invoice.period_to.strftime("%b %d, %Y")}',
             ST['body'],
         ),
         Spacer(1, 5),
         Paragraph('<b>Status</b>', ST['sm']),
         Paragraph(
             _esc(invoice.get_status_display().upper()),
             ParagraphStyle('sts', parent=ST['body'], textColor=ACCENT, fontName='Helvetica-Bold'),
         ),
        ],
    ]], colWidths=[usable * 0.50, usable * 0.08, usable * 0.42])
    meta.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('LEFTPADDING',  (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
    ]))
    story += [meta, Spacer(1, 7*mm)]

    # ── Line items ──────────────────────────────────────────────────────────────
    items      = list(invoice.line_items.all())
    is_hourly  = any(i.minutes is not None for i in items)
    cur        = _esc(invoice.currency)

    if is_hourly:
        headers   = ['Date', 'Agent', 'Description', 'Duration', f'Rate / hr ({cur})', f'Amount ({cur})']
        col_w     = [22*mm, 34*mm, None, 20*mm, 28*mm, 26*mm]
    else:
        headers   = ['Ticket', 'Subject', 'Level', f'Rate ({cur})', f'Amount ({cur})']
        col_w     = [28*mm, None, 16*mm, 26*mm, 26*mm]

    fixed           = sum(w for w in col_w if w)
    auto_i          = col_w.index(None)
    col_w[auto_i]   = usable - fixed

    tdata = [[Paragraph(h, ST['th']) for h in headers]]

    for item in items:
        if is_hourly:
            row = [
                Paragraph(_esc(str(item.log_date) if item.log_date else ''), ST['body']),
                Paragraph(_esc(item.agent_name or ''), ST['body']),
                Paragraph(_esc(item.description or ''), ST['body']),
                Paragraph(_fmt_dur(item.minutes), ST['body']),
                Paragraph(f'{item.unit_rate:,.2f}', ST['right']),
                Paragraph(f'{item.amount:,.2f}', ST['right']),
            ]
        else:
            row = [
                Paragraph(_esc(item.ticket_ref or ''), ST['mono']),
                Paragraph(_esc(item.ticket_subject or ''), ST['body']),
                Paragraph(_esc(item.ticket_level or '—'), ST['body']),
                Paragraph(f'{item.unit_rate:,.2f}', ST['right']),
                Paragraph(f'{item.amount:,.2f}', ST['right']),
            ]
        tdata.append(row)

    n = len(tdata)
    tbl = Table(tdata, colWidths=col_w, repeatRows=1)
    tbl.setStyle(TableStyle([
        ('BACKGROUND',    (0, 0), (-1, 0),      ACCENT),
        ('ROWBACKGROUNDS',(0, 1), (-1, n - 1),  [WHITE, LIGHT]),
        ('TOPPADDING',    (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING',   (0, 0), (-1, -1), 5),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 5),
        ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID',          (0, 0), (-1, -1), 0.4, BORDER),
    ]))
    story += [tbl, Spacer(1, 5*mm)]

    # ── Totals ──────────────────────────────────────────────────────────────────
    totals_rows = [
        (f'Subtotal', f'{cur} {invoice.subtotal:,.2f}', False),
    ]
    if invoice.tax_rate and invoice.tax_rate > 0:
        totals_rows.append((f'Tax ({invoice.tax_rate}%)', f'{cur} {invoice.tax_amount:,.2f}', False))
    totals_rows.append(('TOTAL DUE', f'{cur} {invoice.total:,.2f}', True))

    totals_data = []
    for label, val, bold in totals_rows:
        lbl_style = ParagraphStyle('tl', parent=ST['label'],
                                   fontName='Helvetica-Bold' if bold else 'Helvetica',
                                   textColor=ACCENT if bold else MID, fontSize=10 if bold else 9)
        val_style = ParagraphStyle('tv', parent=ST['right'],
                                   fontName='Helvetica-Bold' if bold else 'Helvetica',
                                   textColor=ACCENT if bold else DARK, fontSize=10 if bold else 9)
        totals_data.append([Paragraph(label, lbl_style), Paragraph(val, val_style)])

    totals_tbl = Table(totals_data, colWidths=[usable - 52*mm, 52*mm], hAlign='RIGHT')
    n_tot = len(totals_data)
    totals_tbl.setStyle(TableStyle([
        ('TOPPADDING',    (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING',   (0, 0), (-1, -1), 0),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 0),
        ('LINEABOVE',     (0, n_tot - 1), (-1, n_tot - 1), 1, ACCENT),
        ('LINEBELOW',     (0, n_tot - 1), (-1, n_tot - 1), 1, ACCENT),
    ]))
    story.append(totals_tbl)

    # ── Payment terms ───────────────────────────────────────────────────────────
    if payment_terms:
        story += [
            Spacer(1, 10*mm),
            HRFlowable(width='100%', thickness=0.5, color=BORDER),
            Spacer(1, 4*mm),
            Paragraph('<b>Payment Terms</b>', ST['sm']),
            Spacer(1, 2),
            Paragraph(payment_terms, ST['sm']),
        ]

    doc.build(story)
    return buf.getvalue()
