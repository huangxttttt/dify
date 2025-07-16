import jwt
from flask import request
from flask_restful import Resource
from jwt import InvalidTokenError

from services.account_service import AccountService


# 你需要实现这个函数，校验A系统的token是否合法
def verify_a_system_token(a_token):
    secret = "123456"
    try:
        # 解密 token 并验证签名
        payload = jwt.decode(a_token, secret, algorithms=["HS256"])

        # 从 payload 中获取 email 字段
        user_name = payload.get("user_name")
        if not user_name:
            return False, None
        user_email = f"{user_name}@galaxy.com"
        # 校验通过，返回 True 和 email
        return True, user_email

    except InvalidTokenError as e:
        # 解密或签名验证失败
        return False, None


class TokenExchangeApi(Resource):
    def post(self):
        data = request.get_json()
        a_token = data.get("a_token")

        # 校验并解析 token，获取 email
        is_valid, user_email = verify_a_system_token(a_token)

        if not is_valid:
            return {"error": "Invalid A system token"}, 401

        # 查找 Dify 用户
        user = AccountService.get_user_through_email(user_email)
        if not user:
            return {"error": "User not found"}, 404

        # 生成 Dify JWT token
        dify_token = AccountService.get_account_jwt_token(user)

        # 返回结果中拼接解析出来的 email
        return {
            "dify_token": dify_token,
            "email": user_email
        }, 200
