"""Supabase sign-in: the browser sends the access token Supabase issued; we only verify it (no passwords here)."""
from __future__ import annotations

import jwt
from fastapi import Header, HTTPException, Request


class AuthError(Exception):
    pass


ASYMMETRIC = ("ES256", "RS256", "EdDSA")


def verify_jwt(token: str, secret: str, audience: str = "authenticated", jwks=None, issuer: str | None = None) -> dict:
    """Supabase signs access tokens either with a shared secret (HS256, older projects) or with an asymmetric key published as JWKS
    (ES256/RS256/EdDSA, newer projects). Which one is decided by the PROJECT's configuration, never by the token: the algorithm named in the
    header only selects between the two keys we hold, and each key may only be used with its own family (no algorithm confusion, no `none`)."""
    try:
        alg = jwt.get_unverified_header(token).get("alg", "")
    except jwt.PyJWTError as e:
        raise AuthError(str(e)) from None
    try:
        if alg == "HS256":
            if not secret:
                raise AuthError("HS256 tokens are not accepted by this project")
            claims = jwt.decode(token, secret, algorithms=["HS256"], audience=audience, **({"issuer": issuer} if issuer else {}))
        elif alg in ASYMMETRIC:
            if jwks is None:
                raise AuthError("asymmetric tokens are not accepted by this project")
            claims = jwt.decode(token, jwks.get_signing_key_from_jwt(token).key, algorithms=[alg], audience=audience, **({"issuer": issuer} if issuer else {}))
        else:
            raise AuthError(f"unsupported algorithm {alg!r}")
    except jwt.PyJWTError as e:
        raise AuthError(str(e)) from None
    if not claims.get("sub"):
        raise AuthError("token has no subject")
    return claims


def _issuer(settings) -> str | None:
    return f"{settings.supabase_url}/auth/v1" if settings.supabase_url else None


def _claims(request: Request, authorization: str | None) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "missing bearer token")
    s = request.app.state.settings
    try:
        return verify_jwt(authorization[7:].strip(), s.supabase_jwt_secret, jwks=request.app.state.jwks, issuer=_issuer(s))
    except AuthError as e:
        raise HTTPException(401, f"invalid token: {e}") from None


def current_user(request: Request, authorization: str | None = Header(default=None)) -> str:
    """FastAPI dependency: the signed-in person's id, or 401. An access issued to an OAuth client (an AI agent, `client_id` claim)
    is refused here: agents reach Speco only through the MCP endpoint, which is read only (D-012)."""
    claims = _claims(request, authorization)
    if claims.get("client_id"):
        raise HTTPException(403, "this access belongs to a connected agent; agents use the MCP endpoint")
    return str(claims["sub"])


def agent_claims(request: Request, authorization: str | None = Header(default=None)) -> dict:
    """The MCP endpoint's dependency: only an access issued to a client a person authorized (it carries `client_id`) is accepted;
    the person's own web session is not (FR-006)."""
    claims = _claims(request, authorization)
    if not claims.get("client_id"):
        raise HTTPException(401, "this endpoint takes the access of a connected client, not a web session")
    return claims
