import re
import pdfplumber
from datetime import date, datetime
from app.parsers.base import BaseParser, ParsedTransaction


TRANSACTION_TYPE_MAP = {
    "PŁATNOŚĆKARTĄ": "card",
    "PŁATNOŚĆ KARTĄ": "card",
    "PŁATNOŚĆBLIKWINTERNECIE": "blik",
    "PŁATNOŚĆ BLIK W INTERNECIE": "blik",
    "PŁATNOŚĆBLIKNATELEFON": "blik",
    "PŁATNOŚĆ BLIK NA TELEFON": "blik",
    "PRZELEWPRZYCHODZĄCY": "transfer_in",
    "PRZELEW PRZYCHODZĄCY": "transfer_in",
    "PRZEL.NATYCH.PRZYCH.": "transfer_in",
    "PRZELEWWYCHODZĄCY": "transfer_out",
    "PRZELEW WYCHODZĄCY": "transfer_out",
    "PRZELEWNANUMERTELEFONU": "transfer_out",
    "PRZELEW NA NUMER TELEFONU": "transfer_out",
    "PRZELEWPOLEC.ZAPŁ.": "transfer_out",
    "PRZELEW POLEC. ZAPŁ.": "transfer_out",
    "PRZELEWZLEC.STAŁE": "transfer_out",
    "PRZELEW ZLEC. STAŁE": "transfer_out",
    "WYPŁATAKARTĄ": "atm",
    "WYPŁATA KARTĄ": "atm",
    "WYPŁATABLIKZBANKOMATU": "atm",
    "WYPŁATA BLIK Z BANKOMATU": "atm",
    "PROWIZJA/OPŁATA": "fee",
    "ZWROTPŁATNOŚCI": "refund",
    "ZWROT PŁATNOŚCI": "refund",
    "SP.RATY": "loan_payment",
    "SPŁ.RATY": "loan_payment",
    "UZNANIE": "transfer_in",
}


