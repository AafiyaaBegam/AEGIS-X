import pytest

from backend.app import security_store
from backend.app.engines import simulation_store


class FakeConnection:
    def __init__(self):
        self.committed = False
        self.rolled_back = False
        self.closed = False

    def commit(self):
        self.committed = True

    def rollback(self):
        self.rolled_back = True

    def close(self):
        self.closed = True


@pytest.mark.parametrize(
    "store",
    [security_store, simulation_store],
    ids=["security-store", "simulation-store"],
)
def test_managed_connection_commits_and_closes(monkeypatch, store):
    connection = FakeConnection()
    monkeypatch.setattr(store, "_connect", lambda: connection)

    with store._managed_connection() as opened:
        assert opened is connection

    assert connection.committed is True
    assert connection.rolled_back is False
    assert connection.closed is True


@pytest.mark.parametrize(
    "store",
    [security_store, simulation_store],
    ids=["security-store", "simulation-store"],
)
def test_managed_connection_rolls_back_and_closes_on_error(monkeypatch, store):
    connection = FakeConnection()
    monkeypatch.setattr(store, "_connect", lambda: connection)

    with pytest.raises(RuntimeError, match="test failure"):
        with store._managed_connection():
            raise RuntimeError("test failure")

    assert connection.committed is False
    assert connection.rolled_back is True
    assert connection.closed is True
