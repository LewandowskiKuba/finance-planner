import re
import pdfplumber
from datetime import date, datetime
from app.parsers.base import BaseParser, ParsedTransaction


TRANSACTION_TYPE_MAP = {
    "PŁATNOŚĆ KARTĄ": "card",
    "PŁATNOŚĆ BLIK W INTERNECIE": "blik",
    "PŁATNOŚĆ BLIK NA TELEFON": "blik",
    "PRZELEW PRZYCHODZĄCY": "transfer_in",
    "PRZEL.NATYCH.PRZYCH.": "transfer_in",
    "PRZELEW WYCHODZĄCY": "transfer_out",
    "PRZELEW NA NUMER TELEFONU": "transfer_out",
    "PRZELEW POLEC. ZAPŁ.": "transfer_out",
    "PRZELEW ZLEC. STAŁE": "transfer_out",
    "WYPŁATA KARTĄ": "atm",
    "PROWIZJA/OPŁATA": "fee",
    "ZWROT PŁATNOŚCI": "refund",
    "SP.RATY": "loan_payment",
    "SPŁ.RATY": "loan_payment",
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
            iban_match = re.search(r"IBAN:\s*(PL[\d\s]+)", full_text)
            if iban_match:
                metadata["iban"] = re.sub(r"\s", "", iban_match.group(1))

            # Extract period
            period_match = re.search(r"za okres od (\d{2}\.\d{2}\.\d{4}) do (\d{2}\.\d{2}\.\d{4})", full_text)
            if period_match:
                metadata["period_start"] = datetime.strptime(period_match.group(1), "%d.%m.%Y").date()
                metadata["period_end"] = datetime.strptime(period_match.group(2), "%d.%m.%Y").date()

            # Parse transactions line by line
            transactions = self._parse_transactions(full_text)

        return transactions, metadata

    def _parse_transactions(self, text: str) -> list[ParsedTransaction]:
        transactions = []
        lines = text.split("\n")

        # Find the section with transactions (after "SALDO POCZĄTKOWE")
        in_transactions = False
        current_tx_lines = []

        DATE_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})\s+(\d{4}-\d{2}-\d{2})\s+(.+?)\s+([\d\s]+,\d{2}[-]?)\s+([\d\s]+,\d{2}[-]?)$")
        TX_START_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})\s+(\d{4}-\d{2}-\d{2})\s+(.+)")

        i = 0
        while i < len(lines):
            line = lines[i].strip()

            if "SALDO POCZĄTKOWE" in line:
                in_transactions = True
                i += 1
                continue

            if not in_transactions:
                i += 1
                continue

            # Stop at summary lines
            if "SUMA UZNAŃ" in line or "UDZIELONE KREDYTY" in line:
                break

            # Check if line starts a new transaction (two dates at start)
            m = re.match(r"^(\d{4}-\d{2}-\d{2})\s+(\d{4}-\d{2}-\d{2})\s+(.*)", line)
            if m:
                # Process previous accumulated transaction
                if current_tx_lines:
                    tx = self._build_transaction(current_tx_lines)
                    if tx:
                        transactions.append(tx)

                current_tx_lines = [line]
            elif current_tx_lines and line:
                current_tx_lines.append(line)

            i += 1

        # Don't forget the last one
        if current_tx_lines:
            tx = self._build_transaction(current_tx_lines)
            if tx:
                transactions.append(tx)

        return transactions

    def _build_transaction(self, lines: list[str]) -> ParsedTransaction | None:
        if not lines:
            return None

        first_line = lines[0]
        # Extract booking date
        date_match = re.match(r"^(\d{4}-\d{2}-\d{2})\s+(\d{4}-\d{2}-\d{2})\s+(.*)", first_line)
        if not date_match:
            return None

        booking_date = datetime.strptime(date_match.group(1), "%Y-%m-%d").date()
        rest = date_match.group(3)

        # Extract amount and balance from end of first line
        # Amount format: "1.234,56-" or "1.234,56 " (with optional minus at end)
        amount_match = re.search(r"([\d\s]+,\d{2}[-]?)\s+([\d\s]+,\d{2}[-]?)\s*$", rest)
        if not amount_match:
            return None

        amount_str = amount_match.group(1).strip()
        desc_text = rest[:amount_match.start()].strip()

        # Combine with continuation lines (skip lines that look like card/metadata)
        description_parts = [desc_text]
        for line in lines[1:]:
            line = line.strip()
            # Skip card number lines, date lines, etc.
            if re.match(r"Karta:.*Posiadacz:", line):
                break
            if re.match(r"Dnia:.*ZAKUP", line):
                break
            if re.match(r"Kwota transakcji:", line):
                # Parse original currency if foreign
                fx_match = re.search(r"Kwota transakcji:\s*([\d.,]+)\s+([A-Z]{3})\s+Kurs walutowy:\s*1\s+[A-Z]{3}\s+=\s+([\d.,]+)\s+PLN", line)
                if fx_match:
                    # store for later
                    pass
                break
            if re.match(r"Z R-ku:|Na R-k:|Nadawca:|Tytułem:|Od:|Do:|ZLECENIODAWCA:|Odbiorca:", line):
                description_parts.append(line)
                continue
            description_parts.append(line)

        full_description = " | ".join(p for p in description_parts if p)

        # Parse amount
        is_negative = amount_str.endswith("-")
        amount_clean = amount_str.rstrip("-").replace(" ", "").replace(",", ".")
        try:
            amount = float(amount_clean)
        except ValueError:
            return None

        if is_negative:
            amount = -amount

        # Detect original currency from all lines
        original_amount = None
        original_currency = None
        exchange_rate = None
        for line in lines:
            fx_match = re.search(
                r"Kwota transakcji:\s*([\d.,]+)\s+([A-Z]{3})\s+Kurs walutowy:\s*1\s+[A-Z]{3}\s+=\s+([\d.]+)\s+PLN",
                line
            )
            if fx_match:
                orig_str = fx_match.group(1).replace(",", ".")
                original_amount = float(orig_str)
                original_currency = fx_match.group(2)
                exchange_rate = float(fx_match.group(3))
                break

        # Detect transaction type
        tx_type = "other"
        for keyword, t in TRANSACTION_TYPE_MAP.items():
            if keyword in full_description.upper() or keyword in desc_text.upper():
                tx_type = t
                break

        return ParsedTransaction(
            date=booking_date,
            description=full_description,
            amount=amount,
            currency="PLN",
            original_amount=original_amount,
            original_currency=original_currency,
            exchange_rate=exchange_rate,
            transaction_type=tx_type,
        )
