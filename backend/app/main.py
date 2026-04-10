from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base, SessionLocal
from app.models import User, Account, Transaction, Category
from app.models.statement import Statement
from app.api import auth, accounts, statements, transactions, analytics

app = FastAPI(title="Finance Planner", root_path="/financeplaner/api")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/v1")
app.include_router(accounts.router, prefix="/v1")
app.include_router(statements.router, prefix="/v1")
app.include_router(transactions.router, prefix="/v1")
app.include_router(analytics.router, prefix="/v1")


@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
    _seed_categories()


def _seed_categories():
    db = SessionLocal()
    try:
        if db.query(Category).count() > 0:
            return

        categories = [
            ("Żywność i zakupy spożywcze", "#22c55e", "🛒", "expense", 1),
            ("Restauracje i kawiarnie", "#f97316", "🍽️", "expense", 2),
            ("Transport", "#3b82f6", "🚗", "expense", 3),
            ("Zdrowie i uroda", "#ec4899", "💊", "expense", 4),
            ("Odzież i obuwie", "#a855f7", "👗", "expense", 5),
            ("Subskrypcje i SaaS", "#06b6d4", "💻", "expense", 6),
            ("Mieszkanie i media", "#84cc16", "🏠", "expense", 7),
            ("Kredyt i pożyczka", "#ef4444", "🏦", "expense", 8),
            ("Rozrywka", "#f59e0b", "🎬", "expense", 9),
            ("Edukacja i kursy", "#8b5cf6", "📚", "expense", 10),
            ("Podatki i ZUS", "#dc2626", "📋", "expense", 11),
            ("Darowizny i prezenty", "#14b8a6", "🎁", "expense", 12),
            ("Przelewy osobiste", "#64748b", "👤", "expense", 13),
            ("Zwroty", "#10b981", "↩️", "income", 14),
            ("Gotówka", "#78716c", "💵", "expense", 15),
            ("Przychody - usługi", "#16a34a", "💼", "income", 16),
            ("Przychody - świadczenia", "#15803d", "🏛️", "income", 17),
            ("Inne wydatki", "#94a3b8", "📦", "expense", 18),
        ]

        for name, color, icon, cat_type, order in categories:
            db.add(Category(name=name, color=color, icon=icon, category_type=cat_type, sort_order=order))

        db.commit()
    finally:
        db.close()
