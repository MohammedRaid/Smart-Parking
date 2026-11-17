from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..notify import notify
from ..security import create_access_token, get_current_user, hash_password, require_role, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _token_payload(user: models.User) -> dict:
    return {
        "access_token": create_access_token(user),
        "token_type": "bearer",
        "user": schemas.UserOut.model_validate(user).model_dump(),
    }


def _login(db: Session, email: str, password: str, expected_roles: tuple[str, ...] | None) -> dict:
    user = db.scalar(select(models.User).where(models.User.email == email.lower().strip()))
    if user is None or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    if user.is_blocked:
        raise HTTPException(status_code=403, detail="This account has been blocked. Contact support.")
    if expected_roles and user.role not in expected_roles:
        raise HTTPException(
            status_code=403,
            detail=f"This login is for {expected_roles[0]} accounts. Use the correct login page.",
        )
    return _token_payload(user)


@router.post("/register", status_code=201)
def register(payload: schemas.RegisterIn, db: Session = Depends(get_db)):
    email = payload.email.lower().strip()
    if db.scalar(select(models.User).where(models.User.email == email)):
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    user = models.User(
        full_name=payload.full_name.strip(),
        email=email,
        phone=(payload.phone or "").strip() or None,
        city=(payload.city or "").strip() or None,
        password_hash=hash_password(payload.password),
        role=payload.role,
    )
    db.add(user)
    db.flush()
    notify(
        db,
        user.id,
        "Welcome to SmartPark",
        "Your account is ready. Explore parking near you."
        if payload.role == "customer"
        else "Your account is ready. Add your first parking location to start earning.",
        "success",
    )
    db.commit()
    db.refresh(user)
    return _token_payload(user)


@router.post("/login")
def login(payload: schemas.LoginIn, db: Session = Depends(get_db)):
    return _login(db, payload.email, payload.password, None)


@router.post("/login/customer")
def customer_login(payload: schemas.LoginIn, db: Session = Depends(get_db)):
    return _login(db, payload.email, payload.password, ("customer",))


@router.post("/login/landowner")
def landowner_login(payload: schemas.LoginIn, db: Session = Depends(get_db)):
    return _login(db, payload.email, payload.password, ("landowner",))


@router.post("/login/admin")
def admin_login(payload: schemas.LoginIn, db: Session = Depends(get_db)):
    return _login(db, payload.email, payload.password, ("admin",))


@router.get("/me", response_model=schemas.UserOut)
def me(user: models.User = Depends(get_current_user)):
    return user


@router.patch("/me", response_model=schemas.UserOut)
def update_profile(payload: schemas.ProfileUpdateIn, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if payload.full_name is not None:
        user.full_name = payload.full_name.strip()
    if payload.phone is not None:
        user.phone = payload.phone.strip() or None
    if payload.city is not None:
        user.city = payload.city.strip() or None
    db.commit()
    db.refresh(user)
    return user


@router.post("/change-password")
def change_password(
    payload: schemas.PasswordChangeIn,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Your current password is incorrect")
    user.password_hash = hash_password(payload.new_password)
    db.commit()
    return {"detail": "Password updated successfully"}


@router.get("/landowners")
def list_landowners(user: models.User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    rows = db.scalars(select(models.User).where(models.User.role == "landowner")).all()
    return [schemas.UserOut.model_validate(row).model_dump() for row in rows]
