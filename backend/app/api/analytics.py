from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, extract
from sqlalchemy.orm import Session
from typing import Optional
from datetime import date
from app.database import get_db
from app.models.user import User
from app.models.transaction import Transaction, Category
from app.auth.security import get_current_user


def _linear_regression(values: list[float]) -> tuple[float, float, float]:
    """Returns (slope, intercept, r2). slope is PLN per month index."""
    n = len(values)
    if n < 2:
        return 0.0, values[0] if values else 0.0, 0.0
    xs = list(range(n))
    x_mean = sum(xs) / n
    y_mean = sum(values) / n
    num = sum((xs[i] - x_mean) * (values[i] - y_mean) for i in range(n))
    den = sum((xs[i] - x_mean) ** 2 for i in range(n))
    if den == 0:
        return 0.0, y_mean, 0.0
    slope = num / den
    intercept = y_mean - slope * x_mean
    ss_res = sum((values[i] - (slope * xs[i] + intercept)) ** 2 for i in range(n))
    ss_tot = sum((v - y_mean) ** 2 for v in values)
    r2 = max(0.0, 1 - ss_res / ss_tot) if ss_tot > 0 else 1.0
    return round(slope, 2), round(intercept, 2), round(r2, 3)


def _shift_month(year: int, month: int, delta: int) -> str:
    month += delta
    year += (month - 1) // 12
    month = ((month - 1) % 12) + 1
    return f"{year:04d}-{month:02d}"

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
        .filter(Category.category_type == "expense")
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


@router.get("/forecast")
def forecast(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    history_months: int = Query(6, ge=3, le=24),
    forecast_months: int = Query(3, ge=1, le=6),
):
    """Linear regression forecast per category + overall income/expenses."""

    # --- per-category monthly totals ---
    cat_rows = (
        db.query(
            extract("year", Transaction.date).label("year"),
            extract("month", Transaction.date).label("month"),
            Category.name.label("category"),
            Category.color.label("color"),
            Category.icon.label("icon"),
            func.sum(func.abs(Transaction.amount)).label("total"),
        )
        .join(Category, Transaction.category_id == Category.id)
        .filter(
            Transaction.is_internal_transfer == False,
            Transaction.is_income == False,
        )
        .group_by("year", "month", Category.name, Category.color, Category.icon)
        .order_by("year", "month")
        .all()
    )

    cat_meta: dict[str, dict] = {}
    all_months: set[str] = set()
    for row in cat_rows:
        key = f"{int(row.year):04d}-{int(row.month):02d}"
        all_months.add(key)
        if row.category not in cat_meta:
            cat_meta[row.category] = {"color": row.color, "icon": row.icon, "data": {}}
        cat_meta[row.category]["data"][key] = round(float(row.total), 2)

    sorted_months = sorted(all_months)[-history_months:]
    if not sorted_months:
        return {"history_months": [], "category_trends": [], "overall_forecast": []}

    last_y, last_m = map(int, sorted_months[-1].split("-"))
    fcast_keys = [_shift_month(last_y, last_m, i) for i in range(1, forecast_months + 1)]
    n_hist = len(sorted_months)

    category_trends = []
    for cat_name, meta in cat_meta.items():
        values = [meta["data"].get(m, 0.0) for m in sorted_months]
        if sum(values) == 0:
            continue
        slope, intercept, r2 = _linear_regression(values)
        avg = round(sum(values) / n_hist, 2)
        trend_pct = round((slope / avg * 100) if avg > 0 else 0.0, 1)
        category_trends.append({
            "category": cat_name,
            "color": meta["color"],
            "icon": meta["icon"],
            "avg_monthly": avg,
            "trend_slope": slope,
            "trend_pct_per_month": trend_pct,
            "r2": r2,
            "history": [{"month": m, "total": meta["data"].get(m, 0.0)} for m in sorted_months],
            "forecast": [
                {"month": fcast_keys[i], "predicted": round(max(0.0, intercept + slope * (n_hist + i)), 2)}
                for i in range(forecast_months)
            ],
        })

    category_trends.sort(key=lambda x: abs(x["trend_slope"]), reverse=True)

    # --- overall income / expense forecast ---
    overall_rows = (
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

    income_by_month: dict[str, float] = {}
    expense_by_month: dict[str, float] = {}
    for row in overall_rows:
        key = f"{int(row.year):04d}-{int(row.month):02d}"
        if row.is_income:
            income_by_month[key] = round(float(row.total), 2)
        else:
            expense_by_month[key] = round(float(row.total), 2)

    inc_vals = [income_by_month.get(m, 0.0) for m in sorted_months]
    exp_vals = [expense_by_month.get(m, 0.0) for m in sorted_months]
    inc_s, inc_b, _ = _linear_regression(inc_vals)
    exp_s, exp_b, _ = _linear_regression(exp_vals)

    overall_forecast = []
    for i in range(forecast_months):
        proj_inc = round(max(0.0, inc_b + inc_s * (n_hist + i)), 2)
        proj_exp = round(max(0.0, exp_b + exp_s * (n_hist + i)), 2)
        overall_forecast.append({
            "month": fcast_keys[i],
            "income": proj_inc,
            "expenses": proj_exp,
            "net": round(proj_inc - proj_exp, 2),
        })

    return {
        "history_months": sorted_months,
        "category_trends": category_trends,
        "overall_forecast": overall_forecast,
    }
