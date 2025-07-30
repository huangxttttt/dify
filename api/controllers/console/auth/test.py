import jwt
from jwt import InvalidTokenError


def verify_a_system_token(a_token):
    secret = "123456"
    try:
        # 解密 token 并验证签名
        payload = jwt.decode(a_token, secret, algorithms=["HS256"])

        # 从 payload 中获取 email 字段
        user_email = payload.get("user_name")
        if not user_email:
            return False, None

        # 校验通过，返回 True 和 email
        return True, user_email

    except InvalidTokenError as e:
        # 解密或签名验证失败
        return False, None

if __name__ == '__main__':
    token = ('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'
             '.eyJyb2xlIjoiTVBCRF9BRE1JTixjb21tb24sSlpfQURNSU4sc3V4LGRhdGFfemwiLCJ1c2VyX25hbWUiOiJCRDAwMDYiLCJjZXJ0X2NvZGUiOiIwMDAwMDAwMDAwMCIsInJlYW'
             'xfbmFtZSI6IkJEMDAwNiIsImF1dGhvcml0aWVzIjpbIkpaX0FETUlOIiwiZGF0YV96bCIsIk1QQkRfQURNSU4iLCJjb21tb24iLCJzdXgiXSwiY2xpZW50X2lkIjoidGVzdF9jbG'
             'llbnQiLCJ1bml0X25hbWUiOiLov5DokKXlm6LpmJ8iLCJ1c2VyX2lkIjo5OTU0LCJzY29wZSI6WyJyZWFkIl0sInVuaXRfY29kZSI6IjAxMDAwMDAw'
             'MDAwMCIsImV4cCI6MTc1MjcwODc4MywianRpIjoiVDViRVp4Q3lsTC0wQnM0SG82OFlEbnhHOWZ3IiwiZ3JvdXAiOm51bGx9.Y8pOpDLx3dD7KbTJPz43WgxaAGs5H55wzeAirs9LNrg')
    verify_a_system_token(token)
