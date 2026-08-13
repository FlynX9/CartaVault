from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from app.annotations.models import AnnotationTemplate, PlaceAnnotation
from app.annotations.schemas import AnnotationTemplateCreate, AnnotationTemplateOrder, AnnotationTemplateRead, AnnotationTemplateUpdate, PlaceAnnotationCreate, PlaceAnnotationRead, PlaceAnnotationUpdate, validate_geometry
from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.auth.permissions import require_map_role, require_place_role
from app.database import get_db

router = APIRouter(prefix="/annotations", tags=["annotations"])


def _template_read(template: AnnotationTemplate, usage_count: int = 0) -> AnnotationTemplateRead:
    return AnnotationTemplateRead.model_validate(template, from_attributes=True).model_copy(update={"usage_count": usage_count})


def _annotation_read(annotation: PlaceAnnotation, usage_count: int) -> PlaceAnnotationRead:
    return PlaceAnnotationRead.model_validate(annotation, from_attributes=True).model_copy(update={"template": _template_read(annotation.template, usage_count)})


def _annotation_query():
    usage_count = (
        select(func.count(PlaceAnnotation.id))
        .where(PlaceAnnotation.template_id == AnnotationTemplate.id)
        .correlate(AnnotationTemplate)
        .scalar_subquery()
    )
    return select(PlaceAnnotation, usage_count.label("usage_count")).join(PlaceAnnotation.template).options(joinedload(PlaceAnnotation.template))


def _template_with_usage(session: Session, template_id: UUID) -> tuple[AnnotationTemplate, int]:
    row = session.execute(select(AnnotationTemplate, func.count(PlaceAnnotation.id)).outerjoin(PlaceAnnotation).where(AnnotationTemplate.id == template_id).group_by(AnnotationTemplate.id)).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Annotation template not found")
    return row


