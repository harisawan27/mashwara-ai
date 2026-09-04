import asyncio
import sys
import os
sys.path.append("backend")

from httpx import AsyncClient, ASGITransport
from main import app
from database import engine
from sqlalchemy import text

async def test_neon_exchange_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Test neon config endpoint
        r = await ac.get("/auth/neon/config")
        print("GET /auth/neon/config ->", r.status_code, r.json())
        assert r.status_code == 200
        assert "neon_auth_url" in r.json()
        assert r.json()["neon_auth_jwks_url"].endswith(".json")

        # 2. Test exchange with empty token -> must be 401
        r = await ac.post("/auth/neon/exchange", json={"session_token": ""})
        print("POST /auth/neon/exchange (empty) ->", r.status_code, r.json())
        assert r.status_code == 401

        # 3. Test exchange with 'recent' fallback -> must be 401 (verifies fallback was removed!)
        r = await ac.post("/auth/neon/exchange", json={"session_token": "recent"})
        print("POST /auth/neon/exchange ('recent') ->", r.status_code, r.json())
        assert r.status_code == 401
        assert "Valid user-bound Neon Auth credential is required" in r.json()["detail"]

        # 4. Test exchange with invalid token -> must be 401
        r = await ac.post("/auth/neon/exchange", json={"session_token": "invalid_fake_token_12345"})
        print("POST /auth/neon/exchange (invalid) ->", r.status_code, r.json())
        assert r.status_code == 401

        # 5. Test exchange with real unexpired session from database
        async with engine.connect() as conn:
            res = await conn.execute(text("""
                SELECT s.token, u.email 
                FROM neon_auth.session s
                JOIN neon_auth.user u ON s."userId" = u.id
                WHERE s."expiresAt" > NOW()
                ORDER BY s."createdAt" DESC LIMIT 1;
            """))
            row = res.fetchone()
            if row:
                real_token, email = row[0], row[1]
                r = await ac.post("/auth/neon/exchange", json={"session_token": real_token})
                print(f"POST /auth/neon/exchange (real active token for {email}) ->", r.status_code)
                assert r.status_code == 200
                data = r.json()
                assert "access_token" in data
                assert data["user"]["email"] == email
                print("SUCCESS: Exchanged real user session for Mashwara JWT token!")
            else:
                print("No active session in DB to test valid exchange (all previous sessions expired).")

    print("\nALL NEON AUTH EXCHANGE TESTS PASSED!")

if __name__ == "__main__":
    asyncio.run(test_neon_exchange_endpoint())
