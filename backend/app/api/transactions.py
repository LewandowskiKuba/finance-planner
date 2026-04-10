from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import date
from app.database import get_db
from app.models.user import User
from app.models.transaction import Transaction, Category
from app.auth.security import get_current_user

router = APIRouter(prefix="/transactions", tags=["transactions"])


class CategoryResponse(BaseModel):
    id: int
    name: str
    color: str
    icon: str
    category_type: str

    class Config:
        from_attributes = True


class TransactionResponse(BaseModel):
    id: int
    date: date
    description: str
    amount: float
    currency: str
    original_amount: Optional[float]
    original_currency: Optional[str]
    account_id: int
    account_name: str
    category_id: Optional[int]
    category_name: Optional[str]
    category_color: Optional[str]
    category_source: str
    is_income: bool
    is_internal_transfer: bool
    transaction_type: str

    class Config:
        from_attributes = True


class CategoryUpdate(BaseModel):
    category_id: int


class InternalTransferUpdate(BaseModel):
    is_internal_transfer: bool


@router.get("", response_model=list[TransactionResponse])
def list_transactions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    account_id: Optional[int] = None,
    category_id: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    is_income: Optional[bool] = None,
    include_internal: bool = False,
    search: Optional[str] = None,
    limit: int = Query(200, le=500),
    offset: int = 0,
):
    q = db.query(Transaction)
    if account_id:
        q = q.filter(Transaction.account_id == account_id)
    if category_id:
        q = q.filter(Transaction.category_id == category_id)
    if date_from:
        q = q.filter(Transaction.date >= date_from)
    if date_to:
        q = q.filter(Transaction.date <= date_to)
    if is_income is not None:
        q = q.filter(Transaction.is_income == is_income)
    if not include_internal:
        q = q.filter(Transaction.is_internal_transfer == False)
    if search:
        q = q.filter(Transaction.description.ilike(f"%{search}%"))

    transactions = q.order_by(Transaction.date.desc()).offset(offset).limit(limit).all()

    result = []
    for tx in transactions:
        result.append(TransactionResponse(
            id=tx.id,
            date=tx.date,
            description=tx.description,
            amount=float(tx.amount),
            currency=tx.currency,
            original_amount=float(tx.original_amount) if tx.original_amount else None,
            original_currency=tx.original_currency,
            account_id=tx.account_id,
            account_name=tx.account.name,
            category_id=tx.category_id,
            category_name=tx.category.name if tx.category else None,
            category_color=tx.category.color if tx.category else None,
            category_source=tx.category_source,
            is_income=tx.is_income,
            is_internal_transfer=tx.is_internal_transfer,
            transaction_type=tx.transaction_type,
        ))
    return result


@router.patch("/{transaction_id}/category")
def update_category(
    transaction_id: int,
    data: CategoryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tx = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    cat = db.query(Category).filter(Category.id == data.category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    tx.category_id = data.category_id
    tx.category_source = "manual"
    db.commit()
    return {"ok": True}


@router.patch("/{transaction_id}/internal")
def update_internal(
    transaction_id: int,
    data: InternalTransferUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tx = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    tx.is_internal_transfer = data.is_internal_transfer
    db.commit()
    return {"ok": True}


@router.get("/categories", response_model=list[CategoryResponse])
def list_categories(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Category).order_by(Category.sort_order).all()
