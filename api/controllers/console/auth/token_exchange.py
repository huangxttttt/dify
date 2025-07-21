import jwt
from flask import request
from flask_restful import Resource
from jwt import InvalidTokenError

from services.account_service import AccountService


def verify_a_system_token(a_token, a_user_name):
    """
    校验 A 系统的 token 是否合法，并提取 user_email。

    :param a_token: A 系统的 JWT token
    :param a_user_name: 传入的用户名（用于二次校验）
    :return: (是否有效, user_email)
    """
    secret = "123456"
    try:
        # 解密 token 并验证签名
        payload = jwt.decode(a_token, secret, algorithms=["HS256"])

        # 从 payload 获取用户名
        user_name = payload.get("user_name")
        if not user_name or user_name != a_user_name:
            return False, None

        # 拼接 email
        user_email = f"{user_name}@galaxy.com"
        return True, user_email

    except InvalidTokenError:
        # 解密或签名验证失败
        return False, None
    except Exception as e:
        # 捕获其他潜在异常
        return False, None


class TokenExchangeApi(Resource):
    def post(self):
        data = request.get_json(force=True)
        a_token = data.get("a_token")
        user_name = data.get("user_name")

        if not a_token or not user_name:
            return {"error": "Missing parameters"}, 400

        # 校验 A 系统 token
        is_valid, user_email = verify_a_system_token(a_token, user_name)

        if not is_valid:
            return {"error": "Invalid A system token"}, 401

        # 根据 email 查找 Dify 用户
        user = AccountService.get_user_through_email(user_email)
        if not user:
            return {"error": "User not found"}, 404

        # 生成 Dify 系统的 JWT token
        dify_token = AccountService.get_account_jwt_token(user)

        return {
            "dify_token": dify_token,
            "email": user_email
        }, 200
