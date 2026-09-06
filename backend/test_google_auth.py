import asyncio
import sys
import os
from unittest.mock import patch

# Load environment before any app imports
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), ".")))

from httpx import AsyncClient, ASGITransport
from main import app, GOOGLE_CLIENT_ID
from database import engine, Base, AsyncSessionLocal
from models.user import User
from sqlalchemy import text, select

TEST_CLIENT_ID = "971578232755-a7f5t6c31if3k69t9udurfiac48nnjj3.apps.googleusercontent.com"

async def test_all_google_auth_security_scenarios():
    print("\n--- RUNNING GOOGLE AUTH SECURITY TEST SUITE ---", flush=True)

    # Ensure tables exist in active DB
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    transport = ASGITransport(app=app)
    
    # 1. Reject empty credential
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        r = await ac.post("/auth/google", json={"credential": ""})
        assert r.status_code == 400, f"Expected 400 for empty credential, got {r.status_code}"
        assert "credential is required" in r.json()["detail"]
        print("PASS 1: Empty credential rejected (400)", flush=True)

    # 2. Reject invalid signature
    with patch("google.oauth2.id_token.verify_oauth2_token") as mock_verify:
        mock_verify.side_effect = ValueError("Invalid signature.")
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.post("/auth/google", json={"credential": "tampered_token"})
            assert r.status_code == 401, f"Expected 401, got {r.status_code}"
            assert "Invalid Google credential" in r.json()["detail"]
            print("PASS 2: Invalid signature rejected (401)", flush=True)

    # 3. Reject wrong audience
    with patch("google.oauth2.id_token.verify_oauth2_token") as mock_verify:
        mock_verify.side_effect = ValueError(f"Token used with wrong audience. Expected {TEST_CLIENT_ID}")
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.post("/auth/google", json={"credential": "wrong_aud_token"})
            assert r.status_code == 401, f"Expected 401, got {r.status_code}"
            assert "wrong audience" in r.json()["detail"].lower()
            print("PASS 3: Wrong audience rejected (401)", flush=True)

    # 4. Reject expired token
    with patch("google.oauth2.id_token.verify_oauth2_token") as mock_verify:
        mock_verify.side_effect = ValueError("Token expired.")
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.post("/auth/google", json={"credential": "expired_token"})
            assert r.status_code == 401, f"Expected 401, got {r.status_code}"
            assert "expired" in r.json()["detail"].lower()
            print("PASS 4: Expired token rejected (401)", flush=True)

    # 5. Reject invalid issuer
    with patch("google.oauth2.id_token.verify_oauth2_token") as mock_verify:
        mock_verify.return_value = {
            "iss": "https://malicious-issuer.com",
            "sub": "sub-123",
            "email": "user@example.com",
            "email_verified": True,
            "aud": TEST_CLIENT_ID
        }
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.post("/auth/google", json={"credential": "fake_issuer_token"})
            assert r.status_code == 401, f"Expected 401, got {r.status_code}"
            assert "Invalid Google token issuer" in r.json()["detail"]
            print("PASS 5: Invalid issuer rejected (401)", flush=True)

    # 6. Reject missing sub
    with patch("google.oauth2.id_token.verify_oauth2_token") as mock_verify:
        mock_verify.return_value = {
            "iss": "https://accounts.google.com",
            "email": "nosub@example.com",
            "email_verified": True,
            "aud": TEST_CLIENT_ID
        }
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.post("/auth/google", json={"credential": "valid_token_missing_sub"})
            assert r.status_code == 400, f"Expected 400, got {r.status_code}"
            assert "Missing Google identity" in r.json()["detail"]
            print("PASS 6: Missing sub rejected (400)", flush=True)

    # 7. Reject missing email
    with patch("google.oauth2.id_token.verify_oauth2_token") as mock_verify:
        mock_verify.return_value = {
            "iss": "https://accounts.google.com",
            "sub": "sub-no-email",
            "email_verified": True,
            "aud": TEST_CLIENT_ID
        }
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.post("/auth/google", json={"credential": "valid_token_missing_email"})
            assert r.status_code == 400, f"Expected 400, got {r.status_code}"
            assert "Missing email" in r.json()["detail"]
            print("PASS 7: Missing email rejected (400)", flush=True)

    # 8. Reject unverified email
    with patch("google.oauth2.id_token.verify_oauth2_token") as mock_verify:
        mock_verify.return_value = {
            "iss": "https://accounts.google.com",
            "sub": "sub-unverified",
            "email": "unverified@example.com",
            "email_verified": False,
            "aud": TEST_CLIENT_ID
        }
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.post("/auth/google", json={"credential": "valid_token_unverified_email"})
            assert r.status_code == 400, f"Expected 400, got {r.status_code}"
            assert "email address is not verified" in r.json()["detail"]
            print("PASS 8: Unverified email rejected (400)", flush=True)

    # Test user resolution scenarios:
    unique_suffix = os.urandom(4).hex()
    new_sub = f"google-sub-fresh-{unique_suffix}"
    new_email = f"freshuser_{unique_suffix}@example.com"
    new_name = "Fresh Google User"
    new_pic = "https://example.com/avatar_fresh.png"

    # 9. New Google User Resolution (Case C)
    with patch("google.oauth2.id_token.verify_oauth2_token") as mock_verify:
        mock_verify.return_value = {
            "iss": "https://accounts.google.com",
            "sub": new_sub,
            "email": new_email,
            "email_verified": True,
            "name": new_name,
            "picture": new_pic,
            "aud": TEST_CLIENT_ID
        }
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.post("/auth/google", json={"credential": "valid_fresh_user_token"})
            assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
            data = r.json()
            assert "access_token" in data
            assert data["token_type"] == "bearer"
            assert data["user"]["email"] == new_email
            user_id = data["user"]["id"]
            print("PASS 9: New Google user created successfully with JWT returned", flush=True)

            # Verify in DB: hashed_password MUST be NULL for Google-only user
            async with AsyncSessionLocal() as session:
                u_res = await session.execute(select(User).filter(User.id == user_id))
                u = u_res.scalars().first()
                assert u is not None
                assert u.google_sub == new_sub
                assert u.hashed_password is None, f"Expected NULL hashed_password, got {u.hashed_password}"
                print("PASS 9b: Verified in DB: hashed_password IS NULL and google_sub is stored", flush=True)

    # 10. Audit: Verify Google-only user cannot authenticate via password login
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        r = await ac.post("/auth/login", json={"email": new_email, "password": "any_random_password"})
        assert r.status_code == 401, f"Expected 401 for password login of Google user, got {r.status_code}"
        assert "Incorrect email or password" in r.json()["detail"]
        print("PASS 10: Google user with NULL password cannot login via password (401)", flush=True)

    # 11. Existing google_sub Resolution (Case A - Same User Reused)
    with patch("google.oauth2.id_token.verify_oauth2_token") as mock_verify:
        mock_verify.return_value = {
            "iss": "https://accounts.google.com",
            "sub": new_sub,
            "email": new_email,
            "email_verified": True,
            "name": new_name + " Updated",
            "picture": new_pic,
            "aud": TEST_CLIENT_ID
        }
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.post("/auth/google", json={"credential": "valid_token_existing_sub"})
            assert r.status_code == 200
            data = r.json()
            assert data["user"]["id"] == user_id, "Expected same user ID to be reused"
            print("PASS 11: Existing google_sub correctly reused existing user (Case A)", flush=True)

    # 12. Existing matching verified email without google_sub (Case B - Link Sub)
    legacy_suffix = os.urandom(4).hex()
    legacy_email = f"legacy_{legacy_suffix}@example.com"
    legacy_sub = f"google-sub-legacy-{legacy_suffix}"

    async with AsyncSessionLocal() as session:
        # Pre-provision an existing user without google_sub
        legacy_user = User(
            id=f"legacy-user-uuid-{legacy_suffix}",
            email=legacy_email,
            hashed_password="some_bcrypt_hash",
            google_sub=None,
            profile_data={"name": "Legacy Account"}
        )
        session.add(legacy_user)
        await session.commit()

    with patch("google.oauth2.id_token.verify_oauth2_token") as mock_verify:
        mock_verify.return_value = {
            "iss": "https://accounts.google.com",
            "sub": legacy_sub,
            "email": legacy_email,
            "email_verified": True,
            "name": "Legacy Account",
            "picture": "",
            "aud": TEST_CLIENT_ID
        }
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.post("/auth/google", json={"credential": "valid_token_link_email"})
            assert r.status_code == 200
            data = r.json()
            assert data["user"]["id"] == f"legacy-user-uuid-{legacy_suffix}"
            
            # Verify google_sub was linked in DB
            async with AsyncSessionLocal() as session:
                u_res = await session.execute(select(User).filter(User.email == legacy_email))
                u = u_res.scalars().first()
                assert u.google_sub == legacy_sub, f"Expected google_sub linked, got {u.google_sub}"
                # Legacy password hash must remain intact
                assert u.hashed_password == "some_bcrypt_hash"
                print("PASS 12: Existing email matched and linked google_sub without password disturbance (Case B)", flush=True)

    # 13. Duplicate Prevention Test: repeated calls do not create duplicate records
    async with AsyncSessionLocal() as session:
        count_res = await session.execute(select(User).filter(User.google_sub == new_sub))
        users_found = count_res.scalars().all()
        assert len(users_found) == 1, f"Expected exactly 1 user with sub {new_sub}, found {len(users_found)}"
        print("PASS 13: Duplicate prevention verified (exactly 1 user record per sub)", flush=True)

    # Clean up test rows
    async with AsyncSessionLocal() as session:
        await session.execute(text("DELETE FROM users WHERE email IN (:e1, :e2)"), {"e1": new_email, "e2": legacy_email})
        await session.commit()
    print("Test users cleaned up.", flush=True)

    print("\n=======================================================", flush=True)
    print("ALL 13 GOOGLE AUTH SECURITY & RESOLUTION TESTS PASSED!", flush=True)
    print("=======================================================\n", flush=True)

if __name__ == "__main__":
    asyncio.run(test_all_google_auth_security_scenarios())