class MillenniumParser(BaseParser):

    def can_parse(self) -> bool:
        try:
            with pdfplumber.open(self.pdf_path) as pdf:
                first_page = pdf.pages[0].extract_text() or ""
                return "Millennium" in first_page or "BIGBPLPW" in first_page
        except Exception:
            return False

    def parse(self) -> tuple[list[ParsedTransaction], dict]:
        transactions = []
        metadata = {"bank": "millennium", "iban": None, "period_start": None, "period_end": None}

        with pdfplumber.open(self.pdf_path) as pdf:
            full_text = ""
            for page in pdf.pages:
                full_text += (page.extract_text() or "") + "\n"

            # Extract IBAN
            iban_match = re.search(r"IBAN:?\s*(PL[\d\s]+)", full_text)
            if iban_match:
                metadata["iban"] = re.sub(r"\s", "", iban_match.group(1))

            # Extract period — handles both spaced and merged formats
            period_match = re.search(
                r"zaokresod(\d{2}\.\d{2}\.\d{4})do(\d{2}\.\d{2}\.\d{4})|"
                r"za okres od (\d{2}\.\d{2}\.\d{4}) do (\d{2}\.\d{2}\.\d{4})",
                full_text
            )
            if period_match:
                d1 = period_match.group(1) or period_match.group(3)
                d2 = period_match.group(2) or period_match.group(4)
                metadata["period_start"] = datetime.strptime(d1, "%d.%m.%Y").date()
                metadata["period_end"] = datetime.strptime(d2, "%d.%m.%Y").date()

            transactions = self._parse_transactions(full_text)

        return transactions, metadata

    def _parse_transactions(self, text: str) -> list[ParsedTransaction]:
        transactions = []
        lines = text.split("\n")

        in_transactions = False
        current_tx_lines = []

        i = 0
        while i < len(lines):
            line = lines[i].strip()
            line_ns = line.replace(" ", "")  # no-spaces version for merged-word matching

            # Trigger: start of transaction section (pdfplumber merges spaces)
            if "SALDOPOCZĄTKOWE" in line_ns or "SALDO POCZĄTKOWE" in line:
                in_transactions = True
                i += 1
                continue

            if not in_transactions:
                i += 1
                continue

            # Stop at end-of-account summary lines; reset so next account section can be found
            if "SUMAUZNAŃ" in line_ns or "SUMA UZNAŃ" in line or "UDZIELONEKREDYTY" in line_ns:
                if current_tx_lines:
                    tx = self._build_transaction(current_tx_lines)
                    if tx:
                        transactions.append(tx)
                    current_tx_lines = []
                in_transactions = False
                i += 1
                continue

            # Skip page headers (DATA DATA / KSIEG. WAL. OPISTRANSAKCJI...)
            if re.match(r"^DATA\s*DATA$", line) or ("OPISTRANSAKCJI" in line_ns and "WARTOŚĆ" in line_ns):
                i += 1
                continue

            # Check if line starts a new transaction (two dates at start)
            m = re.match(r"^(\d{4}-\d{2}-\d{2})\s+(\d{4}-\d{2}-\d{2})\s+(.*)", line)
            if m:
                if current_tx_lines:
                    tx = self._build_transaction(current_tx_lines)
                    if tx:
                        transactions.append(tx)
                current_tx_lines = [line]
            elif current_tx_lines and line:
                current_tx_lines.append(line)

            i += 1

        if current_tx_lines:
            tx = self._build_transaction(current_tx_lines)
            if tx:
                transactions.append(tx)

        return transactions

    def _build_transaction(self, lines: list[str]) -> ParsedTransaction | None:
        if not lines:
            return None

        first_line = lines[0]
        date_match = re.match(r"^(\d{4}-\d{2}-\d{2})\s+(\d{4}-\d{2}-\d{2})\s+(.*)", first_line)
        if not date_match:
            return None

        booking_date = datetime.strptime(date_match.group(1), "%Y-%m-%d").date()
        rest = date_match.group(3)

        # Amount format: "1.234,56-" or "1.234,56" (dot=thousands, comma=decimal, minus suffix=negative)
        amount_match = re.search(r"([\d][\d\s.]*,\s?\d{2}-?)\s+([\d][\d\s.]*,\s?\d{2}-?)\s*$", rest)
        if not amount_match:
            return None

        amount_str = amount_match.group(1).strip()
        desc_text = rest[:amount_match.start()].strip()

        # Collect description from continuation lines
        description_parts = [desc_text]
        for line in lines[1:]:
            line = line.strip()
            line_ns = line.replace(" ", "")
            # Stop on card detail lines
            if "Karta:" in line_ns and "Posiadacz" in line_ns:
                break
            if "Dnia:" in line_ns and "ZAKUP" in line_ns:
                break
            if "Kwotatransakcji:" in line_ns or re.match(r"Kwota transakcji:", line):
                break
            # Skip page footers
            if "bankmillennium.pl" in line_ns or "TeleMillennium" in line_ns or re.match(r"Wyciągnr", line_ns):
                break
            description_parts.append(line)

        full_description = " | ".join(p for p in description_parts if p)

        # Parse amount
        is_negative = amount_str.endswith("-")
        raw = amount_str.rstrip("-").replace(" ", "")
        if "," in raw and "." in raw:
            amount_clean = raw.replace(".", "").replace(",", ".")
        else:
            amount_clean = raw.replace(",", ".")
        try:
            amount = float(amount_clean)
        except ValueError:
            return None

        if is_negative:
            amount = -amount

        # Detect transaction type — match against both spaced and merged forms
        desc_ns = full_description.replace(" ", "").upper()
        tx_type = "other"
        for keyword, t in TRANSACTION_TYPE_MAP.items():
            if keyword.upper() in desc_ns:
                tx_type = t
                break

        return ParsedTransaction(
            date=booking_date,
            description=full_description,
            amount=amount,
            currency="PLN",
            original_amount=None,
            original_currency=None,
            exchange_rate=None,
            transaction_type=tx_type,
        )
