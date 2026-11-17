from sqlalchemy.orm import Session

from . import models


def notify(db: Session, user_id: int, title: str, message: str, kind: str = "info") -> models.Notification:
    row = models.Notification(user_id=user_id, title=title, message=message, kind=kind)
    db.add(row)
    return row
