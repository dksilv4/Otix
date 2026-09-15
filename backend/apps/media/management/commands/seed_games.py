"""Management command to seed realistic game catalog data for Discover rails.

Seeds:
- New Releases (released within last 90 days)
- Now Playing Games (released within last 365 days, high rating_count)
- Top Rated Games (avg_rating 90-98, rating_count >= 100)
- Upcoming Games (future release date in 2026/2027)
- Platform-specific hits (PC/Windows, PS5, Xbox Series, Nintendo Switch)
- Full artwork (poster, backdrop, logo) so the Discover Hero carousel and rails populate.
"""

from datetime import date, timedelta
from django.core.management.base import BaseCommand

from apps.media.models import (
    MediaItem,
    Game,
    MediaAsset,
    Platform,
    MediaPlatform,
    Genre,
    MediaGenre,
)


def _steam_assets(appid: int) -> list[dict]:
    return [
        {
            "asset_type": "poster",
            "url": f"https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/{appid}/library_600x900.jpg",
            "score": 100,
        },
        {
            "asset_type": "backdrop",
            "url": f"https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/{appid}/library_hero.jpg",
            "score": 100,
        },
        {
            "asset_type": "logo",
            "url": f"https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/{appid}/logo.png",
            "score": 90,
        },
    ]


def _custom_assets(poster: str, backdrop: str, logo: str = "") -> list[dict]:
    assets = [
        {"asset_type": "poster", "url": poster, "score": 100},
        {"asset_type": "backdrop", "url": backdrop, "score": 100},
    ]
    if logo:
        assets.append({"asset_type": "logo", "url": logo, "score": 90})
    return assets


