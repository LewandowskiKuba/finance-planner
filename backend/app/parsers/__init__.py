from app.parsers.millennium import MillenniumParser
from app.parsers.pekao import PekaoParser
from app.parsers.base import ParsedTransaction


def detect_and_parse(pdf_path: str) -> tuple[list[ParsedTransaction], dict]:
    """Auto-detect bank and parse PDF. Returns (transactions, metadata)."""
    for ParserClass in [MillenniumParser, PekaoParser]:
        parser = ParserClass(pdf_path)
        if parser.can_parse():
            return parser.parse()
    raise ValueError("Unsupported bank statement format")
