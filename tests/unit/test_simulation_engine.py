from backend.app.engines.simulation_engine import simulate_plan


def test_simulation_preserves_sequence_dependencies_and_never_executes():
    result = simulate_plan([
        "Build the application",
        "Deploy the application to production",
        "Verify application health",
    ])
    assert result["execution_performed"] is False
    assert len(result["dependencies"]) == 2
    assert result["step_count"] == 3


def test_shared_resources_create_heuristic_dependency_edges():
    result = simulate_plan([
        "Create a backup of the production database",
        "Migrate the production database",
        "Verify the production database",
    ])
    assert result["inferred_dependencies"]
    assert any(
        "database" in edge["shared_resources"]
        for edge in result["inferred_dependencies"]
    )
    assert result["dependency_analysis"]["analysis_basis"]
    assert "does not inspect live infrastructure" in result["dependency_analysis"]["limitation"]


def test_downstream_impact_and_blast_radius_are_bounded():
    result = simulate_plan([
        "Update the customer database",
        "Migrate the customer database",
        "Delete customer records from the customer database",
    ])
    assert result["blast_radius_score"] in range(0, 101)
    assert result["potential_blast_radius"] in {"LOW", "MEDIUM", "HIGH"}
    assert result["dependency_analysis"]["downstream_impact"]["1"]["downstream_count"] >= 1


def test_unrelated_actions_do_not_create_shared_resource_edges():
    result = simulate_plan([
        "Review the project documentation",
        "Prepare a presentation about team goals",
    ])
    assert result["inferred_dependencies"] == []