class Command(BaseCommand):
    help = "Seed game catalog data to populate all Discover rails and test download workflows."

    def add_arguments(self, parser):
        parser.add_argument(
            "--clear",
            action="store_true",
            help="Clear all existing game catalog items before seeding.",
        )

    def handle(self, *args, **options):
        today = date.today()
        self.stdout.write(f"Seeding game catalog relative to today: {today}...")

        if options["clear"]:
            count = MediaItem.objects.filter(media_type="game").count()
            MediaItem.objects.filter(media_type="game").delete()
            self.stdout.write(self.style.WARNING(f"Deleted {count} existing game items."))

        # 1. Ensure Platforms exist
        platforms_data = [
            {"name": "PC (Windows)", "slug": "windows"},
            {"name": "PlayStation 5", "slug": "playstation-5"},
            {"name": "Xbox Series X|S", "slug": "xbox-series-x-s"},
            {"name": "Nintendo Switch", "slug": "nintendo-switch"},
        ]
        platform_objs = {}
        for p in platforms_data:
            obj, _ = Platform.objects.get_or_create(slug=p["slug"], defaults={"name": p["name"]})
            platform_objs[p["slug"]] = obj

        # 2. Ensure Genres exist
        genres_data = [
            {"name": "Action", "slug": "action"},
            {"name": "Role-playing (RPG)", "slug": "role-playing-rpg"},
            {"name": "Adventure", "slug": "adventure"},
            {"name": "Shooter", "slug": "shooter"},
            {"name": "Strategy", "slug": "strategy"},
            {"name": "Open World", "slug": "open-world"},
            {"name": "Sci-Fi", "slug": "sci-fi"},
            {"name": "Fantasy", "slug": "fantasy"},
        ]
        genre_objs = {}
        for g in genres_data:
            obj, _ = Genre.objects.get_or_create(slug=g["slug"], defaults={"name": g["name"]})
            genre_objs[g["slug"]] = obj

        # 3. Catalog of games
        games_data = [
            # ── NEW RELEASES (past 90 days: between today-80d and today-5d) ──
            {
                "title": "Kingdom Come: Deliverance II",
                "slug": "kingdom-come-deliverance-ii",
                "overview": "Kingdom Come: Deliverance II is a thrilling action RPG, set amid the chaos of a civil war in 15th Century Bohemia. You are Henry of Skalitz – an ordinary man doing extraordinary things.",
                "release_date": today - timedelta(days=20),
                "popularity": 96.5,
                "avg_rating": 91.0,
                "rating_count": 340,
                "platforms": ["windows", "playstation-5", "xbox-series-x-s"],
                "genres": ["action", "role-playing-rpg", "adventure", "open-world"],
                "assets": _steam_assets(1771300),
            },
            {
                "title": "Monster Hunter Wilds",
                "slug": "monster-hunter-wilds",
                "overview": "The unbridled force of nature runs wild and relentless, with environments dynamically transforming from one moment to the next. Hunt colossal monsters in living, breathing ecosystems.",
                "release_date": today - timedelta(days=35),
                "popularity": 98.0,
                "avg_rating": 89.5,
                "rating_count": 520,
                "platforms": ["windows", "playstation-5", "xbox-series-x-s"],
                "genres": ["action", "role-playing-rpg", "fantasy"],
                "assets": _steam_assets(2246340),
            },
            {
                "title": "Sid Meier's Civilization VII",
                "slug": "sid-meiers-civilization-vii",
                "overview": "Rule as one of many legendary leaders throughout history. Establish your civilization, construct cities, and expand your territory in the revolutionary next chapter of 4X strategy.",
                "release_date": today - timedelta(days=15),
                "popularity": 94.0,
                "avg_rating": 88.0,
                "rating_count": 280,
                "platforms": ["windows", "playstation-5", "xbox-series-x-s", "nintendo-switch"],
                "genres": ["strategy"],
                "assets": _steam_assets(2478940),
            },
            {
                "title": "Avowed",
                "slug": "avowed",
                "overview": "Set in the fictional world of Eora, you are an envoy from the Aedyr Empire sent to investigate a mysterious plague spreading throughout the Living Lands.",
                "release_date": today - timedelta(days=45),
                "popularity": 89.0,
                "avg_rating": 86.0,
                "rating_count": 210,
                "platforms": ["windows", "xbox-series-x-s"],
                "genres": ["action", "role-playing-rpg", "fantasy"],
                "assets": _steam_assets(2457220),
            },
            {
                "title": "Doom: The Dark Ages",
                "slug": "doom-the-dark-ages",
                "overview": "DOOM: The Dark Ages is the prequel to the critically acclaimed DOOM (2016) and DOOM Eternal and the third installment of the modern DOOM series. Witness the origin of the Doom Slayer's rage.",
                "release_date": today - timedelta(days=25),
                "popularity": 97.2,
                "avg_rating": 93.0,
                "rating_count": 450,
                "platforms": ["windows", "playstation-5", "xbox-series-x-s"],
                "genres": ["action", "shooter", "sci-fi"],
                "assets": _steam_assets(782330),
            },

            # ── NOW PLAYING GAMES (past 365 days, high rating_count) ──
            {
                "title": "Black Myth: Wukong",
                "slug": "black-myth-wukong",
                "overview": "Black Myth: Wukong is an action RPG rooted in Chinese mythology. You shall set out as the Destined One to venture into the challenges and marvels ahead, to uncover the obscured truth beneath the veil of a glorious legend.",
                "release_date": today - timedelta(days=120),
                "popularity": 99.5,
                "avg_rating": 90.0,
                "rating_count": 1850,
                "platforms": ["windows", "playstation-5"],
                "genres": ["action", "role-playing-rpg", "fantasy"],
                "assets": _steam_assets(2358720),
            },
            {
                "title": "Warhammer 40,000: Space Marine 2",
                "slug": "warhammer-40000-space-marine-2",
                "overview": "Embody the superhuman skill and brutality of a Space Marine. Unleash deadly abilities and an arsenal of devastating weaponry to obliterate the relentless Tyranid swarms.",
                "release_date": today - timedelta(days=140),
                "popularity": 95.0,
                "avg_rating": 89.0,
                "rating_count": 1240,
                "platforms": ["windows", "playstation-5", "xbox-series-x-s"],
                "genres": ["action", "shooter", "sci-fi"],
                "assets": _steam_assets(2183900),
            },
            {
                "title": "Helldivers 2",
                "slug": "helldivers-2",
                "overview": "The Galaxy’s Last Line of Offence. Enlist in the Helldivers and join the fight for freedom across a hostile galaxy in a fast, frantic, and ferocious third-person shooter.",
                "release_date": today - timedelta(days=210),
                "popularity": 93.0,
                "avg_rating": 88.0,
                "rating_count": 1620,
                "platforms": ["windows", "playstation-5"],
                "genres": ["action", "shooter", "sci-fi"],
                "assets": _steam_assets(553850),
            },
            {
                "title": "Silent Hill 2",
                "slug": "silent-hill-2",
                "overview": "Having received a letter from his deceased wife, James heads to where they shared so many memories, in the hope of seeing her once more: Silent Hill.",
                "release_date": today - timedelta(days=160),
                "popularity": 92.5,
                "avg_rating": 91.0,
                "rating_count": 890,
                "platforms": ["windows", "playstation-5"],
                "genres": ["action", "adventure"],
                "assets": _steam_assets(2124490),
            },
            {
                "title": "Metaphor: ReFantazio",
                "slug": "metaphor-refantazio",
                "overview": "From the creative minds of Persona 3, 4, and 5 comes Metaphor: ReFantazio, a unique fantasy world, where your protagonist will journey alongside his fairy companion, Gallica, to lift the curse from the kingdom’s lost prince.",
                "release_date": today - timedelta(days=150),
                "popularity": 94.2,
                "avg_rating": 93.0,
                "rating_count": 940,
                "platforms": ["windows", "playstation-5", "xbox-series-x-s"],
                "genres": ["role-playing-rpg", "fantasy", "adventure"],
                "assets": _steam_assets(2620600),
            },

            # ── TOP RATED TITLES (PC, Consoles, All-Time Masterpieces) ──
            {
                "title": "Baldur's Gate 3",
                "slug": "baldurs-gate-3",
                "overview": "Gather your party and return to the Forgotten Realms in a tale of fellowship and betrayal, sacrifice and survival, and the lure of absolute power. Mysterious abilities are awakening inside you.",
                "release_date": date(2023, 8, 3),
                "popularity": 99.0,
                "avg_rating": 96.0,
                "rating_count": 2500,
                "platforms": ["windows", "playstation-5", "xbox-series-x-s"],
                "genres": ["role-playing-rpg", "strategy", "adventure", "fantasy"],
                "assets": _steam_assets(1086940),
            },
            {
                "title": "Elden Ring",
                "slug": "elden-ring",
                "overview": "Rise, Tarnished, and be guided by grace to brandish the power of the Elden Ring and become an Elden Lord in the Lands Between. An epic dark fantasy action RPG created by Hidetaka Miyazaki and George R. R. Martin.",
                "release_date": date(2022, 2, 25),
                "popularity": 98.5,
                "avg_rating": 96.0,
                "rating_count": 2800,
                "platforms": ["windows", "playstation-5", "xbox-series-x-s"],
                "genres": ["action", "role-playing-rpg", "open-world", "fantasy"],
                "assets": _steam_assets(1245620),
            },
            {
                "title": "Cyberpunk 2077",
                "slug": "cyberpunk-2077",
                "overview": "Cyberpunk 2077 is an open-world, action-adventure RPG set in the megalopolis of Night City, where you play as a cyberpunk mercenary wrapped up in a do-or-die fight for survival.",
                "release_date": date(2020, 12, 10),
                "popularity": 97.0,
                "avg_rating": 92.0,
                "rating_count": 2100,
                "platforms": ["windows", "playstation-5", "xbox-series-x-s"],
                "genres": ["action", "role-playing-rpg", "open-world", "sci-fi"],
                "assets": _steam_assets(1091500),
            },
            {
                "title": "The Witcher 3: Wild Hunt",
                "slug": "the-witcher-3-wild-hunt",
                "overview": "You are Geralt of Rivia, mercenary monster slayer. Before you stands a war-torn, monster-infested continent you can explore at will. Your current contract? Tracking down Ciri — the Child of Prophecy.",
                "release_date": date(2015, 5, 18),
                "popularity": 96.0,
                "avg_rating": 95.0,
                "rating_count": 2600,
                "platforms": ["windows", "playstation-5", "xbox-series-x-s", "nintendo-switch"],
                "genres": ["action", "role-playing-rpg", "open-world", "fantasy"],
                "assets": _steam_assets(292030),
            },
            {
                "title": "Red Dead Redemption 2",
                "slug": "red-dead-redemption-2",
                "overview": "America, 1899. Arthur Morgan and the Van der Linde gang are outlaws on the run. With federal agents and the best bounty hunters in the nation massing on their heels, the gang must rob, steal and fight their way across the rugged heartland.",
                "release_date": date(2018, 10, 26),
                "popularity": 98.0,
                "avg_rating": 97.0,
                "rating_count": 2400,
                "platforms": ["windows", "playstation-5", "xbox-series-x-s"],
                "genres": ["action", "adventure", "open-world"],
                "assets": _steam_assets(1174180),
            },
            {
                "title": "Grand Theft Auto V",
                "slug": "grand-theft-auto-v",
                "overview": "When a young street hustler, a retired bank robber and a terrifying psychopath find themselves entangled with some of the most frightening and deranged elements of the criminal underworld, they must pull off a series of dangerous heists.",
                "release_date": date(2013, 9, 17),
                "popularity": 99.0,
                "avg_rating": 97.0,
                "rating_count": 3100,
                "platforms": ["windows", "playstation-5", "xbox-series-x-s"],
                "genres": ["action", "adventure", "open-world"],
                "assets": _steam_assets(271590),
            },
            {
                "title": "God of War Ragnarök",
                "slug": "god-of-war-ragnarok",
                "overview": "Kratos and Atreus embark on a mythic journey for answers before Ragnarök arrives. Together, father and son must put everything on the line as they journey to each of the Nine Realms.",
                "release_date": date(2022, 11, 9),
                "popularity": 95.5,
                "avg_rating": 94.0,
                "rating_count": 1400,
                "platforms": ["windows", "playstation-5"],
                "genres": ["action", "adventure", "fantasy"],
                "assets": _steam_assets(2322010),
            },
            {
                "title": "Forza Horizon 5",
                "slug": "forza-horizon-5",
                "overview": "Your Ultimate Horizon Adventure awaits! Explore the vibrant and ever-evolving open world landscapes of Mexico with limitless, fun driving action in hundreds of the world’s greatest cars.",
                "release_date": date(2021, 11, 9),
                "popularity": 93.0,
                "avg_rating": 92.0,
                "rating_count": 1100,
                "platforms": ["windows", "xbox-series-x-s"],
                "genres": ["action", "open-world"],
                "assets": _steam_assets(1551360),
            },
            {
                "title": "The Legend of Zelda: Tears of the Kingdom",
                "slug": "the-legend-of-zelda-tears-of-the-kingdom",
                "overview": "An epic adventure across the land and skies of Hyrule awaits in The Legend of Zelda: Tears of the Kingdom for Nintendo Switch. Decide your own path through the sprawling landscapes of Hyrule and the mysterious islands floating in the vast skies above.",
                "release_date": date(2023, 5, 12),
                "popularity": 97.5,
                "avg_rating": 96.0,
                "rating_count": 1900,
                "platforms": ["nintendo-switch"],
                "genres": ["action", "adventure", "open-world", "fantasy"],
                "assets": _custom_assets(
                    poster="https://images.igdb.com/igdb/image/upload/t_cover_big/co5vmg.jpg",
                    backdrop="https://images.igdb.com/igdb/image/upload/t_1080p/scd2t7.jpg",
                ),
            },
            {
                "title": "Super Mario Odyssey",
                "slug": "super-mario-odyssey",
                "overview": "Join Mario on a massive, globe-trotting 3D adventure and use his incredible new abilities to collect Moons so you can power up your airship, the Odyssey, and rescue Princess Peach from Bowser’s wedding plans!",
                "release_date": date(2017, 10, 27),
                "popularity": 95.0,
                "avg_rating": 97.0,
                "rating_count": 1750,
                "platforms": ["nintendo-switch"],
                "genres": ["action", "adventure", "fantasy"],
                "assets": _custom_assets(
                    poster="https://images.igdb.com/igdb/image/upload/t_cover_big/co1m5a.jpg",
                    backdrop="https://images.igdb.com/igdb/image/upload/t_1080p/sc70v5.jpg",
                ),
            },
            {
                "title": "Metroid Prime Remastered",
                "slug": "metroid-prime-remastered",
                "overview": "Intergalactic bounty hunter Samus Aran receives a distress signal from a derelict frigate in orbit around planet Tallon IV. Upon investigating, the frigate reveals itself to be a Space Pirate research vessel.",
                "release_date": date(2023, 2, 8),
                "popularity": 91.0,
                "avg_rating": 94.0,
                "rating_count": 820,
                "platforms": ["nintendo-switch"],
                "genres": ["action", "adventure", "sci-fi"],
                "assets": _custom_assets(
                    poster="https://images.igdb.com/igdb/image/upload/t_cover_big/co64z0.jpg",
                    backdrop="https://images.igdb.com/igdb/image/upload/t_1080p/scj13q.jpg",
                ),
            },

            # ── UPCOMING GAMES (strictly future release date) ──
            {
                "title": "Grand Theft Auto VI",
                "slug": "grand-theft-auto-vi",
                "overview": "Grand Theft Auto VI heads to the state of Leonida, home to the neon-soaked streets of Vice City and beyond in the biggest, most immersive evolution of the Grand Theft Auto series yet.",
                "release_date": today + timedelta(days=190),
                "popularity": 100.0,
                "avg_rating": 98.0,
                "rating_count": 4200,
                "platforms": ["playstation-5", "xbox-series-x-s"],
                "genres": ["action", "adventure", "open-world"],
                "assets": _custom_assets(
                    poster="https://images.igdb.com/igdb/image/upload/t_cover_big/co7uwt.jpg",
                    backdrop="https://images.igdb.com/igdb/image/upload/t_1080p/scq11p.jpg",
                ),
            },
            {
                "title": "Death Stranding 2: On the Beach",
                "slug": "death-stranding-2-on-the-beach",
                "overview": "Embark on an inspiring mission of human connection beyond the UCA. Sam—with companions by his side—sets out on a new journey to save humanity from extinction. Join them as they traverse a world beset by otherworldly enemies.",
                "release_date": today + timedelta(days=120),
                "popularity": 95.0,
                "avg_rating": 92.0,
                "rating_count": 750,
                "platforms": ["playstation-5"],
                "genres": ["action", "adventure", "sci-fi"],
                "assets": _custom_assets(
                    poster="https://images.igdb.com/igdb/image/upload/t_cover_big/co8e25.jpg",
                    backdrop="https://images.igdb.com/igdb/image/upload/t_1080p/scsmq1.jpg",
                ),
            },
            {
                "title": "The Witcher 4: Polaris",
                "slug": "the-witcher-4-polaris",
                "overview": "Project Polaris begins a new saga in the Witcher universe, built from the ground up on Unreal Engine 5. A story-driven open-world RPG exploring uncharted territories of the Continent.",
                "release_date": today + timedelta(days=365),
                "popularity": 97.0,
                "avg_rating": 94.0,
                "rating_count": 1100,
                "platforms": ["windows", "playstation-5", "xbox-series-x-s"],
                "genres": ["action", "role-playing-rpg", "open-world", "fantasy"],
                "assets": _steam_assets(292030),
            },
        ]

        # 4. Insert or update items
        created_count = 0
        updated_count = 0

        for item_data in games_data:
            slug = item_data["slug"]
            media, created = MediaItem.objects.update_or_create(
                slug=slug,
                defaults={
                    "media_type": "game",
                    "title": item_data["title"],
                    "overview": item_data["overview"],
                    "release_date": item_data["release_date"],
                    "popularity": item_data["popularity"],
                    "avg_rating": item_data["avg_rating"],
                    "rating_count": item_data["rating_count"],
                    "overall_rating": item_data["avg_rating"],
                    "overall_rating_source": "IGDB",
                    "view_count": item_data["rating_count"] * 3,
                    "completeness_score": 0.9,
                    "is_adult": False,
                },
            )

            if created:
                created_count += 1
            else:
                updated_count += 1

            # Game subtype
            is_upcoming = item_data["release_date"] > today
            Game.objects.update_or_create(
                media_item=media,
                defaults={
                    "game_type": "main_game",
                    "release_status": "upcoming" if is_upcoming else "released",
                    "is_free": False,
                    "has_multiplayer": "shooter" in item_data["genres"] or "strategy" in item_data["genres"],
                },
            )

            # Platforms
            for pslug in item_data.get("platforms", []):
                p_obj = platform_objs.get(pslug)
                if p_obj:
                    MediaPlatform.objects.get_or_create(media_item=media, platform=p_obj)

            # Genres
            for gslug in item_data.get("genres", []):
                g_obj = genre_objs.get(gslug)
                if g_obj:
                    MediaGenre.objects.get_or_create(media_item=media, genre=g_obj)

            # Assets
            for asset in item_data.get("assets", []):
                MediaAsset.objects.update_or_create(
                    media_item=media,
                    asset_type=asset["asset_type"],
                    url=asset["url"],
                    defaults={
                        "score": asset.get("score", 100),
                        "selected_context": "general",
                    },
                )

        # Also repair any existing game row (e.g. ID 1 'Cyberpunk 2077 V2 0')
        pk1 = MediaItem.objects.filter(pk=1).first()
        if pk1 and not hasattr(pk1, "game"):
            Game.objects.create(media_item=pk1, game_type="main_game", release_status="released")
            cyber_assets = _steam_assets(1091500)
            for a in cyber_assets:
                MediaAsset.objects.get_or_create(
                    media_item=pk1,
                    asset_type=a["asset_type"],
                    url=a["url"],
                    defaults={"score": a["score"], "selected_context": "general"},
                )
            for pslug in ["windows", "playstation-5", "xbox-series-x-s"]:
                MediaPlatform.objects.get_or_create(media_item=pk1, platform=platform_objs[pslug])

        self.stdout.write(
            self.style.SUCCESS(
                f"Successfully seeded catalog: {created_count} created, {updated_count} updated. "
                f"Total games in DB: {MediaItem.objects.filter(media_type='game').count()}."
            )
        )
