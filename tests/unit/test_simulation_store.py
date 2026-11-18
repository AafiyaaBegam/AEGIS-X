import sqlite3

import pytest

from backend.app.engines import simulation_store


@pytest.fixture
def isolated_store(tmp_path, monkeypatch):
    monkeypatch.setattr(
        simulation_store,
        "SIMULATION_DB_PATH",
        tmp_path / "test_simulation.db",
    )
    return simulation_store


def sample_result():
    return {
        "decision": "ALLOW",
        "overall_risk_score": 8,
        "execution_performed": False,
    }


def test_simulation_is_persisted(isolated_store):
    record_id = isolated_store.record_simulation(
        ["Read public service health status"],
        sample_result(),
    )

    records = isolated_store.list_simulations()

    assert record_id == 1
    assert len(records) == 1
    assert records[0]["actions"] == ["Read public service health status"]
    assert records[0]["decision"] == "ALLOW"
    assert records[0]["execution_performed"] is False


def test_simulation_records_cannot_be_updated(isolated_store):
    isolated_store.record_simulation(["Read status"], sample_result())

    with sqlite3.connect(isolated_store.SIMULATION_DB_PATH) as connection:
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                "UPDATE simulation_records SET decision = 'BLOCK' WHERE id = 1"
            )


def test_simulation_records_cannot_be_deleted(isolated_store):
    isolated_store.record_simulation(["Read status"], sample_result())

    with sqlite3.connect(isolated_store.SIMULATION_DB_PATH) as connection:
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute("DELETE FROM simulation_records WHERE id = 1")


def test_executed_result_cannot_be_stored(isolated_store):
    result = sample_result()
    result["execution_performed"] = True

    with pytest.raises(ValueError):
        isolated_store.record_simulation(["Deploy application"], result)


@pytest.mark.parametrize("limit", [0, -1, 501, True, "10"])
def test_invalid_history_limits_are_rejected(isolated_store, limit):
    with pytest.raises(ValueError):
        isolated_store.list_simulations(limit)


def test_empty_history_does_not_create_database(isolated_store):
    assert isolated_store.list_simulations() == []
    assert not isolated_store.SIMULATION_DB_PATH.exists()
