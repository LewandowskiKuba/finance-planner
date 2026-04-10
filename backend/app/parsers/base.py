from dataclasses import dataclass, field
from datetime import date
from typing import Optional


@dataclass
class ParsedTransaction:
    date: date
    description: str
    amount: float  # negative = expense, positive = income
    currency: str = "PLN"
    original_amount: Optional[float] = None
    original_currency: Optional[str] = None
    exchange_rate: Optional[float] = None
    transaction_type: str = "other"  # card, transfer_in, transfer_out, fee, blik, atm


class BaseParser:
    def __init__(self, pdf_path: str):
        self.pdf_path = pdf_path

    def can_parse(self) -> bool:
        raise NotImplementedError

    def parse(self) -> tuple[list[ParsedTransaction], dict]:
        """Returns (transactions, metadata) where metadata has period_start, period_end, iban."""
        raise NotImplementedError
