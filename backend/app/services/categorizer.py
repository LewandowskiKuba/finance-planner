import json
import re
from anthropic import Anthropic
from app.config import settings
from app.parsers.base import ParsedTransaction

client = Anthropic(api_key=settings.ANTHROPIC_API_KEY)

CATEGORIES = [
    "Żywność i zakupy spożywcze",
    "Restauracje i kawiarnie",
    "Transport",
    "Zdrowie i uroda",
    "Odzież i obuwie",
    "Subskrypcje i SaaS",
    "Mieszkanie i media",
    "Kredyt i pożyczka",
    "Rozrywka",
    "Edukacja i kursy",
    "Podatki i ZUS",
    "Darowizny i prezenty",
    "Przelewy osobiste",
    "Zwroty",
    "Gotówka",
    "Przychody - usługi",
    "Przychody - świadczenia",
    "Inne wydatki",
]

SYSTEM_PROMPT = """Jesteś ekspertem od kategoryzacji transakcji bankowych w języku polskim.
Otrzymasz listę transakcji i musisz przypisać każdej z nich kategorię z podanej listy.

Zasady:
- Wpływy pieniędzy (kwota dodatnia, typ transfer_in) przypisuj do "Przychody - usługi" lub "Przychody - świadczenia" (ZUS, 500+, etc.)
- Zwroty płatności (ZWROT) → "Zwroty"
- Prowizje i opłaty bankowe → "Inne wydatki"
- Wypłaty z bankomatu → "Gotówka"
- Spłaty rat kredytu → "Kredyt i pożyczka"
- Przelewy do osób prywatnych (imiona, "na wycieczkę", "prezent") → "Przelewy osobiste" lub "Darowizny i prezenty"
- Sklepy: LIDL, Carrefour, Auchan, Biedronka, Żabka, Rossmann (spożywcze!) → "Żywność i zakupy spożywcze"
- Rossmann, Hebe, DOZ Apteka, apteka, drogeria → "Zdrowie i uroda"
- Restauracje, kawiarnie, fast food, caffe, Green Caffe Nero, McDonald's, Big Boba → "Restauracje i kawiarnie"
- Uber Eats, pyszne.pl, bolt food → "Restauracje i kawiarnie"
- Uber, FreeNow, jakdojade, Bolt transport → "Transport"
- Apple, Netflix, Spotify, ChatGPT/OpenAI, Zen.com, subskrypcje online → "Subskrypcje i SaaS"
- T-Mobile, Play, Orange, Plus → "Mieszkanie i media"
- E.ON, prąd, gaz, woda, spółdzielnia, czynsz → "Mieszkanie i media"
- Kino, teatr, sport → "Rozrywka"
- Szkoły tańca, kursy, szkolenia → "Edukacja i kursy"
- Urząd Skarbowy, podatek, ZUS → "Podatki i ZUS"
- UNICEF, darowizna → "Darowizny i prezenty"
- Odzież: Primark, H&M, Zara, TK Maxx, Castello → "Odzież i obuwie"
- Allegro, Temu (jeśli nie wiadomo co) → "Inne wydatki"

Odpowiedz TYLKO w JSON: {"results": [{"id": 0, "category": "Nazwa kategorii"}, ...]}"""


def categorize_transactions(transactions: list[ParsedTransaction]) -> list[str]:
    """Returns list of category names, one per transaction."""
    if not transactions:
        return []

    # Build request
    tx_list = []
    for i, tx in enumerate(transactions):
        tx_list.append({
            "id": i,
            "date": tx.date.isoformat(),
            "description": tx.description[:200],
            "amount": tx.amount,
            "type": tx.transaction_type,
        })

    user_message = f"Skategoryzuj te transakcje:\n{json.dumps(tx_list, ensure_ascii=False, indent=2)}"

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=2000,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_message}],
    )

    content = response.content[0].text.strip()

    # Extract JSON from response
    json_match = re.search(r'\{.*\}', content, re.DOTALL)
    if not json_match:
        return ["Inne wydatki"] * len(transactions)

    try:
        data = json.loads(json_match.group())
        results = data.get("results", [])
        category_map = {r["id"]: r["category"] for r in results}
        return [category_map.get(i, "Inne wydatki") for i in range(len(transactions))]
    except (json.JSONDecodeError, KeyError):
        return ["Inne wydatki"] * len(transactions)


def categorize_in_batches(transactions: list[ParsedTransaction], batch_size: int = 40) -> list[str]:
    """Categorize in batches to avoid token limits."""
    all_categories = []
    for i in range(0, len(transactions), batch_size):
        batch = transactions[i:i + batch_size]
        categories = categorize_transactions(batch)
        all_categories.extend(categories)
    return all_categories
