import os
import tempfile
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel
from datetime import date
from app.database import get_db
from app.models.user import User
from app.models.account import Account
from app.models.statement import Statement
from app.models.transaction import Transaction, Category
from app.auth.security import get_current_user
from app.parsers import detect_and_parse
from app.services.categorizer import categorize_in_batches

router = APIRouter(prefix="/statements", tags=["statements"])


class StatementResponse(BaseModel):
    id: int
    account_id: int
    account_name: str
    period_start: date
    period_end: date
    filename: str
    transaction_count: int

    class Config:
        from_attributes = True


@router.get("", response_model=list[StatementResponse])
def list_statements(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    counts = dict(
        db.query(Transaction.statement_id, func.count(Transaction.id))
        .group_by(Transaction.statement_id)
        .all()
    )
    statements = (
        db.query(Statement)
        .options(joinedload(Statement.account))
        .order_by(Statement.period_end.desc())
        .all()
    )
    return [
        StatementResponse(
            id=s.id,
            account_id=s.account_id,
            account_name=s.account.name,
            period_start=s.period_start,
            period_end=s.period_end,
            filename=s.filename,
            transaction_count=counts.get(s.id, 0),
        )
        for s in statements
    ]


BANK_DISPLAY = {"millennium": "Bank Millennium", "pekao": "Bank Pekao", "other": "Inny bank"}


def _resolve_account(db: Session, metadata: dict, current_user_id: int) -> Account:
    """Find existing account by IBAN or create one automatically."""
    iban = metadata.get("iban")
    bank = metadata.get("bank") or "other"

    if iban:
        account = db.query(Account).filter(Account.iban == iban).first()
        if account:
            return account

    # Auto-create account
    if iban:
        suffix = iban[-4:]
        name = f"{BANK_DISPLAY.get(bank, bank)} …{suffix}"
    else:
        name = f"{BANK_DISPLAY.get(bank, bank)}"

    account = Account(
        name=name,
        bank=bank,
        account_type="personal",
        iban=iban or None,
        created_by=current_user_id,
    )
    db.add(account)
    db.flush()
    return account


@router.post("/upload")
async def upload_statement(
    file: UploadFile = File(...),
    account_id: int | None = Form(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Save to temp file
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        transactions_data, metadata = detect_and_parse(tmp_path)
    except ValueError as e:
        os.unlink(tmp_path)
        raise HTTPException(status_code=422, detail=str(e))
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)

    if not transactions_data:
        raise HTTPException(status_code=422, detail="No transactions found in PDF")

    # Resolve account: explicit id > auto from IBAN/bank in PDF
    if account_id is not None:
        account = db.query(Account).filter(Account.id == account_id).first()
        if not account:
            raise HTTPException(status_code=404, detail="Account not found")
    else:
        account = _resolve_account(db, metadata, current_user.id)

    # Determine period
    period_start = metadata.get("period_start") or min(t.date for t in transactions_data)
    period_end = metadata.get("period_end") or max(t.date for t in transactions_data)

    # Check for duplicate statement
    existing = db.query(Statement).filter(
        Statement.account_id == account.id,
        Statement.period_start == period_start,
        Statement.period_end == period_end,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Statement for this period already uploaded")

    # Create statement
    statement = Statement(
        account_id=account.id,
        period_start=period_start,
        period_end=period_end,
        filename=file.filename,
    )
    db.add(statement)
    db.flush()

    # Get all known account IBANs for internal transfer detection
    all_ibans = {a.iban for a in db.query(Account).all() if a.iban}

    # Categorize via AI
    categories = categorize_in_batches(transactions_data)

    # Get all categories from DB
    cat_map = {c.name: c.id for c in db.query(Category).all()}

    # Persist transactions
    for tx_data, category_name in zip(transactions_data, categories):
        is_income = tx_data.amount > 0
        is_internal = False

        # Detect internal transfers: look for own IBAN in description
        if all_ibans:
            for iban in all_ibans:
                iban_digits = iban[2:]  # strip PL prefix
                if iban_digits in tx_data.description.replace(" ", ""):
                    is_internal = True
                    break

        category_id = cat_map.get(category_name) or cat_map.get("Inne wydatki")

        tx = Transaction(
            statement_id=statement.id,
            account_id=account.id,
            date=tx_data.date,
            description=tx_data.description,
            amount=float(tx_data.amount),
            currency=tx_data.currency,
            original_amount=float(tx_data.original_amount) if tx_data.original_amount else None,
            original_currency=tx_data.original_currency,
            exchange_rate=float(tx_data.exchange_rate) if tx_data.exchange_rate else None,
            category_id=category_id,
            category_source="ai",
            is_income=is_income,
            is_internal_transfer=is_internal,
            transaction_type=tx_data.transaction_type,
        )
        db.add(tx)

    db.commit()

    return {
        "statement_id": statement.id,
        "transactions_imported": len(transactions_data),
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
    }


@router.delete("/{statement_id}")
def delete_statement(statement_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin required")
    stmt = db.query(Statement).filter(Statement.id == statement_id).first()
    if not stmt:
        raise HTTPException(status_code=404, detail="Not found")
    db.query(Transaction).filter(Transaction.statement_id == statement_id).delete()
    db.delete(stmt)
    db.commit()
    return {"ok": True}
