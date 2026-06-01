from __future__ import annotations

import os
from dataclasses import dataclass, field

# ── Environment ──────────────────────────────────────────

API_BASE_URL = os.getenv("BOT_API_BASE_URL", "http://localhost:8000/api")
API_TIMEOUT = int(os.getenv("BOT_API_TIMEOUT", "30"))
BOT_COUNT = int(os.getenv("BOT_COUNT", "10000"))
BOT_ACTIVE_POOL = int(os.getenv("BOT_ACTIVE_POOL", "150"))
BOT_ACTION_BURST = int(os.getenv("BOT_ACTION_BURST", "3"))
BOT_COOLDOWN_MIN = float(os.getenv("BOT_COOLDOWN_MIN", "150.0"))
BOT_COOLDOWN_MAX = float(os.getenv("BOT_COOLDOWN_MAX", "300.0"))
DELAY_MIN = float(os.getenv("BOT_DELAY_MIN", "3.0"))
DELAY_MAX = float(os.getenv("BOT_DELAY_MAX", "15.0"))
STARTUP_STAGGER = float(os.getenv("BOT_STARTUP_STAGGER", "120.0"))
MAX_BROWSE_PAGES = int(os.getenv("BOT_MAX_BROWSE_PAGES", "3"))

# httpx connection pool — shared across all bots
HTTP_POOL_LIMIT = int(os.getenv("BOT_HTTP_POOL_LIMIT", "300"))
HTTP_POOL_PER_HOST = int(os.getenv("BOT_HTTP_POOL_PER_HOST", "200"))

# ── Name pools ───────────────────────────────────────────

FIRST_NAMES: list[str] = [
    "James", "Mary", "Robert", "Patricia", "John", "Jennifer", "Michael", "Linda",
    "David", "Barbara", "William", "Elizabeth", "Richard", "Susan", "Joseph", "Jessica",
    "Thomas", "Sarah", "Christopher", "Karen", "Charles", "Lisa", "Daniel", "Nancy",
    "Matthew", "Betty", "Anthony", "Margaret", "Mark", "Sandra", "Donald", "Ashley",
    "Steven", "Kimberly", "Paul", "Emily", "Andrew", "Donna", "Joshua", "Michelle",
    "Kenneth", "Carol", "Kevin", "Amanda", "Brian", "Dorothy", "George", "Melissa",
    "Timothy", "Deborah", "Ronald", "Stephanie", "Edward", "Rebecca", "Jason", "Sharon",
    "Jeffrey", "Laura", "Ryan", "Cynthia", "Jacob", "Kathleen", "Gary", "Amy",
    "Nicholas", "Angela", "Eric", "Shirley", "Jonathan", "Anna", "Stephen", "Brenda",
    "Larry", "Pamela", "Justin", "Emma", "Scott", "Nicole", "Brandon", "Helen",
    "Benjamin", "Samantha", "Samuel", "Katherine", "Raymond", "Christine", "Gregory", "Debra",
    "Frank", "Rachel", "Alexander", "Carolyn", "Patrick", "Janet", "Jack", "Catherine",
    "Dennis", "Maria", "Jerry", "Heather", "Tyler", "Diane", "Aaron", "Ruth",
    "Jose", "Julie", "Adam", "Olivia", "Nathan", "Joyce", "Henry", "Virginia",
    "Douglas", "Victoria", "Zachary", "Kelly", "Peter", "Lauren", "Kyle", "Christina",
    "Ethan", "Joan", "Walter", "Evelyn", "Noah", "Judith", "Jeremy", "Megan",
    "Christian", "Andrea", "Keith", "Cheryl", "Roger", "Hannah", "Terry", "Jacqueline",
    "Gerald", "Martha", "Harold", "Gloria", "Sean", "Teresa", "Austin", "Ann",
    "Carl", "Sara", "Arthur", "Madison", "Lawrence", "Frances", "Dylan", "Kathryn",
    "Jesse", "Janice", "Jordan", "Jean", "Bryan", "Abigail", "Billy", "Alice",
    "Bruce", "Julia", "Gabriel", "Judy", "Logan", "Sophia", "Albert", "Grace",
    "Willie", "Denise", "Alan", "Amber", "Juan", "Doris", "Wayne", "Marilyn",
    "Elijah", "Beverly", "Randy", "Danielle", "Roy", "Theresa", "Vincent", "Diana",
    "Ralph", "Natalie", "Bobby", "Brittany", "Russell", "Charlotte", "Bradley", "Marie",
    "Philip", "Kayla", "Eugene", "Alexis", "Carlos", "Lori", "Martin", "Isabella",
    "Shawn", "Tiffany", "Louis", "Ava", "Chris", "Harper", "Johnny", "Ella",
    "Howard", "Mia", "Dale", "Lily", "Curtis", "Aria", "Fred", "Scarlett",
    "Jimmy", "Zoey", "Travis", "Luna", "Lee", "Penelope", "Stanley", "Layla",
    "Melvin", "Riley", "Francis", "Chloe", "Herbert", "Nora", "Edwin", "Ellie",
    "Derek", "Avery", "Warren", "Mila", "Darrell", "Aubrey", "Jeremiah", "Hazel",
    "Devin", "Violet", "Garrett", "Aurora", "Corey", "Savannah", "Oscar", "Audrey",
    "Shane", "Brooklyn", "Rick", "Claire", "Mason", "Skylar", "Landon", "Lucy",
    "Carter", "Paisley", "Miles", "Everly", "Cooper", "Anna", "Parker", "Caroline",
    "Grayson", "Nova", "Hudson", "Genesis", "Easton", "Emilia", "Bryson", "Kennedy",
    "Colton", "Samantha", "Nolan", "Maya", "Jaxon", "Willow", "Carson", "Kinsley",
    "Asher", "Naomi", "Ian", "Eliana", "Tristan", "Peyton", "Blake", "Mariah",
    "Cole", "Faith", "Chase", "Vivian", "Maxwell", "Lydia", "Ryder", "Ruby",
    "Leo", "Quinn", "Ezra", "Raelynn", "Adrian", "Madelyn", "Damian", "Autumn",
    "Axel", "Jade", "Beau", "Isabelle", "Jasper", "Iris", "Finn", "Valentina",
    "Kai", "Jocelyn", "Theo", "Ariana", "Rowan", "Emery", "Silas", "Adeline",
    "Felix", "Leah", "Atlas", "Piper", "Orion", "Rylee", "Phoenix", "Athena",
]

