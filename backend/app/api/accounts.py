from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.models.user import User
from app.models.account import Account
from app.auth.security import get_current_user

router = APIRouter(prefix="/accounts", tags=["accounts"])


class AccountCreate(BaseModel):
    name: str
    bank: str  # millennium, pekao, other
    account_type: str  # personal, business
    iban: Optional[str] = None


class AccountResponse(BaseModel):
    id: int
    name: str
    bank: str
    account_type: str
    iban: Optional[str]

    class Config:
        from_attributes = True


@router.get("", response_model=list[AccountResponse])
def list_accounts(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Account).all()


@router.post("", response_model=AccountResponse)
def create_account(data: AccountCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    iban = data.iban.replace(" ", "").upper() if data.iban else None
    if iban and db.query(Account).filter(Account.iban == iban).first():
        raise HTTPException(status_code=400, detail="Account with this IBAN already exists")

    account = Account(
        name=data.name,
        bank=data.bank,
        account_type=data.account_type,
        iban=iban,
        created_by=current_user.id,
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


@router.delete("/{account_id}")
def delete_account(account_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin required")
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    db.delete(account)
    db.commit()
    return {"ok": True}
