import base64
import urllib.parse
from dataclasses import dataclass

import httpx


@dataclass
class OAuthUserInfo:
    id: str
    name: str
    email: str


class OAuth:
    def __init__(self, client_id: str,
                 client_secret: str,
                 redirect_uri: str,
                 auth_url: str,
                 token_url: str,
                 user_info_url: str):
        self.client_id = client_id
        self.client_secret = client_secret
        self.redirect_uri = redirect_uri
        self.auth_url = auth_url
        self.token_url = token_url
        self.user_info_url = user_info_url

    def get_authorization_url(self):
        raise NotImplementedError()

    def get_access_token(self, code: str):
        raise NotImplementedError()

    def get_raw_user_info(self, token: str):
        raise NotImplementedError()

    def get_user_info(self, token: str) -> OAuthUserInfo:
        raw_info = self.get_raw_user_info(token)
        return self._transform_user_info(raw_info)

    def _transform_user_info(self, raw_info: dict) -> OAuthUserInfo:
        raise NotImplementedError()


class GalaxyOAuth(OAuth):
    def get_authorization_url(self, invite_token: str | None = None):
        params = {
            "response_type": 'code',
            "client_id": self.client_id,
            "redirect_uri": self.redirect_uri,
            "scope": "read",  # Request only basic user information
        }
        if invite_token:
            params["state"] = invite_token
        return f"{self.auth_url}?{urllib.parse.urlencode(params)}"

    def get_access_token(self, code: str):
        data = {
            "code": code,
            "redirect_uri": self.redirect_uri,
            "grant_type": 'authorization_code',
        }
        auth_string = f"{self.client_id}:{self.client_secret}".encode()
        auth_b64 = base64.b64encode(auth_string).decode("utf-8")
        headers = {
            "Accept": "application/json",
            "Authorization": f"Basic {auth_b64}",
        }
        response = httpx.post(self.token_url, data=data, headers=headers)

        response_json = response.json()
        access_token = response_json.get("access_token")

        if not access_token:
            raise ValueError(f"Error in Galaxy OAuth: {response_json}")

        return access_token

    def get_raw_user_info(self, token: str):
        headers = {"Authorization": f"Galaxy {token}"}
        response = httpx.get(self.user_info_url, headers=headers)
        return response.json()

    def _transform_user_info(self, raw_info: dict) -> OAuthUserInfo:
        userinfo = raw_info.get("data").get("data")
        email = userinfo.get("email")
        if not email:
            email = f"{userinfo['userName']}@galaxy.com"
        return OAuthUserInfo(id=str(userinfo["id"] + 1), name=userinfo["realName"], email=email)


class GitHubOAuth(OAuth):
    _AUTH_URL = "https://github.com/login/oauth/authorize"
    _TOKEN_URL = "https://github.com/login/oauth/access_token"
    _USER_INFO_URL = "https://api.github.com/user"
    _EMAIL_INFO_URL = "https://api.github.com/user/emails"

    def get_authorization_url(self, invite_token: str | None = None):
        params = {
            "client_id": self.client_id,
            "redirect_uri": self.redirect_uri,
            "scope": "user:email",  # Request only basic user information
        }
        if invite_token:
            params["state"] = invite_token
        return f"{self._AUTH_URL}?{urllib.parse.urlencode(params)}"

    def get_access_token(self, code: str):
        data = {
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "code": code,
            "redirect_uri": self.redirect_uri,
        }
        headers = {"Accept": "application/json"}
        response = httpx.post(self._TOKEN_URL, data=data, headers=headers)

        response_json = response.json()
        access_token = response_json.get("access_token")

        if not access_token:
            raise ValueError(f"Error in GitHub OAuth: {response_json}")

        return access_token

    def get_raw_user_info(self, token: str):
        headers = {"Authorization": f"token {token}"}
        response = httpx.get(self._USER_INFO_URL, headers=headers)
        response.raise_for_status()
        user_info = response.json()

        email_response = httpx.get(self._EMAIL_INFO_URL, headers=headers)
        email_info = email_response.json()
        primary_email: dict = next((email for email in email_info if email["primary"] == True), {})

        return {**user_info, "email": primary_email.get("email", "")}

    def _transform_user_info(self, raw_info: dict) -> OAuthUserInfo:
        email = raw_info.get("email")
        if not email:
            email = f"{raw_info['id']}+{raw_info['login']}@users.noreply.github.com"
        return OAuthUserInfo(id=str(raw_info["id"]), name=raw_info["name"], email=email)


class GoogleOAuth(OAuth):
    _AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
    _TOKEN_URL = "https://oauth2.googleapis.com/token"
    _USER_INFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"

    def get_authorization_url(self, invite_token: str | None = None):
        params = {
            "client_id": self.client_id,
            "response_type": "code",
            "redirect_uri": self.redirect_uri,
            "scope": "openid email",
        }
        if invite_token:
            params["state"] = invite_token
        return f"{self._AUTH_URL}?{urllib.parse.urlencode(params)}"

    def get_access_token(self, code: str):
        data = {
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": self.redirect_uri,
        }
        headers = {"Accept": "application/json"}
        response = httpx.post(self._TOKEN_URL, data=data, headers=headers)

        response_json = response.json()
        access_token = response_json.get("access_token")

        if not access_token:
            raise ValueError(f"Error in Google OAuth: {response_json}")

        return access_token

    def get_raw_user_info(self, token: str):
        headers = {"Authorization": f"Bearer {token}"}
        response = httpx.get(self._USER_INFO_URL, headers=headers)
        response.raise_for_status()
        return response.json()

    def _transform_user_info(self, raw_info: dict) -> OAuthUserInfo:
        return OAuthUserInfo(id=str(raw_info["sub"]), name="", email=raw_info["email"])