LAST_NAMES: list[str] = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
    "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson",
    "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson",
    "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson", "Walker",
    "Young", "Allen", "King", "Wright", "Scott", "Torres", "Nguyen", "Hill",
    "Flores", "Green", "Adams", "Nelson", "Baker", "Hall", "Rivera", "Campbell",
    "Mitchell", "Carter", "Roberts", "Gomez", "Phillips", "Evans", "Turner", "Diaz",
    "Parker", "Cruz", "Edwards", "Collins", "Reyes", "Stewart", "Morris", "Morales",
    "Murphy", "Cook", "Rogers", "Gutierrez", "Ortiz", "Morgan", "Cooper", "Peterson",
    "Bailey", "Reed", "Kelly", "Howard", "Ramos", "Kim", "Cox", "Ward",
    "Richardson", "Watson", "Brooks", "Chavez", "Wood", "James", "Bennett", "Gray",
    "Mendoza", "Ruiz", "Hughes", "Price", "Alvarez", "Castillo", "Sanders", "Patel",
    "Myers", "Long", "Ross", "Foster", "Jimenez", "Powell", "Jenkins", "Perry",
    "Russell", "Sullivan", "Bell", "Coleman", "Butler", "Henderson", "Barnes", "Fisher",
    "Vasquez", "Simmons", "Romero", "Jordan", "Patterson", "Alexander", "Hamilton",
    "Graham", "Reynolds", "Griffin", "Wallace", "Moreno", "West", "Cole", "Hayes",
    "Bryant", "Herrera", "Gibson", "Ellis", "Tran", "Medina", "Aguilar", "Stevens",
    "Murray", "Ford", "Castro", "Marshall", "Owens", "Harrison", "Fernandez", "Mcdonald",
    "Woods", "Washington", "Kennedy", "Wells", "Vargas", "Henry", "Chen", "Freeman",
    "Webb", "Tucker", "Guzman", "Burns", "Crawford", "Olson", "Simpson", "Porter",
    "Hunter", "Gordon", "Mendez", "Silva", "Shaw", "Snyder", "Mason", "Dixon",
    "Munoz", "Hunt", "Hicks", "Holmes", "Palmer", "Wagner", "Black", "Robertson",
    "Boyd", "Rose", "Stone", "Salazar", "Fox", "Warren", "Mills", "Meyer",
    "Rice", "Schmidt", "Garza", "Daniels", "Ferguson", "Nichols", "Stephens", "Soto",
    "Weaver", "Ryan", "Gardner", "Payne", "Grant", "Dunn", "Kelley", "Spencer",
    "Hawkins", "Arnold", "Fisher", "Wheeler", "Ray", "Perkins", "Hudson", "Harper",
    "Lynch", "Bishop", "Montgomery", "Bradley", "Carroll", "Riley", "Fuller", "Larson",
    "Frazier", "Hansen", "Hart", "Pearson", "Cunningham", "Barrett", "Little", "Burke",
    "Chapman", "Richards", "Williamson", "Garrett", "Obrien", "Wade", "Newman", "Haynes",
    "Hoffman", "Schneider", "Maxwell", "Brewer", "Walton", "Maldonado", "Valdez", "Pena",
    "Glover", "Mcbride", "Strickland", "Neal", "Franklin", "Wong", "Park", "Brady",
    "Mckinney", "Mccarthy", "Chambers", "Aguirre", "Becker", "Mathis", "Moss", "Pittman",
    "Conner", "Mann", "Gilbert", "Rojas", "Hale", "Rhodes", "Atkins", "Christensen",
    "Klein", "Massey", "Summers", "Jacobs", "Yang", "Carrillo", "Oneill", "Cantu",
    "Deleon", "Greer", "Todd", "Page", "Floyd", "Osborne", "Ramsey", "Shaffer",
    "Hubbard", "Logan", "Blair", "Davenport", "Cross", "Benson", "Bartlett", "Carson",
]

