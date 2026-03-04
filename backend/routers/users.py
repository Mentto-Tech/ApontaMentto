from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_admin_user, get_current_user
from models import User
from schemas import UserOut, UserUpdate, UserUpdateRate

router = APIRouter()


@router.get("/", response_model=List[UserOut])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    result = await db.execute(select(User).order_by(User.created_at))
    return [UserOut.model_validate(u) for u in result.scalars().all()]


@router.patch("/{user_id}/rate", response_model=UserOut)
async def update_rate(
    user_id: str,
    data: UserUpdateRate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "Usuário não encontrado")
    user.hourly_rate = data.hourly_rate
    await db.commit()
    await db.refresh(user)
    return UserOut.model_validate(user)


@router.put("/me", response_model=UserOut)
async def update_me(
    data: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if data.name:
        current_user.name = data.name
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
