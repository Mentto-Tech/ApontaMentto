from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_admin_user, get_current_user
from models import User
from schemas import UserAdminUpdate, UserMeUpdate, UserOut, ChangePasswordRequest
from security import verify_password, hash_password

router = APIRouter()


@router.get("", response_model=List[UserOut])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    result = await db.execute(select(User).order_by(User.username))
    return [UserOut.model_validate(u) for u in result.scalars().all()]


@router.patch("/{user_id}", response_model=UserOut)
async def update_user_admin(
    user_id: str,
    data: UserAdminUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "Usuário não encontrado")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(user, key, value)

    await db.commit()
    await db.refresh(user)
    return UserOut.model_validate(user)


@router.get("/me/data-export")
async def export_my_data(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(User)
        .options(selectinload(User.daily_records))
        .where(User.id == current_user.id)
    )
    user_with_records = result.scalar_one()
    
    return {
        "user": {
            "id": user_with_records.id,
            "username": user_with_records.username,
            "email": user_with_records.email,
            "category": user_with_records.category,
            "created_at": user_with_records.created_at,
        },
        "daily_records": [
            {
                "date": dr.date,
                "in1": dr.in1,
                "out1": dr.out1,
                "in2": dr.in2,
                "out2": dr.out2,
                "ip_address": dr.ip_address,
                "geo_lat": dr.geo_lat,
                "geo_lng": dr.geo_lng,
            }
            for dr in user_with_records.daily_records
        ]
    }


import uuid

@router.delete("/me")
async def delete_me(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Soft delete (LGPD Anonymization)
    suffix = str(uuid.uuid4())[:12]
    current_user.email = f"deleted_{suffix}@mentto.local"
    current_user.username = f"Usuario_Excluido_{suffix}"
    current_user.hashed_password = "SOFT_DELETED"
    
    await db.commit()
    return {"message": "Conta excluída com sucesso"}


@router.post("/me/change-password")
async def change_password(
    data: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(400, "Senha atual incorreta")
    
    current_user.hashed_password = hash_password(data.new_password)
    await db.commit()
    return {"message": "Senha alterada com sucesso"}


@router.put("/me", response_model=UserOut)
async def update_me(
    data: UserMeUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if data.name is not None:
        current_user.username = data.name

    if data.email and data.email != current_user.email:
        result = await db.execute(
            select(User).where(User.email == data.email, User.id != current_user.id)
        )
        if result.scalar_one_or_none():
            raise HTTPException(400, "Email já está em uso")
        current_user.email = data.email

    await db.commit()
    await db.refresh(current_user)
    return UserOut.model_validate(current_user)