# ── Personality archetypes ───────────────────────────────

@dataclass
class Personality:
    name: str
    description: str
    # Override base action weights
    action_weights: dict[str, float] = field(default_factory=dict)
    # Preferred media types (higher weight = more likely to browse/search)
    media_type_weights: dict[str, float] = field(default_factory=dict)
    # Preferred genres
    favorite_genres: list[str] = field(default_factory=list)
    # Review behavior
    review_probability_boost: float = 0.0   # additive on base review weight
    min_score: int = 1
    max_score: int = 10
    harsh_critic: bool = False              # if True, scores tend lower
    generous: bool = False                  # if True, scores tend higher
    # Interaction tendencies
    likes_everything: bool = False
    selective_liker: bool = False
    watchlist_addict: bool = False
    # How often they change their mind (unfollow/refollow)
    fickle: bool = False

PERSONALITIES: list[Personality] = [
    Personality(
        name="cinephile",
        description="Lives and breathes movies. Watches everything, writes long reviews.",
        action_weights={"browse_discover": 0.25, "view_media": 0.22, "review": 0.18, "interact": 0.10},
        media_type_weights={"movie": 0.60, "show": 0.30, "game": 0.05, "music": 0.05},
        favorite_genres=["sci-fi", "drama", "thriller", "action", "comedy", "horror", "animation"],
        review_probability_boost=0.13,
        min_score=4, max_score=10, harsh_critic=True,
    ),
    Personality(
        name="music_nerd",
        description="Obsessed with discovering new music. Rates generously, listens constantly.",
        action_weights={"browse_discover": 0.25, "search": 0.20, "view_media": 0.15, "interact": 0.15},
        media_type_weights={"music": 0.75, "movie": 0.10, "show": 0.10, "game": 0.05},
        favorite_genres=["rock", "pop", "electronic", "hip-hop", "indie", "jazz", "metal", "folk"],
        review_probability_boost=0.05,
        min_score=6, max_score=10, generous=True,
        likes_everything=True,
    ),
    Personality(
        name="gamer",
        description="Gaming is life. Tracks every game played, mostly plays AAA titles.",
        action_weights={"browse_discover": 0.18, "view_media": 0.18, "interact": 0.20, "search": 0.15},
        media_type_weights={"game": 0.70, "movie": 0.15, "music": 0.10, "show": 0.05},
        favorite_genres=["action", "adventure", "rpg", "strategy", "shooter", "sci-fi", "fantasy", "horror"],
        review_probability_boost=0.03,
        min_score=3, max_score=10, harsh_critic=True,
    ),
    Personality(
        name="tv_binger",
        description="Consumes entire seasons in one sitting. Always watching multiple shows.",
        action_weights={"browse_discover": 0.22, "view_media": 0.22, "interact": 0.18, "search": 0.10},
        media_type_weights={"show": 0.65, "movie": 0.20, "music": 0.10, "game": 0.05},
        favorite_genres=["drama", "comedy", "sci-fi", "thriller", "animation", "documentary", "crime", "fantasy"],
        review_probability_boost=0.02,
        min_score=4, max_score=9, watchlist_addict=True,
    ),
    Personality(
        name="horror_fanatic",
        description="Horror is the only genre that matters. Everything else is boring.",
        action_weights={"browse_discover": 0.18, "search": 0.18, "view_media": 0.22, "review": 0.15},
        media_type_weights={"movie": 0.55, "show": 0.25, "game": 0.15, "music": 0.05},
        favorite_genres=["horror", "thriller", "sci-fi", "drama", "mystery", "action"],
        review_probability_boost=0.10,
        min_score=2, max_score=9, harsh_critic=True, selective_liker=True,
    ),
    Personality(
        name="casual_viewer",
        description="Watches whatever's popular. Doesn't overthink ratings, just enjoys stuff.",
        action_weights={"browse_discover": 0.30, "view_media": 0.20, "interact": 0.15, "browse_library": 0.10},
        media_type_weights={"movie": 0.35, "show": 0.35, "music": 0.20, "game": 0.10},
        favorite_genres=["comedy", "action", "drama", "pop", "rock", "adventure"],
        review_probability_boost=0.0,
        min_score=5, max_score=10, generous=True,
    ),
    Personality(
        name="indie_darling",
        description="Only watches obscure indie films and listens to underground artists. A bit pretentious.",
        action_weights={"search": 0.22, "view_media": 0.20, "review": 0.15, "view_person": 0.10},
        media_type_weights={"movie": 0.40, "music": 0.40, "show": 0.15, "game": 0.05},
        favorite_genres=["indie", "drama", "folk", "documentary", "animation", "electronic", "jazz", "classical"],
        review_probability_boost=0.10,
        min_score=3, max_score=9, harsh_critic=True, selective_liker=True,
    ),
    Personality(
        name="blockbuster_fan",
        description="Loves big-budget action, superheroes, and explosions. Rates popcorn flicks highly.",
        action_weights={"browse_discover": 0.25, "view_media": 0.20, "interact": 0.18, "follow_toggle": 0.08},
        media_type_weights={"movie": 0.50, "game": 0.30, "show": 0.15, "music": 0.05},
        favorite_genres=["action", "sci-fi", "adventure", "comedy", "rpg", "shooter", "fantasy"],
        review_probability_boost=0.0,
        min_score=5, max_score=10, generous=True, likes_everything=True,
    ),
    Personality(
        name="anime_enthusiast",
        description="Anime is superior to all other media. Watches seasonal anime and rates everything highly.",
        action_weights={"browse_discover": 0.20, "view_media": 0.22, "review": 0.12, "interact": 0.15},
        media_type_weights={"show": 0.60, "movie": 0.25, "game": 0.10, "music": 0.05},
        favorite_genres=["animation", "sci-fi", "fantasy", "action", "drama", "comedy"],
        review_probability_boost=0.08,
        min_score=5, max_score=10, generous=True,
    ),
    Personality(
        name="completist",
        description="Must watch/play/listen to everything by an artist or in a series. Obsessive tracker.",
        action_weights={"browse_library": 0.20, "view_media": 0.20, "search": 0.15, "interact": 0.15},
        media_type_weights={"movie": 0.30, "show": 0.25, "music": 0.25, "game": 0.20},
        favorite_genres=["drama", "sci-fi", "rock", "pop", "adventure", "rpg"],
        review_probability_boost=0.05,
        min_score=5, max_score=10, watchlist_addict=True,
    ),
    Personality(
        name="critic",
        description="Professional amateur critic. Writes detailed reviews, rarely gives high scores.",
        action_weights={"review": 0.22, "view_media": 0.22, "search": 0.15, "view_user": 0.10},
        media_type_weights={"movie": 0.45, "show": 0.35, "music": 0.15, "game": 0.05},
        favorite_genres=["drama", "thriller", "sci-fi", "documentary", "indie", "jazz", "classical"],
        review_probability_boost=0.17,
        min_score=1, max_score=8, harsh_critic=True, selective_liker=True,
    ),
    Personality(
        name="social_butterfly",
        description="Uses Otix mainly to follow friends, like their reviews, and build lists together.",
        action_weights={"follow_toggle": 0.15, "view_user": 0.20, "browse_discover": 0.15, "view_media": 0.15, "browse_library": 0.05},
        media_type_weights={"movie": 0.30, "show": 0.30, "music": 0.25, "game": 0.15},
        favorite_genres=["pop", "comedy", "action", "drama", "rock"],
        review_probability_boost=0.0,
        min_score=5, max_score=10, generous=True, fickle=True,
    ),
]

