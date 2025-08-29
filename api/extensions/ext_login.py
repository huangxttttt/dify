import json

# import logging
import flask_login  # type: ignore
import jwt
from flask import Response, request
from flask_login import user_loaded_from_request, user_logged_in
from werkzeug.exceptions import NotFound, Unauthorized

# import requests
from configs import dify_config
from constants.languages import languages
from controllers.console.auth.oauth import _get_account_by_openid_or_email
from dify_app import DifyApp
from extensions.ext_database import db
from libs.oauth import OAuthUserInfo
from libs.passport import PassportService
from models import TenantAccountRole
from models.account import Account, Tenant, TenantAccountJoin
from models.model import AppMCPServer, EndUser
from services.account_service import AccountService, RegisterService, TenantService
from services.errors.account import AccountNotFoundError, TenantNotFoundError
from services.feature_service import FeatureService

login_manager = flask_login.LoginManager()


# Flask-Login configuration
@login_manager.request_loader
def load_user_from_request(request_from_flask_login):
    """Load user based on the request."""
    # Skip authentication for documentation endpoints
    if dify_config.SWAGGER_UI_ENABLED and request.path.endswith((dify_config.SWAGGER_UI_PATH, "/swagger.json")):
        return None

    auth_header = request.headers.get("Authorization", "")
    auth_token: str | None = None
    galaxy_auth_token: str | None = None
    if auth_header:
        if " " not in auth_header:
            raise Unauthorized("Invalid Authorization header format. Expected 'Bearer <api-key>' format.")
        auth_scheme, auth_token = auth_header.split(maxsplit=1)
        auth_scheme = auth_scheme.lower()
        if auth_scheme != "bearer":
            raise Unauthorized("Invalid Authorization header format. Expected 'Bearer <api-key>' format.")
    else:
        auth_token = request.args.get("_token")
    galaxy_auth_token = request.args.get("galaxy_token")

    galaxy_account: str | None = None
    if galaxy_auth_token:
        provider = "galaxy"

        # 解密 token 并验证签名
        try:
            payload = jwt.decode(galaxy_auth_token, "123456", algorithms=["HS256"])
        except jwt.exceptions.ExpiredSignatureError:
            raise Unauthorized("Token has expired.")
        except jwt.exceptions.InvalidSignatureError:
            raise Unauthorized("Invalid token signature.")
        except jwt.exceptions.DecodeError:
            raise Unauthorized("Invalid token.")
        except jwt.exceptions.PyJWTError:  # Catch-all for other JWT errors
            raise Unauthorized("Invalid token.")
        # 从 payload 获取用户名
        user_name = payload.get("user_name")
        user_id = payload.get("user_id")
        user_email = f"{user_name}@galaxy.com"
        auth_user_info = OAuthUserInfo(id=str(user_id + 1), name=user_name, email=user_email)
        # galaxy 用户处理
        galaxy_account = handle_galaxy_user(provider, auth_user_info)

    # Check for admin API key authentication first
    if dify_config.ADMIN_API_KEY_ENABLE and auth_header:
        admin_api_key = dify_config.ADMIN_API_KEY
        if admin_api_key and admin_api_key == auth_token:
            workspace_id = request.headers.get("X-WORKSPACE-ID")
            if workspace_id:
                tenant_account_join = (
                    db.session.query(Tenant, TenantAccountJoin)
                    .where(Tenant.id == workspace_id)
                    .where(TenantAccountJoin.tenant_id == Tenant.id)
                    .where(TenantAccountJoin.role == "owner")
                    .one_or_none()
                )
                if tenant_account_join:
                    tenant, ta = tenant_account_join
                    account = db.session.query(Account).filter_by(id=ta.account_id).first()
                    if account:
                        account.current_tenant = tenant
                        return account

    if request.blueprint in {"console", "inner_api"}:
        # 如果有galaxy token则直接认证通过
        if galaxy_auth_token:
            logged_in_account = AccountService.load_logged_in_account(account_id=galaxy_account.id)
            return logged_in_account

        if not auth_token:
            raise Unauthorized("Invalid Authorization token.")
        decoded = PassportService().verify(auth_token)
        user_id = decoded.get("user_id")
        source = decoded.get("token_source")
        if source:
            raise Unauthorized("Invalid Authorization token.")
        if not user_id:
            raise Unauthorized("Invalid Authorization token.")

        logged_in_account = AccountService.load_logged_in_account(account_id=user_id)
        return logged_in_account
    elif request.blueprint == "web":
        decoded = PassportService().verify(auth_token)
        end_user_id = decoded.get("end_user_id")
        if not end_user_id:
            raise Unauthorized("Invalid Authorization token.")
        end_user = db.session.query(EndUser).where(EndUser.id == decoded["end_user_id"]).first()
        if not end_user:
            raise NotFound("End user not found.")
        return end_user
    elif request.blueprint == "mcp":
        server_code = request.view_args.get("server_code") if request.view_args else None
        if not server_code:
            raise Unauthorized("Invalid Authorization token.")
        app_mcp_server = db.session.query(AppMCPServer).where(AppMCPServer.server_code == server_code).first()
        if not app_mcp_server:
            raise NotFound("App MCP server not found.")
        end_user = (
            db.session.query(EndUser)
            .where(EndUser.external_user_id == app_mcp_server.id, EndUser.type == "mcp")
            .first()
        )
        if not end_user:
            raise NotFound("End user not found.")
        return end_user


def handle_galaxy_user(provider: str, user_info: OAuthUserInfo) -> Account:
    account = _get_account_by_openid_or_email(provider, user_info)
    if not account:
        # 新增用户
        if not FeatureService.get_system_features().is_allow_register:
            raise AccountNotFoundError()
        account_name = user_info.name or "Dify"
        account = RegisterService.register(
            email=user_info.email, name=account_name, password="as@123789", open_id=user_info.id, provider=provider,
            create_workspace_required=False
        )

        # Set interface language
        preferred_lang = request.accept_languages.best_match(languages)
        if preferred_lang and preferred_lang in languages:
            interface_language = preferred_lang
        else:
            interface_language = languages[0]
        account.interface_language = interface_language
        db.session.commit()

        # 加入管理员的工作区
        tenant = db.session.query(Tenant).filter_by(name="admin's Workspace").first()
        if not tenant:
            raise TenantNotFoundError("admin’s Tenant not found.")
        if not TenantService.is_member(account, tenant):
            ta = TenantAccountJoin(tenant_id=tenant.id, account_id=account.id, role=TenantAccountRole.ADMIN.value)
            db.session.add(ta)
    return account


@user_logged_in.connect
@user_loaded_from_request.connect
def on_user_logged_in(_sender, user):
    """Called when a user logged in.

    Note: AccountService.load_logged_in_account will populate user.current_tenant_id
    through the load_user method, which calls account.set_tenant_id().
    """
    # tenant_id context variable removed - using current_user.current_tenant_id directly
    pass


@login_manager.unauthorized_handler
def unauthorized_handler():
    """Handle unauthorized requests."""
    return Response(
        json.dumps({"code": "unauthorized", "message": "Unauthorized."}),
        status=401,
        content_type="application/json",
    )


def init_app(app: DifyApp):
    login_manager.init_app(app)

