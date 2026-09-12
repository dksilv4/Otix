from otix.lib.levels import (
    compute_level_info,
    get_level_title,
    get_reputation_tier,
)


def test_get_level_title():
    # Test valid tiers
    assert get_level_title(1) == "Novice"
    assert get_level_title(3) == "Novice"
    assert get_level_title(5) == "Apprentice"
    assert get_level_title(10) == "Adept"
    assert get_level_title(20) == "Expert"
    assert get_level_title(35) == "Master"
    assert get_level_title(50) == "Grandmaster"
    assert get_level_title(75) == "Legend"
    assert get_level_title(100) == "Transcendent"
    assert get_level_title(1000) == "Transcendent"

    # Test out of bounds (should return Novice)
    assert get_level_title(0) == "Novice"
    assert get_level_title(-1) == "Novice"

def test_get_reputation_tier():
    # Test valid tiers
    assert get_reputation_tier(-100) == "Flagged"
    assert get_reputation_tier(100) == "Newcomer"
    assert get_reputation_tier(150) == "Contributor"
    assert get_reputation_tier(250) == "Trusted"
    assert get_reputation_tier(400) == "Respected"
    assert get_reputation_tier(600) == "Elite"
    assert get_reputation_tier(800) == "Pillar"

    # Test out of bounds (should return Newcomer)
    assert get_reputation_tier(1001) == "Newcomer"

def test_compute_level_info():
    # Test compute level info at 0 XP
    info = compute_level_info(0)
    assert info["level"] == 1
    assert info["level_title"] == "Novice"
    assert info["xp_to_next_level"] == 300
    assert info["xp_progress"] == 0.0

    # Test compute level info at 150 XP (level 1 progress)
    info = compute_level_info(150)
    assert info["level"] == 1
    assert info["level_title"] == "Novice"
    assert info["xp_to_next_level"] == 300
    assert info["xp_progress"] == 0.5

    # Test compute level info at 300 XP (level 2)
    info = compute_level_info(300)
    assert info["level"] == 2
    assert info["level_title"] == "Novice"
    assert info["xp_to_next_level"] == 300
    assert info["xp_progress"] == 0.0

    # Test compute level info at 1500 XP (level 6)
    info = compute_level_info(1500)
    assert info["level"] == 6
    assert info["level_title"] == "Apprentice"
    assert info["xp_to_next_level"] == 300
    assert info["xp_progress"] == 0.0