# ── Chronotypes ──────────────────────────────────────────
# Each bot gets a chronotype that determines when they're "awake."
# During off-hours the cooldown is multiplied by SLEEP_MULTIPLIER.

@dataclass
class Chronotype:
    name: str
    description: str
    active_hour_start: int   # 0-23, inclusive
    active_hour_end: int     # 0-23, inclusive
    sleep_multiplier: float  # cooldown multiplier during off-hours

CHRONOTYPES: list[Chronotype] = [
    Chronotype(name="night_owl", description="Active late night to early morning",
               active_hour_start=21, active_hour_end=4, sleep_multiplier=8.0),
    Chronotype(name="early_bird", description="Active early morning to afternoon",
               active_hour_start=5, active_hour_end=14, sleep_multiplier=6.0),
    Chronotype(name="evening", description="Active evening to late night",
               active_hour_start=17, active_hour_end=23, sleep_multiplier=5.0),
    Chronotype(name="afternoon", description="Active midday to evening",
               active_hour_start=11, active_hour_end=20, sleep_multiplier=7.0),
    Chronotype(name="always_on", description="No real pattern, active around the clock",
               active_hour_start=0, active_hour_end=23, sleep_multiplier=1.0),
]

# ── Activity tiers ────────────────────────────────────────

@dataclass
class ActivityTier:
    name: str
    description: str
    cooldown_multiplier: float  # applied to BOT_COOLDOWN_MIN/MAX
    session_steps_min: int
    session_steps_max: int
    weight: float  # probability of being assigned this tier

