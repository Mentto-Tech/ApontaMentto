import uuid
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user
from models import UserProjectFavorite, User
from schemas import UserProjectFavoriteOut

router = APIRouter()


@router.get("", response_model=List[UserProjectFavoriteOut])
async def list_favorites(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(UserProjectFavorite)
        .where(UserProjectFavorite.user_id == user.id)
        .order_by(UserProjectFavorite.created_at)
    )
    return [UserProjectFavoriteOut.model_validate(f) for f in result.scalars().all()]


@router.post("/{project_id}", response_model=UserProjectFavoriteOut)
async def add_favorite(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    existing = await db.execute(
        select(UserProjectFavorite).where(
            UserProjectFavorite.user_id == user.id,
            UserProjectFavorite.project_id == project_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(409, "Projeto já é favorito")

    fav = UserProjectFavorite(
        user_id=user.id,
        project_id=project_id,
        created_at=datetime.utcnow(),
    )
    db.add(fav)
    await db.commit()
    return UserProjectFavoriteOut.model_validate(fav)


@router.delete("/{project_id}")
async def remove_favorite(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(UserProjectFavorite).where(
            UserProjectFavorite.user_id == user.id,
            UserProjectFavorite.project_id == project_id,
        )
    )
    fav = result.scalar_one_or_none()
    if not fav:
        raise HTTPException(404, "Favorito não encontrado")
    await db.delete(fav)
    await db.commit()
    return {"ok": True}
