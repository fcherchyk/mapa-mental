"""Google user sign-in: the first login creates the user, their map and the root (ADR 0008)."""

from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.auth.google import GoogleIdentity
from app.auth.sessions import create_session
from app.models import Map, Node, User
from app.node_types import DEFAULT_KIND
from app.nodes.schemas import TITLE_MAX_LENGTH
from app.nodes.sort_keys import key_between

DEFAULT_ROOT_TITLE = "My map"


def sign_in(
    session_factory: sessionmaker[Session], identity: GoogleIdentity, ttl: timedelta
) -> str:
    """Creates or updates the user, opens a session and returns the cookie token."""
    with session_factory() as db:
        user = db.scalar(select(User).where(User.google_sub == identity.sub))
        if user is None:
            user = create_user_with_map(db, identity)
        else:
            user.email = identity.email
            user.name = identity.name
            user.avatar_url = identity.avatar_url
        token = create_session(db, user.id, ttl)
        db.commit()
        return token


def create_user_with_map(db: Session, identity: GoogleIdentity) -> User:
    user = User(
        google_sub=identity.sub,
        email=identity.email,
        name=identity.name,
        avatar_url=identity.avatar_url,
    )
    db.add(user)
    db.flush()
    user_map = Map(owner_id=user.id)
    db.add(user_map)
    db.flush()
    root = Node(
        map_id=user_map.id,
        parent_id=None,
        kind=DEFAULT_KIND,
        title=root_title(identity),
        sort_key=key_between(None, None),
        collapsed=False,
        props={},
    )
    db.add(root)
    db.flush()
    user_map.root_node_id = root.id
    return user


def root_title(identity: GoogleIdentity) -> str:
    title = " ".join(identity.name.split())[:TITLE_MAX_LENGTH].strip()
    return title or DEFAULT_ROOT_TITLE
