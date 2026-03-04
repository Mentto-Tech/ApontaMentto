import uuid
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user
from models import Location, User
from schemas import LocationIn, LocationOut

router = APIRouter()


@router.get("/", response_model=List[LocationOut])
async def list_locations(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Location).order_by(Location.created_at))
    return [LocationOut.model_validate(l) for l in result.scalars().all()]


@router.post("/", response_model=LocationOut)
async def create_location(
    data: LocationIn,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    location = Location(
        id=str(uuid.uuid4()),
        created_at=datetime.utcnow(),
        **data.model_dump(),
    )
    db.add(location)
    await db.commit()
    await db.refresh(location)
    return LocationOut.model_validate(location)


@router.put("/{location_id}", response_model=LocationOut)
async def update_location(
    location_id: str,
    data: LocationIn,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Location).where(Location.id == location_id))
    location = result.scalar_one_or_none()
    if not location:
        raise HTTPException(404, "Local não encontrado")
    for k, v in data.model_dump().items():
        setattr(location, k, v)
    await db.commit()
    await db.refresh(location)
    return LocationOut.model_validate(location)


@router.delete("/{location_id}")
async def delete_location(
    location_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Location).where(Location.id == location_id))
    location = result.scalar_one_or_none()
    if not location:
        raise HTTPException(404, "Local não encontrado")
    await db.delete(location)
    await db.commit()
    return {"ok": True}
