from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, extract
from sqlalchemy.orm import Session
from typing import Optional
from datetime import date
from app.database import get_db
from app.models.user import User
from app.models.transaction import Transaction, Category
from app.auth.security import get_current_user

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/monthly-summary")
def monthly_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    months: int = Query(12, le=36),
):
    """Total income and expenses per month for the last N months."""
    rows = (
        db.query(
            extract("year", Transaction.date).label("year"),
            extract("month", Transaction.date).label("month"),
            Transaction.is_income,
            func.sum(func.abs(Transaction.amount)).label("total"),
        )
        .filter(Transaction.is_internal_transfer == False)
        .group_by("year", "month", Transaction.is_income)
        .order_by("year", "month")
        .all()
    )

    # Restructure into {year_month: {income, expenses}}
    result = {}
    for row in rows:
        key = f"{int(row.year):04d}-{int(row.month):02d}"
        if key not in result:
            result[key] = {"month": key, "income": 0.0, "expenses": 0.0}
        if row.is_income:
            result[key]["income"] = round(float(row.total), 2)
        else:
            result[key]["expenses"] = round(float(row.total), 2)

    # Sort and limit
    sorted_keys = sorted(result.keys())[-months:]
    return [result[k] for k in sorted_keys]


@router.get("/category-monthly")
def category_monthly(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    months: int = Query(12, le=36),
    exclude_income: bool = True,
):
    """Spending per category per month."""
    q = (
        db.query(
            extract("year", Transaction.date).label("year"),
            extract("month", Transaction.date).label("month"),
            Category.name.label("category"),
            Category.color.label("color"),
            func.sum(func.abs(Transaction.amount)).label("total"),
        )
        .join(Category, Transaction.category_id == Category.id)
        .filter(Transaction.is_internal_transfer == False)
    )
    if exclude_income:
        q = q.filter(Transaction.is_income == False)

    rows = q.group_by("year", "month", Category.name, Category.color).order_by("year", "month").all()

    result = {}
    for row in rows:
        key = f"{int(row.year):04d}-{int(row.month):02d}"
        if key not in result:
            result[key] = {"month": key, "categories": {}}
        result[key]["categories"][row.category] = {
            "total": round(float(row.total), 2),
            "color": row.color,
        }

    sorted_keys = sorted(result.keys())[-months:]
    return [result[k] for k in sorted_keys]


@router.get("/category-totals")
def category_totals(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
):
    """Total per category for a given period (for pie chart)."""
    q = (
        db.query(
            Category.name,
            Category.color,
            Category.icon,
            func.sum(func.abs(Transaction.amount)).label("total"),
            func.count(Transaction.id).label("count"),
        )
        .join(Category, Transaction.category_id == Category.id)
        .filter(Transaction.is_internal_transfer == False)
        .filter(Transaction.is_income == False)
    )
    if date_from:
        q = q.filter(Transaction.date >= date_from)
    if date_to:
        q = q.filter(Transaction.date <= date_to)

    rows = q.group_by(Category.name, Category.color, Category.icon).order_by(func.sum(func.abs(Transaction.amount)).desc()).all()

    return [
        {
            "category": row.name,
            "color": row.color,
            "icon": row.icon,
            "total": round(float(row.total), 2),
            "count": row.count,
        }
        for row in rows
    ]


@router.get("/category-trend")
def category_trend(
    category_name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    months: int = Query(12, le=36),
):
    """Monthly trend for a single category."""
    rows = (
        db.query(
            extract("year", Transaction.date).label("year"),
            extract("month", Transaction.date).label("month"),
            func.sum(func.abs(Transaction.amount)).label("total"),
            func.count(Transaction.id).label("count"),
        )
        .join(Category, Transaction.category_id == Category.id)
        .filter(Transaction.is_internal_transfer == False)
        .filter(Category.name == category_name)
        .group_by("year", "month")
        .order_by("year", "month")
        .all()
    )

    result = []
    for row in rows:
        result.append({
            "month": f"{int(row.year):04d}-{int(row.month):02d}",
            "total": round(float(row.total), 2),
            "count": row.count,
        })
    return result[-months:]


@router.get("/income-vs-expenses")
def income_vs_expenses(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    months: int = Query(12, le=36),
):
    """Monthly income vs expenses with net balance and savings rate."""
    monthly = monthly_summary(db=db, current_user=current_user, months=months)
    result = []
    for m in monthly:
        income = m["income"]
        expenses = m["expenses"]
        net = round(income - expenses, 2)
        savings_rate = round((net / income * 100) if income > 0 else 0, 1)
        result.append({
            **m,
            "net": net,
            "savings_rate": savings_rate,
        })
    return result
