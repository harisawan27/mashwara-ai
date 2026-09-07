"""Focused tests for Cloud Run IAM signer email resolution."""

import os
import sys
import types
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

# The resolver is pure. Stub heavy Google SDK imports so this unit test never
# initializes ADC, transport, or IAM clients.
google_module = types.ModuleType("google")
cloud_module = types.ModuleType("google.cloud")
storage_module = types.ModuleType("google.cloud.storage")
auth_module = types.ModuleType("google.auth")
credentials_module = types.ModuleType("google.auth.credentials")
transport_module = types.ModuleType("google.auth.transport")
requests_module = types.ModuleType("google.auth.transport.requests")


class _StorageClient:
    pass


class _Signing:
    pass


class _GoogleAuthRequest:
    pass


storage_module.Client = _StorageClient
credentials_module.Signing = _Signing
requests_module.Request = _GoogleAuthRequest
auth_module.default = MagicMock()
google_module.cloud = cloud_module
google_module.auth = auth_module
cloud_module.storage = storage_module
auth_module.credentials = credentials_module
auth_module.transport = transport_module
transport_module.requests = requests_module

sys.modules.update({
    "google": google_module,
    "google.cloud": cloud_module,
    "google.cloud.storage": storage_module,
    "google.auth": auth_module,
    "google.auth.credentials": credentials_module,
    "google.auth.transport": transport_module,
    "google.auth.transport.requests": requests_module,
})

from tools.storage import (
    DEFAULT_RUNTIME_SERVICE_ACCOUNT_EMAIL,
    _resolve_service_account_email,
)


def test_storage_signer_email_resolution() -> None:
    env_email = "explicit-signer@example.iam.gserviceaccount.com"
    credential_email = "adc-signer@example.iam.gserviceaccount.com"

    with patch.dict(os.environ, {"GCS_SERVICE_ACCOUNT_EMAIL": f"  {env_email}  "}, clear=False):
        credentials = MagicMock(service_account_email=credential_email)
        assert _resolve_service_account_email(credentials) == env_email

    with patch.dict(os.environ, {}, clear=True):
        credentials = MagicMock(service_account_email=f"  {credential_email}  ")
        assert _resolve_service_account_email(credentials) == credential_email

        default_credentials = MagicMock(service_account_email="default")
        assert _resolve_service_account_email(default_credentials) == DEFAULT_RUNTIME_SERVICE_ACCOUNT_EMAIL

        missing_email_credentials = MagicMock(service_account_email=None)
        assert _resolve_service_account_email(missing_email_credentials) == DEFAULT_RUNTIME_SERVICE_ACCOUNT_EMAIL


if __name__ == "__main__":
    test_storage_signer_email_resolution()
    print("[PASS] Storage IAM signer email resolution: 4 cases")