ACTIVITY_TIERS: list[ActivityTier] = [
    ActivityTier(name="power_user", description="Very active, short cooldowns, long sessions",
                 cooldown_multiplier=0.4, session_steps_min=3, session_steps_max=6, weight=0.15),
    ActivityTier(name="regular", description="Normal activity patterns",
                 cooldown_multiplier=1.0, session_steps_min=2, session_steps_max=4, weight=0.55),
    ActivityTier(name="casual", description="Infrequent, short sessions, long cooldowns",
                 cooldown_multiplier=3.0, session_steps_min=1, session_steps_max=3, weight=0.30),
]

# ── Session templates ─────────────────────────────────────
# A session is a coherent chain of related actions with a goal.
# During a session, action weights are temporarily biased toward the goal.

@dataclass
class SessionTemplate:
    name: str
    emoji: str
    label: str
    # Override action weights during this session (merged with personality + base)
    action_weights: dict[str, float]
    # Probability of picking this session type (personality-adjusted)
    base_weight: float

SESSION_TEMPLATES: list[SessionTemplate] = [
    SessionTemplate(name="discovery", emoji="🧭", label="exploring discover",
                    action_weights={"browse_discover": 0.35, "view_media": 0.30, "interact": 0.15, "review": 0.10},
                    base_weight=0.25),
    SessionTemplate(name="deep_dive", emoji="🔬", label="going down a rabbit hole",
                    action_weights={"search": 0.30, "view_media": 0.25, "review": 0.15, "view_person": 0.10, "interact": 0.10},
                    base_weight=0.20),
    SessionTemplate(name="social", emoji="👥", label="being social",
                    action_weights={"view_user": 0.30, "follow_toggle": 0.15, "view_list": 0.10, "browse_lists": 0.10, "view_media": 0.15},
                    base_weight=0.20),
    SessionTemplate(name="library_mgmt", emoji="📚", label="managing library",
                    action_weights={"browse_library": 0.35, "view_media": 0.25, "review": 0.15, "interact": 0.10},
                    base_weight=0.15),
    SessionTemplate(name="list_curation", emoji="📝", label="curating lists",
                    action_weights={"browse_lists": 0.20, "view_list": 0.20, "create_list": 0.15, "add_to_list": 0.15, "like_list": 0.10, "invite_collaborator": 0.10},
                    base_weight=0.10),
    SessionTemplate(name="admin_worship", emoji="👑", label="paying respects",
                    action_weights={"view_admin": 0.40, "rate_admin": 0.25, "like_admin_review": 0.20, "view_media": 0.10},
                    base_weight=0.10),
]

