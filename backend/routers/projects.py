import uuid
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user
from models import Project, User
from schemas import ProjectIn, ProjectOut

router = APIRouter()


@router.get("/", response_model=List[ProjectOut])
async def list_projects(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Project).order_by(Project.created_at))
    return [ProjectOut.model_validate(p) for p in result.scalars().all()]


@router.post("/", response_model=ProjectOut)
async def create_project(
    data: ProjectIn,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    project = Project(
        id=str(uuid.uuid4()),
        created_at=datetime.utcnow(),
        **data.model_dump(),
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return ProjectOut.model_validate(project)


@router.put("/{project_id}", response_model=ProjectOut)
async def update_project(
    project_id: str,
    data: ProjectIn,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Projeto não encontrado")
    for k, v in data.model_dump().items():
        setattr(project, k, v)
    await db.commit()
    await db.refresh(project)
    return ProjectOut.model_validate(project)


@router.delete("/{project_id}")
async def delete_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Projeto não encontrado")
    await db.delete(project)
    await db.commit()
    return {"ok": True}