@router.get("/templates", response_model=list[AnnotationTemplateRead])
def get_templates(map_id: UUID = Query(), database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[AnnotationTemplateRead]:
    require_map_role(database_session, map_id, current_user, "viewer")
    rows = database_session.execute(select(AnnotationTemplate, func.count(PlaceAnnotation.id)).outerjoin(PlaceAnnotation).where(AnnotationTemplate.map_id == map_id).group_by(AnnotationTemplate.id).order_by(AnnotationTemplate.sort_order, AnnotationTemplate.name, AnnotationTemplate.id)).all()
    return [_template_read(template, count) for template, count in rows]


@router.post("/templates", response_model=AnnotationTemplateRead, status_code=201)
def create_template(data: AnnotationTemplateCreate, database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> AnnotationTemplateRead:
    require_map_role(database_session, data.map_id, current_user, "editor")
    template = AnnotationTemplate(**data.model_dump())
    try:
        database_session.add(template); database_session.commit(); database_session.refresh(template)
    except IntegrityError as error:
        database_session.rollback(); raise HTTPException(status_code=409, detail="An annotation template with this name already exists in this map") from error
    return _template_read(template)


@router.post("/templates/reorder", response_model=list[AnnotationTemplateRead])
def reorder_templates(data: AnnotationTemplateOrder, map_id: UUID = Query(), database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[AnnotationTemplateRead]:
    require_map_role(database_session, map_id, current_user, "editor")
    templates = list(database_session.scalars(
        select(AnnotationTemplate)
        .where(AnnotationTemplate.map_id == map_id)
        .order_by(AnnotationTemplate.sort_order, func.lower(AnnotationTemplate.name), AnnotationTemplate.id)
    ))
    if len(data.ids) != len(templates) or set(data.ids) != {item.id for item in templates}:
        raise HTTPException(status_code=422, detail="The annotation template order must contain every template exactly once")

    try:
        by_id = {item.id: item for item in templates}
        for index, template_id in enumerate(data.ids, start=1):
            by_id[template_id].sort_order = index * 10
        database_session.commit()
        usage_counts = dict(database_session.execute(
            select(PlaceAnnotation.template_id, func.count(PlaceAnnotation.id))
            .where(PlaceAnnotation.template_id.in_(data.ids))
            .group_by(PlaceAnnotation.template_id)
        ).all())
        return [_template_read(by_id[template_id], usage_counts.get(template_id, 0)) for template_id in data.ids]
    except SQLAlchemyError as error:
        database_session.rollback()
        raise HTTPException(status_code=500, detail="Unable to reorder annotation templates") from error


@router.patch("/templates/{template_id}", response_model=AnnotationTemplateRead)
def update_template(template_id: UUID, data: AnnotationTemplateUpdate, database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> AnnotationTemplateRead:
    template, usage_count = _template_with_usage(database_session, template_id)
    require_map_role(database_session, template.map_id, current_user, "editor")
    supplied = data.model_dump(exclude_unset=True)
    if "shape_type" in supplied and supplied["shape_type"] != template.shape_type and usage_count:
        raise HTTPException(status_code=409, detail="The shape type cannot change after this template has been used")
    for key, value in supplied.items(): setattr(template, key, value)
    try:
        database_session.commit(); database_session.refresh(template)
    except IntegrityError as error:
        database_session.rollback(); raise HTTPException(status_code=409, detail="An annotation template with this name already exists in this map") from error
    return _template_read(template, usage_count)


@router.delete("/templates/{template_id}", status_code=204)
def delete_template(template_id: UUID, database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> Response:
    template, usage_count = _template_with_usage(database_session, template_id)
    require_map_role(database_session, template.map_id, current_user, "editor")
    if usage_count:
        raise HTTPException(status_code=409, detail="A used annotation template cannot be deleted; deactivate it instead")
    database_session.delete(template); database_session.commit()
    return Response(status_code=204)


@router.get("/places/{place_id}", response_model=list[PlaceAnnotationRead])
def get_place_annotations(place_id: UUID, database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[PlaceAnnotationRead]:
    require_place_role(database_session, place_id, current_user, "viewer")
    rows = database_session.execute(_annotation_query().where(PlaceAnnotation.place_id == place_id).order_by(PlaceAnnotation.created_at, PlaceAnnotation.id)).all()
    return [_annotation_read(annotation, usage_count) for annotation, usage_count in rows]


@router.post("/places/{place_id}", response_model=PlaceAnnotationRead, status_code=201)
def create_place_annotation(place_id: UUID, data: PlaceAnnotationCreate, database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> PlaceAnnotationRead:
    place = require_place_role(database_session, place_id, current_user, "editor")
    template = database_session.get(AnnotationTemplate, data.template_id)
    if template is None or template.map_id != place.map_id:
        raise HTTPException(status_code=404, detail="Annotation template not found")
    if not template.is_active:
        raise HTTPException(status_code=409, detail="This annotation template is inactive")
    validate_geometry(template.shape_type, data.geometry, data.radius_meters)
    annotation = PlaceAnnotation(place_id=place.id, **data.model_dump())
    database_session.add(annotation); database_session.commit()
    row = database_session.execute(_annotation_query().where(PlaceAnnotation.id == annotation.id)).one()
    return _annotation_read(*row)


@router.patch("/places/{place_id}/{annotation_id}", response_model=PlaceAnnotationRead)
def update_place_annotation(place_id: UUID, annotation_id: UUID, data: PlaceAnnotationUpdate, database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> PlaceAnnotationRead:
    place = require_place_role(database_session, place_id, current_user, "editor")
    row = database_session.execute(_annotation_query().where(PlaceAnnotation.id == annotation_id, PlaceAnnotation.place_id == place.id)).one_or_none()
    if row is None: raise HTTPException(status_code=404, detail="Annotation not found")
    annotation, usage_count = row
    supplied = data.model_dump(exclude_unset=True)
    geometry = supplied.get("geometry", annotation.geometry)
    radius = supplied.get("radius_meters", annotation.radius_meters)
    validate_geometry(annotation.template.shape_type, geometry, radius)
    for key, value in supplied.items(): setattr(annotation, key, value)
    database_session.commit(); database_session.refresh(annotation)
    return _annotation_read(annotation, usage_count)


@router.delete("/places/{place_id}/{annotation_id}", status_code=204)
def delete_place_annotation(place_id: UUID, annotation_id: UUID, database_session: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> Response:
    place = require_place_role(database_session, place_id, current_user, "editor")
    annotation = database_session.scalar(select(PlaceAnnotation).where(PlaceAnnotation.id == annotation_id, PlaceAnnotation.place_id == place.id))
    if annotation is None: raise HTTPException(status_code=404, detail="Annotation not found")
    database_session.delete(annotation); database_session.commit()
    return Response(status_code=204)