# ── Bio templates ────────────────────────────────────────

BIO_TEMPLATES: list[str] = [
    "{movie} fan, {music} listener, {game} player. He/him.",
    "Just here to track what I watch. {genre1} > {genre2}.",
    "{genre1} enthusiast. Don't @ me about {genre2}.",
    "Film student at the school of life. Currently obsessed with {genre1}.",
    "Music is my therapy. {genre1} and {genre2} are my love languages.",
    "I watch bad {genre1} movies so you don't have to.",
    "Gaming since the 90s. {genre1} is the best genre, fight me.",
    "Weekend binger. {genre1} | {genre2} | {music}",
    "Letterboxd refugee. Looking for my people in {genre1}.",
    "Professional couch potato. {genre1} connoisseur.",
    "Collecting masterpieces. {genre1} is my happy place.",
    "I rate things honestly. If your favorite {genre1} film is mid, I'll say it.",
    "Horror movie survivor. {genre1} and {genre2} are life.",
    "Soundtrack nerd. If the score isn't good, the movie isn't either.",
    "Indie game developer by day, {genre1} critic by night.",
    "My taste is impeccable and my reviews are correct. {genre1} supremacy.",
    "Just a girl/boy standing in front of a screen asking it to be good.",
    "I've seen more {genre1} movies than you've had hot dinners.",
    "Retro gamer. Modern {genre1} still hits though.",
    "Award season is my Super Bowl. {genre1} | {genre2} | All genres welcome.",
    "Vinyl collector. {genre1} on repeat. Also watch movies sometimes.",
    "I give honest ratings. {genre1} is goated.",
    "Streaming services fear me. I've watched everything in {genre1}.",
    "Dad/mom who still plays {game} after the kids go to bed.",
    "Pop culture archaeologist. Digging through {genre1} history.",
]

# ── Avatar & cover generators (DiceBear + picsum) ────────

def avatar_url(seed: str) -> str:
    """Generate a unique avatar for a bot using DiceBear."""
    style = _pick(["adventurer", "avataaars", "bottts", "croodles", "micah", "personas"])
    return f"https://api.dicebear.com/9.x/{style}/svg?seed={seed}"

def cover_url(seed: str) -> str:
    """Generate a cover/background image using picsum."""
    n = abs(hash(seed)) % 1000
    return f"https://picsum.photos/seed/{seed}/800/400"

# ── Country pool ─────────────────────────────────────────

COUNTRIES: list[str] = [
    "US", "US", "US", "US", "GB", "GB", "CA", "CA", "AU", "AU",
    "DE", "DE", "FR", "FR", "JP", "JP", "BR", "BR", "MX", "MX",
    "ES", "IT", "NL", "SE", "NO", "DK", "FI", "PT", "PL", "KR",
    "IN", "IE", "NZ", "AT", "BE", "CH", "CZ", "GR", "HU", "RO",
    "US", "US", "GB", "CA", "AU", "DE", "FR", "JP", "BR", "MX",
    "US", "GB", "CA", "AU", "IT", "ES", "NL", "SE", "KR", "IN",
]

# ── Language pools ───────────────────────────────────────

LANGUAGES: list[str] = [
    "en", "en", "en", "en", "en",
    "es", "fr", "de", "ja", "ko",
    "pt", "it", "nl", "sv", "da",
]

# ── Genre pools by media type ────────────────────────────

MOVIE_GENRES: list[str] = [
    "action", "adventure", "animation", "comedy", "crime", "documentary",
    "drama", "family", "fantasy", "history", "horror", "music",
    "mystery", "romance", "sci-fi", "thriller", "war", "western",
]

SHOW_GENRES: list[str] = [
    "action", "adventure", "animation", "comedy", "crime", "documentary",
    "drama", "family", "fantasy", "horror", "mystery", "reality",
    "sci-fi", "soap", "thriller", "war", "western",
]

