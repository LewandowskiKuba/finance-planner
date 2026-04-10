import re
import pdfplumber
from datetime import date, datetime
from app.parsers.base import BaseParser, ParsedTransaction


class PekaoParser(BaseParser):

    def can_parse(self) -> bool:
        try:
            with pdfplumber.open(self.pdf_path) as pdf:
                first_page = pdf.pages[0].extract_text() or ""
                return "Bank Pekao" in first_page or "pekao.com.pl" in first_page
        except Exception:
            return False

    def parse(self) -> tuple[list[ParsedTransaction], dict]:
        metadata = {"bank": "pekao", "iban": None, "period_start": None, "period_end": None}

        with pdfplumber.open(self.pdf_path) as pdf:
            full_text = ""
            for page in pdf.pages:
                full_text += (page.extract_text() or "") + "\n"

        # Extract period
        period_match = re.search(r"Za okres od\s+(\d{2}/\d{2}/\d{4})\s+do\s+(\d{2}/\d{2}/\d{4})", full_text)
        if period_match:
            metadata["period_start"] = datetime.strptime(period_match.group(1), "%d/%m/%Y").date()
            metadata["period_end"] = datetime.strptime(period_match.group(2), "%d/%m/%Y").date()

        # Extract IBAN from account number line
        iban_match = re.search(r"(\d{2}\s+\d{4}\s+\d{4}\s+\d{4}\s+\d{4}\s+\d{4}\s+\d{4})", full_text)
        if iban_match:
            metadata["iban"] = "PL" + re.sub(r"\s", "", iban_match.group(1))

        transactions = self._parse_transactions(full_text)
        return transactions, metadata

    def _parse_transactions(self, text: str) -> list[ParsedTransaction]:
        transactions = []
        lines = text.split("\n")

        # Pekao format: DD/MM/YYYY  AMOUNT  Opis operacji
        # Amount uses Polish format: dot=thousands separator, comma=decimal, e.g. 3.723,00 or -22,02
        DATE_RE = re.compile(r"^(\d{2}/\d{2}/\d{4})\s+([-]?[\d][\d .]*, ?\d{2})\s+(.*)")
        DATE_ONLY_RE = re.compile(r"^(\d{2}/\d{2}/\d{4})\s*$")

        in_transactions = False
        current: dict | None = None

        for line in lines:
            line_stripped = line.strip()

            if "Wyszczególnienie transakcji" in line_stripped:
                in_transactions = True
                continue

            if not in_transactions:
                continue

            # Skip column header line that repeats on each page
            if re.match(r"Data\s+waluty", line_stripped):
                continue

            # Check for date + amount on same line
            m = DATE_RE.match(line_stripped)
            if m:
                if current:
                    tx = self._build_transaction(current)
                    if tx:
                        transactions.append(tx)

                date_str = m.group(1)
                amount_str = m.group(2).strip()
                desc_start = m.group(3).strip()

                try:
                    tx_date = datetime.strptime(date_str, "%d/%m/%Y").date()
                except ValueError:
                    continue

                amount = self._parse_amount(amount_str)
                current = {"date": tx_date, "amount": amount, "lines": [desc_start] if desc_start else []}
                continue

            # Check for date only line, then amount on next line
            if DATE_ONLY_RE.match(line_stripped) and not current:
                # Will be handled on next iteration - just note date
                # This handles Pekao format where amount is on next line
                pass

            if current is not None and line_stripped:
                current["lines"].append(line_stripped)

        if current:
            tx = self._build_transaction(current)
            if tx:
                transactions.append(tx)

        return transactions

    def _parse_amount(self, amount_str: str) -> float:
        # Handle formats: "-1.234,56", "1 234,56", "-1234.56"
        s = amount_str.strip().replace(" ", "")
        # If comma is decimal separator (Polish format)
        if "," in s and "." in s:
            # e.g. "1.234,56" — dot is thousands, comma is decimal
            s = s.replace(".", "").replace(",", ".")
        elif "," in s:
            s = s.replace(",", ".")
        try:
            return float(s)
        except ValueError:
            return 0.0

    def _detect_type(self, description: str) -> str:
        desc_upper = description.upper()
        if "TRANSAKCJA KARTĄ" in desc_upper:
            return "card"
        if "PRZELEW BLIK" in desc_upper:
            return "blik"
        if "PRZELEW KRAJOWY" in desc_upper or "PRZELEW WYCHODZĄCY" in desc_upper:
            return "transfer_out"
        if "PRZELEW PRZYCHODZĄCY" in desc_upper or "WPŁYW" in desc_upper:
            return "transfer_in"
        if "PROWIZJA" in desc_upper or "OPŁATA" in desc_upper:
            return "fee"
        if "ZWROT" in desc_upper:
            return "refund"
        if "PRZELEW DO US" in desc_upper or "URZĄD SKARBOWY" in desc_upper:
            return "tax"
        if "WYPŁATA" in desc_upper or "ATM" in desc_upper:
            return "atm"
        return "other"

    def _build_transaction(self, current: dict) -> ParsedTransaction | None:
        if current["amount"] == 0.0 and not current["lines"]:
            return None

        description = " | ".join(l for l in current["lines"] if l)
        if not description:
            description = "Transakcja"

        amount = current["amount"]
        tx_type = self._detect_type(description)

        # Parse original currency if present
        original_amount = None
        original_currency = None
        exchange_rate = None
        fx_match = re.search(
            r"Kurs\s+kupna:\s+PLN\s+([\d.,]+)\s+Kurs\s+sprzeda[żz]y:\s+USD\s+([\d.,]+)",
            description
        )
        if fx_match:
            pass  # Pekao currency info is less structured, skip for now

        return ParsedTransaction(
            date=current["date"],
            description=description,
            amount=amount,
            currency="PLN",
            original_amount=original_amount,
            original_currency=original_currency,
            exchange_rate=exchange_rate,
            transaction_type=tx_type,
        )