GAME_GENRES: list[str] = [
    "action", "adventure", "rpg", "strategy", "simulation", "sports",
    "puzzle", "racing", "shooter", "fighting", "platformer", "horror",
    "indie", "mmo", "visual-novel",
]

MUSIC_GENRES: list[str] = [
    "rock", "pop", "hip-hop", "electronic", "jazz", "classical",
    "metal", "folk", "indie", "r-b", "country", "blues",
    "punk", "reggae", "soul", "funk", "latin", "ambient",
]

ALL_GENRES: dict[str, list[str]] = {
    "movie": MOVIE_GENRES,
    "show": SHOW_GENRES,
    "game": GAME_GENRES,
    "music": MUSIC_GENRES,
}

# ── Search queries ───────────────────────────────────────

SEARCH_QUERIES: list[str] = [
    "the matrix", "inception", "batman", "star wars", "lord of the rings",
    "breaking bad", "game of thrones", "stranger things", "the office",
    "taylor swift", "kendrick lamar", "beatles", "queen", "daft punk",
    "zelda", "portal", "half-life", "witcher", "cyberpunk", "elden ring",
    "interstellar", "dark knight", "pulp fiction", "fight club",
    "dune", "oppenheimer", "barbie", "the batman", "avatar",
    "succession", "severance", "the bear", "wednesday", "the last of us",
    "god of war", "baldurs gate", "starfield", "minecraft", "fortnite",
    "radiohead", "frank ocean", "sza", "bad bunny", "lady gaga",
    "parasite", "everything everywhere", "spider-verse", "joker", "whiplash",
    "dark souls", "red dead", "the sims", "stardew valley", "hades",
    "mitski", "boygenius", "clairo", "phoebe bridgers", "arctic monkeys",
    "mad max", "blade runner", "alien", "the thing", "the shining",
    "sopranos", "better call saul", "mad men", "the wire", "twin peaks",
    "mass effect", "disco elysium", "persona", "nier automata", "skyrim",
    "aphex twin", "burial", "flying lotus", "boards of canada", "j dilla",
    "studio ghibli", "satoshi kon", "makoto shinkai", "hideaki anno", "akira",
    "cowboy bebop", "evangelion", "attack on titan", "fullmetal alchemist", "one piece",
    "civilization", "factorio", "dwarf fortress", "slay the spire", "dead cells",
    "pink floyd", "king crimson", "yes", "genesis", "rush",
    "coen brothers", "paul thomas anderson", "wes anderson", "david fincher", "satoshi kon",
    "murakami", "studio trigger", "ghibli movies", "korean cinema", "french new wave",
    "synthwave", "vaporwave", "lo-fi", "post-rock", "shoegaze",
    "roguelike", "metroidvania", "soulslike", "crpg", "immersive sim",
]

# ── Interaction types ────────────────────────────────────

INTERACTION_TYPES = ["liked", "watchlisted", "watched", "played", "started", "listened"]

# ── List templates ───────────────────────────────────────

LIST_NAMES: list[str] = [
    "Top 10 All-Time Favorites",
    "Hidden Gems Nobody Talks About",
    "Stuff I Need to Watch",
    "Best of the Year",
    "Rainy Day Collection",
    "Guilty Pleasures",
    "My Comfort Zone",
    "Essential Viewing",
    "Mind-Bending Masterpieces",
    "Underrated Classics",
    "What to Watch Next",
    "Weekend Marathon Material",
    "Late Night Picks",
    "Cozy Winter List",
    "Summer Blockbusters",
    "Cult Classics Collection",
    "Award Winners & Nominees",
    "International Treasures",
    "Soundtrack Goals",
    "Visually Stunning",
    "Feel-Good Favorites",
    "Dark & Twisted",
    "Family Game Night",
    "Solo Queue Essentials",
    "Current Rotation",
]

LIST_DESCRIPTIONS: list[str] = [
    "A carefully curated selection of absolute must-sees.",
    "These deserve way more attention than they get.",
    "Building up the queue. Suggestions welcome!",
    "Ranked and ready. Fight me on the order.",
    "For those days when you just want to stay in.",
    "No judgment please — we all have our weaknesses.",
    "Pure comfort. These never get old.",
    "If you haven't seen these, what are you even doing?",
    "Brain required. These will make you think.",
    "Overlooked and underappreciated. Criminal, really.",
    "My personal roadmap through the content jungle.",
    "Clearing the schedule. This is happening.",
    "When the sun goes down and the vibes kick in.",
    "Hot chocolate and blankets energy.",
    "Big explosions. Bigger fun. Zero regrets.",
    "The weird, the wild, and the wonderful.",
    "Trophies earned. These are the best of the best.",
    "Passport not required but recommended.",
    "The music alone makes these worth it.",
    "Eye candy. Every frame is a painting.",
    "Instant mood boost guaranteed.",
    "Embrace the void. These go to some dark places.",
    "Grab some controllers and snacks.",
    "Just me, my thoughts, and these games.",
    "Heavy rotation. What I'm into right now.",
]

# ── Review templates ─────────────────────────────────────

REVIEW_TEMPLATES: list[tuple[int, str]] = [
    (8, "Really enjoyed this one. Solid from start to finish."),
    (9, "Masterpiece. Everyone should experience this."),
    (7, "Good, not great. Worth your time though."),
    (6, "Decent. A few flaws but overall enjoyable."),
    (5, "Middle of the road. Didn't leave much of an impression."),
    (10, "Absolutely phenomenal. Changed my perspective."),
    (4, "Had potential but didn't quite deliver."),
    (8, "Great performances and solid direction."),
    (7, "Fun while it lasted. Would recommend casually."),
    (9, "One of my favorites. Gets better every time."),
    (3, "Disappointing. Expected much more given the hype."),
    (8, "Beautiful cinematography and a haunting score."),
    (6, "Perfectly watchable but instantly forgettable."),
    (7, "Strong first half, loses steam toward the end."),
    (5, "I can see why people like it, just not for me."),
    (9, "Incredible worldbuilding and attention to detail."),
    (10, "Life-changing. I think about this constantly."),
    (4, "Style over substance. Looks great, says nothing."),
    (8, "Went in with low expectations, came out blown away."),
    (6, "A mixed bag. Some brilliant moments, some real stinkers."),
    (7, "Does exactly what it says on the tin. No complaints."),
    (9, "The kind of art that reminds me why I love {genre1}."),
    (5, "Competently made but emotionally hollow."),
    (8, "Took me by surprise. Don't sleep on this one."),
    (3, "Genuinely don't understand the praise. Boring and predictable."),
    (10, "Perfect. No notes. Peak {genre1}."),
    (7, "Enjoyed it more than I thought I would. Solid entertainment."),
    (6, "Good background watch while you're doing something else."),
    (9, "Rewatched this and it holds up incredibly well."),
    (4, "Started strong but completely lost me by the end."),
]

# ── Admin worship templates ─────────────────────────────

ADMIN_REVIEWS: list[tuple[int, str]] = [
    (10, "The king. Absolute legend. Best taste on this platform."),
    (10, "Our fearless leader. Every rating is correct."),
    (10, "GOAT. Nobody curates a collection like this."),
    (10, "The reason I joined Otix. King shit only."),
    (9, "Impeccable taste as always. All hail."),
    (10, "King. Legend. The final word on what's good."),
    (10, "Best profile on the site. Not even close."),
    (9, "The king's taste is law. Another flawless take."),
    (10, "Bow down. The king has spoken."),
    (10, "No misses. Ever. True royalty."),
]

# ── Default (base) action weights ────────────────────────

BASE_ACTION_WEIGHTS: dict[str, float] = {
    "browse_discover": 0.19,
    "search": 0.11,
    "view_media": 0.17,
    "interact": 0.12,
    "review": 0.05,
    "view_user": 0.08,
    "follow_toggle": 0.04,
    "view_person": 0.04,
    "browse_library": 0.05,
    "browse_lists": 0.04,
    "view_list": 0.03,
    "create_list": 0.02,
    "add_to_list": 0.03,
    "like_list": 0.02,
    "invite_collaborator": 0.01,
}

MEDIA_TYPES = ["movie", "show", "game", "music"]

# ── Admin / king ─────────────────────────────────────────

BOT_ADMIN_USERNAME = os.getenv("BOT_ADMIN_USERNAME", "admin")

# ── Error logging ────────────────────────────────────────

BOT_LOG_DIR = os.getenv("BOT_LOG_DIR", "/app/logs")
BOT_LOG_LEVEL = os.getenv("BOT_LOG_LEVEL", "INFO")

# ── Helpers ──────────────────────────────────────────────

def _pick(items: list[str]) -> str:
    import random
    return random.choice(items)
